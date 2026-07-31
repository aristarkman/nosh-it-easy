-- Sets the starting/minimum quantity to 0.25 lb for every item currently
-- flagged sold_by_pound (the 48 items converted by the prior migration).
-- Adjust individual exceptions afterward via the "Min lb" field in the
-- admin menu editor.

UPDATE menu_items
SET minimum_quantity = 0.25
WHERE sold_by_pound = true;
