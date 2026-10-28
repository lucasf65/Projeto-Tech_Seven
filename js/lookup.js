'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const inp=document.getElementById('lookup'); if(!inp) return;
  inp.addEventListener('input',formatPhoneInput);
  document.getElementById('findAppointments').addEventListener('click',findAppointments);
});

async function findAppointments(){
  const phone=digits(document.getElementById('lookup').value);
  if(phone.length<10){ toast('Informe um WhatsApp válido.'); return; }
  
  const snap=await db.collection('agendamentos').where('telefone','==',phone).orderBy('criadoEm','desc').get();
  const r=document.getElementById('myAppointments');
  
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
    
    // Monta o aviso de sinal pago de forma elegante
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
        <p>${br(a.data)} às <b>${a.horario}</b> · ${money(a.preco)}</p>
        ${pixInfo}
        ${sinalMsg}
        
        ${can?`<div class="my-appt-actions">
          <button class="tiny danger cancel">Cancelar</button>
          <button class="tiny rebook">Reagendar</button>
        </div>`:''}
      </div>
      
      <div class="my-appt-status">
        <span class="badge ${a.status}">${a.status.replace('-',' ')}</span>
      </div>
    `;
    
    if(can){
      el.querySelector('.cancel').addEventListener('click',async()=>{
        if(confirm('Tem certeza que deseja cancelar este agendamento?')){
          await db.collection('agendamentos').doc(a.id).update({status:'cancelado'});
          toast('Agendamento cancelado.'); 
          findAppointments();
        }
      });
      
      el.querySelector('.rebook').addEventListener('click',async()=>{
        if((a.reagendamentos||0)>=3){ 
          toast('Limite de 3 reagendamentos atingido. Fale com a Carol.'); 
          return; 
        }
        await db.collection('agendamentos').doc(a.id).update({status:'cancelado',reagendamentos:(a.reagendamentos||0)+1});
        location.href='agendamento.html';
      });
    }
    r.appendChild(el);
  });
}