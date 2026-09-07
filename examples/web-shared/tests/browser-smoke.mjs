// Real-browser smoke against the built web app, with local identity/API fixtures.
// Start Next first, then: node browser-smoke.mjs --web-url http://127.0.0.1:18004 --chrome /path/to/chrome
// This never connects to Supabase or a model. Each run owns a temporary browser profile.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const webURL = args.get("--web-url") ?? "http://127.0.0.1:18004";
const chrome = args.get("--chrome") ?? process.env.SHOPPING_BROWSER_EXECUTABLE;
assert.ok(chrome, "Provide --chrome or SHOPPING_BROWSER_EXECUTABLE");
const catalog = JSON.parse(await readFile(new URL("../../assistant/data/catalog.json", import.meta.url), "utf8"));
const product = catalog.products.find((item) => item.product_id === "AR-1001");
const visitors = new Map();
const conversations = new Map();
const requests = [];
let failNextChat = false;
let site;

const cartOf = (row) => ({ items: row.cart, item_count: row.cart.reduce((n, item) => n + item.quantity, 0), subtotal: row.cart.reduce((n, item) => n + item.line_total, 0), currency: "USD" });
const json = (res, value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(req, res) {
  const url = new URL(req.url, site);
  let body = "";
  for await (const chunk of req) body += chunk;
  const data = body ? JSON.parse(body) : {};
  if (url.pathname === "/api/config") return json(res, { supabase_url: site, supabase_key: "public-browser-fixture" });
  if (url.pathname.startsWith("/auth/v1/")) {
    let user = [...visitors.values()].find((v) => v.refresh_token === data.refresh_token);
    if (!user) {
      const id = randomUUID();
      user = { user: { id }, access_token: `access-${id}`, refresh_token: `refresh-${id}`, expires_at: Math.floor(Date.now() / 1000) + 3600 };
      visitors.set(user.access_token, user);
    }
    return json(res, user);
  }
  if (url.pathname === "/api/products") {
    const offset = Number(url.searchParams.get("offset") ?? 0), limit = Number(url.searchParams.get("limit") ?? 100);
    return json(res, { products: catalog.products.slice(offset, offset + limit), has_more: offset + limit < catalog.products.length });
  }
  if (url.pathname.startsWith("/api/products/")) return json(res, product);
  const visitor = visitors.get(req.headers.authorization?.replace("Bearer ", ""));
  if (!visitor) return json(res, { detail: "访问凭证无效。" }, 401);
  const owner = visitor.user.id;
  const owned = (id) => { const row = conversations.get(id); return row?.owner === owner ? row : null; };
  if (url.pathname === "/api/conversations") {
    if (req.method === "POST") {
      let row = [...conversations.values()].find((r) => r.owner === owner && r.create_id === data.request_id);
      if (!row) {
        const now = new Date().toISOString();
        row = { id: randomUUID(), owner, create_id: data.request_id, title: "新对话", created_at: now, updated_at: now, turns: [], cart: [], operations: new Set() };
        conversations.set(row.id, row);
      }
      return json(res, { conversation: row, session_id: row.id });
    }
    return json(res, { conversations: [...conversations.values()].filter((r) => r.owner === owner).sort((a, b) => b.updated_at.localeCompare(a.updated_at)), has_more: false });
  }
  const history = url.pathname.match(/^\/api\/conversations\/([^/]+)\/turns(?:\/([^/]+))?$/);
  if (history) {
    const row = owned(history[1]);
    if (!row) return json(res, { detail: "未找到这段记录。" }, 404);
    if (history[2]) {
      const turn = row.turns.find((t) => t.request_id === history[2]);
      return turn ? json(res, turn) : json(res, { detail: "未找到回合。" }, 404);
    }
    return json(res, { turns: row.turns, has_more: false });
  }
  const row = owned(req.headers["x-session-id"]);
  if (!row) return json(res, { detail: "未找到这段记录。" }, 404);
  if (url.pathname === "/api/cart") return json(res, cartOf(row));
  if (url.pathname === "/api/cart/add") {
    if (!row.operations.has(data.request_id)) {
      row.operations.add(data.request_id);
      const quantity = (row.cart[0]?.quantity ?? 0) + data.quantity;
      row.cart = [{ ...product, quantity, line_total: quantity * product.price }];
    }
    return json(res, { cart: cartOf(row) });
  }
  if (url.pathname === "/api/chat") {
    requests.push({ ...data, conversation: row.id, accepted: !failNextChat });
    if (failNextChat) { failNextChat = false; return json(res, { detail: "临时连接失败，请重试这条消息。" }, 503); }
    let turn = row.turns.find((t) => t.request_id === data.request_id);
    if (!turn) {
      if (data.message.includes("偏好棉质")) visitor.preference = "棉质";
      const text = visitor.preference ? "可以优先考虑棉质用品，并结合这次需求选择。" : "可以从使用场景和预算开始挑选。";
      turn = { id: randomUUID(), request_id: data.request_id, sequence: row.turns.length + 1, message: data.message, status: "complete", display_version: 1, completion: {}, display: [
        { type: "text", text },
        { type: "ui", block: { component: "products", payload: { title: "适合进一步了解的商品", items: [{ product, reason: "规格、价格和适用条件均可继续比较。" }] } } },
      ] };
      row.turns.push(turn);
      row.title = row.turns[0].message.slice(0, 32);
      row.updated_at = new Date().toISOString();
    }
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
    for (const part of turn.display) {
      const type = part.type === "text" ? "text_delta" : "ui";
      const value = part.type === "text" ? { text: part.text } : { ...part.block, stream_id: turn.id };
      res.write(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);
      await sleep(30);
    }
    return res.end(`event: turn_complete\ndata: ${JSON.stringify({ sequence: turn.sequence, request_id: turn.request_id })}\n\n`);
  }
  return json(res, { detail: "未找到接口。" }, 404);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/") || req.url.startsWith("/auth/")) {
    void api(req, res).catch((error) => { console.error(error.message); if (!res.headersSent) json(res, {}, 500); else res.end(); });
    return;
  }
  const upstream = http.request(new URL(req.url, webURL), { method: req.method, headers: req.headers }, (response) => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  upstream.on("error", (error) => json(res, { detail: error.message }, 502));
  req.pipe(upstream);
});

