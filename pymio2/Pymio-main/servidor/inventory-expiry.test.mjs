import test from 'node:test';
import assert from 'node:assert/strict';
import { annotateFefo, compareFefo, expiryState, lotLabel } from '../inventory-expiry.js';

const lot=(id,expiry_date,created_at='2026-01-01T10:00:00Z')=>({id:String(id),name:'Leche',category:'Alimentos',sku:`LEC-A00${id}`,qty:5,Estado:'Habilitado',expiry_date,created_at});

test('FEFO prioriza vencimiento y usa FIFO cuando las fechas empatan',()=>{
  const later=lot(2,'2026-12-20'),sooner=lot(1,'2026-11-01','2026-05-01T10:00:00Z'),sameButOlder=lot(3,'2026-11-01','2026-04-01T10:00:00Z'),noDate=lot(4,null);
  assert.deepEqual([later,sooner,noDate,sameButOlder].sort(compareFefo).map(item=>item.id),['3','1','2','4']);
});

test('marca un único lote disponible como recomendación de venta',()=>{
  const annotated=annotateFefo([lot(1,'2026-12-20'),lot(2,'2026-11-01'),{...lot(3,'2026-10-01'),qty:0}]);
  assert.equal(annotated.find(item=>item.id==='2').fefo_recommended,true);
  assert.equal(annotated.find(item=>item.id==='1').fefo_first.sku,'LEC-A002');
  assert.equal(annotated.find(item=>item.id==='3').fefo_recommended,false);
});

test('describe vencimientos y expone SKU y fecha en la etiqueta del lote',()=>{
  const product=lot(1,'2026-10-25');
  assert.equal(expiryState(product,new Date(2026,9,21)).state,'urgent');
  assert.match(expiryState(product,new Date(2026,9,21)).label,/4 días/);
  assert.match(lotLabel(product,{recommended:true}),/Recomendado.*LEC-A001.*25-10-2026/);
});
