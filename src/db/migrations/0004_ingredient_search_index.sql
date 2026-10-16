CREATE TABLE `IngredientSearchIndex` (
	`ingredientId` text PRIMARY KEY NOT NULL,
	`scopeKey` text NOT NULL,
	`itemId` text,
	`contentHash` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`nextAttemptAt` integer,
	`lastError` text,
	`indexedAt` integer,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `IngredientSearchIndex_scopeKey_status_idx` ON `IngredientSearchIndex` (`scopeKey`,`status`);--> statement-breakpoint
CREATE INDEX `IngredientSearchIndex_status_nextAttemptAt_idx` ON `IngredientSearchIndex` (`status`,`nextAttemptAt`);
--> statement-breakpoint
CREATE TRIGGER `Ingredient_search_insert`
AFTER INSERT ON `Ingredient`
BEGIN
  INSERT INTO `IngredientSearchIndex` (`ingredientId`, `scopeKey`, `version`)
  VALUES (NEW.id, CASE WHEN NEW.userId IS NULL THEN 'global' ELSE 'user:' || NEW.userId END, 1)
  ON CONFLICT (`ingredientId`) DO UPDATE SET
    scopeKey = excluded.scopeKey,
    status = 'pending', attempts = 0, nextAttemptAt = NULL, lastError = NULL,
    version = IngredientSearchIndex.version + 1, updatedAt = unixepoch() * 1000;
END;
--> statement-breakpoint
CREATE TRIGGER `Ingredient_search_update`
AFTER UPDATE OF `id`, `userId`, `name`, `normalizedName`, `category`, `notes` ON `Ingredient`
WHEN OLD.id IS NOT NEW.id OR OLD.userId IS NOT NEW.userId
  OR OLD.name IS NOT NEW.name OR OLD.normalizedName IS NOT NEW.normalizedName
  OR OLD.category IS NOT NEW.category OR OLD.notes IS NOT NEW.notes
BEGIN
  INSERT INTO `IngredientSearchIndex` (`ingredientId`, `scopeKey`, `version`)
  VALUES (NEW.id, CASE WHEN NEW.userId IS NULL THEN 'global' ELSE 'user:' || NEW.userId END, 1)
  ON CONFLICT (`ingredientId`) DO UPDATE SET
    scopeKey = excluded.scopeKey,
    status = 'pending', attempts = 0, nextAttemptAt = NULL, lastError = NULL,
    version = IngredientSearchIndex.version + 1, updatedAt = unixepoch() * 1000;

  INSERT INTO `IngredientSearchIndex` (`ingredientId`, `scopeKey`, `version`)
  SELECT OLD.id, CASE WHEN OLD.userId IS NULL THEN 'global' ELSE 'user:' || OLD.userId END, 1
  WHERE OLD.id IS NOT NEW.id
  ON CONFLICT (`ingredientId`) DO UPDATE SET
    scopeKey = excluded.scopeKey,
    status = 'pending', attempts = 0, nextAttemptAt = NULL, lastError = NULL,
    version = IngredientSearchIndex.version + 1, updatedAt = unixepoch() * 1000;
END;
--> statement-breakpoint
CREATE TRIGGER `Ingredient_search_delete`
AFTER DELETE ON `Ingredient`
BEGIN
  -- Keep the accepted remote item/hash and the deleted owner's scope for cleanup.
  INSERT INTO `IngredientSearchIndex` (`ingredientId`, `scopeKey`, `version`)
  VALUES (OLD.id, CASE WHEN OLD.userId IS NULL THEN 'global' ELSE 'user:' || OLD.userId END, 1)
  ON CONFLICT (`ingredientId`) DO UPDATE SET
    scopeKey = excluded.scopeKey,
    status = 'pending', attempts = 0, nextAttemptAt = NULL, lastError = NULL,
    version = IngredientSearchIndex.version + 1, updatedAt = unixepoch() * 1000;
END;
--> statement-breakpoint
CREATE TRIGGER `IngredientAlias_search_insert`
AFTER INSERT ON `IngredientAlias`
BEGIN
  INSERT INTO `IngredientSearchIndex` (`ingredientId`, `scopeKey`, `version`)
  SELECT id, CASE WHEN userId IS NULL THEN 'global' ELSE 'user:' || userId END, 1
  FROM `Ingredient` WHERE id = NEW.ingredientId
  ON CONFLICT (`ingredientId`) DO UPDATE SET
    scopeKey = excluded.scopeKey,
    status = 'pending', attempts = 0, nextAttemptAt = NULL, lastError = NULL,
    version = IngredientSearchIndex.version + 1, updatedAt = unixepoch() * 1000;
END;
--> statement-breakpoint
CREATE TRIGGER `IngredientAlias_search_update`
AFTER UPDATE OF `ingredientId`, `aliasNormalized` ON `IngredientAlias`
WHEN OLD.ingredientId IS NOT NEW.ingredientId OR OLD.aliasNormalized IS NOT NEW.aliasNormalized
BEGIN
  INSERT INTO `IngredientSearchIndex` (`ingredientId`, `scopeKey`, `version`)
  SELECT id, CASE WHEN userId IS NULL THEN 'global' ELSE 'user:' || userId END, 1
  FROM `Ingredient` WHERE id IN (OLD.ingredientId, NEW.ingredientId)
  ON CONFLICT (`ingredientId`) DO UPDATE SET
    scopeKey = excluded.scopeKey,
    status = 'pending', attempts = 0, nextAttemptAt = NULL, lastError = NULL,
    version = IngredientSearchIndex.version + 1, updatedAt = unixepoch() * 1000;
END;
--> statement-breakpoint
CREATE TRIGGER `IngredientAlias_search_delete`
AFTER DELETE ON `IngredientAlias`
BEGIN
  INSERT INTO `IngredientSearchIndex` (`ingredientId`, `scopeKey`, `version`)
  SELECT id, CASE WHEN userId IS NULL THEN 'global' ELSE 'user:' || userId END, 1
  FROM `Ingredient` WHERE id = OLD.ingredientId
  ON CONFLICT (`ingredientId`) DO UPDATE SET
    scopeKey = excluded.scopeKey,
    status = 'pending', attempts = 0, nextAttemptAt = NULL, lastError = NULL,
    version = IngredientSearchIndex.version + 1, updatedAt = unixepoch() * 1000;
END;
--> statement-breakpoint
CREATE TRIGGER `User_delete_private_ingredients`
BEFORE DELETE ON `user`
BEGIN
  -- Remove owned recipes first; preserve the original text in surviving recipes.
  DELETE FROM `Recipe` WHERE userId = OLD.id;
  UPDATE `RecipeIngredient` SET ingredientId = NULL
  WHERE ingredientId IN (SELECT id FROM `Ingredient` WHERE userId = OLD.id);
  -- Cascades remove aliases. Ingredient triggers leave durable deletion tombstones.
  DELETE FROM `Ingredient` WHERE userId = OLD.id;
END;
