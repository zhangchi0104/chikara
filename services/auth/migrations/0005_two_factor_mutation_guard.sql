CREATE UNIQUE INDEX "twoFactor_userId_unique_idx" ON "twoFactor" ("userId");

CREATE TRIGGER "protect_enabled_two_factor"
BEFORE DELETE ON "twoFactor"
WHEN COALESCE(OLD."verified", 1) = 1
  AND EXISTS (
    SELECT 1 FROM "user"
    WHERE "id" = OLD."userId" AND "twoFactorEnabled" = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'TWO_FACTOR_ALREADY_ENABLED');
END;
