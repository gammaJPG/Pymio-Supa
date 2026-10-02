import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDashboardData, rangeForPeriod, previousRangeForPeriod, sixMonthRange, selectSales, summarizeSales, isLowStock } from '../dashboard-data.js';

test('Dashboard: conecta movimientos con categorías del inventario y agrega ventas reales', () => {
  const products = [
    {id:'1',sku:'A-1',name:'Aceite',category:'Aceites',qty:3,low_qty:5},
    {id:'2',sku:'B-1',name:'Arroz',category:'Abarrotes',qty:0,low_qty:5},
  ];
  const movements = [
    {code:'sale-1',operation:'Egreso',operation_detail:'Venta',Estado:'Pendiente de Pago',customer_id:'9',occurred_at:'2026-10-01T12:00:00-03:00',products:[{product_id:'1',units:-2,net_total:3000},{product_id:'2',units:-1,net_total:1000}]},
    {code:'purchase-1',operation:'Ingreso',operation_detail:'Compra',occurred_at:'2026-10-01T13:00:00-03:00',products:[{product_id:'1',units:5,net_total:5000}]},
  ];
  const data = normalizeDashboardData(products,movements,[]);
  const range = rangeForPeriod('month',new Date('2026-10-15T10:00:00-03:00'));
  const all = summarizeSales(selectSales(data.sales,{...range}));
  const oils = summarizeSales(selectSales(data.sales,{...range,category:'Aceites'}));
  assert.deepEqual({count:all.count,income:all.income,units:all.units,pending:all.pending,clients:all.clients},{count:1,income:4000,units:3,pending:1,clients:1});
  assert.deepEqual({count:oils.count,income:oils.income,units:oils.units},{count:1,income:3000,units:2});
  assert.equal(data.sales[0].items[0].category,'Aceites');
  assert.equal(isLowStock(products[0]),true);
  assert.equal(isLowStock(products[1]),false);
});

test('Dashboard: compara períodos equivalentes y muestra seis meses de contexto', () => {
  const now=new Date('2026-10-15T10:00:00-03:00');
  const current=rangeForPeriod('7',now),previous=previousRangeForPeriod('7',now),semester=sixMonthRange(now);
  assert.equal((current.end-current.start)/(24*60*60*1000),7);
  assert.equal((previous.end-previous.start)/(24*60*60*1000),7);
  assert.equal(previous.end.getTime(),current.start.getTime());
  assert.equal(semester.start.toISOString().slice(0,7),'2026-05');
  assert.equal(semester.end.toISOString().slice(0,7),'2026-11');
});
