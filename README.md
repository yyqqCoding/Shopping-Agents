# Shopping Agent

A shopping agent built on Claude that a business embeds in its app for customers. The
agent is defined once (prompt, skills, tool contracts, gates) and runs on the Messages
API; a Chinese outdoor equipment demo shows search, comparisons and coordinated plans
over a fictional CNY catalog.

> [!NOTE]
> Every product and person here is fictional. The outdoor demo uses unbranded equipment;
> the retired catalog remains available for historical conversations.
> Nothing places an order or charges a card: `checkout` renders the cart for the host to
> complete. Business rules, authorization, and compliance are the deployment's.

## Quick start

Python 3.11+ and Node 22.15+. From the repo root:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt       # the three packages and their pinned dependencies
cp .env.example .env                  # fill model and Supabase values; see docs/deployment.md
(cd examples && npm ci)               # the web app and its shared package share one workspace
python scripts/run_demo.py            # API :8004 + web :3004
```

The demo opens on an animated welcome page at `/`; its entry button opens `/chat`.
It uses Supabase anonymous identity, with no login screen. Enable anonymous sign-ins
and apply [`001_agent_experience.sql`](supabase/migrations/001_agent_experience.sql), then
[`002_outdoor_cart_currency.sql`](supabase/migrations/002_outdoor_cart_currency.sql), once
each before opening a conversation. Existing installations apply only the new migration
with the API stopped. The public catalog can be browsed without Supabase.
[`docs/deployment.md`](docs/deployment.md#中文体验站) covers configuration and HTTPS hosting.

## The agent

The shopping agent searches, compares, plans, fills the cart, answers order and policy
questions, and remembers what a customer tells it. Its flows are the skills in
[`shopping-agent/skills/`](shopping-agent/skills/); a deployment implements
[`StorefrontBackend`](shopping-agent/core/shopping_agent/backend.py) over its catalog,
cart, order, and policy systems.

## Layout

| Directory | Contents | pip package, `import` name |
|---|---|---|
| [`commerce-common/`](commerce-common/) | What the agent builds on: config, fencing, memory, skills, grounding, presentation, executor frame, events | `commerce-common`, `commerce_common` |
| [`shopping-agent/core/`](shopping-agent/core/) | Shopping types, `StorefrontBackend`, prompt, tool contracts, gates, executor | `shopping-agent-core`, `shopping_agent` |
| [`shopping-agent/runtime-messages-api/`](shopping-agent/runtime-messages-api/) | `ShoppingAgent`, the turn loop on the Messages API | `shopping-agent-runtime`, `shopping_agent_runtime` |
| [`shopping-agent/skills/`](shopping-agent/skills/) | The flows, one `SKILL.md` each | — |
| [`examples/`](examples/) | The demo (`assistant/`), shared host code (`demo_common/`), shared web code (`web-shared/`) | — |
| [`docs/`](docs/) | Safety rules, backend integration, deployment, [experience design](docs/agent-experience-design.md) and [verification](docs/agent-experience-verification.md) | — |
| [`scripts/`](scripts/) | Install, run and verify commands; `outdoor_catalog.py` authors equipment and `prepare_catalog.py` freezes the catalog and evidence | — |
| [`deploy/`](deploy/) | API and Web containers, Caddy HTTPS/SSE proxy | — |
| [`supabase/`](supabase/) | Conversation, ordered memory and quota storage; cart currency migration | — |

## Running the agent

The Messages API loop; the demo API is a host application around it:

```python
from pathlib import Path

from shopping_agent import ShoppingAgentConfig
from shopping_agent_runtime import ShoppingAgent

agent = ShoppingAgent(backend=your_backend, skills_dir=Path("shopping-agent/skills"),
                      config=ShoppingAgentConfig(brand_name="Your Store"))
async for event in agent.stream_turn(messages, session, state):
    ...   # text_delta, tool_call, ui, cart_update, turn_complete
await agent.update_memory(messages, session)   # memory extraction
```

The demo verifies a Supabase bearer token on every private request; `X-Session-Id`
selects a conversation belonging to that visitor. New conversations share long-term
preferences and keep separate history, working context and carts.

## Safety

Fencing, provenance gates, caps, and memory validation run inside the tool call;
grounding and memory extraction are runtime features. [`docs/safety.md`](docs/safety.md)
lists each rule with its module. The demo enforces anonymous ownership, version checks,
request deduplication and model quotas. The API accepts loopback host names and the
configured deployment domain.

## Verify

```bash
ruff check . && ruff format --check . && pytest
python scripts/verify_all.py          # adds catalog validation, Node tests and the web build
python scripts/smoke_chat.py          # legacy shopping scenarios; needs the API, model and Supabase
```

`requirements-dev.txt` adds pytest and ruff. CI installs from it on two Python versions,
builds the web app, and checks that the package names stay unregistered on the public
index (the pin files install them from their directories, never from the index). To
confirm caching, read `cache_read_input_tokens` from `turn_complete`, or the line each
model call logs on the runtime's logger: zero on a second turn means the prefix changed.

[Examples verification](examples/README.md#验证) covers browser and optional database
checks. [Experience verification](docs/agent-experience-verification.md) records the
implemented behavior, local evidence and remaining deployment checks. Catalog-specific
tests and the browser smoke script retain the old catalog and layout assertions, and
the live smoke script keeps its old scenarios. They have not been rewritten for the
outdoor experience.

## Deploying elsewhere

[`deploy/`](deploy/) hosts the Chinese experience under one HTTPS domain. Clone `main`
for the first deployment, then pull updates and rebuild the containers;
[`GitHub deployment`](docs/deployment.md#github-首次部署) covers the server setup and update commands.
The runtime takes any `anthropic` client as `client=`;
[`docs/deployment.md`](docs/deployment.md) covers GCP Vertex AI, AWS Bedrock, Microsoft
Foundry, and gateways.

## MCP connectors

None ship; the agent reaches your systems through the backend interface. Where an
official connector is the source of record, it is the integration target: analytics
warehouses (Snowflake, BigQuery, Databricks, Amplitude), finance (Stripe, Square, PayPal,
QuickBooks), delivery (Slack, Google Drive, Gmail). A commerce platform's own MCP server
for catalog, cart, or checkout is called from a backend method server-side, and the
provenance gates stay in front of every write.

## Making it yours

- **Backend methods.** Each one calls your service server-side with the credential your
  host holds for the session; the model reads only the result. A flow whose steps have a
  fixed order enforces that order in the backend.
- **Read the backend guide.** [`docs/backends.md`](docs/backends.md) walks through
  identity and credentials, ordered flows, checkout, and products with options.
- **Checkout hands off.** The core can return a backend-authored checkout URL for your
  host to render. The Chinese demo shows a simulation summary and never links to payment.
- **Start small.** A pilot implements search and product details and stubs the rest; a
  stubbed method returns an unavailable result and changes no prompt bytes.
- **Switch off what you do not have.** A system the business lacks entirely (no cart on a
  referral surface, no order tracking) is an `enable_*` switch turned off, which removes
  its tools, prompt lines, and grounding rule; park the flows that need it under
  `skills/_staged/`.
- **Add your own.** A flow is a directory with a `SKILL.md` under `skills/`. Domain UI is
  a `PresentationExtension`. `brand_name`, `assistant_name`, and `brand_voice` on the
  config set the identity.

## License

Copyright 2026 Anthropic PBC. Licensed under the [Apache License 2.0](./LICENSE).
