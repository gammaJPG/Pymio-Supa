import { offlineFetch as fetch, apiBase } from './offline.js';

const validStockStates = new Set(['Stock Normal','Stock Bajo','Sin Stock']);
let configuration = null;
let currentAlerts = [];
let pendingRefresh = null;

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

function updateSummary(count, error=false) {
  const panel=document.getElementById('tab-diagnostico');
  if (!panel) return;
  panel.querySelector('[data-alert-count]').textContent=String(count);
  panel.querySelector('[data-alert-heading]').textContent=count===1?'Alerta de inventario':'Alertas de inventario';
  panel.querySelector('[data-alert-source]').textContent=error?'No se pudo actualizar el inventario':'Estado actual de tus productos';
  panel.querySelector('[data-alert-label]').textContent=error?'Sin actualizar':count?'Requiere atención':'Sin alertas';
}

function renderEmpty(message, error=false) {
  const list=document.getElementById('alert-list');
  if (!list) return;
  list.replaceChildren();
  const card=document.createElement('div');card.className='alert-card diagnostic-empty';
  const title=document.createElement('div');title.className='alert-title';title.textContent=error?'No se pudo actualizar el diagnóstico.':'No hay alertas de stock.';
  const description=document.createElement('div');description.className='alert-desc';description.textContent=message;
  card.append(title,description);list.append(card);
}

export function renderAlerts(alerts=currentAlerts) {
  currentAlerts=alerts;
  const list=document.getElementById('alert-list');
  if (!list) return;
  updateSummary(alerts.length);
  list.replaceChildren();
  if (!alerts.length) return renderEmpty('Todos los productos tienen Stock Normal.');
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
    const extra=document.createElement('div');extra.className='alert-extra';extra.id=detailId;extra.textContent=alert.extra;
    button.onclick=()=>{const open=card.classList.toggle('open');button.setAttribute('aria-expanded',String(open));button.textContent=open?'Ocultar detalle':'Ver detalle';};
    topLeft.append(pill,title);top.append(topLeft,button);card.append(top,description,metric,extra);list.append(card);
  }
}

function publish(alerts) {
  document.dispatchEvent(new CustomEvent('diagnostico-actualizado',{detail:{alerts:alerts.map(({id,alertId,sev,title})=>({id,alertId,sev,title}))}}));
}

export async function refreshDiagnosticAlerts() {
  if (!configuration) return [];
  if (pendingRefresh) return pendingRefresh;
  pendingRefresh=(async()=>{
    try {
      const url=new URL('/api/products',configuration.apiUrl);url.searchParams.set('company_id',configuration.companyId);
      const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error(`La API respondió ${response.status}.`);
      const products=await response.json();
      if (!Array.isArray(products)) throw new Error('La API no devolvió una lista de productos.');
      const alerts=createInventoryAlerts(products);renderAlerts(alerts);publish(alerts);return alerts;
    } catch(error) {
      console.error('Diagnóstico:',error);currentAlerts=[];updateSummary(0,true);renderEmpty('Revisa la conexión e intenta actualizar los datos nuevamente.',true);publish([]);return [];
    } finally {pendingRefresh=null;}
  })();
  return pendingRefresh;
}

export function configureDiagnostics({companyId,apiUrl=apiBase}={}) {
  configuration={companyId:String(companyId),apiUrl};
  return refreshDiagnosticAlerts();
}
