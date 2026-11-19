// Cálculos da aba Dados + gráficos SVG simples.
import { MUSCLES } from './data.js';

const DAY = 86400000;
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const int = (v) => parseInt(v, 10) || 0;

export function repRange(reps) {
  const m = String(reps || '').match(/(\d+)\s*[–\-a]\s*(\d+)/);
  if (m) return [int(m[1]), int(m[2])];
  const one = int(reps);
  return one ? [one, one] : [8, 12];
}

export const e1rm = (w, r) => (w > 0 && r > 0 ? w * (1 + Math.min(r, 15) / 30) : 0);
const fmtKg = (v) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');

// Histórico de um exercício, do mais antigo para o mais novo.
export function exerciseHistory(sessions, exId) {
  const out = [];
  for (const s of sessions) {
    const e = s.exercises.find((x) => x.exId === exId);
    if (!e) continue;
    const sets = e.sets.filter((x) => x.done).map((x) => ({ w: num(x.w), r: int(x.r) }));
    if (!sets.length) continue;
    const top = sets.reduce((a, b) => (b.w > a.w || (b.w === a.w && b.r > a.r) ? b : a));
    out.push({
      at: s.startedAt,
      sets,
      top,
      e1rm: Math.max(...sets.map((x) => e1rm(x.w, x.r))),
      volume: sets.reduce((a, x) => a + x.w * x.r, 0),
      durationMs: e.durationMs ?? (e.doneAt && e.startedAt ? e.doneAt - e.startedAt : null),
      reps: e.reps,
    });
  }
  return out.reverse();
}

// Recomendação de progressão de carga com base na última sessão.
export function nextStep(hist, reps) {
  const last = hist.at(-1);
  if (!last) return null;
  const [lo, hi] = repRange(reps);
  const sets = last.sets;
  const allTop = sets.every((x) => x.r >= hi);
  const anyLow = sets.some((x) => x.r < lo);
  const inc = last.top.w >= 60 ? 5 : 2.5;
  if (allTop) return { kind: 'up', level: 'good', title: `Suba a carga: tente ${fmtKg(last.top.w + inc)} kg`, text: `Na última vez você fez ${hi}+ reps em todas as séries. Hora de progredir.` };
  if (anyLow) return { kind: 'hold', level: 'warn', title: 'Carga pesada para a faixa', text: `Alguma série ficou abaixo de ${lo} reps. Mantenha a carga até completar ${lo}–${hi} em todas, ou reduza um pouco.` };
  return { kind: 'reps', level: 'info', title: 'Mantenha a carga e busque +1 rep', text: `Você está dentro de ${lo}–${hi}. Quando bater ${hi} em todas as séries, suba a carga.` };
}

export function insights(hist, def) {
  const out = [];
  const step = nextStep(hist, def.reps);
  if (step) out.push(step);
  if (hist.length >= 2) {
    const first = hist[0], last = hist.at(-1);
    const pct = first.e1rm ? ((last.e1rm - first.e1rm) / first.e1rm) * 100 : 0;
    const weeks = Math.max(1, (last.at - first.at) / (7 * DAY));
    // estagnação: sessões desde o melhor 1RM estimado
    let best = 0, bestIdx = 0;
    hist.forEach((h, i) => { if (h.e1rm > best + 0.01) { best = h.e1rm; bestIdx = i; } });
    const since = hist.length - 1 - bestIdx;
    if (since >= 3) out.push({ level: 'warn', title: `Estagnado há ${since} sessões`, text: 'Sem recorde de força nas últimas sessões. Considere um deload leve (−10%) ou trocar por um substituto por 3–4 semanas.' });
    else if (pct > 0.5) out.push({ level: 'good', title: `Força +${pct.toFixed(1).replace('.', ',')}%`, text: `1RM estimado subiu de ${fmtKg(first.e1rm)} para ${fmtKg(last.e1rm)} kg em ${Math.round(weeks)} semana(s).` });
    else if (pct < -3) out.push({ level: 'warn', title: `Força ${pct.toFixed(1).replace('.', ',')}%`, text: 'O 1RM estimado caiu. Confira sono, alimentação e descanso entre séries.' });
  }
  const timed = hist.filter((h) => h.durationMs > 0).slice(-5);
  if (timed.length) {
    const perSet = timed.reduce((a, h) => a + h.durationMs / h.sets.length, 0) / timed.length;
    const m = perSet / 60000;
    const t = fmtMin(perSet);
    if (m > 4) out.push({ level: 'warn', title: `Tempo alto: ${t} por série`, text: 'Inclui execução e descanso. Acima de 4 min por série costuma ser descanso demais ou espera por máquina.' });
    else if (m < 1.3) out.push({ level: 'warn', title: `Tempo curto: ${t} por série`, text: 'Descanso curto pode limitar a carga. Em exercícios compostos, 1:30–3:00 entre séries rende mais.' });
    else out.push({ level: 'good', title: `Ritmo bom: ${t} por série`, text: 'Execução + descanso dentro da faixa de 1:30–4:00.' });
  }
  return out;
}

