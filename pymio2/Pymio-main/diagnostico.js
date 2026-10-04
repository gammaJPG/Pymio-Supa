import { offlineFetch as fetch, apiBase } from './offline.js';
import { datosMovimientoPagado } from './movimientos-vista.js';

const validStockStates = new Set(['Stock Normal','Stock Bajo','Sin Stock']);
let configuration = null;
let currentAlerts = [];
let pendingRefresh = null;
let receivablePostponements = {};
const dayMs = 86400000;
const currency = new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});

export function productStockState(product) {
  if (validStockStates.has(product?.['Estado Stock'])) return product['Estado Stock'];
  const quantity = Number(product?.qty);
  const lowQuantity = Number(product?.low_qty);
  if (quantity === 0) return 'Sin Stock';
  if (Number.isFinite(quantity) && Number.isFinite(lowQuantity) && quantity < lowQuantity) return 'Stock Bajo';
  return 'Stock Normal';
}

const safeId = value => String(value ?? '').replace(/[^a-z0-9_-]/gi,'-');

export function createInventoryAlerts(products = []) {
  const alerts=[];
  for (const product of products) {
    const state=productStockState(product);
    if (!['Sin Stock','Stock Bajo'].includes(state)) continue;
    const quantity=Number(product.qty) || 0;
    const lowQuantity=Number(product.low_qty) || 0;
    const critical=state === 'Sin Stock';
    alerts.push({
      id:`stock-${safeId(product.id)}`,
      alertId:`diagnostico-producto-${safeId(product.id)}`,
      productId:String(product.id),
      sev:critical?'critical':'warn',
      tag:state,
      title:critical?`Sin stock: ${product.name}`:`Stock bajo: ${product.name}`,
      desc:critical
        ? `El producto "${product.name}" no tiene unidades disponibles.`
        : `El producto "${product.name}" tiene ${quantity.toLocaleString('es-CL')} unidades, por debajo de su límite de stock bajo (${lowQuantity.toLocaleString('es-CL')}).`,
      metric:`Stock actual: ${quantity.toLocaleString('es-CL')} unidades`,
      extra:critical
        ? 'Revisa las próximas compras o registra un ingreso para recuperar disponibilidad.'
        : 'Revisa la reposición de este producto antes de que se agote.'
    });
  }
  return alerts;
}

export function createReceivableAlerts(movements = [], now = new Date(), postponements = {}) {
  const currentTime=now.getTime();
  return movements.flatMap(movement => {
    const occurredAt=new Date(movement?.occurred_at).getTime();
    const postponedUntil=new Date(postponements[movement?.code] || 0).getTime();
    const isPending=(movement?.Estado || 'Pagado') === 'Pendiente de Pago';
    if (movement?.operation_detail !== 'Venta' || !isPending || !Number.isFinite(occurredAt) || currentTime-occurredAt < 3*dayMs || postponedUntil>currentTime) return [];
    const elapsedDays=Math.max(3,Math.floor((currentTime-occurredAt)/dayMs));
    const customer=String(movement.customer_name || movement.customer?.name || '').trim();
    return [{
      kind:'receivable',id:`receivable-${safeId(movement.code)}`,alertId:`diagnostico-cobro-${safeId(movement.code)}`,
      movementCode:String(movement.code),movement,sev:'warn',tag:'Venta por cobrar',
      title:`Cobro pendiente${customer?`: ${customer}`:''}`,
      desc:`La venta ${movement.code} lleva ${elapsedDays} días pendiente de pago.`,
      metric:`Monto pendiente: ${currency.format(Number(movement.total) || 0)}`,
      extra:'Pospón el seguimiento indicando una cantidad de días o marca la venta como cobrada.'
    }];
  });
}

function postponementKey() { return `pymio:receivable-postponements:${configuration?.companyId || 'unknown'}`; }
function loadPostponements() {
  try { return JSON.parse(localStorage.getItem(postponementKey()) || '{}'); } catch { return {}; }
}
function savePostponements() { localStorage.setItem(postponementKey(),JSON.stringify(receivablePostponements)); }
function emitActivity(title,description) {
  document.dispatchEvent(new CustomEvent('diagnostico-actividad',{detail:{title,description,destination:'movimientos'}}));
}

