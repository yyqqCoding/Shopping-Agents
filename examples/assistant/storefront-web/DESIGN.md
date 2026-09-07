# 户外装备助手界面

## Surfaces
The welcome route is an editorial scrolling experience. `/equipment` is a searchable public catalog, `/equipment/[id]` shows a product and its specifications, and `/chat` is an operational workspace. Public pages pass questions as drafts. Only an explicit send invokes the assistant.

## Visual system
`app/design.css` owns composition and overrides the shared foundations in `app/globals.css`. Pine ink `#193c31`, stone ground `#f5f6f2`, pale green surfaces and trail yellow `#d5ed87` connect public pages and the workspace. The welcome page alternates landscape imagery, open equipment grids and a deep-green narrative section. Equipment photography has a neutral backdrop and uses contain fitting; landscapes use cover fitting.

The self-hosted Outdoor Display subset of Noto Serif SC is used for Chinese editorial headings. Interface labels, data and conversation text use the existing Chinese sans stack. Body copy uses 18–20 px equivalents and conversation text uses 20 px on desktop and 18 px on mobile. Most controls and metadata use 16–18 px equivalents; peripheral notes stay at 14–15 px. Font sizes use rem units for browser font preferences. Shared chat utility sizes are overridden only within the outdoor workspace. Prices use tabular numerals. The brand mark has its own background, foreground and accent colors, independent of navigation text color. Cards have 8–12 px corners; circular controls are reserved for compact actions. Public equipment cards use open typography beneath an image rather than an outer card border.

## Motion
The hero settles once and drifts gently with scrolling. Its lower edge blends into the deep-green journey section, avoiding a pale gap between the landscape and the next screen. Journey photographs open with a one-time crop transition on entry. The packing narrative keeps the equipment board beside successive chapters on desktop, repositioning equipment as the active chapter changes. Mobile places chapters and the board in normal document flow. Product photography scales subtly on hover. Native cross-document view transitions progressively enhance matching product imagery where supported. Workspace scenario entries stagger briefly; new messages and presentation cards enter with a short translation. Buttons and directional icons respond to interaction. Scroll work is scheduled through animation frames and cleaned up on navigation. Cart feedback follows server confirmation. Reduced-motion CSS removes spatial animation.

## Responsive behavior
Public layouts use a bounded content width with 56 px desktop and 20 px mobile page gutters. Equipment grids reduce from four to two columns. Detail pages change from paired columns to a vertical image and specification flow. The assistant uses a collapsible desktop history sidebar and native mobile dialogs. Mobile input respects the keyboard viewport and safe-area inset.

## Delivery boundary
No tests, builds or automated visual review are run for frontend-only refinements, as requested by the user. The typography and hero refinements were reviewed against source and supplied screenshots; live browser inspection could not complete because the connection timed out. Visual acceptance occurs on the deployed server. This document records implementation choices, not a verification verdict.
