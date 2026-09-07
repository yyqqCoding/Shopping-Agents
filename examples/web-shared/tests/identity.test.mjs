import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { AnonymousIdentity } from "../identity.ts";
import { AUTH_URL, USER, browser, credential, json, storedCredential } from "./browser-env.mjs";

beforeEach(browser);

test("concurrent mounts and tabs create only one anonymous identity, then restore it", async () => {
  globalThis.fetch = mock.fn(async (url) => {
    assert.equal(url, `${AUTH_URL}/auth/v1/signup`);
    await Promise.resolve();
    return json(credential());
  });
  const first = new AnonymousIdentity(AUTH_URL, "public-test");
  const second = new AnonymousIdentity(AUTH_URL, "public-test");
  const results = await Promise.all([first.credential(), first.credential(), second.credential()]);
  assert.deepEqual(results.map((r) => r.user.id), [USER, USER, USER]);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal((await new AnonymousIdentity(AUTH_URL, "public-test").credential()).user.id, USER);
  assert.equal(fetch.mock.callCount(), 1);
});

test("token refresh is serialized across tabs and keeps the same visitor", async () => {
  storedCredential(credential({ expires_at: 0 }));
  globalThis.fetch = mock.fn((url, init) => {
    assert.equal(url, `${AUTH_URL}/auth/v1/token?grant_type=refresh_token`);
    assert.deepEqual(JSON.parse(init.body), { refresh_token: "visitor-refresh" });
    return json(credential({ access_token: "rotated" }));
  });
  const [first, second] = await Promise.all([new AnonymousIdentity(AUTH_URL, "public-test").credential(), new AnonymousIdentity(AUTH_URL, "public-test").credential()]);
  assert.equal(first.access_token, "rotated");
  assert.deepEqual(first, second);
  assert.equal(fetch.mock.callCount(), 1);
});

for (const status of [401, 503]) {
  test(`refresh failure ${status} preserves credentials and never signs up again`, async () => {
    const original = credential({ expires_at: 0 });
    storedCredential(original);
    globalThis.fetch = mock.fn((url) => {
      assert.ok(url.includes("/token?"));
      return json({}, status);
    });
    const identity = new AnonymousIdentity(AUTH_URL, "public-test");
    await assert.rejects(identity.credential());
    await assert.rejects(identity.credential());
    assert.deepEqual(JSON.parse(localStorage.getItem(identity.storageKey)), original);
    assert.equal(fetch.mock.callCount(), 2);
  });
}

test("an offline refresh does not erase browser identity", async () => {
  const original = credential({ expires_at: 0 });
  storedCredential(original);
  const identity = new AnonymousIdentity(AUTH_URL, "public-test");
  await assert.rejects(identity.credential(), /暂时无法连接/);
  assert.deepEqual(JSON.parse(localStorage.getItem(identity.storageKey)), original);
});

test("a tab cannot silently adopt another identity after browser storage changes", async () => {
  storedCredential();
  const identity = new AnonymousIdentity(AUTH_URL, "public-test");
  await identity.credential();
  storedCredential(credential({ user: { id: "another-visitor" } }));
  await assert.rejects(identity.credential(), /身份已改变/);
  assert.equal(fetch.mock.callCount(), 0);
});

test("corrupt credentials or missing Web Locks do not create a replacement visitor", async () => {
  const identity = new AnonymousIdentity(AUTH_URL, "public-test");
  localStorage.setItem(identity.storageKey, "bad json");
  await assert.rejects(identity.credential(), /凭证无法读取/);
  navigator.locks = undefined;
  await assert.rejects(identity.credential(), /HTTPS/);
  assert.equal(fetch.mock.callCount(), 0);
});
