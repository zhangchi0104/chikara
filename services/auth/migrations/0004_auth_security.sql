ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" INTEGER DEFAULT 0;

CREATE TABLE "passkey" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT,
  "publicKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "credentialID" TEXT NOT NULL,
  "counter" INTEGER NOT NULL,
  "deviceType" TEXT NOT NULL,
  "backedUp" INTEGER NOT NULL,
  "transports" TEXT,
  "createdAt" DATE,
  "aaguid" TEXT
);

CREATE TABLE "twoFactor" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "secret" TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "verified" INTEGER DEFAULT 1,
  "failedVerificationCount" INTEGER DEFAULT 0,
  "lockedUntil" DATE
);

CREATE INDEX "passkey_userId_idx" ON "passkey" ("userId");
CREATE INDEX "passkey_credentialID_idx" ON "passkey" ("credentialID");
CREATE INDEX "twoFactor_secret_idx" ON "twoFactor" ("secret");
CREATE INDEX "twoFactor_userId_idx" ON "twoFactor" ("userId");
