import { generatedToolName } from '../src/lib/types';
import type { LibraryTool, PublishToolInput, Recipe, Tool, UserProfile, UserTool } from '../src/lib/types';

interface Env {
  DB: D1Database;
  APP_ORIGIN: string;
  SESSION_COOKIE_NAME: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  OAUTH_STATE_SECRET?: string;
}

type Provider = 'github' | 'google';

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), { ...init, headers: { ...jsonHeaders, ...init.headers } });
}

function redirect(location: string, headers?: HeadersInit): Response {
  return new Response(null, { status: 302, headers: { location, ...headers } });
}

function bad(message: string, status = 400): Response {
  return json({ error: message }, { status });
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function cookieName(env: Env): string {
  return env.SESSION_COOKIE_NAME || 'ptl_session';
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('cookie') || '';
  return Object.fromEntries(header.split(';').map(part => {
    const [key, ...value] = part.trim().split('=');
    return [key, decodeURIComponent(value.join('='))];
  }).filter(([key]) => key));
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signedValue(env: Env, value: string): Promise<string> {
  const secret = env.OAUTH_STATE_SECRET || 'dev-only-change-me';
  return `${value}.${await hmac(secret, value)}`;
}

async function verifySignedValue(env: Env, signed: string | undefined): Promise<string | null> {
  if (!signed) return null;
  const dot = signed.lastIndexOf('.');
  if (dot < 0) return null;
  const value = signed.slice(0, dot);
  return await signedValue(env, value) === signed ? value : null;
}

async function currentUser(request: Request, env: Env): Promise<UserProfile | null> {
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const userId = await verifySignedValue(env, bearer) || await verifySignedValue(env, parseCookies(request)[cookieName(env)]);
  if (!userId) return null;
  const row = await env.DB.prepare('SELECT id, display_name, avatar_url, is_admin FROM users WHERE id = ?').bind(userId).first<any>();
  return row ? { id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url, isAdmin: Boolean(row.is_admin) } : null;
}

async function requireUser(request: Request, env: Env): Promise<UserProfile | Response> {
  const user = await currentUser(request, env);
  return user || bad('Sign in required.', 401);
}

async function requireAdmin(request: Request, env: Env): Promise<UserProfile | Response> {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  return user.isAdmin ? user : bad('Admin access required.', 403);
}

function setSessionCookie(env: Env, userId: string, signed: string): string {
  const production = env.APP_ORIGIN.startsWith('https://');
  const sameSite = production ? 'SameSite=None; Secure' : 'SameSite=Lax';
  return `${cookieName(env)}=${encodeURIComponent(signed)}; Path=/; HttpOnly; ${sameSite}; Max-Age=2592000`;
}

function clearSessionCookie(env: Env): string {
  return `${cookieName(env)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function corsOrigin(env: Env): string {
  try {
    return new URL(env.APP_ORIGIN).origin;
  } catch {
    return env.APP_ORIGIN;
  }
}

function toolFromRow(row: any): Tool {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    type: row.type,
    units: row.units,
    diameter: row.diameter,
    flutes: row.flutes,
    vAngle: row.v_angle,
    manufacturer: row.manufacturer,
    cutterMaterial: row.cutter_material || 'carbide',
    coating: row.coating || 'uncoated',
    coatingCustom: row.coating_custom || '',
    productUrl: row.product_url,
    notes: row.notes,
    source: row.source,
    isPublic: Boolean(row.is_public),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recipeFromRow(row: any): Recipe {
  return {
    id: row.id,
    toolId: row.tool_id,
    ownerUserId: row.owner_user_id,
    material: row.material,
    operation: row.operation,
    rpm: row.rpm,
    feed: row.feed,
    plunge: row.plunge,
    stepdown: row.stepdown,
    stepover: row.stepover,
    coolant: row.coolant,
    notes: row.notes,
    voteCount: row.vote_count || 0,
    viewerHasVoted: Boolean(row.viewer_has_voted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function oauthStart(provider: Provider, request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const callback = `${url.origin}/auth/${provider}/callback`;
  const nonce = crypto.randomUUID();
  const state = await signedValue(env, `${provider}:${nonce}`);
  const setState = `ptl_oauth_state=${encodeURIComponent(state)}; Path=/auth/${provider}; HttpOnly; SameSite=Lax; Max-Age=600`;

  if (provider === 'github') {
    if (!env.GITHUB_CLIENT_ID) return bad('GitHub OAuth is not configured.', 500);
    const auth = new URL('https://github.com/login/oauth/authorize');
    auth.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
    auth.searchParams.set('redirect_uri', callback);
    auth.searchParams.set('scope', 'read:user user:email');
    auth.searchParams.set('state', state);
    return redirect(auth.toString(), { 'set-cookie': setState });
  }

  if (!env.GOOGLE_CLIENT_ID) return bad('Google OAuth is not configured.', 500);
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  auth.searchParams.set('redirect_uri', callback);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', 'openid email profile');
  auth.searchParams.set('state', state);
  return redirect(auth.toString(), { 'set-cookie': setState });
}

async function oauthCallback(provider: Provider, request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const expected = parseCookies(request).ptl_oauth_state;
  const verified = await verifySignedValue(env, state);
  if (!verified || state !== expected || !verified.startsWith(`${provider}:`)) return bad('Invalid OAuth state.', 400);
  const code = url.searchParams.get('code');
  if (!code) return bad('Missing OAuth code.', 400);

  const callback = `${url.origin}/auth/${provider}/callback`;
  const profile = provider === 'github'
    ? await githubProfile(code, callback, env)
    : await googleProfile(code, callback, env);

  const userId = await upsertOAuthUser(env, provider, profile);
  const session = await signedValue(env, userId);
  const redirectUrl = new URL(env.APP_ORIGIN);
  redirectUrl.searchParams.set('session', session);
  const headers = new Headers({ location: redirectUrl.toString() });
  headers.append('set-cookie', setSessionCookie(env, userId, session));
  headers.append('set-cookie', `ptl_oauth_state=; Path=/auth/${provider}; HttpOnly; Max-Age=0`);
  return new Response(null, { status: 302, headers });
}

async function githubProfile(code: string, redirectUri: string, env: Env): Promise<{ id: string; name: string; avatar: string | null; email: string | null; username: string | null }> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri }),
  });
  const token: any = await tokenRes.json();
  if (!token.access_token) throw new Error('GitHub token exchange failed.');
  const profile: any = await fetch('https://api.github.com/user', {
    headers: { authorization: `Bearer ${token.access_token}`, 'user-agent': 'printnc-tool-library' },
  }).then(res => res.json());
  return {
    id: String(profile.id),
    name: profile.name || profile.login || 'GitHub user',
    avatar: profile.avatar_url || null,
    email: profile.email || null,
    username: profile.login || null,
  };
}

async function googleProfile(code: string, redirectUri: string, env: Env): Promise<{ id: string; name: string; avatar: string | null; email: string | null; username: string | null }> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID || '',
    client_secret: env.GOOGLE_CLIENT_SECRET || '',
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  const token: any = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body }).then(res => res.json());
  if (!token.access_token) throw new Error('Google token exchange failed.');
  const profile: any = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${token.access_token}` },
  }).then(res => res.json());
  return {
    id: String(profile.sub),
    name: profile.name || profile.email || 'Google user',
    avatar: profile.picture || null,
    email: profile.email || null,
    username: profile.email || null,
  };
}

