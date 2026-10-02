import test from 'node:test';
import assert from 'node:assert/strict';
import { stockDisponibleParaEgreso } from '../movimientos-stock.js';

const queued = (operation, units, state = 'pending') => ({
  method: 'POST', state,
  body: JSON.stringify({operation, items:[{product_id:'7', units}]})
});

test('Ventas: descuenta salidas pendientes del stock disponible', () => {
  assert.equal(stockDisponibleParaEgreso('7', 10, [queued('Egreso', 7)]), 3);
  assert.equal(stockDisponibleParaEgreso('7', 10, [queued('Ingreso', 2), queued('Egreso', 4)]), 8);
});

test('Ventas: ignora solicitudes rechazadas y restaura unidades al editar', () => {
  assert.equal(stockDisponibleParaEgreso('7', 2, [queued('Egreso', 8, 'conflict')]), 2);
  assert.equal(stockDisponibleParaEgreso('7', 2, [], 3), 5);
});
