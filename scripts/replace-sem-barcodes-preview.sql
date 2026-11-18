-- READ ONLY preview of migration 0005_replace_sem_barcodes (D-24). It changes nothing: two SELECT statements.
-- Run it in the Neon SQL editor (ideally on the backup branch) BEFORE the migration is approved.
-- Tip: start the session with  BEGIN READ ONLY;  and finish with  ROLLBACK;  so the database itself refuses any write.
--
-- Rule (same as the migration): every product whose barcode is NOT valid is replaced, in every shop, active or inactive.
-- Valid = only digits AND (13 digits with a correct EAN-13 check digit, OR 8 digits with a correct EAN-8 check digit,
-- OR 12 digits with a correct UPC-A check digit, OR 14 digits with a correct GTIN-14 check digit).
-- Valid codes are KEPT and only counted, by type.
--
-- Statement 1: one row per product that WOULD BE REPLACED, per shop, with the reason.
-- Columns has_sales / has_stock_movement are only information: sales and stock follow the product id and do not change.
WITH base AS (
  SELECT
    p.merchant_id,
    p.id,
    p.name,
    p.barcode,
    p.active,
    length(p.barcode) AS len,
    p.barcode ~ '^[0-9]+$' AS only_digits,
    -- Check digit rule: the data digit next to the check digit weighs 3 and the weights alternate 3, 1 going left.
    -- The CASE keeps the digit arithmetic away from texts that are not only digits.
    CASE
      WHEN p.barcode ~ '^[0-9]+$' AND length(p.barcode) IN (8, 12, 13, 14) THEN
        (10 - (SELECT sum(substr(p.barcode, i, 1)::integer * CASE WHEN (length(p.barcode) - 1 - i) % 2 = 0 THEN 3 ELSE 1 END)
               FROM generate_series(1, length(p.barcode) - 1) AS i) % 10) % 10 = substr(p.barcode, length(p.barcode), 1)::integer
      ELSE false
    END AS check_ok
  FROM products p
),
classified AS (
  SELECT
    b.*,
    CASE WHEN b.check_ok THEN 'KEEP' ELSE 'REPLACE' END AS action,
    CASE
      WHEN b.check_ok THEN
        CASE b.len WHEN 13 THEN 'valid EAN-13' WHEN 8 THEN 'valid EAN-8' WHEN 12 THEN 'valid UPC-A' ELSE 'valid GTIN-14' END
      WHEN btrim(b.barcode) = '' THEN 'empty or only spaces'
      WHEN lower(left(b.barcode, 4)) = 'sem-' THEN 'sem-'
      WHEN b.only_digits THEN
        CASE b.len
          WHEN 13 THEN 'wrong check digit EAN-13'
          WHEN 8 THEN 'wrong check digit EAN-8'
          WHEN 12 THEN 'wrong check digit UPC-A'
          WHEN 14 THEN 'wrong check digit GTIN-14'
          ELSE 'only digits, invalid size'
        END
      WHEN b.barcode ~ '^[[:alpha:]]+$' THEN 'only letters'
      WHEN b.barcode ~ '^[[:alnum:]]+$' THEN 'letters and numbers'
      ELSE 'symbol or space'
    END AS reason
  FROM base b
)
SELECT
  m.name AS shop, c.merchant_id, c.reason, c.id AS product_id, c.name AS product, c.barcode, c.active,
  EXISTS (SELECT 1 FROM sale_items si WHERE si.product_id = c.id) AS has_sales,
  EXISTS (SELECT 1 FROM inventory_movements im WHERE im.product_id = c.id) AS has_stock_movement
FROM classified c
JOIN merchants m ON m.id = c.merchant_id
WHERE c.action = 'REPLACE'
ORDER BY m.name, c.merchant_id, c.reason, c.name, c.id;

-- Statement 2: the totals per shop. REPLACE rows are broken down by reason; KEEP rows only by type of valid code.
-- The REPLACE total is the number of audit events the migration will write.
WITH base AS (
  SELECT
    p.merchant_id,
    p.active,
    length(p.barcode) AS len,
    p.barcode,
    p.barcode ~ '^[0-9]+$' AS only_digits,
    CASE
      WHEN p.barcode ~ '^[0-9]+$' AND length(p.barcode) IN (8, 12, 13, 14) THEN
        (10 - (SELECT sum(substr(p.barcode, i, 1)::integer * CASE WHEN (length(p.barcode) - 1 - i) % 2 = 0 THEN 3 ELSE 1 END)
               FROM generate_series(1, length(p.barcode) - 1) AS i) % 10) % 10 = substr(p.barcode, length(p.barcode), 1)::integer
      ELSE false
    END AS check_ok
  FROM products p
),
classified AS (
  SELECT
    b.merchant_id,
    b.active,
    CASE WHEN b.check_ok THEN 'KEEP' ELSE 'REPLACE' END AS action,
    CASE
      WHEN b.check_ok THEN
        CASE b.len WHEN 13 THEN 'valid EAN-13' WHEN 8 THEN 'valid EAN-8' WHEN 12 THEN 'valid UPC-A' ELSE 'valid GTIN-14' END
      WHEN btrim(b.barcode) = '' THEN 'empty or only spaces'
      WHEN lower(left(b.barcode, 4)) = 'sem-' THEN 'sem-'
      WHEN b.only_digits THEN
        CASE b.len
          WHEN 13 THEN 'wrong check digit EAN-13'
          WHEN 8 THEN 'wrong check digit EAN-8'
          WHEN 12 THEN 'wrong check digit UPC-A'
          WHEN 14 THEN 'wrong check digit GTIN-14'
          ELSE 'only digits, invalid size'
        END
      WHEN b.barcode ~ '^[[:alpha:]]+$' THEN 'only letters'
      WHEN b.barcode ~ '^[[:alnum:]]+$' THEN 'letters and numbers'
      ELSE 'symbol or space'
    END AS reason
  FROM base b
)
SELECT m.name AS shop, c.merchant_id, c.action, c.reason,
       count(*)::integer AS products,
       count(*) FILTER (WHERE c.active)::integer AS active_products,
       count(*) FILTER (WHERE NOT c.active)::integer AS inactive_products
FROM classified c
JOIN merchants m ON m.id = c.merchant_id
GROUP BY m.name, c.merchant_id, c.action, c.reason
ORDER BY m.name, c.merchant_id, c.action, c.reason;