async function upsertOAuthUser(env: Env, provider: Provider, profile: { id: string; name: string; avatar: string | null; email: string | null; username: string | null }): Promise<string> {
  const existing = await env.DB.prepare('SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?')
    .bind(provider, profile.id)
    .first<any>();
  const userId = existing?.user_id || id('usr');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, display_name, avatar_url) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, avatar_url = excluded.avatar_url, updated_at = CURRENT_TIMESTAMP')
      .bind(userId, profile.name, profile.avatar),
    env.DB.prepare('INSERT INTO oauth_accounts (provider, provider_user_id, user_id, email, username) VALUES (?, ?, ?, ?, ?) ON CONFLICT(provider, provider_user_id) DO UPDATE SET email = excluded.email, username = excluded.username, updated_at = CURRENT_TIMESTAMP')
      .bind(provider, profile.id, userId, profile.email, profile.username),
  ]);
  return userId;
}

async function listTools(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  const url = new URL(request.url);
  const q = `%${(url.searchParams.get('q') || '').trim()}%`;
  const rows = await env.DB.prepare(`
    SELECT t.*, r.id AS recipe_id, r.owner_user_id AS recipe_owner_user_id, r.material, r.operation, r.rpm, r.feed, r.plunge, r.stepdown, r.stepover, r.coolant, r.notes AS recipe_notes, r.created_at AS recipe_created_at, r.updated_at AS recipe_updated_at,
      COUNT(rv.user_id) AS vote_count,
      MAX(CASE WHEN rv.user_id = ? THEN 1 ELSE 0 END) AS viewer_has_voted
    FROM tools t
    LEFT JOIN recipes r ON r.tool_id = t.id
    LEFT JOIN recipe_votes rv ON rv.recipe_id = r.id
    WHERE t.is_public = 1 AND (? = '%%' OR t.name LIKE ? OR t.type LIKE ? OR t.manufacturer LIKE ? OR t.cutter_material LIKE ? OR t.coating LIKE ? OR t.coating_custom LIKE ?)
    GROUP BY t.id, r.id
    ORDER BY vote_count DESC, t.name ASC
    LIMIT 100
  `).bind(user?.id || '', q, q, q, q, q, q, q).all<any>();

  const map = new Map<string, LibraryTool>();
  for (const row of rows.results || []) {
    if (!map.has(row.id)) map.set(row.id, { ...toolFromRow(row), recipes: [] });
    if (row.recipe_id) {
      map.get(row.id)!.recipes.push(recipeFromRow({
        id: row.recipe_id,
        tool_id: row.id,
        owner_user_id: row.recipe_owner_user_id,
        material: row.material,
        operation: row.operation,
        rpm: row.rpm,
        feed: row.feed,
        plunge: row.plunge,
        stepdown: row.stepdown,
        stepover: row.stepover,
        coolant: row.coolant,
        notes: row.recipe_notes,
        vote_count: row.vote_count,
        viewer_has_voted: row.viewer_has_voted,
        created_at: row.recipe_created_at,
        updated_at: row.recipe_updated_at,
      }));
    }
  }
  return json({ tools: [...map.values()] });
}

