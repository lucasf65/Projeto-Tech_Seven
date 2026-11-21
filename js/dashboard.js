'use strict';
/* =========================================================
   DASHBOARD EM TEMPO REAL — Área da Carol
   Depende de: firebase-config.js (db, auth), app-core.js
   (money, keyDate, br, toast). Os gráficos são desenhados em SVG, sem biblioteca externa.
   ========================================================= */

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Cores (mesma família do styles.css) */
const C = { ink:'#282828', ink2:'#3d3d3d', gold:'#b08a4a', violet:'#8b7fa3', wine:'#7a3d40' };

/* Status exibidos no gráfico de rosca (ordem = ordem da legenda) */
const STATUS_META = [
  { k:'pendente',          label:'Pendentes',            color:'#b08a4a' },
  { k:'aguardando-sinal',  label:'Aguardando sinal',     color:'#c9763a' },
  { k:'confirmado',        label:'Confirmados',          color:'#46654d' },
  { k:'concluido',         label:'Concluídos',           color:'#42597a' },
  { k:'reagendado',        label:'Reagendados',          color:'#8b7fa3' },
  { k:'recusado',          label:'Recusados',            color:'#b56a6d' },
  { k:'cancelado-carol',   label:'Cancelados (Carol)',   color:'#7a3d40' },
  { k:'cancelado-cliente', label:'Cancelados (cliente)', color:'#a8a29a' }
];

/* Indicadores do topo (ícones SVG de traço — ver ICON) */
const KPIS = [
  { id:'revenue',     label:'Faturamento do mês',      icon:'money', fmt:'money', wide:true },
  { id:'done',        label:'Atendimentos realizados', icon:'done' },
  { id:'pend',        label:'Pendentes',               icon:'clock' },
  { id:'wait',        label:'Aguardando sinal',        icon:'card' },
  { id:'today',       label:'Confirmados hoje',        icon:'today' },
  { id:'resched',     label:'Reagendamentos',          icon:'swap' },
  { id:'cancelCarol', label:'Cancelamentos (Carol)',   icon:'ban' }
];

/* Ícones de traço 24×24 (estilo Lucide) */
const ICON = {
  money: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  done:  '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  card:  '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20M6 15h4"/>',
  today: '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M9 16l2 2 4-4"/>',
  swap:  '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  ban:   '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  up:    '<path d="M7 17 17 7M7 7h10v10"/>',
  down:  '<path d="m7 7 10 10M17 7v10H7"/>',
  flat:  '<path d="M5 12h14"/>',
  chart: '<path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/>'
};
const svg = (name, size = 18, w = 1.75) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;


const $ = id => document.getElementById(id);
let all = [];                                   // todos os agendamentos (atualizado em tempo real)
let view = { y: new Date().getFullYear(), m: new Date().getMonth() };
let charts = {}, svcRev = [], unsub = null, ready = false;

/* ===== Datas ===== */
const ymKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
function shift(v, delta) { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; }

/* =========================================================
   AGREGAÇÃO (função pura — recebe a lista e devolve os números)
   Regras:
   - Faturamento = soma do preço dos agendamentos "concluido"
   - Mês = mês da data do atendimento (campo "data")
   - "Confirmados hoje" ignora o mês selecionado
   - Cancelado pela Carol = status "cancelado" + canceladoPor "carol"
   - Cancelado com reagendamentos > 0 conta como "reagendado"
   ========================================================= */
