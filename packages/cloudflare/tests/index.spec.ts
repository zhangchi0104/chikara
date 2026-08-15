import { describe, expect, it } from "@effect/vitest";

import { CFConfigProvider } from "../src/effect/effect.module.js";

describe("Cloudflare Effect exports", () => {
  it("exposes a config provider factory", () => {
    expect(CFConfigProvider.fromBindings).toBeTypeOf("function");
  });
});
