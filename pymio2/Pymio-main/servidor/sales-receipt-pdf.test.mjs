import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {saleReceiptData,generateSalesReceiptPdf} from './sales-receipt-pdf.mjs';
import {atenderComprobanteVenta} from './movimientos.mjs';
import {createInventoryServer} from './server.mjs';

const sale={
  code:'abcdef123456',operation:'Egreso',operation_detail:'Venta',occurred_at:'2026-10-27T15:30:00.000Z',channel:'Online',payment_method:'Transferencia',Estado:'Pagado',customer_name:'Almacén Central',discount_scope:'global',discount_type:'fixed',discount_amount:1000,total:14000,
  products:[{name:'Producto A',unit_price:5000,unit_cost:2500,units:2,total:10000},{name:'Producto B',unit_price:5000,unit_cost:2000,units:1,total:5000}]
};

test('Comprobante de venta: muestra precios, unidades y totales sin costos',async()=>{
  const data=saleReceiptData(sale);
  assert.deepEqual(data.products,[{name:'Producto A',unitPrice:5000,units:2,total:9333.333333333334},{name:'Producto B',unitPrice:5000,units:1,total:4666.666666666667}]);
  assert.equal(data.total,14000);assert.equal(Object.hasOwn(data.products[0],'unit_cost'),false);assert.equal(Object.hasOwn(data.products[0],'cost'),false);
  const pdf=await generateSalesReceiptPdf(sale);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.equal((await PDFDocument.load(pdf)).getPageCount(),1);
  await assert.rejects(generateSalesReceiptPdf({...sale,operation_detail:'Compra'}),{status:400});
});

test('Comprobante de venta: la descarga valida empresa y nombre del archivo',async()=>{
  const calls=[];let status,headers,body;
  const pool={rpc:async(operation,company,payload)=>{calls.push({operation,company,payload});return [sale];}};
  const res={writeHead:(value,next)=>{status=value;headers=next;},end:value=>{body=value;}};
  await atenderComprobanteVenta({method:'GET'},pool,'7',()=>{},res,sale.code);
  assert.equal(status,200);assert.equal(headers['Content-Type'],'application/pdf');assert.match(headers['Content-Disposition'],/Comprobante de venta - abcdef123456\.pdf/);assert.equal(headers['Content-Length'],body.length);
  assert.deepEqual(calls,[{operation:'movement.list',company:'7',payload:{code:sale.code,from:null,to:null}}]);
});

test('Comprobante de venta: la ruta HTTP descarga el PDF autenticado',async()=>{
  const pool={rpc:async operation=>operation==='movement.list'?[sale]:[]},server=createInventoryServer(pool,[],{sessionSecret:'test-secret',pilotPassword:'pilot-pass'});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'pilotodepruebas',password:'pilot-pass'})}),cookie=login.headers.get('set-cookie').split(';')[0];
    const response=await fetch(`${base}/api/movements/${sale.code}/receipt.pdf`,{headers:{Cookie:cookie}}),body=Buffer.from(await response.arrayBuffer());
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.equal(body.subarray(0,5).toString(),'%PDF-');
  }finally{await new Promise(resolve=>server.close(resolve));}
});

