import { CATALOG } from './catalog.js';
import { DEFAULT_WORKOUTS } from './data.js';
import * as Sync from './sync.js';

const KEY = 'treinoabc:v1';
const ASSET_BASE = 'https://assets.cimerianofficial.com/';
const app = document.getElementById('app');

// ---------- estado ----------
const fresh = () => ({
  workouts: structuredClone(DEFAULT_WORKOUTS),
  workoutsUpdatedAt: 0,
  sessions: [],
  deleted: [],
  active: null,
});

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.workouts)) return { ...fresh(), ...s };
  } catch {}
  return fresh();
}

let S = load();
const ui = { tab: 'home', view: null, open: null, sync: { state: 'off' }, watchPrompt: null, toast: null };

function save({ sync = true } = {}) {
  if (S.active) S.active.updatedAt = Date.now();
  localStorage.setItem(KEY, JSON.stringify(S));
  if (sync) Sync.schedule();
}

// ---------- utilidades ----------
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const machine = (id) => CATALOG.find((m) => m.id === id) || null;
const imgUrl = (id) => {
  const m = machine(id);
  return m ? ASSET_BASE + m.path.split('/').map(encodeURIComponent).join('/') : null;
};
const workout = (id) => S.workouts.find((w) => w.id === id);

function fmtDur(ms, long = false) {
  if (ms == null || ms < 0) return '–';
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  if (long && h) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (long) return `${m}min ${String(s).padStart(2, '0')}s`;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
const fmtDate = (t) => new Date(t).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
const fmtTime = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function ago(t) {
  const d = Math.floor((Date.now() - t) / 86400000);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
}

function thumb(machineId, cls = 'thumb') {
  const url = imgUrl(machineId);
  if (!url) return `<div class="${cls} ph">${DUMBBELL}</div>`;
  return `<div class="${cls}"><img src="${esc(url)}" loading="lazy" alt="" onerror="this.parentNode.classList.add('ph');this.replaceWith(Object.assign(document.createElement('span'),{innerHTML:window.__DB}))"></div>`;
}
const DUMBBELL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>`;
window.__DB = DUMBBELL;

// última vez que cada exercício foi feito (para sugerir pesos)
function lastFor(exId) {
  for (const s of S.sessions) {
    const e = s.exercises.find((x) => x.exId === exId && x.sets.some((st) => st.done));
    if (e) return { session: s, ex: e };
  }
  return null;
}
const setsText = (sets) =>
  sets.filter((s) => s.done).map((s) => {
    const w = s.w !== '' && s.w != null ? `${s.w}kg` : '';
    const r = s.r ? `${w ? '×' : ''}${s.r}${w ? '' : ' reps'}` : '';
    return w || r ? w + r : '✓';
  }).join(' · ');

function suggestedNext() {
  const last = S.sessions[0];
  if (!last) return S.workouts[0]?.id;
  const i = S.workouts.findIndex((w) => w.id === last.workoutId);
  return S.workouts[(i + 1) % S.workouts.length]?.id;
}

// ---------- treino em andamento ----------
function startWorkout(wid, { source = 'app', at = Date.now() } = {}) {
  const w = workout(wid);
  if (!w) return;
  S.active = {
    id: uid(),
    workoutId: w.id,
    workoutName: `${w.name} · ${w.subtitle}`,
    startedAt: at,
    source,
    currentExId: null,
    lastSetAt: null,
    exercises: w.exercises.map((e) => {
      const prev = lastFor(e.id);
      return {
        exId: e.id, name: e.name, machineId: e.machineId, reps: e.reps,
        startedAt: null, doneAt: null,
        sets: Array.from({ length: Number(e.sets) || 1 }, (_, i) => {
          const p = prev?.ex.sets[i] || prev?.ex.sets.at(-1);
          return { w: p?.w ?? '', r: p?.r ?? '', done: false, at: null };
        }),
      };
    }),
  };
  const first = S.active.exercises[0];
  if (first) { first.startedAt = at; S.active.currentExId = first.exId; ui.open = first.exId; }
  save();
  ui.tab = 'home'; ui.view = { type: 'active' };
  keepAwake();
  render();
}

const lastMark = () => Math.max(S.active.startedAt, ...S.active.exercises.map((e) => e.doneAt || 0));
const actEx = (id) => S.active.exercises.find((e) => e.exId === id);

function makeCurrent(exId) {
  const a = S.active;
  if (a.currentExId === exId) return;
  const cur = actEx(a.currentExId);
  if (cur && !cur.doneAt && !cur.sets.some((s) => s.done)) cur.startedAt = null;
  const ex = actEx(exId);
  if (!ex.doneAt) { ex.startedAt ??= Date.now(); a.currentExId = exId; }
}

function toggleSet(exId, i) {
  const ex = actEx(exId);
  const st = ex.sets[i];
  st.done = !st.done;
  st.at = st.done ? Date.now() : null;
  if (st.done) {
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
  if (ex.doneAt) {
    ex.doneAt = null;
    a.currentExId = exId;
  } else {
    const now = Date.now();
    ex.startedAt ??= lastMark();
    ex.doneAt = now;
    const next = a.exercises.find((e) => !e.doneAt);
    if (next) {
      if (a.currentExId === exId || !actEx(a.currentExId) || actEx(a.currentExId).doneAt) {
        if (!next.sets.some((s) => s.done)) next.startedAt = now;
        a.currentExId = next.exId;
      }
      ui.open = a.currentExId;
    } else {
      a.currentExId = null;
      ui.open = null;
      toast('Todos os exercícios feitos! Toque em Finalizar 💪');
    }
  }
  save(); render();
}

function finishWorkout(skipConfirm = false) {
  const a = S.active;
  if (!a) return;
  const pending = a.exercises.filter((e) => !e.doneAt).length;
  if (!skipConfirm && !confirm(pending ? `Ainda faltam ${pending} exercício(s). Finalizar mesmo assim?` : 'Finalizar treino?')) return;
  const end = Date.now();
  const session = {
    ...a,
    endedAt: end,
    updatedAt: end,
    exercises: a.exercises.map((e) => ({
      ...e,
      durationMs: e.doneAt && e.startedAt ? e.doneAt - e.startedAt : null,
    })),
  };
  delete session.currentExId;
  S.sessions.unshift(session);
  S.active = null;
  save();
  releaseAwake();
  ui.view = { type: 'session', id: session.id, fresh: true };
  render();
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
  try { if (S.active && 'wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); wakeLock?.addEventListener('release', () => (wakeLock = null)); } catch {}
}
function releaseAwake() { try { wakeLock?.release(); } catch {} wakeLock = null; }

function toast(msg) {
  ui.toast = msg; renderToast();
  clearTimeout(toast.t); toast.t = setTimeout(() => { ui.toast = null; renderToast(); }, 3200);
}
function renderToast() {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.append(el); }
  el.textContent = ui.toast || '';
  el.className = ui.toast ? 'show' : '';
}

// ---------- telas ----------
function render() {
  const v = ui.view;
  let html;
  if (v?.type === 'active' && S.active) html = viewActive();
  else if (v?.type === 'preview') html = viewPreview(v.id);
  else if (v?.type === 'edit') html = viewEdit(v.id);
  else if (v?.type === 'picker') html = viewPicker(v);
  else if (v?.type === 'session') html = viewSession(v.id);
  else { ui.view = null; html = ui.tab === 'history' ? viewHistory() : ui.tab === 'settings' ? viewSettings() : viewHome(); }
  app.innerHTML = html + (ui.view ? '' : nav()) + (ui.watchPrompt ? watchModal() : '');
  tick();
}

function nav() {
  const b = (t, label, icon) => `<button class="tab ${ui.tab === t ? 'on' : ''}" data-act="tab" data-tab="${t}">${icon}<span>${label}</span></button>`;
  return `<nav class="tabs">
    ${b('home', 'Treinos', '<svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>')}
    ${b('history', 'Histórico', '<svg viewBox="0 0 24 24"><path d="M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v4h4"/></svg>')}
    ${b('settings', 'Ajustes', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7.1 19.7l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.3 7.1l-.1-.1A2 2 0 1 1 7 4.2l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>')}
  </nav>`;
}

function viewHome() {
  const next = suggestedNext();
  const banner = S.active
    ? `<button class="resume" data-act="resume"><span class="pulse"></span><div><b>${esc(S.active.workoutName)}</b><small>Em andamento · <span data-timer="${S.active.startedAt}"></span></small></div><span class="chev">›</span></button>`
    : '';
  const cards = S.workouts.map((w) => {
    const last = S.sessions.find((s) => s.workoutId === w.id);
    return `<article class="wcard ${w.id === next && !S.active ? 'next' : ''}">
      <button class="wcard-main" data-act="preview" data-id="${w.id}">
        <div class="letter">${esc(w.id)}</div>
        <div class="wtext"><h2>${esc(w.subtitle || w.name)}</h2>
          <p>${w.exercises.length} exercícios · ${last ? 'último ' + ago(last.startedAt) : 'ainda não feito'}</p></div>
        ${w.id === next && !S.active ? '<span class="badge">Próximo</span>' : ''}
      </button>
      <div class="strip">${w.exercises.slice(0, 7).map((e) => thumb(e.machineId, 'mini')).join('')}</div>
      ${S.active ? '' : `<button class="btn primary" data-act="start" data-id="${w.id}">Iniciar ${esc(w.name)}</button>`}
    </article>`;
  }).join('');
  const weekCount = S.sessions.filter((s) => Date.now() - s.startedAt < 7 * 86400000).length;
  return `<main class="page">
    <header class="top"><div><h1>Treino ABC</h1><p class="muted">${weekCount} treino${weekCount === 1 ? '' : 's'} nos últimos 7 dias</p></div></header>
    ${banner}${cards}
  </main>`;
}

function viewPreview(id) {
  const w = workout(id);
  if (!w) { ui.view = null; return viewHome(); }
  return `<main class="page">
    <header class="bar"><button class="back" data-act="back">‹ Voltar</button><button class="link" data-act="edit" data-id="${w.id}">Editar</button></header>
    <h1>${esc(w.name)} <span class="muted">· ${esc(w.subtitle)}</span></h1>
    <ul class="plist">${w.exercises.map((e) => {
      const l = lastFor(e.id);
      return `<li>${thumb(e.machineId)}<div><b>${esc(e.name)}</b><small>${e.sets} × ${esc(e.reps)}${machine(e.machineId) ? ' · ' + esc(machine(e.machineId).name) : ''}</small>
      ${l ? `<small class="last">Última: ${esc(setsText(l.ex.sets))}</small>` : ''}</div></li>`;
    }).join('')}</ul>
    ${S.active ? '' : `<div class="sticky"><button class="btn primary big" data-act="start" data-id="${w.id}">Iniciar ${esc(w.name)}</button></div>`}
  </main>`;
}

function viewActive() {
  const a = S.active;
  const done = a.exercises.filter((e) => e.doneAt).length;
  const pct = Math.round((done / a.exercises.length) * 100);
  const items = a.exercises.map((e, idx) => {
    const isCur = a.currentExId === e.exId;
    const open = ui.open === e.exId;
    const l = lastFor(e.exId);
    const time = e.doneAt
      ? `<span class="t done">${fmtDur(e.doneAt - e.startedAt)}</span>`
      : isCur && e.startedAt ? `<span class="t live" data-timer="${e.startedAt}"></span>` : '';
    return `<li class="ex ${e.doneAt ? 'is-done' : ''} ${isCur ? 'is-cur' : ''} ${open ? 'is-open' : ''}">
      <div class="exrow">
        <button class="check" data-act="complete" data-id="${e.exId}" aria-label="Concluir exercício">${e.doneAt ? '✓' : ''}</button>
        <button class="exhead" data-act="open" data-id="${e.exId}">
          ${thumb(e.machineId)}
          <div class="exinfo"><b>${idx + 1}. ${esc(e.name)}</b><small>${e.sets.length} × ${esc(e.reps)} ${time}</small></div>
          <span class="chev">${open ? '▾' : '›'}</span>
        </button>
      </div>
      ${open ? `<div class="exbody">
        ${imgUrl(e.machineId) ? `<img class="hero" src="${esc(imgUrl(e.machineId))}" alt="${esc(machine(e.machineId).name)}"><p class="cap">${esc(machine(e.machineId).name)} · Cimerian</p>` : ''}
        ${l ? `<p class="last">Última vez (${fmtDate(l.session.startedAt)}): ${esc(setsText(l.ex.sets))}</p>` : ''}
        <div class="sets">
          <div class="sethead"><span>Série</span><span>Peso (kg)</span><span>Reps</span><span></span></div>
          ${e.sets.map((s, i) => `<div class="set ${s.done ? 'ok' : ''}">
            <span class="n">${i + 1}</span>
            <input inputmode="decimal" data-field="w" data-id="${e.exId}" data-i="${i}" value="${esc(s.w)}" placeholder="kg">
            <input inputmode="numeric" data-field="r" data-id="${e.exId}" data-i="${i}" value="${esc(s.r)}" placeholder="${esc(String(e.reps).split(/[–-]/)[0])}">
            <button class="setchk" data-act="set" data-id="${e.exId}" data-i="${i}">${s.done ? '✓' : ''}</button>
          </div>`).join('')}
        </div>
        <div class="row">
          <button class="btn ghost sm" data-act="addset" data-id="${e.exId}">+ Série</button>
          ${!isCur && !e.doneAt ? `<button class="btn ghost sm" data-act="current" data-id="${e.exId}">Fazer agora</button>` : ''}
          <button class="btn sm ${e.doneAt ? 'ghost' : 'primary'}" data-act="complete" data-id="${e.exId}">${e.doneAt ? 'Desmarcar' : 'Concluir exercício'}</button>
        </div>
      </div>` : ''}
    </li>`;
  }).join('');
  const rest = a.lastSetAt && a.currentExId ? `<div class="rest">Descanso <b data-timer="${a.lastSetAt}"></b></div>` : '';
  return `<main class="page active">
    <header class="bar"><button class="back" data-act="home">‹ Início</button><button class="link danger" data-act="cancel">Descartar</button></header>
    <div class="clock">
      <div><small>${esc(a.workoutName)}${a.source === 'watch' ? ' · ⌚ Apple Watch' : ''}</small><div class="big" data-timer="${a.startedAt}"></div></div>
      <div class="prog"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" class="trk"/><circle cx="18" cy="18" r="15.9" class="val" stroke-dasharray="${pct} 100"/></svg><span>${done}/${a.exercises.length}</span></div>
    </div>
    ${rest}
    <ul class="exlist">${items}</ul>
    <div class="sticky"><button class="btn primary big" data-act="finish">Finalizar treino</button></div>
  </main>`;
}

function viewHistory() {
  if (!S.sessions.length) return `<main class="page"><header class="top"><h1>Histórico</h1></header><p class="empty">Nenhum treino registrado ainda.</p></main>`;
  const rows = S.sessions.map((s) => {
    const dur = (s.endedAt || s.startedAt) - s.startedAt;
    const done = s.exercises.filter((e) => e.doneAt).length;
    return `<li><button data-act="session" data-id="${s.id}">
      <div class="letter sm">${esc(s.workoutId)}</div>
      <div><b>${esc(s.workoutName)}</b><small>${fmtDate(s.startedAt)} · ${fmtTime(s.startedAt)}${s.source === 'watch' ? ' · ⌚' : ''}</small></div>
      <div class="r"><b>${fmtDur(dur, true)}</b><small>${done}/${s.exercises.length} exerc.</small></div>
    </button></li>`;
  }).join('');
  return `<main class="page"><header class="top"><h1>Histórico</h1></header><ul class="hist">${rows}</ul></main>`;
}

function viewSession(id) {
  const s = S.sessions.find((x) => x.id === id);
  if (!s) { ui.view = null; return viewHistory(); }
  const dur = s.endedAt - s.startedAt;
  const volume = s.exercises.reduce((acc, e) => acc + e.sets.filter((x) => x.done).reduce((a2, x) => a2 + (parseFloat(String(x.w).replace(',', '.')) || 0) * (parseInt(x.r) || 0), 0), 0);
  const maxD = Math.max(1, ...s.exercises.map((e) => e.durationMs || 0));
  return `<main class="page">
    <header class="bar"><button class="back" data-act="back">‹ ${ui.view.fresh ? 'Início' : 'Histórico'}</button><button class="link danger" data-act="delsession" data-id="${s.id}">Apagar</button></header>
    ${ui.view.fresh ? '<p class="congrats">Treino salvo! 🎉</p>' : ''}
    <h1>${esc(s.workoutName)}</h1>
    <p class="muted">${fmtDate(s.startedAt)} · ${fmtTime(s.startedAt)}–${fmtTime(s.endedAt)}${s.source === 'watch' ? ' · iniciado pelo Apple Watch' : ''}</p>
    <div class="stats">
      <div><small>Duração</small><b>${fmtDur(dur, true)}</b></div>
      <div><small>Exercícios</small><b>${s.exercises.filter((e) => e.doneAt).length}/${s.exercises.length}</b></div>
      <div><small>Volume</small><b>${Math.round(volume).toLocaleString('pt-BR')} kg</b></div>
    </div>
    <ul class="sdetail">${s.exercises.map((e) => `<li>
      ${thumb(e.machineId)}
      <div class="grow"><b>${esc(e.name)}</b>
        <small>${esc(setsText(e.sets)) || 'sem séries registradas'}</small>
        <div class="bar2"><i style="width:${((e.durationMs || 0) / maxD) * 100}%"></i></div></div>
      <span class="t">${e.durationMs ? fmtDur(e.durationMs) : '–'}</span>
    </li>`).join('')}</ul>
  </main>`;
}

function viewEdit(id) {
  const w = workout(id);
  return `<main class="page">
    <header class="bar"><button class="back" data-act="back">‹ Pronto</button><button class="link danger" data-act="resetw" data-id="${w.id}">Restaurar padrão</button></header>
    <h1>Editar ${esc(w.name)}</h1>
    <label class="fld">Nome do grupo<input data-wfield="subtitle" data-wid="${w.id}" value="${esc(w.subtitle)}"></label>
    <ul class="elist">${w.exercises.map((e, i) => `<li>
      <button class="tbtn" data-act="pick" data-wid="${w.id}" data-i="${i}">${thumb(e.machineId)}<small>trocar foto</small></button>
      <div class="grow">
        <input class="name" data-efield="name" data-wid="${w.id}" data-i="${i}" value="${esc(e.name)}">
        <div class="row tight">
          <label>Séries<input inputmode="numeric" data-efield="sets" data-wid="${w.id}" data-i="${i}" value="${esc(e.sets)}"></label>
          <label>Reps<input data-efield="reps" data-wid="${w.id}" data-i="${i}" value="${esc(e.reps)}"></label>
        </div>
      </div>
      <div class="ord">
        <button data-act="up" data-wid="${w.id}" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button data-act="down" data-wid="${w.id}" data-i="${i}" ${i === w.exercises.length - 1 ? 'disabled' : ''}>↓</button>
        <button data-act="rm" data-wid="${w.id}" data-i="${i}">✕</button>
      </div>
    </li>`).join('')}</ul>
    <button class="btn ghost big" data-act="addex" data-wid="${w.id}">+ Adicionar exercício</button>
  </main>`;
}

function viewPicker(v) {
  const e = workout(v.wid).exercises[v.i];
  return `<main class="page">
    <header class="bar"><button class="back" data-act="backedit">‹ Voltar</button></header>
    <h1>Máquina para “${esc(e.name)}”</h1>
    <input class="search" placeholder="Buscar no catálogo Cimerian…" data-act-input="filter">
    <div class="grid">
      <button class="gitem ${e.machineId == null ? 'sel' : ''}" data-act="choose" data-mid="" data-name="sem máquina halteres livre"><div class="thumb ph">${DUMBBELL}</div><span>Sem máquina (halteres / livre)</span></button>
      ${CATALOG.map((m) => `<button class="gitem ${e.machineId === m.id ? 'sel' : ''}" data-act="choose" data-mid="${m.id}" data-name="${esc(m.name.toLowerCase())}">${thumb(m.id)}<span>${esc(m.name)}</span></button>`).join('')}
    </div>
  </main>`;
}

function viewSettings() {
  const st = ui.sync;
  const cfg = Sync.config();
  const base = location.origin + location.pathname;
  const status = {
    off: 'Desligada — dados ficam só neste aparelho.',
    'logged-out': 'Configurada, mas sem login.',
    syncing: 'Sincronizando…',
    ok: `Sincronizado ${st.at ? 'às ' + fmtTime(st.at) : ''} ${st.email ? '· ' + esc(st.email) : ''}`,
    error: 'Erro: ' + esc(st.message || ''),
  }[st.state] || '';
  return `<main class="page">
    <header class="top"><h1>Ajustes</h1></header>

    <section class="card">
      <h2>⌚ Apple Watch</h2>
      <p>O app abre e começa a contar sozinho quando você inicia um <b>Treino de Força Tradicional</b> no relógio, usando uma automação do app Atalhos do iPhone:</p>
      <ol class="steps">
        <li>Atalhos → <b>Automação</b> → <b>+</b> → <b>Treino do Apple Watch</b>.</li>
        <li>Marque <b>Inicia</b>, tipo <b>Força Tradicional</b>, e <b>Executar Imediatamente</b>.</li>
        <li>Ação <b>Abrir URLs</b> com:<br><code class="copy" data-act="copy" data-text="${esc(base)}?watch=start">${esc(base)}?watch=start</code></li>
        <li>(Opcional) Outra automação com <b>Termina</b> → <code class="copy" data-act="copy" data-text="${esc(base)}?watch=end">${esc(base)}?watch=end</code></li>
      </ol>
      <p class="muted small">Para iniciar direto um treino específico use <code>?watch=start&amp;w=A</code>. Sem isso o app pergunta qual treino (sugerindo o próximo da sequência). O link abre no Safari: se você usa o app pela tela inicial, ligue a sincronização abaixo para os dois ficarem iguais.</p>
    </section>

    <section class="card">
      <h2>☁️ Sincronização (Supabase)</h2>
      <p class="muted small">${status}</p>
      ${st.state === 'ok' || st.state === 'syncing' ? `<div class="row"><button class="btn ghost sm" data-act="syncnow">Sincronizar agora</button><button class="btn ghost sm danger" data-act="syncoff">Desconectar</button></div>` : `
      <form id="syncform" class="form">
        <label class="fld">Project URL<input name="url" placeholder="https://xxxx.supabase.co" value="${esc(cfg?.url || '')}" required></label>
        <label class="fld">Anon / publishable key<input name="key" value="${esc(cfg?.key || '')}" required></label>
        <label class="fld">E-mail<input name="email" type="email" autocomplete="username" required></label>
        <label class="fld">Senha<input name="password" type="password" autocomplete="current-password" required minlength="6"></label>
        <div class="row"><button class="btn primary sm" name="go" value="in">Entrar</button><button class="btn ghost sm" name="go" value="up">Criar conta</button></div>
      </form>
      <p class="muted small">Rode antes o arquivo <code>supabase/schema.sql</code> do repositório no SQL Editor do seu projeto.</p>`}
    </section>

    <section class="card">
      <h2>💾 Backup</h2>
      <div class="row"><button class="btn ghost sm" data-act="export">Exportar JSON</button>
      <label class="btn ghost sm">Importar JSON<input type="file" accept="application/json" id="importfile" hidden></label></div>
      <p class="muted small">${S.sessions.length} treinos salvos neste aparelho.</p>
    </section>
    <p class="muted small center">Fotos das máquinas: catálogo Cimerian.</p>
  </main>`;
}

function watchModal() {
  const p = ui.watchPrompt;
  const next = suggestedNext();
  return `<div class="modal"><div class="sheet">
    <h2>⌚ Treino iniciado no relógio</h2>
    <p class="muted">Às ${fmtTime(p.at)}. Qual treino você vai fazer?</p>
    ${S.workouts.map((w) => `<button class="btn ${w.id === next ? 'primary' : 'ghost'} big" data-act="watchpick" data-id="${w.id}">${esc(w.name)} · ${esc(w.subtitle)}${w.id === next ? ' (próximo)' : ''}</button>`).join('')}
    <button class="link" data-act="watchcancel">Agora não</button>
  </div></div>`;
}

// ---------- relógios ----------
function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-timer]').forEach((el) => { el.textContent = fmtDur(now - Number(el.dataset.timer)); });
}
setInterval(tick, 1000);

// ---------- eventos ----------
app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const { act, id } = el.dataset;
  const wid = el.dataset.wid, i = Number(el.dataset.i);
  const w = wid ? workout(wid) : null;
  switch (act) {
    case 'tab': ui.tab = el.dataset.tab; ui.view = null; break;
    case 'preview': ui.view = { type: 'preview', id }; break;
    case 'start':
      if (S.active) return toast('Já existe um treino em andamento.');
      return startWorkout(id);
    case 'resume': ui.view = { type: 'active' }; keepAwake(); break;
    case 'home': case 'back': ui.view = ui.view?.type === 'edit' ? { type: 'preview', id: ui.view.id } : null; break;
    case 'edit': ui.view = { type: 'edit', id }; break;
    case 'open': ui.open = ui.open === id ? null : id; break;
    case 'current': makeCurrent(id); save(); break;
    case 'set': return toggleSet(id, i);
    case 'addset': { const ex = actEx(id); const l = ex.sets.at(-1); ex.sets.push({ w: l?.w ?? '', r: l?.r ?? '', done: false, at: null }); if (ex.doneAt) ex.doneAt = null; save(); break; }
    case 'complete': return completeExercise(id);
    case 'finish': return finishWorkout();
    case 'cancel': return cancelWorkout();
    case 'session': ui.view = { type: 'session', id }; break;
    case 'delsession':
      if (!confirm('Apagar este treino do histórico?')) return;
      S.sessions = S.sessions.filter((s) => s.id !== id); S.deleted.push(id); save(); ui.view = null; ui.tab = 'history'; break;
    case 'resetw':
      if (!confirm('Voltar este treino para a lista original?')) return;
      w.exercises = structuredClone(DEFAULT_WORKOUTS.find((d) => d.id === wid)?.exercises || w.exercises); touchW(); break;
    case 'up': case 'down': { const j = act === 'up' ? i - 1 : i + 1; [w.exercises[i], w.exercises[j]] = [w.exercises[j], w.exercises[i]]; touchW(); break; }
    case 'rm': if (!confirm(`Remover “${w.exercises[i].name}”?`)) return; w.exercises.splice(i, 1); touchW(); break;
    case 'addex': w.exercises.push({ id: uid(), name: 'Novo exercício', sets: 3, reps: '10–12', machineId: null }); touchW(); break;
    case 'pick': ui.view = { type: 'picker', wid, i, from: ui.view.id }; break;
    case 'backedit': ui.view = { type: 'edit', id: ui.view.wid }; break;
    case 'choose': { const v = ui.view; workout(v.wid).exercises[v.i].machineId = el.dataset.mid ? Number(el.dataset.mid) : null; touchW(); ui.view = { type: 'edit', id: v.wid }; break; }
    case 'copy': navigator.clipboard?.writeText(el.dataset.text).then(() => toast('Link copiado'), () => {}); return;
    case 'syncnow': Sync.syncNow(); return;
    case 'syncoff': Sync.disconnect(); return;
    case 'export': return exportJSON();
    case 'watchpick': { const at = ui.watchPrompt.at; ui.watchPrompt = null; return startWorkout(id, { source: 'watch', at }); }
    case 'watchcancel': ui.watchPrompt = null; break;
    default: return;
  }
  render();
  if (['preview', 'edit', 'session', 'tab', 'pick', 'resume'].includes(act)) scrollTo(0, 0);
});

function touchW() { S.workoutsUpdatedAt = Date.now(); save(); }

app.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.field && S.active) {
    actEx(el.dataset.id).sets[Number(el.dataset.i)][el.dataset.field] = el.value.replace(',', '.');
    save();
  } else if (el.dataset.efield) {
    const e = workout(el.dataset.wid).exercises[Number(el.dataset.i)];
    e[el.dataset.efield] = el.dataset.efield === 'sets' ? Math.max(1, parseInt(el.value) || 1) : el.value;
    touchW();
  } else if (el.dataset.wfield) {
    workout(el.dataset.wid)[el.dataset.wfield] = el.value; touchW();
  } else if (el.dataset.actInput === 'filter') {
    const q = el.value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    app.querySelectorAll('.gitem').forEach((g) => {
      const n = g.dataset.name.normalize('NFD').replace(/\p{Diacritic}/gu, '');
      g.hidden = q && !q.split(/\s+/).every((t) => n.includes(t));
    });
  }
});

app.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'syncform') return;
  ev.preventDefault();
  const fd = new FormData(ev.target);
  try {
    await Sync.connect({ url: fd.get('url'), key: fd.get('key'), email: fd.get('email'), password: fd.get('password'), signup: ev.submitter?.value === 'up' });
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
  a.download = `treino-abc-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- integração Apple Watch (via Atalhos) ----------
function handleUrl() {
  const p = new URLSearchParams(location.search);
  const w = p.get('watch');
  if (!w) return;
  history.replaceState(null, '', location.pathname);
  const at = Number(p.get('t')) || Date.now();
  if (w === 'start') {
    if (S.active) { ui.view = { type: 'active' }; toast('Treino já em andamento'); return; }
    const wid = (p.get('w') || '').toUpperCase();
    if (workout(wid)) startWorkout(wid, { source: 'watch', at });
    else ui.watchPrompt = { at };
  } else if (w === 'end' && S.active) {
    finishWorkout(true);
  }
}

// ---------- inicialização ----------
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { keepAwake(); Sync.schedule(); tick(); }
});

if (S.active) ui.view = { type: 'active' };
handleUrl();
render();

Sync.init({
  get: () => S,
  apply: (merged) => {
    const before = JSON.stringify(S);
    S = merged;
    localStorage.setItem(KEY, JSON.stringify(S));
    if (JSON.stringify(S) !== before && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      if (S.active && !ui.view) ui.view = { type: 'active' };
      render();
    }
  },
  status: (s) => { ui.sync = s; if (ui.tab === 'settings' && !ui.view) render(); },
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
