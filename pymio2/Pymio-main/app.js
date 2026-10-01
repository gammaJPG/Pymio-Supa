import { revealView } from './motion.js';
import { setupPymium } from './pymium.js';
setupPymium();
import { iniciarEcosistema } from './ecosistema.js';
import { apiBase, setupOfflineUI, startOffline, stopOffline } from './offline.js';
setupOfflineUI();
import { configureDashboard, renderDashboard, renderInicio } from './dashboard.js?v=44';
import { renderAlerts } from './diagnostico.js';
import { iniciarMovimientos } from './movimientos.js';

const apiUrl=apiBase;
const browserFetch=window.fetch.bind(window);
window.fetch=(input,options={})=>browserFetch(input,{...options,credentials:'include'});
let currentSession=null;

// Inserta las vistas antes de iniciar sus controladores. Conserva el DOM al volver a entrar.
let seccionesCargadas = false;
async function cargarSecciones() {
  if (seccionesCargadas) return;
  const vistas = await Promise.all(['inicio', 'dashboard', 'movimientos', 'inventario', 'diagnostico', 'ecosistema'].map(async nombre => {
    const respuesta = await fetch(new URL(nombre + '.html', import.meta.url));
    if (!respuesta.ok) throw new Error(nombre + ': HTTP ' + respuesta.status);
    return { nombre, html: await respuesta.text() };
  }));
  for (const vista of vistas) {
    document.querySelector('[data-section="' + vista.nombre + '"]').outerHTML = vista.html;
  }
  document.querySelectorAll('.filter-menu').forEach(menu => {
    const button = menu.querySelector('[data-filter-toggle]');
    const options = menu.querySelector('.filter-options');
    const close = () => { options.hidden = true; button.setAttribute('aria-expanded', 'false'); };
    button.addEventListener('click', () => {
      options.hidden = !options.hidden;
      button.setAttribute('aria-expanded', String(!options.hidden));
    });
    document.addEventListener('click', event => { if (!menu.contains(event.target)) close(); });
    menu.addEventListener('keydown', event => { if (event.key === 'Escape') { close(); button.focus(); } });
  });
  seccionesCargadas = true;
}


  
  // ---------- DATOS FICTICIOS ----------

  const notifData = [
    {sev:'critical', title:'Margen en descenso', desc:'La categoría Hogar bajó su margen a 19% este mes.', time:'Hace 2 horas'},
    {sev:'warn', title:'Stock bajo', desc:'"Organizador modular x6" quedó con solo 4 unidades.', time:'Hace 5 horas'},
  ];

  // ---------- ACCESO Y CUENTAS ----------
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  loginForm.reset();
  ['username','password','business-name','owner-name'].forEach(id=>document.getElementById(id).value='');
  let authMode='login';
  document.querySelectorAll('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>{
    if(authMode!==button.dataset.authMode){loginForm.reset();['username','password','business-name','owner-name'].forEach(id=>document.getElementById(id).value='');}
    authMode=button.dataset.authMode;
    document.querySelectorAll('[data-auth-mode]').forEach(option=>{const active=option===button;option.classList.toggle('active',active);option.setAttribute('aria-selected',String(active));});
    document.querySelectorAll('.signup-field').forEach(field=>field.hidden=authMode!=='register');
    document.getElementById('business-name').required=authMode==='register';
    document.getElementById('username-label').textContent=authMode==='register'?'Correo electrónico':'Correo o usuario';
    document.getElementById('username').placeholder=authMode==='register'?'tu@empresa.cl':'correo@empresa.cl o pilotodepruebas';
    document.getElementById('username').autocomplete=authMode==='register'?'email':'username';
    document.getElementById('password').autocomplete=authMode==='register'?'new-password':'current-password';
    document.querySelector('[data-auth-submit]').textContent=authMode==='register'?'Crear mi espacio':'Entrar a Pymio';
    document.getElementById('auth-title').innerHTML=authMode==='register'?'Tu negocio,<br>en un espacio propio.':'Todo comienza<br>con una buena mirada.';
    document.getElementById('auth-description').textContent=authMode==='register'?'Crea una cuenta y empieza con un espacio limpio para tu pyme.':'Entra a Pymio y encuentra lo importante de tu negocio.';
    loginError.style.display='none';
  }));

  async function enterApp(session){
    currentSession=session;
    await cargarSecciones();
    await configureDashboard({companyId:session.companyId,demo:session.demo,apiUrl});
    const business=session.businessName||'Mi negocio', role=session.demo?'Cuenta piloto':'Cuenta personal';
    const initials=business.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase()||'PY';
    document.getElementById('sidebar-account-type').textContent=role;
    document.getElementById('sidebar-business-name').textContent=business;
    document.getElementById('workspace-mode').textContent=session.demo?'Vista piloto':'Espacio de trabajo';
    document.getElementById('account-avatar').textContent=initials;
    document.getElementById('account-name').textContent=business;
    document.getElementById('account-role').textContent=role;
    document.querySelector('[data-first-steps]').hidden=session.demo;
    document.getElementById('preview-mode-label').textContent=session.demo?'Vista previa · Datos de demostración':'Tus datos · Actualizados desde tu espacio';
    document.querySelector('.period-note small').textContent=session.demo?'Datos de demostración':'Datos de tu empresa';
    document.querySelector('.dash-filters .sub').textContent=session.demo?'Datos de demostración':'Información de tu espacio';
    if(!session.demo){
      const insight=document.querySelector('.insight-card');insight.querySelector('h3').innerHTML='Tus próximas señales<br>aparecerán aquí.';insight.querySelector('p').textContent='Registra ventas, compras y costos para que Pymio encuentre oportunidades en tu operación.';insight.querySelector('.insight-foot').textContent='Análisis pendiente · Aún no hay datos suficientes';
      document.querySelector('.diagnostic-summary [data-alert-count]').textContent='0';document.querySelector('.diagnostic-summary p').textContent='Tus datos · Análisis pendiente';document.querySelector('.diagnostic-summary .diagnostic-label').textContent='Sin alertas';
      const diagnosisLink=[...document.querySelectorAll('.home-feature-list small')].find(element=>element.textContent.includes('diagnóstico'));if(diagnosisLink)diagnosisLink.textContent='Encuentra señales cuando tu operación tenga datos suficientes.';
    }
    startOffline(session.companyId);
    iniciarMovimientos({companyId:session.companyId});
    document.getElementById('login-screen').style.display='none';document.getElementById('app-screen').style.display='block';
    document.querySelector('.skip-link').href='#main-content';initApp();navigateTo('inicio');revealView(document.querySelector('.tab-panel.active'),{first:true});
    import('./inventario.js').then(({iniciarInventario})=>iniciarInventario({companyId:session.companyId})).catch(error=>{
      console.error('No se pudo iniciar el inventario:',error);const tabla=document.getElementById('inv-table');tabla.replaceChildren();const celda=tabla.insertRow().insertCell();celda.colSpan=10;celda.textContent='No se pudo iniciar el inventario. Recarga la página e inténtalo nuevamente.';
    });
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit=loginForm.querySelector('[type="submit"]');submit.disabled=true;submit.setAttribute('aria-busy','true');loginError.style.display='none';
    const identifier=document.getElementById('username').value.trim(),password=document.getElementById('password').value;
    const body=authMode==='register'?{email:identifier,password,businessName:document.getElementById('business-name').value.trim(),ownerName:document.getElementById('owner-name').value.trim()}:{identifier,password};
    try { const response=await fetch(apiUrl+'/api/auth/'+authMode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo completar el acceso.');await enterApp(result.session); }
    catch(error){loginError.textContent=error.message;loginError.style.display='block';}
    finally{submit.disabled=false;submit.removeAttribute('aria-busy');}
  });



  document.getElementById('logout-btn').addEventListener('click', async () => {stopOffline();await fetch(apiUrl+'/api/auth/logout',{method:'POST'}).catch(()=>{});location.reload();});

  // ---------- NAV TABS ----------
  const tabTitles = {inicio:'Inicio', dashboard:'Dashboard', diagnostico:'Diagnóstico', movimientos:'Movimientos', inventario:'Inventario', ecosistema:'RED Pymio'};
  function navigateTo(name, keyboard = false, focus = false) {
    const panel = document.getElementById('tab-' + name);
    if (!panel) return;
    if (name === 'inicio') renderInicio();
    const changed = !panel.classList.contains('active');
    document.querySelectorAll('.nav-item').forEach(button => {
      const selected = button.dataset.tab === name;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('.tab-panel').forEach(view => view.classList.toggle('active', view === panel));
    document.getElementById('page-title').textContent = tabTitles[name];
    if (changed) {
      document.querySelector('.content').scrollTo({top:0, behavior:'instant'});
      revealView(panel, {keyboard});
    }
    if (focus) {
      panel.tabIndex = -1;
      panel.focus({preventScroll:true});
    }
  }
  document.querySelectorAll('.nav-item').forEach(button => {
    button.setAttribute('aria-label', button.textContent.trim());
    button.title = button.textContent.trim();
    if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', event => navigateTo(button.dataset.tab, event.detail === 0));
  });
  document.querySelector('.sidebar-home').addEventListener('click', event => navigateTo('inicio', event.detail === 0, true));
  document.querySelector('.content').addEventListener('click', event => {
    const movement = event.target.closest('[data-start-movement]');
    if (movement) {
      navigateTo('movimientos', event.detail === 0);
      document.querySelector(movement.dataset.startMovement === 'sale' ? '[data-sale-add]' : '[data-purchase-add]').click();
      return;
    }
    const button = event.target.closest('[data-go-tab]');
    if (button) navigateTo(button.dataset.goTab, event.detail === 0, true);
  });

  // ---------- NOTIFICATIONS ----------
  const bellBtn = document.getElementById('bell-btn');
  const notifPanel = document.getElementById('notif-panel');
  const notifBadge = document.getElementById('notif-badge');
  let unread = notifData.length;
  bellBtn.setAttribute('aria-expanded', 'false');
  bellBtn.setAttribute('aria-controls', 'notif-panel');

  function renderNotifications(){
    const list = document.getElementById('notif-list');
    const visible=currentSession?.demo?notifData:[];
    list.innerHTML = visible.length?visible.map((n, i) => `
      <div class="notif-item ${i >= unread ? 'read' : ''}">
        <div class="dot ${n.sev}"></div>
        <div>
          <div class="n-title">${n.title}</div>
          <div class="n-desc">${n.desc}</div>
          <div class="n-time">${n.time}</div>
        </div>
      </div>
    `).join(''):'<div class="notif-empty">Aún no tienes notificaciones.</div>';
    notifBadge.style.display = unread > 0 && visible.length ? 'flex' : 'none';
    notifBadge.textContent = unread;
  }

  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notifPanel.classList.toggle('open');
    bellBtn.setAttribute('aria-expanded', String(notifPanel.classList.contains('open')));
  });
  document.addEventListener('click', (e) => {
    if(!notifPanel.contains(e.target) && e.target !== bellBtn){
      notifPanel.classList.remove('open');
      bellBtn.setAttribute('aria-expanded', 'false');
    }
  });
  document.getElementById('mark-read-btn').addEventListener('click', () => {
    unread = 0;
    renderNotifications();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && notifPanel.classList.contains('open')) {
      notifPanel.classList.remove('open');
      bellBtn.setAttribute('aria-expanded', 'false');
      bellBtn.focus();
    }
  });

  // ---------- INIT ----------
  function initApp(){
    iniciarEcosistema();
    renderDashboard();
    renderInicio();
    renderAlerts({demo:currentSession?.demo});

    unread=currentSession?.demo?notifData.length:0;
    renderNotifications();
  }

  fetch(apiUrl+'/api/auth/session').then(async response=>{if(response.ok){const result=await response.json();await enterApp(result.session);}}).catch(()=>{});
