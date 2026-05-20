/**
 * JackDAW audio upload proxy
 *
 * Required Worker bindings (set in Cloudflare dashboard or wrangler.toml):
 *   AUDIO_BUCKET    — R2 bucket binding
 *
 * Required secrets (wrangler secret put <NAME>):
 *   FIREBASE_API_KEY    — Firebase Web API key (for token validation)
 *   R2_PUBLIC_BASE_URL  — Public base URL of the R2 bucket (no trailing slash)
 *                         e.g. https://pub-<hash>.r2.dev  or  https://audio.jackdaw.app
 *
 * Routes:
 *   POST   /upload?key=<object-key>   Upload audio (auth required)
 *   DELETE /delete?key=<object-key>   Delete audio (auth required)
 */

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/upload' && request.method === 'POST') {
      return corsResponse(await handleUpload(request, url, env));
    }

    if (path === '/delete' && request.method === 'DELETE') {
      return corsResponse(await handleDelete(request, url, env));
    }

    return corsResponse(new Response('Not Found', { status: 404 }));
  },
};

async function handleUpload(request, url, env) {
  const authErr = await validateToken(request, env);
  if (authErr) return authErr;

  const key = url.searchParams.get('key');
  if (!key) return new Response('Missing ?key parameter', { status: 400 });

  // Prevent path traversal
  if (key.includes('..') || key.startsWith('/')) {
    return new Response('Invalid key', { status: 400 });
  }

  const contentType = request.headers.get('Content-Type') || 'audio/mpeg';
  const body = await request.arrayBuffer();

  if (body.byteLength === 0) {
    return new Response('Empty body', { status: 400 });
  }

  await env.AUDIO_BUCKET.put(key, body, {
    httpMetadata: { contentType },
  });

  const publicUrl = `${env.R2_PUBLIC_BASE_URL}/${key}`;
  return new Response(JSON.stringify({ url: publicUrl }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleDelete(request, url, env) {
  const authErr = await validateToken(request, env);
  if (authErr) return authErr;

  const key = url.searchParams.get('key');
  if (!key) return new Response('Missing ?key parameter', { status: 400 });

  await env.AUDIO_BUCKET.delete(key);
  return new Response(null, { status: 204 });
}

/**
 * Validate a Firebase ID token via the Firebase Auth REST API.
 * Returns null if valid, or a Response with an error if not.
 */
async function validateToken(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) return new Response('Unauthorized', { status: 401 });

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!res.ok) return new Response('Invalid or expired token', { status: 401 });
  return null;
}

function corsResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
