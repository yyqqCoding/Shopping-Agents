-- Apply once with the Supabase SQL editor or migration CLI. No user data is seeded.
-- Business tables and RPCs are service-only; FastAPI verifies every user_id.
begin;

create sequence public.experience_source_order;

create table public.experience_memory_versions (
    user_id uuid primary key references auth.users(id),
    generation bigint not null default 0
);

create table public.experience_conversations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id),
    create_request_id uuid not null,
    title text not null default '新对话',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1,
    next_turn integer not null default 1,
    running_turn uuid,
    state jsonb not null default '{}',
    messages jsonb not null default '[]',
    context jsonb not null default '{}',
    pending_app_events jsonb not null default '[]',
    unique (user_id, create_request_id)
);
create index experience_conversations_owner on public.experience_conversations(user_id, updated_at desc, id);

create table public.experience_turns (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.experience_conversations(id),
    user_id uuid not null references auth.users(id),
    request_id uuid not null,
    sequence integer not null,
    source_order bigint not null default nextval('public.experience_source_order'),
    generation bigint not null,
    message text not null check (char_length(message) between 1 and 4000),
    page jsonb not null default '{}',
    raw_messages jsonb not null default '[]',
    display jsonb not null default '[]',
    display_version integer not null default 1,
    completion jsonb not null default '{}',
    status text not null default 'running' check (status in ('running', 'complete', 'interrupted', 'error')),
    created_at timestamptz not null default now(),
    completed_at timestamptz,
    memory_status text not null default 'waiting' check (memory_status in ('waiting', 'pending', 'processing', 'complete', 'failed', 'skipped')),
    memory_attempts integer not null default 0,
    memory_next_attempt timestamptz not null default now(),
    memory_claim_id uuid,
    memory_claimed_until timestamptz,
    unique (conversation_id, request_id),
    unique (conversation_id, sequence)
);
create index experience_memory_jobs on public.experience_turns(memory_status, memory_next_attempt, source_order);
create index experience_turns_owner on public.experience_turns(user_id, source_order);

create table public.experience_daily_usage (
    day date not null,
    scope text not null,
    turns integer not null default 0 check (turns >= 0),
    primary key (day, scope)
);

create table public.experience_memory_facts (
    user_id uuid not null references auth.users(id),
    key text not null check (char_length(key) between 1 and 64),
    value text not null check (char_length(value) between 1 and 200),
    category text not null check (category in ('preference', 'constraint', 'context')),
    source_session_id text,
    source_order bigint not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, key)
);
create table public.experience_memory_deletions (
    user_id uuid not null references auth.users(id),
    key text not null,
    source_order bigint not null,
    primary key (user_id, key)
);

create table public.experience_carts (
    conversation_id uuid primary key references public.experience_conversations(id),
    items jsonb not null default '[]',
    version bigint not null default 0
);
create table public.experience_cart_operations (
    operation_id uuid primary key,
    conversation_id uuid not null references public.experience_conversations(id),
    input jsonb not null,
    result jsonb not null,
    created_at timestamptz not null default now()
);

-- Deny browser roles even if they discover a table or function name. The service role
-- deliberately bypasses RLS; ownership is checked again inside every scoped RPC.
alter table public.experience_memory_versions enable row level security;
alter table public.experience_conversations enable row level security;
alter table public.experience_turns enable row level security;
alter table public.experience_memory_facts enable row level security;
alter table public.experience_memory_deletions enable row level security;
alter table public.experience_carts enable row level security;
alter table public.experience_cart_operations enable row level security;
alter table public.experience_daily_usage enable row level security;

create function public.experience_memory_generation(p_user_id uuid) returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare result bigint;
begin
    insert into experience_memory_versions(user_id) values (p_user_id) on conflict do nothing;
    select generation into result from experience_memory_versions where user_id = p_user_id for update;
    return result;
end $$;

create function public.experience_create_conversation(p_user_id uuid, p_request_id uuid) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare result experience_conversations;
begin
    insert into experience_conversations(user_id, create_request_id) values (p_user_id, p_request_id)
        on conflict (user_id, create_request_id) do update set create_request_id = excluded.create_request_id
        returning * into result;
    insert into experience_carts(conversation_id) values (result.id) on conflict do nothing;
    return jsonb_build_object('id', result.id, 'title', result.title, 'created_at', result.created_at, 'updated_at', result.updated_at);
end $$;

create function public.experience_list_conversations(p_user_id uuid, p_offset integer, p_limit integer) returns jsonb
language sql stable set search_path = public, pg_temp as $$
    select coalesce(jsonb_agg(row_to_json(page)), '[]'::jsonb) from (
        select id, title, created_at, updated_at from experience_conversations
        where user_id = p_user_id order by updated_at desc, id
        offset greatest(0, p_offset) limit greatest(1, least(p_limit, 101))
    ) page;