function aggregate(list, y, m, today) {
  const ym = ymKey(y, m), dim = new Date(y, m + 1, 0).getDate();
  const A = {
    dim, total: 0, revenue: 0, done: 0, pend: 0, wait: 0, today: 0, resched: 0, cancelCarol: 0,
    daily: Array(dim).fill(0),
    weeks: { resched: [0,0,0,0,0], cancel: [0,0,0,0,0] },
    status: Object.fromEntries(STATUS_META.map(s => [s.k, 0])),
    services: {}, monthly: {}
  };
  for (const a of list) {
    if (!a.data) continue;
    const key = a.data.slice(0, 7), price = +a.preco || 0;

    if (a.status === 'concluido') {                       // série histórica (todos os meses)
      const mm = A.monthly[key] || (A.monthly[key] = { rev: 0, n: 0 });
      mm.rev += price; mm.n++;
    }
    if (a.status === 'confirmado' && a.data === today) A.today++;
    if (key !== ym) continue;

    A.total++;
    const day = +a.data.slice(8, 10), wk = Math.min(Math.ceil(day / 7), 5) - 1;
    let sk = a.status;
    if (sk === 'cancelado') {
      sk = a.canceladoPor === 'carol' ? 'cancelado-carol'
         : (a.canceladoPor === 'reagendamento' || a.reagendamentos > 0) ? 'reagendado'
         : 'cancelado-cliente';
    }
    if (sk in A.status) A.status[sk]++;

    const rs = +a.reagendamentos || 0;
    if (rs) { A.resched += rs; A.weeks.resched[wk] += rs; }
    if (sk === 'cancelado-carol') { A.cancelCarol++; A.weeks.cancel[wk]++; }
    if (a.status === 'pendente') A.pend++;
    if (a.status === 'aguardando-sinal') A.wait++;
    if (a.status === 'concluido') {
      A.done++; A.revenue += price;
      if (day >= 1 && day <= dim) A.daily[day - 1] += price;
      const s = A.services[a.servico] || (A.services[a.servico] = { n: 0, rev: 0 });
      s.n++; s.rev += price;
    }
  }
  return A;
}

/* =========================================================
   KPIs — números que "sobem e descem" até o novo valor
   ========================================================= */
function buildKpis() {
  $('kpis').innerHTML = KPIS.map((k, i) => `
    <article class="kpi${k.wide ? ' wide' : ''}" style="--i:${i}">
      <div class="kpi-top"><span class="kpi-label">${k.label}</span><span class="kpi-icon">${svg(k.icon, 18)}</span></div>
      <b class="kpi-val" id="k-${k.id}" data-fmt="${k.fmt || 'int'}">0</b>
      <small class="kpi-hint" id="h-${k.id}"></small>
    </article>`).join('');
}


function countTo(el, to) {
  const from = el._cur || 0, money_ = el.dataset.fmt === 'money';
  const show = v => { el._cur = v; el.textContent = money_ ? money(v) : Math.round(v).toLocaleString('pt-BR'); };
  cancelAnimationFrame(el._raf);
  if (REDUCE || from === to) { show(to); return; }
  const t0 = performance.now(), dur = 900;
  const tick = now => {
    const p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);   // easeOutCubic
    show(p < 1 ? from + (to - from) * e : to);
    if (p < 1) el._raf = requestAnimationFrame(tick);
  };
  el._raf = requestAnimationFrame(tick);
}

function setKpi(id, value, hint) { countTo($('k-' + id), value); $('h-' + id).innerHTML = hint || ''; }

function deltaHTML(cur, prev) {
  const note = t => `<span class="delta-note">${t}</span>`;
  if (!prev) return cur ? note('sem mês anterior para comparar') : '';
  const p = (cur - prev) / prev * 100;
  if (Math.abs(p) < 0.5) return `<span class="delta flat">${svg('flat', 12, 2.25)}0%</span>${note('igual ao mês anterior')}`;
  const up = p > 0;
  return `<span class="delta ${up ? 'up' : 'down'}">${svg(up ? 'up' : 'down', 12, 2.25)}${Math.abs(p).toFixed(0)}%</span>${note('vs mês anterior')}`;
}

/* =========================================================
   GRÁFICOS — SVG/HTML próprios, sem biblioteca. Cada gráfico é
   desenhado no tamanho exato da sua caixa (e redesenhado ao
   redimensionar), então nada fica fora do quadro.
   ========================================================= */