function updateSummary(count, error=false) {
  const panel=document.getElementById('tab-diagnostico');
  if (!panel) return;
  panel.querySelector('[data-alert-count]').textContent=String(count);
  panel.querySelector('[data-alert-heading]').textContent=count===1?'Alerta activa':'Alertas activas';
  panel.querySelector('[data-alert-source]').textContent=error?'No se pudo actualizar el diagnóstico':'Inventario y ventas por cobrar';
  panel.querySelector('[data-alert-label]').textContent=error?'Sin actualizar':count?'Requiere atención':'Sin alertas';
}

function renderEmpty(message, error=false) {
  const list=document.getElementById('alert-list');
  if (!list) return;
  list.replaceChildren();
  const card=document.createElement('div');card.className='alert-card diagnostic-empty';
  const title=document.createElement('div');title.className='alert-title';title.textContent=error?'No se pudo actualizar el diagnóstico.':'No hay alertas pendientes.';
  const description=document.createElement('div');description.className='alert-desc';description.textContent=message;
  card.append(title,description);list.append(card);
}

export function renderAlerts(alerts=currentAlerts) {
  currentAlerts=alerts;
  const list=document.getElementById('alert-list');
  if (!list) return;
  updateSummary(alerts.length);
  list.replaceChildren();
  if (!alerts.length) return renderEmpty('El inventario está normal y no hay ventas vencidas por cobrar.');
  for (const alert of alerts) {
    const card=document.createElement('article');card.className=`alert-card ${alert.sev}`;card.id=alert.alertId;
    const top=document.createElement('div');top.className='alert-top';
    const topLeft=document.createElement('div');topLeft.className='alert-top-left';
    const pill=document.createElement('span');pill.className=`pill ${alert.sev==='critical'?'out':'low'}`;pill.textContent=alert.tag;
    const title=document.createElement('span');title.className='alert-title';
    const titleMatch=alert.title.match(/^(Sin stock|Stock bajo):\s*(.*)$/i);
    if(titleMatch){const prefix=document.createElement('span');prefix.className='alert-title-prefix';prefix.textContent=`${titleMatch[1]}: `;title.append(prefix,document.createTextNode(titleMatch[2]));}
    else title.textContent=alert.title;
    const detailId=`${alert.alertId}-extra`;
    const button=document.createElement('button');button.type='button';button.className='expand-btn';button.textContent='Ver detalle';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',detailId);
    const description=document.createElement('div');description.className='alert-desc';description.textContent=alert.desc;
    const metric=document.createElement('div');metric.className='alert-metric';metric.textContent=alert.metric;
    const extra=document.createElement('div');extra.className='alert-extra';extra.id=detailId;
    const extraText=document.createElement('p');extraText.textContent=alert.extra;
    extra.append(extraText);
    if (alert.kind==='receivable') {
      const actions=document.createElement('div');actions.className='diagnostic-receivable-actions';
      const field=document.createElement('label');field.className='diagnostic-postpone-field';field.textContent='Días a posponer';
      const days=document.createElement('input');days.type='number';days.min='1';days.max='365';days.step='1';days.value='3';days.inputMode='numeric';field.append(days);
      const postpone=document.createElement('button');postpone.type='button';postpone.className='btn-secondary';postpone.textContent='Posponer';
      const resolve=document.createElement('button');resolve.type='button';resolve.className='btn-primary';resolve.textContent='Marcar como cobrada';
      const feedback=document.createElement('p');feedback.className='diagnostic-action-feedback';feedback.setAttribute('role','status');
      postpone.onclick=async()=>{
        const amount=Number(days.value);
        if (!Number.isInteger(amount) || amount<1 || amount>365) { feedback.textContent='Ingresa entre 1 y 365 días.';days.focus();return; }
        receivablePostponements[alert.movementCode]=new Date(Date.now()+amount*dayMs).toISOString();savePostponements();
        emitActivity('Cobro pospuesto',`El cobro de la venta ${alert.movementCode} fue pospuesto por ${amount} ${amount===1?'día':'días'}.`);
        await refreshDiagnosticAlerts();
      };
      resolve.onclick=async()=>{
        resolve.disabled=postpone.disabled=days.disabled=true;feedback.textContent='Actualizando cobro…';
        try {
          const url=new URL(`/api/movements/${encodeURIComponent(alert.movementCode)}`,configuration.apiUrl);url.searchParams.set('company_id',configuration.companyId);
          const response=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(datosMovimientoPagado(alert.movement,crypto.randomUUID())),signal:AbortSignal.timeout(20000)});
          const result=await response.json();if(!response.ok)throw new Error(result.error || 'No se pudo marcar la venta como cobrada.');
          delete receivablePostponements[alert.movementCode];savePostponements();
          emitActivity('Situación resuelta',`La venta ${alert.movementCode} fue marcada como cobrada${result.queued?' y se sincronizará al recuperar la conexión':''}.`);
          document.dispatchEvent(new CustomEvent('movimientos-sincronizados'));
          await refreshDiagnosticAlerts();
        } catch(error) { feedback.textContent=error.message;resolve.disabled=postpone.disabled=days.disabled=false; }
      };
      actions.append(field,postpone,resolve);extra.append(actions,feedback);
    } else {
      const editButton=document.createElement('button');editButton.type='button';editButton.className='btn-secondary diagnostic-product-action';editButton.textContent='Realizar compra';
      editButton.onclick=()=>document.dispatchEvent(new CustomEvent('realizar-compra-producto',{detail:{id:alert.productId}}));extra.append(editButton);
    }
    button.onclick=()=>{const open=card.classList.toggle('open');button.setAttribute('aria-expanded',String(open));button.textContent=open?'Ocultar detalle':'Ver detalle';};
    topLeft.append(pill,title);top.append(topLeft,button);card.append(top,description,metric,extra);list.append(card);
  }
}

