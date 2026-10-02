import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.indexedDB={open:()=>({})};
globalThis.document={querySelector:()=>null};
globalThis.location={hostname:'localhost',origin:'http://localhost'};
globalThis.window={dispatchEvent:()=>{}};
const { productStockState, createInventoryAlerts } = await import('../diagnostico.js');

test('Diagnóstico: solo usa Stock Normal, Stock Bajo y Sin Stock',()=>{
  assert.equal(productStockState({'Estado Stock':'Stock Normal',qty:0,low_qty:5}),'Stock Normal');
  assert.equal(productStockState({'Estado Stock':'Stock Crítico',qty:2,low_qty:5}),'Stock Bajo');
  assert.equal(productStockState({'Estado Stock':'Stock Crítico',qty:0,low_qty:5}),'Sin Stock');
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