import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {crearProducto,sufijoSku} from './productos.mjs';import {gestionarCategoria} from './categorias.mjs';
test('SKU: límites A001, A999, B001 y Z999',()=>{assert.equal(sufijoSku(1),'A001');assert.equal(sufijoSku(999),'A999');assert.equal(sufijoSku(1000),'B001');assert.equal(sufijoSku(25974),'Z999');assert.throws(()=>sufijoSku(25975),{status:409});});

