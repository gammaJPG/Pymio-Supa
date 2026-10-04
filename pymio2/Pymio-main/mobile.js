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
}
function installMobileHub() {
  const topbar = document.querySelector('.topbar-right');
  if (!topbar || topbar.querySelector('.mobile-hub-trigger')) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'mobile-hub-trigger';
  button.setAttribute('aria-label','Abrir herramientas y cuenta');
  button.setAttribute('aria-haspopup','dialog'); button.setAttribute('aria-controls','mobile-more-sheet');
  button.innerHTML = '<span>PY</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m7 10 5 5 5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  button.addEventListener('click', event => { refreshAccountSheet(); openSheet('mobile-more-sheet', event.currentTarget); });
  topbar.append(button);
}
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
  const sourceIncome = document.getElementById('dash-income') || document.getElementById('home-income');
  const sourceChange = document.getElementById('dash-income-change') || document.getElementById('home-income-change');
  const income = document.querySelector('[data-mobile-income]');
  const change = document.querySelector('[data-mobile-income-change]');
  if (sourceIncome) setText(income, sourceIncome.textContent);
  if (sourceChange) setText(change, `${sourceChange.textContent.trim()} frente al período anterior`);
  const low = parseCount(document.getElementById('dash-low-count')?.textContent);
  const pending = parseCount(document.getElementById('dash-pending-count')?.textContent);
  setText(document.querySelector('[data-mobile-low-count]'), low);
  setText(document.querySelector('[data-mobile-pending-count]'), pending);
  const lowLabel = document.querySelector('[data-mobile-low-label]');
  const lowCopy = document.querySelector('[data-mobile-low-copy]');
  setText(lowLabel, low ? 'Productos con stock bajo' : 'Inventario al día');
  setText(lowCopy, low ? 'Conviene planificar reposición' : 'No hay alertas urgentes');
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
  const views = [['overview','Guías'],['pymio','Mi Pymio'],['red','Mi RED'],['explorar','Explorar'],['eventos','Eventos']];
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
  syncMobileOnlyContent();
  syncMobileChrome();
  buildNetworkTabs();
  syncNetworkTabs();
  installDialogDismissers();
  addDashboardFilterTrigger();
  syncToday();
  syncMobileNavState();
}
const observer = new MutationObserver(enhanceLoadedViews);
observer.observe(document.getElementById('main-content'), {childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
enhanceLoadedViews();

mobileQuery.addEventListener('change', event => {
  syncMobileOnlyContent();
  syncMobileChrome();
  if (!event.matches) closeSheets(false);
});
addEventListener('resize', syncMobileChrome, {passive:true});
