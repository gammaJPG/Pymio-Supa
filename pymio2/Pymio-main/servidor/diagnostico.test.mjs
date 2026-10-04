import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.indexedDB={open:()=>({})};
globalThis.document={querySelector:()=>null};
globalThis.location={hostname:'localhost',origin:'http://localhost'};
globalThis.window={dispatchEvent:()=>{}};
const { productStockState, createInventoryAlerts, createReceivableAlerts } = await import('../diagnostico.js');

test('Diagnóstico: solo usa Stock Normal, Stock Bajo y Sin Stock',()=>{
  assert.equal(productStockState({'Estado Stock':'Stock Normal',qty:0,low_qty:5}),'Stock Normal');
  assert.equal(productStockState({'Estado Stock':'Stock Crítico',qty:2,low_qty:5}),'Stock Bajo');
  assert.equal(productStockState({'Estado Stock':'Stock Crítico',qty:0,low_qty:5}),'Sin Stock');
});

test('Diagnóstico: alerta una venta pendiente al cumplir tres días',()=>{
  const now=new Date('2026-10-04T15:00:00.000Z');
  const alerts=createReceivableAlerts([
    {code:'V-1',operation_detail:'Venta',Estado:'Pendiente de Pago',occurred_at:'2026-10-01T15:00:00.000Z',total:25000,products:[]},
    {code:'V-2',operation_detail:'Venta',Estado:'Pendiente de Pago',occurred_at:'2026-10-02T15:00:00.000Z',total:10000,products:[]},
    {code:'V-3',operation_detail:'Venta',Estado:'Pagado',occurred_at:'2026-09-20T15:00:00.000Z',total:5000,products:[]}
  ],now,{});
  assert.equal(alerts.length,1);assert.equal(alerts[0].movementCode,'V-1');assert.equal(alerts[0].sev,'warn');
});

test('Diagnóstico: un cobro pospuesto reaparece solamente al vencer la postergación',()=>{
  const movement={code:'V-4',operation_detail:'Venta',Estado:'Pendiente de Pago',occurred_at:'2026-09-20T15:00:00.000Z',total:1000,products:[]};
  assert.equal(createReceivableAlerts([movement],new Date('2026-10-04T15:00:00.000Z'),{'V-4':'2026-10-06T15:00:00.000Z'}).length,0);
  assert.equal(createReceivableAlerts([movement],new Date('2026-10-07T15:00:00.000Z'),{'V-4':'2026-10-06T15:00:00.000Z'}).length,1);
});

test('Diagnóstico: crea alertas reales solo para stock bajo o agotado',()=>{
  const alerts=createInventoryAlerts([
    {id:'1',name:'Normal','Estado Stock':'Stock Normal',qty:20,low_qty:5},
    {id:'2',name:'Bajo','Estado Stock':'Stock Bajo',qty:3,low_qty:5},
    {id:'3',name:'Agotado','Estado Stock':'Sin Stock',qty:0,low_qty:5}
  ]);
  assert.equal(alerts.length,2);
  assert.deepEqual(alerts.map(alert=>alert.sev),['warn','critical']);
  assert.ok(alerts.every(alert=>alert.alertId.startsWith('diagnostico-producto-')));
  assert.ok(alerts.every(alert=>!alert.title.includes('Crítico')));
});
