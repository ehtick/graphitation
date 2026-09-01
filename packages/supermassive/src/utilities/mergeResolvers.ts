import { Resolvers } from "../types";
import { isObjectLike } from "../jsutils/isObjectLike";

export function mergeResolvers(
  accumulator: Resolvers,
  resolvers: (Resolvers | Resolvers[])[],
): Resolvers {
  return mergeResolversRecursive(accumulator, resolvers, new Set());
}

function mergeResolversRecursive(
  accumulator: Resolvers,
  resolvers: (Resolvers | Resolvers[])[],
  owned: Set<string>,
): Resolvers {
  for (const entry of resolvers) {
    if (Array.isArray(entry)) {
      mergeResolversRecursive(accumulator, entry, owned);
    } else {
      mergeResolversObjMap(accumulator, entry, owned);
    }
  }
  return accumulator;
}

function mergeResolversObjMap(
  accumulator: Resolvers,
  resolvers: Resolvers,
  owned: Set<string>,
) {
  for (const [typeName, typeResolver] of Object.entries(resolvers)) {
    const existing = accumulator[typeName];
    if (existing === undefined) {
      if (typeResolver) {
        accumulator[typeName] = typeResolver;
      }
      continue;
    }

    if (!isObjectLike(existing) || !isObjectLike(typeResolver)) {
      continue;
    }

    if (!owned.has(typeName)) {
      accumulator[typeName] = Object.assign(
        Object.create(Object.getPrototypeOf(existing)),
        existing,
      );
      owned.add(typeName);
    }

    Object.assign(accumulator[typeName], typeResolver);
  }
}
