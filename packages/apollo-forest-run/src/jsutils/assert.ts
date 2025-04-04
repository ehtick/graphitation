export function assert(condition: unknown, message = ""): asserts condition {
  if (!condition) {
    throw new Error("Invariant violation" + (message ? `: ${message}` : ""));
  }
}

export function assertNever(...values: never[]): never {
  throw new Error(
    `Unexpected member of typed union: \n` + JSON.stringify(values),
  );
}
