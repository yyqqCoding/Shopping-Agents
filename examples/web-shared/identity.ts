"use client";

interface Credential {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string };
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Web Locks serialize identity creation and token rotation across tabs on HTTPS. */
export async function browserLock<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error("请通过 HTTPS 地址，使用新版浏览器打开体验站。");
  return navigator.locks.request(name, action);
}

export class AnonymousIdentity {
  private expectedUser: string | null = null;
  readonly storageKey: string;

  constructor(readonly url: string, private readonly publicKey: string) {
    this.storageKey = `acme.anonymous:${url}`;
  }

  async credential(): Promise<Credential> {
    return browserLock(this.storageKey, async () => {
      const raw = localStorage.getItem(this.storageKey);
      let current: Credential | null = null;
      if (raw) {
        try {
          current = JSON.parse(raw) as Credential;
          if (!current?.access_token || !current.refresh_token || !current.user?.id || !Number.isFinite(current.expires_at)) {
            throw new Error("Invalid credential");
          }
        } catch {
          throw new Error("浏览器中的访问凭证无法读取，请在浏览器设置中清除本站数据后重新体验。");
        }
      }
      if (this.expectedUser && current?.user.id !== this.expectedUser) {
        throw new Error("浏览器中的身份已改变，请刷新页面后继续。");
      }
      if (!current || current.expires_at <= Date.now() / 1000 + 60) {
        const previousUser = current?.user.id;
        const path = current ? "/token?grant_type=refresh_token" : "/signup";
        let response: Response;
        try {
          response = await fetch(`${this.url}/auth/v1${path}`, {
            method: "POST",
            headers: { apikey: this.publicKey, "Content-Type": "application/json" },
            body: JSON.stringify(current ? { refresh_token: current.refresh_token } : { data: {} }),
            signal: AbortSignal.timeout(15000),
          });
        } catch {
          throw new Error("暂时无法连接体验服务，请稍后重试。");
        }
        if (!response.ok) {
          // Never delete a saved identity or sign up again because a refresh failed.
          if (current && [400, 401, 403].includes(response.status)) {
            throw new ApiError(401, "访问凭证已失效。清除本站浏览器数据后可以重新体验，原有对话将无法找回。");
          }
          throw new ApiError(response.status, response.status === 429 ? "访问较频繁，请稍后重试。" : "体验服务暂时不可用，请稍后重试。");
        }
        const data = await response.json();
        const expiresAt = data.expires_at ?? Math.floor(Date.now() / 1000) + data.expires_in;
        if (!data.access_token || !data.refresh_token || !data.user?.id || !Number.isFinite(expiresAt)) {
          throw new Error("无法恢复访问凭证，请稍后重试。");
        }
        current = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: expiresAt,
          user: { id: data.user.id },
        };
        if (previousUser && current.user.id !== previousUser) throw new Error("无法恢复原有身份，请稍后重试。");
        if (this.expectedUser && current.user.id !== this.expectedUser) throw new Error("身份已改变，请刷新页面。");
        localStorage.setItem(this.storageKey, JSON.stringify(current));
      }
      this.expectedUser = current.user.id;
      return current;
    });
  }
}
