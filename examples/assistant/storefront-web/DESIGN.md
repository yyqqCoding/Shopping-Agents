# 户外装备助手界面

## Surfaces
The welcome route is the departure table: a prompt slip writes a trip, equipment prints land on a cloth, and a packing list ticks itself. `/equipment` is a searchable public catalog, `/equipment/[id]` shows a product and its specifications, and `/chat` is an operational workspace. Public pages pass questions as drafts. Only an explicit send invokes the assistant.

## Visual system
`app/globals.css` carries the shared foundations, `app/design.css` the compatibility layer, and `app/redesign.css` owns the current composition. The world is a flat lay on canvas: cloth `#ddd5c6` under a daylight radial and a 6px weave tile, pine ink `#1c3a2e` for type, bone paper `#f8f4eb` for slips, and one safety orange `#d8541c` (`#b3420e` where it must carry text) for the pen and the missing item. Two materials, one grammar: `.print` is a photograph with a contact shadow that sits tilted on the cloth, `.paper` is a sheet with a deeper shadow, and everything else is spacing and rule.

The whole public site is a single ground — no tonal bands, no dark sections. The header is transparent over the cloth and the footer is a 2px ink rule on it. Three weights, no eyebrows or kickers: headings and product titles are the display voice, body 17–20px, secondary 16–17px, nothing below 16px on the home page. `public/fonts/field-display.otf` is a self-hosted subset of Noto Sans CJK SC Black (OFL, credited beside it) used for Chinese display type, with `.tabular` numerics for prices and totals. Corners stay at 2px so a print reads as paper, never as a card. The hero keeps three prints on the cloth at all times: the previous trip's prints stay until the next lands.

## Motion
One authored moment: things land on the cloth. Prints arrive with `@keyframes land` — down 24px, blurred and over-rotated, settling into `--tilt` — staggered by `--i` on the exponential ease-out. The landing is caused, not decorative: the prompt slip types itself with a blinking pen, each completed phrase drops the gear that answers it, and every landed print ticks one line of the packing list, ending on the orange 还缺 row and a running total. The trip rests, then the slip erases and the next one begins.

Entrance animation runs from first paint on `[data-hero]`, so the hero never blinks after hydration. `LandingMotion` marks on-screen `[data-reveal]`/`[data-land]` elements visible synchronously before adding `.motion-ready`, so content is visible without scripts and nothing flashes in. `prefers-reduced-motion` removes the typewriter, the pen, the landing and the reveals, leaving the first trip composed and all prints in place.

## Responsive behavior
Public layouts use a bounded content width with generous desktop gutters and 16–24px mobile gutters. On the cloth the packing list takes grid order above the prints below 820px, so the list and its ticks are inside the first mobile fold; the featured grid offsets every other card on desktop and goes single-column on mobile. The slip keeps a fixed multi-line height so the typewriter never shifts layout. The assistant uses a collapsible desktop history sidebar and native mobile dialogs; on mobile the cart becomes a bottom sheet and the composer respects the keyboard viewport and safe-area inset.

## Delivery boundary
Frontend changes preserve the existing routes, catalog sources, assistant prompts, server-confirmed cart writes and native dialog semantics. The redesign lives in `app/redesign.css` and the landing components, with `app/design.css` reduced to the catalog, detail and chat compatibility layer. TypeScript checking and the Next.js production build pass locally. Review captures live uncommitted under `.impeccable/review/`.
