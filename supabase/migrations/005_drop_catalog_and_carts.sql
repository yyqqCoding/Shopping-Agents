-- Apply once, after the commerce service serves the catalog, carts and orders
-- (CATALOG_BACKEND=java). Removes the catalog tables of 003/004 and the conversation
-- carts of 001/002; their data is not migrated. Conversations, turns and memory stay.
begin;

drop function if exists public.catalog_search_products(jsonb, text, numeric, numeric, numeric, boolean, jsonb, text, integer, jsonb);
drop function if exists public.catalog_get_product(text);
drop function if exists public.catalog_search_policies(jsonb, integer);
drop table if exists public.catalog_evidence;
drop table if exists public.catalog_variants;
drop table if exists public.catalog_products;
drop table if exists public.catalog_policies;

drop function if exists public.experience_cart(uuid, uuid, text, jsonb, integer, uuid);

-- 001 created a cart row with each conversation; the commerce service keeps carts now.
-- create or replace keeps the function's existing grants.
create or replace function public.experience_create_conversation(p_user_id uuid, p_request_id uuid) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare result experience_conversations;
begin
    insert into experience_conversations(user_id, create_request_id) values (p_user_id, p_request_id)
        on conflict (user_id, create_request_id) do update set create_request_id = excluded.create_request_id
        returning * into result;
    return jsonb_build_object('id', result.id, 'title', result.title, 'created_at', result.created_at, 'updated_at', result.updated_at);
end $$;

drop table if exists public.experience_cart_operations;
drop table if exists public.experience_carts;

commit;
