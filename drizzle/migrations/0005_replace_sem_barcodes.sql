-- 0005_replace_sem_barcodes: DATA ONLY migration (D-24, bulk replacement). No schema change.
--
-- What it does: every product whose barcode is 'sem-' followed only by digits, in ANY letter case
-- ('sem-123', 'SEM-1001', 'Sem-5'; regex ^sem-[0-9]+$, case-insensitive) gets a generated
-- barcode (D-23): 13 digits = '29' + 10 random digits + EAN-13 check digit.
-- Why: that is the format the owner typed by hand, and no manufacturer uses it.
--
-- What it never touches:
--   * any other barcode: 'SEM-ABC', 'sem-12a', 'sem-', 'sem-1-2' (letters or symbols after the hyphen), EAN-8, UPC-12, a valid EAN-13, an already generated 29..., anything else;
--   * sales, sale items, stock (inventory_items, inventory_movements): they point to products.id, not to the barcode text.
--
-- Scope: all shops, active and inactive products. Safe to run twice (the second run finds no 'sem-<digits>' and does nothing).
-- All or nothing: the replacement runs inside ONE statement (the DO block), so a failure undoes every change.
-- The old code stays recoverable: each swap writes an audit event with changes.barcode {from, to},
-- and 'from' is the old code exactly as it was, lowercase or not.
-- To give the old codes back see scripts/replace-sem-barcodes-revert.sql (not part of the migrations).
-- To preview what would change (read only) see scripts/replace-sem-barcodes-preview.sql.

-- Step 1. Two helper functions, created here and dropped in the last step of this same file.
-- EAN-13 check digit of the first 12 digits: odd positions weigh 1, even positions weigh 3,
-- digit = (10 - sum mod 10) mod 10. Same rule as ean13CheckDigit in src/modules/products/domain/generated-barcode.ts.
CREATE FUNCTION tmp_ean13_check_digit(first12 text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT ((10 - (sum(substr(first12, i, 1)::integer * CASE WHEN i % 2 = 1 THEN 1 ELSE 3 END) % 10)) % 10)::integer
  FROM generate_series(1, 12) AS i
$$;
--> statement-breakpoint

-- Same rule as generateBarcode in the TypeScript domain: '29' + 10 random digits + check digit.
CREATE FUNCTION tmp_generated_barcode() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  digits text := '';
  first12 text;
BEGIN
  FOR i IN 1..10 LOOP
    digits := digits || floor(random() * 10)::integer::text;
  END LOOP;
  first12 := '29' || digits;
  RETURN first12 || tmp_ean13_check_digit(first12)::text;
END
$$;
--> statement-breakpoint

-- Step 2. The replacement itself, one product at a time, all inside this single DO block.
DO $$
DECLARE
  target record;
  new_code text;
  attempts integer;
  replaced integer := 0;
BEGIN
  -- Only codes that are 'sem-' + digits in any letter case (~* is the case-insensitive regex match; it does not
  -- use the barcode index, fine for a one-off read of products). FOR UPDATE locks those rows until the end.
  -- 'from' in the audit below is target.barcode, the old code exactly as it was (lowercase or not).
  -- The list is fixed when the loop starts, so rows changed below are not visited again.
  FOR target IN
    SELECT id, merchant_id, barcode
    FROM products
    WHERE barcode ~* '^sem-[0-9]+$'
    ORDER BY merchant_id, id
    FOR UPDATE
  LOOP
    -- Draw until the code is free IN THIS SHOP. The check reads the table as it is right now, so it also
    -- sees the codes this same run has already given to other products (and codes of inactive products).
    -- The unique index uq_products_merchant_barcode is the final guard against a race.
    attempts := 0;
    LOOP
      attempts := attempts + 1;
      IF attempts > 20 THEN
        -- Aborts the whole DO block: nothing stays changed. The message holds no barcode.
        RAISE EXCEPTION 'replace_sem_barcodes: no free code after 20 draws for product %', target.id;
      END IF;
      new_code := tmp_generated_barcode();
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM products p WHERE p.merchant_id = target.merchant_id AND p.barcode = new_code
      );
    END LOOP;

    -- Swap the code. updated_at moves strictly forward in whole milliseconds, like the app edit does,
    -- so an edit panel that was open before the migration gets the "reload" warning.
    UPDATE products
    SET barcode = new_code,
        updated_at = GREATEST(
          date_trunc('milliseconds', clock_timestamp()),
          date_trunc('milliseconds', updated_at) + interval '1 millisecond'
        )
    WHERE id = target.id;

    -- One audit event per swap, same shape as the app's PRODUCT_UPDATED, plus the marker of the bulk swap.
    -- audit_events.actor_id is NOT NULL, so the actor is a fixed system text (not a real user).
    INSERT INTO audit_events (merchant_id, event_type, actor_id, aggregate_type, aggregate_id, details)
    VALUES (
      target.merchant_id,
      'PRODUCT_UPDATED',
      'system:migration-0005',
      'PRODUCT',
      target.id,
      jsonb_build_object(
        'changes', jsonb_build_object('barcode', jsonb_build_object('from', target.barcode, 'to', new_code)),
        'barcodeGenerated', true,
        'source', 'migration:0005_replace_sem_barcodes'
      )
    );

    replaced := replaced + 1;
  END LOOP;

  RAISE NOTICE 'replace_sem_barcodes: % product code(s) replaced', replaced;
END
$$;
--> statement-breakpoint

-- Step 3. Remove the helper functions this file created.
DROP FUNCTION tmp_generated_barcode();
--> statement-breakpoint
DROP FUNCTION tmp_ean13_check_digit(text);
