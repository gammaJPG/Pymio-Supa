import { apiBase, offlineFetch } from './offline.js';
import { normalizeDashboardData, rangeForPeriod, previousRangeForPeriod, sixMonthRange, calendarMonthRange, previousCalendarMonthRange, monthRange, selectSales, summarizeSales, isLowStock } from './dashboard-data.js';

let dashboardData = normalizeDashboardData();
let dataRequest = null;
let dashboardInitialized = false;
let inicioInitialized = false;
let companyId = '1';
const today = () => new Date();

const categoryPalette=['#D9B743','#4F7CAC','#D17854','#6B8E6B','#8A6FB0','#C75C78','#3F8F8B','#A66A3F','#6F7DB8','#B779A1','#557A46','#CC8B3C','#4D8FAD','#9B6B43','#7E70A8','#B05D4E','#4B8578','#99627A','#728C40','#5E78A5','#BD7548','#69735A','#8D5E9E','#3C8C9E'];
const categoryColorMap=new Map();
function syncCategoryColors(){categoryColorMap.clear();[...new Set(dashboardData.products.map(product=>product.category||'Sin categoría'))].sort((a,b)=>a.localeCompare(b,'es')).forEach((category,index)=>categoryColorMap.set(category,categoryPalette[index]||`hsl(${index*137.508%360} 48% 48%)`));}
function categoryColor(category){return categoryColorMap.get(category)||`hsl(${[...category].reduce((sum,char)=>sum+char.charCodeAt(0),0)*137.508%360} 48% 48%)`;}
function clp(value){return '$'+Math.round(value||0).toLocaleString('es-CL');}
function number(value){return Number(value||0).toLocaleString('es-CL');}
function percentage(value){return Number(value||0).toLocaleString('es-CL',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';}

async function fetchJson(path){
  const url=new URL(path,apiBase);url.searchParams.set('company_id',companyId);
  const response=await offlineFetch(url,{cache:'no-store'});
  if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail.error||'No se pudieron cargar los datos del negocio.');}
  return response.json();
}
async function loadDashboardData(force=false){
  if(force)dataRequest=null;
  if(!dataRequest)dataRequest=Promise.all([fetchJson('/api/products'),fetchJson('/api/movements'),fetchJson('/api/customers')])
    .then(([products,movements,customers])=>dashboardData=normalizeDashboardData(products,movements,customers))
    .catch(error=>{dataRequest=null;throw error;});
  return dataRequest;
}
function setDataStatus(message,error=false){
  for(const id of ['dash-data-status','home-data-status']){const el=document.getElementById(id);if(el){el.textContent=message;el.classList.toggle('error',error);}}
}
async function refreshViews(force=false){
  setDataStatus('Actualizando desde Supabase…');
  try{
    await loadDashboardData(force);
    syncCategoryColors();
    populateDashboardFilters();
    populateMonthFilter();
    updateDashboard();
    updateInicio();
    setDataStatus('Datos reales · Supabase');
  }catch(error){
    console.error('Dashboard Supabase:',error);
    setDataStatus('No se pudieron actualizar los datos reales.',true);
  }
}

export async function configureDashboard({companyId: nextCompanyId}={}){
  companyId=String(nextCompanyId||'1');
  dataRequest=null;
  await loadDashboardData(true);
  syncCategoryColors();
  if(document.getElementById('dash-category'))populateDashboardFilters();
}

