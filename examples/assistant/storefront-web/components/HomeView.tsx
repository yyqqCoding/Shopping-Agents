"use client";

import { useEffect, useState } from "react";
import { Button, Greeting, greeting, HomeSection, type Starter, Starters, useCatalogIndex, useStoreFrame } from "web-shared";
import { fetchProducts } from "@/lib/api";
import ProductTile from "./ProductTile";

const STARTERS: Starter[] = [
  { icon: "search", prompt: "第一次带家人露营，帮我选一顶 250 美元以内的帐篷" },
  { icon: "home", prompt: "小房间怎么布置居家办公区？预算 800 美元" },
  { icon: "tag", prompt: "早晨时间紧，滴滤咖啡机和意式咖啡机怎么选？" },
  { icon: "spark", prompt: "我家空间不大，还养了狗，想把清洁和收纳一起安排好" },
];

export default function HomeView() {
  const { ask, chat } = useStoreFrame();
  const catalog = useCatalogIndex(fetchProducts);
  const [now, setNow] = useState<Date | null>(null);
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(8);
  useEffect(() => setNow(new Date()), []);
  const products = Object.values(catalog);
  const categories = [...new Map(products.map((p) => [p.category ?? "", p.attributes?.category_label ?? p.category ?? ""])).entries()];
  const picks = products.filter((p) => !category || p.category === category)
    .sort((a, b) => Number(Boolean(b.image_url)) - Number(Boolean(a.image_url)));
  return (
    <div className="flex flex-col gap-6">
      <Greeting
        eyebrow={now ? now.toLocaleDateString("zh-CN", { weekday: "long", month: "long", day: "numeric" }) : "欢迎来到 ACME"}
        title={<h1 className="text-[30px] font-semibold leading-snug tracking-tight text-(--ink)">{now ? greeting(now) : "你好"}，今天想挑点什么？</h1>}
      >
        从一个想法开始，一起挑商品、做比较，也可以把整套计划安排好。
      </Greeting>
      <Starters items={STARTERS} />
      {products.length ? (
        <HomeSection title="逛逛商品" subtitle={`共 ${products.length} 件商品，点击即可向助手了解详情`}>
          <div role="group" aria-label="商品分类" className="panel-scroll mb-3 flex gap-2 overflow-x-auto pb-1">
            {[["", "全部"], ...categories].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={category === id} className="chip shrink-0 aria-pressed:bg-(--accent-soft) aria-pressed:border-(--accent)" onClick={() => { setCategory(id); setLimit(8); }}>{label}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {picks.slice(0, limit).map((product) => <ProductTile key={product.product_id} product={product} fluid onOpen={chat?.ready && !chat.busy ? (item) => ask(`帮我介绍一下${item.title}（${item.product_id}），适合什么需求，有哪些限制？`) : undefined} />)}
          </div>
          {picks.length > limit ? <div className="mt-4 text-center"><Button onClick={() => setLimit((n) => n + 12)}>查看更多商品</Button></div> : null}
        </HomeSection>
      ) : null}
      <p className="text-center text-xs leading-relaxed text-(--ink-soft)">商品、评价与价格走势为虚构展示数据，结算不会下单或扣款。</p>
    </div>
  );
}
