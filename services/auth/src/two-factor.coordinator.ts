import { DurableObject } from "cloudflare:workers";
import { Effect } from "effect";
import { coordinateAccountProtectionRequest } from "./account-protection.js";
import { accountProtectionAuthAdapter, authRuntimeLayer } from "./auth.js";
import type { AuthBindings } from "./configs/auth.config.js";

export class TwoFactorCoordinator extends DurableObject<AuthBindings> {
  override fetch(request: Request): Promise<Response> {
    const { ctx, env } = this;
    return ctx.blockConcurrencyWhile(() =>
      Effect.runPromise(
        Effect.gen(function* () {
          const userId = ctx.id.name;
          if (!userId) {
            return Response.json(
              {
                code: "TWO_FACTOR_COORDINATOR_ERROR",
                message: "Invalid account.",
              },
              { status: 400 },
            );
          }
          const auth = yield* accountProtectionAuthAdapter;
          return yield* coordinateAccountProtectionRequest(request, {
            database: env.AUTH_DB,
            forward: auth.forward,
            userId,
          });
        }).pipe(Effect.provide(authRuntimeLayer(env))),
      ),
    );
  }
}
