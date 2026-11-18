-- 0005_replace_sem_barcodes: DATA ONLY migration (D-24, bulk replacement). No schema change.
--
-- What it does: every product whose barcode is NOT a valid barcode gets a generated barcode (D-23):
-- 13 digits = '29' + 10 random digits + EAN-13 check digit.
--
-- "Valid" = only digits AND one of:
--   * 13 digits with a correct EAN-13 check digit;
--   * 8 digits with a correct EAN-8 check digit;
--   * 12 digits with a correct UPC-A check digit;
--   * 14 digits with a correct GTIN-14 check digit.
-- Everything else is replaced: 'sem-'/'SEM-' in any form, letters only, letters and numbers, symbols or spaces,
-- digits only but of another length, a wrong check digit, empty or only spaces.
-- Why: the owner asked for everything outside the standard to be replaced, and a barcode reader cannot read a code
-- with a wrong check digit. A valid generated '29...' code is a valid EAN-13, so it stays.
--
-- What it never touches:
--   * valid barcodes (EAN-13, EAN-8, UPC-A, GTIN-14), including the already generated 29... ones;
--   * sales, sale items, stock (inventory_items, inventory_movements): they point to products.id, not to the barcode text.
--
-- Scope: all shops, active and inactive products. Safe to run twice (the second run finds only valid codes and does nothing).
-- All or nothing: the replacement runs inside ONE statement (the DO block), so a failure undoes every change.
-- The old code stays recoverable: each swap writes an audit event with changes.barcode {from, to},
-- and 'from' is the old code exactly as it was, whatever it was.
-- To give the old codes back see scripts/replace-sem-barcodes-revert.sql (not part of the migrations).
-- To preview what would change (read only) see scripts/replace-sem-barcodes-preview.sql.

-- Step 1. Three helper functions, created here and dropped in the last step of this same file.
-- EAN-13 check digit of the first 12 digits: odd positions weigh 1, even positions weigh 3,
-- digit = (10 - sum mod 10) mod 10. Same rule as ean13CheckDigit in src/modules/products/domain/generated-barcode.ts.
CREATE FUNCTION tmp_ean13_check_digit(first12 text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT ((10 - (sum(substr(first12, i, 1)::integer * CASE WHEN i % 2 = 1 THEN 1 ELSE 3 END) % 10)) % 10)::integer
  FROM generate_series(1, 12) AS i
$$;
--> statement-breakpoint

-- Is this text a valid barcode? Only digits, of length 8, 12, 13 or 14, with the right check digit.
-- Weights over the data digits (all digits but the last): the data digit next to the check digit weighs 3 and the
-- weights alternate 3, 1 going left. That gives 1,3,1,3... from the left for the 12 data digits of EAN-13, and
-- 3,1,3,1... from the left for the 7 of EAN-8, the 11 of UPC-A and the 13 of GTIN-14.
-- digit = (10 - sum mod 10) mod 10. A text that is not only digits, or has another length, is never valid.
CREATE FUNCTION tmp_is_valid_barcode(code text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  expected integer;
BEGIN
  -- Checked first, in order, so the digit arithmetic below never sees a text that is not only digits.
  IF code !~ '^[0-9]+$' OR length(code) NOT IN (8, 12, 13, 14) THEN
    RETURN false;
  END IF;
  SELECT (10 - (sum(substr(code, i, 1)::integer * CASE WHEN (length(code) - 1 - i) % 2 = 0 THEN 3 ELSE 1 END) % 10)) % 10
  INTO expected
  FROM generate_series(1, length(code) - 1) AS i;
  RETURN expected = substr(code, length(code), 1)::integer;
END
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
  -- Only codes that are not valid barcodes (it reads all of products once, fine for a one-off).
  -- FOR UPDATE locks those rows until the end.
  -- 'from' in the audit below is target.barcode, the old code exactly as it was.
  -- The list is fixed when the loop starts, so rows changed below are not visited again.
  FOR target IN
    SELECT id, merchant_id, barcode
    FROM products
    WHERE NOT tmp_is_valid_barcode(barcode)
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
DROP FUNCTION tmp_is_valid_barcode(text);
--> statement-breakpoint
DROP FUNCTION tmp_ean13_check_digit(text);