function publish(alerts) {
  document.dispatchEvent(new CustomEvent('diagnostico-actualizado',{detail:{alerts:alerts.map(({id,alertId,productId,movementCode,sev,title,desc})=>({id,alertId,productId,movementCode,sev,title,desc,requiresResolution:true}))}}));
}

document.addEventListener?.('venta-cerrada',event=>{
  const movementCode=String(event.detail?.code||'');
  if (!movementCode) return;
  currentAlerts=currentAlerts.filter(alert=>alert.movementCode!==movementCode);
  delete receivablePostponements[movementCode];
  if (configuration) savePostponements();
  renderAlerts(currentAlerts);publish(currentAlerts);
});

export async function refreshDiagnosticAlerts() {
  if (!configuration) return [];
  if (pendingRefresh) return pendingRefresh;
  pendingRefresh=(async()=>{
    try {
      const productsUrl=new URL('/api/products',configuration.apiUrl),movementsUrl=new URL('/api/movements',configuration.apiUrl);
      productsUrl.searchParams.set('company_id',configuration.companyId);movementsUrl.searchParams.set('company_id',configuration.companyId);movementsUrl.searchParams.set('limit','500');
      const [productsResponse,movementsResponse]=await Promise.all([fetch(productsUrl,{cache:'no-store',signal:AbortSignal.timeout(15000)}),fetch(movementsUrl,{cache:'no-store',signal:AbortSignal.timeout(15000)})]);
      if (!productsResponse.ok || !movementsResponse.ok) throw new Error(`La API respondió ${productsResponse.ok?movementsResponse.status:productsResponse.status}.`);
      const [products,movements]=await Promise.all([productsResponse.json(),movementsResponse.json()]);
      if (!Array.isArray(products) || !Array.isArray(movements)) throw new Error('La API no devolvió datos válidos para el diagnóstico.');
      const alerts=[...createInventoryAlerts(products),...createReceivableAlerts(movements,new Date(),receivablePostponements)];renderAlerts(alerts);publish(alerts);return alerts;
    } catch(error) {
      console.error('Diagnóstico:',error);currentAlerts=[];updateSummary(0,true);renderEmpty('Revisa la conexión e intenta actualizar los datos nuevamente.',true);publish([]);return [];
    } finally {pendingRefresh=null;}
  })();
  return pendingRefresh;
}

export function configureDiagnostics({companyId,apiUrl=apiBase}={}) {
  configuration={companyId:String(companyId),apiUrl};
  receivablePostponements=loadPostponements();
  return refreshDiagnosticAlerts();
}
