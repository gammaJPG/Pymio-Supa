import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';

import {validarMovimiento,guardarMovimiento,cambiarMovimiento,listarMovimientos} from './movimientos.mjs';
import {dentroDelRangoHorario,datosMovimientoPagado,datosDescuentoFila} from '../movimientos-vista.js';
const sale=()=>({code:randomUUID(),operation:'Egreso',operation_detail:'Venta',channel:'Físico',payment_method:'Efectivo',occurred_at:new Date().toISOString(),items:[{product_id:'1',units:1}],Estado:'Pendiente de Pago'});
test('Horas: límites e intervalo nocturno',()=>{
 const at=(h,m=0)=>new Date(2026,8,27,h,m).toISOString();
 for(const [h,m,from,to,expected] of [[13,0,'13:00','14:00',true],[14,1,'13:00','14:00',false],[23,0,'22:00','02:00',true],[1,0,'22:00','02:00',true],[12,0,'22:00','02:00',false],[12,0,'','',true]]) assert.equal(dentroDelRangoHorario(at(h,m),from,to),expected);
});
test('Pago: validación y compatibilidad con solicitudes antiguas',()=>{
 assert.equal(validarMovimiento(sale()).Estado,'Pendiente de Pago');
 assert.equal(validarMovimiento({...sale(),operation:'Ingreso',operation_detail:'Compra'}).Estado,'Pendiente de Pago');
 assert.throws(()=>validarMovimiento({...sale(),Estado:'Otro'}),{status:400});
 assert.throws(()=>validarMovimiento({...sale(),operation_detail:'Merma'}),{status:400});
 const old=sale();delete old.Estado;assert.equal(Object.hasOwn(validarMovimiento(old),'Estado'),false);
});
test('Pago: marcar pagado conserva los datos del movimiento',()=>{
 const action=randomUUID();
 const data=datosMovimientoPagado({revision:3,operation:'Egreso',operation_detail:'Venta',channel:'Online',payment_method:'Tarjeta',customer_id:'9',occurred_at:'2026-09-27T16:10:00.000Z',discount_scope:'product',products:[{product_id:'4',units:-2,discount_type:'percentage',discount_value:10}]},action);
 assert.deepEqual(data,{action_id:action,revision:3,operation:'Egreso',operation_detail:'Venta',channel:'Online',payment_method:'Tarjeta',Estado:'Pagado',customer_id:'9',occurred_at:'2026-09-27T16:10:00.000Z',discount:{scope:'product'},items:[{product_id:'4',units:2,discount:{type:'percentage',value:10}}]});
});
test('Detalle: distribuye el descuento global en cada producto',()=>{
 const movement={discount_scope:'global',discount_type:'percentage',discount_value:20,discount_amount:21000,products:[{total:5000,net_total:5000},{total:100000,net_total:100000}]};
 assert.deepEqual(datosDescuentoFila(movement,movement.products[0]),{amount:1000,net:4000,label:'20% ($1.000)'});
 assert.deepEqual(datosDescuentoFila(movement,movement.products[1]),{amount:20000,net:80000,label:'20% ($20.000)'});
});
test('Movimientos: expone filtros y presenta costos, signos y enlaces en el detalle',async()=>{
 const [html,view,migration]=await Promise.all([
  readFile(new URL('../movimientos.html',import.meta.url),'utf8'),
  readFile(new URL('../movimientos-vista.js',import.meta.url),'utf8'),
  readFile(new URL('../supabase/migrations/014_purchase_unit_cost.sql',import.meta.url),'utf8')
 ]);
 for(const id of ['mov-filter-status','mov-filter-channel','mov-filter-payment'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(view,/isPurchase \? 'Costo Unitario' : 'Precio Unitario'/);
 assert.match(view,/Unidades \(Egresadas\)/);
 assert.match(view,/movimiento-unidades-positivas/);
 assert.match(view,/movimiento-unidades-negativas/);
 assert.match(view,/CustomEvent\('abrir-producto'/);
 assert.match(migration,/movement_operation = 'Ingreso' AND movement_detail = 'Compra'/);
});

