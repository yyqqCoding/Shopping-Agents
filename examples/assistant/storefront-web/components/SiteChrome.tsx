import Link from "next/link";
import OutdoorMark from "./OutdoorMark";

export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h15m-6-6 6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function SiteHeader({
  active,
  overlay = false,
}: {
  active?: "equipment";
  overlay?: boolean;
}) {
  return (
    <header className={`site-header ${overlay ? "site-header-overlay" : ""}`}>
      <a className="skip-content" href="#main-content">
        跳到正文
      </a>
      <Link href="/" className="outdoor-wordmark">
        <OutdoorMark className="outdoor-mark" />
        <span>户外装备助手</span>
      </Link>
      <nav aria-label="主导航">
        <Link href="/#journeys">探索出行</Link>
        <Link
          href="/equipment"
          aria-current={active === "equipment" ? "page" : undefined}
        >
          装备目录
        </Link>
        <Link href="/chat" className="nav-assistant">
          开始准备 <Arrow diagonal />
        </Link>
      </nav>
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <Link href="/" className="outdoor-wordmark">
          <OutdoorMark className="outdoor-mark" />
          <span>户外装备助手</span>
        </Link>
        <p>准备得刚刚好，出发得更从容。</p>
        <Link href="/chat">
          聊聊下一程 <Arrow diagonal />
        </Link>
      </div>
      <div className="footer-bottom">
        <span>徒步 · 露营 · 轻量出行</span>
        <span>原创生成影像 · 虚构商品体验 · 结算不下单、不扣款</span>
      </div>
    </footer>
  );
}
