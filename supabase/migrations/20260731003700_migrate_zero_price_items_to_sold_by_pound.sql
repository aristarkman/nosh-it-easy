-- One-time data migration (run AFTER the schema migration above).
-- Finds every menu item whose Cresskill price is currently $0 that has a
-- modifier option named some variant of "1 lb" (1 lb, 1lb, 1 Pound, etc.)
-- assigned to it, then:
--   1. Sets that item's price (all locations) to the "1 lb" option's price
--   2. Flags the item sold_by_pound = true, minimum_quantity = 0.5
--   3. Removes that modifier group from the item (replaced by the pound
--      stepper on the storefront)
--
-- Naturally idempotent: once an item's price is no longer $0, it no longer
-- matches on a re-run.

BEGIN;

CREATE TEMP TABLE _pound_migration AS
SELECT DISTINCT ON (mip.menu_item_id)
  mip.menu_item_id,
  mo.group_id,
  mo.price_delta
FROM menu_item_prices mip
JOIN menu_item_modifier_groups mimg ON mimg.menu_item_id = mip.menu_item_id
JOIN modifier_options mo ON mo.group_id = mimg.modifier_group_id
WHERE mip.location_id = 'cresskill'
  AND mip.price = 0
  AND regexp_replace(lower(mo.name), '[^a-z0-9]', '', 'g') IN ('1lb', '1lbs', '1pound', '1pounds')
ORDER BY mip.menu_item_id, mo.price_delta DESC;

-- 1. Set the per-pound price at every location for these items
UPDATE menu_item_prices p
SET price = pm.price_delta,
    synced_at = now()
FROM _pound_migration pm
WHERE p.menu_item_id = pm.menu_item_id;

-- 2. Flag as sold-by-the-pound
UPDATE menu_items mi
SET sold_by_pound = true,
    minimum_quantity = COALESCE(mi.minimum_quantity, 0.5)
FROM _pound_migration pm
WHERE mi.id = pm.menu_item_id;

-- 3. Remove the now-redundant weight/size modifier group from these items
DELETE FROM menu_item_modifier_groups mimg
USING _pound_migration pm
WHERE mimg.menu_item_id = pm.menu_item_id
  AND mimg.modifier_group_id = pm.group_id;

-- Sanity check: see exactly which items were converted before committing.
-- (Comment out the ROLLBACK/COMMIT swap below if you want to inspect first.)
SELECT mi.name, pm.price_delta AS new_price_per_lb
FROM _pound_migration pm
JOIN menu_items mi ON mi.id = pm.menu_item_id;

DROP TABLE _pound_migration;

COMMIT;
