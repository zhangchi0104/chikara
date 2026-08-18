import { Effect } from "effect";
import { AuthRuntimeError } from "./auth-runtime.error.js";

export function runtimePromise<A>(
  operation: string,
  task: () => PromiseLike<A>,
) {
  return Effect.tryPromise({
    catch: (cause) => new AuthRuntimeError({ cause, operation }),
    try: task,
  });
}
