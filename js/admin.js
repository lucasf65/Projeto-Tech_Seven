'use strict';
const adminState = { isAdmin: false, adminUid: null };
let selectedEmoji = '💅';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Inicializa o Modal de Novo Serviço (Independente do login)
  if (document.getElementById('serviceModal')) {
    initServiceModal();
  }
  
  // 2. Inicializa o Modal de Agenda
  initAdminCalendar();

  // 3. Lógica do Login e Painel
  if (!document.getElementById('adminLogin')) return;
  
  document.getElementById('adminLoginBtn').addEventListener('click', () => {
    const email = document.getElementById('adminEmail').value.trim();
    const pass = document.getElementById('adminPassword').value;
    if (email && pass) adminLogin(email, pass); else toast('Preencha email e senha.');
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
  const modal = document.getElementById('serviceModal');
  const openBtn = document.getElementById('openServiceModal');
  const closeBtn = document.querySelector('.close-modal');
  const saveBtn = document.getElementById('saveNewService');
  const emojiBtn = document.getElementById('emojiBtn');
  const emojiDropdown = document.getElementById('emojiDropdown');

  if (!modal) return;

  openBtn.addEventListener('click', () => {
    modal.classList.add('active');
    document.getElementById('newServiceName').focus();
  });

  const closeModal = () => {
    modal.classList.remove('active');
    document.getElementById('newServiceName').value = '';
    document.getElementById('newServiceDesc').value = '';
    document.getElementById('newServiceHours').value = '';
    document.getElementById('newServiceMins').value = '';
    document.getElementById('newServiceFormat').value = 'min';
    document.getElementById('newServicePrice').value = '';
    selectedEmoji = '💅';
    document.getElementById('selectedEmoji').textContent = '💅';
  };

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

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

  saveBtn.addEventListener('click', async () => {
    const name = document.getElementById('newServiceName').value.trim();
    const desc = document.getElementById('newServiceDesc').value.trim();
    const duration = formatDuration();
    const price = Math.max(0, +document.getElementById('newServicePrice').value || 30);

    if (!name) return toast('Por favor, informe o nome do serviço.');

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Salvando...';

      const snap = await db.collection('servicos').orderBy('id', 'desc').limit(1).get();
      const maxId = snap.empty ? 0 : (snap.docs[0].data().id || 0);
      const newId = maxId + 1;
      
      await db.collection('servicos').doc(newId.toString()).set({
        id: newId,
        name: name,
        description: desc,
        duration: duration,
        price: price,
        icon: selectedEmoji
      });
      
      closeModal();
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
   LÓGICA DO MODAL DE AGENDA (PREMIUM)
   ========================================= */
let adminCurrentMonth = new Date().getMonth();
let adminCurrentYear = new Date().getFullYear();
const monthsNamesAdmin = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function initAdminCalendar() {
  const modal = document.getElementById('agendaModal');
  const openBtn = document.getElementById('openAgendaModal');
  const closeBtn = document.getElementById('closeAgendaModal');
  const doneBtn = document.getElementById('doneAgendaModal');
  const hiddenDateInput = document.getElementById('availDate');

  if (!modal || !openBtn) return;

  const today = keyDate(new Date());
  if(hiddenDateInput) hiddenDateInput.value = today;

  let scrollY = 0;

  const openModal = () => {
    modal.classList.remove('active');
    
    // SOLUÇÃO DEFINITIVA: Fixar o body
    scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    
    renderAdminCalendar();
    renderAvailability();

    void modal.offsetWidth; 
    modal.classList.add('active');
  };

  const closeModal = () => {
    modal.classList.remove('active');
    
    // Restaurar posição do scroll
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    window.scrollTo(0, scrollY);
  };

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  if(doneBtn) doneBtn.addEventListener('click', closeModal);
  
  modal.addEventListener('click', (e) => { 
    if (e.target === modal) closeModal(); 
  });

  document.getElementById('adminPrevMonth').addEventListener('click', (e) => {
    e.preventDefault();
    adminCurrentMonth--;
    if (adminCurrentMonth < 0) { adminCurrentMonth = 11; adminCurrentYear--; }
    renderAdminCalendar();
  });

  document.getElementById('adminNextMonth').addEventListener('click', (e) => {
    e.preventDefault();
    adminCurrentMonth++;
    if (adminCurrentMonth > 11) { adminCurrentMonth = 0; adminCurrentYear++; }
    renderAdminCalendar();
  });
}

function renderAdminCalendar() {
  const grid = document.getElementById('adminCalendarGrid');
  if (!grid) return;

  document.getElementById('adminCalMonth').textContent = monthsNamesAdmin[adminCurrentMonth];
  document.getElementById('adminCalYear').textContent = adminCurrentYear;
  
  grid.innerHTML = '';

  const firstDay = new Date(adminCurrentYear, adminCurrentMonth, 1).getDay();
  const daysInMonth = new Date(adminCurrentYear, adminCurrentMonth + 1, 0).getDate();
  const currentSelectedDate = document.getElementById('availDate').value;

  // Dias vazios
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  // Dias do mês
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(adminCurrentYear, adminCurrentMonth, d);
    const k = keyDate(dateObj);
    
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    btn.textContent = d;

    if (k === currentSelectedDate) btn.classList.add('selected');

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('availDate').value = k;
      renderAdminCalendar();
      renderAvailability();
    });

    grid.appendChild(btn);
  }
}

/* =========================================
   RENDERIZAÇÃO DOS HORÁRIOS NO MODAL
   ========================================= */
async function renderAvailability() {
  const d = document.getElementById('availDate').value || keyDate(new Date());
  const r = document.getElementById('modalAvailability'); 
  
  if(!r) return;

  const dateObj = new Date(d + 'T12:00:00');
  const formattedDate = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const elDate = document.getElementById('modalSelectedDate');
  if(elDate) elDate.textContent = formattedDate;

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
        if (isCurrentlyOff) b.classList.remove('off');
        else b.classList.add('off');
        
        b.style.opacity = '0.5';

        try {
          const ref = db.collection('disponibilidades').doc(d);
          const doc = await ref.get();
          let list = doc.exists ? (doc.data().closed || []) : [];
          
          if (isCurrentlyOff) {
            list = list.filter(x => x !== t);
          } else {
            list.push(t);
          }
          
          await ref.set({ closed: list }, { merge: true });
        } catch(err) { 
          console.error(err); 
          if (isCurrentlyOff) b.classList.add('off');
          else b.classList.remove('off');
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
      on('.cancel', () => updateAppointment(a.id, { status: 'cancelado' }, 'Cancelado.'));
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
    const snap = await db.collection('agendamentos').where('clienteId', '==', a.clienteId)
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
    
    if (snap.empty) {
      r.innerHTML = '<div class="empty">Nenhum serviço cadastrado.</div>';
      return;
    }

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
          try {
            let v = inp.value; 
            if (inp.dataset.field === 'price') v = Math.max(0, +v || 0);
            await db.collection('servicos').doc(s.id.toString()).update({ [inp.dataset.field]: v });
            toast('Serviço atualizado!');
          } catch(e) { console.error(e); toast('Erro ao atualizar serviço.'); }
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
  
  try {
    const snap = await db.collection('galeria').orderBy('ordem', 'desc').limit(1).get();
    const ordem = snap.empty ? 1 : (+snap.docs[0].data().ordem || 0) + 1;
    await db.collection('galeria').add({ url, alt, ordem });
    document.getElementById('galUrl').value = ''; document.getElementById('galAlt').value = '';
    renderAdminGaleria(); toast('Foto adicionada.');
  } catch(e) { console.error(e); toast('Erro ao adicionar foto.'); }
}