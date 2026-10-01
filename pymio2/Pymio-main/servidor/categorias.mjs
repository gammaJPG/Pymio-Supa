function fallo(status,message){return Object.assign(new Error(message),{status});}
export async function gestionarCategoria(pool,companyId,method,id,data){
 if(!['GET','POST','PUT','DELETE'].includes(method) || ((method==='PUT'||method==='DELETE')&&!id) || (method==='POST'&&id))throw fallo(405,'Método no permitido.');
 const name=typeof data?.name==='string'?data.name.trim():'';
 if(['POST','PUT'].includes(method)&&(!name||name.length>120))throw fallo(400,'Ingresa un nombre de categoría de hasta 120 caracteres.');
 return pool.rpc('category.'+method.toLowerCase(),companyId,{id,name});
}
export async function atenderCategorias(req,pool,companyId,id,send){
 try{
  let data;
  if(['POST','PUT'].includes(req.method)){
   if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')return send(415,{error:'Envía la categoría en formato JSON.'});
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192)return send(413,{error:'Categoría demasiado grande.'});chunks.push(chunk);}
   try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(400,{error:'JSON inválido.'});}
  }
  const result=await gestionarCategoria(pool,companyId,req.method,id,data);
  return send(req.method==='POST'?201:200,result);
 }catch(error){if(error.status)return send(error.status,{error:error.message});console.error('Categorías:',error.code);return send(500,{error:'No se pudo guardar o consultar la categoría.'});}
}