async function myTools(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const rows = await env.DB.prepare(`
    SELECT t.*, ut.tool_number, r.id AS recipe_id, r.owner_user_id AS recipe_owner_user_id, r.material, r.operation, r.rpm, r.feed, r.plunge, r.stepdown, r.stepover, r.coolant, r.notes AS recipe_notes, r.created_at AS recipe_created_at, r.updated_at AS recipe_updated_at,
      COUNT(rv.user_id) AS vote_count,
      MAX(CASE WHEN rv.user_id = ? THEN 1 ELSE 0 END) AS viewer_has_voted
    FROM user_tools ut
    JOIN tools t ON t.id = ut.tool_id
    LEFT JOIN recipes r ON r.id = ut.recipe_id
    LEFT JOIN recipe_votes rv ON rv.recipe_id = r.id
    WHERE ut.user_id = ?
    GROUP BY t.id, r.id, ut.tool_number
    ORDER BY ut.tool_number ASC, t.name ASC
  `).bind(user.id, user.id).all<any>();
  const tools: UserTool[] = (rows.results || []).map(row => ({
    tool: toolFromRow(row),
    recipe: row.recipe_id ? recipeFromRow({
      id: row.recipe_id,
      tool_id: row.id,
      owner_user_id: row.recipe_owner_user_id,
      material: row.material,
      operation: row.operation,
      rpm: row.rpm,
      feed: row.feed,
      plunge: row.plunge,
      stepdown: row.stepdown,
      stepover: row.stepover,
      coolant: row.coolant,
      notes: row.recipe_notes,
      vote_count: row.vote_count,
      viewer_has_voted: row.viewer_has_voted,
      created_at: row.recipe_created_at,
      updated_at: row.recipe_updated_at,
    }) : null,
    toolNumber: row.tool_number,
  }));
  return json({ tools });
}

