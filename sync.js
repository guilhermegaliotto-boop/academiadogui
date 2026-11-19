// Sincronização opcional com Supabase (login com e-mail e senha, uma linha por usuário).
// Projeto Supabase fixo do app (a publishable key é pública por natureza; os dados ficam protegidos por RLS).
const SUPABASE_URL = 'https://paorlkgemjqklsruvrsf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8hit44__oaxgumViVmrFgQ_ml7eGf7T';
const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

let client = null;
let user = null;
let hooks = { get: () => null, apply: () => {}, status: () => {} };
let timer = null;
let busy = false;
let again = false;

export function currentUser() { return user; }

function setStatus(s) { hooks.status(s); }

async function makeClient(url, key) {
  const { createClient } = await import(SUPABASE_ESM);
  return createClient(url, key, { auth: { persistSession: true, storageKey: 'treinoabc:sb-auth' } });
}

export async function init(h) {
  hooks = h;
  try {
    client = await makeClient(SUPABASE_URL, SUPABASE_KEY);
    const { data } = await client.auth.getSession();
    user = data.session?.user ?? null;
    if (!user) return setStatus({ state: 'logged-out' });
    await syncNow();
  } catch (e) {
    setStatus({ state: 'error', message: String(e.message || e) });
  }
}

// Entra com e-mail e senha; se a conta ainda não existir, cria.
export async function connect({ email, password }) {
  client ??= await makeClient(SUPABASE_URL, SUPABASE_KEY);
  email = email.trim();
  let { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error && /invalid login credentials/i.test(error.message)) {
    const up = await client.auth.signUp({ email, password });
    if (up.error) {
      if (/already registered/i.test(up.error.message)) throw new Error('Senha incorreta.');
      throw up.error;
    }
    data = up.data; error = null;
    if (!data.session) {
      setStatus({ state: 'logged-out', message: 'Conta criada! Abra o e-mail de confirmação do Supabase e depois toque em Entrar de novo.' });
      return;
    }
  }
  if (error) {
    if (/email not confirmed/i.test(error.message)) throw new Error('Confirme seu e-mail (link enviado pelo Supabase) e tente de novo.');
    throw error;
  }
  user = data.user ?? data.session?.user ?? null;
  await syncNow();
}

export async function disconnect() {
  try { await client?.auth.signOut(); } catch {}
  user = null;
  setStatus({ state: 'logged-out' });
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
    const msg = String(e.message || e);
    setStatus({ state: 'error', email: user?.email, message: /gym_state/.test(msg) ? 'A tabela ainda não foi criada no Supabase (rode supabase/schema.sql no SQL Editor).' : msg });
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
