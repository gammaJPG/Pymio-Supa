const inventory = [];
export function renderInicio() {
  const total = monthSales(0).reduce((sum, sale) => sum + sale.amount, 0);
  const previous = monthSales(-1).reduce((sum, sale) => sum + sale.amount, 0);
  const change = changePercent(total, previous);
  document.getElementById('home-income').textContent = clp(total);
  document.getElementById('home-month').textContent = demoToday.toLocaleDateString('es-CL', {month:'long',year:'numeric'});
  document.getElementById('home-income-change').textContent = (change >= 0 ? '↗ ' : '↘ ') + Math.abs(change).toLocaleString('es-CL', {minimumFractionDigits:1,maximumFractionDigits:1}) + '%';
  const sales=monthSales(0);
  document.getElementById('home-count').textContent=number(sales.length);
  document.getElementById('home-ticket').textContent=clp(sales.length?total/sales.length:0);
  const buckets=salesBuckets('month').map(b=>({...b,amount:sales.filter(t=>t.date>=b.start&&t.date<b.end).reduce((sum,t)=>sum+t.amount,0)}));
  const max=Math.max(1,...buckets.map(b=>b.amount));
  document.getElementById('home-bars').innerHTML=buckets.map(b=>'<span title="'+b.label+': '+clp(b.amount)+'"><i style="height:'+Math.max(3,b.amount/max*80)+'px"></i><small>'+b.label+'</small></span>').join('');
  const categories=[...new Set(sales.map(t=>t.cat))].map(cat=>({cat,amount:sales.filter(t=>t.cat===cat).reduce((sum,t)=>sum+t.amount,0)})).sort((a,b)=>b.amount-a.amount);
  let angle=0;const slices=categories.map(c=>{const start=angle;angle+=total?c.amount/total*360:0;return categoryColor(c.cat)+' '+start+'deg '+angle+'deg';});
  document.getElementById('home-donut').style.background=slices.length?'conic-gradient('+slices.join(',')+')':'#555a4b';
  document.getElementById('home-donut').setAttribute('aria-label',categories.map(c=>c.cat+': '+clp(c.amount)).join(', '));
  document.getElementById('home-top-category').textContent=categories.length?categories[0].cat+' · '+Math.round(categories[0].amount/total*100)+'% del total':'Sin ventas este mes';
  const preview=document.querySelector('.home-preview');
  if(!preview.dataset.ready){preview.dataset.ready='true';let selected=2;const cards=[...preview.querySelectorAll('[data-preview]')];const select=index=>{selected=(index+5)%5;cards.forEach((card,i)=>{card.dataset.offset=String((i-selected+7)%5-2);card.setAttribute('aria-pressed',String(i===selected));});document.getElementById('preview-current').textContent=cards[selected].querySelector('.preview-label').textContent;};cards.forEach((card,i)=>card.addEventListener('click',()=>select(i)));preview.querySelectorAll('[data-preview-step]').forEach(button=>button.addEventListener('click',()=>select(selected+Number(button.dataset.previewStep))));preview.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();select(selected+(event.key==='ArrowRight'?1:-1));}});select(selected);}

}
  const dashProducts = [
    {name:'Arroz 1 kg',cat:'Abarrotes',units:420,price:1890,cost:1280,status:'ok'},
    {name:'Fideos spaghetti 400 g',cat:'Abarrotes',units:365,price:1190,cost:760,status:'ok'},
    {name:'Aceite vegetal 1 L',cat:'Abarrotes',units:245,price:2390,cost:1740,status:'low'},
    {name:'Coca-Cola 1.5 L',cat:'Bebidas',units:510,price:2190,cost:1450,status:'ok'},
    {name:'Agua mineral 1.5 L',cat:'Bebidas',units:330,price:1190,cost:690,status:'ok'},
    {name:'Jugo naranja 1 L',cat:'Bebidas',units:275,price:1690,cost:1080,status:'low'},
    {name:'Leche entera 1 L',cat:'Lácteos',units:390,price:1290,cost:890,status:'ok'},
    {name:'Yogur natural',cat:'Lácteos',units:285,price:690,cost:430,status:'ok'},
    {name:'Papas fritas 250 g',cat:'Snacks',units:315,price:1990,cost:1190,status:'ok'},
    {name:'Chocolate barra',cat:'Snacks',units:260,price:1490,cost:880,status:'out'},
    {name:'Detergente 1 L',cat:'Limpieza',units:190,price:3290,cost:2180,status:'ok'},
    {name:'Lavalozas 750 ml',cat:'Limpieza',units:175,price:2190,cost:1390,status:'low'},
    {name:'Shampoo 400 ml',cat:'Cuidado personal',units:145,price:3990,cost:2590,status:'ok'},
    {name:'Jabón líquido',cat:'Cuidado personal',units:160,price:2490,cost:1540,status:'ok'}
  ];

  const categoryColors={
    abarrotes:'#FFDD99',
    bebidas:'#F4B860',
    lacteos:'#F2E9E4',
    limpieza:'#A3A380',
    hogar:'#20231E',
    snacks:'#E07A5F',
    'cuidado personal':'#8F5D3B',
    otros:'#6B705C'
  };
  function categoryColor(category){
    const key=category.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    return categoryColors[key]||categoryColors.otros;
  }
  // Datos de demostración: cada transacción es una venta con cantidad y estado de pago.
  dashProducts.forEach((p,i)=>{
    p.sku='DEMO-'+String(i+1).padStart(3,'0');
    inventory.push({...p,qty:p.status==='out'?0:p.status==='low'?4+i%5:35+i*7});
  });
  const demoToday=new Date();demoToday.setHours(0,0,0,0);
  const transactions=[];
  for(let day=0;day<75;day++){
    dashProducts.forEach((p,i)=>{
      const date=new Date(demoToday);date.setDate(date.getDate()-day);
      const qty=Math.max(1,Math.round(p.units/30*(0.55+((day*7+i*3)%13)/10)));
      date.setHours(9+(i*3+day)%13);
      transactions.push({id:'VT-'+String(transactions.length+1).padStart(4,'0'),date,sku:p.sku,cat:p.cat,name:p.name,qty,amount:qty*p.price,status:(day*14+i)%89===0?'pending':'paid'});
    });
  }
  function clp(v){return '$'+Math.round(v).toLocaleString('es-CL');}
  function number(v){return v.toLocaleString('es-CL');}
  function getDashFilters(){return {period:document.getElementById('dash-period').value,category:document.getElementById('dash-category').value};}
  function periodStart(period){
    const start=new Date(demoToday);
    if(period==='month')start.setDate(1);
    else if(period==='30'||period==='7')start.setDate(start.getDate()-Number(period)+1);
    return start;
  }
  function periodSales(period,category=''){
    const start=periodStart(period),end=new Date(demoToday);end.setDate(end.getDate()+1);
    return transactions.filter(t=>t.date>=start&&t.date<end&&(!category||t.cat===category));
  }
  function populateDashboardFilters(){
    const fill=(id,cats)=>{const el=document.getElementById(id),selected=el.value;el.innerHTML='<option value="">Todas las categorías</option>'+cats.map(c=>'<option>'+c+'</option>').join('');el.value=selected;};
    fill('dash-category',[...new Set(inventory.map(p=>p.cat))]);

  }
  function monthRange(offset=0){
    const start=new Date(demoToday.getFullYear(),demoToday.getMonth()+offset,1),end=new Date(demoToday.getFullYear(),demoToday.getMonth()+offset+1,1);
    return {start,end};
  }
  function monthSales(offset=0,category=''){
    const {start,end}=monthRange(offset);
    return transactions.filter(t=>t.date>=start&&t.date<end&&(!category||t.cat===category));
  }
  function changePercent(current,previous){
    if(!previous)return current?100:0;
    return (current-previous)/previous*100;
  }
  function setChange(id,value,{inverse=false}={}){
    const element=document.getElementById(id),up=value>=0,positive=inverse?!up:up;
    element.textContent=(up?'↗ ':'↘ ')+Math.abs(value).toLocaleString('es-CL',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
    element.classList.toggle('up',positive);element.classList.toggle('down',!positive);
  }
  function updateDashboard(){
    const f=getDashFilters(),sales=periodSales(f.period,f.category),all=periodSales(f.period);
    const income=sales.reduce((sum,t)=>sum+t.amount,0),currentMonth=monthSales(0,f.category),previousMonth=monthSales(-1,f.category);
    const currentIncome=currentMonth.reduce((sum,t)=>sum+t.amount,0),previousIncome=previousMonth.reduce((sum,t)=>sum+t.amount,0);
    const currentTicket=currentMonth.length?currentIncome/currentMonth.length:0,previousTicket=previousMonth.length?previousIncome/previousMonth.length:0;
    document.getElementById('dash-sales-count').textContent=number(sales.length);
    document.getElementById('dash-income').textContent=clp(income);
    document.getElementById('dash-ticket-average').textContent=clp(sales.length?income/sales.length:0);
    document.getElementById('dash-low-count').textContent=number(inventory.filter(p=>p.status==='low'&&(!f.category||p.cat===f.category)).length);
    const visibleTransactions=transactions.slice(0,45*dashProducts.length);
    document.getElementById('dash-pending-count').textContent=number(visibleTransactions.filter(t=>t.status==='pending').length);
    setChange('dash-sales-change',changePercent(currentMonth.length,previousMonth.length));
    setChange('dash-income-change',changePercent(currentIncome,previousIncome));
    setChange('dash-ticket-change',changePercent(currentTicket,previousTicket));
    setChange('dash-stock-change',-25,{inverse:true});
    setChange('dash-pending-change',-12.5,{inverse:true});
    setChange('dash-clients-change',4.7);
    const totals=new Map();
    all.forEach(t=>{const p=totals.get(t.sku)||{name:t.name,cat:t.cat,qty:0,amount:0};p.qty+=t.qty;p.amount+=t.amount;totals.set(t.sku,p);});
    const top=[...totals.values()].sort((a,b)=>b.qty-a.qty||b.amount-a.amount).slice(0,3);
    document.getElementById('dash-top-products').innerHTML=top.length?top.map((p,i)=>'<div class="top-product"><span class="top-rank">'+(i+1)+'</span><div><strong>'+p.name+'</strong><small>'+p.cat+'</small></div><div class="top-total"><strong>'+number(p.qty)+' unidades</strong><small>'+clp(p.amount)+' en ventas</small></div></div>').join(''):'<div class="empty-state">No hay ventas en este período.</div>';
    renderSalesBars(sales,f.period);renderPie(all);
  }
  function salesBuckets(period){
    const start=periodStart(period),end=new Date(demoToday);end.setDate(end.getDate()+1);
    if(period==='today')return Array.from({length:5},(_,i)=>{
      const a=new Date(start),b=new Date(start);a.setHours(i*5);b.setHours(Math.min(24,(i+1)*5));
      return {start:a,end:b,label:String(i*5).padStart(2,'0')+' h',long:String(i*5).padStart(2,'0')+':00–'+(i===4?'23:59':String((i+1)*5).padStart(2,'0')+':00')};});
    const buckets=[];
    for(let a=new Date(start);a<end;){
      const b=new Date(a);b.setDate(b.getDate()+(period==='7'?1:7));if(b>end)b.setTime(end.getTime());
      const last=new Date(b);last.setDate(last.getDate()-1);
      const fmt=d=>d.toLocaleDateString('es-CL',{day:'numeric',month:'short'});
      buckets.push({start:new Date(a),end:new Date(b),label:period==='7'?a.toLocaleDateString('es-CL',{weekday:'short'}):a.getDate()+'–'+last.getDate(),long:period==='7'?fmt(a):fmt(a)+' – '+fmt(last)});
      a=b;
    }
    return buckets;
  }
  function compactMoney(value){
    if(value>=1000000)return '$'+(value/1000000).toLocaleString('es-CL',{maximumFractionDigits:2})+' M';
    if(value>=1000)return '$'+(value/1000).toLocaleString('es-CL',{maximumFractionDigits:1})+' mil';
    return clp(value);
  }
  function renderSalesBars(sales,period){
    const buckets=salesBuckets(period).map(b=>({...b,amount:0,qty:0}));
    sales.forEach(t=>{const b=buckets.find(b=>t.date>=b.start&&t.date<b.end);if(b){b.amount+=t.amount;b.qty+=t.qty;}});
    const max=Math.max(1,...buckets.map(b=>b.amount));
    const periodText=document.getElementById('dash-period').selectedOptions[0].textContent;
    const container=document.getElementById('dash-sales-bars'),detail=document.getElementById('dash-bar-detail');
    const summary=b=>b.long+' · Ingresos: '+clp(b.amount)+' · '+number(b.qty)+' unidades vendidas';
    const hint=sales.length?periodText+' · '+(getDashFilters().category||'Todas las categorías'):'No hay ventas para este período y categoría.';
    container.setAttribute('aria-label','Ventas de '+periodText.toLowerCase()+'. '+(getDashFilters().category||'Todas las categorías'));
    detail.textContent=hint;
    container.innerHTML=buckets.map((b,i)=>'<div class="sales-bar-col"><div class="sales-bar-value" aria-label="'+clp(b.amount)+'"><span class="bar-money-full">'+clp(b.amount)+'</span><span class="bar-money-short" aria-hidden="true">'+compactMoney(b.amount)+'</span></div><button type="button" class="sales-bar" data-index="'+i+'" aria-pressed="false" aria-label="'+summary(b)+'" style="height:'+Math.max(4,b.amount/max*180)+'px"><span class="bar-tooltip">'+b.long+'<br>'+clp(b.amount)+' · '+number(b.qty)+' unidades</span></button><span class="sales-bar-label">'+b.label+'</span></div>').join('');
    let selected=-1;
    const restore=()=>{detail.textContent=selected<0?hint:summary(buckets[selected]);};
    container.querySelectorAll('.sales-bar').forEach((btn,i)=>{
      const show=()=>{detail.textContent=summary(buckets[i]);};
      btn.addEventListener('mouseenter',show);btn.addEventListener('focus',show);
      btn.addEventListener('mouseleave',restore);btn.addEventListener('blur',restore);
      btn.addEventListener('click',()=>{selected=selected===i?-1:i;container.querySelectorAll('.sales-bar').forEach((b,j)=>{b.classList.toggle('selected',selected===j);b.setAttribute('aria-pressed',String(selected===j));});restore();});
      btn.addEventListener('keydown',e=>{if(e.key==='Escape'){selected=-1;container.querySelectorAll('.sales-bar').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});restore();}});
    });
  }

  function categoryDetails(sales,cat){
    const total=sales.reduce((sum,t)=>sum+t.amount,0),rows=sales.filter(t=>t.cat===cat);
    const amount=rows.reduce((sum,t)=>sum+t.amount,0),products=new Map();
    rows.forEach(t=>{const p=products.get(t.sku)||{name:t.name,qty:0,amount:0};p.qty+=t.qty;p.amount+=t.amount;products.set(t.sku,p);});
    return {amount,share:total?amount/total*100:0,top:[...products.values()].sort((a,b)=>b.qty-a.qty||b.amount-a.amount).slice(0,3)};
  }
  function percentage(v){return v.toLocaleString('es-CL',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';}
  function openCategoryDetail(cat){
    document.querySelector('#category-dialog h3').textContent='3 productos más vendidos';
    document.querySelector('#category-dialog .dialog-note').textContent='Ordenados por unidades vendidas en el período seleccionado.';
    document.getElementById('dash-attention-link').hidden=true;
    // El gráfico y su detalle dependen solo del período, no de la categoría global.
    const period=getDashFilters().period,data=categoryDetails(periodSales(period),cat);
    document.getElementById('category-dialog-title').textContent=cat;
    document.getElementById('category-dialog-period').textContent=document.getElementById('dash-period').selectedOptions[0].textContent+' · Todas las ventas de esta categoría';
    document.getElementById('category-dialog-share').textContent=percentage(data.share);
    document.getElementById('category-dialog-income').textContent=clp(data.amount)+' en ingresos · participación en el total del período';
    const list=document.getElementById('category-dialog-products');list.replaceChildren();
    data.top.forEach((p,i)=>{
      const row=document.createElement('li'),rank=document.createElement('span'),info=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small');
      rank.className='top-rank';rank.textContent=i+1;info.className='product-info';name.textContent=p.name;
      detail.textContent=number(p.qty)+' unidades · '+clp(p.amount);
      info.append(name,detail);row.append(rank,info);list.append(row);
    });
    document.getElementById('category-dialog-note').textContent=data.top.length===0?'No hay productos vendidos en esta categoría durante el período.':data.top.length<3?'Esta categoría tiene '+data.top.length+' productos con ventas en el período.':'';
    const dialog=document.getElementById('category-dialog');if(!dialog.open)dialog.showModal();
  }
  function donutPath(start,end){
    // Dos arcos por borde permiten representar incluso una categoría del 100%.
    const point=(angle,r)=>[150+Math.sin(angle)*r,150-Math.cos(angle)*r].join(' ');
    const middle=(start+end)/2;
    return 'M '+point(start,134)+' A 134 134 0 0 1 '+point(middle,134)+' A 134 134 0 0 1 '+point(end,134)+' L '+point(end,75)+' A 75 75 0 0 0 '+point(middle,75)+' A 75 75 0 0 0 '+point(start,75)+' Z';
  }
  function renderPie(sales){
    const totals={};sales.forEach(t=>totals[t.cat]=(totals[t.cat]||0)+t.amount);
    const entries=Object.entries(totals).filter(([,amount])=>amount>0),total=entries.reduce((sum,[,amount])=>sum+amount,0);
    const chart=document.getElementById('dash-pie'),legend=document.getElementById('dash-pie-legend');
    chart.replaceChildren();legend.replaceChildren();chart.style.background='none';
    if(!total){legend.textContent='Sin ventas para el período seleccionado.';return;}
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 300 300');svg.setAttribute('class','donut-svg');
    let angle=0;
    entries.forEach(([cat,amount])=>{
      const end=angle+amount/total*Math.PI*2,color=categoryColor(cat),label=cat+' · '+percentage(amount/total*100)+' · '+clp(amount);
      const path=document.createElementNS(ns,'path');path.setAttribute('d',donutPath(angle,end));path.setAttribute('fill',color);path.setAttribute('class','donut-sector');
      path.addEventListener('click',()=>openCategoryDetail(cat));
      const title=document.createElementNS(ns,'title');title.textContent=label;path.append(title);svg.append(path);angle=end;
      const button=document.createElement('button');button.type='button';button.className='pie-legend-item';button.setAttribute('aria-haspopup','dialog');
      const dot=document.createElement('span'),info=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');
      dot.className='pie-dot';dot.style.background=color;name.textContent=cat;detail.textContent=percentage(amount/total*100)+' · '+clp(amount);
      info.append(name,detail);button.append(dot,info);button.addEventListener('click',()=>openCategoryDetail(cat));legend.append(button);
    });
    const center=document.createElementNS(ns,'text');center.setAttribute('x','150');center.setAttribute('y','153');center.setAttribute('text-anchor','middle');center.setAttribute('class','donut-center');center.textContent='Toca una categoría';svg.append(center);chart.append(svg);
  }

let initialized = false;
export function renderDashboard(){
  if (!initialized) {
    initialized = true;
    populateDashboardFilters();
    document.getElementById('dash-date').textContent = demoToday.toLocaleDateString('es-CL',{month:'long',year:'numeric'});
    document.querySelectorAll('#dash-period,#dash-category').forEach(el=>el.addEventListener('change',updateDashboard));
    const categoryDialog=document.getElementById('category-dialog');
    document.getElementById('category-dialog-close').addEventListener('click',()=>categoryDialog.close());
    categoryDialog.addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.close();});
    categoryDialog.addEventListener('close',()=>requestAnimationFrame(()=>{
      if(document.activeElement?.classList?.contains('donut-sector'))document.activeElement.blur();
    }));
    document.getElementById('dash-low-stock').addEventListener('click',()=>openAttention('low'));
    document.getElementById('dash-pending').addEventListener('click',()=>openAttention('pending'));
  }
  updateDashboard();
}
function openAttention(kind){
  const low=kind==='low',category=getDashFilters().category;
  const link=document.getElementById('dash-attention-link');link.hidden=false;link.dataset.goTab=low?'inventario':'movimientos';link.textContent=low?'Abrir inventario real ↗':'Abrir movimientos reales ↗';link.onclick=()=>document.getElementById('category-dialog').close();
  const rows=low?inventory.filter(p=>p.status==='low'&&(!category||p.cat===category)):transactions.filter(t=>t.status==='pending');
  document.getElementById('category-dialog-title').textContent=low?'Productos con stock bajo':'Ventas por cobrar';
  document.getElementById('category-dialog-period').textContent='Datos de demostración · '+(low?(category||'Todas las categorías'):'Todos los períodos y categorías');
  document.getElementById('category-dialog-share').textContent=number(rows.length);
  document.getElementById('category-dialog-income').textContent=low?'Productos que necesitan atención':'Transacciones por revisar';
  document.querySelector('#category-dialog h3').textContent=low?'Stock disponible':'Detalle de pendientes';
  document.querySelector('#category-dialog .dialog-note').textContent='Ejemplo del archivo de referencia. Los registros reales están en '+(low?'Inventario.':'Movimientos.');
  const list=document.getElementById('category-dialog-products');list.replaceChildren();
  rows.forEach(p=>{const li=document.createElement('li');li.textContent=low?p.name+' · '+p.qty+' unidades':p.id+' · '+p.name+' · '+clp(p.amount);list.append(li);});
  document.getElementById('category-dialog-note').textContent=rows.length?'':'No hay registros para esta selección.';
  document.getElementById('category-dialog').showModal();
}
