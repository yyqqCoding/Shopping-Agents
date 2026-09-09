import Link from "next/link";
import { equipment } from "@/lib/catalog";
import { assistantLink } from "@/lib/navigation";
import { SiteHeader, SiteFooter, Arrow } from "@/components/SiteChrome";
import EquipmentCard from "@/components/EquipmentCard";
import {
  DawnCanvas,
  HeroPrompt,
  LandingMotion,
  PackingStory,
  TripEntry,
} from "@/components/LandingExperience";

const journeys = [
  {
    title: "走进山里",
    subtitle: "日间徒步",
    image: "hiking",
    copy: "少一点负担，多一点沿途。",
    prompt:
      "准备一天的近郊徒步，已有徒步鞋，预算 700 元。帮我挑背包、水壶和备用头灯，尽量轻便。",
  },
  {
    title: "把夜晚留给自然",
    subtitle: "周末露营",
    image: "camping",
    copy: "找一片空地，安放一个周末。",
    prompt:
      "两个人春秋自驾露营一晚，预计最低 10°C，预算 2000 元，已有餐具。帮我搭配帐篷和睡眠装备。",
  },
  {
    title: "轻一点，走远一点",
    subtitle: "轻量出行",
    image: "lightweight",
    copy: "把真正需要的，装进背包。",
    prompt:
      "想为日间徒步精简装备，已有鞋服，预算 1000 元。帮我比较背包、水壶和登山杖的重量与用途。",
  },
];
export default function WelcomePage() {
  const picks = ["OD-1001", "OD-3001", "OD-4001", "OD-6001"]
    .map((id) => equipment.find((p) => p.product_id === id)!)
    .filter(Boolean);
  const packing = ["OD-1002", "OD-2001", "OD-2007"]
    .map((id) => equipment.find((p) => p.product_id === id)!)
    .filter(Boolean);
  const compare = equipment.filter((p) =>
    ["OD-1001", "OD-1002"].includes(p.product_id),
  );
  return (
    <>
      <LandingMotion />
      <SiteHeader overlay />
      <main id="main-content" className="editorial-home">
        <section className="dawn-hero" aria-labelledby="hero-title">
          <DawnCanvas />
          <div className="dawn-hero-veil" aria-hidden="true" />
          <div className="dawn-hero-copy">
            <h1 id="hero-title" data-hero="title">
              <span>把下一程，</span>
              <span>交给山野。</span>
            </h1>
            <p data-hero="sub">
              告诉助手你的行程、人数和预算，
              装备清单一起准备好。
            </p>
            <HeroPrompt />
          </div>
          <a className="dawn-hero-cue" href="#journeys" data-hero="cue">
            向下，看看怎么准备
            <Arrow />
          </a>
        </section>
        <section className="journeys-section section-wrap" id="journeys" data-reveal>
          <div className="section-heading section-heading-stacked">
            <h2>
              总有一种出发，
              <br />
              是你想要的。
            </h2>
            <p>
              不必一开始就懂所有装备。
              <br />
              先选个场景，我们从这里聊起。
            </p>
          </div>
          <div className="journey-grid">
            {journeys.map((journey, index) => (
              <Link
                href={assistantLink(journey.prompt)}
                className={`journey journey-${journey.image}`}
                key={journey.image}
                data-reveal
                data-reveal-delay={index === 0 ? undefined : index}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/images/${journey.image}.webp`}
                  alt={
                    journey.subtitle === "日间徒步"
                      ? "穿行于松林和岩石之间的山间小径"
                      : journey.subtitle === "周末露营"
                        ? "林间空地上的帐篷"
                        : "山野光线中的轻便背包与水壶"
                  }
                  loading="lazy"
                  width={1024}
                  height={1536}
                />
                <div className="journey-caption">
                  <span>{journey.subtitle}</span>
                  <h3>{journey.title}</h3>
                  <p>{journey.copy}</p>
                  <span className="journey-arrow">
                    <Arrow diagonal />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
        <PackingStory products={packing} />
        <section className="featured-section section-wrap" data-reveal>
          <div className="section-heading section-heading-stacked">
            <h2>
              好装备，
              <br />
              也要刚好适合你。
            </h2>
            <div>
              <p>从用途到参数，把每一个选择看清楚。</p>
              <Link href="/equipment" className="text-link">
                探索全部 {equipment.length} 款装备 <Arrow />
              </Link>
            </div>
          </div>
          <div className="featured-grid">
            {picks.map((product) => (
              <EquipmentCard key={product.product_id} product={product} />
            ))}
          </div>
        </section>
        <section className="comparison-story section-wrap" data-reveal>
          <div className="comparison-intro">
            <h2>
              轻一点，
              <br />
              还是宽敞一点？
            </h2>
            <p>
              价格之外，还有值得认真比较的事。
              <br />
              把差异摊开，选得更明白。
            </p>
            <Link
              className="field-button"
              href={assistantLink(
                "请比较双人三季徒步帐篷 OD-1001 和双人宽居营地帐篷 OD-1002，解释重量、空间与价格的取舍。",
              )}
            >
              让助手讲清楚 <Arrow />
            </Link>
          </div>
          <div className="comparison-preview">
            <div className="comparison-preview-head">
              <span>双人帐篷 · 参数对照</span>
            </div>
            <table>
              <caption className="sr-only">
                两款双人帐篷的价格、重量、空间与适合场景
              </caption>
              <thead>
                <tr>
                  <th scope="col">选购关注</th>
                  {compare.map((p) => (
                    <th scope="col" key={p.product_id}>
                      <Link href={`/equipment/${p.product_id}`}>{p.title}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {["重量", "内帐尺寸", "适合场景"].map((spec) => (
                  <tr key={spec}>
                    <th scope="row">{spec}</th>
                    {compare.map((p) => (
                      <td key={p.product_id}>{p.specs?.[spec]}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row">价格</th>
                  {compare.map((p) => (
                    <td className="table-price" key={p.product_id}>
                      ¥{p.price}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section className="departure-section" data-reveal>
          <div>
            <h2>
              山野不远，
              <br />
              现在就开始准备。
            </h2>
            <p>从一句“我想去”，到一份适合自己的装备清单。</p>
          </div>
          <TripEntry />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