$$;

create function public.experience_load_conversation(p_user_id uuid, p_id uuid) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare result experience_conversations;
begin
    select * into result from experience_conversations where id = p_id and user_id = p_user_id;
    if not found then raise no_data_found; end if;
    return to_jsonb(result);
end $$;

create function public.experience_save_state(p_user_id uuid, p_id uuid, p_version bigint, p_state jsonb, p_events jsonb) returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare result bigint;
begin
    perform experience_load_conversation(p_user_id, p_id);
    update experience_conversations set state = p_state, pending_app_events = p_events, version = version + 1
        where id = p_id and user_id = p_user_id and version = p_version and running_turn is null
        returning version into result;
    if not found then raise exception 'Stale conversation' using errcode = '40001'; end if;
    return result;
end $$;

create function public.experience_history(p_user_id uuid, p_id uuid, p_before integer, p_limit integer) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare result jsonb;
begin
    perform experience_load_conversation(p_user_id, p_id);
    select coalesce(jsonb_agg(to_jsonb(page) order by page.sequence), '[]'::jsonb) into result from (
        select id, request_id, sequence, message, display, display_version, completion, status, created_at
        from experience_turns where conversation_id = p_id and user_id = p_user_id
            and (p_before is null or sequence < p_before)
        order by sequence desc limit greatest(1, least(p_limit, 100))
    ) page;
    return result;
end $$;

