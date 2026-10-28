import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {crearProducto,sufijoSku} from './productos.mjs';import {gestionarCategoria} from './categorias.mjs';
test('SKU: límites A001, A999, B001 y Z999',()=>{assert.equal(sufijoSku(1),'A001');assert.equal(sufijoSku(999),'A999');assert.equal(sufijoSku(1000),'B001');assert.equal(sufijoSku(25974),'Z999');assert.throws(()=>sufijoSku(25975),{status:409});});

test('SKU: productos y categorías usan solo las primeras dos letras de su nombre',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/048_two_letter_generated_skus.sql',import.meta.url),'utf8');
 assert.match(sql,/abbr:=left\(upper\([\s\S]*?\),2\)/);
 assert.match(sql,/sku_prefix:=left\(upper\([\s\S]*?\),2\)/);
 assert.match(sql,/new_sku:=sku_prefix\|\|suffix/);
 assert.doesNotMatch(sql,/new_sku:=c\.abbreviation/);
});

