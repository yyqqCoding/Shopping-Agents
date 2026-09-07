import Link from "next/link";
import OutdoorMark from "@/components/OutdoorMark";

function Landscape() {
  return (
    <div className="welcome-landscape">
      <svg viewBox="0 0 800 760" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden className="landscape-art">
        <defs>
          <linearGradient id="welcome-sky" x1="400" y1="0" x2="400" y2="760" gradientUnits="userSpaceOnUse">
            <stop stopColor="#e3ece4" /><stop offset="1" stopColor="#c9d8ca" />
          </linearGradient>
          <linearGradient id="welcome-mountain" x1="300" y1="220" x2="600" y2="680" gradientUnits="userSpaceOnUse">
            <stop stopColor="#799b83" /><stop offset="1" stopColor="#416e5b" />
          </linearGradient>
        </defs>
        <rect width="800" height="760" rx="36" fill="url(#welcome-sky)" />
        <g className="landscape-contours" stroke="#6c917b" strokeWidth="1" opacity=".18">
          <path d="M-100 320C80 70 120 220 300 100S530 90 690-40M-90 352C80 102 130 250 310 132S550 122 710-10M-80 384C80 134 140 280 320 164S570 154 730 20M-70 416C80 166 150 310 330 196S590 186 750 50M-60 448C80 198 160 340 340 228S610 218 770 80" />
          <path d="M500 810c-100-260 110-180 90-400S850 390 860 120M460 820c-100-260 100-190 80-410S810 370 820 100M420 830c-100-260 90-200 70-420S770 350 780 80" />
        </g>
        <circle className="landscape-sun" cx="590" cy="150" r="51" fill="#f4cf85" />
        <g className="landscape-cloud" fill="#f3f6ee" opacity=".7">
          <path d="M85 172c0-12 10-20 21-19 6-25 42-23 47 1 18-5 34 9 33 24H85z" />
          <path d="M400 105c0-9 7-15 15-14 5-18 31-17 35 1 13-4 25 7 24 18h-74z" />
        </g>
        <path d="m0 412 122-130 95 92 161-211 126 178 89-93 207 201v311H0z" fill="#a1b6a2" />
        <path d="m265 310 113-147 91 129-61-32-30 18-34-29z" fill="#e9eee3" opacity=".88" />
        <path d="M0 467 122 282l95 192 161-247 113 205 102-138 207 217v249H0z" fill="url(#welcome-mountain)" />
        <path d="M0 564c173-125 285-19 405-55 149-46 213-148 395-50v301H0z" fill="#315e4e" />
        <path d="M0 677c208-39 262-193 438-124 179 71 216 20 362 37v170H0z" fill="#234a3f" />
        <path d="M493 760c-10-64-116-51-97-98 22-53 127-20 137-67 6-29-78-36-56-71 12-20 49-19 65-42" stroke="#173e34" strokeWidth="23" strokeLinecap="round" />
        <path className="landscape-trail" d="M493 760c-10-64-116-51-97-98 22-53 127-20 137-67 6-29-78-36-56-71 12-20 49-19 65-42" stroke="#e7ba75" strokeWidth="3" strokeLinecap="round" strokeDasharray="7 10" />
        <g transform="translate(535 431)">
          <path d="m-39 43 37-57 42 57z" fill="#e5a55f" /><path d="m-2-14 4 57h38z" fill="#c8864b" />
          <path d="m-14 43 12-30 15 30z" fill="#284e3e" /><path d="M-46 45h93" stroke="#173e34" strokeWidth="3" strokeLinecap="round" />
        </g>
        <g fill="#173e34">
          <path d="m125 561-24 40h15l-21 34h22v26h16v-26h22l-21-34h15zM178 581l-17 30h10l-15 24h16v20h12v-20h16l-15-24h10zM672 463l-21 36h13l-19 31h20v24h14v-24h20l-19-31h13z" />
        </g>
        <circle cx="493" cy="706" r="7" fill="#f7f4e9" /><circle cx="493" cy="706" r="17" stroke="#f7f4e9" strokeOpacity=".35" />
      </svg>
      <div className="landscape-note"><span className="landscape-note-dot" /><span>下一站，山野之间</span></div>
      <div className="landscape-caption"><span>沿着自己的节奏</span><strong>去走一段新的路。</strong></div>
      <span className="landscape-compass" aria-hidden>北 ↑</span>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <main className="welcome-page">
      <header className="welcome-header">
        <Link href="/" className="outdoor-wordmark"><OutdoorMark className="outdoor-mark" /><span>户外装备助手</span></Link>
        <span className="welcome-header-note">徒步 · 露营 · 轻量出行</span>
        <Link href="/chat" className="welcome-header-link">进入助手 <span aria-hidden>↗</span></Link>
      </header>
      <section className="welcome-hero" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <p className="welcome-eyebrow"><span /> 为每一次出发，做好准备</p>
          <h1 id="welcome-title">下一次出发，<br />从<span className="welcome-title-accent">一份好装备</span><br />开始。</h1>
          <p className="welcome-description">山野很大，准备可以简单一点。<br />聊聊你的行程、人数和预算，<br className="welcome-mobile-break" />一起挑装备、比参数、配清单。</p>
          <Link href="/chat" className="welcome-cta">进入户外助手 <span aria-hidden>→</span></Link>
          <div className="welcome-scenarios" aria-label="适合的出行场景"><span>日间徒步</span><span>周末露营</span><span>轻量出行</span></div>
        </div>
        <Landscape />
      </section>
      <footer className="welcome-footer">
        <div><span>01</span> 从需求挑装备</div><div><span>02</span> 把差异讲清楚</div><div><span>03</span> 一起配好出行清单</div>
        <p>虚构商品体验 · 不下单，不扣款</p>
      </footer>
    </main>
  );
}
