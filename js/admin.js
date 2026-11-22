'use strict';
const adminState = { isAdmin: false, adminUid: null };
let selectedEmoji = '💅';

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('serviceModal')) initServiceModal();
  initAdminCalendarModal();

  if (!document.getElementById('adminLogin')) return;

  document.getElementById('adminLoginBtn').addEventListener('click', () => {
    const email = document.getElementById('adminEmail').value.trim();
    const pass = document.getElementById('adminPassword').value;
    if (!email || !pass) return toast('Preencha e-mail e senha.');
    if (!validEmail(email)) return toast('Informe um e-mail válido.');
    adminLogin(email, pass);
  });

  document.getElementById('adminLogout').addEventListener('click', adminLogout);
  document.getElementById('statusFilter').addEventListener('change', renderAdminAppointments);
  document.getElementById('dateFilter').addEventListener('change', renderAdminAppointments);
  document.getElementById('addGal').addEventListener('click', addGaleria);

  auth.onAuthStateChanged(async user => {
    if (user) {
      const d = await db.collection('admins').doc(user.uid).get();
      if (d.exists) {
        adminState.isAdmin = true; adminState.adminUid = user.uid;
        document.getElementById('adminLogin').classList.add('hidden');
        document.getElementById('adminPanel').classList.remove('hidden');
        await renderAllAdmin();
      }
    } else if (adminState.isAdmin) {
      adminState.isAdmin = false;
      document.getElementById('adminPanel').classList.add('hidden');
      document.getElementById('adminLogin').classList.remove('hidden');
    }
  });
});

/* =========================================
   MODAL DE NOVO SERVIÇO
   ========================================= */
function initServiceModal() {
  const overlayEl = document.getElementById('serviceModal');
  const emojiBtn = document.getElementById('emojiBtn');
  const emojiDropdown = document.getElementById('emojiDropdown');
  if (!overlayEl) return;

  const resetForm = () => {
    document.getElementById('newServiceName').value = '';
    document.getElementById('newServiceDesc').value = '';
    document.getElementById('newServiceHours').value = '';
    document.getElementById('newServiceMins').value = '';
    document.getElementById('newServiceFormat').value = 'min';
    document.getElementById('newServicePrice').value = '';
    selectedEmoji = '💅';
    document.getElementById('selectedEmoji').textContent = '💅';
  };

  const serviceModal = createModal({
    overlayEl,
    openBtn: document.getElementById('openServiceModal'),
    closeBtn: overlayEl.querySelector('.close-modal'),
    lockScroll: false,
    onOpen: () => document.getElementById('newServiceName').focus(),
    onClose: resetForm
  });

  emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiDropdown.classList.toggle('hidden');
  });

  document.querySelectorAll('.emoji-option').forEach(el => {
    el.addEventListener('click', () => {
      selectedEmoji = el.textContent;
      document.getElementById('selectedEmoji').textContent = selectedEmoji;
      emojiDropdown.classList.add('hidden');
    });
  });

  document.addEventListener('click', (e) => {
    if (!emojiBtn.contains(e.target) && !emojiDropdown.contains(e.target)) {
      emojiDropdown.classList.add('hidden');
    }
  });

  const formatDuration = () => {
    const hrs = parseInt(document.getElementById('newServiceHours').value) || 0;
    const mins = parseInt(document.getElementById('newServiceMins').value) || 0;
    const format = document.getElementById('newServiceFormat').value;

    if (format === 'h') {
      const totalHoras = hrs + (mins / 60);
      return totalHoras > 0 ? `${totalHoras.toFixed(1).replace('.0', '')}h` : '30 min';
    } else {
      let result = '';
      if (hrs > 0) result += `${hrs}h `;
      if (mins > 0) result += `${mins} min`;
      if (!result) result = '30 min';
      return result.trim();
    }
  };

  document.getElementById('saveNewService').addEventListener('click', async () => {
    const saveBtn = document.getElementById('saveNewService');
    const name = document.getElementById('newServiceName').value.trim().replace(/\s+/g, ' ');
    const desc = document.getElementById('newServiceDesc').value.trim();
    const hrs = parseInt(document.getElementById('newServiceHours').value) || 0;
    const mins = parseInt(document.getElementById('newServiceMins').value) || 0;
    const priceRaw = document.getElementById('newServicePrice').value;
    const price = +priceRaw;

    if (name.length < 2 || name.length > 60) return toast('O nome do serviço deve ter de 2 a 60 caracteres.');
    if (desc.length > 120) return toast('A descrição pode ter até 120 caracteres.');
    if (hrs < 0 || hrs > 12 || mins < 0 || mins > 59) return toast('Duração inválida: horas de 0 a 12 e minutos de 0 a 59.');
    if (hrs === 0 && mins === 0) return toast('Informe a duração do serviço.');
    if (priceRaw === '' || !isFinite(price) || price < 0 || price > 10000) return toast('Informe um preço válido (de R$ 0 a R$ 10.000).');
    const duration = formatDuration();

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Salvando...';

      const snap = await db.collection('servicos').orderBy('id', 'desc').limit(1).get();
      const maxId = snap.empty ? 0 : (snap.docs[0].data().id || 0);
      const newId = maxId + 1;

      await db.collection('servicos').doc(newId.toString()).set({
        id: newId, name, description: desc, duration, price, icon: selectedEmoji
      });

      serviceModal.close();
      renderAllAdmin();
      toast('Serviço criado com sucesso!');
    } catch(e) {
      console.error(e);
      toast('Erro ao criar serviço.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Salvar Serviço';
    }
  });
}

