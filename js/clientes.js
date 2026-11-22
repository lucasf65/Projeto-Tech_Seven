'use strict';
let clientes = [];
let agendamentos = [];
let enriched = [];
let selectedId = null;
const cl = { q: '', filter: 'all', sort: 'recent' };

const $ = (id) => document.getElementById(id);
const todayKey = () => keyDate(new Date());
const daysSince = (k) => Math.floor((new Date(todayKey() + 'T12:00:00') - new Date(k + 'T12:00:00')) / 864e5);
const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();

document.addEventListener('DOMContentLoaded', () => {
  if (!$('clientSearch')) return;

  auth.onAuthStateChanged(async (user) => {
    if (!user) { location.replace('admin.html'); return; }
    try {
      const adm = await db.collection('admins').doc(user.uid).get();
      if (!adm.exists) { await auth.signOut(); location.replace('admin.html'); return; }
      init();
    } catch (e) {
      console.error(e);
      location.replace('admin.html');
    }
  });
});

let started = false;
async function init() {
  if (started) return;
  started = true;

  $('clientSearch').addEventListener('input', (e) => { cl.q = e.target.value; renderList(); });
  $('clientSort').addEventListener('change', (e) => { cl.sort = e.target.value; renderList(); });
  $('clientFilters').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    cl.filter = b.dataset.f;
    document.querySelectorAll('#clientFilters .chip').forEach(c => c.classList.toggle('active', c === b));
    renderList();
  });

  $('clientResults').innerHTML = '<div class="empty">Carregando clientes…</div>';
  renderPlaceholder();
  try {
    const [cs, ag] = await Promise.all([db.collection('clientes').get(), db.collection('agendamentos').get()]);
    // Agrupa cadastros duplicados pelo telefone (cadastros antigos tinham id aleatório; os novos usam o telefone como id)
    const byPhone = new Map();
    cs.docs.forEach(d => {
      const c = { id: d.id, ...d.data() };
      const k = c.telefone || c.id;
      if (byPhone.has(k)) byPhone.get(k)._ids.push(c.id);
      else byPhone.set(k, { ...c, _ids: [c.id] });
    });
    clientes = [...byPhone.values()];
    agendamentos = ag.docs.map(d => ({ id: d.id, ...d.data() }));
    enriched = clientes.map(enrich);
    renderKpis();
    renderList();
  } catch (e) {
    console.error(e);
    $('clientResults').innerHTML = '<div class="empty">Erro ao carregar clientes.</div>';
  }
}

function enrich(c) {
  const hist = agendamentos.filter(a => a.clienteId === c.id || a.telefone === c.telefone);
  const done = hist.filter(a => a.status === 'concluido');
  const spent = done.reduce((s, a) => s + (+a.preco || 0), 0);
  const dates = hist.filter(a => a.data).map(a => a.data).sort();
  const lastDone = done.map(a => a.data).filter(Boolean).sort().pop() || null;
  const isLoyal = hist.some(a => a.status === 'confirmado' || a.status === 'concluido');
  return {
    c, hist, done, spent, isLoyal,
    last: dates.length ? dates[dates.length - 1] : null,
    inactive: !!lastDone && daysSince(lastDone) > 60,
    isNew: !isLoyal
  };
}

function renderKpis() {
  const total = enriched.length;
  const loyal = enriched.filter(e => e.isLoyal).length;
  const revenue = enriched.reduce((s, e) => s + e.spent, 0);
  const visits = enriched.reduce((s, e) => s + e.done.length, 0);
  $('clKpis').innerHTML = `
    <div class="cl-kpi dark"><span>Receita total</span><b>${money(revenue)}</b><small>atendimentos concluídos</small></div>
    <div class="cl-kpi"><span>Clientes</span><b>${total}</b><small>na base</small></div>
    <div class="cl-kpi"><span>Fidelizadas</span><b>${loyal}</b><small>${total ? Math.round(loyal / total * 100) : 0}% da base</small></div>
    <div class="cl-kpi"><span>Ticket médio</span><b>${money(visits ? revenue / visits : 0)}</b><small>por atendimento</small></div>`;
}

