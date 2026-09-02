// app.js - Aplicação principal com Firebase

'use strict';

// ============================================
// CONSTANTES
// ============================================

const SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];
const STATUSES = ['pendente', 'aguardando-sinal', 'confirmado', 'concluido', 'recusado', 'cancelado'];

// ============================================
// ESTADO DA APLICAÇÃO
// ============================================

const state = {
    service: null,
    date: keyDate(new Date()),
    time: null,
    isAdmin: false,
    adminUid: null,
    loading: false
};

// ============================================
// UTILITÁRIOS
// ============================================

function esc(s) {
    const e = document.createElement('div');
    e.textContent = s ?? '';
    return e.innerHTML;
}

function money(n) {
    return (+n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function digits(s) {
    return (s || '').replace(/\D/g, '');
}

function keyDate(d) {
    const x = new Date(d);
    x.setHours(12, 0, 0, 0);
    return x.toISOString().slice(0, 10);
}

function br(x, long = false) {
    return new Date(x + 'T12:00:00').toLocaleDateString('pt-BR',
        long ? { weekday: 'long', day: '2-digit', month: 'long' } : { day: '2-digit', month: '2-digit', year: 'numeric' }
    );
}

function formatPhoneDisplay(p) {
    p = digits(p);
    if (p.length > 10) {
        return p.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    }
    return p.replace(/(\d{2})(\d{0,4})(\d{0,4})/, '($1) $2-$3');
}

function waLink(phone, text) {
    let p = digits(phone);
    if (p.length === 10 || p.length === 11) p = '55' + p;
    return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

// ============================================
// TOAST
// ============================================

function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(window.tt);
    window.tt = setTimeout(() => el.classList.remove('show'), 3200);
}

// ============================================
// FORMATADOR DE TELEFONE
// ============================================

function formatPhoneInput(e) {
    let n = digits(e.target.value).slice(0, 11);
    if (n.length > 10) {
        e.target.value = n.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    } else {
        e.target.value = n.replace(/(\d{2})(\d{0,4})(\d{0,4})/, '($1) $2-$3');
    }
}

// ============================================
// NAVEGAÇÃO
// ============================================

function switchView(view) {
    document.querySelectorAll('nav button').forEach(b => {
        b.classList.toggle('active', b.dataset.view === view);
    });
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
    });
    document.getElementById(view + 'View').classList.add('active');
}

// ============================================
// SERVIÇOS
// ============================================

async function loadServices() {
    try {
        const snapshot = await db.collection('servicos').orderBy('id').get();
        if (snapshot.empty) {
            // Serviços padrão se não existirem
            const defaultServices = [
                { id: 1, name: 'Manicure simples', description: 'Cutilagem e esmaltação', duration: '40 min', price: 35, icon: '💅' },
                { id: 2, name: 'Alongamento em gel', description: 'Aplicação e finalização', duration: '1h 30 min', price: 90, icon: '✨' },
                { id: 3, name: 'Pacote Mãos + Pés', description: 'Cuidado completo', duration: '1h 10 min', price: 70, icon: '🌸' }
            ];
            for (const s of defaultServices) {
                await db.collection('servicos').doc(s.id.toString()).set(s);
            }
            return defaultServices;
        }
        return snapshot.docs.map(doc => doc.data());
    } catch (err) {
        console.error('Erro ao carregar serviços:', err);
        toast('Erro ao carregar serviços');
        return [];
    }
}

function renderServices(services) {
    const r = document.getElementById('services');
    r.innerHTML = '';
    services.forEach(s => {
        const b = document.createElement('button');
        b.className = 'service' + (state.service?.id === s.id ? ' selected' : '');
        b.innerHTML = `
            <span class="icon">${s.icon || '💅'}</span>
            <span>
                <strong>${esc(s.name)}</strong>
                <small>${esc(s.description || '')} · ${esc(s.duration)}</small>
            </span>
            <span class="price">${money(s.price)}</span>
        `;
        b.onclick = () => {
            state.service = s;
            renderServices(services);
            updateSummary();
        };
        r.append(b);
    });
}

// ============================================
// DATAS E HORÁRIOS
// ============================================