/* =========================================
   MODAL DE AGENDA (PREMIUM)
   ========================================= */
let adminCal = null;

function initAdminCalendarModal() {
  const overlayEl = document.getElementById('agendaModal');
  const hiddenDateInput = document.getElementById('availDate');
  if (!overlayEl || !hiddenDateInput) return;

  hiddenDateInput.value = keyDate(new Date());

  const agendaModal = createModal({
    overlayEl,
    openBtn: document.getElementById('openAgendaModal'),
    closeBtn: document.getElementById('closeAgendaModal'),
    extraCloseBtns: [document.getElementById('doneAgendaModal')],
    lockScroll: true,
    onOpen: () => {
      if (!adminCal) {
        adminCal = createCalendar({
          gridEl: document.getElementById('adminCalendarGrid'),
          monthLabelEl: document.getElementById('adminCalMonth'),
          yearLabelEl: document.getElementById('adminCalYear'),
          prevBtn: document.getElementById('adminPrevMonth'),
          nextBtn: document.getElementById('adminNextMonth'),
          disablePast: false,
          selectedDate: hiddenDateInput.value,
          onSelect: (k) => { hiddenDateInput.value = k; renderAvailability(); }
        });
      } else {
        adminCal.render();
      }
      renderAvailability();
    }
  });

  window.__openAgendaModal = agendaModal.open;
}

async function renderAvailability() {
  const d = document.getElementById('availDate').value || keyDate(new Date());
  const r = document.getElementById('modalAvailability');
  if (!r) return;

  const dateObj = new Date(d + 'T12:00:00');
  const formattedDate = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const elDate = document.getElementById('modalSelectedDate');
  if (elDate) elDate.textContent = formattedDate;

  r.innerHTML = '<div style="font-size:12px; color:var(--muted); grid-column:1/-1; text-align:center; padding: 20px;">Buscando...</div>';

  try {
    const busy = await Promise.all(SLOTS.map(t => isSlotBusy(d, t)));
    const closed = await Promise.all(SLOTS.map(t => isSlotClosed(d, t)));

    r.innerHTML = '';

    SLOTS.forEach((t, i) => {
      const b = document.createElement('button');
      const isOff = busy[i] || closed[i];

      b.className = 'slot' + (isOff ? ' off' : '');
      b.textContent = t;
      b.disabled = busy[i];

      b.addEventListener('click', async (e) => {
        e.preventDefault();
        if (b.disabled) return;

        const isCurrentlyOff = b.classList.contains('off');
        if (isCurrentlyOff) b.classList.remove('off'); else b.classList.add('off');
        b.style.opacity = '0.5';

        try {
          const ref = db.collection('disponibilidades').doc(d);
          const doc = await ref.get();
          let list = doc.exists ? (doc.data().closed || []) : [];
          list = isCurrentlyOff ? list.filter(x => x !== t) : [...list, t];
          await ref.set({ closed: list }, { merge: true });
        } catch(err) {
          console.error(err);
          if (isCurrentlyOff) b.classList.add('off'); else b.classList.remove('off');
          toast('Erro ao salvar no Firebase.');
        } finally {
          b.style.opacity = '1';
        }
      });
      r.appendChild(b);
    });
  } catch(e) {
    console.error(e);
    r.innerHTML = '<div class="empty" style="font-size:12px;grid-column:1/-1; text-align:center;">Erro ao carregar horários.</div>';
  }
}

