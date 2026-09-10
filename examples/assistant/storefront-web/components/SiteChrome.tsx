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
      <nav aria-label="主导航" className="site-header-center">
        <Link href="/#journeys">出行场景</Link>
        <Link href="/#how-it-works">摊开来比</Link>
        <Link
          href="/equipment"
          aria-current={active === "equipment" ? "page" : undefined}
        >
          装备目录
        </Link>
      </nav>
      <div className="site-header-side">
        <Link href="/chat" className="nav-assistant">
          开始准备 <Arrow diagonal />
        </Link>
      </div>
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
        <nav aria-label="页脚导航">
          <Link href="/#journeys">出行场景</Link>
          <Link href="/equipment">装备目录</Link>
          <Link href="/chat">
            聊聊下一程 <Arrow diagonal />
          </Link>
        </nav>
      </div>
    </footer>
  );
}
