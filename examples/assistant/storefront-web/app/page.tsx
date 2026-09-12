import { equipment, equipmentById } from "@/lib/catalog";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { LandingMotion, type HeroKit } from "@/components/LandingExperience";
import { LandingPage } from "@/components/landing/LandingPage";
import "./landing.css";

const galleryScenes = [
  {
    image: "hiking",
    alt: "穿行于松林和岩石之间的山间小径",
    title: "走进山里",
    copy: "日间徒步，少一点负担，多一点沿途风景。",
    coord: "31°14'N · 118°22'E",
    elev: "+1,420M",
    prompt:
      "准备一天的近郊徒步，已有徒步鞋，预算 700 元。帮我挑背包、水壶和备用头灯，尽量轻便。",
  },
  {
    image: "camping",
    alt: "林间空地上的帐篷",
    title: "把夜晚留给自然",
    copy: "周末露营，找一片静谧空地，安放整个周末。",
    coord: "30°18'N · 119°26'E",
    elev: "+840M",
    prompt:
      "两个人春秋自驾露营一晚，预计最低 10°C，预算 2000 元，已有餐具。帮我搭配帐篷和睡眠装备。",
  },
  {
    image: "lightweight",
    alt: "山野光线中的轻便背包与水壶",
    title: "轻一点，走远一点",
    copy: "轻量出行，把真正需要的硬核装备装进背包。",
    coord: "29°42'N · 120°10'E",
    elev: "+1,860M",
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
  const hallPicks = [
    "OD-8002",
    "OD-3001",
    "OD-7005",
    "OD-5002",
    "OD-2003",
    "OD-4005",
    "OD-6001",
    "OD-3006",
  ].map((id) => equipmentById(id)!);
  const compare = ["OD-1001", "OD-1002"].map((id) => equipmentById(id)!);

  return (
    <>
      <LandingMotion />
      <SiteHeader overlay />
      <main id="main-content" className="editorial-home">
        <LandingPage
          kits={kits}
          hallPicks={hallPicks}
          galleryScenes={galleryScenes}
          compare={compare}
          equipmentCount={equipment.length}
        />
      </main>
      <SiteFooter />
    </>
  );
}
