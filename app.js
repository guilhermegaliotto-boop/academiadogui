import { CATALOG } from './catalog.js';
import { DEFAULT_WORKOUTS, DATA_VERSION, MUSCLES } from './data.js';
import * as Sync from './sync.js';
import * as St from './stats.js';

const KEY = 'treinoabc:v1';
const ASSET_BASE = 'https://assets.cimerianofficial.com/';
const DAY = 86400000;
const app = document.getElementById('app');

// ---------- estado ----------
const fresh = () => ({
  dataVersion: DATA_VERSION,
  workouts: structuredClone(DEFAULT_WORKOUTS),
  workoutsUpdatedAt: 0,
  sessions: [],
  deleted: [],
  active: null,
  settings: { rest: 90 },
});

function load() {
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!s || !Array.isArray(s.workouts)) return fresh();
  s = { ...fresh(), ...s, settings: { ...fresh().settings, ...(s.settings || {}) } };
  if ((s.dataVersion || 1) < DATA_VERSION) {
    // nova versão dos treinos (supino com barra, desenvolvimento articulado, substitutos, grupos musculares)
    s.workouts = structuredClone(DEFAULT_WORKOUTS);
    s.workoutsUpdatedAt = Date.now();
    s.dataVersion = DATA_VERSION;
  }
  return s;
}

let S = load();
const ui = { tab: 'home', view: null, open: null, sync: { state: 'logged-out' }, toast: null, dataMode: 'ex', swap: null };

function save({ sync = true } = {}) {
  if (S.active) S.active.updatedAt = Date.now();
  localStorage.setItem(KEY, JSON.stringify(S));
  if (sync) Sync.schedule();
}
// pede ao navegador para não apagar os dados
navigator.storage?.persist?.().catch(() => {});

// ---------- utilidades ----------
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const machine = (id) => CATALOG.find((m) => m.id === id) || null;
const imgUrl = (id) => {
  const m = machine(id);
  return m ? ASSET_BASE + m.path.split('/').map(encodeURIComponent).join('/') : null;
};
const workout = (id) => S.workouts.find((w) => w.id === id);
const kg = (v) => (v === '' || v == null ? '' : String(v).replace('.', ','));

// todas as definições de exercícios (inclui substitutos), por id
function defsMap() {
  const m = new Map();
  for (const w of S.workouts) for (const e of w.exercises) {
    m.set(e.id, { ...e, workoutId: w.id });
    for (const a of e.alts || []) m.set(a.id, { ...e, ...a, baseId: e.id, alts: undefined, workoutId: w.id });
  }
  return m;
}

