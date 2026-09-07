import { mock } from "node:test";

export const AUTH_URL = "https://identity.example.test";
export const USER = "00000000-0000-4000-8000-000000000001";
export const CONVERSATION = "00000000-0000-4000-8000-000000000002";

class Storage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

export function credential(values = {}) {
  return { access_token: "visitor-access", refresh_token: "visitor-refresh", expires_at: Date.now() / 1000 + 3600, user: { id: USER }, ...values };
}

export function browser() {
  const queues = new Map();
  const locks = {
    request(name, action) {
      const result = (queues.get(name) ?? Promise.resolve()).then(action);
      queues.set(name, result.catch(() => {}));
      return result;
    },
  };
  Object.defineProperty(globalThis, "navigator", { value: { locks }, configurable: true });
  globalThis.localStorage = new Storage();
  globalThis.sessionStorage = new Storage();
  globalThis.fetch = mock.fn(() => { throw new Error("Unexpected network call"); });
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export function storedCredential(value = credential()) {
  localStorage.setItem(`acme.anonymous:${AUTH_URL}`, JSON.stringify(value));
}

export function configOr(url, callback, init) {
  if (url.endsWith("/api/config")) return json({ supabase_url: AUTH_URL, supabase_key: "public-test" });
  return callback(url, init);
}
