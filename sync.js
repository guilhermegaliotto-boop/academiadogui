// Sincronização opcional com Supabase (login com e-mail e senha, uma linha por usuário).
const CFG_KEY = 'treinoabc:sync';
const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

let client = null;
let user = null;
let hooks = { get: () => null, apply: () => {}, status: () => {} };
let timer = null;
let busy = false;
let again = false;

export function config() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY)); } catch { return null; }
}
export function currentUser() { return user; }

function setStatus(s) { hooks.status(s); }

async function makeClient(url, key) {
  const { createClient } = await import(SUPABASE_ESM);
  return createClient(url, key, { auth: { persistSession: true, storageKey: 'treinoabc:sb-auth' } });
}

export async function init(h) {
  hooks = h;
  const cfg = config();
  if (!cfg) return setStatus({ state: 'off' });
  try {
    client = await makeClient(cfg.url, cfg.key);
    const { data } = await client.auth.getSession();
    user = data.session?.user ?? null;
    if (!user) return setStatus({ state: 'logged-out' });
    await syncNow();
  } catch (e) {
    setStatus({ state: 'error', message: String(e.message || e) });
  }
}

export async function connect({ url, key, email, password, signup }) {
  url = url.trim().replace(/\/$/, '');
  key = key.trim();
  client = await makeClient(url, key);
  const fn = signup ? client.auth.signUp.bind(client.auth) : client.auth.signInWithPassword.bind(client.auth);
  const { data, error } = await fn({ email: email.trim(), password });
  if (error) throw error;
  localStorage.setItem(CFG_KEY, JSON.stringify({ url, key }));
  user = data.user ?? data.session?.user ?? null;
  if (!data.session) {
    setStatus({ state: 'logged-out', message: 'Conta criada. Confirme o e-mail (ou desative a confirmação no Supabase) e entre.' });
    return;
  }
  await syncNow();
}

export async function disconnect() {
  try { await client?.auth.signOut(); } catch {}
  client = null; user = null;
  localStorage.removeItem(CFG_KEY);
  setStatus({ state: 'off' });
}

export function schedule() {
  if (!client || !user) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, 1200);
}

export async function syncNow() {
  if (!client || !user) return;
  if (busy) { again = true; return; }
  busy = true;
  setStatus({ state: 'syncing' });
  try {
    const { data, error } = await client.from('gym_state').select('data').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    const local = hooks.get();
    const merged = data?.data ? merge(local, data.data) : local;
    hooks.apply(merged);
    const { error: upErr } = await client.from('gym_state').upsert({
      user_id: user.id, data: merged, updated_at: new Date().toISOString(),
    });
    if (upErr) throw upErr;
    setStatus({ state: 'ok', at: Date.now(), email: user.email });
  } catch (e) {
    setStatus({ state: 'error', message: String(e.message || e) });
  } finally {
    busy = false;
    if (again) { again = false; schedule(); }
  }
}

// Junta dois estados: histórico é união por id, treinos ficam com a versão editada por último,
// treino em andamento fica com o mais recente.
export function merge(a, b) {
  const deleted = [...new Set([...(a.deleted || []), ...(b.deleted || [])])];
  const del = new Set(deleted);
  const byId = new Map();
  for (const s of [...(b.sessions || []), ...(a.sessions || [])]) {
    if (del.has(s.id)) continue;
    const prev = byId.get(s.id);
    if (!prev || (s.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(s.id, s);
  }
  const sessions = [...byId.values()].sort((x, y) => y.startedAt - x.startedAt);
  const useB = (b.workoutsUpdatedAt || 0) > (a.workoutsUpdatedAt || 0);
  const act = [a.active, b.active]
    .filter((x) => x && !byId.has(x.id) && !del.has(x.id))
    .sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0))[0] || null;
  return {
    ...a,
    workouts: useB ? b.workouts : a.workouts,
    workoutsUpdatedAt: Math.max(a.workoutsUpdatedAt || 0, b.workoutsUpdatedAt || 0),
    sessions,
    deleted,
    active: act,
  };
}
