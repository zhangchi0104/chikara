export type TwoFactorState =
  | "disabled"
  | "pending"
  | "enabled"
  | "inconsistent";

interface TwoFactorSnapshot {
  readonly factorCount: number;
  readonly twoFactorEnabled: number;
  readonly verifiedCount: number;
}

function classify(snapshot: TwoFactorSnapshot | null): TwoFactorState {
  if (!snapshot) return "inconsistent";
  const { factorCount, twoFactorEnabled, verifiedCount } = snapshot;
  if (twoFactorEnabled === 0 && factorCount === 0) return "disabled";
  if (twoFactorEnabled === 0 && factorCount === 1 && verifiedCount === 0) {
    return "pending";
  }
  if (twoFactorEnabled === 1 && factorCount === 1 && verifiedCount === 1) {
    return "enabled";
  }
  return "inconsistent";
}

export async function readTwoFactorState(
  database: D1Database,
  userId: string,
): Promise<TwoFactorState> {
  return classify(await readSnapshot(database, userId));
}

async function readSnapshot(
  database: D1Database,
  userId: string,
): Promise<TwoFactorSnapshot | null> {
  return database
    .prepare(
      `SELECT
         COALESCE(u."twoFactorEnabled", 0) AS "twoFactorEnabled",
         COUNT(t."id") AS "factorCount",
         COALESCE(SUM(
           CASE
             WHEN t."id" IS NOT NULL AND t."verified" = 1
             THEN 1 ELSE 0
           END
         ), 0) AS "verifiedCount"
       FROM "user" u
       LEFT JOIN "twoFactor" t ON t."userId" = u."id"
       WHERE u."id" = ?
       GROUP BY u."id", u."twoFactorEnabled"`,
    )
    .bind(userId)
    .first<TwoFactorSnapshot>();
}

export async function isTwoFactorAutoRecoverable(
  database: D1Database,
  userId: string,
): Promise<boolean> {
  const snapshot = await readSnapshot(database, userId);
  return (
    Number(snapshot?.twoFactorEnabled) === 1 &&
    Number(snapshot?.verifiedCount) === 0
  );
}
