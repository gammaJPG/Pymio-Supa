// Mobile presentation only. Existing controls keep their listeners and API contracts.
const phone = matchMedia('(max-width:767px), (max-height:500px) and (max-width:950px)');
const placements = new Map();
function moveForPhone(node, target) {
  if (!node || !target) return;
  if (!placements.has(node)) {
    const anchor = document.createComment('desktop-control-position');
    node.before(anchor);
    placements.set(node, anchor);
  }
  if (phone.matches && node.parentElement !== target) target.append(node);
  if (!phone.matches) { const anchor=placements.get(node); if(anchor.nextSibling!==node)anchor.after(node); }
}
const text = (node, value) => { if(node && node.textContent!==String(value))node.textContent=String(value); };
function button(label, action, className='') {
  const node=document.createElement('button');node.type='button';node.className=className;node.textContent=label;node.onclick=action;return node;
}
function chips(labels, attribute, onChange) {
  const group=document.createElement('div');group.className='mobile-scope mobile-only';group.setAttribute('role','group');group.setAttribute('aria-label',attribute);
  labels.forEach(([key,label],index)=>{
    const node=button(label,()=>{group.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===node)));onChange(key);});
    node.dataset.scope=key;node.setAttribute('aria-pressed',String(index===0));group.append(node);
  });return group;
}

function home() {
  const root=document.querySelector('.mobile-today');if(!root)return;
  if(!root.dataset.workspace){
    root.dataset.workspace='ready';
    const attention=root.querySelector('.mobile-attention'),quick=root.querySelector('.mobile-quick-actions'),balance=root.querySelector('.mobile-balance'),metrics=root.querySelector('.mobile-home-metrics');
    const finance=document.createElement('section');finance.className='mobile-finance';finance.setAttribute('aria-label','Resumen del mes');
    balance.before(finance);finance.append(balance);if(metrics)finance.append(metrics);
    const head=root.querySelector('.mobile-today-head');head.after(attention);attention.after(quick);quick.after(finance);
    text(attention.querySelector('h3'),'Por resolver');text(attention.querySelector('.mobile-section-title p'),'');
    text(root.querySelector('.mobile-shortcuts h3'),'Análisis y herramientas');text(root.querySelector('.mobile-shortcuts .mobile-section-title p'),'');
    const product=quick.querySelector('[data-mobile-product]');
    const shortcuts=root.querySelector('.mobile-shortcut-list');if(product)shortcuts.append(product);
    const state=root.querySelector('[data-mobile-mode]');if(state)root.append(state);
    text(quick.querySelector('[data-start-movement="sale"] strong'),'Nueva venta');
    text(quick.querySelector('[data-start-movement="purchase"] strong'),'Compra');
    for(const [selector,kind] of [['[data-mobile-low-count]','low'],['[data-mobile-pending-count]','pending']]){
      const control=attention.querySelector(selector)?.closest('button');
      if(control){delete control.dataset.goTab;control.onclick=()=>document.dispatchEvent(new CustomEvent('mobile-home-attention',{detail:{kind}}));}
    }
  }
  root.querySelectorAll('.mobile-attention-row').forEach(row=>{
    const value=Number(row.querySelector('b')?.textContent||0);row.dataset.attention=value>0?'pending':'clear';
  });
}

function inventory() {
  const panel=document.getElementById('tab-inventario');if(!panel)return;
  const toolbar=panel.querySelector('.toolbar'),filters=panel.querySelector('#inventory-filters');
  if(!toolbar||!filters)return;
  if(!panel.querySelector('.mobile-catalog-add')){
    const add=button('Nuevo producto',()=>{panel.querySelector('[data-add-modify-inventory]')?.click();panel.querySelector('#opciones-inventario [data-accion="agregar"]')?.click();},'mobile-catalog-add mobile-only');
    panel.querySelector('.page-intro').append(add);
    const scope=chips([['all','Todos'],['low','Stock bajo'],['empty','Agotados']],'Estado del inventario',value=>panel.dispatchEvent(new CustomEvent('mobile-inventory-filter',{detail:value})));
    toolbar.after(scope);
  }
  moveForPhone(panel.querySelector('.mobile-sort-control'),filters);
  let management=panel.querySelector('.mobile-inventory-management');
  if(!management){management=document.createElement('details');management.className='mobile-inventory-management mobile-only';const summary=document.createElement('summary');summary.textContent='Administrar catálogo';management.append(summary);panel.querySelector('.page-intro').after(management);}
  moveForPhone(panel.querySelector('[data-category-menu]'),management);
  moveForPhone(panel.querySelector('[data-add-modify-inventory]')?.closest('.inventario-menu'),management);
  panel.querySelector('#inv-category')?.setAttribute('aria-label','Categoría');
  const done=filters.querySelector('.mobile-filter-done');if(phone.matches&&done&&filters.lastElementChild!==done)filters.append(done);
}

