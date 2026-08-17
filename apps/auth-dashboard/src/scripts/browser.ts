export interface JsonRequestOptions {
  readonly body?: object;
  readonly failureMessage: (value: unknown, response: Response) => string;
}

export async function requestJSON(
  endpoint: string,
  options: JsonRequestOptions,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      ...(options.body
        ? {
            body: JSON.stringify(options.body),
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            method: "POST",
          }
        : { headers: { Accept: "application/json" }, method: "GET" }),
      credentials: "same-origin",
    });
  } catch {
    throw new Error(
      "Otakuma Auth could not be reached. Check your connection and try again.",
    );
  }
  const value: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(options.failureMessage(value, response));
  }
  return value;
}

export function elementFinder(feature: string) {
  return function required<T extends Element>(
    root: Element,
    selector: string,
  ): T {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`${feature} is missing ${selector}.`);
    return element;
  };
}
