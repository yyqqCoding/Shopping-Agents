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
import { ExpeditionTelemetryHUD } from "@/components/ExpeditionTelemetryHUD";
import { InteractiveSceneCard } from "@/components/InteractiveSceneCard";
import { TentBenchmarkStage } from "@/components/TentBenchmarkStage";
import { FeaturedSpotlightGrid } from "@/components/FeaturedSpotlightGrid";

const scenes = [
  {
    sector: "ROUTE // 01",
    coord: "31°14'N · 118°22'E",
    elev: "+1,420M",
    tag: "日间轻装 · 碎石与松针小径",
    title: "走进山里",
    image: "hiking",
    alt: "穿行于松林和岩石之间的山间小径",
    copy: "日间徒步，少一点负担，多一点沿途风景。",
    specs: ["超轻背包系统", "水合保温", "轻量化头灯"],
    tilt: -1.6,
    prompt:
      "准备一天的近郊徒步，已有徒步鞋，预算 700 元。帮我挑背包、水壶和备用头灯，尽量轻便。",
  },
  {
    sector: "ROUTE // 02",
    coord: "30°18'N · 119°26'E",
    elev: "+840M",
    tag: "营地安歇 · 湖畔林间过夜",
    title: "把夜晚留给自然",
    image: "camping",
    alt: "林间空地上的帐篷",
    copy: "周末露营，找一片静谧空地，安放整个周末。",
    specs: ["双层防风帐篷", "温标隔冷睡眠", "炊具餐具搭配"],
    tilt: 1.2,
    prompt:
      "两个人春秋自驾露营一晚，预计最低 10°C，预算 2000 元，已有餐具。帮我搭配帐篷和睡眠装备。",
  },
  {
    sector: "ROUTE // 03",
    coord: "29°42'N · 120°10'E",
    elev: "+1,860M",
    tag: "精算减负 · 远距离快速穿越",
    title: "轻一点，走远一点",
    image: "lightweight",
    alt: "山野光线中的轻便背包与水壶",
    copy: "轻量出行，把真正需要的硬核装备装进背包。",
    specs: ["克重精准精算", "三合一负重优化", "碳素支撑"],
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

  return (
    <>
      <LandingMotion />
      <ExpeditionTelemetryHUD />
      <SiteHeader overlay />
      <main id="main-content" className="editorial-home">
        <section className="welcome-table" aria-labelledby="hero-title">
          <HeroTable kits={kits}>
            <h1 id="hero-title" data-hero="title">
              <span className="hero-title-line">
                <span>把下一程，</span>
              </span>
              <span className="hero-title-line">
                <span>摊开来看。</span>
              </span>
            </h1>
            <p data-hero="sub">
              说出行程、人数和预算，装备会一件件落到布上，清单同时写好。
            </p>
          </HeroTable>
        </section>

        {/* Section 2: Curated Outdoor Journeys (Apple Gallery Style) */}
        <section className="section-stage scenes-stage" id="journeys">
          <div className="stage-ambient scenes-ambient" aria-hidden="true">
            <div
              className="ambient-landscape-fog"
              style={{ backgroundImage: "url('/images/hiking.webp')" }}
            />
            <div className="ambient-topo-grid" />
            <div className="ambient-corridor-strip">
              <span className="corridor-dot" />
              <span className="corridor-tag">EXPEDITION CORRIDOR // SECTORS 01 — 03</span>
              <span className="corridor-elev">ELEV +1,420M ~ +840M</span>
              <span className="corridor-coords">30°18'N ~ 31°14'N · TRAIL NETWORK</span>
            </div>
          </div>
          <div className="scenes-section section-wrap">
            <div className="section-heading">
              <h2 data-reveal>
                总有一种出发，
                <br />
                是你想要的。
              </h2>
              <p data-reveal>
                不必一开始就懂所有装备。选一个心仪的场景，我们从这里聊起。
              </p>
            </div>
            <div className="scene-row">
              {scenes.map((scene, index) => (
                <InteractiveSceneCard key={scene.image} scene={scene} index={index} />
              ))}
            </div>
          </div>
        </section>

        {/* Section 3: Flagship Tent Dual Benchmark (Apple Tech Specs Style) */}
        <section className="section-stage compare-stage" id="how-it-works">
          <div className="stage-ambient compare-ambient" aria-hidden="true">
            <div className="ambient-lab-grid" />
            <div className="compare-spotlight spotlight-left" />
            <div className="compare-spotlight spotlight-right" />
            <div className="lab-spec-crosshairs">
              <span className="crosshair ch-1">+</span>
              <span className="crosshair ch-2">+</span>
              <span className="crosshair ch-3">+</span>
              <span className="crosshair ch-4">+</span>
            </div>
            <div className="lab-watermark-tag">TACTICAL BENCHMARK LAB // WEIGHT-TO-VOLUME FIELD TEST</div>
          </div>
          <div className="compare-section section-wrap">
            <TentBenchmarkStage products={compare} />
          </div>
        </section>

        {/* Section 4: Featured Equipment Catalog Grid */}
        <section className="section-stage featured-stage">
          <div className="stage-ambient featured-ambient" aria-hidden="true">
            <div className="ambient-contour-lines" />
            <div className="featured-ambient-glow" />
            <div className="featured-watermark-strip">
              <span>FIELD EQUIPMENT // TESTED ON RIDGE & TRAIL · 4-SEASON SYSTEM</span>
            </div>
          </div>
          <div className="featured-section section-wrap">
            <div className="section-heading">
              <h2 data-reveal>
                好装备，
                <br />
                也要刚好适合你。
              </h2>
              <div data-reveal>
                <p>从用途到参数，把每一个选择看清楚。</p>
                <Link href="/equipment" className="text-link luxury-more-link">
                  <span>探索全部 {equipment.length} 款精选装备</span> <Arrow />
                </Link>
              </div>
            </div>
            <FeaturedSpotlightGrid products={picks} />
          </div>
        </section>

        {/* Section 5: Mission Departure Terminal */}
        <section className="section-stage departure-stage">
          <div className="stage-ambient departure-ambient" aria-hidden="true">
            <div
              className="departure-landscape-mist"
              style={{ backgroundImage: "url('/images/hero.webp')" }}
            />
            <div className="departure-radar-rings">
              <div className="radar-circle rc-1" />
              <div className="radar-circle rc-2" />
              <div className="radar-circle rc-3" />
              <div className="radar-axis-h" />
              <div className="radar-axis-v" />
              <div className="radar-sweep" />
            </div>
          </div>
          <div className="departure-section section-wrap">
            <TripEntry />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
