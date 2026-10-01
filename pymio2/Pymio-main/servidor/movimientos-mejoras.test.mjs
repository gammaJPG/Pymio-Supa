import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

import {validarMovimiento,guardarMovimiento,cambiarMovimiento,listarMovimientos} from './movimientos.mjs';
import {dentroDelRangoHorario} from '../movimientos-vista.js';
const sale=()=>({code:randomUUID(),operation:'Egreso',operation_detail:'Venta',channel:'Físico',payment_method:'Efectivo',occurred_at:new Date().toISOString(),items:[{product_id:'1',units:1}],Estado:'Pendiente de Pago'});
test('Horas: límites e intervalo nocturno',()=>{
 const at=(h,m=0)=>new Date(2026,8,27,h,m).toISOString();
 for(const [h,m,from,to,expected] of [[13,0,'13:00','14:00',true],[14,1,'13:00','14:00',false],[23,0,'22:00','02:00',true],[1,0,'22:00','02:00',true],[12,0,'22:00','02:00',false],[12,0,'','',true]]) assert.equal(dentroDelRangoHorario(at(h,m),from,to),expected);
});
test('Pago: validación y compatibilidad con solicitudes antiguas',()=>{
 assert.equal(validarMovimiento(sale()).Estado,'Pendiente de Pago');
 assert.throws(()=>validarMovimiento({...sale(),Estado:'Otro'}),{status:400});
 assert.throws(()=>validarMovimiento({...sale(),operation_detail:'Merma'}),{status:400});
 const old=sale();delete old.Estado;assert.equal(Object.hasOwn(validarMovimiento(old),'Estado'),false);
});

