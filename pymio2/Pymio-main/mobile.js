import { enhanceWorkspace } from './mobile-workspace.js?v=152';
const mobileQuery = matchMedia('(max-width: 767px), (max-height: 500px) and (max-width: 950px)');
const backdrop = document.querySelector('.mobile-sheet-backdrop');
const sheets = [...document.querySelectorAll('.mobile-sheet')];
let lastSheetTrigger = null;

function isMobile() { return mobileQuery.matches; }
function syncMobileOnlyContent() {
  document.querySelectorAll('.mobile-today').forEach(node => { node.hidden = !isMobile(); });
  document.querySelectorAll('.mobile-hub-trigger').forEach(node => { node.hidden = !isMobile(); });
}
function syncMobileChrome() {
  const networkTrigger=document.querySelector('.sidebar .network-nav-toggle');
  if(networkTrigger&&innerWidth>=768&&innerWidth<=960){
    document.documentElement.style.setProperty('--network-flyout-top',`${Math.max(12,Math.min(networkTrigger.getBoundingClientRect().top,innerHeight-240))}px`);
  }
  const title = document.getElementById('page-title');
  const refresh = document.querySelector('.data-sync-refresh');
  if (title) {
    const currentTitle = title.textContent.trim();
    const fullTitle = currentTitle === 'RED' ? (title.dataset.fullTitle || 'RED Pymio') : currentTitle;
    if (currentTitle !== 'RED') title.dataset.fullTitle = fullTitle;
    if (isMobile() && innerWidth <= 350 && fullTitle === 'RED Pymio') title.textContent = 'RED';
    else if ((!isMobile() || innerWidth > 350) && title.textContent.trim() === 'RED') title.textContent = 'RED Pymio';
  }
  if (refresh) {
    refresh.setAttribute('aria-label','Actualizar datos');
    refresh.textContent = isMobile() && innerWidth <= 350 ? 'Actualizar' : 'Actualizar Datos';
  }
}
function closeSheets(restoreFocus = true) {
  sheets.forEach(sheet => sheet.hidden = true);
  backdrop.hidden = true;
  document.body.classList.remove('mobile-sheet-open');
  document.getElementById('app-screen')?.removeAttribute('inert');
  document.querySelector('.mobile-nav')?.removeAttribute('inert');
  if (restoreFocus) lastSheetTrigger?.focus({preventScroll:true});
  lastSheetTrigger = null;
}
function openSheet(id, trigger) {
  if (!isMobile()) return;
  closeSheets(false);
  const sheet = document.getElementById(id);
  if (!sheet) return;
  if(id==='mobile-create-sheet')sheet.querySelector('.mobile-sheet-head p').textContent=document.getElementById('account-role')?.textContent.trim()==='Cuenta piloto'?'Cuenta piloto: puedes explorar los formularios, pero no guardar operaciones.':'Elige una acción para continuar.';
  lastSheetTrigger = trigger;
  sheet.hidden = false;
  backdrop.hidden = false;
  document.body.classList.add('mobile-sheet-open');
  document.getElementById('app-screen')?.setAttribute('inert','');
  document.querySelector('.mobile-nav')?.setAttribute('inert','');
  requestAnimationFrame(() => sheet.querySelector('button')?.focus({preventScroll:true}));
}
function clickDesktopNav(tab) {
  const target = document.querySelector(`.sidebar .nav-item[data-tab="${tab}"]`);
  target?.click();
}
function clickWhenReady(selector, afterClickSelector) {
  const started = performance.now();
  const attempt = () => {
    const target = document.querySelector(selector);
    if (target) {
      target.click();
      if (afterClickSelector) requestAnimationFrame(() => document.querySelector(afterClickSelector)?.click());
      return;
    }
    if (performance.now() - started < 3000) requestAnimationFrame(attempt);
  };
  attempt();
}

