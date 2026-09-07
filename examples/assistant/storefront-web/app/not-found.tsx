import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="catalog-empty section-wrap">
        <h1>这条路，还没有装备。</h1>
        <p>页面可能已经移动，回到目录继续逛逛。</p>
        <Link className="field-button" href="/equipment">
          返回装备目录
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