function activity() {
  const panel=document.getElementById('tab-movimientos');if(!panel)return;
  const filters=panel.querySelector('#movement-filters');
  if(!panel.querySelector('.mobile-activity-tools')){
    const tools=document.createElement('div');tools.className='mobile-activity-tools mobile-only';
    const search=document.createElement('input');search.type='search';search.placeholder='Buscar en la actividad';search.setAttribute('aria-label','Buscar en la actividad');search.enterKeyHint='search';
    let kind='all';const emit=()=>panel.dispatchEvent(new CustomEvent('mobile-movement-filter',{detail:{kind:panel.querySelector('.mobile-scope [aria-pressed="true"]')?.dataset.scope||kind,query:search.value}}));search.oninput=emit;
    const filter=button('Filtros',()=>panel.querySelector('[data-filter-toggle]')?.click(),'mobile-activity-filter');filter.setAttribute('aria-controls','movement-filters');
    tools.append(search,filter);panel.querySelector('.page-intro').after(tools);
    const scope=chips([['all','Todo'],['venta','Ventas'],['compra','Compras'],['pending','Por cobrar']],'Tipo de actividad',value=>{kind=value;emit();});tools.after(scope);
  }
  moveForPhone(panel.querySelector('.mobile-sort-control'),filters);
  moveForPhone(panel.querySelector('.movimiento-botones>.inventario-menu, #movement-filters>.inventario-menu'),filters);
  const done=filters?.querySelector('.mobile-filter-done');if(phone.matches&&done&&filters.lastElementChild!==done)filters.append(done);
  const toggler=panel.querySelector('[data-filter-toggle]'),proxy=panel.querySelector('.mobile-activity-filter');
  if(proxy)proxy.setAttribute('aria-expanded',toggler?.getAttribute('aria-expanded')||'false');
}

function analysis() {
  const panel=document.getElementById('tab-dashboard');if(!panel)return;
  if(!panel.querySelector('.mobile-analysis-report')){
    const report=document.createElement('div');report.className='mobile-analysis-report';
    panel.querySelector('.dash-kpis')?.before(report);
  }
  const report=panel.querySelector('.mobile-analysis-report');
  const chart=panel.querySelector('#dash-sales-bars');
  if(chart&&!panel.querySelector('.mobile-chart-help')){const hint=document.createElement('p');hint.className='mobile-chart-help mobile-only';hint.textContent='Toca una barra para ver su importe y unidades.';chart.after(hint);}
  moveForPhone(panel.querySelector('.dash-kpi.primary'),report);
  moveForPhone(panel.querySelector('.dashboard-middle>.dashboard-block, .mobile-analysis-report>.dashboard-block'),report);
  const trigger=panel.querySelector('.mobile-filter-trigger');
  const selected=panel.querySelector('#dash-period');const category=panel.querySelector('#dash-category');
  if(trigger&&selected)text(trigger,`${selected.selectedOptions[0]?.textContent||'Período'} · ${category?.selectedOptions[0]?.textContent||'Categorías'}`);
}

function forms() {
  const form=document.getElementById('movimiento-form');if(!form)return;
  const fields=form.querySelector('[data-movement-fields]');if(!fields)return;
  if(!form.querySelector('.mobile-operation-products')){
    const products=document.createElement('section');products.className='mobile-operation-products';
    const title=document.createElement('h3');title.className='mobile-only';title.textContent='Productos de la operación';products.append(title);fields.prepend(products);
    const info=document.createElement('p');info.className='mobile-form-note mobile-only';info.textContent='Completa los productos y después los datos del pago.';form.querySelector('h2').after(info);
  }
  let notice=form.querySelector('.mobile-demo-notice');
  if(!notice){notice=document.createElement('p');notice.className='mobile-demo-notice mobile-only';notice.setAttribute('role','note');notice.textContent='Vista de demostración. El registro está deshabilitado en esta cuenta. Cierra este formulario e inicia sesión con tu cuenta personal para guardar operaciones.';form.querySelector('.mobile-form-note').after(notice);}
  notice.hidden=document.getElementById('account-role')?.textContent.trim()!=='Cuenta piloto';
  const group=form.querySelector('.mobile-operation-products');
  moveForPhone(form.querySelector('#movimiento-productos'),group);
  moveForPhone(form.querySelector('[data-add-line]'),group);
}