export function fmtMin(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Séries por grupo muscular em uma janela de tempo.
export function muscleSets(sessions, defs, from, to) {
  const tot = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
  for (const s of sessions) {
    if (s.startedAt < from || s.startedAt >= to) continue;
    for (const e of s.exercises) {
      const n = e.sets.filter((x) => x.done).length;
      if (!n) continue;
      const mu = e.muscles || defs.get(e.baseId || e.exId)?.muscles;
      if (!mu) continue;
      mu.p.forEach((m) => { if (m in tot) tot[m] += n; });
      mu.s.forEach((m) => { if (m in tot) tot[m] += n / 2; });
    }
  }
  return tot;
}

export function groupInsights(avg) {
  const out = [];
  const low = MUSCLES.filter((m) => avg[m] < 8);
  const high = MUSCLES.filter((m) => avg[m] > 22);
  if (low.length) out.push({ level: 'warn', title: `Pouco volume: ${low.join(', ')}`, text: 'Menos de ~8–10 séries por semana tende a render menos hipertrofia. Considere uma série a mais ou mais frequência.' });
  if (high.length) out.push({ level: 'info', title: `Volume alto: ${high.join(', ')}`, text: 'Acima de ~20 séries semanais a recuperação fica mais difícil. Vale só se você estiver progredindo.' });
  const push = avg['Peito'] + avg['Ombros'] * 0.5;
  const pull = avg['Costas'];
  if (push > 0 && pull > 0) {
    const r = pull / push;
    if (r < 0.8) out.push({ level: 'warn', title: 'Mais empurrar que puxar', text: 'Costas está com menos séries que peito e ombro. Equilibrar ajuda na postura e na saúde do ombro.' });
    else out.push({ level: 'good', title: 'Puxar e empurrar equilibrados', text: `Costas ${fmtKg(pull)} vs peito/ombro ${fmtKg(push)} séries por semana.` });
  }
  const q = avg['Quadríceps'], h = avg['Posteriores'] + avg['Glúteos'] * 0.5;
  if (q > 0 && h / q < 0.6) out.push({ level: 'warn', title: 'Posterior de coxa atrás do quadríceps', text: 'Só a flexora trabalha os posteriores. Um stiff, mesa flexora ou elevação pélvica equilibraria a perna.' });
  if (!out.length) out.push({ level: 'good', title: 'Volume bem distribuído', text: 'Todos os grupos entre ~8 e 22 séries por semana.' });
  return out;
}

// ---------- gráficos ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dShort = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function niceTicks(min, max, n = 3) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= step0);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const t = [];
  for (let v = lo; v <= hi + 1e-9; v += step) t.push(Math.round(v * 100) / 100);
  return t;
}

// Linha com pontos. points: [{x: timestamp, y, tip}]
export function lineChart(points, { unit = 'kg', h = 180 } = {}) {
  if (!points.length) return '';
  const W = 340, H = h, L = 36, R = 12, T = 12, B = 24;
  const ys = points.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const y0 = ticks[0], y1 = ticks.at(-1);
  const xs = points.map((p) => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (x) => (x1 === x0 ? (L + W - R) / 2 : L + ((x - x0) / (x1 - x0)) * (W - L - R));
  const Y = (y) => T + (1 - (y - y0) / (y1 - y0 || 1)) * (H - T - B);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const last = points.at(-1);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico">
    ${ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${fmtKg(t)}</text>`).join('')}
    <text class="ax" x="${L}" y="${H - 6}">${dShort(x0)}</text>
    ${x1 !== x0 ? `<text class="ax" x="${W - R}" y="${H - 6}" text-anchor="end">${dShort(x1)}</text>` : ''}
    <path class="ln" d="${path}"/>
    ${points.map((p) => `<circle class="pt" cx="${X(p.x)}" cy="${Y(p.y)}" r="4"/><circle class="hit" cx="${X(p.x)}" cy="${Y(p.y)}" r="16" data-tip="${esc(p.tip ?? `${dShort(p.x)}: ${fmtKg(p.y)} ${unit}`)}"/>`).join('')}
    <text class="lbl" x="${Math.min(X(last.x), W - R - 2)}" y="${Y(last.y) - 10}" text-anchor="${points.length > 1 ? 'end' : 'middle'}">${fmtKg(last.y)} ${unit}</text>
  </svg>`;
}

// Barras verticais. points: [{x, y, tip}]
export function barChart(points, { unit = '', h = 150, fmt = fmtKg } = {}) {
  if (!points.length) return '';
  const W = 340, H = h, L = 36, R = 8, T = 10, B = 24;
  const max = Math.max(...points.map((p) => p.y), 0.0001);
  const ticks = niceTicks(0, max);
  const top = ticks.at(-1);
  const n = points.length;
  const slot = (W - L - R) / n;
  const bw = Math.max(4, Math.min(28, slot - 4));
  const Y = (y) => T + (1 - y / top) * (H - T - B);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de barras">
    ${ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('')}
    ${points.map((p, i) => {
      const x = L + i * slot + (slot - bw) / 2, y = Y(p.y), hh = H - B - y;
      const r = Math.min(4, bw / 2, hh);
      const d = hh > 0 ? `M${x},${H - B}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${H - B}Z` : '';
      return `<path class="bar" d="${d}"/><rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${H - T - B}" data-tip="${esc(p.tip ?? `${dShort(p.x)}: ${fmt(p.y)} ${unit}`)}"/>`;
    }).join('')}
    <text class="ax" x="${L}" y="${H - 6}">${dShort(points[0].x)}</text>
    ${n > 1 ? `<text class="ax" x="${W - R}" y="${H - 6}" text-anchor="end">${dShort(points.at(-1).x)}</text>` : ''}
  </svg>`;
}

export function sparkline(vals) {
  if (vals.length < 2) return '<svg class="spark" viewBox="0 0 64 24"></svg>';
  const min = Math.min(...vals), max = Math.max(...vals);
  const X = (i) => 2 + (i / (vals.length - 1)) * 60;
  const Y = (v) => 21 - ((v - min) / (max - min || 1)) * 18;
  return `<svg class="spark" viewBox="0 0 64 24"><path d="${vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')}"/><circle cx="${X(vals.length - 1)}" cy="${Y(vals.at(-1))}" r="2.5"/></svg>`;
}
