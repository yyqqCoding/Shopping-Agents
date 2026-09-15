-- Evidence may belong to a concrete variant (for example, OD-4001-S), while
-- catalog_products stores only the family id.  The original 003 migration added
-- a family-only foreign key, which made the catalog import return HTTP 409 for
-- valid variant evidence.  Existing databases need this one-time migration;
-- fresh databases get the corrected definition directly from 003.
begin;

alter table if exists public.catalog_evidence
    drop constraint if exists catalog_evidence_product_id_fkey;

commit;
