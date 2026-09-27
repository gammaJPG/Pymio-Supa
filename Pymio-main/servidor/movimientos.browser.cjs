const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const browser = await chromium.launch({headless:true, channel:'chrome'});
 try {
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[]; page.on('pageerror', e => errors.push(e.message));
  const products=[{id:'1',company_id:'1',name:'Árbol',sku:'ARB-01',category:'Jardín',qty:10,low_qty:5,crit_qty:2,cost:100,price:200,created_at:'2026-09-01',updated_at:'2026-09-01'}, {id:'2',company_id:'1',name:'Mesa',sku:'MES-02',category:'Hogar',qty:20,cost:200,price:400,created_at:'2026-09-01',updated_at:'2026-09-01'}];
  let categories=[{id:'1',name:'Sin Clasificar',abbreviation:'SIN'},{id:'2',name:'Jardín',abbreviation:'JAR'},{id:'3',name:'Hogar',abbreviation:'HOG'}].map(c=>({...c,created_at:'2026-09-13T12:00:00Z',updated_at:'2026-09-13T12:00:00Z'}));
  const categoryChanges=[]; const dateQueries=[];
  const changes=[]; const posts=[]; let failFirst=true;
  await page.route('**/*', async route => {
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/api/')) {
    if(route.request().method()==='OPTIONS') return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE'}});
    let body=products;
    if(url.pathname.startsWith('/api/categories')) {
      const method=route.request().method();const id=url.pathname.split('/')[3];
      if(method==='GET')body=categories;
      else {
        const data=method==='DELETE'?null:route.request().postDataJSON();categoryChanges.push({method,data,id});
        if(method==='POST'){body={id:'4',name:data.name,abbreviation:'HOG1',created_at:'2026-09-13T12:00:00Z',updated_at:'2026-09-13T12:00:00Z'};categories.push(body);}
        if(method==='PUT'){body=categories.find(c=>c.id===id);body.name=data.name;}
        if(method==='DELETE'){categories=categories.filter(c=>c.id!==id);body={id};}
      }
    }
    if(url.pathname.endsWith('/products/1/movements')) body=Array.from({length:5},(_,i)=>({code:i===0?'aaaaaaaaaaaa':'0123456789ab',operation:'Ingreso',occurred_at:'2026-09-13T12:00:00Z',units:i+1}));
    if(url.pathname.endsWith('/products/2/movements')) body=[];

    if(url.pathname.startsWith('/api/movements/') && route.request().method() !== 'GET') { changes.push({method:route.request().method(),data:route.request().postDataJSON()}); body={code:url.pathname.split('/').pop()}; }
    if(url.pathname==='/api/movements') {
     if(route.request().method()==='GET') dateQueries.push(Object.fromEntries(url.searchParams));
     if(route.request().method()==='POST') {
      posts.push(route.request().postDataJSON());
      if(failFirst){failFirst=false; return route.abort('failed');}
      body={code:posts.at(-1).code};
     } else body=[{code:'0123456789ab',revision:1,operation:'Egreso',operation_detail:'Venta',channel:'Online',payment_method:'Tarjeta',occurred_at:'2026-09-12T15:05:59Z',product_count:2,total:1020,discount_type:'percentage',discount_value:15,discount_amount:180,products:[{product_id:'1',sku:'ARB-01',name:'Árbol',unit_price:200,total:600,initial_qty:10,units:-3,final_qty:7},{product_id:'2',sku:'MES-02',name:'Mesa',unit_price:300,total:600,initial_qty:20,units:-2,final_qty:18}]}];
    }
    if(url.pathname==='/api/movements/aaaaaaaaaaaa' && route.request().method()==='GET') body={code:'aaaaaaaaaaaa',revision:1,operation:'Ingreso',occurred_at:'2025-01-01T12:00:00Z',product_count:1,total:200,discount_type:null,discount_value:0,products:[{product_id:'1',sku:'ARB-01',name:'Árbol',unit_price:200,total:200,initial_qty:0,units:1,final_qty:1}]};
    return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
   }
   if(url.hostname==='localhost') {
    const file=path.join(__dirname,'..',url.pathname==='/'?'piloto.html':decodeURIComponent(url.pathname.slice(1)));
    return route.fulfill({status:200,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});
   }
   return route.abort();
  });
  await page.goto('http://localhost/');
  await page.locator('#username').fill('pilotodepruebas'); await page.locator('#password').fill('consultoriaswc'); await page.locator('#login-form button').click();
  await page.locator('[data-tab="movimientos"]').click();
  await page.locator('.movimiento-resumen').waitFor();
  assert.equal(await page.locator('.movimiento-resumen').count(),1);
  for (const [period,days] of [['today',1],['7',7],['30',30]]) {
    const request=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/movements' && new URL(r.url()).searchParams.has('from'));
    await page.locator('#mov-filter-period').selectOption(period);
    const query=new URL((await request).url()).searchParams;
    const from=new Date(query.get('from')), end=new Date(query.get('to'));
    const expected=await page.evaluate(days=>{
      const now=new Date(), first=new Date(now.getFullYear(),now.getMonth(),now.getDate()-days+1), last=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
      return [first.toISOString(),last.toISOString()];
    },days);
    assert.deepEqual([from.toISOString(),end.toISOString()],expected);
  }
  await page.locator('#mov-filter-from').fill('2025-01-02');
  const customRequest=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/movements' && new URL(r.url()).searchParams.get('to')?.startsWith('2025-01-04'));
  await page.locator('#mov-filter-to').fill('2025-01-03');
  await customRequest;
  assert.equal(await page.locator('#mov-filter-period').inputValue(),'custom');
  await page.locator('#mov-filter-from').fill('2025-01-05');
  assert.equal(await page.locator('#mov-filter-to').evaluate(el=>el.validity.customError),true);
  const allRequest=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/movements' && !new URL(r.url()).searchParams.has('from'));
  await page.locator('#mov-filter-period').selectOption('all');
  await allRequest;
  assert.equal(await page.locator('#mov-filter-from').inputValue(),'');
  assert.equal(await page.locator('#mov-filter-to').inputValue(),'');
  await page.screenshot({path:path.join(__dirname,'movimientos-filtros-qa.png'),fullPage:true});
  assert.equal(await page.locator('.movimiento-resumen > td').count(),6);
  assert.match(await page.locator('#tab-movimientos .movimiento-toggle').innerText(), /\d{2}:\d{2} (am|pm)$/);
  await page.locator('.movimiento-resumen').click();
  assert.equal(await page.locator('.movimiento-detalle tbody tr').count(),2);
  assert.equal(await page.locator('.movimiento-detalle').isVisible(),true);
  await page.locator('#tab-movimientos .movimiento-toggle').press('Enter');
  assert.equal(await page.locator('.movimiento-detalle').isVisible(),false);
  await page.locator('[data-movement-menu]').click();
  assert.equal(await page.locator('#opciones-movimientos button').count(),3);
  await page.locator('[data-movement-add]').click();
  await page.locator('[data-product]').fill('arb');
  assert.equal(await page.locator('#movimiento-productos datalist option').count(),1);
  await page.locator('[data-product]').fill('Árbol - ARB-01'); await page.locator('[data-units]').fill('3');
  await page.locator('[data-add-line]').click();
  await page.locator('[data-product]').nth(1).fill('Mesa - MES-02'); await page.locator('[data-units]').nth(1).fill('2');
  await page.locator('#mov-operation').selectOption('Egreso');
  assert.deepEqual(await page.locator('#mov-operation-detail option').allTextContents(),['Selecciona un detalle','Venta','Merma','Consumo Interno','Otros']);
  await page.locator('#mov-operation-detail').selectOption('Venta');
  assert.deepEqual(await page.locator('#mov-channel option').allTextContents(), ['Selecciona un canal','Físico','Online']);
  assert.deepEqual(await page.locator('#mov-payment-method option').allTextContents(), ['Selecciona un medio de pago','Efectivo','Tarjeta','Transferencia']);
  assert.equal(await page.locator('#mov-channel').evaluate(el => el.validity.valueMissing), true);
  assert.equal(await page.locator('#mov-payment-method').evaluate(el => el.validity.valueMissing), true);
  await page.locator('#mov-channel').selectOption('Online');
  await page.locator('#mov-payment-method').selectOption('Tarjeta');
  assert.ok(await page.locator('#mov-date').inputValue());
  await page.locator('[data-discount-toggle]').click();
  assert.equal(await page.locator('[name="discount_scope"]:checked').inputValue(),'global');
  assert.equal(await page.locator('[name="discount_value"]').getAttribute('max'),'100');
  await page.locator('[name="discount_value"]').fill('15');
  await page.locator('#movimiento-form [type="submit"]').click();
  await page.getByRole('button',{name:'Reintentar',exact:true}).waitFor();
  await page.getByRole('button',{name:'Reintentar',exact:true}).click();
  await page.locator('#movimiento-dialogo').waitFor({state:'hidden'});
  assert.equal(posts[1].channel,'Online'); assert.equal(posts[1].payment_method,'Tarjeta');
  assert.equal(posts.length,2); assert.deepEqual(posts[0],posts[1]);
  assert.equal(posts[1].operation,'Egreso'); assert.equal(posts[1].operation_detail,'Venta'); assert.equal(posts[1].items.length,2); assert.deepEqual(posts[1].discount,{scope:'global',type:'percentage',value:15});
  await page.locator('[data-movement-menu]').click(); await page.locator('[data-movement-add]').click();
  await page.locator('[data-product]').fill('Mesa - MES-02'); await page.locator('[data-units]').fill('1');
  await page.locator('[data-discount-toggle]').click();
  await page.locator('[name="discount_scope"][value="product"]').check();
  assert.equal(await page.locator('[name="discount_value"]').isDisabled(),true);
  assert.equal(await page.locator('[data-global-discount]').isVisible(),false);
  await page.locator('[data-line-discount-value]').fill('50');
  assert.match(await page.locator('[data-line-total]').innerText(),/350/);
  await page.locator('[data-add-line]').click();
  await page.locator('[data-product]').nth(1).fill('Árbol - ARB-01');
  await page.locator('[data-units]').nth(1).fill('3');
  await page.locator('[data-line-discount-type]').nth(1).selectOption('percentage');
  await page.locator('[data-line-discount-value]').nth(1).fill('25');
  assert.match(await page.locator('[data-line-total]').nth(1).innerText(),/450/);
  await page.locator('#mov-operation-detail').selectOption('Compra');
  await page.locator('#mov-channel').selectOption('Físico');
  await page.locator('#mov-payment-method').selectOption('Efectivo');
  await page.locator('[name="discount_scope"][value="global"]').check();
  assert.equal(await page.locator('[data-line-discount-value]').first().isDisabled(),true);
  await page.locator('[name="discount_scope"][value="product"]').check();
  await page.screenshot({path:path.join(__dirname,'movimiento-form-qa.png'),fullPage:true});
  await page.locator('#movimiento-form [type="submit"]').click();
  await page.locator('#movimiento-dialogo').waitFor({state:'hidden'});
  assert.deepEqual(posts[2].discount,{scope:'product'});
  assert.deepEqual(posts[2].items.map(i=>i.discount),[{type:'fixed',value:50},{type:'percentage',value:25}]);
  await page.locator('.movimiento-resumen').click();
  await page.screenshot({path:path.join(__dirname,'movimientos-tabla-qa.png'),fullPage:true});
  await page.locator('[data-movement-menu]').click(); await page.locator('[data-movement-edit]').click();
  await page.locator('#movement-selector').selectOption('0123456789ab');
  assert.equal(await page.locator('[data-product]').count(),2);
  assert.equal(await page.locator('[data-units]').first().inputValue(),'3');
  assert.equal(await page.locator('#mov-operation').inputValue(),'Egreso');
  assert.equal(await page.locator('#mov-operation-detail').inputValue(),'Venta');
  assert.equal(await page.locator('#mov-channel').inputValue(),'Online');
  assert.equal(await page.locator('#mov-payment-method').inputValue(),'Tarjeta');
  assert.equal(await page.locator('[name="discount_value"]').inputValue(),'15');
  await page.locator('[data-units]').first().fill('4');
  await page.locator('#movimiento-form [type="submit"]').click();
  await page.locator('#movimiento-dialogo').waitFor({state:'hidden'});
  assert.equal(changes[0].method,'PUT'); assert.equal(changes[0].data.items[0].units,4); assert.equal(changes[0].data.revision,1);
  await page.locator('[data-movement-menu]').click(); await page.locator('[data-movement-delete]').click();
  await page.locator('#movement-selector').selectOption('0123456789ab');
  assert.equal(await page.locator('[data-movement-fields]').isVisible(),false);
  page.once('dialog',dialog=>dialog.dismiss());
  await page.locator('#movimiento-form [type="submit"]').click();
  assert.equal(changes.length,1);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#movimiento-form [type="submit"]').click();
  await page.locator('#movimiento-dialogo').waitFor({state:'hidden'});
  assert.equal(changes[1].method,'DELETE'); assert.equal(changes[1].data.revision,1);
  await page.locator('[data-tab="inventario"]').click();
  await page.locator('.inventario-resumen').first().waitFor();
  await page.locator('.inventario-resumen .movimiento-toggle').first().press('Enter');
  await page.locator('#inventario-detalle-1 a').first().waitFor();
  assert.equal(await page.locator('#inventario-detalle-1 a').count(),5);
  assert.deepEqual(await page.locator('#inventario-detalle-1 .inventario-umbrales dd').allTextContents(),['5 unidades','2 unidades']);
  await page.locator('#inventario-detalle-1 a').first().click();
  await page.locator('[data-movement-code="aaaaaaaaaaaa"] .movimiento-toggle').waitFor();
  assert.equal(await page.locator('#tab-movimientos').evaluate(el=>el.classList.contains('active')),true);
  assert.equal(await page.locator('[data-movement-code="aaaaaaaaaaaa"] .movimiento-toggle').getAttribute('aria-expanded'),'true');
  await page.locator('[data-tab="inventario"]').click();
  await page.locator('.inventario-resumen').nth(1).click();
  await page.getByText('Este producto aún no tiene movimientos.',{exact:true}).waitFor();
  await page.locator('#inv-search').fill('mesa');
  assert.equal(await page.locator('.inventario-resumen').count(),1);
  await page.locator('#inv-search').fill('');
  await page.locator('.inventario-resumen').first().click();
  await page.locator('#inventario-detalle-1 a').first().waitFor();
  await page.screenshot({path:path.join(__dirname,'inventario-detalle-qa.png'),fullPage:true});
  assert.equal(await page.locator('[data-add-modify-inventory]').innerText(),'+ Productos');
  await page.locator('[data-category-toggle]').click();await page.locator('[data-category-action="crear"]').click();
  await page.locator('#categoria-nombre').fill('Hogar nuevo');await page.locator('#categoria-dialogo [type="submit"]').click();
  await page.locator('#categoria-dialogo').waitFor({state:'hidden'});
  assert.equal(categoryChanges[0].method,'POST');
  await page.locator('[data-add-modify-inventory]').click();await page.locator('#opciones-inventario [data-accion="agregar"]').click();
  await page.locator('#producto-category option[value="Hogar nuevo"]').waitFor({state:'attached'});
  assert.equal(await page.locator('#producto-category').evaluate(el=>el.tagName),'SELECT');
  assert.equal(await page.locator('#producto-sku').isVisible(),false);
  assert.equal(await page.locator('#producto-sku').isDisabled(),true);
  assert.equal(await page.locator('#producto-updated').isVisible(),false);
  assert.equal(await page.locator('#producto-updated').isDisabled(),true);
  assert.equal(await page.locator('#producto-category').inputValue(),'Sin Clasificar');
  await page.locator('#producto-category').selectOption('Hogar nuevo');await page.locator('#producto-dialogo [data-cancelar]').click();
  await page.locator('[data-category-toggle]').click();await page.locator('[data-category-action="modificar"]').click();
  await page.locator('#categoria-selector').selectOption('4');await page.locator('#categoria-nombre').fill('Hogar actualizado');await page.locator('#categoria-dialogo [type="submit"]').click();
  await page.locator('#categoria-dialogo').waitFor({state:'hidden'});assert.equal(categoryChanges[1].method,'PUT');
  await page.locator('[data-category-toggle]').click();await page.locator('[data-category-action="eliminar"]').click();
  await page.locator('#categoria-selector').selectOption('4');assert.equal(await page.locator('#categoria-selector option[value="1"]').count(),0);
  page.once('dialog',d=>d.accept());await page.locator('#categoria-dialogo [type="submit"]').click();await page.locator('#categoria-dialogo').waitFor({state:'hidden'});
  assert.equal(categoryChanges[2].method,'DELETE');
  await page.locator('[data-category-toggle]').click();
  await page.screenshot({path:path.join(__dirname,'categorias-qa.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('OK navegador: menú, búsqueda, varios productos, radios y símbolos, fecha local, POST y reintento con mismo código.');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});

