# 户外装备助手界面

## Surfaces
The welcome route is an editorial scrolling experience. `/equipment` is a searchable public catalog, `/equipment/[id]` shows a product and its specifications, and `/chat` is an operational workspace. Public pages pass questions as drafts. Only an explicit send invokes the assistant.

## Visual system
`app/design.css` owns composition and overrides the shared foundations in `app/globals.css`. Pine ink `#193c31`, stone ground `#f5f6f2`, pale green surfaces and trail yellow `#d5ed87` connect public pages and the workspace. The welcome page alternates landscape imagery, open equipment grids and a deep-green narrative section. Equipment photography has a neutral backdrop and uses contain fitting; landscapes use cover fitting.

The self-hosted Outdoor Display subset of Noto Serif SC is used for Chinese editorial headings. Interface labels, data and conversation text use the existing Chinese sans stack. Prices use tabular numerals. Cards have 8–12 px corners; circular controls are reserved for compact actions. Public equipment cards use open typography beneath an image rather than an outer card border.

## Motion
The hero settles once. The packing narrative keeps the equipment board beside successive chapters on desktop, repositioning equipment as the active chapter changes. Mobile places chapters and the board in normal document flow. Product photography scales subtly on hover. Native cross-document view transitions progressively enhance matching product imagery where supported. Workspace actions use short state transitions. Cart feedback follows server confirmation. Reduced-motion CSS removes spatial animation.

## Responsive behavior
Public layouts use a bounded content width with 56 px desktop and 20 px mobile page gutters. Equipment grids reduce from four to two columns. Detail pages change from paired columns to a vertical image and specification flow. The assistant uses a collapsible desktop history sidebar and native mobile dialogs. Mobile input respects the keyboard viewport and safe-area inset.

## Delivery boundary
No tests, builds, browser inspection or automated visual review were run for this redesign, as requested by the user. Visual acceptance occurs on their deployed server. This document records implementation choices, not a verification verdict.