class CDP {
  pending = new Map();
  sequence = 0;
  exceptions = [];
  constructor(socket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const value = JSON.parse(event.data);
      if (value.id) {
        const pending = this.pending.get(value.id);
        this.pending.delete(value.id);
        if (value.error) pending?.reject(new Error(value.error.message)); else pending?.resolve(value.result);
      } else if (value.method === "Runtime.exceptionThrown") this.exceptions.push(value.params.exceptionDetails.text);
    });
    socket.addEventListener("close", () => {
      for (const item of this.pending.values()) item.reject(new Error("Browser closed"));
      this.pending.clear();
    });
  }
  call(method, params = {}, sessionId) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async evaluate(session, expression) {
    const result = await this.call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, session);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async wait(session, expression) {
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      try { if (await this.evaluate(session, expression)) return; } catch { /* navigation */ }
      await sleep(80);
    }
    throw new Error(`Browser condition timed out: ${expression}`);
  }
  async page(context) {
    const { targetId } = await this.call("Target.createTarget", { url: "about:blank", browserContextId: context });
    const { sessionId } = await this.call("Target.attachToTarget", { targetId, flatten: true });
    await this.call("Page.enable", {}, sessionId);
    await this.call("Runtime.enable", {}, sessionId);
    await this.call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
    await this.call("Page.navigate", { url: site }, sessionId);
    await this.wait(sessionId, 'document.querySelector("textarea") && [...document.querySelectorAll("button")].some(b => b.textContent === "新对话" && !b.disabled)');
    return sessionId;
  }
  async click(session, text) {
    const literal = JSON.stringify(text);
    await this.wait(session, `[...document.querySelectorAll("button")].some(b => b.textContent.trim() === ${literal} && !b.disabled)`);
    const point = await this.evaluate(session, `(() => {
      const button = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === ${literal} && !b.disabled);
      button.scrollIntoView({ block: "center", inline: "center" });
      const rect = button.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    await this.call("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }, session);
    await this.call("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }, session);
  }
  async reload(session) {
    const previous = await this.evaluate(session, "performance.timeOrigin");
    await this.call("Page.reload", {}, session);
    await this.wait(session, `performance.timeOrigin !== ${previous} && document.readyState !== "loading"`);
  }
  async send(session, text) {
    await this.evaluate(session, 'document.querySelector("textarea").focus()');
    await this.call("Input.insertText", { text }, session);
    await this.wait(session, '!document.querySelector("button[aria-label=发送]").disabled');
    await this.evaluate(session, 'document.querySelector("button[aria-label=发送]").click()');
  }
  selected(session) {
    return this.evaluate(session, `sessionStorage.getItem("acme.conversation:" + JSON.parse(localStorage.getItem("acme.anonymous:${site}")).user.id)`);
  }
}

const profile = await mkdtemp(path.join(os.tmpdir(), "acme-browser-"));
let browserProcess, cdp;
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  site = `http://127.0.0.1:${server.address().port}`;
  browserProcess = spawn(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  const end = Date.now() + 20000;
  let debug;
  while (Date.now() < end) {
    try { debug = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/); break; } catch { await sleep(100); }
  }
  assert.ok(debug, "Chrome did not open a debugging endpoint");
  const socket = new WebSocket(`ws://127.0.0.1:${debug[0]}${debug[1]}`);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  cdp = new CDP(socket);
  const firstContext = (await cdp.call("Target.createBrowserContext")).browserContextId;
  const isolatedContext = (await cdp.call("Target.createBrowserContext")).browserContextId;
  const first = await cdp.page(firstContext);
  const firstId = await cdp.selected(first);
  const secondTab = await cdp.page(firstContext);
  assert.equal(visitors.size, 1);
  assert.equal(await cdp.selected(secondTab), firstId);
  const isolated = await cdp.page(isolatedContext);
  assert.equal(visitors.size, 2);
  assert.notEqual(await cdp.selected(isolated), firstId);
  console.log("PASS browser identity: shared tabs and isolated visitor");

  await cdp.send(first, "我长期偏好棉质，推荐日常用品");
  await cdp.wait(first, 'document.body.innerText.includes("适合进一步了解的商品") && [...document.querySelectorAll("button")].some(b => b.textContent === "新对话" && !b.disabled)');
  const sent = requests.length;
  await cdp.reload(first);
  await cdp.wait(first, 'document.body.innerText.includes("适合进一步了解的商品")');
  assert.equal(requests.length, sent);
  assert.equal(await cdp.evaluate(first, '/已记住|记忆面板|Memory|Sign in/.test(document.body.innerText)'), false);
  await cdp.wait(first, '[...document.querySelectorAll("button")].some(b => b.getAttribute("aria-label")?.includes("加入购物车") && !b.disabled)');
  await cdp.evaluate(first, '[...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label")?.includes("加入购物车") && !b.disabled).click()');
  await cdp.wait(first, 'document.querySelector("aside").innerText.includes("商品小计 · 1")');
  assert.equal(conversations.get(firstId).cart[0].quantity, 1);
  console.log("PASS history/card restoration and cart action");

  await cdp.click(first, "新对话");
  await cdp.wait(first, 'document.body.innerText.includes("今天想挑点什么") && document.querySelector("aside").innerText.includes("购物车还是空的")');
  assert.notEqual(await cdp.selected(first), firstId);
  await cdp.reload(secondTab);
  await cdp.wait(secondTab, 'document.body.innerText.includes("适合进一步了解的商品")');
  assert.equal(await cdp.selected(secondTab), firstId);
  await cdp.send(first, "换一个场景继续选购");
  await cdp.wait(first, 'document.body.innerText.includes("优先考虑棉质用品")');
  assert.equal(await cdp.evaluate(isolated, 'document.body.innerText.includes("优先考虑棉质用品")'), false);
  console.log("PASS new conversation isolation and per-tab selection");

  await cdp.wait(first, '[...document.querySelectorAll("button")].some(b => b.textContent === "新对话" && !b.disabled)');
  failNextChat = true;
  await cdp.send(first, "重试测试");
  await cdp.wait(first, '[...document.querySelectorAll("button")].some(b => b.textContent === "重试发送")');
  const failedId = requests.at(-1).request_id;
  await cdp.click(first, "重试发送");
  await cdp.wait(first, '!document.body.innerText.includes("重试发送") && [...document.querySelectorAll("button")].some(b => b.textContent === "新对话" && !b.disabled)');
  assert.equal(requests.at(-1).request_id, failedId);
  assert.equal(requests.filter((r) => r.request_id === failedId && r.accepted).length, 1);
  console.log("PASS pending request reconciliation and retry UUID");

  await cdp.call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, first);
  await cdp.click(first, "历史对话");
  await cdp.wait(first, 'document.querySelector("dialog")?.open');
  assert.equal(await cdp.evaluate(first, 'document.querySelector("dialog").contains(document.activeElement)'), true);
  await cdp.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, first);
  await cdp.call("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, first);
  await cdp.wait(first, '!document.querySelector("dialog")');
  assert.equal(await cdp.evaluate(first, 'document.activeElement.textContent'), "历史对话");
  assert.equal(await cdp.evaluate(first, 'document.documentElement.scrollWidth <= window.innerWidth'), true);
  assert.deepEqual(cdp.exceptions, []);
  if (args.get("--screenshots")) {
    const directory = args.get("--screenshots");
    await mkdir(directory, { recursive: true });
    const screenshot = await cdp.call("Page.captureScreenshot", { format: "png" }, first);
    await writeFile(path.join(directory, "mobile-conversation.png"), Buffer.from(screenshot.data, "base64"));
  }
  console.log("PASS mobile layout, dialog focus, Escape and browser runtime");
} finally {
  if (cdp) await cdp.call("Browser.close").catch(() => {});
  browserProcess?.kill();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}