create function public.experience_begin_turn(
    p_user_id uuid, p_id uuid, p_version bigint, p_request_id uuid,
    p_message text, p_page jsonb, p_raw_user jsonb,
    p_user_daily_limit integer, p_global_daily_limit integer
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare c experience_conversations; t experience_turns; gen bigint;
    today date := (now() at time zone 'UTC')::date; global_used integer; user_used integer;
begin
    select * into c from experience_conversations where id = p_id and user_id = p_user_id for update;
    if not found then raise no_data_found; end if;
    select * into t from experience_turns where conversation_id = p_id and request_id = p_request_id;
    if found then
        if t.message <> p_message or t.page <> p_page then
            raise exception 'Request id reused with different input' using errcode = '40001';
        end if;
        return to_jsonb(t) || jsonb_build_object('replay', true, 'version', c.version);
    end if;
    if c.version <> p_version or c.running_turn is not null then
        raise exception 'Conversation is busy or stale' using errcode = '40001';
    end if;
    -- Charge only a new accepted turn. Lock in one order across visitors, so quotas
    -- cannot be raced and a lost begin response can be retried without another charge.
    insert into experience_daily_usage(day, scope) values (today, 'global') on conflict do nothing;
    select turns into global_used from experience_daily_usage where day = today and scope = 'global' for update;
    insert into experience_daily_usage(day, scope) values (today, p_user_id::text) on conflict do nothing;
    select turns into user_used from experience_daily_usage where day = today and scope = p_user_id::text for update;
    if global_used >= p_global_daily_limit or user_used >= p_user_daily_limit then
        raise exception 'Daily allowance reached' using errcode = 'PT429';
    end if;
    update experience_daily_usage set turns = turns + 1 where day = today and scope in ('global', p_user_id::text);
    gen := experience_memory_generation(p_user_id);
    insert into experience_turns(conversation_id, user_id, request_id, sequence, generation, message, page, raw_messages)
        values (p_id, p_user_id, p_request_id, c.next_turn, gen, p_message, p_page, jsonb_build_array(p_raw_user))
        returning * into t;
    update experience_conversations set version = version + 1, running_turn = t.id,
        next_turn = next_turn + 1, messages = messages || jsonb_build_array(p_raw_user),
        pending_app_events = '[]', updated_at = now(),
        title = case when next_turn = 1 then left(p_message, 32) else title end
        where id = p_id;
    return to_jsonb(t) || jsonb_build_object('replay', false, 'version', c.version + 1);
end $$;

create function public.experience_get_turn(p_user_id uuid, p_id uuid, p_request_id uuid) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare result jsonb;
begin
    perform experience_load_conversation(p_user_id, p_id);
    select jsonb_build_object(
        'id', id, 'request_id', request_id, 'sequence', sequence, 'message', message,
        'display', display, 'display_version', display_version, 'completion', completion,
        'status', status, 'created_at', created_at
    ) into result from experience_turns
        where conversation_id = p_id and user_id = p_user_id and request_id = p_request_id;
    if not found then raise no_data_found; end if;
    return result;
end $$;

create function public.experience_finish_turn(
    p_user_id uuid, p_id uuid, p_turn_id uuid, p_version bigint,
    p_state jsonb, p_events jsonb, p_messages jsonb, p_context jsonb,
    p_raw_messages jsonb, p_display jsonb, p_completion jsonb, p_status text
) returns boolean language plpgsql set search_path = public, pg_temp as $$
declare c experience_conversations; t experience_turns;
begin
    if p_status not in ('complete', 'interrupted', 'error') then
        raise exception 'Invalid turn status' using errcode = '22023';
    end if;
    select * into c from experience_conversations where id = p_id and user_id = p_user_id for update;
    if not found then raise no_data_found; end if;
    select * into t from experience_turns where id = p_turn_id and conversation_id = p_id and user_id = p_user_id for update;
    if not found then raise no_data_found; end if;
    -- A lost HTTP response may be retried without changing an already committed archive.
    if t.status <> 'running' then
        if t.status <> p_status then
            raise exception 'Turn was already settled differently' using errcode = '40001';
        end if;
        return true;
    end if;
    if c.version is distinct from p_version or c.running_turn is distinct from p_turn_id then
        raise exception 'Stale turn checkpoint' using errcode = '40001';
    end if;
    update experience_turns set raw_messages = p_raw_messages, display = p_display,
        completion = p_completion, status = p_status, completed_at = now(),
        memory_status = case when p_status = 'complete' then 'pending' else 'skipped' end
        where id = p_turn_id;
    update experience_conversations set state = p_state, pending_app_events = p_events,
        messages = p_messages, context = p_context, version = version + 1,
        running_turn = null, updated_at = now() where id = p_id;
    return true;
end $$;

create function public.experience_recover() returns boolean
language plpgsql set search_path = public, pg_temp as $$
begin
    -- Run once at the single worker's startup, never during normal request handling.
    update experience_turns set status = 'interrupted', memory_status = 'skipped', completed_at = now(),
        display = display || jsonb_build_array(jsonb_build_object('type', 'error', 'text', '上一轮回复中断，请继续提问。已完成的购物车操作仍然保留。'))
        where status = 'running';
    update experience_conversations set running_turn = null, version = version + 1,
        pending_app_events = pending_app_events || jsonb_build_array('The previous turn was interrupted. Read the current cart before acting; do not repeat its writes.')
        where running_turn is not null;
    update experience_turns set memory_status = 'pending', memory_claim_id = null, memory_claimed_until = null,
        memory_attempts = greatest(memory_attempts - 1, 0)
        where memory_status = 'processing';
    return true;
end $$;

create function public.experience_claim_memory(p_user_id uuid, p_max_attempts integer, p_lease_seconds double precision) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare job experience_turns;
begin
    -- Serialize the short claim transaction, including expiry recovery. An expired
    -- claimant cannot complete the replacement job because completion checks its id.
    perform pg_advisory_xact_lock(hashtext('experience_memory_claim'));
    update experience_turns set memory_status = 'failed', memory_claim_id = null, memory_claimed_until = null
        where memory_status = 'processing' and memory_claimed_until <= now();
    select t.* into job from experience_turns t
        where t.status = 'complete' and t.memory_status in ('pending', 'failed')
        and t.memory_attempts < p_max_attempts and t.memory_next_attempt <= now()
        and (p_user_id is null or t.user_id = p_user_id)
        and not exists (select 1 from experience_turns earlier where earlier.user_id = t.user_id and earlier.memory_status = 'processing')
        order by t.source_order limit 1 for update skip locked;
    if not found then return null; end if;
    update experience_turns set memory_status = 'processing', memory_attempts = memory_attempts + 1,
        memory_claim_id = gen_random_uuid(), memory_claimed_until = now() + make_interval(secs => greatest(p_lease_seconds, 30))
        where id = job.id returning * into job;
    return to_jsonb(job);
end $$;

create function public.experience_finish_memory(p_turn_id uuid, p_claim_id uuid, p_success boolean, p_delay double precision) returns boolean
language plpgsql set search_path = public, pg_temp as $$
begin
    update experience_turns set memory_status = case when p_success then 'complete' else 'failed' end,
        memory_next_attempt = now() + make_interval(secs => greatest(p_delay, 0)),
        memory_claim_id = null, memory_claimed_until = null
        where id = p_turn_id and memory_status = 'processing' and memory_claim_id = p_claim_id;
    return found;
end $$;

create function public.experience_memory_read(p_user_id uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
    select coalesce(jsonb_agg(to_jsonb(f) - 'user_id' - 'source_order' order by updated_at desc, key), '[]'::jsonb)
        from experience_memory_facts f where user_id = p_user_id;
$$;

create function public.experience_memory_write(p_user_id uuid, p_facts jsonb, p_generation bigint, p_source_order bigint) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare gen bigint; ordering bigint; f jsonb; accepted jsonb := '[]'; changed integer;
begin
    gen := experience_memory_generation(p_user_id);
    if p_generation is not null and p_generation <> gen then return accepted; end if;
    ordering := coalesce(p_source_order, nextval('public.experience_source_order'));
    for f in select value from jsonb_array_elements(p_facts) loop
        if exists (select 1 from experience_memory_deletions where user_id = p_user_id and key = f->>'key' and source_order >= ordering) then
            continue;
        end if;
        insert into experience_memory_facts(user_id, key, value, category, source_session_id, source_order)
            values (p_user_id, f->>'key', f->>'value', f->>'category', f->>'source_session_id', ordering)
            on conflict (user_id, key) do update set value = excluded.value, category = excluded.category,
                source_session_id = excluded.source_session_id, source_order = excluded.source_order, updated_at = now()
                where experience_memory_facts.source_order < excluded.source_order;
        get diagnostics changed = row_count;
        if changed > 0 then accepted := accepted || jsonb_build_array(f->>'key'); end if;
    end loop;
    return accepted;
end $$;

create function public.experience_memory_delete(p_user_id uuid, p_key text) returns boolean
language plpgsql set search_path = public, pg_temp as $$
declare removed boolean;
begin
    perform experience_memory_generation(p_user_id);
    delete from experience_memory_facts where user_id = p_user_id and key = p_key;
    removed := found;
    insert into experience_memory_deletions(user_id, key, source_order)
        values (p_user_id, p_key, nextval('public.experience_source_order'))
        on conflict (user_id, key) do update set source_order = excluded.source_order;
    return removed;
end $$;

create function public.experience_memory_clear(p_user_id uuid) returns boolean
language plpgsql set search_path = public, pg_temp as $$
begin
    perform experience_memory_generation(p_user_id);
    update experience_memory_versions set generation = generation + 1 where user_id = p_user_id;
    delete from experience_memory_facts where user_id = p_user_id;
    return true;
end $$;

create function public.experience_cart(
    p_user_id uuid, p_id uuid, p_action text, p_product jsonb, p_quantity integer, p_operation uuid
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare current_items jsonb; result jsonb; prior experience_cart_operations; line jsonb; old_quantity integer; input jsonb;
begin
    perform experience_load_conversation(p_user_id, p_id);
    select items into current_items from experience_carts where conversation_id = p_id for update;
    if not found then raise no_data_found; end if;
    if p_action = 'get' then return jsonb_build_object('items', current_items, 'currency', 'USD'); end if;
    input := jsonb_build_object('action', p_action, 'product', p_product, 'quantity', p_quantity);
    select * into prior from experience_cart_operations where operation_id = p_operation;
    if found then
        if prior.conversation_id <> p_id or prior.input <> input then
            raise exception 'Operation id reused' using errcode = '40001';
        end if;
        return jsonb_build_object('items', current_items, 'currency', 'USD');
    end if;
    if p_action not in ('add', 'set', 'remove') then raise exception 'Invalid cart operation' using errcode = '22023'; end if;
    select value into line from jsonb_array_elements(current_items) where value->>'product_id' = p_product->>'product_id';
    old_quantity := coalesce((line->>'quantity')::integer, 0);
    if p_action = 'set' and old_quantity = 0 then raise no_data_found; end if;
    if p_action = 'add' then p_quantity := p_quantity + old_quantity; end if;
    if p_action <> 'remove' and (p_quantity < 1 or p_quantity > 24) then raise exception 'Cart quantity cap' using errcode = '22023'; end if;
    select coalesce(jsonb_agg(value), '[]'::jsonb) into current_items from jsonb_array_elements(current_items)
        where value->>'product_id' <> p_product->>'product_id';
    if p_action <> 'remove' then
        current_items := current_items || jsonb_build_array(p_product || jsonb_build_object('quantity', p_quantity));
    end if;
    if jsonb_array_length(current_items) > 100 then raise exception 'Cart line cap' using errcode = '22023'; end if;
    result := jsonb_build_object('items', current_items, 'currency', 'USD');
    update experience_carts set items = current_items, version = version + 1 where conversation_id = p_id;
    insert into experience_cart_operations(operation_id, conversation_id, input, result) values (p_operation, p_id, input, result);
    return result;
end $$;

do $$
declare object record;
begin
    for object in select tablename from pg_tables where schemaname = 'public' and starts_with(tablename, 'experience_') loop
        execute format('revoke all on table public.%I from public, anon, authenticated', object.tablename);
        execute format('grant all on table public.%I to service_role', object.tablename);
    end loop;
    for object in select oid::regprocedure as signature from pg_proc where pronamespace = 'public'::regnamespace and starts_with(proname, 'experience_') loop
        execute format('revoke all on function %s from public, anon, authenticated', object.signature);
        execute format('grant execute on function %s to service_role', object.signature);
    end loop;
end $$;
revoke all on sequence public.experience_source_order from public, anon, authenticated;
grant usage, select on sequence public.experience_source_order to service_role;

commit;