function renderList() {
  const q = cl.q.trim().toLowerCase();
  const qd = digits(cl.q);
  const list = enriched.filter(e => {
    const okQ = !q || (e.c.nome || '').toLowerCase().includes(q) || (qd.length >= 3 && (e.c.telefone || '').includes(qd));
    const okF = cl.filter === 'all' || (cl.filter === 'loyal' && e.isLoyal) || (cl.filter === 'new' && e.isNew) || (cl.filter === 'inactive' && e.inactive);
    return okQ && okF;
  });

  const sorters = {
    recent: (a, b) => (b.last || '').localeCompare(a.last || ''),
    spent: (a, b) => b.spent - a.spent,
    visits: (a, b) => b.done.length - a.done.length,
    name: (a, b) => (a.c.nome || '').localeCompare(b.c.nome || '', 'pt-BR')
  };
  list.sort(sorters[cl.sort]);

  $('clientCount').textContent = `${list.length} cliente${list.length === 1 ? '' : 's'}`;
  const box = $('clientResults');
  if (!list.length) { box.innerHTML = '<div class="empty">Nenhuma cliente encontrada.</div>'; return; }

  box.innerHTML = list.map(e => `
    <button type="button" class="client-row${e.c.id === selectedId ? ' active' : ''}" data-id="${esc(e.c.id)}">
      <span class="avatar">${esc(initials(e.c.nome))}</span>
      <span class="client-row-main">
        <strong><em>${esc(e.c.nome || 'Sem nome')}</em>${e.isLoyal ? '<span class="badge loyal">Fidelizada</span>' : ''}${e.inactive ? '<span class="badge inactive">Inativa</span>' : ''}</strong>
        <p>${formatPhoneDisplay(e.c.telefone)} · ${e.last ? 'última visita ' + br(e.last) : 'sem visitas'}</p>
      </span>
      <span class="client-row-stats"><b>${money(e.spent)}</b><span>${e.done.length} concluído${e.done.length === 1 ? '' : 's'}</span></span>
    </button>`).join('');

  box.querySelectorAll('.client-row').forEach(r => r.addEventListener('click', () => selectClient(r.dataset.id)));
}