function renderDates() {
    const r = document.getElementById('dates');
    r.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const k = keyDate(d);
        const b = document.createElement('button');
        b.className = 'date' + (k === state.date ? ' selected' : '');
        b.innerHTML = `
            <small>${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</small>
            <b>${String(d.getDate()).padStart(2, '0')}</b>
        `;
        b.onclick = () => {
            state.date = k;
            state.time = null;
            renderDates();
            renderSlots();
            updateSummary();
        };
        r.append(b);
    }
}

async function isSlotBusy(date, time) {
    try {
        const snapshot = await db.collection('agendamentos')
            .where('date', '==', date)
            .where('time', '==', time)
            .where('status', 'not-in', ['recusado', 'cancelado'])
            .get();
        return !snapshot.empty;
    } catch (err) {
        console.error('Erro ao verificar disponibilidade:', err);
        return false;
    }
}

async function isSlotClosed(date, time) {
    try {
        const doc = await db.collection('disponibilidades').doc(date).get();
        if (!doc.exists) return false;
        const closed = doc.data().closed || [];
        return closed.includes(time);
    } catch (err) {
        console.error('Erro ao verificar bloqueios:', err);
        return false;
    }
}

async function renderSlots() {
    document.getElementById('chosenDate').textContent = 'Horários para ' + br(state.date, true);
    const r = document.getElementById('slots');
    r.innerHTML = '';
    
    const busyPromises = SLOTS.map(t => isSlotBusy(state.date, t));
    const closedPromises = SLOTS.map(t => isSlotClosed(state.date, t));
    const busyResults = await Promise.all(busyPromises);
    const closedResults = await Promise.all(closedPromises);
    
    SLOTS.forEach((t, index) => {
        const busy = busyResults[index];
        const closed = closedResults[index];
        const off = busy || closed;
        const b = document.createElement('button');
        b.className = 'slot' + (state.time === t ? ' selected' : '');
        b.textContent = t;
        b.disabled = off;
        b.onclick = () => {
            state.time = t;
            renderSlots();
            updateSummary();
        };
        r.append(b);
    });
}

// ============================================
// RESUMO E ENVIO
// ============================================

function updateSummary() {
    document.getElementById('sService').textContent = state.service?.name || '—';
    document.getElementById('sDate').textContent = state.date ? br(state.date) : '—';
    document.getElementById('sTime').textContent = state.time || '—';
    document.getElementById('sPrice').textContent = state.service ? money(state.service.price) : '—';
    
    const name = document.getElementById('name').value.trim();
    const phone = digits(document.getElementById('phone').value);
    const privacy = document.getElementById('privacy').checked;
    const enabled = !!(state.service && state.date && state.time && name.length > 1 && phone.length >= 10 && privacy);
    document.getElementById('request').disabled = !enabled;
}

async function submitAppointment() {
    const name = document.getElementById('name').value.trim();
    const phone = digits(document.getElementById('phone').value);
    
    if (!state.service || !state.date || !state.time) return;
    
    // Verificar novamente se o horário está disponível
    const busy = await isSlotBusy(state.date, state.time);
    const closed = await isSlotClosed(state.date, state.time);
    if (busy || closed) {
        toast('Esse horário não está mais disponível.');
        renderSlots();
        return;
    }
    
    // Verificar se cliente já existe
    let clienteId = null;
    try {
        const clienteSnapshot = await db.collection('clientes')
            .where('telefone', '==', phone)
            .get();
        
        if (!clienteSnapshot.empty) {
            clienteId = clienteSnapshot.docs[0].id;
        } else {
            const newCliente = await db.collection('clientes').add({
                nome: name,
                telefone: phone,
                criadoEm: firebase.firestore.FieldValue.serverTimestamp()
            });
            clienteId = newCliente.id;
        }
    } catch (err) {
        console.error('Erro ao criar/identificar cliente:', err);
        toast('Erro ao processar cliente. Tente novamente.');
        return;
    }
    
    // Verificar se é cliente fidelizada
    let isLoyal = false;
    try {
        const snapshot = await db.collection('agendamentos')
            .where('clienteId', '==', clienteId)
            .where('status', 'in', ['confirmado', 'concluido'])
            .get();
        isLoyal = !snapshot.empty;
    } catch (err) {
        console.error('Erro ao verificar fidelidade:', err);
    }
    
    // Criar agendamento
    try {
        await db.collection('agendamentos').add({
            clienteId: clienteId,
            nome: name,
            telefone: phone,
            servico: state.service.name,
            servicoId: state.service.id,
            preco: state.service.price,
            data: state.date,
            horario: state.time,
            status: 'pendente',
            deposito: isLoyal ? 'nao-aplicavel' : 'pendente',
            reagendamentos: 0,
            criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
            isLoyal: isLoyal
        });
        
        toast('Solicitação enviada! Aguarde a aprovação da Carol.');
        
        // Limpar formulário
        document.getElementById('name').value = '';
        document.getElementById('phone').value = '';
        document.getElementById('privacy').checked = false;
        state.service = null;
        state.time = null;
        renderAll();
    } catch (err) {
        console.error('Erro ao criar agendamento:', err);
        toast('Erro ao enviar solicitação. Tente novamente.');
    }
}

