import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import {
  isPasskeyChallengeExpired,
  passkeyChallengeExpiresAt,
} from "../src/passkey-mfa.plugin.js";

describe("passkey MFA clock", () => {
  it.effect("expires a challenge after ten minutes", () =>
    Effect.gen(function* () {
      const expiresAt = yield* passkeyChallengeExpiresAt();

      expect(expiresAt.getTime()).toBe(600_000);
      expect(yield* isPasskeyChallengeExpired(expiresAt)).toBe(false);

      yield* TestClock.adjust("10 minutes");

      expect(yield* isPasskeyChallengeExpired(expiresAt)).toBe(true);
    }),
  );
});
