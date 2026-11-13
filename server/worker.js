// The host stores COURSE_SESSION as a secret. Never include it in a client bundle.
const COURSE_API = 'https://hq.mega.dev/challenges/show-me-when/api';
const encoder = new TextEncoder();
async function signature(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
async function sessionCookie(secret) {
  const value = `${Math.floor(Date.now() / 1000) + 3600}.${crypto.randomUUID()}`;
  return `board_access=${value}.${await signature(value, secret)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`;
}
async function validSession(request, secret) {
  const cookie = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith('board_access='))?.slice(13);
  if (!cookie) return false;
  const parts = cookie.split('.');
  if (parts.length !== 3 || Number(parts[0]) < Date.now() / 1000) return false;
  return parts[2] === await signature(`${parts[0]}.${parts[1]}`, secret);
}
export function createWorker(assets) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const route = url.pathname;
      const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
      if (!env.COURSE_SESSION) return new Response('Board is not configured.', { status: 503, headers });
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
      if (route.startsWith('/challenges/show-me-when/api/')) {
        const action = route.slice('/challenges/show-me-when/api/'.length);
        if (!['incidents', 'ack'].includes(action)) return new Response('Not found', { status: 404, headers });
        if (!await validSession(request, env.COURSE_SESSION)) return new Response('Open the board first.', { status: 401, headers });
        if (request.headers.get('sec-fetch-site') === 'cross-site') return new Response('Forbidden', { status: 403, headers });
        const upstream = new URL(`${COURSE_API}/${action}`);
        upstream.searchParams.set('t', env.COURSE_SESSION);
        const keys = action === 'incidents' ? ['since'] : ['id', 'cursor'];
        for (const key of keys) {
          const value = url.searchParams.get(key);
          if (value && value.length <= 4096) upstream.searchParams.set(key, value);
        }
        try {
          const response = await fetch(upstream, { redirect: 'manual' });
          if (!response.ok) return Response.json({ error: 'Course request failed', status: response.status }, { status: response.status, headers });
          const payload = await response.json();
          const allowed = action === 'incidents' ? ['updatedAt', 'incidents', 'cursor'] : ['id', 'ackedAt', 'receipt'];
          return Response.json(Object.fromEntries(allowed.filter(key => key in payload).map(key => [key, payload[key]])), { headers });
        } catch (error) { const detail = String(error.message).replaceAll(env.COURSE_SESSION, '[redacted]').replace(/https?:\/\/\S+/g, '[upstream]'); return Response.json({ error: 'Course is unavailable', detail: detail.slice(0, 200) }, { status: 502, headers }); }
      }
      const asset = assets[route === '/' ? '/index.html' : route];
      if (!asset) return new Response('Not found', { status: 404, headers });
      headers['Content-Type'] = asset.type;
      if (route === '/' || route === '/index.html') headers['Set-Cookie'] = await sessionCookie(env.COURSE_SESSION);
      return new Response(asset.body, { headers });
    },
  };
}