async function publishTool(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const input = await request.json<PublishToolInput>();
  if (!input.tool) return bad('Tool details are required.');
  const toolName = input.tool.name?.trim() || generatedToolName(input.tool);
  const toolId = id('tool');
  const recipeId = id('rcp');
  const recipe = input.recipe;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO tools (id, owner_user_id, name, type, units, diameter, flutes, v_angle, manufacturer, cutter_material, coating, coating_custom, product_url, notes, source, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(toolId, user.id, toolName, input.tool.type, 'mm', input.tool.diameter, input.tool.flutes, input.tool.vAngle || 0, input.tool.manufacturer || '', input.tool.cutterMaterial || 'carbide', input.tool.coating || 'uncoated', input.tool.coating === 'other' ? input.tool.coatingCustom || '' : '', input.tool.productUrl || '', input.tool.notes || '', input.tool.source || 'manual', input.tool.isPublic ? 1 : 0),
    env.DB.prepare(`INSERT INTO recipes (id, tool_id, owner_user_id, material, operation, rpm, feed, plunge, stepdown, stepover, coolant, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(recipeId, toolId, user.id, recipe.material || 'Unspecified', recipe.operation || 'Default', recipe.rpm || 0, recipe.feed || 0, recipe.plunge || 0, recipe.stepdown || 0, recipe.stepover || 0, recipe.coolant || 'off', recipe.notes || ''),
  ]);
  if (input.addToMyTools) await addUserToolRow(env, user.id, toolId, recipeId, input.toolNumber);
  return json({ toolId, recipeId }, { status: 201 });
}

async function deleteTool(request: Request, env: Env, toolId: string): Promise<Response> {
  const user = await requireAdmin(request, env);
  if (user instanceof Response) return user;
  await env.DB.prepare('DELETE FROM tools WHERE id = ?').bind(toolId).run();
  return json({ ok: true });
}

async function addUserToolRow(env: Env, userId: string, toolId: string, recipeId: string | null | undefined, toolNumber?: number): Promise<void> {
  const next = toolNumber || ((await env.DB.prepare('SELECT COALESCE(MAX(tool_number), 0) + 1 AS next FROM user_tools WHERE user_id = ?').bind(userId).first<any>())?.next ?? 1);
  await env.DB.prepare('INSERT INTO user_tools (user_id, tool_id, recipe_id, tool_number) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, tool_id) DO UPDATE SET recipe_id = excluded.recipe_id, tool_number = excluded.tool_number, updated_at = CURRENT_TIMESTAMP')
    .bind(userId, toolId, recipeId || null, next)
    .run();
}

async function addToMyTools(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  const body = await request.json<{ toolId: string; recipeId?: string; toolNumber?: number }>();
  if (!body.toolId) return bad('toolId is required.');
  await addUserToolRow(env, user.id, body.toolId, body.recipeId, body.toolNumber);
  return json({ ok: true });
}

async function removeFromMyTools(request: Request, env: Env, toolId: string): Promise<Response> {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  await env.DB.prepare('DELETE FROM user_tools WHERE user_id = ? AND tool_id = ?').bind(user.id, toolId).run();
  return json({ ok: true });
}

async function voteRecipe(request: Request, env: Env, recipeId: string): Promise<Response> {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM recipe_votes WHERE recipe_id = ? AND user_id = ?').bind(recipeId, user.id).run();
  } else {
    await env.DB.prepare('INSERT OR IGNORE INTO recipe_votes (recipe_id, user_id) VALUES (?, ?)').bind(recipeId, user.id).run();
  }
  return json({ ok: true });
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/auth/github') return oauthStart('github', request, env);
  if (url.pathname === '/auth/google') return oauthStart('google', request, env);
  if (url.pathname === '/auth/github/callback') return oauthCallback('github', request, env);
  if (url.pathname === '/auth/google/callback') return oauthCallback('google', request, env);
  if (url.pathname === '/auth/logout') return redirect(env.APP_ORIGIN, { 'set-cookie': clearSessionCookie(env) });
  if (url.pathname === '/api/me') return json({ user: await currentUser(request, env) });
  if (url.pathname === '/api/tools' && request.method === 'GET') return listTools(request, env);
  if (url.pathname === '/api/tools' && request.method === 'POST') return publishTool(request, env);
  const toolMatch = url.pathname.match(/^\/api\/tools\/([^/]+)$/);
  if (toolMatch && request.method === 'DELETE') return deleteTool(request, env, toolMatch[1]);
  if (url.pathname === '/api/my/tools' && request.method === 'GET') return myTools(request, env);
  if (url.pathname === '/api/my/tools' && request.method === 'POST') return addToMyTools(request, env);
  const myToolMatch = url.pathname.match(/^\/api\/my\/tools\/([^/]+)$/);
  if (myToolMatch && request.method === 'DELETE') return removeFromMyTools(request, env, myToolMatch[1]);
  const voteMatch = url.pathname.match(/^\/api\/recipes\/([^/]+)\/vote$/);
  if (voteMatch && (request.method === 'POST' || request.method === 'DELETE')) return voteRecipe(request, env, voteMatch[1]);
  return bad('Not found.', 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': corsOrigin(env),
            'access-control-allow-credentials': 'true',
            'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
            'access-control-allow-headers': 'authorization, content-type',
            vary: 'origin',
          },
        });
      }
      const response = await handle(request, env);
      const headers = new Headers(response.headers);
      headers.set('access-control-allow-origin', corsOrigin(env));
      headers.set('access-control-allow-credentials', 'true');
      headers.set('vary', 'origin');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (err: any) {
      return bad(err?.message || 'Unexpected error.', 500);
    }
  },
};