const n1 = v => Math.round(v * 10) / 10;
const kfmt = v => 'R$ ' + (v >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : v.toLocaleString('pt-BR'));
const _cx = document.createElement('canvas').getContext('2d');
const tw = (s, size = 11.5) => { _cx.font = `400 ${size}px Poppins,system-ui,sans-serif`; return _cx.measureText(s).width; };

/* Escala de 4 intervalos "redondos": eixo esquerdo e direito ficam com as mesmas linhas de grade */
function niceScale(max, int = false, n = 4) {
  const need = Math.max(max, n) / n, p = Math.pow(10, Math.floor(Math.log10(need)));
  const step = (int ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]).map(f => f * p).find(s => s >= need * 0.9999) || 10 * p;
  return { step, max: step * n };
}

/* ----- Tooltip único para todos os gráficos ----- */
const tip = document.createElement('div');
tip.className = 'ctip';
document.body.appendChild(tip);
function showTip(e, html) {
  tip.innerHTML = html; tip.classList.add('on');
  const r = tip.getBoundingClientRect(), m = 10;
  let x = e.clientX + 14, y = e.clientY - r.height - 12;
  if (x + r.width > innerWidth - m) x = e.clientX - r.width - 14;
  if (y < m) y = e.clientY + 18;
  tip.style.transform = `translate(${Math.max(m, x)}px,${y}px)`;
}
const hideTip = () => tip.classList.remove('on');
window.addEventListener('scroll', hideTip, { passive: true });   // evita tooltip "preso" ao rolar

/* ----- Gráfico = caixa + função que desenha ----- */
function chart(id, paint) {
  const box = $(id), c = { box, hide: new Set(), args: null, key: '', animate: true, tip: null, w: 0, h: 0 };
  c.draw = () => {
    if (!c.args || !box.clientWidth) return;
    c.w = box.clientWidth; c.h = box.clientHeight;
    box.innerHTML = paint(box, c.args, c);
    c.animate = false;
  };
  c.set = a => { const k = JSON.stringify(a); c.animate = k !== c.key; c.key = k; c.args = a; c.draw(); };
  new ResizeObserver(() => { if (box.clientWidth !== c.w || box.clientHeight !== c.h) c.draw(); }).observe(box);
  const on = e => { const h = e.target.closest('[data-i]'); if (h && c.tip) showTip(e, c.tip(+h.dataset.i)); else hideTip(); };
  box.addEventListener('pointermove', on); box.addEventListener('pointerdown', on);
  box.addEventListener('pointerleave', hideTip);
  return c;
}

