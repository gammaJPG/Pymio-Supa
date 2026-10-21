import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {PDFDocument} from 'pdf-lib';
import {summarize,exportResponses} from './community-results.mjs';
import {zipFiles,atenderRedPymio} from './red-pymio.mjs';
import {createSupabase} from './supabase.mjs';

function unzip(buffer){
  const entries=new Map();let offset=0;
  while(buffer.readUInt32LE(offset)===0x04034b50){
    const size=buffer.readUInt32LE(offset+18),nameSize=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28),start=offset+30+nameSize+extra;
    entries.set(buffer.subarray(offset+30,offset+30+nameSize).toString(),inflateRawSync(buffer.subarray(start,start+size)));offset=start+size;
  }
  return entries;
}
const data={form:{title:'Encuesta',questions:[{id:'q1',position:1,title:'¿Qué prefieres?',type:'select',options:['A','B','C']},{id:'q2',position:2,title:'Comentario / opinión',type:'text'},{id:'q3',position:3,title:'Adjunto',type:'file',options:['text','pdf','image']},{id:'q4',position:4,title:'Vacía',type:'file',options:['pdf']}]},responses:[
  {id:'r1',company_id:1,name:'Ana & Pérez',submitted_at:'2026-10-20',answers:[{question_id:'q1',option_value:'A'},{question_id:'q2',text_value:'Primera línea\n<Segunda>'},{question_id:'q3',file_path:'a',file_name:'archivo.pdf'}]},
  {id:'r2',company_id:2,name:'Luis',submitted_at:'2026-10-20',answers:[{question_id:'q1',option_value:'A'},{question_id:'q2',text_value:'Otra respuesta'},{question_id:'q3',file_path:'b',file_name:'notas.txt'}]},
  {id:'r3',company_id:3,name:'María',submitted_at:'2026-10-20',answers:[{question_id:'q1',option_value:'B'}]}
]};
test('Resultados: cuenta participantes, ceros y porcentajes sobre el total',()=>{
  assert.deepEqual(summarize(data).questions[0].options,[{option:'A',count:2,percentage:66.67},{option:'B',count:1,percentage:33.33},{option:'C',count:0,percentage:0}]);
  assert.equal(summarize({...data,responses:[]}).questions[0].options[0].percentage,0);
});
test('Exportación: crea un TXT único por cada pregunta de texto',async()=>{
  const source=await PDFDocument.create();source.addPage();const sourcePdf=Buffer.from(await source.save());
  const files=unzip(await exportResponses(data,{getCommunityFile:async path=>path==='a'?sourcePdf:Buffer.from('Contenido del archivo de Luis')},zipFiles));
  assert.equal([...files.keys()].filter(n=>n.endsWith('/')).length,4);
  assert.ok(files.has('Pregunta 2 - Comentario _ opinión/'));
  const results=files.get('Pregunta 1 - ¿Qué prefieres_/Resultados.txt').toString();
  assert.match(results,/\| Opción\s+\| Cantidad de usuarios\s+\| Porcentaje del total\s+\|/);
  assert.match(results,/\| A\s+\| 2\s+\| 66,67 %\s+\|/);
  assert.match(results,/\| C\s+\| 0\s+\| 0 %\s+\|/);
  assert.deepEqual(files.get('Pregunta 3 - Adjunto/r1 - Ana & Pérez - archivo.pdf'),sourcePdf);
  assert.equal(files.get('Pregunta 3 - Adjunto/r2 - Luis - notas.txt').toString(),'Contenido del archivo de Luis');
  const consolidated=files.get('Pregunta 3 - Adjunto/Respuestas consolidadas.pdf');
  assert.equal(consolidated.subarray(0,5).toString(),'%PDF-');
  assert.ok((await PDFDocument.load(consolidated)).getPageCount()>=6);
  assert.equal(files.get('Pregunta 4 - Vacía/Respuestas consolidadas.pdf').subarray(0,5).toString(),'%PDF-');
  const textFiles=[...files.keys()].filter(n=>n.endsWith('/Respuestas.txt'));
  assert.deepEqual(textFiles,['Pregunta 2 - Comentario _ opinión/Respuestas.txt']);
  const responses=files.get(textFiles[0]).toString();
  assert.match(responses,/Pregunta 2 - Comentario \/ opinión/);
  assert.match(responses,/INICIO DE RESPUESTA 1[\s\S]*Usuario: Ana & Pérez[\s\S]*Empresa: 1[\s\S]*Identificador de respuesta: r1[\s\S]*Primera línea\r?\n<Segunda>[\s\S]*FIN DE RESPUESTA 1/);
  assert.match(responses,/INICIO DE RESPUESTA 2[\s\S]*Usuario: Luis[\s\S]*Otra respuesta[\s\S]*FIN DE RESPUESTA 2/);
  assert.match(responses,/INICIO DE RESPUESTA 3[\s\S]*Usuario: María[\s\S]*Sin respuesta[\s\S]*FIN DE RESPUESTA 3/);
  assert.equal([...files.keys()].filter(n=>n.endsWith('.docx')).length,0);
});
test('Resultados: autorización denegada impide leer respuestas con service role',async()=>{
  const calls=[];
  const pool=createSupabase({url:'https://example.supabase.co',key:'test',fetchImpl:async url=>{calls.push(url.pathname);return Response.json({members:[{company_id:7,role:'member'}]});}});
  await assert.rejects(pool.getCommunityFormResults('form',7),{status:403});assert.equal(calls.length,1);
});
test('API de resultados y ZIP propagan denegación de permisos',async()=>{
  for(const suffix of ['results','files.zip']){
    let result;
    await atenderRedPymio({method:'GET'},{getCommunityFormResults:async()=>{throw Object.assign(new Error('Solo administradores'),{status:403});}},'7',(status,data)=>result={status,data},new URL(`http://localhost/api/network/forms/10000000-0000-4000-8000-000000000001/${suffix}`));
    assert.equal(result.status,403);
  }
});