// ============================================
// MEUS HORÁRIOS
// ============================================

async function findAppointments() {
    const phone = digits(document.getElementById('lookup').value);
    if (phone.length < 10) {
        toast('Informe um WhatsApp válido.');
        return;
    }
    
    try {
        const snapshot = await db.collection('agendamentos')
            .where('telefone', '==', phone)
            .orderBy('criadoEm', 'desc')
            .get();
        
        const r = document.getElementById('myAppointments');
        if (snapshot.empty) {
            r.className = 'empty';
            r.textContent = 'Não encontramos solicitações para este WhatsApp.';
            return;
        }
        
        r.className = '';
        r.innerHTML = '';
        
        const appointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        for (const a of appointments) {
            const can = ['pendente', 'aguardando-sinal', 'confirmado'].includes(a.status);
            const el = document.createElement('article');
            el.className = 'appointment';
            
            let statusText = a.status.replace('-', ' ');
            let extraInfo = '';
            
            if (a.status === 'aguardando-sinal') {
                extraInfo = '<p>Reserva aprovada. Combine o sinal de R$ 30 com a Carol para confirmar.</p>';
            } else if (a.status === 'pendente') {
                extraInfo = '<p>Aguardando análise da Carol.</p>';
            }
            
            let actionsHtml = '';
            if (can) {
                actionsHtml = `
                    <div class="actions">
                        <button class="tiny cancel" data-id="${a.id}">Cancelar</button>
                        <button class="tiny rebook" data-id="${a.id}">Reagendar</button>
                    </div>
                `;
            }
            
            el.innerHTML = `
                <div class="appointment-head">
                    <div>
                        <h3>${esc(a.servico)}</h3>
                        <p>${br(a.data)} às <b>${a.horario}</b> · ${money(a.preco)}</p>
                    </div>
                    <span class="badge ${a.status}">${statusText}</span>
                </div>
                ${extraInfo}
                ${actionsHtml}
            `;
            
            // Eventos
            const cancelBtn = el.querySelector('.cancel');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => cancelAppointment(a.id));
            }
            
            const rebookBtn = el.querySelector('.rebook');
            if (rebookBtn) {
                rebookBtn.addEventListener('click', () => rebookAppointment(a));
            }
            
            r.append(el);
        }
    } catch (err) {
        console.error('Erro ao buscar agendamentos:', err);
        toast('Erro ao consultar agendamentos.');
    }
}

async function cancelAppointment(id) {
    try {
        await db.collection('agendamentos').doc(id).update({
            status: 'cancelado'
        });
        toast('Agendamento cancelado.');
        findAppointments();
        if (state.isAdmin) renderAll();
    } catch (err) {
        console.error('Erro ao cancelar:', err);
        toast('Erro ao cancelar agendamento.');
    }
}

