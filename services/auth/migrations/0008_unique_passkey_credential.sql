CREATE UNIQUE INDEX "passkey_credentialID_unique_idx"
ON "passkey" ("credentialID");

DROP INDEX "passkey_credentialID_idx";
