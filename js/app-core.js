'use strict';

/* ===== Editáveis ===== */
const PIX_KEY = '+5511932298711';          // chave PIX (celular) — é o que o banco reconhece ao colar
const PIX_KEY_LABEL = '(11) 93229-8711';   // como a chave aparece para a cliente
const PIX_FAVORECIDA = 'Carol Nascimento';
const PIX_COPIA_COLA = '00020101021126360014BR.GOV.BCB.PIX0114+55119322987115204000053039865802BR5916Carol Nascimento6009SAO PAULO62080504daqr6304AB95';
const WHATSAPP = '5511932298711';

/* ===== Constantes ===== */
const SLOTS = ['09:00','10:00','11:00','14:00','15:00','16:00'];
const SINAL = 30;

/* ===== Utils ===== */
function esc(s){const d=document.createElement('div');d.textContent=s??'';return d.innerHTML;}
function money(n){return (+n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function digits(s){return (s||'').replace(/\D/g,'');}
function keyDate(d){const x=new Date(d);x.setHours(12,0,0,0);return x.toISOString().slice(0,10);}
function br(x,long=false){
  if(!x) return '—';
  return new Date(x+'T12:00:00').toLocaleDateString('pt-BR',
    long?{weekday:'long',day:'2-digit',month:'long'}:{day:'2-digit',month:'2-digit',year:'numeric'});
}
function formatPhoneDisplay(p){
  p=digits(p);
  return p.length>10
    ? p.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3')
    : p.replace(/(\d{2})(\d{0,4})(\d{0,4})/,'($1) $2-$3');
}
function formatPhoneInput(e){
  const n=digits(e.target.value).slice(0,11);
  e.target.value = n.length>10
    ? n.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3')
    : n.replace(/(\d{2})(\d{0,4})(\d{0,4})/,'($1) $2-$3');
}
function waLink(phone,text){
  let p=digits(phone); if(p.length===10||p.length===11) p='55'+p;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
function toast(msg){
  const el=document.getElementById('toast'); if(!el) return;
  el.textContent=msg; el.classList.add('show');
  clearTimeout(window.__tt); window.__tt=setTimeout(()=>el.classList.remove('show'),3200);
}

/* ===== Validação ===== */
const NAME_RE = /^\p{L}[\p{L}\s'’.\-]*$/u;
const DDD_RE = /^(1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])/;
function cleanName(s){return (s||'').replace(/\s+/g,' ').trim();}
function validName(s){
  s=cleanName(s);
  return s.length>=2 && s.length<=80 && NAME_RE.test(s) && (s.match(/\p{L}/gu)||[]).length>=2;
}
/* WhatsApp para agendar: DDD válido + 9 + 8 dígitos (11 dígitos) */
function validPhone(p){ p=digits(p); return /^[1-9]\d9\d{8}$/.test(p) && DDD_RE.test(p); }
/* Consulta: aceita também números antigos de 10 dígitos */
function validPhoneLookup(p){ p=digits(p); return (p.length===10||p.length===11) && DDD_RE.test(p); }
function validHttpsUrl(u){
  try{ const x=new URL(u); return x.protocol==='https:' && x.hostname.includes('.'); }
  catch(e){ return false; }
}
function validEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e||''); }
/* Mostra/limpa a mensagem de erro de um campo (errId = id do <small class="field-error">) */
function setFieldError(input,msg,errId){
  if(!input) return;
  input.classList.toggle('invalid',!!msg);
  if(msg) input.setAttribute('aria-invalid','true'); else input.removeAttribute('aria-invalid');
  const err=document.getElementById(errId);
  if(err){ err.textContent=msg||''; err.hidden=!msg; }
}

/* ===== Dados ===== */
async function loadServices(){
  const snap = await db.collection('servicos').orderBy('id').get();
  if(snap.empty){
    const defaults=[
      {id:1,name:'Manicure simples',description:'Cutilagem e esmaltação',duration:'40 min',price:35,icon:'💅'},
      {id:2,name:'Alongamento em gel',description:'Aplicação e finalização',duration:'1h 30 min',price:90,icon:'✨'},
      {id:3,name:'Pacote mãos + pés',description:'Cuidado completo',duration:'1h 10 min',price:70,icon:'🌸'}
    ];
    for(const s of defaults) await db.collection('servicos').doc(String(s.id)).set(s);
    return defaults;
  }
  return snap.docs.map(d=>d.data());
}

async function isSlotBusy(data, horario){
  const snap = await db.collection('agendamentos')
    .where('data','==',data).where('horario','==',horario)
    .where('status','not-in',['recusado','cancelado']).get();
  return !snap.empty;
}

async function isSlotClosed(data, horario){
  try {
    const doc = await db.collection('disponibilidades').doc(data).get();
    if(!doc.exists) return false;
    const closedList = doc.data().closed || [];
    return closedList.includes(horario);
  } catch (e) {
    console.error("Erro ao checar disponibilidades:", e);
    return false;
  }
}

const GALLERY_FALLBACK = [
  'assets/gallery/01.jpg','assets/gallery/02.jpg','assets/gallery/03.jpg',
  'assets/gallery/04.jpg','assets/gallery/05.jpg','assets/gallery/06.jpg',
  'assets/gallery/07.jpg','assets/gallery/08.jpg' // <-- mais fota
];
async function loadGallery(){
  try{
    const snap = await db.collection('galeria').orderBy('ordem').get();
    if(snap.empty) return GALLERY_FALLBACK.map(u=>({url:u,alt:''}));
    return snap.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){ return GALLERY_FALLBACK.map(u=>({url:u,alt:''})); }
}

/* ===== Nav + reveal + sticky header ===== */
function initCommonUI(){
  const toggle=document.querySelector('.nav-toggle');
  const links=document.querySelector('.nav-links');
  if(toggle&&links){
    toggle.addEventListener('click',()=>{
      const open=links.classList.toggle('open');
      toggle.setAttribute('aria-expanded',open);
    });
  }
  const y=document.getElementById('year'); if(y) y.textContent=new Date().getFullYear();
  const wa=document.getElementById('waLink');
  if(wa){ wa.href=waLink(WHATSAPP,'Olá! Vim pelo site e gostaria de saber mais.'); }

  const header=document.querySelector('.site-header');
  if(header){
    const onScroll=()=>header.classList.toggle('is-scrolled',window.scrollY>8);
    onScroll(); window.addEventListener('scroll',onScroll,{passive:true});
  }

  if('IntersectionObserver' in window){
    const io=new IntersectionObserver(entries=>{
      entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    },{threshold:.12});
    document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));
  }
}
document.addEventListener('DOMContentLoaded',initCommonUI);

