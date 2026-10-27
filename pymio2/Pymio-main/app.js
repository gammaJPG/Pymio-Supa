import { revealView } from './motion.js';
import { setupPymium } from './pymium.js';
setupPymium();
import { iniciarEcosistema, mostrarVistaEcosistema } from './ecosistema.js?v=182';
import { apiBase, setupOfflineUI, startOffline, stopOffline, getSyncIssues, discardSyncIssue } from './offline.js';
setupOfflineUI();
import { configureDashboard, renderDashboard, renderInicio } from './dashboard.js?v=153';
import { configureDiagnostics, refreshDiagnosticAlerts } from './diagnostico.js';
import { iniciarMovimientos } from './movimientos.js?v=164';
import { configureSupport } from './centro-ayuda.js';
import { startLiveSync, stopLiveSync } from './live-sync.js';
import { setupInstallPrompt } from './install-prompt.js?v=199';

const bootStartedAt=performance.now();

async function finishBootScreen(){
  const bootScreen=document.getElementById('boot-screen');
  if(!bootScreen){document.documentElement.classList.remove('auth-pending');return;}
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobileLayout=window.matchMedia('(max-width: 767px), (max-width: 950px) and (max-height: 500px)').matches;
  const minimumVisibleTime=reducedMotion?220:(mobileLayout?1400:1550);
  const remaining=Math.max(0,minimumVisibleTime-(performance.now()-bootStartedAt));
  if(remaining)await new Promise(resolve=>window.setTimeout(resolve,remaining));
  bootScreen.classList.add('is-leaving');
  if(!reducedMotion)await new Promise(resolve=>window.setTimeout(resolve,180));
  document.documentElement.classList.remove('auth-pending');
  bootScreen.classList.remove('is-leaving');
}

// La instalación debe estar disponible también antes de iniciar sesión. Chrome
// solo ofrece el prompt cuando el service worker ya está preparado para este
// origen, por lo que no puede depender de la sesión de la empresa.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js?v=201').catch(error => {
    console.warn('No se pudo preparar la instalación de Pymio:', error);
  });
}
setupInstallPrompt();

const apiUrl=apiBase;
const browserFetch=window.fetch.bind(window);
window.fetch=(input,options={})=>browserFetch(input,{...options,credentials:'include'});
let currentSession=null;
let businessViewsRefresh=null;
const validTabs=new Set(['inicio','dashboard','movimientos','inventario','diagnostico','ecosistema','ayuda']);

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
document.addEventListener('pymio-live-business',()=>{
  document.dispatchEvent(new Event('inventario-actualizado'));
  document.dispatchEvent(new Event('movimientos-sincronizados'));
  document.dispatchEvent(new Event('pymio-support-refresh'));
});