function selectClient(id) {
  selectedId = id;
  document.querySelectorAll('.client-row').forEach(r => r.classList.toggle('active', r.dataset.id === id));
  renderDetail(enriched.find(e => e.c.id === id));
  document.querySelector('.cl-layout').classList.add('has-detail');
  if (window.matchMedia('(max-width:1000px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderPlaceholder() {
  $('clientDetail').innerHTML = `
    <div class="cl-placeholder">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
      Selecione uma cliente para ver o histórico completo.
    </div>`;
}

function renderDetail(e) {
  if (!e) { renderPlaceholder(); return; }
  const { c, hist, done, spent } = e;
  const sorted = [...hist].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const canceladas = hist.filter(a => a.status === 'cancelado' && a.canceladoPor === 'cliente').length;
  const reag = hist.reduce((s, a) => s + (+a.reagendamentos || 0), 0);
  const first = (c.nome || '').split(' ')[0] || '';
  const wa = waLink(c.telefone, `Olá${first ? ', ' + first : ''}! Tudo bem?`);

  $('clientDetail').innerHTML = `
    <div class="client-detail-head">
      <span class="avatar lg">${esc(initials(c.nome))}</span>
      <div class="who">
        <h2>${esc(c.nome || 'Sem nome')}</h2>
        <p>${formatPhoneDisplay(c.telefone)}${e.last ? ' · última visita ' + br(e.last) : ''}</p>
      </div>
      <div class="cl-head-actions">
        <button type="button" class="cl-del" id="delHistory" aria-label="Apagar histórico" title="Apagar histórico">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        </button>
        <button type="button" class="cl-del" id="delClient" aria-label="Apagar cadastro" title="Apagar cadastro">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
        </button>
        <a class="btn btn-primary" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>
        <button type="button" class="btn btn-ghost cl-back" id="closeDetail">Voltar</button>
      </div>
    </div>

    <div class="client-summary-grid">
      <div><b>${money(spent)}</b><span>Total gasto</span></div>
      <div><b>${done.length}</b><span>Concluídos</span></div>
      <div><b>${money(done.length ? spent / done.length : 0)}</b><span>Ticket médio</span></div>
      <div><b>${hist.length}</b><span>Agendamentos</span></div>
      <div><b>${reag}</b><span>Reagendamentos</span></div>
      <div><b>${canceladas}</b><span>Cancelados por ela</span></div>
    </div>

    <h4 class="cl-sub">Histórico <small>${sorted.length} registro${sorted.length === 1 ? '' : 's'}</small></h4>
    <div class="client-history-list">
      ${sorted.length ? sorted.map(a => `
        <div class="client-history-row ${esc(a.status || '')}">
          <div><strong>${esc(a.servico || '—')}</strong><span>${br(a.data)} às ${esc(a.horario || '—')}</span></div>
          <div><span class="badge ${esc(a.status || '')}">${esc((a.status || '—').replace('-', ' '))}</span><b>${money(a.preco)}</b></div>
        </div>`).join('') : '<div class="empty">Nenhum agendamento registrado.</div>'}
    </div>`;

  $('closeDetail').addEventListener('click', () => {
    selectedId = null;
    document.querySelector('.cl-layout').classList.remove('has-detail');
    renderPlaceholder();
    renderList();
  });

  $('delHistory').addEventListener('click', async () => {
    if (!hist.length) { toast('Essa cliente não tem histórico.'); return; }
    const okH = await confirmDialog({
      title: 'Apagar histórico?',
      text: `Os ${hist.length} agendamento${hist.length === 1 ? '' : 's'} de ${c.nome || 'esta cliente'} serão apagados e deixam de contar no faturamento do dashboard. Não dá para desfazer.`,
      confirmLabel: 'Apagar histórico'
    });
    if (!okH) return;
    try {
      for (let i = 0; i < hist.length; i += 450) {
        const batch = db.batch();
        hist.slice(i, i + 450).forEach(a => batch.delete(db.collection('agendamentos').doc(a.id)));
        await batch.commit();
      }
      const ids = new Set(hist.map(a => a.id));
      agendamentos = agendamentos.filter(a => !ids.has(a.id));
      enriched = clientes.map(enrich);
      renderKpis();
      renderList();
      renderDetail(enriched.find(x => x.c.id === c.id));
      toast('Histórico apagado.');
    } catch (err) {
      console.error(err);
      toast('Erro ao apagar histórico.');
    }
  });

  $('delClient').addEventListener('click', async () => {
    const aviso = hist.length ? `\n\nOs ${hist.length} agendamento${hist.length === 1 ? '' : 's'} dela continuam salvos (apague o histórico antes se quiser removê-los também).` : '';
    const okC = await confirmDialog({
      title: 'Apagar cadastro?',
      text: `O cadastro de ${c.nome || 'esta cliente'} será removido da lista.${aviso}`,
      confirmLabel: 'Apagar cadastro'
    });
    if (!okC) return;
    try {
      for (const cid of (c._ids || [c.id])) await db.collection('clientes').doc(cid).delete();
      clientes = clientes.filter(x => x.id !== c.id);
      enriched = enriched.filter(x => x.c.id !== c.id);
      selectedId = null;
      document.querySelector('.cl-layout').classList.remove('has-detail');
      renderPlaceholder();
      renderKpis();
      renderList();
      toast('Cadastro apagado.');
    } catch (err) {
      console.error(err);
      toast('Erro ao apagar cadastro.');
    }
  });
}

function confirmDialog({ title, text, confirmLabel = 'Apagar' }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const o = document.createElement('div');
    o.className = 'dlg-overlay';
    o.innerHTML = `
      <div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlgT" aria-describedby="dlgD">
        <span class="dlg-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg></span>
        <h3 id="dlgT">${esc(title)}</h3>
        <p id="dlgD">${esc(text)}</p>
        <div class="dlg-actions">
          <button type="button" class="btn btn-ghost" data-r="0">Cancelar</button>
          <button type="button" class="btn btn-danger" data-r="1">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(o);
    requestAnimationFrame(() => o.classList.add('on'));

    const done = (v) => {
      document.removeEventListener('keydown', onKey);
      o.classList.remove('on');
      setTimeout(() => { o.remove(); if (prev && prev.focus) prev.focus(); }, 180);
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', onKey);
    o.addEventListener('click', (e) => {
      if (e.target === o) return done(false);
      const b = e.target.closest('[data-r]');
      if (b) done(b.dataset.r === '1');
    });
    o.querySelector('[data-r="0"]').focus();
  });
}
