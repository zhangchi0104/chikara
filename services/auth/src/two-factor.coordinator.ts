import { DurableObject } from "cloudflare:workers";
import { createAuth } from "./auth.js";
import type { AuthBindings } from "./configs/auth.config.js";
import { coordinateTwoFactorRequest } from "./two-factor.coordination.js";

export class TwoFactorCoordinator extends DurableObject<AuthBindings> {
  override fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const userId = this.ctx.id.name;
      if (!userId) {
        return Response.json(
          { code: "TWO_FACTOR_COORDINATOR_ERROR", message: "Invalid account." },
          { status: 400 },
        );
      }
      const auth = await createAuth(this.env);
      return coordinateTwoFactorRequest(
        request,
        this.env.AUTH_DB,
        userId,
        (forwarded) => auth.handler(forwarded),
      );
    });
  }
}
