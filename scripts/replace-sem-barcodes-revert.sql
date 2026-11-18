-- REVERT of migration 0005_replace_sem_barcodes (D-24): gives each product its old 'sem-<digits>' code back (original letter case),
-- read from the audit events the migration wrote. NOT a drizzle migration: run it only by decision of the owner,
-- in its own approved PR/workflow, never by hand on production. The Neon backup branch is the other way back.
--
-- A product gets its old code back only when ALL of these hold:
--   * its current barcode is still the code the migration gave it (changes.barcode.to), so a later edit by the owner is kept;
--   * the old code is still free in that shop (no other product holds it, active or not).
-- Anything else is skipped and counted in the notice at the end. Nothing fails because of a skipped product.
-- Each revert writes an audit event of its own (actor 'system:revert-0005'); running it twice changes nothing the second time.
DO $$
DECLARE
  ev record;
  reverted integer := 0;
  skipped integer := 0;
BEGIN
  FOR ev IN
    SELECT a.merchant_id, a.aggregate_id AS product_id,
           a.details #>> '{changes,barcode,from}' AS old_code,
           a.details #>> '{changes,barcode,to}' AS new_code
    FROM audit_events a
    WHERE a.event_type = 'PRODUCT_UPDATED'
      AND a.actor_id = 'system:migration-0005'
      AND a.details ->> 'source' = 'migration:0005_replace_sem_barcodes'
    ORDER BY a.created_at, a.id
  LOOP
    IF EXISTS (SELECT 1 FROM products p WHERE p.id = ev.product_id AND p.merchant_id = ev.merchant_id AND p.barcode = ev.new_code)
       AND NOT EXISTS (SELECT 1 FROM products p WHERE p.merchant_id = ev.merchant_id AND p.barcode = ev.old_code)
    THEN
      UPDATE products
      SET barcode = ev.old_code,
          updated_at = GREATEST(
            date_trunc('milliseconds', clock_timestamp()),
            date_trunc('milliseconds', updated_at) + interval '1 millisecond'
          )
      WHERE id = ev.product_id;

      INSERT INTO audit_events (merchant_id, event_type, actor_id, aggregate_type, aggregate_id, details)
      VALUES (
        ev.merchant_id, 'PRODUCT_UPDATED', 'system:revert-0005', 'PRODUCT', ev.product_id,
        jsonb_build_object(
          'changes', jsonb_build_object('barcode', jsonb_build_object('from', ev.new_code, 'to', ev.old_code)),
          'source', 'revert:0005_replace_sem_barcodes'
        )
      );
      reverted := reverted + 1;
    ELSE
      skipped := skipped + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'revert 0005: % code(s) given back, % skipped (edited since, or the old code is taken)', reverted, skipped;
END
$$;