function setupInicio(){
  const preview=document.querySelector('.home-preview');
  if(!preview||preview.dataset.ready)return;
  preview.dataset.ready='true';let selected=2;const cards=[...preview.querySelectorAll('[data-preview]')];
  const select=index=>{selected=(index+cards.length)%cards.length;cards.forEach((card,i)=>{card.dataset.offset=String((i-selected+cards.length+2)%cards.length-2);card.setAttribute('aria-pressed',String(i===selected));});document.getElementById('preview-current').textContent=cards[selected].querySelector('.preview-label').textContent;};
  cards.forEach((card,i)=>card.addEventListener('click',()=>select(i)));
  preview.querySelectorAll('[data-preview-step]').forEach(button=>button.addEventListener('click',()=>select(selected+Number(button.dataset.previewStep))));
  preview.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();select(selected+(event.key==='ArrowRight'?1:-1));}});select(selected);
}
export function renderInicio(){if(!inicioInitialized){inicioInitialized=true;setupInicio();}refreshViews();}
function updateInicio(){
  if(!document.getElementById('home-income'))return;
  const current=summarizeSales(selectSales(dashboardData.sales,{...monthRange(0,today())}));
  const previous=summarizeSales(selectSales(dashboardData.sales,{...monthRange(-1,today())}));
  const change=previous.income?(current.income-previous.income)/previous.income*100:null;
  document.getElementById('home-income').textContent=clp(current.income);
  document.getElementById('home-month').textContent=today().toLocaleDateString('es-CL',{month:'long',year:'numeric'});
  document.getElementById('home-income-change').textContent=change==null?(current.income?'Nuevo':'Sin cambio'):(change>=0?'↗ ':'↘ ')+percentage(Math.abs(change));
  document.getElementById('home-count').textContent=number(current.count);
  document.getElementById('home-ticket').textContent=clp(current.ticket);
  const buckets=salesBuckets('month').map(bucket=>({...bucket,amount:selectSales(dashboardData.sales,{start:bucket.start,end:bucket.end}).flatMap(sale=>sale.items).reduce((sum,item)=>sum+item.amount,0)}));
  const max=Math.max(1,...buckets.map(bucket=>bucket.amount));
  document.getElementById('home-bars').innerHTML=buckets.map(bucket=>'<span title="'+bucket.label+': '+clp(bucket.amount)+'"><i style="height:'+Math.max(3,bucket.amount/max*80)+'px"></i><small>'+bucket.label+'</small></span>').join('');
  const totals=new Map();current.items.forEach(item=>totals.set(item.category,(totals.get(item.category)||0)+item.amount));
  const categories=[...totals].map(([category,amount])=>({category,amount})).sort((a,b)=>b.amount-a.amount);
  let angle=0;const slices=categories.map(entry=>{const start=angle;angle+=current.income?entry.amount/current.income*360:0;return categoryColor(entry.category)+' '+start+'deg '+angle+'deg';});
  const donut=document.getElementById('home-donut');donut.style.background=slices.length?'conic-gradient('+slices.join(',')+')':'#555a4b';donut.setAttribute('aria-label',categories.map(entry=>entry.category+': '+clp(entry.amount)).join(', '));
  document.getElementById('home-top-category').textContent=categories.length?categories[0].category+' · '+Math.round(categories[0].amount/current.income*100)+'% del total':'Sin ventas este mes';
}