/* ----- Barras + linha (eixo direito opcional) ----- */
function paintCombo(box, o, c) {
  const W = box.clientWidth, H = box.clientHeight, vis = s => s && !c.hide.has(s.id);
  const bars = o.bars.filter(vis), line = vis(o.line) ? o.line : null;
  const top = ss => Math.max(0, ...ss.flatMap(s => s.data.map(v => v || 0)));
  const sL = niceScale(top(bars), o.intL), sR = line ? niceScale(top([line]), o.intR) : null;
  const ticks = s => [0, 1, 2, 3, 4].map(t => s.step * t);
  const two = o.labels.some(l => l.includes('\n'));
  const padT = 14, padB = two ? 42 : 28;
  const padL = Math.ceil(Math.max(...ticks(sL).map(t => tw(o.fmtL(t))))) + 14;
  const padR = sR ? Math.ceil(Math.max(...ticks(sR).map(t => tw(o.fmtR(t))))) + 14 : 8;
  const pw = W - padL - padR, ph = H - padT - padB, n = o.labels.length, band = pw / n;
  if (pw < 40 || ph < 40) return '';
  const X = i => padL + band * (i + .5), yL = v => padT + ph * (1 - v / sL.max), yR = v => padT + ph * (1 - v / sR.max);
  let g = '';

  for (let t = 0; t <= 4; t++) {                                   // grade + rótulos dos eixos
    const y = n1(padT + ph * (1 - t / 4));
    g += `<line class="gl${t ? '' : ' z'}" x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}"/>`;
    g += `<text class="ax" x="${padL - 10}" y="${y}" dy=".32em" text-anchor="end">${o.fmtL(ticks(sL)[t])}</text>`;
    if (sR) g += `<text class="ax r" x="${W - padR + 10}" y="${y}" dy=".32em">${o.fmtR(ticks(sR)[t])}</text>`;
  }
  o.labels.forEach((l, i) => {                                     // rótulos do eixo X (2 linhas: mês / ano)
    if (o.skip && !o.skip(i)) return;
    const [a, b] = l.split('\n'), x = n1(X(i));
    g += `<text class="ax" x="${x}" y="${n1(padT + ph + 20)}" text-anchor="middle">${esc(a)}${b ? `<tspan class="yr" x="${x}" dy="14">${esc(b)}</tspan>` : ''}</text>`;
  });

  const m = bars.length, gap = 3, y0 = yL(0);                      // barras (só o topo arredondado)
  const bw = Math.max(3, Math.min(o.maxBar, (band * .62 - gap * (m - 1)) / m)), total = m * bw + gap * (m - 1);
  bars.forEach((s, k) => s.data.forEach((v, i) => {
    if (!v) return;
    const x = n1(X(i) - total / 2 + k * (bw + gap)), y = n1(Math.min(yL(v), y0 - 2)), r = Math.min(4, bw / 2, y0 - y);
    g += `<path class="bar" style="--i:${i}" fill="${s.color}" d="M${x} ${n1(y0)}V${n1(y + r)}Q${x} ${y} ${n1(x + r)} ${y}H${n1(x + bw - r)}Q${n1(x + bw)} ${y} ${n1(x + bw)} ${n1(y + r)}V${n1(y0)}Z"/>`;
  }));

  if (line) {                                                      // linha (quebra onde o dado é nulo) + área
    const segs = []; let cur = [];
    line.data.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([X(i), yR(v)]); });
    if (cur.length) segs.push(cur);
    segs.filter(s => s.length > 1).forEach(s => {
      const d = s.map((p, j) => `${j ? 'L' : 'M'}${n1(p[0])} ${n1(p[1])}`).join(''), yb = n1(yR(0));
      if (line.area) g += `<path class="area" fill="url(#ga-${box.id})" d="${d}L${n1(s[s.length - 1][0])} ${yb}L${n1(s[0][0])} ${yb}Z"/>`;
      g += `<path class="ln" pathLength="1" fill="none" stroke="${line.color}" d="${d}"/>`;
    });
  }

  for (let i = 0; i < n; i++) {                                    // colunas de hover (cursor, ponto e tooltip)
    g += `<g class="col" data-i="${i}"><line class="xh" x1="${n1(X(i))}" x2="${n1(X(i))}" y1="${padT}" y2="${padT + ph}"/>`;
    if (line && line.data[i] != null) g += `<circle class="dot${line.dots ? '' : ' hv'}" cx="${n1(X(i))}" cy="${n1(yR(line.data[i]))}" r="4" stroke="${line.color}"/>`;
    g += `<rect class="hit" x="${n1(padL + band * i)}" y="${padT}" width="${n1(band)}" height="${n1(ph)}"/></g>`;
  }

  const items = line ? [...bars, line] : bars;
  c.tip = i => `<div class="tt">${esc(o.title(i))}</div>` + items.filter(s => s.data[i] != null).map(s =>
    `<div class="tr"><i style="background:${s.color}"></i><span>${esc(s.name)}</span><b>${s.fmt(s.data[i])}</b></div>`).join('');
  const defs = line && line.area
    ? `<defs><linearGradient id="ga-${box.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${line.color}" stop-opacity=".22"/><stop offset="1" stop-color="${line.color}" stop-opacity="0"/></linearGradient></defs>` : '';
  return `<svg class="${c.animate ? 'anim' : ''}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${defs}${g}</svg>`;
}

