# 户外装备助手界面

## Surfaces
The welcome route is the departure table: a prompt slip writes a trip, equipment prints land on a cloth, and a packing list ticks itself. `/equipment` is a searchable public catalog, `/equipment/[id]` shows a product and its specifications, and `/chat` is an operational workspace. Public pages pass questions as drafts. Only an explicit send invokes the assistant.

## Visual system
`app/globals.css` carries the shared foundations, `app/design.css` the compatibility layer, and `app/redesign.css` owns the current composition. A light canvas ground `#efede6`, paper `#fffdf8`, pine ink `#1c3a2e` and safety orange `#d8541c` connect the public site and conversation workspace. Orange text uses the darker `#b3420e`. Weave is limited to a faint layer at the bottom of the hero. Equipment photographs sit in rounded paper frames with soft contact shadows.

`HeroTable` reuses the original camping, hiking and mountain photographs in full-width background layers. A light veil protects text contrast and fades the landscape into the page below. Three scene buttons select an example and its background without submitting or replacing the visitor's draft. The equipment and packing list occupy the right side of the desktop composition.

The floating header, prompt slip and scene selector use translucent surfaces and bounded backdrop blur. The header becomes more opaque after 24px of scroll. “开始准备” is a substantial pill with a separate circular arrow. Shared corners are 20px for cards, 12px for smaller controls and 28px for panels; photograph interiors follow their frames. Input focus belongs to the rounded field, without a second rectangular outline inside it. Keyboard focus remains visible on buttons and links.

Public body text starts at 18px, with supporting labels at 16–17px. Conversation product cards use compact metadata around a larger title, price and recommendation. `public/fonts/field-display.otf` is a self-hosted subset of Noto Sans CJK SC Black (OFL, credited beside it) for Chinese display headings. Prices and totals use tabular numerals.

Recommendations use horizontal cards with a rounded image, recommendation reason, differentiating attributes, selected specification and explicit actions. Identical delivery promises appear once beneath a group. Products with options hand specification selection to the assistant. Comparisons use an accessible table: named attributes align across products, while advantages and cautions retain their supplied prose. Recommended products receive a restrained column highlight. Missing information is not inferred from the position of an item in a prose list.

## Motion
The homepage has a conspicuous entrance: masked heading lines rise into view and equipment prints fly in from different directions, rotate and settle into depth. The prompt slip types an example trip; each completed phrase lands an item and ticks its packing-list row, ending on the orange 还缺 row and a running total. The trip rests, then the slip erases and the next one begins. Previous equipment stays visible until the next trip's first print lands.

The landscape crossfades over 1.8 seconds and slowly changes framing. The equipment stage drifts gently and responds to the desktop pointer through bounded depth transforms. Scene cards fan into place on scroll where native scroll timelines are supported; other browsers retain the composed layout. Primary links have bounded pointer attraction. Hover states lift photographs and cards; cart feedback runs only after the server confirms an addition.

Selecting a scene, pausing playback or focusing the draft settles the current example and stops automatic cycling. Playback can resume while the draft is empty. Typewriter timers and continuous scene motion pause when the hero leaves the viewport or the document is hidden. Pointer updates use animation frames outside React rendering and stop when movement settles. Blur stays fixed on glass surfaces.

Heading entrance runs from first paint. `LandingMotion` marks on-screen reveal targets before enabling their transitions. Content remains visible without scripts. `prefers-reduced-motion` removes automatic typing, scene and hover movement, pointer attraction and animated entrances while keeping manual scene selection and keyboard navigation. Preference changes apply while the page is open.

## Desktop layout
Desktop is the design and review target. Public content uses 48px side gutters and a maximum width of 1600px; the conversation content limit is 1280px. Scene photographs use a 4:3 ratio, the departure form spans two columns and the footer distributes content across the page. Recommendation grids show two columns when their container is at least 820px wide. Explicit carousel and list payloads retain those layouts. Existing narrow-screen fallbacks remain in place without adding a mobile acceptance requirement.

## Delivery boundary
Frontend changes preserve the existing routes, catalog sources, assistant handoffs, server-confirmed cart writes and native dialog semantics. Presentation is owned by `app/redesign.css` and the storefront components. No animation dependency is required. The user deploys and visually reviews this work; automated tests and a production build are outside this visual delivery's requested scope.
