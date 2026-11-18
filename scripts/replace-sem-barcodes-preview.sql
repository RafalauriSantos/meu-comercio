-- READ ONLY preview of migration 0005_replace_sem_barcodes (D-24). It changes nothing: two SELECT statements.
-- Run it in the Neon SQL editor (ideally on the backup branch) BEFORE the migration is approved.
-- Tip: start the session with  BEGIN READ ONLY;  and finish with  ROLLBACK;  so the database itself refuses any write.
--
-- Rule (same as the migration): only a barcode that is 'sem-' followed by digits only, in any letter case
-- (regex ^sem-[0-9]+$, case-insensitive: sem-123, SEM-1001, Sem-5), is replaced, in every shop,
-- active or inactive. Everything else is KEPT and listed with the reason, for the owner to decide one by one.
--
-- Statement 1: one row per product, per shop. action = REPLACE or KEEP.
-- Columns has_sales / has_stock_movement are only information: sales and stock follow the product id and do not change.
WITH classified AS (
  SELECT
    m.name AS shop,
    p.merchant_id,
    p.id AS product_id,
    p.name AS product,
    p.barcode,
    p.active,
    EXISTS (SELECT 1 FROM sale_items si WHERE si.product_id = p.id) AS has_sales,
    EXISTS (SELECT 1 FROM inventory_movements im WHERE im.product_id = p.id) AS has_stock_movement,
    CASE
      WHEN p.barcode ~* '^sem-[0-9]+$' THEN 'REPLACE'
      ELSE 'KEEP'
    END AS action,
    CASE
      WHEN p.barcode ~* '^sem-[0-9]+$' THEN 'sem- followed only by digits'
      WHEN lower(left(p.barcode, 4)) = 'sem-' THEN 'sem- com outro formato'
      WHEN p.barcode ~ '^[0-9]{8}$' THEN 'EAN-8'
      WHEN p.barcode ~ '^[0-9]{12}$' THEN 'UPC-12'
      WHEN p.barcode ~ '^[0-9]{13}$' THEN
        CASE
          WHEN (10 - (SELECT sum(substr(p.barcode, i, 1)::integer * CASE WHEN i % 2 = 1 THEN 1 ELSE 3 END)
                      FROM generate_series(1, 12) AS i) % 10) % 10 = substr(p.barcode, 13, 1)::integer
            THEN CASE WHEN left(p.barcode, 2) = '29' THEN 'valid EAN-13 (generated 29...)' ELSE 'valid EAN-13' END
          ELSE '13 digits, invalid check digit'
        END
      ELSE 'other format'
    END AS reason
  FROM products p
  JOIN merchants m ON m.id = p.merchant_id
)
SELECT shop, merchant_id, action, reason, product_id, product, barcode, active, has_sales, has_stock_movement
FROM classified
WHERE action = 'REPLACE' OR (reason <> 'valid EAN-13' AND reason <> 'valid EAN-13 (generated 29...)')
ORDER BY shop, merchant_id, action, reason, product, product_id;

-- Statement 2: the totals per shop (what would be replaced, and what stays, by reason).
WITH classified AS (
  SELECT
    p.merchant_id,
    CASE
      WHEN p.barcode ~* '^sem-[0-9]+$' THEN 'REPLACE'
      ELSE 'KEEP'
    END AS action,
    CASE
      WHEN p.barcode ~* '^sem-[0-9]+$' THEN 'sem- followed only by digits'
      WHEN lower(left(p.barcode, 4)) = 'sem-' THEN 'sem- com outro formato'
      WHEN p.barcode ~ '^[0-9]{8}$' THEN 'EAN-8'
      WHEN p.barcode ~ '^[0-9]{12}$' THEN 'UPC-12'
      WHEN p.barcode ~ '^[0-9]{13}$' THEN
        CASE
          WHEN (10 - (SELECT sum(substr(p.barcode, i, 1)::integer * CASE WHEN i % 2 = 1 THEN 1 ELSE 3 END)
                      FROM generate_series(1, 12) AS i) % 10) % 10 = substr(p.barcode, 13, 1)::integer
            THEN CASE WHEN left(p.barcode, 2) = '29' THEN 'valid EAN-13 (generated 29...)' ELSE 'valid EAN-13' END
          ELSE '13 digits, invalid check digit'
        END
      ELSE 'other format'
    END AS reason,
    p.active
  FROM products p
)
SELECT m.name AS shop, c.merchant_id, c.action, c.reason,
       count(*)::integer AS products,
       count(*) FILTER (WHERE c.active)::integer AS active_products,
       count(*) FILTER (WHERE NOT c.active)::integer AS inactive_products
FROM classified c
JOIN merchants m ON m.id = c.merchant_id
GROUP BY m.name, c.merchant_id, c.action, c.reason
ORDER BY m.name, c.merchant_id, c.action, c.reason;