async function rebookAppointment(a) {
    if (a.reagendamentos >= 3) {
        toast('Limite de 3 reagendamentos atingido. Fale com a Carol.');
        return;
    }
    
    try {
        await db.collection('agendamentos').doc(a.id).update({
            status: 'cancelado',
            reagendamentos: (a.reagendamentos || 0) + 1
        });
        
        // Encontrar serviço correspondente
        const services = await loadServices();
        const service = services.find(s => s.name === a.servico) || null;
        state.service = service;
        state.date = keyDate(new Date());
        state.time = null;
        
        toast('Escolha um novo horário para enviar outra solicitação.');
        switchView('book');
        renderAll();
    } catch (err) {
        console.error('Erro ao reagendar:', err);
        toast('Erro ao reagendar agendamento.');
    }
}

// ============================================
// AUTENTICAÇÃO ADMIN
// ============================================

async function adminLogin(email, password) {
    try {
        const result = await auth.signInWithEmailAndPassword(email, password);
        const uid = result.user.uid;
        
        // Verificar se é administrador
        const adminDoc = await db.collection('admins').doc(uid).get();
        if (!adminDoc.exists) {
            await auth.signOut();
            toast('Usuário não autorizado como administrador.');
            return false;
        }
        
        state.isAdmin = true;
        state.adminUid = uid;
        
        document.getElementById('adminLogin').classList.add('hidden');
        document.getElementById('adminPanel').classList.remove('hidden');
        document.getElementById('adminEmail').value = '';
        document.getElementById('adminPassword').value = '';
        toast('Bem-vinda, Carol!');
        renderAll();
        return true;
    } catch (err) {
        console.error('Erro no login:', err);
        toast('Erro ao fazer login. Verifique email e senha.');
        return false;
    }
}

async function adminLogout() {
    try {
        await auth.signOut();
        state.isAdmin = false;
        state.adminUid = null;
        document.getElementById('adminPanel').classList.add('hidden');
        document.getElementById('adminLogin').classList.remove('hidden');
        toast('Logout realizado.');
        renderAll();
    } catch (err) {
        console.error('Erro no logout:', err);
        toast('Erro ao fazer logout.');
    }
}

// ============================================
// PAINEL ADMIN - ESTATÍSTICAS
// ============================================

async function renderStats() {
    try {
        const pendentes = await db.collection('agendamentos')
            .where('status', '==', 'pendente')
            .get();
        
        const aguardando = await db.collection('agendamentos')
            .where('status', '==', 'aguardando-sinal')
            .get();
        
        const hoje = await db.collection('agendamentos')
            .where('date', '==', keyDate(new Date()))
            .where('status', '==', 'confirmado')
            .get();
        
        document.getElementById('stats').innerHTML = `
            <div class="stat"><b>${pendentes.size}</b><span>Pendentes</span></div>
            <div class="stat"><b>${aguardando.size}</b><span>Aguardando sinal</span></div>
            <div class="stat"><b>${hoje.size}</b><span>Confirmados hoje</span></div>
        `;
    } catch (err) {
        console.error('Erro ao carregar estatísticas:', err);
    }
}

// ============================================
// PAINEL ADMIN - FILTROS E AGENDAMENTOS
// ============================================

async function populateDateFilter() {
    const sel = document.getElementById('dateFilter');
    const current = sel.value;
    
    try {
        const snapshot = await db.collection('agendamentos')
            .orderBy('data')
            .get();
        
        const dates = [...new Set(snapshot.docs.map(doc => doc.data().data))].sort();
        
        sel.innerHTML = '<option value="all">Todas as datas</option>' +
            dates.map(d => `<option value="${d}">${br(d)}</option>`).join('');
        
        if (dates.includes(current)) sel.value = current;
    } catch (err) {
        console.error('Erro ao carregar datas:', err);
    }
}