/* ----- Rosca ----- */
function paintDonut(box, o, c) {
  const W = box.clientWidth, H = box.clientHeight, d = Math.min(W, H) - 16;
  if (d < 60) return '';
  const sw = Math.round(d * .13), r = (d - sw) / 2, cx = W / 2, cy = H / 2, L = 2 * Math.PI * r;
  const tot = o.values.reduce((s, v) => s + v, 0), many = o.values.filter(Boolean).length > 1;
  let off = 0, g = '';
  o.values.forEach((v, i) => {
    if (!v) return;
    const len = v / tot * L;
    g += `<circle class="seg" data-i="${i}" style="--i:${i}" cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="none" stroke="${o.colors[i]}" stroke-width="${sw}" stroke-dasharray="${n1(Math.max(len - (many ? 2.5 : 0), .1))} ${n1(L)}" stroke-dashoffset="${n1(-off)}" transform="rotate(-90 ${n1(cx)} ${n1(cy)})"/>`;
    off += len;
  });
  c.tip = i => `<div class="tr"><i style="background:${o.colors[i]}"></i><span>${esc(o.names[i])}</span><b>${o.values[i]} · ${Math.round(o.values[i] / tot * 100)}%</b></div>`;
  return `<svg class="donut${c.animate ? ' anim' : ''}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${g}` +
    `<text class="dn" x="${n1(cx)}" y="${n1(cy - 2)}" text-anchor="middle">${tot}</text>` +
    `<text class="dl" x="${n1(cx)}" y="${n1(cy + 22)}" text-anchor="middle">${tot === 1 ? 'solicitação' : 'solicitações'}</text></svg>`;
}

/* ----- Ranking de serviços (lista com barras; nome longo vira reticências) ----- */
function paintRank(box, o, c) {
  const max = Math.max(1, ...o.items.map(s => s.n)), n = o.items.length;
  const gap = n > 1 ? Math.max(12, Math.min(22, Math.floor((box.clientHeight - n * 30) / (n - 1)))) : 0;
  c.tip = i => { const s = o.items[i]; return `<div class="tt">${esc(s.name)}</div><div class="tr"><span>${s.n} atendimento${s.n === 1 ? '' : 's'}</span><b>${money(s.rev)}</b></div>`; };
  return `<ol class="rank${c.animate ? ' anim' : ''}" style="gap:${gap}px">` + o.items.map((s, i) =>
    `<li data-i="${i}"><div class="rk-row"><span class="rk-name">${esc(s.name)}</span><span class="rk-rev">${money(s.rev)}</span><b class="rk-val">${s.n}</b></div>` +
    `<div class="rk-track"><i class="${i ? '' : 'top'}" style="--i:${i};width:${(s.n / max * 100).toFixed(1)}%"></i></div></li>`).join('') + '</ol>';
}

/* ----- Legenda em HTML (clicável) ----- */
function addLegend(c, items) {
  const el = document.createElement('div');
  el.className = 'chart-legend';
  el.innerHTML = items.map(it => `<button type="button" class="lg" data-id="${it.id}" aria-pressed="true"><i class="sw ${it.type}" style="--c:${it.color}"></i>${it.label}</button>`).join('');
  c.box.parentNode.before(el);
  el.addEventListener('click', e => {
    const b = e.target.closest('.lg'); if (!b) return;
    const off = !c.hide.has(b.dataset.id);
    off ? c.hide.add(b.dataset.id) : c.hide.delete(b.dataset.id);
    b.classList.toggle('off', off); b.setAttribute('aria-pressed', !off);
    c.animate = false; c.draw();
  });
}

/* ----- Estado vazio: o gráfico some e entra uma mensagem ----- */
const EMPTY = {
  cDaily:    'Nenhum atendimento concluído neste mês',
  cStatus:   'Nenhuma solicitação neste mês',
  cTrend:    'Nenhum atendimento concluído no período',
  cServices: 'Nenhum serviço concluído neste mês',
  cOcc:      'Nenhum reagendamento ou cancelamento neste mês'
};
const setEmpty = (id, on) => { $(id).closest('.dash-card').dataset.empty = on ? '1' : ''; };