document.querySelector('.mobile-create')?.addEventListener('click', event => openSheet('mobile-create-sheet', event.currentTarget));
function refreshAccountSheet() {
  const name = document.getElementById('account-name')?.textContent || 'Tu negocio';
  const role = document.getElementById('account-role')?.textContent || 'Cuenta Pymio';
  const initials = document.getElementById('account-avatar')?.textContent || 'PY';
  document.querySelector('[data-mobile-business]').textContent = name;
  document.querySelector('[data-mobile-role]').textContent = role;
  document.querySelector('[data-mobile-avatar]').textContent = initials;
  const security = document.querySelector('[data-mobile-security]');
  if (security) security.hidden = Boolean(document.getElementById('profile-password-btn')?.hidden);
}
function installMobileHub() {
  const topbar = document.querySelector('.topbar-right');
  if (!topbar || topbar.querySelector('.mobile-hub-trigger')) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'mobile-hub-trigger';
  button.setAttribute('aria-label','Abrir cuenta y preferencias');
  button.setAttribute('aria-haspopup','dialog'); button.setAttribute('aria-controls','mobile-more-sheet');
  button.innerHTML = '<span>PY</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m7 10 5 5 5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  button.addEventListener('click', event => { refreshAccountSheet(); openSheet('mobile-more-sheet', event.currentTarget); });
  topbar.append(button);
}
function installMobileChatShortcut() {
  const topbar=document.querySelector('.topbar-right');
  if(!topbar||topbar.querySelector('.mobile-chat-trigger'))return;
  const button=document.createElement('button');button.type='button';button.className='mobile-chat-trigger mobile-only';button.setAttribute('aria-label','Abrir chats');button.setAttribute('aria-controls','sub-comunicaciones');
  button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 18.5 3.5 21l4-1.25c1.3.8 2.85 1.25 4.5 1.25 4.97 0 9-3.8 9-8.5S16.97 4 12 4s-9 3.8-9 8.5c0 2.35 1 4.47 2.62 6" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 12.5h8M8 9.5h5" stroke-linecap="round"/></svg><span class="mobile-chat-badge" hidden>0</span>';
  button.addEventListener('click',()=>{
    document.dispatchEvent(new CustomEvent('pymio-show-chat-list'));
    document.getElementById('profile-communications-btn')?.click();
  });
  topbar.insertBefore(button,document.getElementById('profile-menu-btn'));
  const current=Number(document.querySelector('[data-unread-count]')?.textContent||0);button.querySelector('.mobile-chat-badge').textContent=current;button.querySelector('.mobile-chat-badge').hidden=!current;
}
document.addEventListener('pymio-chat-count',event=>{const badge=document.querySelector('.mobile-chat-badge'),count=Number(event.detail?.unread||0);if(!badge)return;badge.textContent=count>99?'99+':String(count);badge.hidden=!count;});
document.querySelectorAll('[data-mobile-sheet-close]').forEach(button => button.addEventListener('click', () => closeSheets()));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('mobile-sheet-open')) closeSheets();
  if (event.key !== 'Tab' || !document.body.classList.contains('mobile-sheet-open')) return;
  const sheet=sheets.find(item=>!item.hidden); if(!sheet)return;
  const focusable=[...sheet.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(item=>!item.disabled&&!item.hidden);
  if(!focusable.length)return; const first=focusable[0],last=focusable.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});

function syncMobileNavState(){
  const active=document.querySelector('.tab-panel.active')?.id?.replace('tab-','');
  document.querySelectorAll('.mobile-nav [data-tab],.mobile-nav [data-mobile-tab]').forEach(item=>{
    const selected=(item.dataset.tab||item.dataset.mobileTab)===active;
    item.classList.toggle('active',selected);
    if(selected)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
  });
}
document.addEventListener('click',()=>requestAnimationFrame(()=>{ syncMobileNavState(); syncMobileChrome(); }));

document.querySelectorAll('[data-mobile-tab]').forEach(button => button.addEventListener('click', () => {
  const tab = button.dataset.mobileTab;
  document.querySelectorAll('.mobile-nav [data-tab],.mobile-nav [data-mobile-tab]').forEach(item => item.classList.toggle('active', item === button));
  closeSheets(false);
  clickDesktopNav(tab);
  if (button.dataset.mobileNetwork) {
    requestAnimationFrame(() => document.querySelector(`.sidebar [data-network-view="${button.dataset.mobileNetwork}"]`)?.click());
  }
}));
document.querySelector('[data-mobile-pymium]')?.addEventListener('click', () => {
  closeSheets(false);
  document.querySelector('[data-pymium-open]')?.click();
});
document.querySelector('[data-mobile-help]')?.addEventListener('click',()=>{closeSheets(false);clickDesktopNav('ayuda');});
document.querySelector('[data-mobile-logout]')?.addEventListener('click', () => document.getElementById('logout-btn')?.click());