/* =========================================
   AUTENTICAÇÃO E RENDERIZAÇÃO GERAL
   ========================================= */
async function adminLogin(email, password) {
  try {
    const r = await auth.signInWithEmailAndPassword(email, password);
    const d = await db.collection('admins').doc(r.user.uid).get();
    if (!d.exists) { await auth.signOut(); toast('Usuário não autorizado.'); return; }
    document.getElementById('adminEmail').value = '';
    document.getElementById('adminPassword').value = '';
    toast('Bem-vinda, Carol!');
  } catch(e) { console.error(e); toast('Erro ao fazer login.'); }
}

async function adminLogout() { await auth.signOut(); toast('Logout realizado.'); }

async function renderAllAdmin() {
  await renderStats();
  await populateDateFilter();
  await renderAdminAppointments();
  await renderAdminServices();
  await renderRevenue();
  await renderAdminGaleria();
}

async function renderStats() {
  try {
    const [p, ag, h] = await Promise.all([
      db.collection('agendamentos').where('status', '==', 'pendente').get(),
      db.collection('agendamentos').where('status', '==', 'aguardando-sinal').get(),
      db.collection('agendamentos').where('data', '==', keyDate(new Date())).where('status', '==', 'confirmado').get()
    ]);
    document.getElementById('stats').innerHTML = `
      <div class="stat"><b>${p.size}</b><span>Pendentes</span></div>
      <div class="stat"><b>${ag.size}</b><span>Aguardando sinal</span></div>
      <div class="stat"><b>${h.size}</b><span>Confirmados hoje</span></div>`;
  } catch(e) { console.error(e); }
}

async function populateDateFilter() {
  const sel = document.getElementById('dateFilter'); const cur = sel.value;
  try {
    const snap = await db.collection('agendamentos').orderBy('data').get();
    const dates = [...new Set(snap.docs.map(d => d.data().data))].filter(Boolean).sort();
    sel.innerHTML = '<option value="all">Todas as datas</option>' + dates.map(d => `<option value="${d}">${br(d)}</option>`).join('');
    if (dates.includes(cur)) sel.value = cur;
  } catch(e) { console.error(e); }
}

