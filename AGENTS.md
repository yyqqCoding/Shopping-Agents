# shopping-agent

For agents working in this repo. A shopping agent on Claude: the core definition, the
Messages API runtime, the skills, and a runnable demo.

## Layout

- `commerce-common/commerce_common/`: what the agent builds on; its `__init__` lists the modules.
- `commerce_common/context.py` budgets and summarizes working context; `search.py` shares Chinese and Latin keyword matching.
- `shopping-agent/core/shopping_agent/`: types, `StorefrontBackend`, config, prompt, `tools/`, gates, enrichment, executor.
- `shopping-agent/runtime-messages-api/`: `ShoppingAgent`, the turn loop on the Messages API.
- `shopping-agent/skills/`: the flows, one `SKILL.md` each.
- `examples/demo_common/` and `examples/web-shared/`: what the demo's API and web app share; `examples/` is the npm workspace.
- `demo_common/experience.py`, `persistence.py`, `supabase.py`: anonymous identity, owned conversations, durable turns, carts and memory jobs. `web-shared/identity.ts` and `Conversations.tsx` handle browser identity and conversation history.
- `examples/assistant/`: the outdoor equipment agent over a fictional CNY catalog — `api/`, `data/`, `storefront-web/`; ports 8004 and 3004. `/` is the welcome page; `/chat` hosts conversations. `data/legacy/` preserves retired catalog records for old conversations.
- `storefront-web/components/VisitorProfile.tsx` owns the sidebar profile menu and browser-local display preferences, scoped to the existing anonymous identity.
- `supabase/migrations/`: service-only tables and transactional RPCs. `deploy/`: single-worker containers and HTTPS/SSE proxy; `check_database.py` checks cart migration readiness without starting the API.
- `docs/`: `safety.md`, `backends.md`, `deployment.md`, `agent-experience-design.md`. `scripts/`: install, demo, smoke, verify; `deploy.sh` builds and replaces the deployment from the current checkout; `outdoor_catalog.py` defines outdoor equipment and `prepare_catalog.py` freezes the catalog, evidence and image requests.
- Tests live in each package's `tests/` plus `examples/demo_common/tests/` and `examples/assistant/api/tests/`.

`requirements.txt` installs the three packages and their pinned dependencies
(`requirements-dev.txt` adds pytest and ruff); `scripts/install.sh` runs it.

## Design rules

- One model owns the conversation; a rule goes in a tool description, the prompt, or a skill by how often it applies.
- The static prompt and `tools[]` are the same bytes on every turn; per-request data goes in the fenced block after the breakpoint.
- UI is presentation tool calls, validated and filled in on the server, streamed as `ui` events.
- Third-party content is fenced data; writes are provenance-gated and capped in code; `checkout` charges nothing.
- Core is domain-neutral; a deployment adds UI through `PresentationExtension` and keeps the rest to itself.
- Each mechanism is defined once, in `commerce_common` or the core, and shared by the runtime and the demo.

## Fictional and original

No real company, brand, product, or person appears. The outdoor experience uses
unbranded fictional equipment and the descriptive name 户外装备助手. Legacy product
records retain their original names for archived conversations. Two exceptions:
deployment and integration targets (the README's "MCP connectors" section; platform
names in `docs/deployment.md` and the README's deploying section), and CC0 product
photos listed in the `IMAGE-CREDITS.md` beside them. When in doubt, redesign rather
than rename.

## Conventions

- Python 3.11+, `ruff` (root `ruff.toml`), `pytest` (root `pytest.ini`), type hints, `pydantic` schemas; the web app is Next.js and TypeScript.
- Skill descriptions name the request class, without sample utterances; tool descriptions say when the tool applies; examples stay schematic.
- Prose: plain declarative sentences; one term per thing; each fact once, naming its module; a README says what a thing is, how to run it, and where its interfaces are; no history, dates, or process narrative; cut before restyling.
- A new module updates this file and its README.

## Verify

```bash
ruff check . && ruff format --check . && pytest
python scripts/verify_all.py          # adds catalog validation, Node tests and the web build
```