document.querySelectorAll('[data-mobile-action]').forEach(button => button.addEventListener('click', () => {
  const action = button.dataset.mobileAction;
  closeSheets(false);
  if (action === 'product') {
    clickDesktopNav('inventario');
    clickWhenReady('[data-add-modify-inventory]', '#opciones-inventario [data-accion="agregar"]');
    return;
  }
  clickDesktopNav('movimientos');
  const selector = action === 'sale' ? '[data-sale-add]' : action === 'purchase' ? '[data-purchase-add]' : '[data-movement-add]';
  clickWhenReady(selector);
}));

document.addEventListener('click', event => {
  const product = event.target.closest('[data-mobile-product]');
  if (!product) return;
  clickDesktopNav('inventario');
  clickWhenReady('[data-add-modify-inventory]', '#opciones-inventario [data-accion="agregar"]');
});

function parseCount(value) {
  const match = String(value || '').match(/-?\d+/);
  return match ? Number(match[0]) : 0;
}
function syncToday() {
  const setText = (node, value) => { if (node && node.textContent !== String(value)) node.textContent = String(value); };
  const business = (document.getElementById('account-name')?.textContent || 'Tu negocio').trim();
  const greeting = document.querySelector('[data-mobile-greeting]');
  setText(greeting, business);
  const date = document.querySelector('[data-mobile-date]');
  setText(date, new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'numeric',month:'long'}).format(new Date()));
  const sourceIncome = document.getElementById('home-income');
  const sourceChange = document.getElementById('home-income-change');
  const income = document.querySelector('[data-mobile-income]');
  const change = document.querySelector('[data-mobile-income-change]');
  if (sourceIncome) setText(income, sourceIncome.textContent);
  if (sourceChange) setText(change, sourceChange.dataset.mobileComparison || `${sourceChange.textContent.trim()} frente al período anterior`);
  const summary=document.querySelector('.mobile-today');
  const low = Number(summary?.dataset.lowCount||0);
  const pending = Number(summary?.dataset.pendingCount||0);
  setText(document.querySelector('[data-mobile-sales-count]'),document.getElementById('home-count')?.textContent||'0');
  setText(document.querySelector('[data-mobile-ticket]'),document.getElementById('home-ticket')?.textContent||'$0');
  setText(document.querySelector('[data-mobile-period]'),document.getElementById('home-month')?.textContent||'Este mes');
  setText(document.querySelector('.mobile-today-head>p'),new Date().getHours()<12?'Buenos días':new Date().getHours()<20?'Buenas tardes':'Buenas noches');
  const mode=document.getElementById('account-role')?.textContent||'';
  setText(document.querySelector('[data-mobile-mode]'),mode==='Cuenta piloto'?'Cuenta piloto: RED muestra información de demostración.':'Tu espacio de trabajo');
  const empty=Number(summary?.dataset.emptyCount||0);
  setText(document.querySelector('[data-mobile-low-count]'), low);
  const stockRow=document.querySelector('[data-mobile-low-count]')?.closest('button');if(stockRow)stockRow.dataset.urgent=String(empty>0);
  setText(document.querySelector('[data-mobile-pending-count]'), pending);
  const lowLabel = document.querySelector('[data-mobile-low-label]');
  const lowCopy = document.querySelector('[data-mobile-low-copy]');
  setText(lowLabel, low ? 'Productos para reponer' : 'Inventario al día');
  setText(lowCopy, empty ? `${empty} ${empty===1?'agotado':'agotados'} · ${Math.max(0,low-empty)} con stock bajo` : low ? 'Revisar productos con stock bajo' : 'No hay alertas urgentes');
  const pendingLabel = document.querySelector('[data-mobile-pending-label]');
  setText(pendingLabel, pending ? 'Ventas por cobrar' : 'Pagos al día');
  setText(document.querySelector('[data-mobile-pending-copy]'), pending ? 'Revisa los cobros pendientes' : 'No hay cobros pendientes');
  const hubInitials = document.querySelector('.mobile-hub-trigger span');
  setText(hubInitials, document.getElementById('account-avatar')?.textContent || 'PY');
}