async function renderAdminAppointments() {
  const statusF = document.getElementById('statusFilter').value;
  const dateF = document.getElementById('dateFilter').value;
  const r = document.getElementById('adminAppointments');

  try {
    let q = db.collection('agendamentos').orderBy('criadoEm', 'desc');
    if (statusF !== 'all') q = q.where('status', '==', statusF);
    const snap = await q.get();
    let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (dateF && dateF !== 'all') list = list.filter(a => a.data === dateF);
    if (!list.length) { r.innerHTML = '<div class="empty">Nenhuma solicitação encontrada.</div>'; return; }

    r.innerHTML = '';
    list.forEach(a => {
      const el = document.createElement('article'); el.className = 'appointment';
      let actions = '';
      const pixTag = a.deposito === 'pago' ? ' · <b>PIX informado</b>' : '';

      if (a.status === 'pendente') {
        actions = `<button class="tiny go approve">Aprovar</button><button class="tiny danger refuse">Recusar</button>`;
      } else if (a.status === 'aguardando-sinal') {
        actions = `<a class="tiny wa" target="_blank" rel="noopener" href="${waLink(a.telefone, `Oi ${a.nome}! Sua reserva de ${a.servico} em ${br(a.data)} às ${a.horario} foi aprovada. Sinal de R$ ${SINAL}.`)}">Cobrar sinal</a>
                   <button class="tiny go deposit">Sinal recebido</button>
                   <button class="tiny danger refuse">Recusar</button>`;
      } else if (a.status === 'confirmado') {
        actions = `<a class="tiny wa" target="_blank" rel="noopener" href="${waLink(a.telefone, `Oi ${a.nome}! Lembrete do seu ${a.servico} em ${br(a.data)} às ${a.horario}.`)}">Lembrete</a>
                   <button class="tiny go complete">Concluir</button>
                   <button class="tiny danger cancel">Cancelar</button>`;
      }

      el.innerHTML = `
        <div class="appointment-head">
          <div><h3>${esc(a.servico)}</h3>
            <p>${esc(a.nome)} · ${formatPhoneDisplay(a.telefone)}</p>
            <p>${br(a.data)} às <b>${a.horario}</b> · ${money(a.preco)}${a.reagendamentos ? ` · ${a.reagendamentos}x reagendado` : ''}${pixTag}</p></div>
          <span class="badge ${a.status}">${a.status.replace('-', ' ')}</span>
        </div>
        <div class="actions">${actions}</div>`;

      const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.addEventListener('click', fn); };
      on('.approve', () => approveAppointment(a.id));
      on('.refuse', () => updateAppointment(a.id, { status: 'recusado' }, 'Recusado.'));
      on('.deposit', () => updateAppointment(a.id, { status: 'confirmado', deposito: 'pago' }, 'Confirmado!'));
      on('.complete', () => updateAppointment(a.id, { status: 'concluido' }, 'Concluído.'));
      on('.cancel', () => updateAppointment(a.id, { status: 'cancelado', canceladoPor: 'carol' }, 'Cancelado.'));
      r.appendChild(el);
    });
  } catch(e) {
    console.error(e);
    r.innerHTML = '<div class="empty">Erro ao carregar agendamentos.</div>';
  }
}

async function approveAppointment(id) {
  try {
    const d = await db.collection('agendamentos').doc(id).get(); const a = d.data();
    const snap = await db.collection('agendamentos').where('telefone', '==', a.telefone)
      .where('status', 'in', ['confirmado', 'concluido']).get();
    if (!snap.empty) await updateAppointment(id, { status: 'confirmado', deposito: 'nao-aplicavel', isLoyal: true }, 'Aprovado — cliente fidelizada.');
    else await updateAppointment(id, { status: 'aguardando-sinal', deposito: 'pendente', isLoyal: false }, 'Aprovado! Combine o sinal.');
  } catch(e) { console.error(e); toast('Erro ao aprovar.'); }
}

async function updateAppointment(id, changes, msg) {
  try {
    await db.collection('agendamentos').doc(id).update(changes);
    toast(msg); await renderAllAdmin();
  } catch(e) { console.error(e); toast('Erro ao atualizar.'); }
}

