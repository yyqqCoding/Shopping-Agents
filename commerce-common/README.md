# commerce-common (package `commerce_common`)

The mechanisms the shopping agent builds on. `shopping_agent` adds its types, prompt,
tool contracts, and gates on top; the runtime imports both. One module per mechanism:

| Module | Holds |
|---|---|
| `config.py` | `BaseAgentConfig`: identity, models, budgets, capabilities, memory, caps |
| `fencing.py` | `Fence`: sanitizing and fencing text the model reads as data; chip hygiene |
| `memory.py` | `MemoryStore` contract, write filter, `validate_fact`, extraction, `MemoryRuntime` |
| `skills.py` | `SkillRegistry`: loads `SKILL.md` directories and renders the prompt index |
| `prompt_assembly.py` | Where the cache breakpoints go (static system block, tool array, the newest persisted message) and where the per-request context block and its clock go |
| `grounding.py` | `GroundingRule` and the matchers; `first_forced_tool` |
| `presentation.py` | `PresentationComponent`, `PresentationExtension`, `run_presentation`; `enrich_partial` for `ui_partial` frames |
| `delegation.py` | `DelegateExtension`: an isolated model task behind a tool |
| `execution.py` | `BaseToolExecutor`: dispatch, failure ladder, skills, presentation, delegates, memory; `split_status` (a call's `status` line, handed to the host) |
| `streaming.py` | `AgentEvent` (the event list is in the module docstring), `ToolOutcome`, `to_sse` |
| `turn.py` | Messages API turn helpers: user text, history compaction, eager tool dispatch, `StreamedRound` (a round's `ui_partial` frames as it streams; an error result for unparsed input), `round_closes_turn` (a round of rendered presentation calls, chips among them, ends the turn), tool-result blocks, usage, the model-call log record, transcript slice |
| `testing.py` | Scripted stand-ins for the streaming and `create` client calls, plus a spy memory store, for credential-free tests |
| `types.py` | `MemoryFact`, `MemoryCategory`, `ClockContext` |

Extras: `[examples]` adds what the demo host imports, and `requirements-dev.txt` pins
the test tools.

Tests: `pytest commerce-common/tests`.
