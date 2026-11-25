'use strict';

const SINAL = 30;

/* ===== Utils ===== */
function esc(s){
  const d=document.createElement('div');
  d.textContent=s??'';
  return d.innerHTML.replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function money(n){return (+n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function rescheduleCount(appointment) {
  if (appointment.canceladoPor === 'reagendamento') return 1;
  return appointment.origem === 'site-v2' ? 0 : Number(appointment.reagendamentos) || 0;
}
function digits(s){return (s||'').replace(/\D/g,'');}
function keyDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function br(x,long=false){
  if(!x) return '—';
  return new Date(x+'T12:00:00').toLocaleDateString('pt-BR',
    long?{weekday:'long',day:'2-digit',month:'long'}:{day:'2-digit',month:'2-digit',year:'numeric'});
}
function formatPhoneDisplay(p){
  p=normalizeBrazilianPhone(p);
  return p.length>10
    ? p.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3')
    : p.replace(/(\d{2})(\d{0,4})(\d{0,4})/,'($1) $2-$3');
}
function formatPhoneInput(e){
  const n=normalizeBrazilianPhone(e.target.value).slice(0,11);
  if(n.length <= 2){ e.target.value=n; return; }
  const split=n.length>10 ? 7 : 6;
  e.target.value=`(${n.slice(0,2)}) ${n.slice(2,split)}${n.length>split ? '-'+n.slice(split) : ''}`;
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
function normalizeBrazilianPhone(value){
  const phone=digits(value);
  return phone.length===13 && phone.startsWith('55') ? phone.slice(2) : phone;
}
function validPhone(p){
  if(typeof p !== 'string' || !/^\+?[\d()\- .]+$/.test(p.trim())) return false;
  p=normalizeBrazilianPhone(p);
  return /^[1-9]\d9\d{8}$/.test(p) && DDD_RE.test(p);
}
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
  const res = await fetch('/api/booking?action=services', { headers: { Accept: 'application/json' } });
  if(!res.ok) throw new Error('Não foi possível carregar os serviços.');
  return (await res.json()).services;
}

const GALLERY_FALLBACK = [
  'Unhas das mãos compridas com esmalte vermelho brilhante',
  'Unhas dos pés com esmalte rosa-claro e pontas francesinhas',
  'Unhas dos pés com esmalte rosa translúcido',
  'Unhas curtas das mãos com esmalte escuro brilhante',
  'Unhas amendoadas das mãos em rosa-claro com detalhes brancos',
  'Unhas compridas das mãos com esmalte azul brilhante',
  'Unhas amendoadas das mãos em tons de nude e rosa',
  'Unhas dos pés com esmalte preto brilhante'
].map((alt, index) => ({
  url: `assets/gallery/${String(index + 1).padStart(2, '0')}.jpg`, alt
}));
async function loadGallery(){
  let timeout;
  try{
    const snap = await Promise.race([
      db.collection('galeria').orderBy('ordem').get(),
      new Promise(resolve => { timeout = setTimeout(() => resolve(null), 3000); })
    ]);
    if (!snap) return GALLERY_FALLBACK;
    const photos = snap.docs.flatMap((d, index) => {
      const photo = d.data();
      const url = typeof photo.url === 'string' ? photo.url.trim() : '';
      if (!/^assets\/gallery\/\d{2}\.jpg$/.test(url) && !validHttpsUrl(url)) return [];
      const fallback = GALLERY_FALLBACK.find(item => item.url === url)?.alt;
      const alt = (typeof photo.alt === 'string' && photo.alt.trim()) || fallback || `Trabalho do estúdio, foto ${index + 1}`;
      return [{ url, alt }];
    });
    return photos.length ? photos : GALLERY_FALLBACK;
  }catch{ return GALLERY_FALLBACK; }
  finally { clearTimeout(timeout); }
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
  for (const link of document.querySelectorAll('#waLink, [data-studio-contact]')) {
    if (studioConfig.whatsapp) {
      link.href = waLink(studioConfig.whatsapp, 'Olá! Vim pelo site e gostaria de saber mais.');
    } else if (link.id === 'waLink') {
      link.href = 'sobre.html#contato';
      link.removeAttribute('target');
      link.textContent = 'Contato';
    } else {
      link.hidden = true;
    }
  }

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
