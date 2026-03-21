-- Map legacy cost basis strings before application expects new enum values.
UPDATE "Ingredient" SET "costBasisUnit" = 'G' WHERE "costBasisUnit" = 'GRAM';
UPDATE "Ingredient" SET "costBasisUnit" = 'COUNT' WHERE "costBasisUnit" = 'EACH';
-- CUP unchanged