async function renderAdminAppointments() {
    const statusF = document.getElementById('statusFilter').value;
    const dateF = document.getElementById('dateFilter').value;
    const r = document.getElementById('adminAppointments');
    
    try {
        let query = db.collection('agendamentos').orderBy('criadoEm', 'desc');
        
        if (statusF !== 'all') {
            query = query.where('status', '==', statusF);
        }
        
        const snapshot = await query.get();
        let list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (dateF && dateF !== 'all') {
            list = list.filter(a => a.data === dateF);
        }
        
        if (list.length === 0) {
            r.innerHTML = '<div class="empty">Nenhuma solicitação encontrada para este filtro.</div>';
            return;
        }
        
        r.innerHTML = '';
        
        for (const a of list) {
            const el = document.createElement('article');
            el.className = 'appointment';
            
            let actions = [];
            
            if (a.status === 'pendente') {
                actions.push(`<button class="tiny go approve" data-id="${a.id}">Aprovar</button>`);
                actions.push(`<button class="tiny danger refuse" data-id="${a.id}">Recusar</button>`);
            } else if (a.status === 'aguardando-sinal') {
                actions.push(`<a class="tiny wa" target="_blank" rel="noopener" href="${waLink(a.telefone, `Oi ${a.nome}! Sua reserva de ${a.servico} em ${br(a.data)} às ${a.horario} foi aprovada! Para confirmar, o valor será de R$ 30. Pode me avisar por aqui quando fizer o pagamento?`)}">💬 Cobrar sinal</a>`);
                actions.push(`<button class="tiny go deposit" data-id="${a.id}">Sinal recebido</button>`);
                actions.push(`<button class="tiny danger refuse" data-id="${a.id}">Recusar</button>`);
            } else if (a.status === 'confirmado') {
                actions.push(`<a class="tiny wa" target="_blank" rel="noopener" href="${waLink(a.telefone, `Oi ${a.nome}! Passando para lembrar do seu ${a.servico} em ${br(a.data)} às ${a.horario}. Até breve!`)}">💬 Lembrete</a>`);
                actions.push(`<button class="tiny go complete" data-id="${a.id}">Concluir</button>`);
                actions.push(`<button class="tiny danger cancel" data-id="${a.id}">Cancelar</button>`);
            }
            
            const statusText = a.status.replace('-', ' ');
            const rebookInfo = a.reagendamentos ? ` · ${a.reagendamentos}x reagendado` : '';
            
            el.innerHTML = `
                <div class="appointment-head">
                    <div>
                        <h3>${esc(a.servico)}</h3>
                        <p>${esc(a.nome)} · ${formatPhoneDisplay(a.telefone)}</p>
                        <p>${br(a.data)} às <b>${a.horario}</b> · ${money(a.preco)}${rebookInfo}</p>
                    </div>
                    <span class="badge ${a.status}">${statusText}</span>
                </div>
                <div class="actions">${actions.join('')}</div>
            `;
            
            // Eventos
            const approveBtn = el.querySelector('.approve');
            if (approveBtn) approveBtn.addEventListener('click', () => approveAppointment(a.id));
            
            const refuseBtn = el.querySelector('.refuse');
            if (refuseBtn) refuseBtn.addEventListener('click', () => updateAppointment(a.id, { status: 'recusado' }, 'Solicitação recusada.'));
            
            const depositBtn = el.querySelector('.deposit');
            if (depositBtn) depositBtn.addEventListener('click', () => updateAppointment(a.id, { status: 'confirmado', deposito: 'pago' }, 'Sinal confirmado — agendamento confirmado!'));
            
            const completeBtn = el.querySelector('.complete');
            if (completeBtn) completeBtn.addEventListener('click', () => updateAppointment(a.id, { status: 'concluido' }, 'Atendimento marcado como concluído.'));
            
            const cancelBtn = el.querySelector('.cancel');
            if (cancelBtn) cancelBtn.addEventListener('click', () => updateAppointment(a.id, { status: 'cancelado' }, 'Agendamento cancelado.'));
            
            r.append(el);
        }
    } catch (err) {
        console.error('Erro ao carregar agendamentos:', err);
        r.innerHTML = '<div class="empty">Erro ao carregar agendamentos.</div>';
    }
}

async function approveAppointment(id) {
    try {
        const doc = await db.collection('agendamentos').doc(id).get();
        const a = doc.data();
        if (!a) return;
        
        // Verificar se é cliente fidelizada
        let isLoyal = false;
        try {
            const snapshot = await db.collection('agendamentos')
                .where('clienteId', '==', a.clienteId)
                .where('status', 'in', ['confirmado', 'concluido'])
                .get();
            isLoyal = !snapshot.empty;
        } catch (err) {
            console.error('Erro ao verificar fidelidade:', err);
        }
        
        if (isLoyal) {
            await updateAppointment(id, { status: 'confirmado', deposito: 'nao-aplicavel', isLoyal: true }, 'Aprovado e confirmado — cliente fidelizada, sem sinal.');
        } else {
            await updateAppointment(id, { status: 'aguardando-sinal', deposito: 'pendente', isLoyal: false }, 'Aprovado! Combine o sinal de R$ 30 com a cliente.');
        }
    } catch (err) {
        console.error('Erro ao aprovar:', err);
        toast('Erro ao aprovar agendamento.');
    }
}