function setupCharts() {
  charts.daily    = chart('cDaily', paintCombo);
  charts.status   = chart('cStatus', paintDonut);
  charts.trend    = chart('cTrend', paintCombo);
  charts.services = chart('cServices', paintRank);
  charts.occ      = chart('cOcc', paintCombo);

  addLegend(charts.daily, [{ id: 'b', label: 'Faturamento do dia', color: C.ink2, type: 'bar' }, { id: 'l', label: 'Acumulado do mês', color: C.gold, type: 'line' }]);
  addLegend(charts.trend, [{ id: 'b', label: 'Faturamento', color: C.ink2, type: 'bar' }, { id: 'l', label: 'Atendimentos', color: C.gold, type: 'line' }]);
  addLegend(charts.occ,   [{ id: 'r', label: 'Reagendamentos', color: C.violet, type: 'bar' }, { id: 'c', label: 'Cancelamentos (Carol)', color: C.wine, type: 'bar' }]);

  Object.entries(EMPTY).forEach(([id, msg]) => $(id).parentNode.insertAdjacentHTML('beforeend',
    `<div class="empty-state">${svg('chart', 22, 1.5)}<span>${msg}</span></div>`));

  /* as medidas dos rótulos dependem da fonte: redesenha quando ela terminar de carregar */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => Object.values(charts).forEach(c => c.draw()));
}

/* =========================================================
   RENDER — recalcula tudo e redesenha os gráficos
   ========================================================= */
function render() {
  const today = keyDate(new Date());
  const A = aggregate(all, view.y, view.m, today);
  const prevV = shift(view, -1);
  const prev = A.monthly[ymKey(prevV.y, prevV.m)] || { rev: 0, n: 0 };
  const now = new Date(), isCurrent = view.y === now.getFullYear() && view.m === now.getMonth();
  const todayDay = +today.slice(8, 10);
  const plural = (n, s, p) => n === 1 ? s : p;

  $('mLabel').textContent = `${MESES[view.m]} ${view.y}`;

  /* KPIs */
  setKpi('revenue',     A.revenue,     deltaHTML(A.revenue, prev.rev));
  setKpi('done',        A.done,        deltaHTML(A.done, prev.n));
  setKpi('pend',        A.pend,        `de ${A.total} ${plural(A.total, 'solicitação', 'solicitações')} no mês`);
  setKpi('wait',        A.wait,        'pagamento do sinal em aberto');
  setKpi('today',       A.today,       `hoje · ${br(today)}`);
  setKpi('resched',     A.resched,     'no mês selecionado');
  setKpi('cancelCarol', A.cancelCarol, `${A.status.recusado} ${plural(A.status.recusado, 'recusa', 'recusas')} à parte`);

  /* Faturamento por dia + acumulado (a linha para no dia de hoje no mês atual) */
  let run = 0;
  const mes = MESES[view.m].toLowerCase();
  charts.daily.set({
    k: ymKey(view.y, view.m), labels: A.daily.map((_, i) => String(i + 1)),
    bars: [{ id: 'b', name: 'Faturamento do dia', color: C.ink2, fmt: money, data: A.daily }],
    line: { id: 'l', name: 'Acumulado do mês', color: C.gold, area: true, fmt: money,
            data: A.daily.map((v, i) => { run += v; return (isCurrent && i + 1 > todayDay) ? null : run; }) },
    fmtL: kfmt, fmtR: kfmt, maxBar: 16, skip: i => i === 0 || (i + 1) % 5 === 0, title: i => `${i + 1} de ${mes}`
  });
  setEmpty('cDaily', !A.revenue);

  /* Rosca de status + legenda */
  const vals = STATUS_META.map(s => A.status[s.k]);
  charts.status.set({ values: vals, colors: STATUS_META.map(s => s.color), names: STATUS_META.map(s => s.label) });
  setEmpty('cStatus', !vals.some(Boolean));
  $('statusLegend').innerHTML = STATUS_META.map((s, i) =>
    `<li class="${vals[i] ? '' : 'zero'}"><i style="background:${s.color}"></i><span>${s.label}</span><b>${vals[i]}</b></li>`).join('');

  /* Últimos 6 meses */
  const months = [5, 4, 3, 2, 1, 0].map(i => shift(view, -i));
  const series = months.map(x => A.monthly[ymKey(x.y, x.m)] || { rev: 0, n: 0 });
  charts.trend.set({
    labels: months.map((x, i) => MESES_CURTO[x.m] + (i === 0 || x.m === 0 ? `\n${x.y}` : '')),
    bars: [{ id: 'b', name: 'Faturamento', color: C.ink2, fmt: money, data: series.map(s => s.rev) }],
    line: { id: 'l', name: 'Atendimentos', color: C.gold, dots: true, fmt: String, data: series.map(s => s.n) },
    fmtL: kfmt, fmtR: String, intR: true, maxBar: 30, title: i => `${MESES[months[i].m]} de ${months[i].y}`
  });
  setEmpty('cTrend', !series.some(s => s.n));

  /* Serviços mais realizados (top 6) */
  const svc = Object.entries(A.services).sort((a, b) => b[1].n - a[1].n || b[1].rev - a[1].rev).slice(0, 6);
  charts.services.set({ items: svc.map(([name, v]) => ({ name, n: v.n, rev: v.rev })) });
  setEmpty('cServices', !svc.length);

  /* Reagendamentos e cancelamentos por semana */
  const nW = A.dim > 28 ? 5 : 4, weeks = ['1–7', '8–14', '15–21', '22–28', `29–${A.dim}`].slice(0, nW);
  charts.occ.set({
    labels: weeks,
    bars: [{ id: 'r', name: 'Reagendamentos', color: C.violet, fmt: String, data: A.weeks.resched.slice(0, nW) },
           { id: 'c', name: 'Cancelamentos (Carol)', color: C.wine, fmt: String, data: A.weeks.cancel.slice(0, nW) }],
    line: null, fmtL: String, intL: true, maxBar: 18, title: i => `Dias ${weeks[i]}`
  });
  setEmpty('cOcc', !(A.resched + A.cancelCarol));
}

