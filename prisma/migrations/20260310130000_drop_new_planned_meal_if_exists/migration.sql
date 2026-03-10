-- Remove leftover temp table if a previous migration failed mid-flight
-- (SQLite rebuild pattern renames new_PlannedMeal -> PlannedMeal; if that
-- step never ran, new_PlannedMeal can remain and confuse tooling.)
DROP TABLE IF EXISTS "new_PlannedMeal";
