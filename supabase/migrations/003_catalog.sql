-- Catalog storage and read-only search functions.
-- The API sends structured values to these functions; it never sends model-written SQL.
begin;

-- Trigram matching keeps residual Chinese/Latin keyword lookups bounded.  Structured
-- category, price, rating and stock filters remain the primary selective predicates.
create extension if not exists pg_trgm;

create table if not exists public.catalog_products (
    product_id text primary key,
    title text not null,
    category text,
    price numeric(12, 2) not null,
    currency text not null default 'CNY',
    rating numeric(3, 2),
    review_count integer,
    in_stock boolean not null default true,
    retired boolean not null default false,
    display_order integer not null default 0,
    search_text text not null default '',
    attributes jsonb not null default '{}',
    payload jsonb not null,
    updated_at timestamptz not null default now()
);

create table if not exists public.catalog_variants (
    product_id text primary key,
    variant_of text not null references public.catalog_products(product_id) on delete cascade,
    title text not null,
    price numeric(12, 2) not null,
    currency text not null default 'CNY',
    in_stock boolean not null default true,
    retired boolean not null default false,
    search_text text not null default '',
    attributes jsonb not null default '{}',
    payload jsonb not null,
    updated_at timestamptz not null default now()
);

create table if not exists public.catalog_policies (
    policy_id text primary key,
    title text not null,
    category text,
    content text not null,
    search_text text not null default '',
    payload jsonb not null
);

create table if not exists public.catalog_evidence (
    product_id text primary key references public.catalog_products(product_id) on delete cascade,
    payload jsonb not null,
    updated_at timestamptz not null default now()
);

create index if not exists catalog_products_category_order
    on public.catalog_products(category, retired, display_order, product_id);
create index if not exists catalog_products_category_price
    on public.catalog_products(category, retired, price, product_id);
create index if not exists catalog_products_category_rating
    on public.catalog_products(category, retired, rating desc nulls last, product_id);
create index if not exists catalog_variants_family_stock_price
    on public.catalog_variants(variant_of, retired, in_stock, price, product_id);
create index if not exists catalog_products_search_text
    on public.catalog_products using gin (lower(search_text) gin_trgm_ops);

alter table public.catalog_products enable row level security;
alter table public.catalog_variants enable row level security;
alter table public.catalog_policies enable row level security;
alter table public.catalog_evidence enable row level security;

-- The service role used by the FastAPI server bypasses these policies. Browser roles
-- receive data only through the server routes, so a public key cannot enumerate the
-- catalog tables directly.

