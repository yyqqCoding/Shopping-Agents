"use client";

import { useState } from "react";
import { Button, HomeSection, Icon, type IconName, useCatalogIndex, useStoreFrame } from "web-shared";
import { fetchProducts } from "@/lib/api";
import OutdoorMark from "./OutdoorMark";
import ProductTile from "./ProductTile";

const STARTERS: { icon: IconName; title: string; description: string; prompt: string }[] = [
  { icon: "mountain", title: "周末，去露营", description: "从帐篷到睡眠装备，配好一套。", prompt: "两个人周末自驾露营一晚，春秋季节预计最低 10°C，预算 2000 元。已有餐具，帮我配一套帐篷和睡眠装备。" },
  { icon: "pin", title: "轻装走进山野", description: "看重量、背负和实际需要。", prompt: "准备一天的近郊徒步，已有徒步鞋，预算 700 元。想选一个背包、水壶和备用头灯，尽量轻便。" },
  { icon: "chart", title: "挑出适合我的", description: "把参数和取舍，一次讲清楚。", prompt: "比较 1000 元以内的双人徒步帐篷。我更看重轻量和收纳，也想知道减轻重量会牺牲什么。" },
];

export default function HomeView() {
  const { ask, chat } = useStoreFrame();
  const catalog = useCatalogIndex(fetchProducts);
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(8);
  const products = Object.values(catalog);
  const categories = [...new Map(products.map((p) => [p.category ?? "", p.attributes?.category_label ?? p.category ?? ""])).entries()];
  const picks = products.filter((p) => !category || p.category === category)
    .sort((a, b) => Number(b.in_stock !== false) - Number(a.in_stock !== false));
  const ready = Boolean(chat?.ready && !chat.busy);
  return (
    <div className="outdoor-home">
      <div className="outdoor-home-heading">
        <OutdoorMark className="outdoor-mark" />
        <h2>下一次，想去哪里走走？</h2>
        <p>聊聊你的出行计划。从一件装备开始，<br className="sm:hidden" />也可以一起准备完整的出发清单。</p>
      </div>
      <div className="outdoor-starters">
        {STARTERS.map((item) => <button key={item.title} type="button" disabled={!ready} onClick={() => ask(item.prompt)}>
          <Icon name={item.icon} size={25} /><strong>{item.title}</strong><span>{item.description}</span>
        </button>)}
      </div>
      {products.length ? (
        <HomeSection title="先逛逛装备" subtitle={`${products.length} 款户外装备，从适合你的场景挑起`}>
          <div role="group" aria-label="装备分类" className="panel-scroll mb-5 flex gap-2 overflow-x-auto pb-2">
            {[["", "全部装备"], ...categories].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={category === id} className="chip shrink-0 aria-pressed:bg-(--accent-soft) aria-pressed:border-(--accent)" onClick={() => { setCategory(id); setLimit(8); }}>{label}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {picks.slice(0, limit).map((product) => <ProductTile key={product.product_id} product={product} fluid onOpen={ready ? (item) => ask(`帮我看看${item.title}（${item.product_id}），适合哪些出行场景，选它需要注意什么？`) : undefined} />)}
          </div>
          {picks.length > limit ? <div className="mt-5 text-center"><Button onClick={() => setLimit((n) => n + 12)}>查看更多装备</Button></div> : null}
        </HomeSection>
      ) : null}
    </div>
  );
}