async function renderAdminServices() {
  const r = document.getElementById('adminServices');
  r.innerHTML = '<div class="empty" style="font-size:12px;padding:10px">Carregando...</div>';

  try {
    const snap = await db.collection('servicos').orderBy('id').get();
    r.innerHTML = '';

    if (snap.empty) { r.innerHTML = '<div class="empty">Nenhum serviço cadastrado.</div>'; return; }

    snap.docs.forEach(doc => {
      const s = doc.data();
      const row = document.createElement('div');
      row.className = 'admin-service';
      row.innerHTML = `
        <input data-field="name" value="${esc(s.name)}" placeholder="Nome do serviço">
        <input data-field="duration" value="${esc(s.duration)}" placeholder="Tempo">
        <input data-field="price" type="number" value="${s.price}" placeholder="R$">
        <button class="tiny danger remove" title="Excluir">✕</button>`;

      row.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('change', async () => {
          const field = inp.dataset.field;
          let v = inp.value.trim();
          let err = '';
          if (field === 'price') {
            const n = +inp.value;
            if (inp.value === '' || !isFinite(n) || n < 0 || n > 10000) err = 'Preço inválido (de R$ 0 a R$ 10.000).';
            else v = n;
          } else if (field === 'name') {
            v = v.replace(/\s+/g, ' ');
            if (v.length < 2 || v.length > 60) err = 'O nome deve ter de 2 a 60 caracteres.';
          } else if (field === 'duration') {
            if (v.length < 1 || v.length > 20) err = 'Informe a duração (ex.: 1h 30 min).';
          }
          if (err) { inp.value = s[field]; return toast(err); }
          try {
            await db.collection('servicos').doc(s.id.toString()).update({ [field]: v });
            s[field] = v; inp.value = v;
            toast('Serviço atualizado!');
          } catch(e) { console.error(e); inp.value = s[field]; toast('Erro ao atualizar serviço.'); }
        });
      });

      row.querySelector('.remove').addEventListener('click', async () => {
        if (snap.size <= 1) return toast('Mantenha ao menos um serviço.');
        if (confirm('Tem certeza que deseja remover este serviço?')) {
          try {
            await db.collection('servicos').doc(s.id.toString()).delete();
            renderAllAdmin();
            toast('Serviço removido.');
          } catch(e) { console.error(e); toast('Erro ao remover.'); }
        }
      });
      r.appendChild(row);
    });
  } catch(e) {
    console.error(e);
    r.innerHTML = '<div class="empty">Erro ao carregar catálogo.</div>';
  }
}

async function renderRevenue() {
  try {
    const snap = await db.collection('agendamentos').where('status', '==', 'concluido').get();
    const total = snap.docs.reduce((s, d) => s + (+d.data().preco || 0), 0);
    document.getElementById('completedCount').textContent = snap.size;
    document.getElementById('revenue').textContent = money(total);
  } catch(e) { console.error(e); }
}

async function renderAdminGaleria() {
  const r = document.getElementById('adminGaleria');
  try {
    const snap = await db.collection('galeria').orderBy('ordem').get();
    if (snap.empty) { r.innerHTML = '<div class="empty" style="font-size:12px;padding:10px">Nenhuma foto cadastrada.</div>'; return; }
    r.innerHTML = '';
    snap.docs.forEach(doc => {
      const g = { id: doc.id, ...doc.data() };
      const row = document.createElement('div'); row.className = 'admin-service';
      row.innerHTML = `
        <img src="${esc(g.url)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px">
        <span style="flex:1;font-size:12px;word-break:break-all">${esc(g.alt || g.url)}</span>
        <button class="tiny danger">✕</button>`;
      row.querySelector('button').addEventListener('click', async () => {
        if (confirm('Remover esta foto?')) {
          try {
            await db.collection('galeria').doc(g.id).delete();
            renderAdminGaleria();
            toast('Foto removida.');
          } catch(e) { console.error(e); toast('Erro ao remover foto.'); }
        }
      });
      r.appendChild(row);
    });
  } catch(e) { console.error(e); }
}

async function addGaleria() {
  const url = document.getElementById('galUrl').value.trim();
  const alt = document.getElementById('galAlt').value.trim();
  if (!url) return toast('Informe a URL da imagem.');
  if (!validHttpsUrl(url)) return toast('Informe um endereço válido, começando com https://');
  if (alt.length > 120) return toast('A descrição pode ter até 120 caracteres.');

  try {
    const snap = await db.collection('galeria').orderBy('ordem', 'desc').limit(1).get();
    const ordem = snap.empty ? 1 : (+snap.docs[0].data().ordem || 0) + 1;
    await db.collection('galeria').add({ url, alt, ordem });
    document.getElementById('galUrl').value = ''; document.getElementById('galAlt').value = '';
    renderAdminGaleria(); toast('Foto adicionada.');
  } catch(e) { console.error(e); toast('Erro ao adicionar foto.'); }
}
