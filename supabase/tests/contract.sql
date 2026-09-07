-- Run only on a disposable Supabase test project after applying the migration.
-- All fixtures and mutations roll back. ON_ERROR_STOP makes a failed assertion fail CI.
\set ON_ERROR_STOP on
begin;

create function pg_temp.check_contract(ok boolean, label text) returns void
language plpgsql as $$
begin
    if ok is distinct from true then raise exception 'Contract failed: %', label; end if;
end $$;

create function pg_temp.expect_error(statement text, expected text) returns void
language plpgsql as $$
declare actual text;
begin
    begin
        execute statement;
    exception when others then
        get stacked diagnostics actual = returned_sqlstate;
    end;
    perform pg_temp.check_contract(actual = expected, 'expected SQLSTATE ' || expected);
end $$;

do $$
declare
    visitor_a uuid := gen_random_uuid(); visitor_b uuid := gen_random_uuid();
    create_id uuid := gen_random_uuid(); request_id uuid := gen_random_uuid();
    conversation_a uuid; conversation_other uuid; conversation_b uuid; completed_turn uuid;
    turn jsonb; replay jsonb; saved jsonb; card jsonb; raw jsonb; cart jsonb;
    operation_one uuid := gen_random_uuid(); operation_two uuid := gen_random_uuid();
    line jsonb := '{"product_id":"AR-1001","title":"ACME 咖啡机","price":79,"quantity":1,"currency":"USD"}';
    old_order bigint; new_order bigint; generation bigint; claim jsonb; replacement jsonb;
    item record;
