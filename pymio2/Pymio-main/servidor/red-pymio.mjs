import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_EXTENSIONS=new Set(['pdf','docx','doc','jpg','jpeg','png','webp','csv','xls','xlsx']);
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=buffer=>{let c=0xffffffff;for(const byte of buffer)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const safeName=value=>String(value||'archivo').normalize('NFKD').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,120)||'archivo';
function zipFiles(files){
  const locals=[],centrals=[];let offset=0;
  for(const file of files){const name=Buffer.from(file.name),raw=file.body,compressed=deflateRawSync(raw,{level:9}),crc=crc32(raw),local=Buffer.alloc(30),central=Buffer.alloc(46);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(name.length,26);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);locals.push(local,name,compressed);centrals.push(central,name);offset+=local.length+name.length+compressed.length;}
  const centralBody=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralBody.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,centralBody,end]);
}

const text = (value, max) => String(value ?? '').trim().slice(0, max);
const bodyJson = async (req, max = 24_576) => {
  const chunks=[]; let bytes=0;
  for await (const chunk of req) {
    bytes+=chunk.length;
    if(bytes>max)throw Object.assign(new Error('La solicitud excede el tamaño permitido.'),{status:413});
    chunks.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw Object.assign(new Error('Los datos enviados no son válidos.'),{status:400});}
};

const requireJson = req => {
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json'){
    throw Object.assign(new Error('Envía los datos en formato JSON.'),{status:415});
  }
};

function cleanProfile(data){
  const optionalUrl=(value,label)=>{
    const normalized=text(value,240);
    if(normalized && !/^https?:\/\/[^\s]+$/i.test(normalized))throw Object.assign(new Error(`${label} debe comenzar con http:// o https://.`),{status:400});
    return normalized;
  };
  const contactEmail=text(data.contactEmail,180).toLowerCase();
  const accentColor=text(data.accentColor,7)||'#f4ce4f';
  const imagePath=(value,kind)=>{
    const normalized=text(value,120);
    if(normalized && !new RegExp(`^[1-9]\\d*/${kind}/[0-9a-f-]{36}\\.webp$`,'i').test(normalized))throw Object.assign(new Error('La imagen del perfil no es válida.'),{status:400});
    return normalized;
  };
  const result={
    display_name:text(data.displayName,120),
    description:text(data.description,500),
    industry:text(data.industry,80),
    location:text(data.location,120),
    store_tagline:text(data.storeTagline,140),
    accent_color:accentColor,
    avatar_path:imagePath(data.avatarPath,'avatar'),
    banner_path:imagePath(data.bannerPath,'banner'),
    website:optionalUrl(data.website,'El sitio web'),
    instagram:optionalUrl(data.instagram,'Instagram'),
    youtube:optionalUrl(data.youtube,'YouTube'),
    tiktok:optionalUrl(data.tiktok,'TikTok'),
    facebook:optionalUrl(data.facebook,'Facebook'),
    linkedin:optionalUrl(data.linkedin,'LinkedIn'),
    contact_email:contactEmail,
    product_tags:Array.isArray(data.productTags)
      ? [...new Set(data.productTags.map(value=>text(value,60)).filter(Boolean))].slice(0,12)
      : [],
  };
  if(!result.display_name)throw Object.assign(new Error('Ingresa el nombre público de tu negocio.'),{status:400});
  if(!/^#[0-9a-f]{6}$/i.test(result.accent_color))throw Object.assign(new Error('Selecciona un color válido para tu vitrina.'),{status:400});
  if(contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))throw Object.assign(new Error('Ingresa un correo electrónico válido.'),{status:400});
  return result;
}

function cleanCommunity(data){
  const result={name:text(data.name,100),description:text(data.description,500),industry:text(data.industry,80),is_open:[true,'true','on','1'].includes(data.isOpen)};
  if(!result.name || !result.description)throw Object.assign(new Error('Completa el nombre y la descripción de la comunidad.'),{status:400});
  return result;
}

function cleanPost(data){
  const kind=data.kind==='benefit'?'benefit':data.kind==='event'?'event':'';
  const dateValue=(value,message)=>{
    if(!value)return null;
    const parsed=Date.parse(value);
    if(!Number.isFinite(parsed))throw Object.assign(new Error(message),{status:400});
    return new Date(parsed).toISOString();
  };
  const result={
    kind,title:text(data.title,140),description:text(data.description,700),location:text(data.location,160),
    event_at:dateValue(data.eventAt,'La fecha del evento no es válida.'),
    expires_at:dateValue(data.expiresAt,'La vigencia del beneficio no es válida.'),
    community_id:data.communityId||null,
  };
  if(!kind || !result.title || !result.description)throw Object.assign(new Error('Completa el tipo, título y descripción de la publicación.'),{status:400});
  if(kind==='event' && !result.event_at)throw Object.assign(new Error('Indica la fecha y hora del evento.'),{status:400});
  if(result.community_id && !UUID.test(result.community_id))throw Object.assign(new Error('La comunidad seleccionada no es válida.'),{status:400});
  return result;
}

