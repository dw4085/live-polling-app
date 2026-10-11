// Small helpers shared by the API functions.

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

export async function readBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new HttpError(400, `Invalid ${field}`);
  return value;
}

export function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${field} is required`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HttpError(400, `${field} is too long`);
  return trimmed;
}

// The path below /api/<prefix>/ for this request. vercel.json rewrites
// /api/<prefix>/:path* to the function with ?__path=:path*; fall back to the URL
// pathname in case the platform passes the original URL through.
export function routePath(request: Request, prefix: string): { path: string; url: URL } {
  const url = new URL(request.url);
  let path = url.searchParams.get('__path');
  if (path === null) {
    path = url.pathname.replace(new RegExp(`^/api/${prefix}/?`), '');
  }
  url.searchParams.delete('__path');
  return { path: path.replace(/^\/+|\/+$/g, ''), url };
}
