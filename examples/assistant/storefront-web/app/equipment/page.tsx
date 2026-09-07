import type { Metadata } from "next";
import { equipment, categories } from "@/lib/catalog";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import EquipmentBrowser from "@/components/EquipmentBrowser";

export const metadata: Metadata = {
  title: "装备目录 · 户外装备助手",
  description: "浏览徒步、露营与轻量出行装备，从用途和参数找到适合你的选择。",
};
export default function EquipmentPage() {
  return (
    <>
      <SiteHeader active="equipment" />
      <main id="main-content" className="catalog-page section-wrap">
        <div className="catalog-heading">
          <h1>
            为下一程，
            <br />
            找到刚好的装备。
          </h1>
          <p>
            帐篷、背包、睡眠系统与随行小物。
            <br />
            每一种准备，都从实际需要出发。
          </p>
        </div>
        <EquipmentBrowser
          initialProducts={equipment.map(
            ({
              product_id,
              title,
              price,
              currency,
              category,
              image_url,
              in_stock,
              options,
              attributes,
              short_description,
            }) => ({
              product_id,
              title,
              price,
              currency,
              category,
              image_url,
              in_stock,
              options,
              attributes,
              short_description,
            }),
          )}
          categories={categories}
        />
      </main>
      <SiteFooter />
    </>
  );
}
