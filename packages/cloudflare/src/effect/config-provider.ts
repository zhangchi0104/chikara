import { ConfigProvider } from "effect";

function fromBindings(bindings: object) {
  return ConfigProvider.fromUnknown(bindings);
}

export const CFConfigProvider = {
  fromBindings,
};
