"use client";
import Link from "next/link";
import { useStoreFrame } from "web-shared";
import { Arrow } from "./SiteChrome";

const STARTERS = [
  {
    image: "camping",
    title: "把周末留在山野",
    description: "两人露营，从帐篷到睡眠系统。",
    prompt:
      "两个人周末自驾露营一晚，春秋季节预计最低 10°C，预算 2000 元。已有餐具，帮我配一套帐篷和睡眠装备。",
  },
  {
    image: "hiking",
    title: "轻装走一段山路",
    description: "日间徒步，让每一件都刚好。",
    prompt:
      "准备一天的近郊徒步，已有徒步鞋，预算 700 元。想选一个背包、水壶和备用头灯，尽量轻便。",
  },
  {
    image: "lightweight",
    title: "把选择看得更清楚",
    description: "比较参数，也聊聊取舍。",
    prompt:
      "比较 1000 元以内的双人徒步帐篷。我更看重轻量和收纳，也想知道减轻重量会牺牲什么。",
  },
];
export default function HomeView() {
  const { ask, chat } = useStoreFrame();
  const ready = Boolean(chat?.ready && !chat.busy);
  return (
    <div className="assistant-welcome">
      <div className="assistant-welcome-heading">
        <h2>
          下一次，
          <br />
          想去哪里走走？
        </h2>
        <p>
          告诉我你的行程、人数和预算。
          <br />
          我们从一件装备开始，也可以一起准备完整清单。
        </p>
      </div>
      <div className="assistant-scenarios">
        {STARTERS.map((item) => (
          <button
            key={item.image}
            type="button"
            disabled={!ready}
            onClick={() => ask(item.prompt)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/images/${item.image}.webp`}
              alt=""
              width={1024}
              height={1536}
              loading="lazy"
            />
            <span className="assistant-scenario-copy">
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </span>
            <Arrow diagonal />
          </button>
        ))}
      </div>
      <div className="assistant-explore">
        <div>
          <strong>还没有具体计划？</strong>
          <p>先看看装备，也许灵感就在下一件。</p>
        </div>
        <Link href="/equipment">
          逛逛装备目录 <Arrow />
        </Link>
      </div>
    </div>
  );
}