export async function atenderRedPymio(req,pool,companyId,send,url,res){
  try{
    const communityJoin=/^\/api\/network\/communities\/([0-9a-f-]{36})\/join$/i.exec(url.pathname);
    const postUpdate=/^\/api\/network\/posts\/([0-9a-f-]{36})$/i.exec(url.pathname);
    const communityDecision=/^\/api\/network\/communities\/([0-9a-f-]{36})\/requests\/([0-9a-f-]{36})$/i.exec(url.pathname);
    const connection=/^\/api\/network\/connections\/([1-9]\d{0,18})$/i.exec(url.pathname);
    const communityDetail=/^\/api\/network\/communities\/([0-9a-f-]{36})$/i.exec(url.pathname);
    const communityAdmin=/^\/api\/network\/communities\/([0-9a-f-]{36})\/members\/([1-9]\d{0,18})\/admin$/i.exec(url.pathname);
    const formClose=/^\/api\/network\/forms\/([0-9a-f-]{36})\/close$/i.exec(url.pathname);
    const formResponses=/^\/api\/network\/forms\/([0-9a-f-]{36})\/responses$/i.exec(url.pathname);
    const formUpload=/^\/api\/network\/forms\/([0-9a-f-]{36})\/responses\/([0-9a-f-]{36})\/questions\/([0-9a-f-]{36})\/file$/i.exec(url.pathname);
    const formZip=/^\/api\/network\/forms\/([0-9a-f-]{36})\/files\.zip$/i.exec(url.pathname);
    if(url.pathname==='/api/network/bootstrap' && req.method==='GET'){
      return send(200,await pool.network('bootstrap',companyId,{}));
    }
    if(url.pathname==='/api/network/profile' && req.method==='PUT'){
      requireJson(req);return send(200,await pool.network('profile.update',companyId,cleanProfile(await bodyJson(req))));
    }
    if(url.pathname==='/api/network/communities' && req.method==='POST'){
      requireJson(req);return send(201,await pool.network('community.create',companyId,cleanCommunity(await bodyJson(req))));
    }
    if(communityDetail && req.method==='GET'){
      const network=await pool.network('bootstrap',companyId,{}),community=(network.communities||[]).find(item=>String(item.id)===communityDetail[1]);
      if(!community)return send(404,{error:'La comunidad ya no está disponible.'});
      if(!community.joined&&!community.owned)return send(403,{error:'Debes unirte a la comunidad para ver su contenido.'});
      return send(200,await pool.community('detail',companyId,{community_id:communityDetail[1]}));
    }
    if(communityAdmin && req.method==='POST'){requireJson(req);const data=await bodyJson(req,1024);return send(200,await pool.community('admin.set',companyId,{community_id:communityAdmin[1],target_company_id:communityAdmin[2],is_admin:Boolean(data.isAdmin)}));}
    if(url.pathname==='/api/network/forms' && req.method==='POST'){
      requireJson(req);const data=await bodyJson(req,64*1024),questions=Array.isArray(data.questions)?data.questions:[];
      return send(201,await pool.community('form.create',companyId,{community_id:data.communityId,title:text(data.title,140),questions:questions.slice(0,20).map((question,index)=>({position:index+1,title:text(question.title,200),type:question.type,options:Array.isArray(question.options)?question.options.map(option=>text(option,120)).filter(Boolean).slice(0,50):[]}))}));
    }
    if(formClose && req.method==='POST')return send(200,await pool.community('form.close',companyId,{form_id:formClose[1]}));
    if(formResponses && req.method==='GET'){
      await pool.community('form.get',companyId,{form_id:formResponses[1]});
      return send(200,{response:await pool.getCommunityFormResponse(formResponses[1],companyId)});
    }
    if(formResponses && req.method==='POST'){
      requireJson(req);const data=await bodyJson(req,64*1024);if(!UUID.test(data.responseId||''))return send(400,{error:'La respuesta no es válida.'});
      const detail=await pool.community('form.get',companyId,{form_id:formResponses[1]}),form=detail.forms?.[0];
      if(form?.status!=='open')return send(403,{error:'Este formulario ya está cerrado y no admite cambios.'});
      const answers=(Array.isArray(data.answers)?data.answers:[]).map(answer=>({question_id:answer.questionId,text_value:text(answer.textValue,5000),option_value:text(answer.optionValue,120),file_path:text(answer.filePath,500),file_name:text(answer.fileName,180),mime_type:text(answer.mimeType,120),compressed:Boolean(answer.compressed)}));
      if(answers.some(answer=>!UUID.test(answer.question_id||'')||(answer.file_path&&!answer.file_path.startsWith(`${companyId}/${formResponses[1]}/${data.responseId}/${answer.question_id}/`))))return send(400,{error:'Las respuestas contienen archivos no válidos.'});
      const saved=await pool.saveCommunityFormResponse(formResponses[1],companyId,data.responseId,answers),activeFiles=new Set(answers.map(answer=>answer.file_path).filter(Boolean));
      for(const oldPath of saved.previousFiles||[])if(!activeFiles.has(oldPath))await pool.deleteCommunityFile(oldPath).catch(()=>{});
      return send(200,{response:{id:saved.id,submittedAt:saved.submittedAt,answers}});
    }
    if(formUpload && req.method==='POST'){
      const [,formId,responseId,questionId]=formUpload,detail=await pool.community('form.get',companyId,{form_id:formId});
      const form=detail.forms?.[0],question=form?.questions?.find(item=>item.id===questionId);if(form?.status!=='open'||question?.type!=='file')return send(403,{error:'Esta pregunta no admite archivos.'});
      const originalName=safeName(decodeURIComponent(req.headers['x-file-name']||'archivo')),extension=originalName.split('.').pop().toLowerCase();if(!FILE_EXTENSIONS.has(extension))return send(415,{error:'Tipo de archivo no permitido.'});
      if(['jpg','jpeg','png'].includes(extension)||String(req.headers['content-type']||'').startsWith('image/')&&req.headers['content-type']!=='image/webp')return send(415,{error:'La imagen debe optimizarse a WebP antes de subirla.'});
      const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>12*1024*1024)return send(413,{error:'El archivo original es demasiado grande.'});chunks.push(chunk);}const original=Buffer.concat(chunks);
      const alreadyCompressed=['pdf','docx','xlsx','webp','jpg','jpeg','png'].includes(extension),candidate=alreadyCompressed?original:deflateRawSync(original,{level:9}),compressed=!alreadyCompressed&&candidate.length<original.length,stored=compressed?candidate:original;
      if(stored.length>2.5*1024*1024)return send(413,{error:'El archivo supera 2,5 MB después de comprimirlo.'});
      const path=`${companyId}/${formId}/${responseId}/${questionId}/${randomUUID()}.bin`;await pool.uploadCommunityFile(path,stored);return send(201,{filePath:path,fileName:originalName,mimeType:req.headers['content-type']||'application/octet-stream',compressed});
    }
    if(formZip && req.method==='GET'){
      const detail=await pool.community('form.export',companyId,{form_id:formZip[1]}),files=[],sourceFiles=detail.files||[];
      const owners=await pool.getCommunityFormResponseOwners([...new Set(sourceFiles.map(file=>file.response_id))]),ownerByResponse=new Map(owners.map(owner=>[String(owner.id),String(owner.company_id)])),nameByCompany=new Map((detail.members||[]).map(member=>[String(member.company_id),member.name]));
      for(const file of sourceFiles){const stored=await pool.getCommunityFile(file.path),body=file.compressed?inflateRawSync(stored):stored,companyName=nameByCompany.get(ownerByResponse.get(String(file.response_id)))||`Empresa ${ownerByResponse.get(String(file.response_id))||'sin identificar'}`;files.push({name:`${safeName(file.question)}/${safeName(companyName+' - '+file.name)}`,body});}
      const archive=zipFiles(files),downloadName=safeName(detail.forms?.[0]?.title||'formulario')+'.zip';res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="formulario.zip"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,'Content-Length':archive.length});return res.end(archive);
    }
    if(communityJoin && req.method==='POST'){
      if(!UUID.test(communityJoin[1]))return send(400,{error:'La comunidad seleccionada no es válida.'});
      return send(200,await pool.network('community.join',companyId,{community_id:communityJoin[1]}));
    }
    if(communityDecision && req.method==='POST'){
      requireJson(req);const data=await bodyJson(req),decision=data.decision==='approve'?'approve':data.decision==='reject'?'reject':'';
      if(!decision)return send(400,{error:'Selecciona si deseas aceptar o rechazar la solicitud.'});
      return send(200,await pool.network('community.request.respond',companyId,{community_id:communityDecision[1],request_id:communityDecision[2],decision}));
    }
    if(connection && req.method==='POST'){
      if(String(connection[1])===String(companyId))return send(400,{error:'Tu negocio ya forma parte de tu propia red.'});
      return send(200,await pool.network('connection.create',companyId,{target_company_id:connection[1]}));
    }
    if(url.pathname==='/api/network/posts' && req.method==='POST'){
      requireJson(req);return send(201,await pool.network('post.create',companyId,cleanPost(await bodyJson(req))));
    }
    if(postUpdate && req.method==='PUT'){
      if(!UUID.test(postUpdate[1]))return send(400,{error:'La publicación seleccionada no es válida.'});
      requireJson(req);return send(200,await pool.network('post.update',companyId,{post_id:postUpdate[1],...cleanPost(await bodyJson(req))}));
    }
    return send(404,{error:'Ruta no encontrada.'});
  }catch(error){
    const duplicateResponse=error.code==='23505'||/community_form_responses_form_id_company_id_key|duplicate key/i.test(error.message||'');
    return send(duplicateResponse?409:error.status||500,{error:duplicateResponse?'Este formulario ya fue respondido por tu empresa.':error.message||'No se pudo completar la acción en RED Pymio.'});
  }
}
