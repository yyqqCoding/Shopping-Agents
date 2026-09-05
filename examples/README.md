# examples

The runnable demo: `assistant/` is the shopping agent chat-only over the mock retail
catalog in its `data/`, hosted for a single page. `python scripts/run_demo.py` starts it;
the assistant's README lists its ports and prompts to try.

## Layout

| Path | Contents |
|---|---|
| `demo_common/` | Host code the demo API is built from: app and middleware (`host.py`), session store (`sessions.py`), storefront routes (`storefront.py`), memory routes and fixture seeder (`memory.py`), mock-backend helpers (`storefront_fixtures.py`) |
| `web-shared/` | The npm package the web app imports: the API client, the session and turn hooks, the event types (`protocol.ts` mirrors `commerce_common/streaming.py`), the transcript and inspector components, shared primitives and icons, and the app frame (`storefront/`) |
| `package.json` | The npm workspace: `web-shared` plus `assistant/storefront-web` (`npm ci` installs both) |
| `assistant/api/` | One FastAPI process: the mock backend (`mock_retail.py`) and the demo_common routes |
| `assistant/data/` | The fixtures the backend loads, listed in the assistant's README |
| `assistant/storefront-web/` | The Next.js app: the demo's cards, views, and tokens over `web-shared`; the product photos in `public/products/` |

Sessions and carts live in one process's memory in `demo_common`, so the demo runs one
worker.

`web-shared` holds the session, streaming, and rendering plumbing once. The app holds its
own components: `components/generative/` has one entry per presentation tool, typed by
the app's `lib/types.ts`, so the frontend is one build of the payload schemas
(`shopping_agent/tools/presentation.py`); a deployment's frontend is a second.

## Identity

A session starts by naming a profile from `data/users.json` (`POST /api/session`). Every
later request carries only the session id, in `X-Session-Id`, and the routes read the
principal from it.

## Environment variables

| Variable | Effect | Read in | Default |
|---|---|---|---|
| `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` | Chat credentials; the demo's `.env` files win over ambient exports (the assistant loads with `override`) | `demo_common/host.py` | unset (client credential chain) |
| `COMMERCE_DEMO_AUTH` | `sdk` skips the `.env` files and clears the key variables so the client's credential chain is used; `run_demo.py --federated` sets it | `demo_common/host.py` | unset |
| `DEMO_ALLOWED_HOSTS` | Comma-separated Host values the API answers to besides `localhost` and `127.0.0.1` | `demo_common/host.py` | unset |
| `DEMO_LOG_LEVEL` | `INFO` writes one line per model call; `DEBUG` adds each request and response | `demo_common/host.py` | `INFO` |
| `NEXT_PUBLIC_API_URL` | Where the web app sends its requests; `run_demo.py` sets it to the port the API came up on | `assistant/storefront-web/lib/api.ts` | `http://localhost:8004` |

The API reads its variables at startup; the web app takes the `NEXT_PUBLIC_` values when
it is built or its dev server starts.