function buildNetworkTabs() {
  const panel = document.getElementById('tab-ecosistema');
  if (!panel || panel.querySelector('.mobile-network-tabs')) return;
  const nav = document.createElement('nav');
  nav.className = 'mobile-network-tabs';
  nav.setAttribute('aria-label','Secciones de RED Pymio');
  const views = [['red','Mi RED'],['explorar','Explorar'],['eventos','Eventos'],['pymio','Mi Pymio'],['overview','Herramientas']];
  for (const [view,label] of views) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.mobileNetworkView = view; button.textContent = label;
    if (view === 'overview') button.classList.add('active');
    button.addEventListener('click', () => {
      const target = view === 'overview'
        ? document.querySelector('.sidebar .network-nav-toggle')
        : document.querySelector(`.sidebar [data-network-view="${view}"]`);
      target?.click();
      nav.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
      const centered = button.offsetLeft - (nav.clientWidth - button.offsetWidth) / 2;
      nav.scrollTo({left:Math.max(0, centered),behavior:'smooth'});
      const content = document.querySelector('.content');
      if (content) content.scrollTo({top:0,left:0,behavior:'auto'});
    });
    nav.append(button);
  }
  panel.prepend(nav);
}

function syncNetworkTabs() {
  const panel = document.getElementById('tab-ecosistema');
  const nav = panel?.querySelector('.mobile-network-tabs');
  if (!nav) return;
  const activePanel = panel.querySelector('.subpanel.active');
  const view = activePanel?.id?.replace('sub-','') || 'overview';
  nav.querySelectorAll('button').forEach(button => {
    const selected = button.dataset.mobileNetworkView === view;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
}

function installDialogDismissers() {
  document.querySelectorAll('dialog.producto-dialogo').forEach(dialog => {
    if (dialog.matches('.movimiento-pago-confirmacion') || dialog.querySelector('.mobile-dialog-dismiss')) return;
    const cancel = dialog.querySelector('[data-cancelar],[data-cancel-movement],[data-customer-cancel],[data-category-cancel]');
    const form = dialog.querySelector('form');
    if (!cancel || !form) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-dialog-dismiss';
    button.setAttribute('aria-label','Cerrar formulario');
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke-linecap="round"/></svg>';
    button.addEventListener('click', () => cancel.click());
    form.prepend(button);
  });
}

function addDashboardFilterTrigger() {
  const panel = document.getElementById('tab-dashboard');
  const filters = panel?.querySelector('.dash-filters');
  if (!panel || !filters || panel.querySelector('.mobile-filter-trigger')) return;
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'mobile-filter-trigger'; trigger.textContent = 'Período y categoría';
  trigger.setAttribute('aria-expanded','false');
  trigger.addEventListener('click', () => {
    const open = panel.classList.toggle('mobile-filters-open');
    trigger.setAttribute('aria-expanded',String(open));
    if (open) filters.querySelector('select')?.focus({preventScroll:true});
  });
  filters.before(trigger);
}

function enhanceLoadedViews() {
  installMobileHub();
  installMobileChatShortcut();
  syncMobileOnlyContent();
  syncMobileChrome();
  buildNetworkTabs();
  syncNetworkTabs();
  installDialogDismissers();
  addDashboardFilterTrigger();
  syncToday();
  syncMobileNavState();
  enhanceMobileTasks();
  enhanceWorkspace();
}
// Disconnect while enhancing: class mutations must not schedule their own next pass.
const observedContent = document.getElementById('main-content');
const observer = new MutationObserver(() => {
  observer.disconnect();
  enhanceLoadedViews();
  observeContent();
});
function observeContent(){observer.observe(observedContent,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','hidden']});}
observeContent();
enhanceLoadedViews();

mobileQuery.addEventListener('change', event => {
  syncMobileOnlyContent();
  syncMobileChrome();
  if (!event.matches) closeSheets(false);
});
addEventListener('resize', syncMobileChrome, {passive:true});

function installNavigationIcons(){
  const mappings = [['.icon-home','inicio'],['.icon-activity','movimientos'],['.icon-inventory','inventario'],['.icon-network','ecosistema']];
  for(const [selector,tab] of mappings){
    const host=document.querySelector(`.mobile-nav ${selector}`);
    const icon=document.querySelector(`.sidebar [data-tab="${tab}"] svg`);
    if(host&&icon&&!host.firstChild)host.append(icon.cloneNode(true));
  }
  const register=document.querySelector('.icon-register');
  const plus=document.querySelector('.home-actions svg');
  if(register&&plus&&!register.firstChild)register.append(plus.cloneNode(true));
  if(register&&!register.nextElementSibling){const label=document.createElement('span');label.textContent='Registrar';register.after(label);}
}

function addSortControl(panelId, selector, label){
  const panel=document.getElementById(panelId);
  if(!panel||panel.querySelector('.mobile-sort-control'))return;
  const headers=[...panel.querySelectorAll(selector)];
  if(!headers.length)return;
  const wrapper=document.createElement('label');wrapper.className='mobile-sort-control';
  const title=document.createElement('span');title.textContent=label;
  const select=document.createElement('select');select.setAttribute('aria-label',label);
  select.add(new Option('Orden actual',''));
  headers.forEach((header,index)=>{
    const text=header.textContent.replace(/[↕↑↓]/g,'').trim();
    const names={Producto:['Nombre A–Z','Nombre Z–A'],SKU:['SKU A–Z','SKU Z–A'],Categoría:['Categoría A–Z','Categoría Z–A'],Cantidad:['Menor stock','Mayor stock'],Precio:['Menor precio','Mayor precio'],Costo:['Menor costo','Mayor costo'],Actualizado:['Actualizados hace más tiempo','Actualizados recientemente'],Creado:['Más antiguos','Más recientes'],Fecha:['Más antiguos','Más recientes'],Total:['Menor importe','Mayor importe']};
    const labels=names[text]||[text+' A–Z',text+' Z–A'];
    select.add(new Option(labels[0],index+':ascending'));
    select.add(new Option(labels[1],index+':descending'));
  });
  select.onchange=()=>{
    if(!select.value)return;
    const [index,direction]=select.value.split(':'),header=headers[Number(index)],cell=header.closest('th');
    header.click();
    if((cell||header).getAttribute('aria-sort')!==direction)header.click();
  };
  wrapper.append(title,select);
  if(panelId==='tab-inventario')panel.querySelector('.toolbar').append(wrapper);
  else panel.querySelector('.card-head').after(wrapper);
}

function enhanceMobileTasks(){
  installNavigationIcons();
  for(const [id,title] of [['inventario','Productos y existencias'],['movimientos','Tu actividad'],['dashboard','Tu negocio en cifras'],['diagnostico','Lo que necesita atención']]){
    const header=document.querySelector(`#tab-${id} .page-intro`),original=header?.querySelector('h2');
    if(header&&original&&!header.querySelector('.mobile-view-title')){
      original.classList.add('mobile-replaced-heading');const heading=document.createElement('h2');heading.className='mobile-only mobile-view-title';heading.textContent=title;original.after(heading);
    }
  }
  const summary=document.querySelector('.mobile-today');
  if(summary&&!summary.querySelector('.mobile-home-metrics')){
    const metrics=document.createElement('div');metrics.className='mobile-home-metrics';
    metrics.innerHTML='<div><span>Ventas registradas</span><strong data-mobile-sales-count>0</strong></div><div><span>Ticket promedio</span><strong data-mobile-ticket>$0</strong></div>';
    summary.querySelector('.mobile-balance').after(metrics);
    const state=document.createElement('p');state.className='mobile-home-state';state.dataset.mobileMode='';metrics.after(state);
    const period=document.createElement('span');period.dataset.mobilePeriod='';summary.querySelector('.mobile-balance>div>span').after(period);
  }
  addSortControl('tab-inventario','[data-sort]','Ordenar productos');
  addSortControl('tab-movimientos','[data-movement-sort]','Ordenar movimientos');
  document.querySelectorAll('.filter-options').forEach(panel=>{
    if(panel.querySelector('.mobile-filter-done'))return;
    const done=document.createElement('button');done.type='button';done.className='mobile-filter-done mobile-only';done.textContent='Ver resultados';
    done.onclick=()=>{const toggle=document.querySelector(`[aria-controls="${panel.id}"]`);if(toggle?.getAttribute('aria-expanded')==='true')toggle.click();};panel.append(done);
  });
  document.querySelectorAll('input[type=number]').forEach(input=>{if(!input.hasAttribute('inputmode'))input.inputMode=input.step&&input.step!=='1'?'decimal':'numeric';});
  document.querySelectorAll('input[type=search]').forEach(input=>{input.enterKeyHint='search';});
}

// Proxy existing actions: never duplicate authorization, refresh or theme state.
const moreGrid=document.querySelector('.mobile-more-grid');
for(const [key,title,copy,selector] of [
  ['refresh','Actualizar datos','Sincroniza tu espacio','.data-sync-refresh'],
  ['theme','Apariencia','Cambiar entre claro y oscuro','.theme-toggle--app'],
  ['security','Contraseña','Seguridad de tu cuenta','#profile-password-btn']
]){
  const button=document.createElement('button');button.type='button';button.dataset[`mobile${key[0].toUpperCase()+key.slice(1)}`]='';
  const text=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=title;small.textContent=copy;text.append(strong,small);button.append(text);
  button.onclick=()=>{closeSheets(false);document.querySelector(selector)?.click();};moreGrid?.append(button);
}

// The virtual keyboard must not compete with the bottom navigation.
function syncKeyboard(){
  const viewport=window.visualViewport;
  const editing=document.activeElement?.matches('input,textarea,select');
  document.body.classList.toggle('mobile-keyboard-open',Boolean(isMobile()&&editing&&viewport&&innerHeight-viewport.height>120));
}
window.visualViewport?.addEventListener('resize',syncKeyboard,{passive:true});
document.addEventListener('focusin',syncKeyboard);
document.addEventListener('focusout',()=>requestAnimationFrame(syncKeyboard));

// Long tasks protect edits before a voluntary dismiss. Native dialog keeps focus trapped.
const dirtyForms=new WeakSet();
const discardDialog=document.createElement('dialog');
discardDialog.className='mobile-discard-dialog';
discardDialog.setAttribute('aria-labelledby','mobile-discard-title');
discardDialog.innerHTML='<h2 id="mobile-discard-title">¿Descartar los cambios?</h2><p>Lo que escribiste todavía no se ha guardado.</p><div><button type="button" data-keep-editing>Seguir editando</button><button type="button" data-discard-edit>Descartar cambios</button></div>';
document.body.append(discardDialog);
let pendingDismiss=null;
function protectDismiss(form,action){
  if(!isMobile()||!form||!dirtyForms.has(form))return false;
  pendingDismiss=()=>{dirtyForms.delete(form);action();};discardDialog.showModal();return true;
}
discardDialog.querySelector('[data-keep-editing]').onclick=()=>{pendingDismiss=null;discardDialog.close();};
discardDialog.querySelector('[data-discard-edit]').onclick=()=>{const action=pendingDismiss;pendingDismiss=null;discardDialog.close();action?.();};
document.addEventListener('input',event=>{
  const form=event.target.closest('dialog form');
  if(form?.querySelector('[type="submit"]')&&form.closest('dialog').open)dirtyForms.add(form);
});
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-cancelar],[data-cancel-movement],[data-customer-cancel],[data-category-cancel],[data-dialog-close],.account-dialog-close,.mobile-dialog-dismiss');
  if(!button)return;
  const form=button.closest('form')||button.closest('dialog')?.querySelector('form');
  if(protectDismiss(form,()=>button.click())){event.preventDefault();event.stopImmediatePropagation();}
},true);
document.addEventListener('cancel',event=>{
  const dialog=event.target,form=dialog.querySelector?.('form');
  if(protectDismiss(form,()=>dialog.close()))event.preventDefault();
},true);
document.addEventListener('close',event=>{
  const form=event.target.querySelector?.('form');if(form)dirtyForms.delete(form);
},true);
