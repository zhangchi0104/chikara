import { Effect } from "effect";
import {
  authRuntimeLayer,
  type CreateAuthOptions,
  createAuth,
} from "../src/auth.js";
import type { AuthBindings } from "../src/configs/auth.config.js";

export function createTestAuth(
  bindings: AuthBindings,
  options: CreateAuthOptions = {},
) {
  return createAuth(options).pipe(Effect.provide(authRuntimeLayer(bindings)));
}
