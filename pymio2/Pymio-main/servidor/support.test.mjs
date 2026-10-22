import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {handleSupport,validateTicket} from './support.mjs';

const request=(method,body)=>{const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.method=method;req.headers=body===undefined?{}:{'content-type':'application/json'};return req;};
const invoke=async({path,method='GET',body,session={userId:'74e6e67a-ff5a-4ce8-b3fb-ad59b20759d8',companyId:'2',demo:false},support=async()=>({tickets:[]})})=>{const sent=[];await handleSupport(request(method,body),{support},session,(code,payload)=>sent.push({code,payload}),new URL(path,'http://local'));return sent[0];};

test('Soporte: valida y normaliza una solicitud',()=>{
  const result=validateTicket({type:'problema',subject:'  Error de stock  ',description:'  El stock no se actualiza correctamente.  ',requestId:'bc73687e-3d3e-40c6-989a-b713b366cd2a'});
  assert.equal(result.subject,'Error de stock');assert.equal(result.description,'El stock no se actualiza correctamente.');
  for(const value of [{type:'otro',subject:'Asunto',description:'Descripción suficiente'},{type:'consulta',subject:'x',description:'Descripción suficiente'},{type:'consulta',subject:'Asunto',description:'corta'}])assert.throws(()=>validateTicket(value),{status:400});
});

test('Soporte: usa usuario y empresa de la sesión, no del navegador',async()=>{
  const calls=[];const response=await invoke({path:'/api/support/tickets',method:'POST',body:{type:'consulta',subject:'Una consulta',description:'Descripción suficientemente extensa',userId:'otro',companyId:'999',requestId:'bc73687e-3d3e-40c6-989a-b713b366cd2a'},support:async(...args)=>{calls.push(args);return {ticket:{ticket_number:1}};}});
  assert.equal(response.code,201);assert.deepEqual(calls[0].slice(0,3),['create','74e6e67a-ff5a-4ce8-b3fb-ad59b20759d8','2']);assert.equal(Object.hasOwn(calls[0][3],'userId'),false);
});

test('Soporte: la cuenta piloto no crea tickets ni obtiene permisos administrativos',async()=>{
  assert.equal((await invoke({path:'/api/support/tickets',method:'POST',body:{type:'consulta',subject:'Una consulta',description:'Descripción suficientemente extensa'},session:{userId:'pilot',companyId:'1',demo:true}})).code,403);
  assert.deepEqual((await invoke({path:'/api/support/capabilities',session:{userId:'pilot',companyId:'1',demo:true}})).payload,{admin:false,demo:true});
});

test('Soporte: sólo acepta estados permitidos',async()=>{
  const id='bc73687e-3d3e-40c6-989a-b713b366cd2a';
  assert.equal((await invoke({path:`/api/support/admin/tickets/${id}/status`,method:'PATCH',body:{status:'eliminado'}})).code,400);
});

test('Soporte: la migración restringe tablas y verifica administrador global',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/033_support_tickets.sql',import.meta.url),'utf8');
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/g);assert.match(sql,/REVOKE ALL ON public\.pymio_global_admins,public\.support_tickets FROM PUBLIC,anon,authenticated/);assert.match(sql,/IF NOT is_admin THEN RAISE EXCEPTION/);assert.match(sql,/lower\(email\)='tino@empresas\.cl'/);assert.match(sql,/UNIQUE\(user_id,request_id\)/);
});