function networkAndDiagnostics() {
  document.querySelectorAll('.community-card').forEach(card=>{
    if(card.querySelector('.mobile-community-mark'))return;
    const mark=document.createElement('span');mark.className='mobile-community-mark mobile-only';mark.setAttribute('aria-hidden','true');
    mark.textContent=(card.querySelector('h3')?.textContent||'').split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();card.prepend(mark);
  });
  const diagnosis=document.getElementById('tab-diagnostico');
  if(diagnosis&&!diagnosis.querySelector('.mobile-scope')){
    const scope=chips([['all','Todo'],['inventory','Inventario'],['receivable','Cobros']],'Alertas por tipo',value=>{diagnosis.dataset.mobileAlertScope=value;networkAndDiagnostics();});
    diagnosis.querySelector('.diagnostic-summary')?.after(scope);
  }
  if(diagnosis){
    diagnosis.querySelectorAll('.inventory-alert').forEach(card=>{
      if(card.querySelector('.mobile-review-stock'))return;
      const action=button('Revisar producto',()=>{document.querySelector('#tab-inventario .mobile-scope [data-scope="all"]')?.click();document.dispatchEvent(new CustomEvent('abrir-inventario-producto',{detail:{id:card.dataset.productId}}));},'mobile-review-stock mobile-only');
      card.append(action);
    });
    const scope=diagnosis.dataset.mobileAlertScope||'all';
    const cards=Array.from(diagnosis.querySelectorAll('#alert-list>.alert-card'));
    cards.forEach(card=>{card.hidden=phone.matches&&scope!=='all'&&!card.classList.contains(scope==='inventory'?'inventory-alert':'receivable-alert');});
    let empty=diagnosis.querySelector('.mobile-alert-empty');
    if(!empty){empty=document.createElement('p');empty.className='mobile-alert-empty mobile-only';empty.setAttribute('role','status');diagnosis.querySelector('#alert-list')?.after(empty);}
    text(empty,scope==='receivable'?'No hay cobros pendientes en este momento.':'No hay alertas de inventario en este momento.');
    empty.hidden=!phone.matches||scope==='all'||cards.some(card=>!card.hidden);
  }
}

export function enhanceWorkspace() {
  if(!document.querySelector('.mobile-brand')){
    const brand=button('',()=>document.querySelector('.sidebar [data-tab="inicio"]')?.click(),'mobile-brand mobile-only');
    brand.setAttribute('aria-label','Pymio: ir a Inicio');const icon=document.createElement('img');icon.src='assets/pymio-icon.jpeg';icon.alt='';
    const name=document.createElement('span');name.textContent='Pymio';brand.append(icon,name);document.querySelector('.topbar')?.prepend(brand);
  }
  home();inventory();activity();analysis();forms();networkAndDiagnostics();
  const pilot=document.getElementById('account-role')?.textContent.trim()==='Cuenta piloto';
  const brand=document.querySelector('.mobile-brand');
  if(brand&&!brand.querySelector('.mobile-pilot-label')){const label=document.createElement('small');label.className='mobile-pilot-label';label.textContent='Cuenta piloto';brand.append(label);}
  const pilotLabel=brand?.querySelector('.mobile-pilot-label');if(pilotLabel)pilotLabel.hidden=!pilot;
  const network=document.getElementById('tab-ecosistema');
  if(network&&!network.querySelector('.mobile-pilot-context')){const note=document.createElement('p');note.className='mobile-pilot-context mobile-only';note.textContent='Cuenta piloto · RED con datos de demostración.';network.querySelector('.mobile-network-tabs')?.after(note);}
  const note=network?.querySelector('.mobile-pilot-context');if(note)note.hidden=!pilot;
  if(network){
    const copy=[['#sub-overview h2','Herramientas para tu negocio'],['#sub-overview .docs-intro>div>p:last-child','Accede a tu perfil, inventario e indicadores desde un solo lugar.'],['#sub-overview .doc-feature h3','Presenta tu negocio'],['#sub-overview .doc-feature p','Completa tu perfil público y comparte cómo pueden encontrarte otros negocios.'],['#sub-overview .doc-feature button','Ver mi perfil'],['#sub-overview .doc-card h3','Comprende tus ventas'],['#sub-overview .doc-card p','Consulta ventas registradas, períodos y categorías para entender tu actividad.'],['#sub-overview .doc-card:nth-of-type(4) h3','Encuentra otros negocios'],['#sub-overview .doc-card:nth-of-type(4) p','Explora perfiles y descubre empresas con las que podrías colaborar.']];
    for(const [selector,value] of copy){const node=network.querySelector(selector);if(node){if(!node.dataset.desktopCopy)node.dataset.desktopCopy=node.textContent;const desired=phone.matches?value:node.dataset.desktopCopy;if(node.textContent!==desired)node.textContent=desired;}}
    const store=network.querySelector('#sub-pymio');
    if(store&&!store.querySelector('.mobile-demo-store')){const warning=document.createElement('p');warning.className='mobile-demo-store mobile-only';warning.textContent='Vitrina de ejemplo independiente. Estos 3 artículos no representan el inventario de la cuenta piloto.';store.querySelector('#store-inventory-grid')?.before(warning);}
    const warning=store?.querySelector('.mobile-demo-store');if(warning)warning.hidden=!pilot;
  }
  const networkView=network?.querySelector('.subpanel.active')?.id;
  if(network&&network.dataset.auditView!==networkView){network.dataset.auditView=networkView||'';const feedback=network.querySelector('.ecosistema-feedback');if(feedback)feedback.hidden=true;}
  text(document.querySelector('[data-mobile-tab="dashboard"] strong'),'Análisis');
  text(document.querySelector('[data-mobile-tab="diagnostico"] strong'),'Por resolver');
  text(document.querySelector('.mobile-shortcut-list [data-go-tab="diagnostico"]>span'),'Por resolver');
  for(const [id,title] of [['inventario','Inventario'],['movimientos','Actividad'],['dashboard','Análisis'],['diagnostico','Por resolver']])text(document.querySelector(`#tab-${id} .mobile-view-title`),title);
}
phone.addEventListener('change',enhanceWorkspace);