function fmtDur(ms, long = false) {
  if (ms == null || ms < 0) return '–';
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  if (long && h) return `${h}h${String(m).padStart(2, '0')}`;
  if (long) return `${m} min`;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
const fmtDate = (t) => new Date(t).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
const fmtTime = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function ago(t) {
  const d = Math.round((startOfDay(Date.now()) - startOfDay(t)) / DAY);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
}
function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

const DUMBBELL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>`;
window.__ph = (img) => { const p = img.parentNode; p.classList.add('ph'); p.innerHTML = DUMBBELL; };

function photo(machineId, cls = 'ph-sq') {
  const url = imgUrl(machineId);
  if (!url) return `<div class="photo ${cls} ph">${DUMBBELL}</div>`;
  return `<div class="photo ${cls}"><img src="${esc(url)}" loading="lazy" decoding="async" alt="" onerror="__ph(this)"></div>`;
}

// última sessão em que o exercício teve séries feitas
function lastFor(exId) {
  for (const s of S.sessions) {
    const e = s.exercises.find((x) => x.exId === exId && !x.skipped && x.sets.some((st) => st.done));
    if (e) return { session: s, ex: e };
  }
  return null;
}
const setStr = (s) => {
  const w = s.w !== '' && s.w != null ? kg(s.w) : '';
  return w && s.r ? `${w}×${s.r}` : w ? `${w} kg` : s.r ? `${s.r} reps` : '✓';
};
const setsText = (sets) => sets.filter((s) => s.done).map(setStr).join(' · ');

function suggestedNext() {
  const last = S.sessions[0];
  if (!last) return S.workouts[0]?.id;
  const i = S.workouts.findIndex((w) => w.id === last.workoutId);
  return S.workouts[(i + 1) % S.workouts.length]?.id;
}

// ---------- treino em andamento ----------
function buildSets(exId, n) {
  const prev = lastFor(exId);
  return Array.from({ length: n }, (_, i) => {
    const p = prev?.ex.sets.filter((x) => x.done)[i] || null;
    return { w: p?.w ?? '', r: p?.r ?? '', done: false, at: null, prev: p ? { w: p.w, r: p.r } : null };
  });
}

function startWorkout(wid) {
  const at = Date.now();
  const w = workout(wid);
  if (!w) return;
  S.active = {
    id: uid(),
    workoutId: w.id,
    workoutName: `${w.name} · ${w.subtitle}`,
    startedAt: at,
    currentExId: null,
    lastSetAt: null,
    exercises: w.exercises.map((e) => ({
      exId: e.id, baseId: e.id, name: e.name, machineId: e.machineId, reps: e.reps,
      muscles: e.muscles || null,
      startedAt: null, doneAt: null, skipped: false,
      sets: buildSets(e.id, Number(e.sets) || 1),
    })),
  };
  const first = S.active.exercises[0];
  if (first) { first.startedAt = at; S.active.currentExId = first.exId; ui.open = first.exId; }
  save();
  ui.tab = 'home'; ui.view = { type: 'active' };
  keepAwake();
  render();
  scrollTo(0, 0);
}

const lastMark = () => Math.max(S.active.startedAt, ...S.active.exercises.map((e) => e.doneAt || 0));
const actEx = (id) => S.active.exercises.find((e) => e.exId === id);
const finished = (e) => e.doneAt || e.skipped;

function makeCurrent(exId) {
  const a = S.active;
  if (a.currentExId === exId) return;
  const cur = actEx(a.currentExId);
  if (cur && !finished(cur) && !cur.sets.some((s) => s.done)) cur.startedAt = null;
  const ex = actEx(exId);
  if (!finished(ex)) { ex.startedAt ??= Date.now(); a.currentExId = exId; ui.open = exId; }
}

function advance(fromExId) {
  const a = S.active;
  const now = Date.now();
  const cur = actEx(a.currentExId);
  if (cur && !finished(cur) && cur.exId !== fromExId) { ui.open = cur.exId; return; }
  const idx = a.exercises.findIndex((e) => e.exId === fromExId);
  const next = [...a.exercises.slice(idx + 1), ...a.exercises.slice(0, idx)].find((e) => !finished(e));
  if (next) {
    if (!next.sets.some((s) => s.done)) next.startedAt = now;
    a.currentExId = next.exId;
    ui.open = next.exId;
  } else {
    a.currentExId = null;
    ui.open = null;
    toast('Todos os exercícios feitos! Toque em Finalizar 💪');
  }
}

function toggleSet(exId, i) {
  const ex = actEx(exId);
  const st = ex.sets[i];
  st.done = !st.done;
  st.at = st.done ? Date.now() : null;
  if (st.done) {
    ex.skipped = false;
    // leva o peso para as próximas séries ainda vazias
    ex.sets.slice(i + 1).forEach((n) => { if (!n.done && n.w === '' && st.w !== '') n.w = st.w; });
    if (!ex.startedAt) ex.startedAt = lastMark();
    if (!ex.doneAt) S.active.currentExId = exId;
    S.active.lastSetAt = Date.now();
    if (ex.sets.every((s) => s.done) && !ex.doneAt) return completeExercise(exId);
  }
  save(); render();
}

function completeExercise(exId) {
  const a = S.active;
  const ex = actEx(exId);
  if (ex.doneAt || ex.skipped) {
    ex.doneAt = null; ex.skipped = false;
    makeCurrent(exId);
  } else {
    ex.startedAt ??= lastMark();
    ex.doneAt = Date.now();
    advance(exId);
  }
  save(); render();
}

function skipExercise(exId) {
  const ex = actEx(exId);
  if (ex.skipped) { ex.skipped = false; makeCurrent(exId); }
  else {
    ex.skipped = true; ex.doneAt = null; ex.startedAt = null;
    ex.sets.forEach((s) => { s.done = false; s.at = null; });
    advance(exId);
  }
  save(); render();
}

function swapExercise(exId, altId) {
  const ex = actEx(exId);
  const def = defsMap().get(altId);
  if (!def) return;
  const n = ex.sets.length;
  Object.assign(ex, { exId: def.id, name: def.name, machineId: def.machineId, sets: buildSets(def.id, n), doneAt: null, skipped: false });
  if (S.active.currentExId === exId) S.active.currentExId = def.id;
  ui.open = def.id; ui.swap = null;
  save(); render();
}

function finishWorkout(skipConfirm = false) {
  const a = S.active;
  if (!a) return;
  const pending = a.exercises.filter((e) => !finished(e)).length;
  if (!skipConfirm && !confirm(pending ? `Ainda faltam ${pending} exercício(s). Finalizar mesmo assim?` : 'Finalizar treino?')) return;
  const end = Date.now();
  const session = {
    ...a,
    endedAt: end,
    updatedAt: end,
    exercises: a.exercises.map((e) => ({
      ...e,
      sets: e.sets.map(({ prev, ...s }) => s),
      durationMs: e.doneAt && e.startedAt ? e.doneAt - e.startedAt : null,
    })),
  };
  delete session.currentExId;
  S.sessions.unshift(session);
  S.active = null;
  save();
  releaseAwake();
  ui.view = { type: 'session', id: session.id, fresh: true };
  render(); scrollTo(0, 0);
}

function cancelWorkout() {
  if (!confirm('Descartar este treino? Nada será salvo.')) return;
  S.deleted.push(S.active.id);
  S.active = null;
  save(); releaseAwake();
  ui.view = null; render();
}

// manter a tela ligada durante o treino
let wakeLock = null;
async function keepAwake() {
  try {
    if (S.active && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {}
}
function releaseAwake() { try { wakeLock?.release(); } catch {} wakeLock = null; }

function toast(msg) {
  ui.toast = msg;
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.append(el); }
  el.textContent = msg; el.className = 'show';
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.className = ''; }, 3200);
}

// ---------- render ----------
function render() {
  const v = ui.view;
  let html;
  if (v?.type === 'active' && S.active) html = viewActive();
  else if (v?.type === 'preview') html = viewPreview(v.id);
  else if (v?.type === 'edit') html = viewEdit(v.id);
  else if (v?.type === 'picker') html = viewPicker(v);
  else if (v?.type === 'session') html = viewSession(v.id);
  else if (v?.type === 'exstats') html = viewExStats(v.id);
  else {
    ui.view = null;
    html = { history: viewHistory, settings: viewSettings, data: viewData }[ui.tab]?.() ?? viewHome();
  }
  app.innerHTML = html + (ui.view ? '' : nav()) + (ui.swap ? swapModal() : '');
  tick();
}

const ICONS = {
  home: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  data: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  history: '<path d="M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v4h4"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
};
function nav() {
  const b = (t, label) => `<button class="tab ${ui.tab === t ? 'on' : ''}" data-act="tab" data-tab="${t}"><svg viewBox="0 0 24 24">${ICONS[t]}</svg><span>${label}</span></button>`;
  return `<nav class="tabs">${b('home', 'Treinos')}${b('data', 'Dados')}${b('history', 'Histórico')}${b('settings', 'Ajustes')}</nav>`;
}

function weekStrip() {
  const today = startOfDay(Date.now());
  const days = Array.from({ length: 7 }, (_, i) => today - (6 - i) * DAY);
  return `<div class="week">${days.map((d) => {
    const s = S.sessions.find((x) => startOfDay(x.startedAt) === d);
    const lbl = new Date(d).toLocaleDateString('pt-BR', { weekday: 'narrow' });
    return `<div class="day ${s ? 'on' : ''} ${d === today ? 'today' : ''}"><small>${lbl}</small><span>${s ? esc(s.workoutId) : ''}</span></div>`;
  }).join('')}</div>`;
}

function viewHome() {
  const next = suggestedNext();
  const nextW = workout(next);
  const week = S.sessions.filter((s) => Date.now() - s.startedAt < 7 * DAY);
  const resume = S.active
    ? `<button class="resume" data-act="resume"><span class="pulse"></span><div><small>Em andamento</small><b>${esc(S.active.workoutName)}</b></div><span class="mono" data-timer="${S.active.startedAt}"></span></button>`
    : '';
  const hero = nextW && !S.active ? `<article class="hero-card">
      <div class="collage">${nextW.exercises.slice(0, 3).map((e) => photo(e.machineId, 'ph-fill')).join('')}</div>
      <div class="hero-body">
        <span class="eyebrow">Próximo treino</span>
        <h2><span class="tag">${esc(nextW.id)}</span>${esc(nextW.subtitle)}</h2>
        <p class="muted">${nextW.exercises.length} exercícios · ${nextW.exercises.reduce((a, e) => a + Number(e.sets), 0)} séries</p>
        <div class="row2"><button class="btn primary" data-act="start" data-id="${nextW.id}">Iniciar treino</button><button class="btn ghost" data-act="preview" data-id="${nextW.id}">Ver</button></div>
      </div>
    </article>` : '';
  const others = S.workouts.filter((w) => S.active || w.id !== next).map((w) => {
    const last = S.sessions.find((s) => s.workoutId === w.id);
    return `<button class="wrow" data-act="preview" data-id="${w.id}">
      <span class="tag lg">${esc(w.id)}</span>
      <div class="grow"><b>${esc(w.subtitle)}</b><small>${w.exercises.length} exercícios · ${last ? ago(last.startedAt) : 'ainda não feito'}</small></div>
      <div class="stack">${w.exercises.slice(0, 3).map((e) => photo(e.machineId, 'ph-xs')).join('')}</div>
    </button>`;
  }).join('');
  return `<main class="page">
    <header class="top"><div><span class="eyebrow">Academia do Gui</span><h1>Treinos</h1></div><div class="kpi"><b>${week.length}</b><small>nesta semana</small></div></header>
    ${weekStrip()}
    ${['ok', 'syncing'].includes(ui.sync.state) || ui.sync.email ? '' : `<button class="cloud" data-act="tab" data-tab="settings"><span>☁️</span><div class="grow"><b>Salve seus treinos na nuvem</b><small>Entre com e-mail e senha em Ajustes</small></div><span class="chev">›</span></button>`}
    ${resume}${hero}
    <h3 class="sec">${S.active ? 'Treinos' : 'Outros treinos'}</h3>
    <div class="list">${others}</div>
  </main>`;
}

function viewPreview(id) {
  const w = workout(id);
  if (!w) { ui.view = null; return viewHome(); }
  return `<main class="page">
    <header class="bar"><button class="back" data-act="back">‹ Voltar</button><button class="link" data-act="edit" data-id="${w.id}">Editar</button></header>
    <span class="eyebrow">${esc(w.name)}</span><h1>${esc(w.subtitle)}</h1>
    <div class="list">${w.exercises.map((e, i) => {
      const l = lastFor(e.id);
      const hint = St.nextStep(St.exerciseHistory(S.sessions, e.id), e.reps);
      return `<div class="prow">
        ${photo(e.machineId, 'ph-md')}
        <div class="grow"><small class="idx">${i + 1}</small><b>${esc(e.name)}</b>
          <small>${e.sets} × ${esc(e.reps)}${machine(e.machineId) ? ' · ' + esc(machine(e.machineId).name) : ''}</small>
          ${l ? `<small class="prev">Última: ${esc(setsText(l.ex.sets))}</small>` : ''}
          ${hint?.kind === 'up' ? `<span class="chip good">↑ ${esc(hint.title.replace('Suba a carga: tente ', ''))}</span>` : ''}
          ${e.alts?.length ? `<small class="alts">Substitutos: ${e.alts.map((a) => esc(a.name)).join(', ')}</small>` : ''}
        </div></div>`;
    }).join('')}</div>
    ${S.active ? '' : `<div class="sticky"><button class="btn primary big" data-act="start" data-id="${w.id}">Iniciar ${esc(w.name)}</button></div>`}
  </main>`;
}

function exCard(e, idx) {
  const a = S.active;
  const isCur = a.currentExId === e.exId;
  const open = ui.open === e.exId;
  const doneSets = e.sets.filter((s) => s.done).length;
  const status = e.skipped ? '<span class="chip">Pulado</span>'
    : e.doneAt ? `<span class="chip good mono">${fmtDur(e.doneAt - e.startedAt)}</span>`
    : isCur && e.startedAt ? `<span class="chip live mono" data-timer="${e.startedAt}"></span>` : '';
  const head = `<div class="exhead">
      <button class="check" data-act="complete" data-id="${e.exId}" aria-label="Concluir">${e.doneAt ? '✓' : ''}</button>
      <button class="exmain" data-act="open" data-id="${e.exId}">
        ${photo(e.machineId, 'ph-sm')}
        <div class="grow"><b>${esc(e.name)}</b><small>${idx + 1}/${a.exercises.length} · ${e.sets.length} × ${esc(e.reps)}${doneSets && !e.doneAt ? ` · ${doneSets} feita${doneSets > 1 ? 's' : ''}` : ''}</small></div>
        ${status}
      </button>
    </div>`;
  if (!open) return `<li class="ex ${e.doneAt ? 'is-done' : ''} ${e.skipped ? 'is-skip' : ''} ${isCur ? 'is-cur' : ''}">${head}</li>`;

  const hist = St.exerciseHistory(S.sessions, e.exId);
  const hint = St.nextStep(hist, e.reps);
  const def = defsMap().get(e.baseId);
  const alts = def ? [{ id: def.id, name: def.name, machineId: def.machineId }, ...(def.alts || [])].filter((x) => x.id !== e.exId) : [];
  const rest = isCur && a.lastSetAt && !e.doneAt && e.sets.some((s) => s.done) && e.sets.some((s) => !s.done)
    ? `<div class="restbox" data-rest="${a.lastSetAt}" data-target="${S.settings.rest}"><div><small>Descanso</small><b class="mono" data-timer="${a.lastSetAt}"></b></div><div class="restbar"><i></i></div><small class="mono">meta ${St.fmtMin(S.settings.rest * 1000)}</small></div>` : '';
  return `<li class="ex open ${e.doneAt ? 'is-done' : ''} ${e.skipped ? 'is-skip' : ''} ${isCur ? 'is-cur' : ''}">
    ${head}
    <div class="exbody">
      ${imgUrl(e.machineId) ? `<figure class="hero-photo">${photo(e.machineId, 'ph-fill')}<figcaption>${esc(machine(e.machineId).name)}</figcaption></figure>` : ''}
      ${hint ? `<div class="hint ${hint.level}"><b>${esc(hint.title)}</b><small>${esc(hint.text)}</small></div>` : ''}
      ${rest}
      <div class="sets">
        <div class="sethead"><span>Série</span><span>Anterior</span><span>kg</span><span>Reps</span><span></span></div>
        ${e.sets.map((s, i) => `<div class="set ${s.done ? 'ok' : ''}">
          <span class="n">${i + 1}</span>
          <span class="pv mono">${s.prev ? esc(setStr({ ...s.prev, done: true })) : '—'}</span>
          <input inputmode="decimal" enterkeyhint="next" data-field="w" data-id="${e.exId}" data-i="${i}" value="${esc(kg(s.w))}" placeholder="kg">
          <input inputmode="numeric" enterkeyhint="done" data-field="r" data-id="${e.exId}" data-i="${i}" value="${esc(s.r)}" placeholder="${esc(St.repRange(e.reps)[1])}">
          <button class="setchk" data-act="set" data-id="${e.exId}" data-i="${i}" aria-label="Série feita">${s.done ? '✓' : ''}</button>
        </div>`).join('')}
      </div>
      <div class="actions">
        <button class="btn ghost sm" data-act="addset" data-id="${e.exId}">+ Série</button>
        ${alts.length ? `<button class="btn ghost sm" data-act="swap" data-id="${e.exId}">⇄ Trocar</button>` : ''}
        ${!isCur && !finished(e) ? `<button class="btn ghost sm" data-act="current" data-id="${e.exId}">Fazer agora</button>` : ''}
        <button class="btn ghost sm ${e.skipped ? '' : 'danger'}" data-act="skip" data-id="${e.exId}">${e.skipped ? 'Desfazer pulo' : '✕ Pular'}</button>
      </div>
      ${!e.skipped ? `<button class="btn ${e.doneAt ? 'ghost' : 'primary'} big" data-act="complete" data-id="${e.exId}">${e.doneAt ? 'Desmarcar exercício' : 'Concluir exercício'}</button>` : ''}
    </div>
  </li>`;
}

function viewActive() {
  const a = S.active;
  const done = a.exercises.filter(finished).length;
  const pct = (done / a.exercises.length) * 100;
  return `<header class="livebar">
      <button class="back" data-act="home">‹</button>
      <div class="grow"><small>${esc(a.workoutName)}</small><b class="mono big" data-timer="${a.startedAt}"></b></div>
      <div class="count"><b>${done}</b>/${a.exercises.length}</div>
      <div class="pbar"><i style="width:${pct}%"></i></div>
    </header>
    <main class="page active">
      <ul class="exlist">${a.exercises.map(exCard).join('')}</ul>
      <div class="row2 foot"><button class="btn ghost danger" data-act="cancel">Descartar</button><button class="btn primary" data-act="finish">Finalizar treino</button></div>
    </main>`;
}

function swapModal() {
  const e = actEx(ui.swap);
  if (!e) { ui.swap = null; return ''; }
  const def = defsMap().get(e.baseId);
  const opts = [{ id: def.id, name: def.name, machineId: def.machineId }, ...(def.alts || [])];
  return `<div class="modal" data-act="closeswap"><div class="sheet" data-stop>
    <span class="eyebrow">Trocar exercício</span><h2>${esc(def.name)}</h2>
    <p class="muted small">Substitutos com máquinas Cimerian. Cada um tem seu próprio histórico de carga.</p>
    <div class="list">${opts.map((o) => {
      const l = lastFor(o.id);
      return `<button class="prow pick ${o.id === e.exId ? 'sel' : ''}" data-act="doswap" data-id="${e.exId}" data-alt="${o.id}">
        ${photo(o.machineId, 'ph-md')}
        <div class="grow"><b>${esc(o.name)}</b><small>${esc(machine(o.machineId)?.name || '')}</small>${l ? `<small class="prev">Última: ${esc(setsText(l.ex.sets))}</small>` : ''}</div>
        ${o.id === e.exId ? '<span class="chip good">Atual</span>' : ''}
      </button>`;
    }).join('')}</div>
    <button class="link full" data-act="closeswap">Cancelar</button>
  </div></div>`;
}

function viewHistory() {
  if (!S.sessions.length) return `<main class="page"><header class="top"><div><span class="eyebrow">Academia do Gui</span><h1>Histórico</h1></div></header><p class="empty">Nenhum treino registrado ainda.<br>Comece um treino na aba Treinos.</p></main>`;
  let lastMonth = '';
  const rows = S.sessions.map((s) => {
    const month = new Date(s.startedAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const head = month !== lastMonth ? `<h3 class="sec">${month}</h3>` : '';
    lastMonth = month;
    const done = s.exercises.filter((e) => e.doneAt).length;
    return `${head}<button class="wrow" data-act="session" data-id="${s.id}">
      <span class="tag lg">${esc(s.workoutId)}</span>
      <div class="grow"><b>${esc(s.workoutName.split('·')[1]?.trim() || s.workoutName)}</b><small>${fmtDate(s.startedAt)} · ${fmtTime(s.startedAt)}</small></div>
      <div class="r"><b class="mono">${fmtDur(s.endedAt - s.startedAt, true)}</b><small>${done}/${s.exercises.length}</small></div>
    </button>`;
  }).join('');
  return `<main class="page"><header class="top"><div><span class="eyebrow">Academia do Gui</span><h1>Histórico</h1></div><div class="kpi"><b>${S.sessions.length}</b><small>treinos</small></div></header><div class="list">${rows}</div></main>`;
}

function viewSession(id) {
  const s = S.sessions.find((x) => x.id === id);
  if (!s) { ui.view = null; return viewHistory(); }
  const volume = s.exercises.reduce((acc, e) => acc + e.sets.filter((x) => x.done).reduce((a2, x) => a2 + (parseFloat(x.w) || 0) * (parseInt(x.r) || 0), 0), 0);
  const maxD = Math.max(1, ...s.exercises.map((e) => e.durationMs || 0));
  return `<main class="page">
    <header class="bar"><button class="back" data-act="back">‹ ${ui.view.fresh ? 'Início' : 'Histórico'}</button><button class="link danger" data-act="delsession" data-id="${s.id}">Apagar</button></header>
    ${ui.view.fresh ? '<div class="hint good"><b>Treino salvo! 🎉</b><small>Os pesos de cada série já ficam preenchidos no próximo treino.</small></div>' : ''}
    <span class="eyebrow">${fmtDate(s.startedAt)} · ${fmtTime(s.startedAt)}–${fmtTime(s.endedAt)}</span>
    <h1>${esc(s.workoutName)}</h1>
    <div class="stats">
      <div><small>Duração</small><b class="mono">${fmtDur(s.endedAt - s.startedAt, true)}</b></div>
      <div><small>Exercícios</small><b class="mono">${s.exercises.filter((e) => e.doneAt).length}/${s.exercises.length}</b></div>
      <div><small>Volume</small><b class="mono">${Math.round(volume).toLocaleString('pt-BR')}<span class="u">kg</span></b></div>
    </div>
    <div class="list">${s.exercises.map((e) => `<div class="prow ${e.skipped ? 'is-skip' : ''}">
      ${photo(e.machineId, 'ph-sm')}
      <div class="grow"><b>${esc(e.name)}</b>
        <small class="mono">${e.skipped ? 'Pulado' : esc(setsText(e.sets)) || 'sem séries registradas'}</small>
        ${e.durationMs ? `<div class="tbar"><i style="width:${(e.durationMs / maxD) * 100}%"></i></div>` : ''}</div>
      <span class="mono t">${e.durationMs ? fmtDur(e.durationMs) : '–'}</span>
    </div>`).join('')}</div>
  </main>`;
}

// ---------- aba Dados ----------
function viewData() {
  const seg = `<div class="seg"><button class="${ui.dataMode === 'ex' ? 'on' : ''}" data-act="dmode" data-mode="ex">Exercícios</button><button class="${ui.dataMode === 'groups' ? 'on' : ''}" data-act="dmode" data-mode="groups">Grupos musculares</button></div>`;
  const header = `<header class="top"><div><span class="eyebrow">Academia do Gui</span><h1>Dados</h1></div></header>`;
  if (!S.sessions.length) return `<main class="page">${header}${seg}<p class="empty">Os gráficos aparecem depois do primeiro treino salvo.</p></main>`;
  return `<main class="page">${header}${seg}${ui.dataMode === 'groups' ? dataGroups() : dataExercises()}</main>`;
}

function overview() {
  const now = Date.now();
  const last28 = S.sessions.filter((s) => now - s.startedAt < 28 * DAY);
  const avgDur = last28.length ? last28.reduce((a, s) => a + (s.endedAt - s.startedAt), 0) / last28.length : 0;
  return `<div class="stats">
    <div><small>Treinos (4 sem.)</small><b class="mono">${last28.length}</b></div>
    <div><small>Por semana</small><b class="mono">${(last28.length / 4).toFixed(1).replace('.', ',')}</b></div>
    <div><small>Duração média</small><b class="mono">${avgDur ? fmtDur(avgDur, true) : '–'}</b></div>
  </div>`;
}

function dataExercises() {
  const blocks = S.workouts.map((w) => {
    const rows = w.exercises.flatMap((e) => [e, ...(e.alts || []).map((a) => ({ ...e, ...a }))])
      .map((e) => ({ e, h: St.exerciseHistory(S.sessions, e.id) }))
      .filter(({ e, h }) => h.length || !e.id.includes('-'))
      .map(({ e, h }) => {
        const last = h.at(-1);
        const first = h[0];
        const delta = h.length > 1 && first.e1rm ? ((last.e1rm - first.e1rm) / first.e1rm) * 100 : null;
        return `<button class="drow" data-act="exstats" data-id="${e.id}" ${h.length ? '' : 'disabled'}>
          ${photo(e.machineId, 'ph-xs')}
          <div class="grow"><b>${esc(e.name)}</b><small>${last ? `${kg(last.top.w)} kg × ${last.top.r} · ${h.length} sessõ${h.length > 1 ? 'es' : 'ão'}` : 'sem dados ainda'}</small></div>
          ${h.length > 1 ? St.sparkline(h.map((x) => x.e1rm)) : ''}
          ${delta != null ? `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(0)}%</span>` : ''}
        </button>`;
      }).join('');
    return `<h3 class="sec"><span class="tag">${esc(w.id)}</span> ${esc(w.subtitle)}</h3><div class="list">${rows}</div>`;
  }).join('');
  return overview() + `<p class="muted small">Toque num exercício para ver a evolução de carga, o tempo e a análise.</p>` + blocks;
}

function viewExStats(id) {
  const def = defsMap().get(id);
  const h = St.exerciseHistory(S.sessions, id);
  if (!def || !h.length) { ui.view = null; ui.tab = 'data'; return viewData(); }
  const last = h.at(-1), first = h[0];
  const best = h.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
  const tips = St.insights(h, def);
  const icon = { good: '✓', warn: '!', info: 'i' };
  return `<main class="page">
    <header class="bar"><button class="back" data-act="back">‹ Dados</button></header>
    <div class="exhero">${photo(def.machineId, 'ph-md')}<div><span class="eyebrow">${esc(machine(def.machineId)?.name || 'Livre')}</span><h1>${esc(def.name)}</h1><small class="muted">Meta: ${def.sets} × ${esc(def.reps)}</small></div></div>
    <div class="stats">
      <div><small>Última carga</small><b class="mono">${kg(last.top.w)}<span class="u">kg</span></b><small>× ${last.top.r} reps</small></div>
      <div><small>1RM estimado</small><b class="mono">${kg(Math.round(last.e1rm))}<span class="u">kg</span></b><small>recorde ${kg(Math.round(best.e1rm))}</small></div>
      <div><small>Desde o início</small><b class="mono">${h.length > 1 ? (last.top.w - first.top.w >= 0 ? '+' : '') + kg(last.top.w - first.top.w) : '–'}<span class="u">kg</span></b><small>${h.length} sessões</small></div>
    </div>
    <h3 class="sec">Análise</h3>
    <div class="list">${tips.map((t) => `<div class="hint ${t.level}"><span class="ic">${icon[t.level]}</span><div><b>${esc(t.title)}</b><small>${esc(t.text)}</small></div></div>`).join('')}</div>
    <section class="card">
      <h3>Carga da série mais pesada</h3><p class="muted small">kg por sessão</p>
      ${St.lineChart(h.map((x) => ({ x: x.at, y: x.top.w, tip: `${new Date(x.at).toLocaleDateString('pt-BR')}: ${x.sets.map((s) => `${kg(s.w)}×${s.r}`).join(' · ')}` })))}
    </section>
    <section class="card">
      <h3>1RM estimado</h3><p class="muted small">Força calculada pela fórmula de Epley (peso × reps). Sobe quando você ganha carga ou repetições.</p>
      ${St.lineChart(h.map((x) => ({ x: x.at, y: Math.round(x.e1rm * 10) / 10 })))}
    </section>
    ${h.some((x) => x.durationMs) ? `<section class="card">
      <h3>Tempo no exercício</h3><p class="muted small">minutos, incluindo descanso</p>
      ${St.barChart(h.filter((x) => x.durationMs).map((x) => ({ x: x.at, y: x.durationMs / 60000, tip: `${new Date(x.at).toLocaleDateString('pt-BR')}: ${St.fmtMin(x.durationMs)} (${St.fmtMin(x.durationMs / x.sets.length)}/série)` })), { fmt: (v) => Math.round(v).toString() })}
    </section>` : ''}
    <h3 class="sec">Sessões</h3>
    <div class="table">${[...h].reverse().map((x) => `<div class="tr"><span>${new Date(x.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span><span class="mono">${x.sets.map((s) => `${kg(s.w)}×${s.r}`).join('  ')}</span><span class="mono muted">${x.durationMs ? St.fmtMin(x.durationMs) : ''}</span></div>`).join('')}</div>
  </main>`;
}

function dataGroups() {
  const now = Date.now();
  const defs = defsMap();
  const firstAt = S.sessions.at(-1)?.startedAt ?? now;
  const weeks = Math.min(4, Math.max(1, Math.ceil((now - firstAt) / (7 * DAY))));
  const tot = St.muscleSets(S.sessions, defs, now - weeks * 7 * DAY, now + 1);
  const avg = Object.fromEntries(MUSCLES.map((m) => [m, tot[m] / weeks]));
  const week = St.muscleSets(S.sessions, defs, now - 7 * DAY, now + 1);
  const max = Math.max(24, ...Object.values(avg));
  const X = (v) => (v / max) * 100;
  const rows = [...MUSCLES].sort((a, b) => avg[b] - avg[a]).map((m) => {
    const v = avg[m];
    const lvl = v < 8 ? 'warn' : v > 22 ? 'info' : 'good';
    return `<div class="mrow" data-tip="${esc(`${m}: ${v.toFixed(1).replace('.', ',')} séries/semana (últimos 7 dias: ${week[m].toFixed(1).replace('.', ',')})`)}">
      <span class="mname">${m}</span>
      <div class="mtrack"><div class="zone" style="left:${X(10)}%;width:${X(20) - X(10)}%"></div><i class="${lvl}" style="width:${Math.max(X(v), 0.5)}%"></i></div>
      <span class="mval mono">${v.toFixed(1).replace('.', ',')}</span>
    </div>`;
  }).join('');
  const tips = St.groupInsights(avg);
  const icon = { good: '✓', warn: '!', info: 'i' };
  return `${overview()}
    <section class="card">
      <h3>Séries por semana</h3>
      <p class="muted small">Média das últimas ${weeks} semana${weeks > 1 ? 's' : ''}. Exercício principal conta 1 série, secundário conta ½. A faixa clara (10–20) é o volume recomendado para hipertrofia.</p>
      <div class="mchart">${rows}</div>
      <div class="legend"><span><i class="zone"></i>faixa ideal 10–20</span><span><i class="good"></i>na faixa</span><span><i class="warn"></i>abaixo de 8</span></div>
    </section>
    <h3 class="sec">Análise</h3>
    <div class="list">${tips.map((t) => `<div class="hint ${t.level}"><span class="ic">${icon[t.level]}</span><div><b>${esc(t.title)}</b><small>${esc(t.text)}</small></div></div>`).join('')}</div>`;
}

// ---------- editar ----------
function viewEdit(id) {
  const w = workout(id);
  return `<main class="page">
    <header class="bar"><button class="back" data-act="back">‹ Pronto</button><button class="link danger" data-act="resetw" data-id="${w.id}">Restaurar padrão</button></header>
    <span class="eyebrow">Editar</span><h1>${esc(w.name)}</h1>
    <label class="fld">Nome do grupo<input data-wfield="subtitle" data-wid="${w.id}" value="${esc(w.subtitle)}"></label>
    <div class="list">${w.exercises.map((e, i) => `<div class="erow">
      <button class="tbtn" data-act="pick" data-wid="${w.id}" data-i="${i}">${photo(e.machineId, 'ph-md')}<small>trocar foto</small></button>
      <div class="grow">
        <input class="name" data-efield="name" data-wid="${w.id}" data-i="${i}" value="${esc(e.name)}">
        <div class="row tight">
          <label>Séries<input inputmode="numeric" data-efield="sets" data-wid="${w.id}" data-i="${i}" value="${esc(e.sets)}"></label>
          <label>Reps<input data-efield="reps" data-wid="${w.id}" data-i="${i}" value="${esc(e.reps)}"></label>
          <label>Grupo<select data-efield="muscle" data-wid="${w.id}" data-i="${i}">${MUSCLES.map((m) => `<option ${e.muscles?.p?.[0] === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        </div>
      </div>
      <div class="ord">
        <button data-act="up" data-wid="${w.id}" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
        <button data-act="down" data-wid="${w.id}" data-i="${i}" ${i === w.exercises.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
        <button data-act="rm" data-wid="${w.id}" data-i="${i}" aria-label="Remover">✕</button>
      </div>
    </div>`).join('')}</div>
    <button class="btn ghost big" data-act="addex" data-wid="${w.id}">+ Adicionar exercício</button>
  </main>`;
}

function viewPicker(v) {
  const e = workout(v.wid).exercises[v.i];
  return `<main class="page">
    <header class="bar"><button class="back" data-act="backedit">‹ Voltar</button></header>
    <span class="eyebrow">Catálogo Cimerian</span><h1>${esc(e.name)}</h1>
    <input class="search" placeholder="Buscar máquina…" data-act-input="filter">
    <div class="grid">
      <button class="gitem ${e.machineId == null ? 'sel' : ''}" data-act="choose" data-mid="" data-name="sem maquina halteres livre">${photo(null, 'ph-fill')}<span>Sem máquina (halteres / livre)</span></button>
      ${CATALOG.map((m) => `<button class="gitem ${e.machineId === m.id ? 'sel' : ''}" data-act="choose" data-mid="${m.id}" data-name="${esc(m.name.toLowerCase())}">${photo(m.id, 'ph-fill')}<span>${esc(m.name)}</span></button>`).join('')}
    </div>
  </main>`;
}

// ---------- ajustes ----------
function viewSettings() {
  const st = ui.sync;
  const status = {
    'logged-out': st.message || 'Entre para salvar seus treinos na nuvem (Supabase). Sem login, eles ficam só neste aparelho.',
    syncing: 'Sincronizando…',
    ok: `Sincronizado ${st.at ? 'às ' + fmtTime(st.at) : ''} ${st.email ? '· ' + esc(st.email) : ''}`,
    error: 'Erro: ' + esc(st.message || ''),
  }[st.state] || '';
  return `<main class="page">
    <header class="top"><div><span class="eyebrow">Academia do Gui</span><h1>Ajustes</h1></div></header>

    <section class="card">
      <h3>⏱ Descanso entre séries</h3>
      <p class="muted small">Depois de marcar uma série, o app mostra o descanso e avisa quando bater a meta.</p>
      <div class="seg">${[60, 90, 120, 150, 180].map((v) => `<button class="${S.settings.rest === v ? 'on' : ''}" data-act="rest" data-v="${v}">${St.fmtMin(v * 1000)}</button>`).join('')}</div>
    </section>

    <section class="card">
      <h3>☁️ Conta na nuvem</h3>
      <p class="muted small">${status}</p>
      ${st.state === 'ok' || st.state === 'syncing' || (st.state === 'error' && st.email) ? `<div class="row"><button class="btn ghost sm" data-act="syncnow">Sincronizar agora</button><button class="btn ghost sm danger" data-act="syncoff">Sair</button></div>` : `
      <form id="syncform" class="form">
        <label class="fld">E-mail<input name="email" type="email" autocomplete="username" required></label>
        <label class="fld">Senha<input name="password" type="password" autocomplete="current-password" required minlength="6"></label>
        <button class="btn primary big">Entrar</button>
      </form>
      <p class="muted small">Primeira vez? Use qualquer e-mail e senha: a conta é criada na hora. Você só faz isso uma vez por aparelho.</p>`}
    </section>

    <section class="card">
      <h3>💾 Backup</h3>
      <div class="row"><button class="btn ghost sm" data-act="export">Exportar JSON</button>
      <label class="btn ghost sm">Importar JSON<input type="file" accept="application/json" id="importfile" hidden></label></div>
      <p class="muted small">${S.sessions.length} treinos salvos neste aparelho.</p>
    </section>
    <p class="muted small center">Fotos das máquinas: catálogo Cimerian.</p>
  </main>`;
}

// ---------- relógios ----------
function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-timer]').forEach((el) => { el.textContent = fmtDur(now - Number(el.dataset.timer)); });
  document.querySelectorAll('[data-rest]').forEach((el) => {
    const pct = Math.min(1, (now - Number(el.dataset.rest)) / (Number(el.dataset.target) * 1000));
    el.querySelector('.restbar i').style.width = `${pct * 100}%`;
    el.classList.toggle('ready', pct >= 1);
  });
}
setInterval(tick, 1000);

// ---------- eventos ----------
let tipEl;
function showTip(target) {
  tipEl ??= Object.assign(document.createElement('div'), { id: 'tip' });
  document.body.append(tipEl);
  tipEl.textContent = target.dataset.tip;
  const r = target.getBoundingClientRect();
  tipEl.style.left = `${Math.min(window.innerWidth - 12, Math.max(12, r.left + r.width / 2))}px`;
  tipEl.style.top = `${r.top + window.scrollY - 8}px`;
  tipEl.className = 'show';
  clearTimeout(showTip.t); showTip.t = setTimeout(() => (tipEl.className = ''), 2600);
}

document.addEventListener('click', (ev) => {
  const tipT = ev.target.closest('[data-tip]');
  if (tipT) return showTip(tipT);
  if (ev.target.closest('[data-stop]') && !ev.target.closest('[data-act]')) return;
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const { act, id } = el.dataset;
  const wid = el.dataset.wid, i = Number(el.dataset.i);
  const w = wid ? workout(wid) : null;
  let top = false;
  switch (act) {
    case 'tab': ui.tab = el.dataset.tab; ui.view = null; top = true; break;
    case 'preview': ui.view = { type: 'preview', id }; top = true; break;
    case 'start':
      if (S.active) return toast('Já existe um treino em andamento.');
      return startWorkout(id);
    case 'resume': ui.view = { type: 'active' }; keepAwake(); top = true; break;
    case 'home': case 'back':
      ui.view = ui.view?.type === 'edit' ? { type: 'preview', id: ui.view.id } : null; top = true; break;
    case 'edit': ui.view = { type: 'edit', id }; top = true; break;
    case 'open': ui.open = ui.open === id ? null : id; break;
    case 'current': makeCurrent(id); save(); break;
    case 'set': return toggleSet(id, i);
    case 'addset': { const ex = actEx(id); const l = ex.sets.at(-1); ex.sets.push({ w: l?.w ?? '', r: l?.r ?? '', done: false, at: null, prev: null }); ex.doneAt = null; save(); break; }
    case 'complete': return completeExercise(id);
    case 'skip': return skipExercise(id);
    case 'swap': ui.swap = id; break;
    case 'doswap': return swapExercise(id, el.dataset.alt);
    case 'closeswap': ui.swap = null; break;
    case 'finish': return finishWorkout();
    case 'cancel': return cancelWorkout();
    case 'session': ui.view = { type: 'session', id }; top = true; break;
    case 'delsession':
      if (!confirm('Apagar este treino do histórico?')) return;
      S.sessions = S.sessions.filter((s) => s.id !== id); S.deleted.push(id); save(); ui.view = null; ui.tab = 'history'; break;
    case 'dmode': ui.dataMode = el.dataset.mode; break;
    case 'exstats': ui.view = { type: 'exstats', id }; top = true; break;
    case 'rest': S.settings.rest = Number(el.dataset.v); save(); break;
    case 'resetw':
      if (!confirm('Voltar este treino para a lista original?')) return;
      w.exercises = structuredClone(DEFAULT_WORKOUTS.find((d) => d.id === wid)?.exercises || w.exercises); touchW(); break;
    case 'up': case 'down': { const j = act === 'up' ? i - 1 : i + 1; [w.exercises[i], w.exercises[j]] = [w.exercises[j], w.exercises[i]]; touchW(); break; }
    case 'rm': if (!confirm(`Remover “${w.exercises[i].name}”?`)) return; w.exercises.splice(i, 1); touchW(); break;
    case 'addex': w.exercises.push({ id: uid(), name: 'Novo exercício', sets: 3, reps: '10–12', machineId: null, muscles: { p: ['Peito'], s: [] } }); touchW(); break;
    case 'pick': ui.view = { type: 'picker', wid, i }; top = true; break;
    case 'backedit': ui.view = { type: 'edit', id: ui.view.wid }; break;
    case 'choose': { const v = ui.view; workout(v.wid).exercises[v.i].machineId = el.dataset.mid ? Number(el.dataset.mid) : null; touchW(); ui.view = { type: 'edit', id: v.wid }; break; }
    case 'copy': navigator.clipboard?.writeText(el.dataset.text).then(() => toast('Link copiado'), () => {}); return;
    case 'syncnow': Sync.syncNow(); return;
    case 'syncoff': Sync.disconnect(); return;
    case 'export': return exportJSON();
    default: return;
  }
  render();
  if (top) scrollTo(0, 0);
});

function touchW() { S.workoutsUpdatedAt = Date.now(); save(); }

app.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.field && S.active) {
    const ex = actEx(el.dataset.id);
    ex.sets[Number(el.dataset.i)][el.dataset.field] = el.value.replace(',', '.').trim();
    save();
  } else if (el.dataset.efield) {
    const e = workout(el.dataset.wid).exercises[Number(el.dataset.i)];
    const f = el.dataset.efield;
    if (f === 'sets') e.sets = Math.max(1, parseInt(el.value) || 1);
    else if (f === 'muscle') e.muscles = { p: [el.value], s: e.muscles?.s || [] };
    else e[f] = el.value;
    touchW();
  } else if (el.dataset.wfield) {
    workout(el.dataset.wid)[el.dataset.wfield] = el.value; touchW();
  } else if (el.dataset.actInput === 'filter') {
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const q = norm(el.value);
    app.querySelectorAll('.gitem').forEach((g) => {
      g.hidden = q && !q.split(/\s+/).every((t) => norm(g.dataset.name).includes(t));
    });
  }
});
// select dispara 'change' no iOS
app.addEventListener('change', (ev) => {
  if (ev.target.tagName === 'SELECT') ev.target.dispatchEvent(new Event('input', { bubbles: true }));
});

