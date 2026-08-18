import { Schema } from "effect";

export class AuthRuntimeError extends Schema.TaggedErrorClass<AuthRuntimeError>()(
  "AuthRuntimeError",
  {
    cause: Schema.Defect(),
    operation: Schema.String,
  },
) {}
