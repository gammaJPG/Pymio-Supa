import { createInventoryServer } from './server.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { guardarMovimiento, validarMovimiento, listarMovimientos, cambiarMovimiento, calcularDescuentoProducto } from './movimientos.mjs';

const base = () => ({ code: randomUUID(), operation: 'Ingreso', operation_detail: 'Otros', channel: 'Físico', payment_method: 'Efectivo', occurred_at: new Date().toISOString(), items: [{ product_id: '1', units: 2 }], discount: null });
test('Movimientos: canal y medio de pago obligatorios', () => {
  for (const channel of [undefined, '', 'Otro']) assert.throws(() => validarMovimiento({...base(), channel}), {status:400});
  for (const payment_method of [undefined, '', 'Cheque']) assert.throws(() => validarMovimiento({...base(), payment_method}), {status:400});
  for (const channel of ['Físico','Online']) for (const payment_method of ['Efectivo','Tarjeta','Transferencia']) {
    const result = validarMovimiento({...base(), channel, payment_method});
    assert.equal(result.channel, channel);
    assert.equal(result.payment_method, payment_method);
  }
});
test('Movimientos: validación de unidades, productos repetidos y descuentos', () => {
  assert.throws(()=>validarMovimiento({...base(),operation_detail:'Venta'}),{status:400});
  assert.throws(()=>validarMovimiento({...base(),operation:'Egreso',operation_detail:'Compra'}),{status:400});
  for (const units of [0, -1, 0.5, '3', 2147483648]) assert.throws(() => validarMovimiento({ ...base(), items: [{ product_id: '1', units }] }), { status: 400 });
  assert.throws(() => validarMovimiento({ ...base(), items: [{ product_id: '1', units: 1 }, { product_id: '1', units: 2 }] }), { status: 400 });
  assert.throws(() => validarMovimiento({ ...base(), discount: { type: 'percentage', value: 101 } }), { status: 400 });
  assert.throws(() => validarMovimiento({ ...base(), discount: { type: 'fixed', value: -1 } }), { status: 400 });
  assert.equal(validarMovimiento({ ...base(), discount: { type: 'percentage', value: 25 } }).discount.value, 25);
});

test('Descuentos: global porcentual y cálculo individual', () => {
  assert.throws(()=>validarMovimiento({...base(),discount:{type:'fixed',value:10}}),{status:400});
  assert.throws(()=>validarMovimiento({...base(),discount:{scope:'product'}}),{status:400});
  for (const value of [-1,101,NaN,Infinity,'10']) assert.throws(()=>validarMovimiento({...base(),discount:{scope:'product'},items:[{product_id:'1',units:2,discount:{type:'percentage',value}}]}),{status:400});
  const result=validarMovimiento({...base(),discount:{scope:'product'},items:[{product_id:'1',units:2,discount:{type:'percentage',value:25}}]});
  assert.equal(result.items[0].discount.value,25);
  assert.equal(calcularDescuentoProducto(200,3,{type:'fixed',value:100}),100);
  assert.equal(calcularDescuentoProducto(200,3,{type:'percentage',value:25}),150);
  assert.equal(calcularDescuentoProducto(200,-3,{type:'percentage',value:100}),600);
  assert.throws(()=>calcularDescuentoProducto(200,3,{type:'fixed',value:601}),{status:400});
  assert.equal(calcularDescuentoProducto(200,3,null),0);
});