function getDashFilters(){return {period:document.getElementById('dash-period').value,month:document.getElementById('dash-month').value,category:document.getElementById('dash-category').value};}
function historicalRange(){const dates=dashboardData.sales.map(sale=>sale.date).filter(date=>Number.isFinite(date.getTime())).sort((a,b)=>a-b);if(!dates.length)return rangeForPeriod('month',today());return {start:new Date(dates[0].getFullYear(),dates[0].getMonth(),1),end:new Date(dates.at(-1).getFullYear(),dates.at(-1).getMonth()+1,1)};}
function filterRange(filters){return filters.period==='year'?(filters.month?calendarMonthRange(filters.month):historicalRange()):rangeForPeriod(filters.period,today());}
function previousFilterRange(filters){return filters.period==='year'?(filters.month?previousCalendarMonthRange(filters.month):null):previousRangeForPeriod(filters.period,today());}
function salesFor(period,category='',month=''){return selectSales(dashboardData.sales,{...(period==='year'?(month?calendarMonthRange(month):historicalRange()):rangeForPeriod(period,today())),category});}
function monthSales(offset=0,category=''){return selectSales(dashboardData.sales,{...monthRange(offset,today()),category});}
function populateDashboardFilters(){
  const select=document.getElementById('dash-category');if(!select)return;
  const selected=select.value,categories=[...new Set(dashboardData.products.map(product=>product.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  select.replaceChildren(new Option('Todas las categorías',''),...categories.map(category=>new Option(category,category)));select.value=categories.includes(selected)?selected:'';
}
function populateMonthFilter(){const select=document.getElementById('dash-month'),selected=select.value,months=[...new Set(dashboardData.sales.map(sale=>sale.date.getFullYear()+'-'+String(sale.date.getMonth()+1).padStart(2,'0')))].sort((a,b)=>b.localeCompare(a));select.replaceChildren(new Option('Seleccionar',''),...months.map(value=>{const [year,month]=value.split('-').map(Number),date=new Date(year,month-1,1);return new Option(date.toLocaleDateString('es-CL',{month:'long',year:'numeric'}),value);}));select.value=[...select.options].some(option=>option.value===selected)?selected:'';}
function syncPeriodFilters(){const historical=document.getElementById('dash-period').value==='year',group=document.getElementById('dash-month-group'),select=document.getElementById('dash-month');group.hidden=!historical;select.disabled=!historical;}
function formatMetric(value,type){return type==='money'?clp(value):number(value);}
function setComparison(id,current,previous,{inverse=false,type='number',label='Valor'}={}){const element=document.getElementById(id),detail=`${label}: ${formatMetric(current,type)} en el período seleccionado; ${formatMetric(previous,type)} en el período anterior.`;element.dataset.tooltip=detail;element.setAttribute('aria-label',detail);if(!previous){element.textContent=current?'Nuevo':'Sin cambio';element.classList.toggle('up',Boolean(current)&&!inverse);element.classList.toggle('down',Boolean(current)&&inverse);return;}const value=(current-previous)/previous*100,up=value>=0,positive=inverse?!up:up;element.textContent=(up?'↗ ':'↘ ')+percentage(Math.abs(value));element.classList.toggle('up',positive);element.classList.toggle('down',!positive);}
function comparisonLabel(period,month){if(period==='year'&&!month)return'datos históricos';return ['month','year'].includes(period)?'vs. mes anterior':period==='today'?'vs. ayer':'vs. período anterior';}
function selectedPeriodText(filters){if(filters.period==='year')return filters.month?(document.getElementById('dash-month').selectedOptions[0]?.textContent||'Mes seleccionado'):'Histórico disponible';return document.getElementById('dash-period').selectedOptions[0].textContent;}
function updateDashboard(){
  if(!document.getElementById('dash-income'))return;
  const filters=getDashFilters(),sales=selectSales(dashboardData.sales,{...filterRange(filters),category:filters.category}),summary=summarizeSales(sales);
  const current=summary,previousRange=previousFilterRange(filters),previous=previousRange?summarizeSales(selectSales(dashboardData.sales,{...previousRange,category:filters.category})):null;
  const lowProducts=dashboardData.products.filter(product=>isLowStock(product)&&(!filters.category||product.category===filters.category));
  const periodLabel=selectedPeriodText(filters);
  document.getElementById('dash-income-label').textContent='Ventas · '+periodLabel.toLowerCase();
  document.getElementById('dash-income').textContent=clp(summary.income);
  document.getElementById('dash-sales-count').textContent=number(summary.count);
  document.getElementById('dash-ticket-average').textContent=clp(summary.ticket);
  document.getElementById('dash-low-count').textContent=number(lowProducts.length);
  document.getElementById('dash-pending-count').textContent=number(summary.pending);
  document.getElementById('dash-active-clients').textContent=number(summary.clients);
  if(previous){setComparison('dash-sales-change',current.count,previous.count,{label:'Número de ventas'});setComparison('dash-income-change',current.income,previous.income,{type:'money',label:'Ingresos por ventas'});setComparison('dash-ticket-change',current.ticket,previous.ticket,{type:'money',label:'Ticket promedio'});setComparison('dash-pending-change',current.pending,previous.pending,{inverse:true,label:'Ventas pendientes de pago'});setComparison('dash-clients-change',current.clients,previous.clients,{label:'Clientes distintos con ventas'});}else{[['dash-sales-change',current.count,'Número de ventas','number'],['dash-income-change',current.income,'Ingresos por ventas','money'],['dash-ticket-change',current.ticket,'Ticket promedio','money'],['dash-pending-change',current.pending,'Ventas pendientes de pago','number'],['dash-clients-change',current.clients,'Clientes distintos con ventas','number']].forEach(([id,value,label,type])=>{const element=document.getElementById(id),detail=`${label}: ${formatMetric(value,type)} en todo el histórico disponible.`;element.textContent='Total';element.dataset.tooltip=detail;element.setAttribute('aria-label',detail);element.classList.remove('up','down');});}
  document.querySelectorAll('[data-comparison-label]').forEach(label=>label.textContent=comparisonLabel(filters.period,filters.month));
  const chartSales=filters.period==='month'?selectSales(dashboardData.sales,{...sixMonthRange(today()),category:filters.category}):sales;
  renderTopProducts(summary.items);renderSalesBars(chartSales,filters);renderPie(sales);renderInsight(lowProducts);
}
function renderTopProducts(items){
  const totals=new Map();items.forEach(item=>{const row=totals.get(item.productId)||{name:item.name,category:item.category,units:0,amount:0};row.units+=item.units;row.amount+=item.amount;totals.set(item.productId,row);});
  const top=[...totals.values()].sort((a,b)=>b.units-a.units||b.amount-a.amount).slice(0,3),container=document.getElementById('dash-top-products');container.replaceChildren();
  if(!top.length){const empty=document.createElement('div');empty.className='empty-state';empty.textContent='No hay ventas en este período.';container.append(empty);return;}
  top.forEach((product,index)=>{const row=document.createElement('div');row.className='top-product';const rank=document.createElement('span');rank.className='top-rank';rank.textContent=index+1;const info=document.createElement('div');const name=document.createElement('strong');name.textContent=product.name;const category=document.createElement('small');category.textContent=product.category;info.append(name,category);const total=document.createElement('div');total.className='top-total';const units=document.createElement('strong');units.textContent=number(product.units)+' unidades';const income=document.createElement('small');income.textContent=clp(product.amount)+' en ventas';total.append(units,income);row.append(rank,info,total);container.append(row);});
}
function renderInsight(lowProducts){
  const title=document.getElementById('dash-insight-title'),description=document.getElementById('dash-insight-description'),foot=document.getElementById('dash-insight-foot');
  if(!lowProducts.length){title.textContent='Tu inventario está bajo control.';description.textContent='No hay productos con stock bajo para la categoría seleccionada.';foot.textContent='Señal calculada desde el inventario actual';return;}
  const counts=new Map();lowProducts.forEach(product=>counts.set(product.category,(counts.get(product.category)||0)+1));const [category,count]=[...counts].sort((a,b)=>b[1]-a[1])[0];
  title.textContent='Una señal que merece atención.';description.textContent=(lowProducts.length===1?'Hay 1 producto':'Hay '+lowProducts.length+' productos')+' con stock bajo en total. '+(count===1?'1 está':count+' están')+' en '+category+'. Revisa existencias antes de la próxima venta.';foot.textContent='Mismo criterio del KPI · Inventario actual';
}
function salesBuckets(period,month=''){
  if(period==='month')return Array.from({length:6},(_,index)=>{const start=new Date(today().getFullYear(),today().getMonth()-5+index,1),end=new Date(today().getFullYear(),today().getMonth()-4+index,1);return {start,end,label:start.toLocaleDateString('es-CL',{month:'short'}),long:start.toLocaleDateString('es-CL',{month:'long',year:'numeric'})};});
  if(period==='year'&&!month){const {start,end}=historicalRange(),buckets=[];for(let date=new Date(start);date<end;date=new Date(date.getFullYear(),date.getMonth()+1,1)){const next=new Date(date.getFullYear(),date.getMonth()+1,1);buckets.push({start:new Date(date),end:next,label:date.toLocaleDateString('es-CL',{month:'short'}),long:date.toLocaleDateString('es-CL',{month:'long',year:'numeric'})});}return buckets;}
  const {start,end}=period==='year'?calendarMonthRange(month):rangeForPeriod(period,today());
  if(period==='today')return Array.from({length:5},(_,i)=>{const a=new Date(start),b=new Date(start);a.setHours(i*5);b.setHours(Math.min(24,(i+1)*5));return {start:a,end:b,label:String(i*5).padStart(2,'0')+' h',long:String(i*5).padStart(2,'0')+':00–'+(i===4?'23:59':String((i+1)*5).padStart(2,'0')+':00')};});
  const buckets=[];for(let a=new Date(start);a<end;){const b=new Date(a);b.setDate(b.getDate()+(period==='7'?1:7));if(b>end)b.setTime(end.getTime());const last=new Date(b);last.setDate(last.getDate()-1);const fmt=date=>date.toLocaleDateString('es-CL',{day:'numeric',month:'short'});buckets.push({start:new Date(a),end:new Date(b),label:period==='7'?a.toLocaleDateString('es-CL',{weekday:'short'}):a.getDate()+'–'+last.getDate(),long:period==='7'?fmt(a):fmt(a)+' – '+fmt(last)});a=b;}return buckets;
}
function compactMoney(value){if(value>=1000000)return '$'+(value/1000000).toLocaleString('es-CL',{maximumFractionDigits:2})+' M';if(value>=1000)return '$'+(value/1000).toLocaleString('es-CL',{maximumFractionDigits:1})+' mil';return clp(value);}
function renderSalesBars(sales,filters){
  const buckets=salesBuckets(filters.period,filters.month).map(bucket=>({...bucket,amount:0,units:0}));
  sales.forEach(sale=>sale.items.forEach(item=>{const bucket=buckets.find(entry=>sale.date>=entry.start&&sale.date<entry.end);if(bucket){bucket.amount+=item.amount;bucket.units+=item.units;}}));
  const max=Math.max(1,...buckets.map(bucket=>bucket.amount)),periodText=selectedPeriodText(filters),container=document.getElementById('dash-sales-bars'),detail=document.getElementById('dash-bar-detail');
  const summary=bucket=>bucket.long+' · Ingresos: '+clp(bucket.amount)+' · '+number(bucket.units)+' unidades vendidas';const hint=sales.length?periodText+' · '+(getDashFilters().category||'Todas las categorías'):'No hay ventas para este período y categoría.';
  container.setAttribute('aria-label','Ventas de '+periodText.toLowerCase()+'. '+(getDashFilters().category||'Todas las categorías'));detail.textContent=hint;
  container.innerHTML=buckets.map((bucket,index)=>'<div class="sales-bar-col"><div class="sales-bar-value" aria-label="'+clp(bucket.amount)+'"><span class="bar-money-full">'+clp(bucket.amount)+'</span><span class="bar-money-short" aria-hidden="true">'+compactMoney(bucket.amount)+'</span></div><button type="button" class="sales-bar" data-index="'+index+'" aria-pressed="false" aria-label="'+summary(bucket)+'" style="height:'+Math.max(4,bucket.amount/max*180)+'px"><span class="bar-tooltip">'+bucket.long+'<br>'+clp(bucket.amount)+' · '+number(bucket.units)+' unidades</span></button><span class="sales-bar-label">'+bucket.label+'</span></div>').join('');
  let selected=-1;const restore=()=>detail.textContent=selected<0?hint:summary(buckets[selected]);container.querySelectorAll('.sales-bar').forEach((button,index)=>{const show=()=>detail.textContent=summary(buckets[index]);button.addEventListener('mouseenter',show);button.addEventListener('focus',show);button.addEventListener('mouseleave',restore);button.addEventListener('blur',restore);button.addEventListener('click',()=>{selected=selected===index?-1:index;container.querySelectorAll('.sales-bar').forEach((bar,i)=>{bar.classList.toggle('selected',selected===i);bar.setAttribute('aria-pressed',String(selected===i));});restore();});});
}
function categoryDetails(sales,category){const all=summarizeSales(sales),rows=summarizeSales(sales.map(sale=>({...sale,items:sale.items.filter(item=>item.category===category)})).filter(sale=>sale.items.length)),products=new Map();rows.items.forEach(item=>{const product=products.get(item.productId)||{name:item.name,units:0,amount:0};product.units+=item.units;product.amount+=item.amount;products.set(item.productId,product);});return {amount:rows.income,share:all.income?rows.income/all.income*100:0,top:[...products.values()].sort((a,b)=>b.units-a.units||b.amount-a.amount).slice(0,3)};}
function openCategoryDetail(category){
  document.querySelector('#category-dialog h3').textContent='3 productos más vendidos';document.querySelector('#category-dialog .dialog-note').textContent='Ordenados por unidades vendidas en el período seleccionado.';document.getElementById('dash-attention-link').hidden=true;
  const filters=getDashFilters(),data=categoryDetails(salesFor(filters.period,'',filters.month),category);document.getElementById('category-dialog-title').textContent=category;document.getElementById('category-dialog-period').textContent=selectedPeriodText(filters)+' · Ventas reales de esta categoría';document.getElementById('category-dialog-share').textContent=percentage(data.share);document.getElementById('category-dialog-income').textContent=clp(data.amount)+' en ingresos · participación en el total del período';
  const list=document.getElementById('category-dialog-products');list.replaceChildren();data.top.forEach((product,index)=>{const row=document.createElement('li'),rank=document.createElement('span'),info=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small');rank.className='top-rank';rank.textContent=index+1;info.className='product-info';name.textContent=product.name;detail.textContent=number(product.units)+' unidades · '+clp(product.amount);info.append(name,detail);row.append(rank,info);list.append(row);});document.getElementById('category-dialog-note').textContent=data.top.length===0?'No hay productos vendidos en esta categoría durante el período.':'';const dialog=document.getElementById('category-dialog');if(!dialog.open)dialog.showModal();
}
function donutPath(start,end){const point=(angle,r)=>[150+Math.sin(angle)*r,150-Math.cos(angle)*r].join(' '),middle=(start+end)/2;return 'M '+point(start,134)+' A 134 134 0 0 1 '+point(middle,134)+' A 134 134 0 0 1 '+point(end,134)+' L '+point(end,75)+' A 75 75 0 0 0 '+point(middle,75)+' A 75 75 0 0 0 '+point(start,75)+' Z';}
function renderPie(sales){
  const summary=summarizeSales(sales),totals=new Map();summary.items.forEach(item=>totals.set(item.category,(totals.get(item.category)||0)+item.amount));const entries=[...totals].filter(([,amount])=>amount>0),chart=document.getElementById('dash-pie'),legend=document.getElementById('dash-pie-legend');chart.replaceChildren();legend.replaceChildren();chart.style.background='none';if(!summary.income){legend.textContent='Sin ventas para el período seleccionado.';return;}
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 300 300');svg.setAttribute('class','donut-svg');let angle=0;entries.forEach(([category,amount])=>{const end=angle+amount/summary.income*Math.PI*2,color=categoryColor(category),label=category+' · '+percentage(amount/summary.income*100)+' · '+clp(amount),path=document.createElementNS(ns,'path');path.setAttribute('d',donutPath(angle,end));path.setAttribute('fill',color);path.setAttribute('class','donut-sector');path.addEventListener('click',()=>openCategoryDetail(category));const title=document.createElementNS(ns,'title');title.textContent=label;path.append(title);svg.append(path);angle=end;const button=document.createElement('button');button.type='button';button.className='pie-legend-item';button.setAttribute('aria-haspopup','dialog');const dot=document.createElement('span'),info=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');dot.className='pie-dot';dot.style.background=color;name.textContent=category;detail.textContent=percentage(amount/summary.income*100)+' · '+clp(amount);info.append(name,detail);button.append(dot,info);button.addEventListener('click',()=>openCategoryDetail(category));legend.append(button);});const center=document.createElementNS(ns,'text');center.setAttribute('x','150');center.setAttribute('y','153');center.setAttribute('text-anchor','middle');center.setAttribute('class','donut-center');center.textContent='Toca una categoría';svg.append(center);chart.append(svg);
}

export function renderDashboard(){
  if(!dashboardInitialized){dashboardInitialized=true;document.getElementById('dash-date').textContent=today().toLocaleDateString('es-CL',{month:'long',year:'numeric'});populateMonthFilter();syncPeriodFilters();document.querySelectorAll('#dash-period,#dash-month,#dash-category').forEach(element=>element.addEventListener('change',()=>{syncPeriodFilters();updateDashboard();}));const dialog=document.getElementById('category-dialog');document.getElementById('category-dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===event.currentTarget)dialog.close();});document.getElementById('dash-low-stock').addEventListener('click',()=>openAttention('low'));document.getElementById('dash-pending').addEventListener('click',()=>openAttention('pending'));}
  refreshViews();
}
function openAttention(kind){
  const low=kind==='low',filters=getDashFilters(),link=document.getElementById('dash-attention-link');link.hidden=false;link.dataset.goTab=low?'inventario':'movimientos';link.textContent=low?'Abrir inventario ↗':'Abrir movimientos ↗';link.onclick=()=>document.getElementById('category-dialog').close();
  const rows=low?dashboardData.products.filter(product=>isLowStock(product)&&(!filters.category||product.category===filters.category)):salesFor(filters.period,filters.category,filters.month).filter(sale=>sale.status==='Pendiente de Pago');document.getElementById('category-dialog-title').textContent=low?'Productos con stock bajo':'Ventas por cobrar';document.getElementById('category-dialog-period').textContent=(low?'Inventario actual':selectedPeriodText(filters))+' · Datos reales';document.getElementById('category-dialog-share').textContent=number(rows.length);document.getElementById('category-dialog-income').textContent=low?'Productos que necesitan atención':'Transacciones pendientes de pago';document.querySelector('#category-dialog h3').textContent=low?'Stock disponible':'Detalle de pendientes';document.querySelector('#category-dialog .dialog-note').textContent=low?'Existencias actuales según el umbral configurado.':'Ventas pendientes en el período seleccionado.';const list=document.getElementById('category-dialog-products');list.replaceChildren();rows.forEach(row=>{const item=document.createElement('li');item.textContent=low?row.name+' · '+number(row.qty)+' unidades':row.id+' · '+(row.customerName||'Sin cliente')+' · '+clp(summarizeSales([row]).income);list.append(item);});document.getElementById('category-dialog-note').textContent=rows.length?'':'No hay registros para esta selección.';document.getElementById('category-dialog').showModal();
}