async function updateAppointment(id, changes, msg) {
    try {
        await db.collection('agendamentos').doc(id).update(changes);
        toast(msg);
        if (state.isAdmin) renderAll();
    } catch (err) {
        console.error('Erro ao atualizar:', err);
        toast('Erro ao atualizar agendamento.');
    }
}

// ============================================
// PAINEL ADMIN - DISPONIBILIDADE
// ============================================

async function renderAvailability() {
    const d = document.getElementById('availDate').value || state.date;
    state.date = d;
    document.getElementById('availDate').value = d;
    const r = document.getElementById('availability');
    r.innerHTML = '';
    
    const busyPromises = SLOTS.map(t => isSlotBusy(d, t));
    const closedPromises = SLOTS.map(t => isSlotClosed(d, t));
    const busyResults = await Promise.all(busyPromises);
    const closedResults = await Promise.all(closedPromises);
    
    SLOTS.forEach((t, index) => {
        const isBusy = busyResults[index];
        const isClosed = closedResults[index];
        const b = document.createElement('button');
        b.textContent = isBusy ? t + ' 🔒' : t;
        b.className = (isClosed || isBusy) ? 'off' : '';
        b.disabled = isBusy;
        b.title = isBusy ? 'Já reservado por uma solicitação ativa' :
                           (isClosed ? 'Bloqueado — clique para reabrir' : 'Aberto — clique para bloquear');
        
        if (!isBusy) {
            b.onclick = async () => {
                try {
                    const docRef = db.collection('disponibilidades').doc(d);
                    const doc = await docRef.get();
                    let closed = doc.exists ? (doc.data().closed || []) : [];
                    
                    if (isClosed) {
                        closed = closed.filter(x => x !== t);
                    } else {
                        closed.push(t);
                    }
                    
                    await docRef.set({ closed }, { merge: true });
                    renderAvailability();
                    renderSlots();
                } catch (err) {
                    console.error('Erro ao atualizar disponibilidade:', err);
                    toast('Erro ao atualizar disponibilidade.');
                }
            };
        }
        r.append(b);
    });
}

// ============================================
// PAINEL ADMIN - SERVIÇOS
// ============================================

async function renderAdminServices() {
    const services = await loadServices();
    const r = document.getElementById('adminServices');
    r.innerHTML = '';
    
    for (const s of services) {
        const row = document.createElement('div');
        row.className = 'admin-service';
        row.innerHTML = `
            <input type="text" value="${esc(s.name)}" data-field="name" data-id="${s.id}" aria-label="Nome do serviço">
            <input type="text" value="${esc(s.duration)}" data-field="duration" data-id="${s.id}" aria-label="Duração">
            <input type="number" min="0" step="1" value="${s.price}" data-field="price" data-id="${s.id}" aria-label="Preço">
            <button class="tiny danger remove" data-id="${s.id}" aria-label="Remover serviço">✕</button>
        `;
        
        row.querySelectorAll('input').forEach(inp => {
            inp.onchange = async () => {
                try {
                    const field = inp.dataset.field;
                    let val = inp.value;
                    if (field === 'price') val = Math.max(0, +val || 0);
                    await db.collection('servicos').doc(s.id.toString()).update({ [field]: val });
                    renderServices(await loadServices());
                    renderRevenue();
                } catch (err) {
                    console.error('Erro ao atualizar serviço:', err);
                    toast('Erro ao atualizar serviço.');
                }
            };
        });
        
        row.querySelector('.remove').onclick = async () => {
            const servicesList = await loadServices();
            if (servicesList.length <= 1) {
                toast('Mantenha ao menos um serviço no catálogo.');
                return;
            }
            if (confirm('Remover este serviço do catálogo?')) {
                try {
                    await db.collection('servicos').doc(s.id.toString()).delete();
                    renderAll();
                    toast('Serviço removido.');
                } catch (err) {
                    console.error('Erro ao remover serviço:', err);
                    toast('Erro ao remover serviço.');
                }
            }
        };
        
        r.append(row);
    }
}

