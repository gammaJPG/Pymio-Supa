import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { validarCliente, atenderClientes } from './clientes.mjs';
import { validarMovimiento } from './movimientos.mjs';
import { createInventoryServer } from './server.mjs';

test('Clientes: nombre obligatorio y teléfono/correo válidos', () => {
  assert.deepEqual(validarCliente({name:' Ana ',phone:'+56 9 1234 5678',email:'ana@example.cl',address:' Calle 1 '}),
    {name:'Ana',phone:'+56 9 1234 5678',email:'ana@example.cl',address:'Calle 1'});
  assert.deepEqual(validarCliente({name:'Ana'}), {name:'Ana',phone:null,email:null,address:null});
  for (const value of [{name:' '},{name:'Ana',phone:'abc'},{name:'Ana',phone:'123'},{name:'Ana',email:'ana@'}]) {
    assert.throws(() => validarCliente(value), {status:400});
  }
});

test('Clientes: API lista y registra en la empresa solicitada', async () => {
  const calls = [];
  const pool = {rpc: async (...args) => { calls.push(args); return args[0] === 'customer.list' ? [] : {id:'12',...args[2]}; }};
  const sent = [];
  const send = (code, body) => sent.push({code,body});
  await atenderClientes({method:'GET'}, pool, '2', send);
  const request = Readable.from([Buffer.from(JSON.stringify({name:' Ana ',phone:'+56 9 1234 5678'}))]);
  request.method = 'POST'; request.headers = {'content-type':'application/json'};
  await atenderClientes(request, pool, '2', send);
  assert.deepEqual(calls.map(call => call.slice(0,2)), [['customer.list','2'],['customer.create','2']]);
  assert.equal(calls[1][2].name, 'Ana');
  assert.deepEqual(sent.map(item => item.code), [200,201]);
});

test('Ventas: el cliente es opcional y solo se acepta en ventas', () => {
  const sale = {operation:'Egreso',operation_detail:'Venta',channel:'Físico',payment_method:'Efectivo',occurred_at:new Date().toISOString(),items:[{product_id:'1',units:1}]};
  assert.equal(validarMovimiento({...sale,customer_id:'12'}).customer_id,'12');
  assert.equal(Object.hasOwn(validarMovimiento(sale),'customer_id'),false);
  assert.throws(() => validarMovimiento({...sale,customer_id:'x'}), {status:400});
  assert.throws(() => validarMovimiento({...sale,operation_detail:'Merma',customer_id:'12'}), {status:400});
});

test('Clientes: la ruta HTTP conserva el alcance por empresa', async () => {
  const calls = [];
  const server = createInventoryServer({rpc: async (...args) => { calls.push(args); return []; }}, []);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const good = await fetch(`${base}/api/customers?company_id=2`);
    const bad = await fetch(`${base}/api/customers?company_id=0`);
    assert.equal(good.status, 200);
    assert.equal(bad.status, 400);
    assert.deepEqual(calls.map(call => call.slice(0,2)), [['customer.list','2']]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