create or replace function public.catalog_search_products(
    p_terms jsonb default '[]'::jsonb,
    p_category text default null,
    p_min_price numeric default null,
    p_max_price numeric default null,
    p_min_rating numeric default null,
    p_in_stock boolean default null,
    p_attributes jsonb default '{}'::jsonb,
    p_sort text default 'relevance',
    p_limit integer default 6,
    p_cursor jsonb default null
) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
with candidate_rows as (
    select
        p.payload,
        p.product_id,
        p.price as base_price,
        p.rating,
        p.display_order,
        case when p_sort = 'price_asc' then p.price end as price_asc,
        case when p_sort = 'price_desc' then p.price end as price_desc,
        case when p_sort = 'rating' then coalesce(p.rating, -1) end as rating_sort,
        coalesce((
            select max(2.0)
            from jsonb_array_elements_text(coalesce(p_terms, '[]'::jsonb)) term
            where lower(p.search_text) like '%' || lower(term) || '%'
        ), 0.0) as relevance
    from catalog_products p
    where not p.retired
      and (p_category is null or p.category = p_category)
      and (p_min_rating is null or p.rating >= p_min_rating)
      and (p_terms is null or jsonb_array_length(p_terms) = 0 or exists (
          select 1
          from jsonb_array_elements_text(p_terms) term
          where lower(p.search_text) like '%' || lower(term) || '%'
      ))
      -- All price, stock and attribute predicates below are evaluated against one
      -- variant.  This prevents a family from passing because one colour is cheap
      -- while a different size is the only one in stock.
      and (
          (
              not exists (select 1 from catalog_variants v where v.variant_of = p.product_id)
              and (p_min_price is null or p.price >= p_min_price)
              and (p_max_price is null or p.price <= p_max_price)
              and (p_in_stock is null or p.in_stock = p_in_stock)
              and not exists (
                  select 1 from jsonb_each_text(coalesce(p_attributes, '{}'::jsonb)) f
                  where not (
                      (f.key like 'max_%' and f.value ~ '^-?[0-9]+([.][0-9]+)?$' and nullif(regexp_replace(coalesce(p.attributes ->> regexp_replace(f.key, '^max_', ''), ''), '[^0-9.-]', '', 'g'), '')::numeric <= f.value::numeric)
                      or (f.key like 'min_%' and f.value ~ '^-?[0-9]+([.][0-9]+)?$' and nullif(regexp_replace(coalesce(p.attributes ->> regexp_replace(f.key, '^min_', ''), ''), '[^0-9.-]', '', 'g'), '')::numeric >= f.value::numeric)
                      or (f.key not like 'max_%' and f.key not like 'min_%' and lower(coalesce(p.attributes ->> f.key, '')) like '%' || lower(f.value) || '%')
                  )
              )
          )
          or exists (
              select 1 from catalog_variants v
              where v.variant_of = p.product_id and not v.retired
                and (p_min_price is null or v.price >= p_min_price)
                and (p_max_price is null or v.price <= p_max_price)
                and (p_in_stock is null or v.in_stock = p_in_stock)
                and not exists (
                    select 1 from jsonb_each_text(coalesce(p_attributes, '{}'::jsonb)) f
                    where not (
                        (f.key like 'max_%' and f.value ~ '^-?[0-9]+([.][0-9]+)?$' and nullif(regexp_replace(coalesce(v.attributes ->> regexp_replace(f.key, '^max_', ''), ''), '[^0-9.-]', '', 'g'), '')::numeric <= f.value::numeric)
                        or (f.key like 'min_%' and f.value ~ '^-?[0-9]+([.][0-9]+)?$' and nullif(regexp_replace(coalesce(v.attributes ->> regexp_replace(f.key, '^min_', ''), ''), '[^0-9.-]', '', 'g'), '')::numeric >= f.value::numeric)
                        or (f.key not like 'max_%' and f.key not like 'min_%' and lower(coalesce(v.attributes ->> f.key, '')) like '%' || lower(f.value) || '%')
                    )
                )
          )
      )
), filtered as (
    select * from candidate_rows
    where p_cursor is null
       or p_sort = 'price_asc' and (price_asc, product_id) > ((p_cursor ->> 'price')::numeric, p_cursor ->> 'id')
       or p_sort = 'price_desc' and (price_desc, product_id) < ((p_cursor ->> 'price')::numeric, p_cursor ->> 'id')
       or p_sort = 'rating' and (
           rating_sort < (p_cursor ->> 'rating')::numeric
           or (rating_sort = (p_cursor ->> 'rating')::numeric and product_id > (p_cursor ->> 'id'))
       )
       or p_sort = 'relevance' and (
           relevance < (p_cursor ->> 'relevance')::numeric
           or (relevance = (p_cursor ->> 'relevance')::numeric and display_order > (p_cursor ->> 'display_order')::integer)
           or (relevance = (p_cursor ->> 'relevance')::numeric and display_order = (p_cursor ->> 'display_order')::integer and product_id > (p_cursor ->> 'id'))
       )
), page as (
    select * from filtered
    order by
      case when p_sort = 'price_asc' then price_asc end asc nulls last,
      case when p_sort = 'price_desc' then price_desc end desc nulls last,
      case when p_sort = 'rating' then rating_sort end desc,
      case when p_sort = 'relevance' then relevance end desc,
      display_order,
      product_id
    limit greatest(1, least(coalesce(p_limit, 6), 8)) + 1
), numbered as (
    select page.*, row_number() over () as row_number from page
)
select jsonb_build_object(
    'products', coalesce((select jsonb_agg(payload order by row_number) from numbered where row_number <= greatest(1, least(coalesce(p_limit, 6), 8))), '[]'::jsonb),
    'has_more', exists (select 1 from numbered where row_number > greatest(1, least(coalesce(p_limit, 6), 8))),
    'next_cursor', (select jsonb_build_object(
        'id', product_id,
        'price', coalesce(price_asc, price_desc, base_price),
        'rating', rating_sort,
        'relevance', relevance,
        'display_order', display_order
    ) from numbered where row_number = greatest(1, least(coalesce(p_limit, 6), 8)) + 1)
);
$$;

create or replace function public.catalog_get_product(p_product_id text)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
select payload from (
    select p.payload || jsonb_build_object('variants', coalesce((
        select jsonb_agg(v.payload order by v.product_id)
        from catalog_variants v where v.variant_of = p.product_id
    ), '[]'::jsonb)) as payload
    from catalog_products p where p.product_id = p_product_id
    union all
    select v.payload
    from catalog_variants v
    where v.product_id = p_product_id
      and not exists (select 1 from catalog_products p where p.product_id = p_product_id)
) records
limit 1;
$$;

create or replace function public.catalog_search_policies(p_terms jsonb default '[]'::jsonb, p_limit integer default 3)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
select coalesce(jsonb_agg(page.payload order by page.policy_id), '[]'::jsonb)
from (
    select p.policy_id, p.payload
    from catalog_policies p
    where p_terms is null or jsonb_array_length(p_terms) = 0 or exists (
        select 1 from jsonb_array_elements_text(p_terms) term
        where lower(p.search_text) like '%' || lower(term) || '%'
    )
    order by p.policy_id
    limit greatest(1, least(coalesce(p_limit, 3), 5))
) page;
$$;

revoke all on function public.catalog_search_products(jsonb, text, numeric, numeric, numeric, boolean, jsonb, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.catalog_get_product(text) from public, anon, authenticated;
revoke all on function public.catalog_search_policies(jsonb, integer) from public, anon, authenticated;
grant execute on function public.catalog_search_products(jsonb, text, numeric, numeric, numeric, boolean, jsonb, text, integer, jsonb) to service_role;
grant execute on function public.catalog_get_product(text) to service_role;
grant execute on function public.catalog_search_policies(jsonb, integer) to service_role;

commit;
