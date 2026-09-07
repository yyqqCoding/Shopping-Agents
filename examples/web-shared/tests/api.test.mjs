import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { AgentApi } from "../api.ts";
import { historyItems } from "../turn.ts";
import { AUTH_URL, CONVERSATION, USER, browser, configOr, json, storedCredential } from "./browser-env.mjs";

beforeEach(browser);

async function initialized(handler = () => { throw new Error("Unexpected private request"); }) {
  storedCredential();
  globalThis.fetch = mock.fn((url, init) => configOr(url, handler, init));
  const api = new AgentApi("", "/api");
  await api.initialize();
  return api;
}

test("repeated initialization creates one first conversation and restores existing selection", async () => {
  let created = 0;
  const api = await initialized((url, init) => {
    if (url === "/api/conversations?offset=0&limit=30") return json({ conversations: [] });
    if (url === "/api/conversations") {
      created++;
      assert.equal(init.headers.Authorization, "Bearer visitor-access");
      assert.ok(JSON.parse(init.body).request_id);
      return json({ conversation: { id: CONVERSATION } });
    }
    assert.ok(url.startsWith(`/api/conversations/${CONVERSATION}/turns`));
    return json({ turns: [], has_more: false });
  });
  assert.deepEqual(await Promise.all([api.restoreConversation(), api.restoreConversation()]), [CONVERSATION, CONVERSATION]);
  const otherTab = new AgentApi("", "/api");
  assert.equal(await otherTab.restoreConversation(), CONVERSATION);
  assert.equal(created, 1);
  assert.equal(localStorage.getItem(`acme.conversation:${USER}`), CONVERSATION);
});

test("history outage does not create a new conversation or clear the saved choice", async () => {
  const api = await initialized(() => json({ detail: "服务暂时不可用" }, 503));
  api.selectConversation(CONVERSATION);
  await assert.rejects(api.restoreConversation(), /服务暂时不可用/);
  assert.equal(api.session, CONVERSATION);
  assert.ok(fetch.mock.calls.every(({ arguments: [, init] }) => init?.method !== "POST"));
});

test("an uncertain create retry keeps the same request id", async () => {
  const bodies = [];
  const api = await initialized((url, init) => {
    assert.equal(url, "/api/conversations");
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) throw new Error("Response lost");
    return json({ conversation: { id: CONVERSATION } });
  });
  await assert.rejects(api.createConversation());
  await api.createConversation();
  assert.deepEqual(bodies[0], bodies[1]);
});

test("public catalog reads do not refresh credentials and private requests keep their selected conversation", async () => {
  const requests = [];
  const api = await initialized((url, init) => { requests.push({ url, init }); return json({ items: [] }); });
  api.selectConversation(CONVERSATION);
  const pending = api.requestOrThrow("/cart");
  api.selectConversation("next-conversation");
  await pending;
  await api.requestOrThrow("/products");
  assert.equal(requests[0].init.headers["X-Session-Id"], CONVERSATION);
  assert.equal(requests[0].init.headers.Authorization, "Bearer visitor-access");
  assert.equal(requests[1].init.headers.Authorization, undefined);
  assert.equal(requests[1].init.headers["X-Session-Id"], undefined);
});

test("pending chat survives reload and reuses its original UUID until reconciled", async () => {
  const api = await initialized();
  api.selectConversation(CONVERSATION);
  const first = api.prepareChat(CONVERSATION, "推荐帐篷");
  api.notePendingError(CONVERSATION, first.requestId, "连接暂时中断");
  assert.throws(() => api.prepareChat(CONVERSATION, "另一条消息"), /上一条消息/);
  const reloaded = new AgentApi("", "/api");
  await reloaded.initialize();
  assert.equal(reloaded.prepareChat(CONVERSATION, "推荐帐篷").requestId, first.requestId);
  assert.equal(reloaded.pendingChat(CONVERSATION).failure, "连接暂时中断");
  reloaded.clearPendingChat(CONVERSATION, "wrong-id");
  assert.ok(reloaded.pendingChat(CONVERSATION));
  reloaded.clearPendingChat(CONVERSATION, first.requestId);
  assert.equal(reloaded.pendingChat(CONVERSATION), null);
  assert.notEqual(reloaded.prepareChat(CONVERSATION, "推荐帐篷").requestId, first.requestId);
});

function sse(text, onCancel) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 2) controller.enqueue(bytes.slice(i, i + 2));
      if (!onCancel) controller.close();
    },
    cancel() { onCancel?.(); },
  }), { headers: { "Content-Type": "text/event-stream" } });
}

test("SSE handles fragmented Chinese text and malformed frames without losing the final card", async () => {
  const api = await initialized((url, init) => {
    assert.equal(url, "/api/chat");
    assert.deepEqual(JSON.parse(init.body), { message: "你好", request_id: "request-one" });
    return sse(': keep-alive\n\nevent: text_delta\ndata: {"text":"你好"}\n\nevent: ui\ndata: bad-json\n\nevent: ui\ndata: {"component":"products","payload":{"items":[]}}\n\nevent: turn_complete\ndata: {}\n\n');
  });
  const events = [];
  for await (const event of api.chatStream("你好", "request-one", CONVERSATION, new AbortController().signal)) events.push(event);
  assert.deepEqual(events.map((e) => e.type), ["text_delta", "ui", "turn_complete"]);
  assert.equal(events[0].data.text, "你好");
});

test("an incomplete SSE response is not reported as complete", async () => {
  const api = await initialized(() => sse('event: text_delta\ndata: {"text":"只收到开头"}\n\n'));
  await assert.rejects(async () => {
    for await (const _ of api.chatStream("你好", "request-one", CONVERSATION, new AbortController().signal)) { /* consume */ }
  }, /连接中断/);
});

test("leaving a stream cancels its reader", async () => {
  let cancelled = false;
  const api = await initialized(() => sse('event: text_delta\ndata: {"text":"开头"}\n\n', () => { cancelled = true; }));
  const stream = api.chatStream("你好", "request-one", CONVERSATION, new AbortController().signal);
  await stream.next();
  await stream.return();
  assert.equal(cancelled, true);
});

test("history hydrates final text, separate cards and suggestions without replaying actions", () => {
  const turns = [{ id: "turn", request_id: "request", sequence: 2, message: "看看这些", status: "complete", display: [
    { type: "text", text: "比较结果" },
    { type: "ui", block: { component: "products", payload: { items: [1] } } },
    { type: "ui", block: { component: "products", payload: { items: [2] } } },
    { type: "suggestions", suggestions: ["继续比较"] },
  ] }];
  const original = structuredClone(turns);
  const [user, assistant] = historyItems(turns);
  assert.equal(user.text, "看看这些");
  assert.equal(assistant.pending, false);
  assert.deepEqual(assistant.tools, []);
  assert.deepEqual(assistant.suggestions, ["继续比较"]);
  assert.equal(new Set(assistant.segments.filter((s) => s.type === "ui").map((s) => s.slotKey)).size, 2);
  assert.ok(assistant.segments.filter((s) => s.type === "ui").every((s) => s.status === "final"));
  assert.deepEqual(turns, original);
  assert.equal(fetch.mock.callCount(), 0);
});
