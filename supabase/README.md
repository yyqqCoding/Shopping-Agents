# Experience storage

`migrations/001_agent_experience.sql` creates the experience's private tables and
transactional RPCs. Carts, the catalog and orders live in the commerce service's MySQL
(`commerce-service/`); `migrations/005_drop_catalog_and_carts.sql` removes the cart
tables of `001`/`002` and the catalog tables of `003`/`004`. New projects apply `001`
then `005`, once each, with Anonymous Sign-ins enabled. Existing projects apply `005`
after switching to the commerce service. Steps are in
[deployment.md](../docs/deployment.md#切换到订单服务).

| Table | Data |
|---|---|
| `experience_conversations` | Verified owner, title, working messages, summary, provenance and version |
| `experience_turns` | Request id, raw turn messages, final display fragments, completion and memory progress |
| `experience_memory_versions` | Per-user clear generation |
| `experience_memory_facts` | Facts keyed by user and topic, with source order |
| `experience_memory_deletions` | Key and deletion order, without deleted values |
| `experience_daily_usage` | Per-user and global daily turn counts in UTC |

`examples/demo_common/persistence.py` is the only database adapter. Every scoped RPC
names the verified owner; browser roles cannot read the tables or execute the RPCs.
`begin_turn` deduplicates before charging quota; `finish_turn` writes the archive and
checkpoint together under the conversation version. Settled raw history is not rewritten.
Memory writes, corrections, deletion and clearing serialize on the user's generation
record. Claims carry an expiring id so a stale job cannot complete its replacement.

The schema assumes one API worker. `experience_recover` is called only at startup and
marks unfinished turns interrupted; do not run it alongside another live API process.
Existing local memory is neither imported nor deleted. No automatic data expiry is enabled.

## Transaction verification

Apply `001` and `005` to a disposable Supabase test project. With `psql` installed,
set `SHOPPING_TEST_DATABASE_URL` to its PostgreSQL connection string and run:

```bash
python -m pytest examples/demo_common/tests/test_database_integration.py -q
```

`tests/contract.sql` exercises ownership, RLS and RPC grants, quotas, request
deduplication, archive immutability, state versions, memory corrections and deletion,
claim expiry and startup recovery. Its fixtures roll back. Use an isolated project:
startup recovery intentionally addresses every unfinished turn in that database.
The integration test skips when no test connection or `psql` is available; a skip does
not establish that the migration has run successfully.
