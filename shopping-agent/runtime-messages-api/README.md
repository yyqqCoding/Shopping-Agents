# shopping-agent/runtime-messages-api (package `shopping_agent_runtime`)

The shopping agent's turn loop on the Messages API. `ShoppingAgent` builds the static
prompt and tool array once, and on each turn prefetches the profile, cart, and memory
facts, streams the model, executes tool calls concurrently through
`shopping_agent.executor`, and yields events for the host to render. The demo API is a
host application around it (`examples/demo_common/experience.py`).

A topic-memory adapter enables `TopicMemoryEngine`: the runtime uses a bounded index
or starts a semantic-recall prefetch, consumes ready files after tool execution and
keeps the inherited main request prefix for post-turn extraction. It registers scoped
file tools instead of fact-key tools. The local host persists the exact prefix until
its extraction job completes, runs consolidation and exposes file/task management.
`update_memory` remains the convenience path for legacy fact adapters; topic extraction
is owned by the durable host. See `docs/long-term-memory-design.md`.

| Module | Holds |
|---|---|
| `orchestrator.py` | `ShoppingAgent`: constructor, `stream_turn`, `update_memory` |

## Use

```python
from pathlib import Path

from commerce_common.streaming import to_sse
from shopping_agent import ShoppingAgentConfig, ShoppingSessionContext, ShoppingSessionState
from shopping_agent_runtime import ShoppingAgent

agent = ShoppingAgent(
    backend=your_backend,                       # your StorefrontBackend
    skills_dir=Path("shopping-agent/skills"),
    config=ShoppingAgentConfig(brand_name="Your Store"),
    memory_store=your_store,                    # optional; a commerce_common.memory.MemoryStore
    client=your_client,                         # optional; see docs/deployment.md
)

state = ShoppingSessionState()                # keep per session: provenance and cart state
session = ShoppingSessionContext(session_id=sid, user_id=uid)
async for event in agent.stream_turn(messages, session, state):
    send(to_sse(event))
await agent.update_memory(messages, session)  # after the reply; extraction runs on memory_model
```

`messages` is the conversation so far ending with the user's message; the turn appends
its assistant messages and tool results in place, so the host stores the list as is. The
event types are listed in `commerce_common/streaming.py`; `ui` events carry validated,
enriched payloads, `ui_partial` events carry the same component while its call is still
streaming, and `cart_update` carries the whole cart after a write. An API or
stream error propagates out of `stream_turn`; the host catches it and emits an `error` event
(see `examples/demo_common/host.py`).

## What the runtime adds to the executor

- When a rule in `shopping_agent.grounding` fires, the first round is pinned to that read
  tool with `tool_choice`; after `max_tool_iterations` rounds the last round runs without tools.
- Tool calls dispatch eagerly: a call executes the moment its content block closes, while
  the model writes the rest of the round (`eager_tool_dispatch`). Its validated display
  events publish as soon as it finishes, even while the model or other tools are still
  running. The model's result blocks retain the original call order. Each model call carries a
  cache breakpoint on the newest persisted message (`rolling_conversation_cache`), placed on
  the outgoing request only, and sends thinking at `thinking_effort`. `eager_partial_frames`
  switches `ui_partial` frames from structural changes to every visible change; a call's
  `status` line goes out as the `tool_call` event's `label`.
- Model-call logs include first-text and first-card arrival times relative to the model
  request, and first-round preparation time. The browser trace records connection,
  first-text and first-card arrival times relative to send. See
  [`frontend-performance-design.md`](../../docs/frontend-performance-design.md).
- With `close_on_presentation` on, a round that `round_closes_turn`
  (`commerce_common/turn.py`) accepts ends the turn there, so `messages` can end on tool
  results.
- `extra_presentation_tools` appends a deployment's `PresentationExtension`s to the tool array.
- `agent.memory` is the deployment's `MemoryRuntime`; a host with its own memory routes
  reads and deletes through `agent.memory.store`.

The gates themselves (fencing, provenance, caps, memory validation) are in
`shopping_agent` and `commerce_common`; [`docs/safety.md`](../../docs/safety.md) lists them.

Credentials: the default client reads `ANTHROPIC_API_KEY` (or a token and base URL) from
the environment. Tests run without any: `pytest shopping-agent/runtime-messages-api/tests`
scripts the model with `commerce_common.testing.FakeClient`.

## Durable hosts

Pass `archive=[]` containing the new user message and a persisted
`commerce_common.context.WorkingContext` as keyword arguments to `stream_turn`.
`archive` receives copies of new raw assistant messages and tool results before any
compaction. Persist it as one turn, plus the final display fragments and the latest
working messages/context. Send completion to the browser only after that transaction.

Before every model request, old read-tool results may be cleared from the working copy
when explicitly enabled and the configured idle gap is exceeded. `fit_context` uses an
API usage baseline plus new messages, prefers a committed session note with its exact
message boundary, and expands its retained tail to the configured token/text-message
minimums while preserving API pairs. Ordinary full compaction inherits the main request
prefix and denies tools; failure falls back to an independent stream on the main model.
Only a valid, fitting summary changes the checkpoint. A caller that omits `working_context` keeps its original
messages; its temporary summary cannot silently discard history between turns.

Durable hosts can provide `allocate_message_id`, `on_round_complete` and
`refresh_session_note`. The runtime records ids alongside working messages and calls
the hook after a complete model round with paired tool results. The host persists the
raw boundary before queuing a serial note edit, and can wait up to 15 seconds before
compaction. `WorkingContext` persists tool cursors, note coverage, usage fingerprints,
loaded skill names and the last assistant timestamp. Full compaction restores skill
instructions and bounded file/archive references; business write authority remains in
the server's session state.

A durable host can pass `save_large_result` to externalize a tool result above 12,000
characters before it enters the working context. Each new round also has a 200,000-character
eligible-result budget; the largest results are replaced first, counting previews and
references toward the remaining total. File/archive reads, skill loads, writes, errors
and refusals remain intact. Failed saves retain the original result. The original remains
in `archive`, and historical replacements stay stable. The local experience host
adds `read_session_archive` for bounded retrieval of saved results or old transcript excerpts.

The durable demo captures `MemoryWriteVersion` at turn start and queues memory extraction
by turn and source order. It does not also call `update_memory`; that convenience method
remains for hosts without a durable job runner.
