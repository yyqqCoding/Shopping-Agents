import type { ReactNode } from "react";

const SHAPES: Record<string, ReactNode> = {
  "outdoor-shelter": <><path d="m18 72 39-51 43 51zM57 21l7 51M37 72l20-31 19 31M15 77h88" /><path d="m23 65-8 7m78-9 11 9" /></>,
  "outdoor-sleep": <><rect x="34" y="14" width="53" height="72" rx="19" /><path d="M38 35h44M40 47h34M40 60h34M40 73h34M79 38v38" /><rect x="47" y="20" width="27" height="10" rx="5" /></>,
  "outdoor-packs": <><rect x="34" y="25" width="52" height="57" rx="14" /><path d="M48 25v-7h24v7M34 37h52M43 28v18m34-18v18M34 44H23v26h11M86 44h11v26H86" /><rect x="43" y="51" width="34" height="23" rx="5" /><path d="M50 57h20" /></>,
  "outdoor-apparel": <><path d="m43 20-20 13-10 30 15 6 9-21v34h46V48l9 21 15-6-10-30-20-13z" /><path d="m43 20 17 14 17-14M60 34v48M43 64h8m18 0h8M52 24l8 10 8-10" /></>,
  "outdoor-footwear": <><path d="m32 22 26 4 7 29 27 7q15 4 14 17H16V64l13-10z" /><path d="M17 70h87M36 39l23 3M35 47l26 3M35 55l29 3M43 28l-4 29M26 58l9 7" /></>,
  "outdoor-lighting": <><path d="M48 21v-5a12 12 0 0 1 24 0v5M38 31h44l7 46H31zM38 25h44v6H38zM30 77h60v8H30zM48 34l-4 40M72 34l4 40" /><path d="m56 43 8-3-4 12h7L54 66l4-13h-6z" /></>,
  "outdoor-cooking": <><path d="M29 36h61v35a11 11 0 0 1-11 11H40a11 11 0 0 1-11-11zM90 44h9a13 13 0 0 1 0 26h-9M25 31h68M52 31v-7h15v7M37 43v24" /><path d="M47 13q-6-5 0-10m16 12q-6-5 0-10" /></>,
  "outdoor-accessories": <><path d="m32 17 12 3-2 17-10-2zM37 36l-9 47M24 77l12 3M27 82l-1 7M73 20l12-4 5 16-11 4zM84 35l13 47M88 79l15-4M97 82l2 6" /><path d="M51 70h26M56 64v12m15-12v12" /></>,
};

export default function EquipmentIllustration({ category }: { category?: string | null }) {
  return (
    <svg viewBox="0 0 120 100" fill="none" aria-hidden>
      <circle cx="60" cy="50" r="42" fill="currentColor" opacity=".045" />
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {SHAPES[category ?? ""] ?? <><path d="M30 34h60l-5 49H35zM46 34v-8a14 14 0 0 1 28 0v8" /><path d="m50 62 8-11 12 16" /></>}
      </g>
    </svg>
  );
}
