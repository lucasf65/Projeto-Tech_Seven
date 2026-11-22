'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const inp=document.getElementById('lookup'); if(!inp) return;
  inp.addEventListener('input',e=>{ formatPhoneInput(e); setFieldError(inp,'','lookupErr'); });
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter') findAppointments(); });
  document.getElementById('findAppointments').addEventListener('click',findAppointments);
});

let lookingUp=false;

async function findAppointments(){
  if(lookingUp) return;
  const inp=document.getElementById('lookup');
  const phone=digits(inp.value);
  if(!validPhoneLookup(phone)){
    setFieldError(inp,'Informe um WhatsApp válido com DDD, ex.: (11) 99999-9999.','lookupErr');
    toast('Informe um WhatsApp válido.');
    return;
  }
  setFieldError(inp,'','lookupErr');

  const btn=document.getElementById('findAppointments');
  const r=document.getElementById('myAppointments');
  lookingUp=true; btn.disabled=true; btn.textContent='Consultando…';

  try{
    const snap=await db.collection('agendamentos').where('telefone','==',phone).orderBy('criadoEm','desc').get();

    if(snap.empty){
      r.className='empty mt-4';
      r.innerHTML = '<div style="padding:20px">Não encontramos solicitações para este WhatsApp.</div>';
      return;
    }

    // Remove a classe empty e o estilo antigo
    r.className='';
    r.innerHTML='';

    snap.docs.forEach(doc=>{
      const a={id:doc.id,...doc.data()};
      const can=['pendente','aguardando-sinal','confirmado'].includes(a.status);

      const pixInfo = a.deposito==='pago'
        ? '<div class="my-appt-pix-note">✓ Sinal informado como pago</div>'
        : '';

      const sinalMsg = a.status==='aguardando-sinal'
        ? '<div class="my-appt-pix-note" style="background:#f7e8da;color:#a05a20">Aguardando pagamento do sinal</div>'
        : '';

      const el=document.createElement('article');
      el.className='my-appt-card';

      el.innerHTML=`
        <div class="my-appt-info">
          <h3>${esc(a.servico)}</h3>
          <p>${br(a.data)} às <b>${esc(a.horario)}</b> · ${money(a.preco)}</p>
          ${pixInfo}
          ${sinalMsg}

          ${can?`<div class="my-appt-actions">
            <button class="tiny danger cancel">Cancelar</button>
            <button class="tiny rebook">Reagendar</button>
          </div>`:''}
        </div>

        <div class="my-appt-status">
          <span class="badge ${esc(a.status)}">${esc((a.status||'').replace('-',' '))}</span>
        </div>
      `;

      if(can){
        el.querySelector('.cancel').addEventListener('click',async()=>{
          if(!confirm('Tem certeza que deseja cancelar este agendamento?')) return;
          try{
            await db.collection('agendamentos').doc(a.id).update({status:'cancelado',canceladoPor:'cliente'});
            toast('Agendamento cancelado.');
            findAppointments();
          }catch(e){ console.error(e); toast('Não foi possível cancelar. Tente novamente.'); }
        });

        el.querySelector('.rebook').addEventListener('click',async()=>{
          if((a.reagendamentos||0)>=3){
            toast('Limite de 3 reagendamentos atingido. Fale com a Carol.');
            return;
          }
          try{
            await db.collection('agendamentos').doc(a.id).update({status:'cancelado',canceladoPor:'reagendamento',reagendamentos:(a.reagendamentos||0)+1});
            location.href='agendamento.html';
          }catch(e){ console.error(e); toast('Não foi possível reagendar. Tente novamente.'); }
        });
      }
      r.appendChild(el);
    });
  }catch(e){
    console.error(e);
    r.className='empty mt-4';
    r.innerHTML='<div style="padding:20px">Não foi possível consultar agora. Tente novamente em instantes.</div>';
  }finally{
    lookingUp=false; btn.disabled=false; btn.textContent='Consultar agendamentos';
  }
}
