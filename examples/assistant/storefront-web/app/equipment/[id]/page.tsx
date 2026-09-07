import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { equipment, equipmentById } from "@/lib/catalog";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import EquipmentDetail from "@/components/EquipmentDetail";
import EquipmentCard from "@/components/EquipmentCard";

export function generateStaticParams() {
  return equipment.map((product) => ({ id: product.product_id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const product = equipmentById((await params).id);
  return {
    title: product ? `${product.title} · 户外装备助手` : "未找到装备",
    description: product?.short_description ?? undefined,
  };
}
export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const product = equipmentById((await params).id);
  if (!product) notFound();
  const related = equipment
    .filter(
      (item) =>
        item.category === product.category &&
        item.product_id !== product.product_id,
    )
    .slice(0, 4);
  return (
    <>
      <SiteHeader active="equipment" />
      <main id="main-content" className="detail-page section-wrap">
        <nav aria-label="面包屑" className="breadcrumbs">
          <Link href="/">首页</Link>
          <span>/</span>
          <Link href="/equipment">装备目录</Link>
          <span>/</span>
          <span aria-current="page">{product.title}</span>
        </nav>
        <EquipmentDetail key={product.product_id} product={product} />
        <section className="related-equipment">
          <div className="section-heading">
            <h2>也看看这些选择。</h2>
            <Link className="text-link" href="/equipment">
              全部装备
            </Link>
          </div>
          <div className="featured-grid">
            {related.map((item) => (
              <EquipmentCard key={item.product_id} product={item} />
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
