import { revealView } from './motion.js';
import { setupPymium } from './pymium.js';
setupPymium();
import { iniciarEcosistema, mostrarVistaEcosistema } from './ecosistema.js?v=97';
import { apiBase, setupOfflineUI, startOffline, stopOffline, getSyncIssues, discardSyncIssue } from './offline.js';
setupOfflineUI();
import { configureDashboard, renderDashboard, renderInicio } from './dashboard.js?v=50';
import { renderAlerts } from './diagnostico.js';
import { iniciarMovimientos } from './movimientos.js';

const apiUrl=apiBase;
const browserFetch=window.fetch.bind(window);
window.fetch=(input,options={})=>browserFetch(input,{...options,credentials:'include'});
let currentSession=null;
let businessViewsRefresh=null;
const validTabs=new Set(['inicio','dashboard','movimientos','inventario','diagnostico','ecosistema']);

function refreshBusinessViews(){
  if(!currentSession || currentSession.demo)return Promise.resolve();
  if(businessViewsRefresh)return businessViewsRefresh;
  businessViewsRefresh=configureDashboard({companyId:currentSession.companyId,demo:false,apiUrl})
    .then(()=>{renderDashboard();renderInicio();})
    .catch(error=>console.error('No se pudieron actualizar los indicadores:',error))
    .finally(()=>{businessViewsRefresh=null;});
  return businessViewsRefresh;
}
document.addEventListener('inventario-actualizado',refreshBusinessViews);
document.addEventListener('movimientos-sincronizados',refreshBusinessViews);

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
    const positionOptions = () => {
      if (options.hidden) return;
      const margin = 12;
      options.style.left = '0px';
      options.style.right = 'auto';
      options.style.top = 'calc(100% + 6px)';
      options.style.bottom = 'auto';
      options.style.maxHeight = '';
      const buttonRect = button.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const popupWidth = options.getBoundingClientRect().width;
      const maximumLeft = Math.max(margin, window.innerWidth - margin - popupWidth);
      const desiredLeft = Math.min(Math.max(menuRect.left, margin), maximumLeft);
      options.style.left = `${desiredLeft - menuRect.left}px`;
      const gap = 6;
      const roomBelow = Math.max(0, window.innerHeight - buttonRect.bottom - margin - gap);
      const roomAbove = Math.max(0, buttonRect.top - margin - gap);
      const openAbove = roomBelow < Math.min(options.scrollHeight, 260) && roomAbove > roomBelow;
      if (openAbove) {
        options.style.top = 'auto';
        options.style.bottom = 'calc(100% + 6px)';
      }
      options.style.maxHeight = `${Math.max(0, openAbove ? roomAbove : roomBelow)}px`;
    };
    button.addEventListener('click', () => {
      options.hidden = !options.hidden;
      button.setAttribute('aria-expanded', String(!options.hidden));
      positionOptions();
    });
    window.addEventListener('resize', positionOptions);
    document.addEventListener('click', event => { if (!menu.contains(event.target)) close(); });
    menu.addEventListener('keydown', event => { if (event.key === 'Escape') { close(); button.focus(); } });
  });
  seccionesCargadas = true;
}


  
  // ---------- DATOS FICTICIOS ----------

  const notifData = [
    {id:'demo-margin',sev:'critical', title:'Margen en descenso', desc:'La categoría Hogar bajó su margen a 19% este mes.', time:'Hace 2 horas'},
    {id:'demo-stock',sev:'warn', title:'Stock bajo', desc:'"Organizador modular x6" quedó con solo 4 unidades.', time:'Hace 5 horas'},
  ];
  let syncNotifications=[];
  let inventoryNotifications=[];
  const readNotificationIds=new Set();

  function inventoryNotificationKey(){return `pymio:inventory-notifications:${currentSession?.companyId||'unknown'}`;}
  function readNotificationKey(){return `pymio:read-notifications:${currentSession?.companyId||'unknown'}`;}
  function loadInventoryNotifications(){
    if(currentSession?.demo){inventoryNotifications=[];return;}
    try{
      const saved=JSON.parse(localStorage.getItem(inventoryNotificationKey())||'[]');
      inventoryNotifications=Array.isArray(saved)?saved.slice(0,25):[];
    }catch{inventoryNotifications=[];}
  }
  function loadReadNotifications(){
    readNotificationIds.clear();
    try{
      const saved=JSON.parse(localStorage.getItem(readNotificationKey())||'[]');
      if(Array.isArray(saved))saved.forEach(id=>readNotificationIds.add(String(id)));
    }catch{}
  }
  function saveInventoryNotifications(){
    if(currentSession?.demo)return;
    try{localStorage.setItem(inventoryNotificationKey(),JSON.stringify(inventoryNotifications.slice(0,25)));}catch{}
  }
  function saveReadNotifications(){
    try{localStorage.setItem(readNotificationKey(),JSON.stringify([...readNotificationIds].slice(-100)));}catch{}
  }

  // ---------- ACCESO Y CUENTAS ----------
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const googleAuth=document.getElementById('google-auth'),googleStatus=document.getElementById('google-auth-status');
  const authSwitch=document.getElementById('auth-switch'),authDivider=document.getElementById('auth-divider'),loginHint=document.getElementById('login-hint');
  const googleAccount=document.getElementById('google-account'),googleSetupCancel=document.getElementById('google-setup-cancel');
  const credentialFields=[...document.querySelectorAll('.credential-field')],username=document.getElementById('username'),password=document.getElementById('password');
  const businessName=document.getElementById('business-name'),ownerName=document.getElementById('owner-name');
  loginForm.reset();
  ['username','password','business-name','owner-name'].forEach(id=>document.getElementById(id).value='');
  let authMode='login';
  const authUrl=new URL(location.href),authError=authUrl.searchParams.get('auth_error'),googleSetupRequested=authUrl.searchParams.get('google_setup')==='1';
  if(authError){loginError.textContent=authError;loginError.style.display='block';const clean=new URL(location.href);clean.searchParams.delete('auth_error');history.replaceState(null,'',clean);}
  const googleButtonLabel=googleAuth.querySelector('span');
  async function googleProviderEnabled(){
    const response=await fetch(apiUrl+'/api/auth/providers',{cache:'no-store'});
    if(!response.ok)throw new Error('No se pudo comprobar el acceso con Google.');
    return Boolean((await response.json()).google);
  }
  googleAuth.onclick=async()=>{
    if(googleAuth.dataset.loading==='true')return;
    googleAuth.dataset.loading='true';googleAuth.disabled=true;googleAuth.setAttribute('aria-busy','true');googleButtonLabel.textContent='Abriendo Google…';
    googleStatus.hidden=true;loginError.style.display='none';
    try{
      if(!await googleProviderEnabled())throw new Error('El acceso con Google aún no está habilitado. Inténtalo nuevamente en unos segundos.');
      const returnTo=new URL('piloto.html',location.href);
      location.assign(apiUrl+'/api/auth/google/start?return_to='+encodeURIComponent(returnTo.href));
    }catch(error){
      googleStatus.textContent=error.message||'No pudimos abrir el acceso con Google. Revisa tu conexión e inténtalo nuevamente.';
      googleStatus.hidden=false;googleAuth.disabled=false;googleAuth.removeAttribute('aria-busy');googleAuth.dataset.loading='false';googleButtonLabel.textContent='Continuar con Google';
    }
  };
  googleProviderEnabled().then(enabled=>{
    if(authMode==='google-setup')return;
    googleStatus.hidden=enabled;
    googleStatus.textContent=enabled?'':'El acceso con Google todavía no está disponible. Puedes volver a intentarlo desde este botón.';
  }).catch(()=>{if(authMode==='google-setup')return;googleStatus.hidden=true;});
  function setAuthMode(mode,setup={}){
    authMode=mode;const isRegister=mode==='register',isGoogleSetup=mode==='google-setup';
    document.querySelectorAll('[data-auth-mode]').forEach(option=>{const active=option.dataset.authMode===mode;option.classList.toggle('active',active);option.setAttribute('aria-selected',String(active));});
    document.querySelectorAll('.signup-field').forEach(field=>field.hidden=!(isRegister||isGoogleSetup));
    credentialFields.forEach(field=>field.hidden=isGoogleSetup);authSwitch.hidden=isGoogleSetup;authDivider.hidden=isGoogleSetup;googleAuth.hidden=isGoogleSetup;googleStatus.hidden=isGoogleSetup||googleStatus.hidden;loginHint.hidden=isGoogleSetup;
    googleAccount.hidden=!isGoogleSetup;googleSetupCancel.hidden=!isGoogleSetup;
    businessName.required=isRegister||isGoogleSetup;username.required=!isGoogleSetup;password.required=!isGoogleSetup;
    document.getElementById('username-label').textContent=isRegister?'Correo electrónico':'Correo o usuario';username.placeholder=isRegister?'tu@empresa.cl':'correo@empresa.cl o pilotodepruebas';username.autocomplete=isRegister?'email':'username';password.autocomplete=isRegister?'new-password':'current-password';
    document.querySelector('[data-auth-submit]').textContent=isGoogleSetup?'Guardar y continuar':isRegister?'Crear mi espacio':'Entrar a Pymio';
    document.getElementById('auth-title').innerHTML=isGoogleSetup?'Cuéntanos sobre<br>tu negocio.':isRegister?'Tu negocio,<br>en un espacio propio.':'Todo comienza<br>con una buena mirada.';
    document.getElementById('auth-description').textContent=isGoogleSetup?'Personaliza el espacio que usarás en Pymio.':isRegister?'Crea una cuenta y empieza con un espacio limpio para tu pyme.':'Entra a Pymio y encuentra lo importante de tu negocio.';
    if(isGoogleSetup){businessName.value=setup.businessName||'';ownerName.value=setup.ownerName||'';googleAccount.textContent='Cuenta de Google: '+setup.email;}
    loginError.style.display='none';
  }
  document.querySelectorAll('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>{
    if(authMode!==button.dataset.authMode){loginForm.reset();['username','password','business-name','owner-name'].forEach(id=>document.getElementById(id).value='');}
    setAuthMode(button.dataset.authMode);
  }));
  googleSetupCancel.onclick=()=>{const clean=new URL(location.href);clean.searchParams.delete('google_setup');history.replaceState(null,'',clean);loginForm.reset();setAuthMode('login');};

  async function enterApp(session){
    currentSession=session;
    loadInventoryNotifications();
    loadReadNotifications();
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
    const storedTab=sessionStorage.getItem('pymio:last-tab');const destination=validTabs.has(storedTab)?storedTab:'inicio';
    document.querySelector('.skip-link').href='#main-content';initApp();navigateTo(destination);revealView(document.querySelector('.tab-panel.active'),{first:true});
    import('./inventario.js').then(({iniciarInventario})=>iniciarInventario({companyId:session.companyId})).catch(error=>{
      console.error('No se pudo iniciar el inventario:',error);const tabla=document.getElementById('inv-table');tabla.replaceChildren();const celda=tabla.insertRow().insertCell();celda.colSpan=10;celda.textContent='No se pudo iniciar el inventario. Recarga la página e inténtalo nuevamente.';
    });
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit=loginForm.querySelector('[type="submit"]');submit.disabled=true;submit.setAttribute('aria-busy','true');loginError.style.display='none';
    const identifier=username.value.trim(),passwordValue=password.value;
    const profile={businessName:businessName.value.trim(),ownerName:ownerName.value.trim()};
    const body=authMode==='google-setup'?profile:authMode==='register'?{email:identifier,password:passwordValue,...profile}:{identifier,password:passwordValue};
    const endpoint=authMode==='google-setup'?'google/complete':authMode;
    try { const response=await fetch(apiUrl+'/api/auth/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo completar el acceso.');if(authMode==='google-setup'){const clean=new URL(location.href);clean.searchParams.delete('google_setup');history.replaceState(null,'',clean);}await enterApp(result.session); }
    catch(error){loginError.textContent=error.message;loginError.style.display='block';}
    finally{submit.disabled=false;submit.removeAttribute('aria-busy');}
  });



  document.getElementById('logout-btn').addEventListener('click', async () => {stopOffline();sessionStorage.removeItem('pymio:last-tab');await fetch(apiUrl+'/api/auth/logout',{method:'POST'}).catch(()=>{});location.reload();});

  // ---------- NAV TABS ----------
  const tabTitles = {inicio:'Inicio', dashboard:'Dashboard', diagnostico:'Diagnóstico', movimientos:'Movimientos', inventario:'Inventario', ecosistema:'RED Pymio'};
  function navigateTo(name, keyboard = false, focus = false) {
    const panel = document.getElementById('tab-' + name);
    if (!panel) return;
    sessionStorage.setItem('pymio:last-tab',name);
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
    button.addEventListener('click', event => {
      navigateTo(button.dataset.tab, event.detail === 0);
      if(button.dataset.tab==='ecosistema'){
        const menu=document.querySelector('.network-nav-menu'),open=menu.hidden;
        menu.hidden=!open;button.setAttribute('aria-expanded',String(open));
        if(open)requestAnimationFrame(()=>requestAnimationFrame(()=>{
          const nav=menu.closest('.nav');
          if(nav)nav.scrollTo({top:nav.scrollHeight,behavior:'smooth'});
        }));
        mostrarVistaEcosistema('overview',{keyboard:event.detail===0});
      }
    });
  });
  document.querySelectorAll('.network-nav-menu [data-network-view]').forEach(button=>button.addEventListener('click',event=>{
    navigateTo('ecosistema',event.detail===0);
    mostrarVistaEcosistema(button.dataset.networkView,{keyboard:event.detail===0});
  }));
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
  bellBtn.setAttribute('aria-expanded', 'false');
  bellBtn.setAttribute('aria-controls', 'notif-panel');

  function renderNotifications(){
    const list = document.getElementById('notif-list');
    const visible=[...inventoryNotifications,...(currentSession?.demo?notifData:[]),...syncNotifications];
    list.replaceChildren();
    if(!visible.length){const empty=document.createElement('div');empty.className='notif-empty';empty.textContent='Aún no tienes notificaciones.';list.append(empty);}
    for(const notification of visible){
      const item=document.createElement('div');item.className='notif-item';
      if(readNotificationIds.has(notification.id))item.classList.add('read');
      const dot=document.createElement('div');dot.className=`dot ${notification.sev}`;
      const content=document.createElement('div'),title=document.createElement('div'),description=document.createElement('div'),time=document.createElement('div');
      title.className='n-title';description.className='n-desc';time.className='n-time';
      title.textContent=notification.title;description.textContent=notification.desc;time.textContent=notification.time;
      content.append(title,description,time);
      if(notification.issueId){
        const action=document.createElement('button');action.type='button';action.className='notif-action';action.textContent='Descartar intento';
        action.onclick=async()=>{if(!confirm('Este movimiento fue rechazado y no se aplicó al inventario. ¿Quieres descartarlo de las notificaciones?'))return;action.disabled=true;await discardSyncIssue(notification.issueId);};
        content.append(action);
      }
      item.append(dot,content);list.append(item);
    }
    const unread=visible.filter(notification=>!readNotificationIds.has(notification.id)).length;
    notifBadge.style.display = unread ? 'flex' : 'none';
    notifBadge.textContent = unread;
  }
  async function refreshSyncNotifications(){
    try { syncNotifications=(await getSyncIssues()).map(issue=>({id:'sync-'+issue.id,issueId:issue.id,sev:issue.severity,title:issue.title,desc:issue.description,time:issue.time})); }
    catch { syncNotifications=[]; }
    renderNotifications();
  }
  window.addEventListener('swc-offline-change',refreshSyncNotifications);
  document.addEventListener('producto-guardado',event=>{
    if(currentSession?.demo)return;
    const detail=event.detail||{},created=detail.action==='created';
    const name=String(detail.name||'Producto').trim(),sku=String(detail.sku||'').trim();
    inventoryNotifications.unshift({
      id:`inventory-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      sev:'info',
      title:created?'Producto creado':'Producto actualizado',
      desc:`${name}${sku?` · ${sku}`:''}`,
      time:new Date().toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'})
    });
    inventoryNotifications=inventoryNotifications.slice(0,25);
    saveInventoryNotifications();
    renderNotifications();
  });

  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notifPanel.classList.toggle('open');
    const opened=notifPanel.classList.contains('open');
    bellBtn.setAttribute('aria-expanded', String(opened));
    if(opened){
      for(const notification of [...inventoryNotifications,...(currentSession?.demo?notifData:[]),...syncNotifications])readNotificationIds.add(notification.id);
      saveReadNotifications();
      renderNotifications();
    }
  });
  document.addEventListener('click', (e) => {
    if(!notifPanel.contains(e.target) && e.target !== bellBtn){
      notifPanel.classList.remove('open');
      bellBtn.setAttribute('aria-expanded', 'false');
    }
  });
  document.getElementById('mark-read-btn').addEventListener('click', () => {
    for(const notification of [...inventoryNotifications,...(currentSession?.demo?notifData:[]),...syncNotifications])readNotificationIds.add(notification.id);
    saveReadNotifications();
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
    iniciarEcosistema({session:currentSession,apiUrl});
    renderDashboard();
    renderInicio();
    renderAlerts({demo:currentSession?.demo});

    renderNotifications();
    refreshSyncNotifications();
  }

  async function initializeAuth(){
    try{
      if(googleSetupRequested){
        const response=await fetch(apiUrl+'/api/auth/google/setup',{cache:'no-store'}),setup=await response.json();
        if(!response.ok)throw new Error(setup.error||'No pudimos preparar tu cuenta de Google.');
        setAuthMode('google-setup',setup);document.getElementById('login-screen').style.display='flex';businessName.focus();return;
      }
      const response=await fetch(apiUrl+'/api/auth/session');
      if(response.ok){const result=await response.json();await enterApp(result.session);return;}
      document.getElementById('login-screen').style.display='flex';
    }catch(error){document.getElementById('login-screen').style.display='flex';loginError.textContent=error.message;loginError.style.display='block';setAuthMode('login');}
    finally{document.documentElement.classList.remove('auth-pending');}
  }
  initializeAuth();
