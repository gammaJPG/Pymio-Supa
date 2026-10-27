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
test('Exportación: consolida preguntas de texto y archivo como PDF con una entrada por usuario',async()=>{
  const source=await PDFDocument.create();source.addPage();const sourcePdf=Buffer.from(await source.save());
  const files=unzip(await exportResponses(data,{getCommunityFile:async path=>path==='a'?sourcePdf:Buffer.from('Contenido del archivo de Luis')},zipFiles));
  assert.equal([...files.keys()].filter(n=>n.endsWith('/')).length,4);
  assert.ok(files.has('Pregunta 2 - Comentario opinión/'));
  const results=files.get('Pregunta 1 - ¿Qué prefieres/Resultados.txt').toString();
  assert.match(results,/\| Opción\s+\| Cantidad de usuarios\s+\| Porcentaje del total\s+\|/);
  assert.match(results,/\| A\s+\| 2\s+\| 66,67 %\s+\|/);
  assert.match(results,/\| C\s+\| 0\s+\| 0 %\s+\|/);
  assert.deepEqual(files.get('Pregunta 3 - Adjunto/Respuesta a Pregunta 3 - Ana & Pérez.pdf'),sourcePdf);
  assert.equal(files.get('Pregunta 3 - Adjunto/Respuesta a Pregunta 3 - Luis.txt').toString(),'Contenido del archivo de Luis');
  assert.doesNotMatch([...files.keys()].join('\n'),/\/r[12] - |archivo\.pdf|notas\.txt/);
  const consolidated=files.get('Pregunta 3 - Adjunto/Respuestas consolidadas.pdf');
  assert.equal(consolidated.subarray(0,5).toString(),'%PDF-');
  assert.equal((await PDFDocument.load(consolidated)).getPageCount(),2);
  assert.equal(files.get('Pregunta 4 - Vacía/Respuestas consolidadas.pdf').subarray(0,5).toString(),'%PDF-');
  assert.deepEqual([...files.keys()].filter(n=>n.endsWith('/Respuestas.txt')),[]);
  const textConsolidated=files.get('Pregunta 2 - Comentario opinión/Respuestas consolidadas.pdf');
  assert.equal(textConsolidated.subarray(0,5).toString(),'%PDF-');
  assert.equal((await PDFDocument.load(textConsolidated)).getPageCount(),3);
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
test('Descarga ZIP: informa el título del formulario como nombre del archivo',async()=>{
  const formId='10000000-0000-4000-8000-000000000001';let status,headers,archive;
  const res={writeHead:(code,value)=>{status=code;headers=value;},end:value=>{archive=value;}};
  await atenderRedPymio({method:'GET'},{getCommunityFormResults:async()=>({form:{title:'Encuesta anual',questions:[]},responses:[]})},'7',()=>{},new URL(`http://localhost/api/network/forms/${formId}/files.zip`),res);
  assert.equal(status,200);assert.equal(headers['Content-Type'],'application/zip');assert.match(headers['Content-Disposition'],/filename="Respuestas Formulario - Encuesta anual\.zip"/);assert.match(headers['Content-Disposition'],/filename\*=UTF-8''Respuestas%20Formulario%20-%20Encuesta%20anual\.zip/);assert.equal(headers['Content-Length'],archive.length);
});

test('Exportación: conserva imágenes HEIC y HEIF dentro del ZIP',async()=>{
  const files=unzip(await exportResponses({form:{title:'Fotos',questions:[{id:'q1',position:1,title:'Imagen',type:'file',options:['image']}]},responses:[
    {id:'r1',name:'Ana',answers:[{question_id:'q1',file_path:'a',file_name:'captura.heic'}]},
    {id:'r2',name:'Luis',answers:[{question_id:'q1',file_path:'b',file_name:'captura.heif'}]},
  ]},{getCommunityFile:async path=>Buffer.from(path)},zipFiles));
  assert.ok(files.has('Pregunta 1 - Imagen/Respuesta a Pregunta 1 - Ana.heic'));
  assert.ok(files.has('Pregunta 1 - Imagen/Respuesta a Pregunta 1 - Luis.heif'));
  assert.equal(files.get('Pregunta 1 - Imagen/Respuestas consolidadas.pdf').subarray(0,5).toString(),'%PDF-');
});
