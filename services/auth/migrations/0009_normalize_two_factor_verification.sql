UPDATE "twoFactor"
SET "verified" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "user"
    WHERE "user"."id" = "twoFactor"."userId"
      AND "user"."twoFactorEnabled" = 1
  ) THEN 1
  ELSE 0
END
WHERE "verified" IS NULL;

DROP TRIGGER "protect_enabled_two_factor";

CREATE TRIGGER "protect_enabled_two_factor"
BEFORE DELETE ON "twoFactor"
WHEN OLD."verified" = 1
  AND EXISTS (
    SELECT 1 FROM "user"
    WHERE "id" = OLD."userId" AND "twoFactorEnabled" = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'TWO_FACTOR_ALREADY_ENABLED');
END;

CREATE TRIGGER "require_two_factor_verification_on_insert"
BEFORE INSERT ON "twoFactor"
WHEN NEW."verified" IS NULL
BEGIN
  SELECT RAISE(ABORT, 'TWO_FACTOR_VERIFICATION_REQUIRED');
END;

CREATE TRIGGER "require_two_factor_verification_on_update"
BEFORE UPDATE OF "verified" ON "twoFactor"
WHEN NEW."verified" IS NULL
BEGIN
  SELECT RAISE(ABORT, 'TWO_FACTOR_VERIFICATION_REQUIRED');
END;
