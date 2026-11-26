import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GOOGLE_CLIENT_ID = '1073280029907-0166ddlukbg2mg6mprp6hlk34l9fsj5a.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const ALLOWED_ORIGINS = new Set([
  'https://anasfalau.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? '';
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }
  if (!ALLOWED_ORIGINS.has(origin)) return json({ error: 'Origin is not allowed.' }, 403, origin);
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin);
  if (request.headers.get('X-Requested-With') !== 'XmlHttpRequest') {
    return json({ error: 'Request validation failed.' }, 403, origin);
  }
  const auth = request.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Missing tracker session.' }, 401, origin);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(auth.slice(7));
  if (authError || !user) return json({ error: 'Tracker session expired. Sign in again.' }, 401, origin);

  let body: { action?: string; code?: string };
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request.' }, 400, origin); }

  if (body.action === 'logout') {
    const { error } = await supabase.from('nass_google_drive_tokens').delete().eq('user_id', user.id);
    if (error) return json({ error: 'Could not clear the saved Google Drive session.' }, 500, origin);
    return json({ ok: true }, 200, origin);
  }

  if (!GOOGLE_CLIENT_SECRET) return json({ error: 'Google Drive session persistence is not configured yet.' }, 503, origin);

  if (body.action === 'refresh') {
    const { data: saved, error } = await supabase
      .from('nass_google_drive_tokens')
      .select('refresh_token')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return json({ error: 'Could not load the saved Google Drive session.' }, 500, origin);
    if (!saved?.refresh_token) return json({ error: 'Connect Google Drive to continue.' }, 409, origin);

    const refreshed = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: saved.refresh_token,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
    });
    if (!refreshed.ok) {
      if (refreshed.error === 'invalid_grant') {
        await supabase.from('nass_google_drive_tokens').delete().eq('user_id', user.id);
        return json({ error: 'Google Drive authorization expired. Connect Drive again.' }, 409, origin);
      }
      return json({ error: refreshed.message || 'Could not refresh Google Drive access.' }, 502, origin);
    }
    return json({ access_token: refreshed.access_token, expires_in: refreshed.expires_in }, 200, origin);
  }

  if (body.action === 'exchange') {
    if (!body.code) return json({ error: 'Google did not return an authorization code.' }, 400, origin);
    const exchanged = await tokenRequest({
      code: body.code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: origin,
      grant_type: 'authorization_code',
    });
    if (!exchanged.ok) return json({ error: exchanged.message || 'Could not complete Google Drive authorization.' }, 502, origin);
    if (!exchanged.scope?.split(' ').includes(DRIVE_SCOPE)) {
      return json({ error: 'Google Drive read-only permission was not granted.' }, 403, origin);
    }

    let refreshToken = exchanged.refresh_token;
    if (!refreshToken) {
      const { data: previous } = await supabase.from('nass_google_drive_tokens')
        .select('refresh_token').eq('user_id', user.id).maybeSingle();
      refreshToken = previous?.refresh_token;
    }
    if (!refreshToken) {
      return json({ error: 'Google did not issue a persistent authorization. Reconnect Drive and approve the requested access.' }, 409, origin);
    }

    const { error } = await supabase.from('nass_google_drive_tokens').upsert({
      user_id: user.id,
      refresh_token: refreshToken,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) return json({ error: 'Could not save the Google Drive session securely.' }, 500, origin);
    return json({ access_token: exchanged.access_token, expires_in: exchanged.expires_in }, 200, origin);
  }

  return json({ error: 'Unsupported action.' }, 400, origin);
});

async function tokenRequest(fields: Record<string, string>) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    access_token: payload.access_token as string | undefined,
    expires_in: Number(payload.expires_in) || 3600,
    refresh_token: payload.refresh_token as string | undefined,
    scope: payload.scope as string | undefined,
    error: payload.error as string | undefined,
    message: payload.error_description as string | undefined,
  };
}

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
}

function json(value: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}
