import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { LRUCache } from 'lru-cache';
import { env } from '@/lib/env';

type CacheEntry = {
  data: unknown;
  createdAtMs: number;
};

const cache = new LRUCache<string, CacheEntry>({
  max: 250,
  ttl: 10 * 60 * 1000, // 10 minutes
});

function stableStringify(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function cacheKeyFromBody(body: Record<string, unknown>): string {
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}

function withCacheHeaders(
  resp: NextResponse,
  info: { hit: boolean; key: string; ageMs?: number; ttlMs?: number }
) {
  resp.headers.set('x-backtest-cache', info.hit ? 'HIT' : 'MISS');
  resp.headers.set('x-backtest-cache-key', info.key.slice(0, 12));
  if (info.ageMs != null) resp.headers.set('x-backtest-cache-age-ms', String(Math.max(0, Math.round(info.ageMs))));
  if (info.ttlMs != null) resp.headers.set('x-backtest-cache-ttl-ms', String(Math.max(0, Math.round(info.ttlMs))));
  resp.headers.set('cache-control', 'no-store');
  return resp;
}

/**
 * POST /api/backtest/sector
 *
 * Proxies to FastAPI:
 *   POST {FASTAPI_BASE_URL}/api/backtest/sector
 *
 * Caching:
 * - In-memory per Next.js server instance (LRU+TTL).
 * - Keyed by full JSON request body (stable-stringified, sha256 hashed).
 * - Bypass with `x-cache-bust: 1` header or `{ cache_bust: true }` in body.
 */
export async function POST(request: Request) {
  try {
    if (!env.fastapiBaseUrl) {
      return NextResponse.json({ error: 'FASTAPI_BASE_URL not configured' }, { status: 500 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const sector = typeof body?.sector === 'string' ? body.sector.trim() : '';

    if (!sector) {
      return NextResponse.json({ error: 'Request body must include non-empty "sector"' }, { status: 400 });
    }

    const cacheBustHeader = request.headers.get('x-cache-bust');
    const cacheBust = cacheBustHeader === '1' || body?.cache_bust === true;
    const key = body ? cacheKeyFromBody(body) : '';

    if (!cacheBust && key) {
      const hit = cache.get(key);
      if (hit) {
        const resp = NextResponse.json(hit.data);
        return withCacheHeaders(resp, {
          hit: true,
          key,
          ageMs: Date.now() - hit.createdAtMs,
          ttlMs: cache.ttl,
        });
      }
    }

    const apiRes = await fetch(`${env.fastapiBaseUrl}/api/backtest/sector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text().catch(() => apiRes.statusText);
      return NextResponse.json({ error: 'FastAPI backtest error', status: apiRes.status, detail }, { status: 502 });
    }

    const data = await apiRes.json();
    if (key) cache.set(key, { data, createdAtMs: Date.now() });

    const resp = NextResponse.json(data);
    return withCacheHeaders(resp, { hit: false, key: key || 'none' });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to run backtest', detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/backtest/sector
 *
 * Clears the in-memory cache (useful during development).
 */
export async function DELETE() {
  const cleared = cache.size;
  cache.clear();
  return NextResponse.json({ ok: true, cleared });
}

