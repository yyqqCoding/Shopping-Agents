import Link from "next/link";
import { equipment, equipmentById } from "@/lib/catalog";
import { assistantLink } from "@/lib/navigation";
import { SiteHeader, SiteFooter, Arrow } from "@/components/SiteChrome";
import EquipmentCard from "@/components/EquipmentCard";
import {
  GearPrint,
  HeroTable,
  LandingMotion,
  TripEntry,
  type HeroKit,
} from "@/components/LandingExperience";

const scenes = [
  {
    title: "走进山里",
    image: "hiking",
    alt: "穿行于松林和岩石之间的山间小径",
    copy: "日间徒步，少一点负担，多一点沿途。",
    tilt: -1.6,
    prompt:
      "准备一天的近郊徒步，已有徒步鞋，预算 700 元。帮我挑背包、水壶和备用头灯，尽量轻便。",
  },
  {
    title: "把夜晚留给自然",
    image: "camping",
    alt: "林间空地上的帐篷",
    copy: "周末露营，找一片空地，安放一个周末。",
    tilt: 1.2,
    prompt:
      "两个人春秋自驾露营一晚，预计最低 10°C，预算 2000 元，已有餐具。帮我搭配帐篷和睡眠装备。",
  },
  {
    title: "轻一点，走远一点",
    image: "lightweight",
    alt: "山野光线中的轻便背包与水壶",
    copy: "轻量出行，把真正需要的装进背包。",
    tilt: -0.8,
    prompt:
      "想为日间徒步精简装备，已有鞋服，预算 1000 元。帮我比较背包、水壶和登山杖的重量与用途。",
  },
];

function kit(
  scene: HeroKit["scene"],
  prompt: string,
  budget: number | null,
  items: [string, number][],
  pending: [string, string],
): HeroKit {
  return {
    scene,
    prompt,
    budget,
    items: items.map(([id, qty]) => ({ product: equipmentById(id)!, qty })),
    pending: { product: equipmentById(pending[0])!, note: pending[1] },
  };
}

export default function WelcomePage() {
  const kits = [
    kit(
      "camping",
      "两人周末自驾露营一晚，预算 2000 元，帮我配帐篷和睡眠装备。",
      2000,
      [
        ["OD-1002", 1],
        ["OD-2002", 2],
        ["OD-2007", 2],
      ],
      ["OD-6006", "夜间照明，预算内"],
    ),
    kit(
      "hiking",
      "准备一天的近郊徒步，已有徒步鞋，预算 700 元，想轻便些。",
      700,
      [
        ["OD-3006", 1],
        ["OD-7008", 1],
        ["OD-6001", 1],
      ],
      ["OD-4001", "看天气再定"],
    ),
    kit(
      "sunrise",
      "想去山里的营地看日出，夜间最低 5°C，预算 1500 元，要保暖和照明。",
      1500,
      [
        ["OD-2003", 1],
        ["OD-4005", 1],
        ["OD-6002", 1],
      ],
      ["OD-2008", "地面隔冷，建议加"],
    ),
  ];
  const picks = ["OD-8002", "OD-3001", "OD-7005", "OD-5002"].map(
    (id) => equipmentById(id)!,
  );
  const compare = ["OD-1001", "OD-1002"].map((id) => equipmentById(id)!);
  const rows: [string, (p: (typeof compare)[number]) => string][] = [
    ["重量", (p) => p.specs?.["重量"] ?? p.attributes?.highlight_1 ?? ""],
    ["内帐尺寸", (p) => p.specs?.["内帐尺寸"] ?? ""],
    ["适合", (p) => p.specs?.["适合场景"] ?? p.attributes?.activity ?? ""],
    ["价格", (p) => `¥${p.price.toLocaleString("zh-CN")}`],
  ];

  return (
    <>
      <LandingMotion />
      <SiteHeader overlay />
      <main id="main-content" className="editorial-home">
        <section className="welcome-table" aria-labelledby="hero-title">
          <HeroTable kits={kits}>
            <h1 id="hero-title" data-hero="title">
              把下一程，
              <br />
              摊开来看。
            </h1>
            <p data-hero="sub">
              说出行程、人数和预算，装备会一件件落到布上，清单同时写好。
            </p>
          </HeroTable>
        </section>

        <section className="scenes-section section-wrap" id="journeys">
          <div className="section-heading">
            <h2 data-reveal>
              总有一种出发，
              <br />
              是你想要的。
            </h2>
            <p data-reveal>不必一开始就懂所有装备。先选一个场景，我们从这里聊起。</p>
          </div>
          <div className="scene-row">
            {scenes.map((scene, index) => (
              <Link
                href={assistantLink(scene.prompt)}
                className="scene"
                key={scene.image}
              >
                <span
                  className="print scene-print"
                  data-land
                  style={{ "--tilt": `${scene.tilt}deg`, "--i": index } as React.CSSProperties}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/images/${scene.image}.webp`}
                    alt={scene.alt}
                    loading="lazy"
                    width={1024}
                    height={1536}
                  />
                </span>
                <span className="scene-caption">
                  <strong>{scene.title}</strong>
                  <span>{scene.copy}</span>
                  <span className="scene-go">
                    从这里聊起 <Arrow />
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="compare-section section-wrap" id="how-it-works">
          <div className="compare-words">
            <h2 data-reveal>
              轻一点，
              <br />
              还是宽敞一点？
            </h2>
            <p data-reveal>
              价格之外，还有值得认真比较的事。把两顶帐篷摊在一起，差异就清楚了。
            </p>
            <Link
              className="field-button"
              data-reveal
              href={assistantLink(
                "请比较双人三季徒步帐篷 OD-1001 和双人宽居营地帐篷 OD-1002，解释重量、空间与价格的取舍。",
              )}
            >
              让助手讲清楚 <Arrow />
            </Link>
          </div>
          <div className="compare-cloth">
            {compare.map((product, index) => (
              <div className="compare-item" key={product.product_id}>
                <GearPrint product={product} tilt={index ? 1.4 : -1.8} index={index} />
                <div className="paper spec-slip" data-reveal>
                  <h3>
                    <Link href={`/equipment/${product.product_id}`}>{product.title}</Link>
                  </h3>
                  <dl>
                    {rows.map(([label, read]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{read(product)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="featured-section section-wrap">
          <div className="section-heading">
            <h2 data-reveal>
              好装备，
              <br />
              也要刚好适合你。
            </h2>
            <div data-reveal>
              <p>从用途到参数，把每一个选择看清楚。</p>
              <Link href="/equipment" className="text-link">
                探索全部 {equipment.length} 款装备 <Arrow />
              </Link>
            </div>
          </div>
          <div className="featured-grid">
            {picks.map((product, index) => (
              <EquipmentCard key={product.product_id} product={product} index={index} />
            ))}
          </div>
        </section>

        <section className="departure-section section-wrap">
          <TripEntry />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