async function addService() {
    const services = await loadServices();
    const maxId = services.reduce((max, s) => Math.max(max, s.id || 0), 0);
    const newService = {
        id: maxId + 1,
        name: 'Novo serviço',
        description: '',
        duration: '30 min',
        price: 30,
        icon: '💅'
    };
    try {
        await db.collection('servicos').doc((maxId + 1).toString()).set(newService);
        renderAll();
        toast('Serviço adicionado. Edite os detalhes ao lado.');
    } catch (err) {
        console.error('Erro ao adicionar serviço:', err);
        toast('Erro ao adicionar serviço.');
    }
}

// ============================================
// PAINEL ADMIN - FATURAMENTO
// ============================================

async function renderRevenue() {
    try {
        const snapshot = await db.collection('agendamentos')
            .where('status', '==', 'concluido')
            .get();
        
        const total = snapshot.docs.reduce((sum, doc) => sum + (+doc.data().preco || 0), 0);
        document.getElementById('completedCount').textContent = snapshot.size;
        document.getElementById('revenue').textContent = money(total);
    } catch (err) {
        console.error('Erro ao calcular faturamento:', err);
    }
}

// ============================================
// RENDER PRINCIPAL
// ============================================

async function renderAll() {
    // Verificar autenticação
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            const adminDoc = await db.collection('admins').doc(user.uid).get();
            if (adminDoc.exists) {
                state.isAdmin = true;
                state.adminUid = user.uid;
                document.getElementById('adminLogin').classList.add('hidden');
                document.getElementById('adminPanel').classList.remove('hidden');
                // Renderizar painel
                await renderStats();
                await populateDateFilter();
                await renderAdminAppointments();
                await renderAvailability();
                await renderAdminServices();
                await renderRevenue();
            }
        }
    });
    
    // Carregar serviços
    const services = await loadServices();
    renderServices(services);
    renderDates();
    await renderSlots();
    updateSummary();
}

// ============================================
// EVENTOS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Navegação
    document.querySelectorAll('nav button').forEach(b => {
        b.onclick = () => switchView(b.dataset.view);
    });
    
    // Agendamento
    document.getElementById('name').oninput = updateSummary;
    document.getElementById('phone').oninput = (e) => {
        formatPhoneInput(e);
        updateSummary();
    };
    document.getElementById('privacy').onchange = updateSummary;
    document.getElementById('request').onclick = submitAppointment;
    
    // Meus horários
    document.getElementById('lookup').oninput = formatPhoneInput;
    document.getElementById('findAppointments').onclick = findAppointments;
    
    // Login admin
    document.getElementById('adminLoginBtn').onclick = () => {
        const email = document.getElementById('adminEmail').value.trim();
        const password = document.getElementById('adminPassword').value;
        if (email && password) {
            adminLogin(email, password);
        } else {
            toast('Preencha email e senha.');
        }
    };
    
    // Enter no login
    document.getElementById('adminPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('adminLoginBtn').click();
        }
    });
    
    document.getElementById('adminEmail').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('adminLoginBtn').click();
        }
    });
    
    document.getElementById('adminLogout').onclick = adminLogout;
    
    // Filtros
    document.getElementById('statusFilter').onchange = renderAdminAppointments;
    document.getElementById('dateFilter').onchange = renderAdminAppointments;
    
    // Disponibilidade
    document.getElementById('availDate').onchange = renderAvailability;
    
    // Serviços
    document.getElementById('addService').onclick = addService;
    
    // Inicializar
    renderAll();
});

// Monitorar autenticação para logout automático
auth.onAuthStateChanged((user) => {
    if (!user && state.isAdmin) {
        state.isAdmin = false;
        state.adminUid = null;
        document.getElementById('adminPanel').classList.add('hidden');
        document.getElementById('adminLogin').classList.remove('hidden');
    }
});