app.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'syncform') return;
  ev.preventDefault();
  const fd = new FormData(ev.target);
  try {
    await Sync.connect({ email: fd.get('email'), password: fd.get('password') });
  } catch (e) {
    ui.sync = { state: 'error', message: e.message || String(e) }; render();
  }
});

app.addEventListener('change', (ev) => {
  if (ev.target.id !== 'importfile') return;
  const f = ev.target.files[0];
  if (!f) return;
  f.text().then((t) => {
    const data = JSON.parse(t);
    if (!Array.isArray(data.workouts)) throw new Error('Arquivo inválido');
    S = Sync.merge(S, { ...fresh(), ...data });
    save(); toast('Backup importado'); render();
  }).catch((e) => alert('Não foi possível importar: ' + e.message));
});

function exportJSON() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `academia-do-gui-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- inicialização ----------
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { keepAwake(); Sync.schedule(); tick(); }
});

if (S.active) ui.view = { type: 'active' };
localStorage.setItem(KEY, JSON.stringify(S));
render();

Sync.init({
  get: () => S,
  apply: (merged) => {
    const before = JSON.stringify(S);
    S = { ...fresh(), ...merged, settings: { ...fresh().settings, ...(merged.settings || {}) } };
    if ((S.dataVersion || 1) < DATA_VERSION) { S.workouts = structuredClone(DEFAULT_WORKOUTS); S.workoutsUpdatedAt = Date.now(); S.dataVersion = DATA_VERSION; }
    localStorage.setItem(KEY, JSON.stringify(S));
    if (JSON.stringify(S) !== before && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      if (S.active && !ui.view) ui.view = { type: 'active' };
      render();
    }
  },
  status: (s) => { ui.sync = s; if (!ui.view && !['INPUT', 'SELECT'].includes(document.activeElement?.tagName)) render(); },
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
