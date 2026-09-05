# assistant — the shopping agent, chat-only

The shopping agent's full feature set (every tool, skill, memory, and generative card)
over the mock retail catalog in `data/`, hosted for a single chat page with none of the
store chrome. This is the page to open when showing someone what the shopping agent does.

    python scripts/run_demo.py            # API :8004 + web :3004
    python scripts/run_demo.py --fresh-memory

## Layout

- `api/main.py` — one FastAPI process: `MockRetail` (`api/mock_retail.py`, a
  `StorefrontBackend` over the fixtures in `data/`) + `ShoppingAgent` + demo_common's
  shared storefront host and the direct add-to-cart route. Memory is file-backed under
  `data/` (gitignored) and seeded once per user from `data/memory-seed.json`.
- `storefront-web/` — one Next.js page on `web-shared`'s `StoreShell`: the conversation
  with the six shopping generative cards, the cart panel, and the Activity inspector
  (tool trace + memory). The product photos live in `storefront-web/public/products/`
  and the app serves them directly. `lib/api.ts` points at the API
  (`NEXT_PUBLIC_API_URL`, default `http://localhost:8004`).

## Try

- "A tent for a first family camping trip, under $250" — search, product cards, add to cart
- "Compare the two you like most" — comparison card with the server's price delta
- "Plan the whole trip" — plan card with per-step products and the budget bar
- "Where is my order?" — order status card with the delivery rail
- "Remember I'm usually a size medium" — then open the avatar sheet to see (and edit) memory
- "Check out my cart" — the staged checkout summary; nothing is charged

## Your own API or gateway

The agent's client is the Anthropic SDK, which reads `ANTHROPIC_BASE_URL`,
`ANTHROPIC_API_KEY`, and `ANTHROPIC_AUTH_TOKEN` from the environment (or a `.env` here or
at the repo root — the repo's `.env.example` lists every knob) — pointing the demo at
your own endpoint needs no code change. This demo's `.env` files take precedence over
ambient `ANTHROPIC_*` variables already in the shell, so a machine-wide export (another
tool's gateway) cannot shadow the demo's configuration. The endpoint must speak the
Anthropic Messages
API: the SDK posts to `{ANTHROPIC_BASE_URL}/v1/messages` with SSE streaming, so write
the base URL without `/v1`. An OpenAI-format endpoint (`/v1/chat/completions`) does not
work; a multi-format gateway must expose its Anthropic-compatible endpoint. Everything
the agent sends (prompt-caching markers, `eager_input_streaming`, `thinking`) is
ordinary request JSON.

    # examples/assistant/.env
    ANTHROPIC_BASE_URL=https://your-gateway.example.com
    ANTHROPIC_AUTH_TOKEN=sk-...        # Bearer token; or ANTHROPIC_API_KEY for x-api-key
    SHOPPING_MODEL=claude-sonnet-5     # only when the gateway serves its own model ids
    SHOPPING_MEMORY_MODEL=claude-haiku-4-5
    SHOPPING_THINKING_EFFORT=low       # low, medium, high, xhigh, max, or off

`SHOPPING_MEMORY_MODEL` runs the post-turn memory extraction; when it names a model the
gateway doesn't serve, chat still works but nothing new is remembered.
