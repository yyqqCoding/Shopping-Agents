# Experience storage

`migrations/001_agent_experience.sql` creates the experience's private tables and
transactional RPCs. `migrations/002_outdoor_cart_currency.sql` adds explicit cart
currency and rejects mixed-currency writes. New projects apply both in that order,
once each, with Anonymous Sign-ins enabled. Existing projects apply only `002` with
the API stopped. Connection and rollout steps are in
[deployment.md](../docs/deployment.md#户外版本升级).

| Table | Data |
|---|---|
| `experience_conversations` | Verified owner, title, working messages, summary, provenance and version |
| `experience_turns` | Request id, raw turn messages, final display fragments, completion and memory progress |
| `experience_memory_versions` | Per-user clear generation |
| `experience_memory_facts` | Facts keyed by user and topic, with source order |
| `experience_memory_deletions` | Key and deletion order, without deleted values |
| `experience_carts` / `experience_cart_operations` | Per-conversation items, currency and deduplicated operations |
| `experience_daily_usage` | Per-user and global daily turn counts in UTC |

`examples/demo_common/persistence.py` is the only database adapter. Every scoped RPC
names the verified owner; browser roles cannot read the tables or execute the RPCs.
`begin_turn` deduplicates before charging quota; `finish_turn` writes the archive and
checkpoint together under the conversation version. Settled raw history is not rewritten.
Migration `002` labels existing carts USD without changing their amounts; new carts
default to CNY. An empty cart can adopt its first item's currency. Older clients that
omit currency still write USD. RPC replies include `schema_version: 2`; the outdoor
application refuses cart use before this migration, rather than storing CNY amounts
under the old USD-only contract. No conversation or memory rows are changed.
Memory writes, corrections, deletion and clearing serialize on the user's generation
record. Claims carry an expiring id so a stale job cannot complete its replacement.

The schema assumes one API worker. `experience_recover` is called only at startup and
marks unfinished turns interrupted; do not run it alongside another live API process.
Existing local memory is neither imported nor deleted. No automatic data expiry is enabled.

## Transaction verification

Apply both migrations to a disposable Supabase test project. With `psql` installed,
set `SHOPPING_TEST_DATABASE_URL` to its PostgreSQL connection string and run:

```bash
python -m pytest examples/demo_common/tests/test_database_integration.py -q
```

`tests/contract.sql` exercises ownership, RLS and RPC grants, quotas, request and cart
deduplication, archive immutability, state versions, memory corrections and deletion,
claim expiry and startup recovery. Its fixtures roll back. Use an isolated project:
startup recovery intentionally addresses every unfinished turn in that database.
The integration test skips when no test connection or `psql` is available; a skip does
not establish that the migration has run successfully.
