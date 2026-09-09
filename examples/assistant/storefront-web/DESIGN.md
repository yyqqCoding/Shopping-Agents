# 户外装备助手界面

## Surfaces
The welcome route is an editorial scrolling experience. `/equipment` is a searchable public catalog, `/equipment/[id]` shows a product and its specifications, and `/chat` is an operational workspace. Public pages pass questions as drafts. Only an explicit send invokes the assistant.

## Visual system
`app/design.css` owns the compatibility layer and `app/redesign.css` owns the current composition on top of the shared foundations in `app/globals.css`. Pine ink `#173a2d`, stone ground `#f3f5f0`, pale green surfaces and trail yellow `#d9f292` connect public pages and the workspace. The welcome page uses a wide editorial hero, an asymmetric journey grid, a dark packing narrative and a featured equipment composition. Equipment photography has a neutral backdrop and uses contain fitting; landscapes use cover fitting.

The self-hosted Outdoor Display subset of Noto Serif SC is used for Chinese editorial headings. Interface labels, data and conversation text use the existing Chinese sans stack. Body copy uses 18–20 px equivalents and conversation text uses 20 px on desktop and 18 px on mobile. Most controls and metadata use 16–18 px equivalents; peripheral notes stay at 14–15 px. Font sizes use rem units for browser font preferences. Shared chat utility sizes are overridden only within the outdoor workspace. Prices use tabular numerals. The brand mark has its own background, foreground and accent colors, independent of navigation text color. Cards have 8–12 px corners; circular controls are reserved for compact actions. Public equipment cards use open typography beneath an image rather than an outer card border.

## Motion
The hero settles once and the header changes state when the hero leaves the viewport. Public sections, journey cards and packing chapters use one-time IntersectionObserver reveals with short opacity and transform transitions. The packing narrative keeps the equipment board beside successive chapters on desktop, repositioning equipment as the active chapter changes. Mobile places chapters in normal document flow. Product photography scales subtly on hover. Native cross-document view transitions progressively enhance matching product imagery where supported. Workspace scenario entries use a large featured prompt beside two compact prompts. Buttons, directional icons and the cart canvas respond to interaction. No raw scroll listener drives presentation motion. Cart feedback follows server confirmation. Reduced-motion CSS removes spatial animation.

## Responsive behavior
Public layouts use a bounded content width with 48 px desktop and 16 px mobile page gutters. Equipment grids reduce from four to three, two and one columns. Detail pages change from paired columns to a vertical image and specification flow. The assistant uses a collapsible desktop history sidebar and native mobile dialogs. The desktop cart is a centered planning canvas; on mobile it becomes a bottom sheet. Mobile input respects the keyboard viewport and safe-area inset.

## Delivery boundary
Frontend changes preserve the existing routes, catalog sources, assistant prompts, server-confirmed cart writes and native dialog semantics. The redesigned system is implemented in `app/redesign.css` so the shared foundation remains available to commerce components. TypeScript checking and the Next.js production build pass locally; automated detector review reports no findings. Visual acceptance should still include a quick browser pass at desktop and mobile widths.
