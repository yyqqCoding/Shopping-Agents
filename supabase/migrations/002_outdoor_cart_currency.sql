-- Apply after 001, with the application API stopped. Existing amounts remain USD.
begin;

alter table public.experience_carts
    add column currency text not null default 'USD'
    check (currency ~ '^[A-Z]{3}$');
alter table public.experience_carts alter column currency set default 'CNY';

create or replace function public.experience_cart(
    p_user_id uuid, p_id uuid, p_action text, p_product jsonb, p_quantity integer, p_operation uuid
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
    current_items jsonb;
    current_currency text;
    incoming_currency text;
    result jsonb;
    prior experience_cart_operations;
    line jsonb;
    old_quantity integer;
    input jsonb;
begin
    perform experience_load_conversation(p_user_id, p_id);
    select items, currency into current_items, current_currency
        from experience_carts where conversation_id = p_id for update;
    if not found then raise no_data_found; end if;
    if p_action = 'get' then
        return jsonb_build_object('items', current_items, 'currency', current_currency, 'schema_version', 2);
    end if;
    input := jsonb_build_object('action', p_action, 'product', p_product, 'quantity', p_quantity);
    select * into prior from experience_cart_operations where operation_id = p_operation;
    if found then
        if prior.conversation_id <> p_id or prior.input <> input then
            raise exception 'Operation id reused' using errcode = '40001';
        end if;
        return jsonb_build_object('items', current_items, 'currency', current_currency, 'schema_version', 2);
    end if;
    if p_action not in ('add', 'set', 'remove') then
        raise exception 'Invalid cart operation' using errcode = '22023';
    end if;
    if p_action <> 'remove' then
        -- Old clients omitted currency and authored USD amounts; never relabel them.
        incoming_currency := coalesce(nullif(p_product->>'currency', ''), 'USD');
        if incoming_currency !~ '^[A-Z]{3}$' then
            raise exception 'Invalid currency' using errcode = '22023';
        end if;
        if jsonb_array_length(current_items) > 0 and incoming_currency <> current_currency then
            raise exception 'Cart currencies must match' using errcode = '40001';
        end if;
        if jsonb_array_length(current_items) = 0 then
            current_currency := incoming_currency;
        end if;
    end if;
    select value into line from jsonb_array_elements(current_items)
        where value->>'product_id' = p_product->>'product_id';
    old_quantity := coalesce((line->>'quantity')::integer, 0);
    if p_action = 'set' and old_quantity = 0 then raise no_data_found; end if;
    if p_action = 'add' then p_quantity := p_quantity + old_quantity; end if;
    if p_action <> 'remove' and (p_quantity < 1 or p_quantity > 24) then
        raise exception 'Cart quantity cap' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(value), '[]'::jsonb) into current_items
        from jsonb_array_elements(current_items)
        where value->>'product_id' <> p_product->>'product_id';
    if p_action <> 'remove' then
        current_items := current_items || jsonb_build_array(
            (p_product - 'currency') || jsonb_build_object('quantity', p_quantity)
        );
    end if;
    if jsonb_array_length(current_items) > 100 then
        raise exception 'Cart line cap' using errcode = '22023';
    end if;
    result := jsonb_build_object('items', current_items, 'currency', current_currency, 'schema_version', 2);
    update experience_carts set items = current_items, currency = current_currency,
        version = version + 1 where conversation_id = p_id;
    insert into experience_cart_operations(operation_id, conversation_id, input, result)
        values (p_operation, p_id, input, result);
    return result;
end $$;

revoke all on function public.experience_cart(uuid, uuid, text, jsonb, integer, uuid)
    from public, anon, authenticated;
grant execute on function public.experience_cart(uuid, uuid, text, jsonb, integer, uuid)
    to service_role;

commit;
