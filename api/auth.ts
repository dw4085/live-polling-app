import { proxyAuth } from './_lib/auth.js';
import { json, routePath } from './_lib/http.js';

// /api/auth/* -> Neon Auth (same-origin proxy; see vercel.json rewrites)
async function handle(request: Request): Promise<Response> {
  const { path, url } = routePath(request, 'auth');
  if (!path) return json({ error: 'Not found' }, 404);
  try {
    // Forward with the internal __path parameter stripped from the query string
    const forwarded = new Request(url, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
    });
    return await proxyAuth(forwarded, path);
  } catch (error) {
    console.error('auth proxy error', error);
    return json({ error: 'Auth service unavailable' }, 502);
  }
}

export const GET = handle;
export const POST = handle;