begin
    insert into auth.users(id) values (visitor_a), (visitor_b);
    conversation_a := (experience_create_conversation(visitor_a, create_id)->>'id')::uuid;
    perform pg_temp.check_contract((experience_create_conversation(visitor_a, create_id)->>'id')::uuid = conversation_a, 'create idempotency');
    conversation_other := (experience_create_conversation(visitor_a, gen_random_uuid())->>'id')::uuid;
    conversation_b := (experience_create_conversation(visitor_b, gen_random_uuid())->>'id')::uuid;
    perform pg_temp.check_contract(jsonb_array_length(experience_list_conversations(visitor_a, 0, 30)) = 2, 'owned list');
    perform pg_temp.check_contract(jsonb_array_length(experience_list_conversations(visitor_a, 1, 1)) = 1, 'list pagination');
    perform pg_temp.check_contract(experience_load_conversation(visitor_a, conversation_other)->'messages' = '[]'::jsonb, 'new conversation context');
    perform pg_temp.expect_error(format('select experience_load_conversation(%L,%L)', visitor_b, conversation_a), 'P0002');
    perform pg_temp.expect_error(format('select experience_history(%L,%L,null,30)', visitor_b, conversation_a), 'P0002');
    perform pg_temp.expect_error(format('select experience_cart(%L,%L,%L,null,0,%L)', visitor_b, conversation_a, 'get', gen_random_uuid()), 'P0002');

    raw := jsonb_build_object('role', 'user', 'content', '预算 800 美元，给朋友选购');
    turn := experience_begin_turn(visitor_a, conversation_a, 1, request_id, '预算 800 美元，给朋友选购', '{}', raw, 100, 1000);
    completed_turn := (turn->>'id')::uuid;
    perform pg_temp.check_contract(turn->>'status' = 'running' and turn->'raw_messages' = jsonb_build_array(raw), 'input saved before model');
    replay := experience_begin_turn(visitor_a, conversation_a, 1, request_id, '预算 800 美元，给朋友选购', '{}', raw, 100, 1000);
    perform pg_temp.check_contract((replay->>'replay')::boolean and replay->>'id' = turn->>'id', 'begin idempotency');
    perform pg_temp.check_contract((select turns from experience_daily_usage where day = (now() at time zone 'UTC')::date and scope = visitor_a::text) = 1, 'quota deduplicates retries');
    perform pg_temp.expect_error(format('select experience_begin_turn(%L,%L,1,%L,%L,%L,%L,100,1000)', visitor_a, conversation_a, request_id, 'different input', '{}', raw), '40001');
    perform pg_temp.expect_error(format('select experience_begin_turn(%L,%L,2,%L,%L,%L,%L,100,1000)', visitor_a, conversation_a, gen_random_uuid(), 'another turn', '{}', raw), '40001');
    perform pg_temp.expect_error(format('select experience_save_state(%L,%L,1,%L,%L)', visitor_a, conversation_a, '{}', '[]'), '40001');

    card := '[{"type":"text","text":"比较结果"},{"type":"ui","block":{"component":"products","payload":{"items":[{"product_id":"AR-1001","title":"保存时的商品名称"}]}}}]';
    raw := jsonb_build_array(raw, jsonb_build_object('role', 'assistant', 'content', '完整的原始回答'));
    -- A NULL running pointer must not slip through a three-valued comparison.
    update experience_conversations set running_turn = null where id = conversation_a;
    perform pg_temp.expect_error(format('select experience_finish_turn(%L,%L,%L,2,%L,%L,%L,%L,%L,%L,%L,%L)', visitor_a, conversation_a, turn->>'id', '{}', '[]', '[]', '{}', raw, card, '{}', 'complete'), '40001');
    update experience_conversations set running_turn = (turn->>'id')::uuid where id = conversation_a;
    perform experience_finish_turn(visitor_a, conversation_a, (turn->>'id')::uuid, 2, '{}', '[]', '[{"role":"user","content":"近期消息"}]', '{"summary":"较早历史摘要","covered_turns":1}', raw, card, '{}', 'complete');
    perform experience_finish_turn(visitor_a, conversation_a, (turn->>'id')::uuid, 2, '{}', '[]', '[]', '{}', '[]', '[]', '{}', 'complete');
    perform pg_temp.check_contract((select raw_messages from experience_turns where id = (turn->>'id')::uuid) = raw, 'settled raw archive immutable');
    saved := experience_load_conversation(visitor_a, conversation_a);
    perform pg_temp.check_contract(saved->'context'->>'summary' = '较早历史摘要' and saved->'running_turn' = 'null'::jsonb, 'working checkpoint restored separately');
    saved := experience_get_turn(visitor_a, conversation_a, request_id);
    perform pg_temp.check_contract(saved->'display' = card and not (saved ? 'raw_messages'), 'history exposes only saved display');
    perform pg_temp.expect_error(format('select experience_get_turn(%L,%L,%L)', visitor_b, conversation_a, request_id), 'P0002');
    perform pg_temp.expect_error(format('select experience_begin_turn(%L,%L,3,%L,%L,%L,%L,1,1000)', visitor_a, conversation_a, gen_random_uuid(), 'quota check', '{}', '{}'), 'PT429');

    cart := experience_cart(visitor_a, conversation_a, 'add', line, 1, operation_one);
    perform pg_temp.check_contract(cart->'items'->0->>'quantity' = '1', 'cart add');
    perform experience_cart(visitor_a, conversation_a, 'add', line, 1, operation_one);
    perform experience_cart(visitor_a, conversation_a, 'add', line, 1, operation_two);
    cart := experience_cart(visitor_a, conversation_a, 'add', line, 1, operation_one);
    perform pg_temp.check_contract(cart->'items'->0->>'quantity' = '2', 'cart retry returns current state without adding again');
    perform pg_temp.check_contract(experience_cart(visitor_a, conversation_other, 'get', null, 0, gen_random_uuid())->'items' = '[]'::jsonb, 'cart isolation');
    perform pg_temp.expect_error(format('select experience_cart(%L,%L,%L,%L,2,%L)', visitor_a, conversation_a, 'add', line, operation_one), '40001');
    perform pg_temp.expect_error(format('select experience_cart(%L,%L,%L,%L,25,%L)', visitor_a, conversation_a, 'set', line, gen_random_uuid()), '22023');

    generation := experience_memory_generation(visitor_a);
    old_order := nextval('experience_source_order');
    new_order := nextval('experience_source_order');
    perform experience_memory_write(visitor_a, '[{"key":"material","value":"偏好羊毛","category":"preference"}]', generation, old_order);
    perform experience_memory_write(visitor_a, '[{"key":"material","value":"改为偏好棉质","category":"preference"}]', generation, new_order);
    perform experience_memory_write(visitor_a, '[{"key":"material","value":"旧任务偏好羊毛","category":"preference"}]', generation, old_order);
    perform pg_temp.check_contract(experience_memory_read(visitor_a)->0->>'value' = '改为偏好棉质', 'late extraction cannot overwrite correction');
    perform pg_temp.check_contract(experience_memory_read(visitor_b) = '[]'::jsonb, 'memory owner isolation');
    perform pg_temp.check_contract(experience_memory_delete(visitor_a, 'material'), 'real fact deletion');
    perform experience_memory_write(visitor_a, '[{"key":"material","value":"迟到的旧事实","category":"preference"}]', generation, new_order);
    perform pg_temp.check_contract(experience_memory_read(visitor_a) = '[]'::jsonb, 'deletion tombstone blocks old jobs');
    perform pg_temp.check_contract(not experience_memory_delete(visitor_a, 'missing'), 'unknown delete returns false');
    perform experience_memory_write(visitor_a, '[{"key":"missing","value":"旧任务不能创建","category":"preference"}]', generation, old_order);
    perform pg_temp.check_contract(experience_memory_read(visitor_a) = '[]'::jsonb, 'unknown deletion also blocks old jobs');
    perform experience_memory_write(visitor_b, '[{"key":"color","value":"偏好蓝色","category":"preference"}]', null, null);
    perform experience_memory_clear(visitor_a);
    perform experience_memory_write(visitor_a, '[{"key":"material","value":"清空前的任务","category":"preference"}]', generation, nextval('experience_source_order'));
    perform pg_temp.check_contract(experience_memory_read(visitor_a) = '[]'::jsonb and jsonb_array_length(experience_memory_read(visitor_b)) = 1, 'clear version is atomic and per user');

    claim := experience_claim_memory(visitor_a, 4, 60);
    perform pg_temp.check_contract(claim->>'id' = turn->>'id', 'completed turn schedules memory');
    perform pg_temp.check_contract(not experience_finish_memory((claim->>'id')::uuid, gen_random_uuid(), true, 0), 'claim owner required');
    update experience_turns set memory_claimed_until = now() - interval '1 second' where id = (claim->>'id')::uuid;
    replacement := experience_claim_memory(visitor_a, 4, 60);
    perform pg_temp.check_contract(replacement->>'memory_claim_id' <> claim->>'memory_claim_id', 'expired memory claim can be retried');
    perform pg_temp.check_contract(not experience_finish_memory((claim->>'id')::uuid, (claim->>'memory_claim_id')::uuid, true, 0), 'expired claimant cannot settle replacement');
    perform pg_temp.check_contract(experience_finish_memory((replacement->>'id')::uuid, (replacement->>'memory_claim_id')::uuid, true, 0), 'current claim completion');

    turn := experience_begin_turn(visitor_a, conversation_a, 3, gen_random_uuid(), '中断测试', '{}', '{"role":"user","content":"中断测试"}', 100, 1000);
    perform experience_recover();
    saved := experience_get_turn(visitor_a, conversation_a, (turn->>'request_id')::uuid);
    perform pg_temp.check_contract(saved->>'status' = 'interrupted', 'startup marks unfinished turns interrupted');
    perform pg_temp.check_contract((select raw_messages from experience_turns where id = completed_turn) = raw, 'recovery preserves completed raw history');
    perform pg_temp.check_contract(jsonb_array_length(experience_history(visitor_a, conversation_a, 2, 30)) = 1, 'history cursor excludes newer turns');
    perform pg_temp.check_contract(experience_load_conversation(visitor_a, conversation_a)->'running_turn' = 'null'::jsonb, 'recovery releases conversation');

    for item in select oid, relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and starts_with(relname, 'experience_') loop
        perform pg_temp.check_contract(item.relrowsecurity, 'RLS ' || item.relname);
        perform pg_temp.check_contract(not has_table_privilege('anon', item.oid, 'SELECT,INSERT,UPDATE,DELETE'), 'anon table access denied');
        perform pg_temp.check_contract(not has_table_privilege('authenticated', item.oid, 'SELECT,INSERT,UPDATE,DELETE'), 'browser table access denied');
    end loop;
    for item in select oid from pg_proc where pronamespace = 'public'::regnamespace and starts_with(proname, 'experience_') loop
        perform pg_temp.check_contract(not has_function_privilege('anon', item.oid, 'EXECUTE'), 'anon RPC access denied');
        perform pg_temp.check_contract(not has_function_privilege('authenticated', item.oid, 'EXECUTE'), 'browser RPC access denied');
        perform pg_temp.check_contract(has_function_privilege('service_role', item.oid, 'EXECUTE'), 'API RPC access allowed');
    end loop;
end $$;

rollback;
