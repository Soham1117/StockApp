import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';

/**
 * Proxy auth requests to FastAPI so the client never needs FASTAPI_BASE_URL.
 * Forwards method, body, and cookies; returns response with Set-Cookie preserved.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, context, undefined);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, context, await request.text());
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, context, await request.text());
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  body: string | undefined
) {
  if (!env.fastapiBaseUrl) {
    return NextResponse.json(
      { error: 'FASTAPI_BASE_URL not configured' },
      { status: 500 }
    );
  }

  const { path } = await context.params;
  const pathSegment = path.length ? path.join('/') : '';
  const url = `${env.fastapiBaseUrl}/auth/${pathSegment}`;
  const cookie = request.headers.get('cookie') ?? '';
  const headers: Record<string, string> = { cookie };
  if (body) {
    headers['Content-Type'] = request.headers.get('Content-Type') ?? 'application/json';
  }

  const res = await fetch(url, {
    method: request.method,
    headers,
    body: body ?? null,
    credentials: 'include',
  });

  const resBody = await res.text();
  const nextRes = new NextResponse(resBody, {
    status: res.status,
    statusText: res.statusText,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
    },
  });

  const setCookies = 'getSetCookie' in res.headers ? (res.headers as Headers).getSetCookie() : [];
  if (setCookies.length === 0) {
    const one = res.headers.get('set-cookie');
    if (one) setCookies.push(one);
  }
  setCookies.forEach((c) => nextRes.headers.append('set-cookie', c));

  return nextRes;
}