/* =========================================
   EFEITO DE TRANSIÇÃO ENTRE PÁGINAS (CORRIGIDO)
   ========================================= */
function initPageTransitions() {
  const transitionEl = document.getElementById('page-transition');
  if (!transitionEl) return;

  const isInternalNav = sessionStorage.getItem('internal_nav');

  if (isInternalNav) {
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.classList.add('page-enter');
    }
    sessionStorage.removeItem('internal_nav');
    transitionEl.style.display = 'none';
  } else {
    transitionEl.classList.add('active');
    window.addEventListener('load', () => {
      setTimeout(() => {
        transitionEl.classList.remove('active');
        transitionEl.classList.add('fade-out');
      }, 600);
    });
  }

  // Voltar/avançar no navegador restaura a página do cache (bfcache) exatamente como estava,
  // com a tela de transição ainda ligada e sem disparar 'load'. Aqui a gente desliga.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    sessionStorage.removeItem('internal_nav');
    transitionEl.classList.remove('active');
    transitionEl.classList.add('fade-out');
  });

  document.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || link.target === '_blank') return;
      e.preventDefault();
      sessionStorage.setItem('internal_nav', 'true');
      transitionEl.style.display = 'flex';
      transitionEl.classList.remove('fade-out');
      transitionEl.classList.add('active');
      setTimeout(() => {
        window.location.href = href;
      }, 600);
    });
  });
}

document.addEventListener('DOMContentLoaded', initPageTransitions);
