"use client";

interface Credential {
  access_token: string;
  user: { id: string };
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Coordinate identity creation across tabs without ever replacing a saved identity. */
export async function browserLock<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error("请通过 HTTPS 地址，使用新版浏览器打开体验站。");
  return navigator.locks.request(name, action);
}

export class AnonymousIdentity {
  private expectedUser: string | null = null;
  readonly storageKey: string;

  constructor(readonly apiBase: string) {
    this.storageKey = `shopping.local-identity:${apiBase}`;
  }

  async credential(): Promise<Credential> {
    return browserLock(this.storageKey, async () => {
      const raw = localStorage.getItem(this.storageKey);
      let current: Credential | null = null;
      if (raw) {
        try {
          current = JSON.parse(raw) as Credential;
          if (!current?.access_token || !current.user?.id) throw new Error("Invalid credential");
        } catch {
          throw new Error("浏览器中的访问凭证无法读取，请在浏览器设置中清除本站数据后重新体验。");
        }
      }
      if (this.expectedUser && current?.user.id !== this.expectedUser) {
        throw new Error("浏览器中的身份已改变，请刷新页面后继续。");
      }
      if (!current) {
        let response: Response;
        try {
          response = await fetch(`${this.apiBase}/identity`, {
            method: "POST", signal: AbortSignal.timeout(15000),
          });
        } catch {
          throw new Error("暂时无法连接体验服务，请稍后重试。");
        }
        if (!response.ok) throw new ApiError(response.status, response.status === 429 ? "访问较频繁，请稍后重试。" : "体验服务暂时不可用，请稍后重试。");
        current = await response.json() as Credential;
        if (!current?.access_token || !current.user?.id) throw new Error("无法创建访问凭证，请稍后重试。");
        localStorage.setItem(this.storageKey, JSON.stringify(current));
      }
      this.expectedUser = current.user.id;
      return current;
    });
  }
}