/* =========================================================
   TEMPO REAL (Firestore onSnapshot) + acesso restrito
   ========================================================= */
function setLive(on, text) {
  $('live').classList.toggle('off', !on);
  $('liveText').textContent = text;
}

function startRealtime() {
  if (unsub) return;
  unsub = db.collection('agendamentos').onSnapshot(snap => {
    all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    ready = true;
    $('dash').classList.remove('is-loading');
    render();
    setLive(!snap.metadata.fromCache, snap.metadata.fromCache
      ? 'Sem conexão — exibindo dados salvos'
      : 'Ao vivo · atualizado às ' + new Date().toLocaleTimeString('pt-BR'));
  }, err => {
    console.error(err);
    setLive(false, 'Conexão perdida');
    toast('Não foi possível receber atualizações em tempo real.');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!$('dash')) return;

  buildKpis();
  setupCharts();
  $('mLabel').textContent = `${MESES[view.m]} ${view.y}`;

  const go = d => { view = d === 0 ? { y: new Date().getFullYear(), m: new Date().getMonth() } : shift(view, d); if (ready) render(); };
  $('mPrev').addEventListener('click', () => go(-1));
  $('mNext').addEventListener('click', () => go(1));
  $('mToday').addEventListener('click', () => go(0));

  auth.onAuthStateChanged(async user => {
    if (!user) { location.replace('admin.html'); return; }
    try {
      const adm = await db.collection('admins').doc(user.uid).get();
      if (!adm.exists) { await auth.signOut(); location.replace('admin.html'); return; }
      startRealtime();
    } catch (e) { console.error(e); toast('Erro ao validar o acesso.'); }
  });
});

window.addEventListener('pagehide', () => { if (unsub) unsub(); });
