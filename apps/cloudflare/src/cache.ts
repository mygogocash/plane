import type { CloudflareBindings } from "./types";

type CacheMissReason = "CACHE_MISS" | "KV_BINDING_MISSING" | "CACHE_PARSE_FAILED";

export type CacheReadResult<TValue> =
  | {
      hit: true;
      key: string;
      value: TValue;
    }
  | {
      hit: false;
      key: string;
      reason: CacheMissReason;
    };

export type CacheWriteResult =
  | {
      ok: true;
      key: string;
    }
  | {
      ok: false;
      key: string;
      reason: "KV_BINDING_MISSING";
    };

export function buildCacheKey(scope: string, key: string): string {
  return `${encodeURIComponent(scope)}:${encodeURIComponent(key)}`;
}

export async function getJsonCache<TValue>(
  env: CloudflareBindings,
  scope: string,
  key: string
): Promise<CacheReadResult<TValue>> {
  const cacheKey = buildCacheKey(scope, key);

  if (!env.CONFIG) {
    return {
      hit: false,
      key: cacheKey,
      reason: "KV_BINDING_MISSING",
    };
  }

  const rawValue = await env.CONFIG.get(cacheKey);
  if (rawValue === null) {
    return {
      hit: false,
      key: cacheKey,
      reason: "CACHE_MISS",
    };
  }

  try {
    return {
      hit: true,
      key: cacheKey,
      value: JSON.parse(rawValue) as TValue,
    };
  } catch {
    return {
      hit: false,
      key: cacheKey,
      reason: "CACHE_PARSE_FAILED",
    };
  }
}

export async function putJsonCache(
  env: CloudflareBindings,
  scope: string,
  key: string,
  value: unknown,
  options: { ttlSeconds?: number } = {}
): Promise<CacheWriteResult> {
  const cacheKey = buildCacheKey(scope, key);

  if (!env.CONFIG) {
    return {
      ok: false,
      key: cacheKey,
      reason: "KV_BINDING_MISSING",
    };
  }

  await env.CONFIG.put(
    cacheKey,
    JSON.stringify(value),
    options.ttlSeconds ? { expirationTtl: options.ttlSeconds } : undefined
  );

  return {
    ok: true,
    key: cacheKey,
  };
}

export async function deleteJsonCache(env: CloudflareBindings, scope: string, key: string): Promise<CacheWriteResult> {
  const cacheKey = buildCacheKey(scope, key);

  if (!env.CONFIG) {
    return {
      ok: false,
      key: cacheKey,
      reason: "KV_BINDING_MISSING",
    };
  }

  await env.CONFIG.delete(cacheKey);

  return {
    ok: true,
    key: cacheKey,
  };
}