// Inserta las vistas antes de iniciar sus controladores. Conserva el DOM al volver a entrar.
let seccionesCargadas = false;
async function cargarSecciones() {
  if (seccionesCargadas) return;
  const vistas = await Promise.all(['inicio', 'dashboard', 'movimientos', 'inventario', 'diagnostico', 'ecosistema', 'centro-ayuda'].map(async nombre => {
    const respuesta = await fetch(new URL(nombre + '.html?v=136', import.meta.url));
    if (!respuesta.ok) throw new Error(nombre + ': HTTP ' + respuesta.status);
    return { nombre, html: await respuesta.text() };
  }));
  for (const vista of vistas) {
    const sectionName=vista.nombre==='centro-ayuda'?'ayuda':vista.nombre;
    document.querySelector('[data-section="' + sectionName + '"]').outerHTML = vista.html;
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
  let diagnosticNotifications=[];
  let syncNotifications=[];
  let activityNotifications=[];
  let networkNotifications=[],networkNotificationsLoading=false,networkNotificationsTimer=null;
  const readNotificationIds=new Set();

  function activityNotificationKey(){return `pymio:activity-notifications:${currentSession?.companyId||'unknown'}`;}
  function legacyInventoryNotificationKey(){return `pymio:inventory-notifications:${currentSession?.companyId||'unknown'}`;}
  function readNotificationKey(){return `pymio:read-notifications:${currentSession?.companyId||'unknown'}`;}
  function loadInventoryNotifications(){
    if(currentSession?.demo){activityNotifications=[];return;}
    try{
      const raw=localStorage.getItem(activityNotificationKey())||localStorage.getItem(legacyInventoryNotificationKey())||'[]';
      const saved=JSON.parse(raw);
      activityNotifications=Array.isArray(saved)?saved.slice(0,40):[];
    }catch{activityNotifications=[];}
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
    try{localStorage.setItem(activityNotificationKey(),JSON.stringify(activityNotifications.slice(0,40)));}catch{}
  }
  function saveReadNotifications(){
    try{localStorage.setItem(readNotificationKey(),JSON.stringify([...readNotificationIds].slice(-100)));}catch{}
  }

  // ---------- ACCESO Y CUENTAS ----------
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const accessErrorMessage=error=>/failed to fetch|networkerror|load failed/i.test(String(error?.message||''))
    ? 'No pudimos conectar con Pymio. Comprueba que el servidor esté activo e inténtalo nuevamente.'
    : error?.message||'No se pudo completar el acceso. Inténtalo nuevamente.';
  const googleAuth=document.getElementById('google-auth'),googleStatus=document.getElementById('google-auth-status');
  const authSwitch=document.getElementById('auth-switch'),authDivider=document.getElementById('auth-divider'),loginHint=document.getElementById('login-hint');
  const googleAccount=document.getElementById('google-account'),googleSetupCancel=document.getElementById('google-setup-cancel');
  const credentialFields=[...document.querySelectorAll('.credential-field')],username=document.getElementById('username'),password=document.getElementById('password');
  const passwordToggle=document.getElementById('password-toggle');
  function setPasswordVisibility(visible){
    password.type=visible?'text':'password';passwordToggle.setAttribute('aria-pressed',String(visible));
    const label=visible?'Ocultar contraseña':'Mostrar contraseña';passwordToggle.setAttribute('aria-label',label);passwordToggle.title=label;
  }
  passwordToggle.addEventListener('click',()=>setPasswordVisibility(password.type==='password'));
  const businessName=document.getElementById('business-name'),ownerName=document.getElementById('owner-name');
  const ownerNameField=ownerName.closest('.field');
  loginForm.reset();
  ['username','password','business-name','owner-name'].forEach(id=>document.getElementById(id).value='');
  let authMode='login',googleNeedsPassword=false;
  const authUrl=new URL(location.href),authError=authUrl.searchParams.get('auth_error');
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
      googleStatus.textContent=accessErrorMessage(error);
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
    googleNeedsPassword=isGoogleSetup&&setup.needsPassword===true;
    document.querySelectorAll('[data-auth-mode]').forEach(option=>{const active=option.dataset.authMode===mode;option.classList.toggle('active',active);option.setAttribute('aria-selected',String(active));});
    document.querySelectorAll('.signup-field').forEach(field=>field.hidden=!(isRegister||isGoogleSetup));
    ownerNameField.hidden=isGoogleSetup||!(isRegister||isGoogleSetup);
    credentialFields.forEach((field,index)=>field.hidden=isGoogleSetup&&(index===0||!googleNeedsPassword));authSwitch.hidden=isGoogleSetup;authDivider.hidden=isGoogleSetup;googleAuth.hidden=isGoogleSetup;googleStatus.hidden=isGoogleSetup||googleStatus.hidden;loginHint.hidden=isGoogleSetup;
    googleAccount.hidden=!isGoogleSetup;googleSetupCancel.hidden=!isGoogleSetup;
    businessName.required=isRegister||isGoogleSetup;username.required=!isGoogleSetup;password.required=!isGoogleSetup||googleNeedsPassword;
    document.getElementById('username-label').textContent=isRegister?'Correo electrónico':'Correo o usuario';username.placeholder=isRegister?'tu@empresa.cl':'correo@empresa.cl o pilotodepruebas';username.autocomplete=isRegister?'email':'username';password.autocomplete=isRegister||googleNeedsPassword?'new-password':'current-password';
    document.querySelector('[data-auth-submit]').textContent=isGoogleSetup?'Guardar y continuar':isRegister?'Crear mi espacio':'Entrar a Pymio';
    document.getElementById('auth-title').innerHTML=isGoogleSetup?'Cuéntanos sobre<br>tu negocio.':isRegister?'Tu negocio,<br>en un espacio propio.':'Todo comienza<br>con una buena mirada.';
    document.getElementById('auth-description').textContent=isGoogleSetup?'Personaliza el espacio que usarás en Pymio.':isRegister?'Crea una cuenta y empieza con un espacio limpio para tu pyme.':'Entra a Pymio y encuentra lo importante de tu negocio.';
    if(isGoogleSetup){businessName.value=setup.businessName||'';ownerName.value=setup.ownerName||'';googleAccount.textContent='Cuenta de Google: '+setup.email;}
    loginError.style.display='none';
  }
  document.querySelectorAll('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>{
    if(authMode!==button.dataset.authMode){loginForm.reset();['username','password','business-name','owner-name'].forEach(id=>document.getElementById(id).value='');setPasswordVisibility(false);}
    setAuthMode(button.dataset.authMode);
  }));
  googleSetupCancel.onclick=()=>{const clean=new URL(location.href);clean.searchParams.delete('google_setup');history.replaceState(null,'',clean);loginForm.reset();setAuthMode('login');};

  async function enterApp(session){
    currentSession=session;
    loadInventoryNotifications();
    loadReadNotifications();
    await cargarSecciones();
    await Promise.all([configureDashboard({companyId:session.companyId,demo:session.demo,apiUrl}),configureDiagnostics({companyId:session.companyId,apiUrl})]);
    await configureSupport({session,apiUrl}).catch(error=>{
      console.error('No se pudo iniciar el Centro de ayuda:',error);
      const message=document.querySelector('[data-support-message]');
      if(message){message.classList.add('error');message.textContent='El Centro de ayuda estará disponible cuando se aplique su migración.';}
    });
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
      const diagnosisLink=[...document.querySelectorAll('.home-feature-list small')].find(element=>element.textContent.includes('diagnóstico'));if(diagnosisLink)diagnosisLink.textContent='Encuentra señales cuando tu operación tenga datos suficientes.';
    }
    startOffline(session.companyId);
    startLiveSync({apiUrl,demo:session.demo});
    iniciarMovimientos({companyId:session.companyId});
    document.getElementById('login-screen').style.display='none';document.getElementById('app-screen').style.display='block';
    const storedTab=sessionStorage.getItem('pymio:last-tab');const destination=validTabs.has(storedTab)?storedTab:'inicio';
    document.querySelector('.skip-link').href='#main-content';initApp();navigateTo(destination);revealView(document.querySelector('.tab-panel.active'),{first:true});
    document.getElementById('profile-password-btn').hidden=session.demo;
    if(session.requiresBusinessName)openBusinessSetup();
    import('./inventario.js?v=164').then(({iniciarInventario})=>iniciarInventario({companyId:session.companyId})).catch(error=>{
      console.error('No se pudo iniciar el inventario:',error);const tabla=document.getElementById('inv-table');tabla.replaceChildren();const celda=tabla.insertRow().insertCell();celda.colSpan=10;celda.textContent='No se pudo iniciar el inventario. Recarga la página e inténtalo nuevamente.';
    });
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit=loginForm.querySelector('[type="submit"]');submit.disabled=true;submit.setAttribute('aria-busy','true');loginError.style.display='none';
    const identifier=username.value.trim(),passwordValue=password.value;
    const profile={businessName:businessName.value.trim(),ownerName:ownerName.value.trim()};
    const body=authMode==='google-setup'?{...profile,...(googleNeedsPassword?{password:passwordValue}:{})}:authMode==='register'?{email:identifier,password:passwordValue,...profile}:{identifier,password:passwordValue};
    const endpoint=authMode==='google-setup'?'google/complete':authMode;
    try { const response=await fetch(apiUrl+'/api/auth/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo completar el acceso.');if(authMode==='google-setup'){const clean=new URL(location.href);clean.searchParams.delete('google_setup');history.replaceState(null,'',clean);}await enterApp(result.session); }
    catch(error){loginError.textContent=accessErrorMessage(error);loginError.style.display='block';}
    finally{submit.disabled=false;submit.removeAttribute('aria-busy');}
  });



  document.getElementById('logout-btn').addEventListener('click', async () => {stopLiveSync();stopOffline();sessionStorage.removeItem('pymio:last-tab');await fetch(apiUrl+'/api/auth/logout',{method:'POST'}).catch(()=>{});location.reload();});

  const profileMenuButton=document.getElementById('profile-menu-btn'),profileMenu=document.getElementById('profile-menu');
  const businessSetupDialog=document.getElementById('business-setup-dialog'),businessSetupForm=document.getElementById('business-setup-form');
  const businessSetupInput=document.getElementById('business-setup-name'),businessSetupError=document.getElementById('business-setup-error');
  const passwordDialog=document.getElementById('password-dialog'),passwordForm=document.getElementById('password-form'),passwordError=document.getElementById('password-form-error');
  function openBusinessSetup(){
    businessSetupInput.value=currentSession?.businessName||'';businessSetupError.hidden=true;
    if(!businessSetupDialog.open)businessSetupDialog.showModal();
    requestAnimationFrame(()=>businessSetupInput.focus());
  }
  profileMenuButton.addEventListener('click',()=>{
    const opening=profileMenu.hidden;profileMenu.hidden=!opening;profileMenuButton.setAttribute('aria-expanded',String(opening));
  });
  document.addEventListener('click',event=>{
    if(!profileMenu.hidden&&!profileMenu.contains(event.target)&&!profileMenuButton.contains(event.target)){profileMenu.hidden=true;profileMenuButton.setAttribute('aria-expanded','false');}
  });
  document.getElementById('profile-password-btn').addEventListener('click',()=>{
    profileMenu.hidden=true;profileMenuButton.setAttribute('aria-expanded','false');passwordForm.reset();passwordError.hidden=true;passwordDialog.showModal();
  });
  document.getElementById('profile-communications-btn').addEventListener('click',()=>{
    profileMenu.hidden=true;profileMenuButton.setAttribute('aria-expanded','false');navigateTo('ecosistema',false,true);mostrarVistaEcosistema('comunicaciones');
  });
  document.getElementById('password-dialog-close').addEventListener('click',()=>passwordDialog.close());
  businessSetupDialog.addEventListener('cancel',event=>event.preventDefault());
  businessSetupForm.addEventListener('submit',async event=>{
    event.preventDefault();const submit=businessSetupForm.querySelector('[type="submit"]');submit.disabled=true;businessSetupError.hidden=true;
    try{
      const response=await fetch(apiUrl+'/api/auth/google/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({businessName:businessSetupInput.value.trim()})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo guardar el nombre del negocio.');
      currentSession=result.session;businessSetupDialog.close();location.reload();
    }catch(error){businessSetupError.textContent=error.message;businessSetupError.hidden=false;}finally{submit.disabled=false;}
  });
  passwordForm.addEventListener('submit',async event=>{
    event.preventDefault();const value=document.getElementById('profile-password').value,confirmation=document.getElementById('profile-password-confirm').value,submit=passwordForm.querySelector('[type="submit"]');
    passwordError.hidden=true;if(value!==confirmation){passwordError.textContent='Las contraseñas no coinciden.';passwordError.hidden=false;return;}
    submit.disabled=true;
    try{const response=await fetch(apiUrl+'/api/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:value})});const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo guardar la contraseña.');passwordDialog.close();}
    catch(error){passwordError.textContent=error.message;passwordError.hidden=false;}finally{submit.disabled=false;}
  });

  // ---------- NAV TABS ----------
  const tabTitles = {inicio:'Inicio', dashboard:'Dashboard', diagnostico:'Diagnóstico', movimientos:'Movimientos', inventario:'Inventario', ecosistema:'RED Pymio', ayuda:'Centro de ayuda'};
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

  function currentNotifications(){
    return [...networkNotifications,...activityNotifications,...(currentSession?.demo?notifData:[]),...diagnosticNotifications,...syncNotifications];
  }
  function markCurrentNotificationsRead(){
    for(const notification of currentNotifications())if(notification.id!=null)readNotificationIds.add(String(notification.id));
    saveReadNotifications();
  }
  function closeNotifications({markRead=true}={}){
    if(!notifPanel.classList.contains('open'))return;
    if(markRead)markCurrentNotificationsRead();
    notifPanel.classList.remove('open');
    bellBtn.setAttribute('aria-expanded','false');
    renderNotifications();
  }

  function renderNotifications(){
    const list = document.getElementById('notif-list');
    const visible=currentNotifications();
    list.replaceChildren();
    if(!visible.length){const empty=document.createElement('div');empty.className='notif-empty';empty.textContent='Aún no tienes notificaciones.';list.append(empty);}
    for(const notification of visible){
      const actionable=Boolean(notification.alertId||notification.destination);
      const item=document.createElement(actionable?'button':'div');item.className=`notif-item${notification.alertId?' notif-diagnostic':''}`;
      if(actionable)item.type='button';
      const dot=document.createElement('div');dot.className=`dot ${notification.sev}`;
      const content=document.createElement('div'),title=document.createElement('div');
      title.className='n-title';title.textContent=notification.title;content.append(title);
      if(notification.desc){const description=document.createElement('div');description.className='n-desc';description.textContent=notification.desc;content.append(description);}
      if(notification.time){const time=document.createElement('div');time.className='n-time';time.textContent=notification.time;content.append(time);}
      if(notification.alertId)item.onclick=()=>{closeNotifications();navigateTo('diagnostico',false,true);requestAnimationFrame(()=>{const alert=document.getElementById(notification.alertId);if(!alert)return;alert.classList.add('notification-target');alert.tabIndex=-1;alert.focus({preventScroll:true});alert.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>alert.classList.remove('notification-target'),1800);});};
      else if(notification.destination)item.onclick=()=>{
        closeNotifications();
        if(notification.destination==='inventario'&&notification.productId)document.dispatchEvent(new CustomEvent('abrir-inventario-producto',{detail:{id:notification.productId}}));
        else if(notification.destination==='ecosistema'&&notification.networkKind){navigateTo('ecosistema',false,true);mostrarVistaEcosistema(notification.networkKind.startsWith('event')?'eventos':'red',{keyboard:true});document.dispatchEvent(new CustomEvent('red-pymio-notification-open',{detail:{communityId:notification.communityId,kind:notification.networkKind,resourceId:notification.resourceId}}));}
        else navigateTo(notification.destination,false,true);
      };
      if(notification.issueId){
        const action=document.createElement('button');action.type='button';action.className='notif-action';action.textContent='Descartar intento';
        action.onclick=async()=>{if(!confirm('Este movimiento fue rechazado y no se aplicó al inventario. ¿Quieres descartarlo de las notificaciones?'))return;action.disabled=true;await discardSyncIssue(notification.issueId);};
        content.append(action);
      }
      if(notification.connectionRequestId){
        const actions=document.createElement('div');actions.className='notif-request-actions';
        for(const [decision,label] of [['accept','Aceptar'],['reject','Rechazar']]){const action=document.createElement('button');action.type='button';action.className=`notif-action ${decision}`;action.textContent=label;action.onclick=event=>{event.stopPropagation();document.dispatchEvent(new CustomEvent('red-pymio-connection-decision',{detail:{id:notification.connectionRequestId,decision}}));};actions.append(action);}
        const profile=document.createElement('button');profile.type='button';profile.className='notif-action';profile.textContent='Ver perfil';profile.onclick=event=>{event.stopPropagation();closeNotifications();navigateTo('ecosistema',false,true);mostrarVistaEcosistema('explorar');document.dispatchEvent(new CustomEvent('red-pymio-view-profile',{detail:{companyId:notification.companyId}}));};actions.append(profile);content.append(actions);
      }
      item.append(dot,content);list.append(item);
    }
    const unread=visible.filter(notification=>!readNotificationIds.has(String(notification.id))).length;
    notifBadge.style.display = unread && !notifPanel.classList.contains('open') ? 'flex' : 'none';
    notifBadge.textContent = unread;
  }
  async function refreshSyncNotifications(){
    try { syncNotifications=(await getSyncIssues()).map(issue=>({id:'sync-'+issue.id,issueId:issue.id,sev:issue.severity,title:issue.title,desc:issue.description,time:issue.time,requiresResolution:true})); }
    catch { syncNotifications=[]; }
    renderNotifications();
  }
  async function refreshNetworkNotifications(){
    if(currentSession?.demo||networkNotificationsLoading)return;
    networkNotificationsLoading=true;
    try{
      const response=await fetch(apiUrl+'/api/network/notifications',{cache:'no-store'}),result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'No se pudieron actualizar las notificaciones de RED Pymio.');
      const dateTime=new Intl.DateTimeFormat('es-CL',{dateStyle:'short',timeStyle:'short'});
      networkNotifications=(result.notifications||[]).map(item=>{
        let sev='info',title=`Nuevo formulario en ${item.community_name}`,desc=item.title;
        if(item.kind==='event_created'){sev='success';title=`Nuevo evento en ${item.community_name}`;desc=item.event_at?`${item.title} · ${dateTime.format(new Date(item.event_at))}`:item.title;}
        else if(item.kind==='event_updated'){sev='info';title=`Evento modificado en ${item.community_name}`;desc=item.event_at?`${item.title} · ${dateTime.format(new Date(item.event_at))}`:item.title;}
        else if(item.kind==='event_deleted'){sev='warn';title=`Evento eliminado en ${item.community_name}`;desc=item.title;}
        else if(item.kind==='admin_granted'){sev='success';title=`Ahora eres administrador en ${item.community_name}`;desc='Ya puedes administrar los formularios de esta comunidad.';}
        else if(item.kind==='admin_revoked'){sev='warn';title=`Ya no eres administrador en ${item.community_name}`;desc='Tus permisos de administrador fueron retirados.';}
        return {id:`network-${item.id}`,sev,title,desc,time:dateTime.format(new Date(item.created_at)),destination:'ecosistema',networkKind:item.kind,communityId:item.community_id,resourceId:item.resource_id};
      });
    }catch{}
    finally{networkNotificationsLoading=false;renderNotifications();}
  }
  window.addEventListener('swc-offline-change',refreshSyncNotifications);
  document.addEventListener('red-pymio-actualizado',refreshNetworkNotifications);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshNetworkNotifications();});
  document.addEventListener('producto-guardado',async event=>{
    if(currentSession?.demo)return;
    const detail=event.detail||{},action=detail.action||'updated';
    const name=String(detail.name||'Producto').trim(),sku=String(detail.sku||'').trim();
    const productId=String(detail.productId||'');
    const priorAlert=diagnosticNotifications.find(notification=>String(notification.productId)===productId);
    const titles={created:'Producto creado',updated:'Producto actualizado',deleted:'Producto eliminado'};
    const activity={
      id:`inventory-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      sev:'info',
      title:titles[action]||'Producto actualizado',
      desc:detail.description||`${name}${sku?` · ${sku}`:''}`,
      time:new Date().toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}),
      destination:'inventario',productId:action==='deleted'?'':productId
    };
    activityNotifications.unshift(activity);
    activityNotifications=activityNotifications.slice(0,40);
    saveInventoryNotifications();
    renderNotifications();
    await refreshDiagnosticAlerts();
    if(action==='updated'&&priorAlert&&!diagnosticNotifications.some(notification=>String(notification.productId)===productId)){
      activity.title='Problema de inventario resuelto';
      activity.desc=`${name}${sku?` · ${sku}`:''} volvió a un nivel de stock normal.`;
      saveInventoryNotifications();renderNotifications();
    }
  });
  document.addEventListener('movimiento-guardado',async event=>{
    if(currentSession?.demo)return;
    const detail=event.detail||{};
    const affectedIds=new Set((detail.productIds||[]).map(String));
    const priorAlerts=diagnosticNotifications.filter(notification=>affectedIds.has(String(notification.productId)));
    const titles={created:'Movimiento registrado',updated:'Movimiento actualizado',deleted:'Movimiento eliminado',queued:'Movimiento pendiente de sincronizar'};
    activityNotifications.unshift({
      id:`movement-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      sev:detail.action==='queued'?'neutral':'success',
      title:titles[detail.action]||'Movimiento registrado',
      desc:detail.description||'Se actualizó la actividad del negocio.',
      time:new Date().toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}),
      destination:'movimientos'
    });
    activityNotifications=activityNotifications.slice(0,40);
    saveInventoryNotifications();
    renderNotifications();
    if(priorAlerts.length){
      await refreshDiagnosticAlerts();
      for(const resolved of priorAlerts.filter(prior=>!diagnosticNotifications.some(current=>current.id===prior.id))){
        activityNotifications.unshift({id:`resolved-${resolved.id}-${Date.now()}`,sev:'info',title:'Problema de inventario resuelto',desc:`${resolved.title.replace(/^(Stock bajo|Sin stock):\s*/,'')} volvió a un nivel de stock normal.`,time:new Date().toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}),destination:'inventario',productId:resolved.productId});
      }
      activityNotifications=activityNotifications.slice(0,40);saveInventoryNotifications();renderNotifications();
    }
  });
  document.addEventListener('diagnostico-actualizado',event=>{diagnosticNotifications=event.detail?.alerts||[];renderNotifications();});
  document.addEventListener('red-pymio-notifications',event=>{
    const detail=event.detail||{},kindLabels={message:'Mensaje privado',quote_request:'Solicitud de cotización',offer:'Oferta exclusiva',business_update:'Novedad de negocio'};
    const requests=(detail.requests||[]).map(request=>({id:`connection-request-${request.id}`,connectionRequestId:request.id,companyId:request.company_id,sev:'info',title:`${request.display_name} quiere conectar contigo`,desc:'Acepta para agregar esta empresa a Mi RED y habilitar las herramientas privadas.',time:new Date(request.created_at).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}),requiresResolution:true}));
    const responses=(detail.responses||[]).map(response=>({id:`connection-accepted-${response.id}`,companyId:response.company_id,sev:'success',title:`${response.display_name} aceptó tu solicitud`,desc:'La empresa ya forma parte de Mi RED. Ahora pueden enviarse mensajes, cotizaciones, ofertas y novedades.',time:new Date(response.responded_at).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}),destination:'ecosistema'}));
    const activity=(detail.activity||[]).map(item=>({id:`private-${item.id}`,companyId:item.company_id,sev:'success',title:`${kindLabels[item.kind]||'Actividad privada'} · ${item.display_name}`,desc:[item.subject,item.body].filter(Boolean).join(' — '),time:new Date(item.created_at).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}),destination:'ecosistema'}));
    const communityRoles=(detail.communityRoles||[]).map(item=>({id:`community-role-${item.id}`,sev:item.role==='admin'?'success':'info',title:item.role==='admin'?'Ahora eres administrador':'Ya no eres administrador',desc:item.role==='admin'?`Te dieron permisos de administrador en ${item.community_name}.`:`Te quitaron los permisos de administrador en ${item.community_name}.`,time:new Date(item.created_at).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}),destination:'ecosistema'}));
    networkNotifications=[...requests,...responses,...communityRoles,...activity];renderNotifications();
  });
  document.addEventListener('diagnostico-actividad',event=>{
    if(currentSession?.demo)return;
    const detail=event.detail||{};
    activityNotifications.unshift({id:`diagnostic-activity-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,sev:'info',title:detail.title||'Diagnóstico actualizado',desc:detail.description||'',time:new Date().toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}),destination:detail.destination||'diagnostico'});
    activityNotifications=activityNotifications.slice(0,40);saveInventoryNotifications();renderNotifications();
  });
  document.addEventListener('venta-cerrada',event=>{
    if(currentSession?.demo)return;
    const detail=event.detail||{},customer=String(detail.customer||'').trim();
    activityNotifications.unshift({id:`closed-sale-${detail.code||Date.now()}-${Date.now()}`,sev:'success',title:'Venta cerrada',desc:`La venta ${detail.code||''}${customer?` de ${customer}`:''} fue marcada como pagada${detail.queued?' y se sincronizará al recuperar la conexión':''}.`,time:new Date().toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}),destination:'movimientos'});
    activityNotifications=activityNotifications.slice(0,40);saveInventoryNotifications();renderNotifications();
  });
  document.addEventListener('inventario-actualizado',()=>refreshDiagnosticAlerts());

  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if(notifPanel.classList.contains('open'))return closeNotifications();
    notifPanel.classList.add('open');
    bellBtn.setAttribute('aria-expanded','true');
    markCurrentNotificationsRead();
    renderNotifications();
  });
  document.addEventListener('click', (e) => {
    if(!notifPanel.contains(e.target) && e.target !== bellBtn)closeNotifications();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && notifPanel.classList.contains('open')) {
      closeNotifications();
      bellBtn.focus();
    }
  });

  // ---------- INIT ----------
  function initApp(){
    iniciarEcosistema({session:currentSession,apiUrl});
    renderDashboard();
    renderInicio();
    renderNotifications();
    refreshSyncNotifications();
    refreshNetworkNotifications();
    clearInterval(networkNotificationsTimer);networkNotificationsTimer=setInterval(refreshNetworkNotifications,45000);
  }

  async function initializeAuth(){
    try{
      const response=await fetch(apiUrl+'/api/auth/session');
      if(response.ok){const result=await response.json();await enterApp(result.session);return;}
      document.getElementById('login-screen').style.display='flex';
    }catch(error){document.getElementById('login-screen').style.display='flex';loginError.textContent=accessErrorMessage(error);loginError.style.display='block';setAuthMode('login');}
    finally{await finishBootScreen();}
  }
  initializeAuth();
