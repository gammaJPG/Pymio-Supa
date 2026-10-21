import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {detectImageFormat,validateImageFormat} from './image-formats.mjs';
import {summarize,exportResponses} from './community-results.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_GROUPS={text:new Set(['docx','txt']),pdf:new Set(['pdf']),image:new Set(['jpg','png','webp'])};
const FILE_EXTENSIONS=new Set(Object.values(FILE_GROUPS).flatMap(group=>[...group]));
const FILE_MIMES={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain; charset=utf-8',pdf:'application/pdf',jpg:'image/jpeg',png:'image/png',webp:'image/webp'};
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=buffer=>{let c=0xffffffff;for(const byte of buffer)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const safeName=value=>String(value||'archivo').normalize('NFKD').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,120)||'archivo';
const fileGroups=question=>{const groups=(question?.options||[]).filter(group=>FILE_GROUPS[group]);return groups.length?groups:Object.keys(FILE_GROUPS);};
const validFileBody=(extension,body)=>{
  if(extension==='pdf')return body.subarray(0,5).toString()==='%PDF-';
  if(extension==='docx')return body[0]===0x50&&body[1]===0x4b&&body.includes(Buffer.from('word/document.xml'));
  if(extension==='txt'){try{new TextDecoder('utf-8',{fatal:true}).decode(body);return !body.includes(0);}catch{return false;}}
  if(extension==='jpg')return body[0]===0xff&&body[1]===0xd8&&body[2]===0xff;
  if(extension==='png')return body.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if(extension==='webp')return body.subarray(0,4).toString()==='RIFF'&&body.subarray(8,12).toString()==='WEBP';
  return false;
};
function cleanFormQuestions(input){
  const questions=(Array.isArray(input)?input:[]).slice(0,20).map((question,index)=>{
    const type=['text','select','file'].includes(question.type)?question.type:'',title=text(question.title,200);
    let options=Array.isArray(question.options)?question.options.map(option=>text(option,120)).filter(Boolean).slice(0,50):[];
    if(type==='file')options=[...new Set(options.filter(option=>FILE_GROUPS[option]))];
    if(!title||!type)throw Object.assign(new Error('Revisa las preguntas del formulario.'),{status:400});
    if(type==='select'&&!options.length)throw Object.assign(new Error(`La Pregunta ${index+1} necesita al menos una alternativa.`),{status:400});
    if(type==='file'&&!options.length)throw Object.assign(new Error(`Selecciona al menos un formato permitido para la Pregunta ${index+1}.`),{status:400});
    return {position:index+1,title,type,options:type==='text'?[]:options};
  });
  if(!questions.length)throw Object.assign(new Error('Incluye al menos una pregunta.'),{status:400});
  return questions;
}
export function zipFiles(files){
  const locals=[],centrals=[];let offset=0;
  for(const file of files){const name=Buffer.from(file.name),raw=file.body,compressed=deflateRawSync(raw,{level:9}),crc=crc32(raw),local=Buffer.alloc(30),central=Buffer.alloc(46);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(name.length,26);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);locals.push(local,name,compressed);centrals.push(central,name);offset+=local.length+name.length+compressed.length;}
  const centralBody=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralBody.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,centralBody,end]);
}

const text = (value, max) => String(value ?? '').trim().slice(0, max);
const applyMessageRetention=snapshot=>{
  if(!snapshot)return snapshot;
  const cutoff=Date.now()-7*24*60*60*1000,activity=snapshot.private_activity||[],latestByThread=new Map();
  for(const item of activity){const thread=String(item.thread_id||item.id),created=Date.parse(item.created_at);latestByThread.set(thread,Math.max(latestByThread.get(thread)||0,Number.isFinite(created)?created:0));}
  const activeThreads=new Set([...latestByThread].filter(([,latest])=>latest>=cutoff).map(([thread])=>thread)),isCurrent=item=>activeThreads.has(String(item.thread_id||item.id));
  return {...snapshot,private_notifications:(snapshot.private_notifications||[]).filter(isCurrent),private_activity:activity.filter(isCurrent)};
};
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
  const whatsappPhone=value=>{
    const normalized=text(value,32);
    if(!normalized)return '';
    if(!/^[+\d\s().-]+$/.test(normalized))throw Object.assign(new Error('Ingresa un número de WhatsApp válido.'),{status:400});
    let digits=normalized.replace(/\D/g,'');
    if(normalized.startsWith('00'))digits=digits.slice(2);
    if(!/^[1-9]\d{7,14}$/.test(digits))throw Object.assign(new Error('Ingresa el número de WhatsApp con código de país, por ejemplo +56 9 1234 5678.'),{status:400});
    return `+${digits}`;
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
    whatsapp_phone:whatsappPhone(data.whatsappPhone),
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

function cleanCommunityProfile(data,communityId){
  const optionalUrl=(value,label)=>{const normalized=text(value,240);if(normalized&&!/^https?:\/\/[^\s]+$/i.test(normalized))throw Object.assign(new Error(`${label} debe comenzar con http:// o https://.`),{status:400});return normalized;};
  const imagePath=(value,kind)=>{const normalized=text(value,180);if(normalized&&!new RegExp(`^${communityId}/${kind}/[0-9a-f-]{36}\\.webp$`,'i').test(normalized))throw Object.assign(new Error('La imagen de la comunidad no es válida.'),{status:400});return normalized;};
  const result={name:text(data.name,100),description:text(data.description,500),industry:text(data.industry,80),is_open:[true,'true','on','1'].includes(data.isOpen),avatar_path:imagePath(data.avatarPath,'avatar'),banner_path:imagePath(data.bannerPath,'banner'),website:optionalUrl(data.website,'El sitio web'),instagram:optionalUrl(data.instagram,'Instagram'),youtube:optionalUrl(data.youtube,'YouTube'),tiktok:optionalUrl(data.tiktok,'TikTok'),facebook:optionalUrl(data.facebook,'Facebook'),linkedin:optionalUrl(data.linkedin,'LinkedIn')};
  if(!result.name||!result.description)throw Object.assign(new Error('Completa el nombre y la descripción de la comunidad.'),{status:400});return result;
}

function cleanPost(data){
  const dateValue=(value,message)=>{
    if(!value)return null;
    const parsed=Date.parse(value);
    if(!Number.isFinite(parsed))throw Object.assign(new Error(message),{status:400});
    return new Date(parsed).toISOString();
  };
  const schedule=data.schedule==='range'?'range':'single',start=dateValue(data.eventAt,'La fecha inicial del evento no es válida.'),end=schedule==='range'?dateValue(data.endsAt,'La fecha final del evento no es válida.'):null;
  const result={kind:'event',title:text(data.title,140),description:text(data.description,700),location:text(data.location,160),event_at:start,expires_at:end,community_id:data.communityId||null};
  if(data.kind&&data.kind!=='event')throw Object.assign(new Error('Solo se pueden publicar eventos de comunidades.'),{status:400});
  if(!result.title || !result.description)throw Object.assign(new Error('Completa el título y la descripción del evento.'),{status:400});
  if(!result.event_at)throw Object.assign(new Error('Indica cuándo comienza el evento.'),{status:400});
  if(!result.community_id||!UUID.test(result.community_id))throw Object.assign(new Error('Selecciona una comunidad válida.'),{status:400});
  if(schedule==='range'&&!result.expires_at)throw Object.assign(new Error('Indica cuándo termina el evento.'),{status:400});
  if(result.expires_at&&Date.parse(result.expires_at)<=Date.parse(result.event_at))throw Object.assign(new Error('La fecha final debe ser posterior a la fecha de inicio.'),{status:400});
  return result;
}

export async function atenderRedPymio(req,pool,companyId,send,url,res){
  try{
    const communityJoin=/^\/api\/network\/communities\/([0-9a-f-]{36})\/join$/i.exec(url.pathname);
    const postUpdate=/^\/api\/network\/posts\/([0-9a-f-]{36})$/i.exec(url.pathname);
    const communityDecision=/^\/api\/network\/communities\/([0-9a-f-]{36})\/requests\/([0-9a-f-]{36})$/i.exec(url.pathname);
    const connection=/^\/api\/network\/connections\/([1-9]\d{0,18})$/i.exec(url.pathname);
    const connectionDecision=/^\/api\/network\/connection-requests\/([0-9a-f-]{36})$/i.exec(url.pathname);
    const privateActivity=/^\/api\/network\/connections\/([1-9]\d{0,18})\/activity$/i.exec(url.pathname);
    const privateActivityRead=/^\/api\/network\/activity\/([0-9a-f-]{36})\/read$/i.exec(url.pathname);
    const communityDetail=/^\/api\/network\/communities\/([0-9a-f-]{36})$/i.exec(url.pathname);
    const communityProfile=/^\/api\/network\/communities\/([0-9a-f-]{36})\/profile$/i.exec(url.pathname);
    const communityImageUpload=/^\/api\/network\/communities\/([0-9a-f-]{36})\/images\/(avatar|banner)$/i.exec(url.pathname);
    const communityImageOwn=/^\/api\/network\/communities\/([0-9a-f-]{36})\/images\/(avatar|banner)\/([0-9a-f-]{36})$/i.exec(url.pathname);
    const communityImagePublic=/^\/api\/network\/community-images\/([0-9a-f-]{36})\/(avatar|banner)\/([0-9a-f-]{36})$/i.exec(url.pathname);
    const communityAdmin=/^\/api\/network\/communities\/([0-9a-f-]{36})\/members\/([1-9]\d{0,18})\/admin$/i.exec(url.pathname);
    const formStatus=/^\/api\/network\/forms\/([0-9a-f-]{36})\/(close|open)$/i.exec(url.pathname);
    const formResponses=/^\/api\/network\/forms\/([0-9a-f-]{36})\/responses$/i.exec(url.pathname);
    const formDelete=/^\/api\/network\/forms\/([0-9a-f-]{36})$/i.exec(url.pathname);
    const formResults=/^\/api\/network\/forms\/([0-9a-f-]{36})\/results$/i.exec(url.pathname);
    const formUpload=/^\/api\/network\/forms\/([0-9a-f-]{36})\/responses\/([0-9a-f-]{36})\/questions\/([0-9a-f-]{36})\/file$/i.exec(url.pathname);
    const formZip=/^\/api\/network\/forms\/([0-9a-f-]{36})\/files\.zip$/i.exec(url.pathname);
    if(url.pathname==='/api/network/notifications'&&req.method==='GET')return send(200,{notifications:await pool.getCommunityNotifications(companyId)});
    if(url.pathname==='/api/network/bootstrap' && req.method==='GET'){
      return send(200,applyMessageRetention(await pool.network('bootstrap',companyId,{})));
    }
    if(url.pathname==='/api/network/messages/stream' && req.method==='GET'){
      let cursor=String(req.headers['last-event-id']||url.searchParams.get('after')||'');
      if(!Number.isFinite(Date.parse(cursor)))cursor=new Date().toISOString();
      let closed=false;const emitted=new Set();res.on?.('close',()=>{closed=true;});
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      res.write('retry: 2500\n\n');
      for(let attempt=0;attempt<150&&!closed;attempt+=1){
        const snapshot=applyMessageRetention(await pool.network('bootstrap',companyId,{})),cursorTime=Date.parse(cursor),messages=(snapshot.private_notifications||[]).filter(item=>Date.parse(item.created_at)>=cursorTime&&!emitted.has(String(item.id))).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
        if(messages.length){for(const item of messages)emitted.add(String(item.id));cursor=messages.at(-1).created_at;res.write(`id: ${cursor}\ndata: ${JSON.stringify({...snapshot,realtime_messages:messages})}\n\n`);}
        else res.write(': keep-alive\n\n');
        await new Promise(resolve=>setTimeout(resolve,2000));
      }
      if(!closed)res.end();return;
    }
    if(url.pathname==='/api/network/profile' && req.method==='PUT'){
      requireJson(req);return send(200,await pool.network('profile.update',companyId,cleanProfile(await bodyJson(req))));
    }
    if(url.pathname==='/api/network/communities' && req.method==='POST'){
      requireJson(req);await pool.entitlements('community.create',companyId,cleanCommunity(await bodyJson(req)));return send(201,await pool.network('bootstrap',companyId,{}));
    }
    if(communityImagePublic&&req.method==='GET'){
      const [,communityId,kind,id]=communityImagePublic,body=await pool.getCommunityImage(`${communityId}/${kind}/${id}.webp`),format=detectImageFormat(body);if(!format)return send(502,{error:'La imagen almacenada no tiene un formato válido.'});res.writeHead(200,{'Content-Type':format.mime,'Content-Length':body.length,'Cache-Control':'public, max-age=86400'});return res.end(body);
    }
    if(communityImageUpload&&req.method==='POST'){
      const [,communityId,kind]=communityImageUpload,detail=await pool.community('detail',companyId,{community_id:communityId});if(!['owner','admin'].includes(detail.community?.role))return send(403,{error:'Solo los administradores pueden cambiar la identidad de la comunidad.'});
      const declaredMime=req.headers['content-type']?.split(';')[0].trim().toLowerCase();if(!['image/webp','image/png','image/jpeg'].includes(declaredMime))return send(415,{error:'La imagen debe ser WebP, PNG o JPEG.'});const limit=kind==='banner'?500*1024:250*1024,chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>limit)return send(413,{error:`La imagen optimizada supera el máximo de ${kind==='banner'?'500':'250'} KB.`});chunks.push(chunk);}const body=Buffer.concat(chunks),format=validateImageFormat(body,declaredMime);if(!format)return send(400,{error:'El contenido no coincide con una imagen WebP, PNG o JPEG válida.'});const id=randomUUID(),path=`${communityId}/${kind}/${id}.webp`;await pool.uploadCommunityImage(path,body,format.mime);return send(201,{path});
    }
    if(communityImageOwn&&req.method==='DELETE'){
      const [,communityId,kind,id]=communityImageOwn,detail=await pool.community('detail',companyId,{community_id:communityId});if(!['owner','admin'].includes(detail.community?.role))return send(403,{error:'Solo los administradores pueden cambiar la identidad de la comunidad.'});await pool.deleteCommunityImage(`${communityId}/${kind}/${id}.webp`);return send(200,{deleted:true});
    }
    if(communityDetail && req.method==='GET'){
      const network=await pool.network('bootstrap',companyId,{}),community=(network.communities||[]).find(item=>String(item.id)===communityDetail[1]);
      if(!community)return send(404,{error:'La comunidad ya no está disponible.'});
      if(!community.joined&&!community.owned)return send(403,{error:'Debes unirte a la comunidad para ver su contenido.'});
      return send(200,await pool.community('detail',companyId,{community_id:communityDetail[1]}));
    }
    if(communityProfile&&req.method==='PUT'){requireJson(req);return send(200,await pool.community('profile.update',companyId,{community_id:communityProfile[1],...cleanCommunityProfile(await bodyJson(req),communityProfile[1])}));}
    if(communityAdmin && req.method==='POST'){requireJson(req);const data=await bodyJson(req,1024);return send(200,await pool.community('admin.set',companyId,{community_id:communityAdmin[1],target_company_id:communityAdmin[2],is_admin:Boolean(data.isAdmin)}));}
    if(url.pathname==='/api/network/forms' && req.method==='POST'){
      requireJson(req);const data=await bodyJson(req,64*1024),questions=Array.isArray(data.questions)?data.questions:[];
      return send(201,await pool.community('form.create',companyId,{community_id:data.communityId,title:text(data.title,140),questions:cleanFormQuestions(questions)}));
    }
    if(formStatus && req.method==='POST')return send(200,await pool.setCommunityFormStatus(formStatus[1],companyId,formStatus[2]==='open'?'open':'closed'));
    if(formDelete && req.method==='DELETE'){
      const deleted=await pool.deleteCommunityForm(formDelete[1],companyId);
      return send(200,await pool.community('detail',companyId,{community_id:deleted.communityId}));
    }
    if(formResults && req.method==='GET')return send(200,summarize(await pool.getCommunityFormResults(formResults[1],companyId)));
    if(formResponses && req.method==='GET'){
      await pool.community('form.get',companyId,{form_id:formResponses[1]});
      const meta=await pool.getCommunityFormMeta(formResponses[1]);
      return send(200,{response:await pool.getCommunityFormResponse(formResponses[1],companyId),createdByCurrentUser:String(meta.created_by_company_id)===String(companyId)});
    }
    if(formResponses && req.method==='POST'){
      requireJson(req);const data=await bodyJson(req,64*1024);if(!UUID.test(data.responseId||''))return send(400,{error:'La respuesta no es válida.'});
      const detail=await pool.community('form.get',companyId,{form_id:formResponses[1]}),form=detail.forms?.[0];
      if(form?.status!=='open')return send(403,{error:'Este formulario ya está cerrado y no admite cambios.'});
      const meta=await pool.getCommunityFormMeta(formResponses[1]);if(String(meta.created_by_company_id)===String(companyId))return send(403,{error:'La persona que creó el formulario no puede responderlo.'});
      const existing=await pool.getCommunityFormResponse(formResponses[1],companyId),responseId=existing?.id||data.responseId;
      const answers=(Array.isArray(data.answers)?data.answers:[]).map(answer=>({question_id:answer.questionId,text_value:text(answer.textValue,5000),option_value:text(answer.optionValue,120),file_path:text(answer.filePath,500),file_name:text(answer.fileName,180),mime_type:text(answer.mimeType,120),compressed:Boolean(answer.compressed)}));
      if(answers.some(answer=>!UUID.test(answer.question_id||'')||(answer.file_path&&!answer.file_path.startsWith(`${companyId}/${formResponses[1]}/${responseId}/${answer.question_id}/`))))return send(400,{error:'Las respuestas contienen archivos no válidos.'});
      const saved=await pool.saveCommunityFormResponse(formResponses[1],companyId,responseId,answers,existing),activeFiles=new Set(answers.map(answer=>answer.file_path).filter(Boolean));
      for(const oldPath of saved.previousFiles||[])if(!activeFiles.has(oldPath))await pool.deleteCommunityFile(oldPath).catch(()=>{});
      return send(200,{response:{id:saved.id,submittedAt:saved.submittedAt,answers},updated:Boolean(existing)});
    }
    if(formUpload && req.method==='POST'){
      const [,formId,responseId,questionId]=formUpload,detail=await pool.community('form.get',companyId,{form_id:formId});
      const form=detail.forms?.[0],question=form?.questions?.find(item=>item.id===questionId);if(form?.status!=='open'||question?.type!=='file')return send(403,{error:'Esta pregunta no admite archivos.'});
      const meta=await pool.getCommunityFormMeta(formId);if(String(meta.created_by_company_id)===String(companyId))return send(403,{error:'La persona que creó el formulario no puede responderlo.'});
      const originalName=safeName(decodeURIComponent(req.headers['x-file-name']||'archivo')),extension=originalName.split('.').pop().toLowerCase(),allowed=new Set(fileGroups(question).flatMap(group=>[...FILE_GROUPS[group]]));if(!FILE_EXTENSIONS.has(extension)||!allowed.has(extension))return send(415,{error:'El formato de este archivo no está permitido para la pregunta.'});
      const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>12*1024*1024)return send(413,{error:'El archivo original es demasiado grande.'});chunks.push(chunk);}const original=Buffer.concat(chunks);
      if(!validFileBody(extension,original))return send(415,{error:'El contenido del archivo no coincide con su extensión.'});
      const alreadyCompressed=['pdf','docx','webp','jpg','png'].includes(extension),candidate=alreadyCompressed?original:deflateRawSync(original,{level:9}),compressed=!alreadyCompressed&&candidate.length<original.length,stored=compressed?candidate:original;
      if(stored.length>2.5*1024*1024)return send(413,{error:'El archivo supera 2,5 MB después de comprimirlo.'});
      const path=`${companyId}/${formId}/${responseId}/${questionId}/${randomUUID()}.bin`;await pool.uploadCommunityFile(path,stored);return send(201,{filePath:path,fileName:originalName,mimeType:FILE_MIMES[extension],compressed});
    }
    if(formZip && req.method==='GET'){
      const data=await pool.getCommunityFormResults(formZip[1],companyId);
      const archive=await exportResponses(data,pool,zipFiles),downloadName=safeName(data.form.title)+'.zip';res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="respuestas.zip"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,'Content-Length':archive.length});return res.end(archive);
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
      return send(200,await pool.network('connection.request',companyId,{target_company_id:connection[1]}));
    }
    if(connectionDecision && req.method==='POST'){
      requireJson(req);const data=await bodyJson(req,1024),decision=data.decision==='accept'?'accept':data.decision==='reject'?'reject':'';
      if(!decision)return send(400,{error:'Selecciona si deseas aceptar o rechazar la solicitud.'});
      return send(200,await pool.network('connection.respond',companyId,{request_id:connectionDecision[1],decision}));
    }
    if(privateActivity && req.method==='POST'){
      requireJson(req);const data=await bodyJson(req,16*1024),kind=['message','quote_request','offer','business_update'].includes(data.kind)?data.kind:'';
      const subject=text(data.subject,140),message=text(data.body,5000),threadId=text(data.threadId,36),metadata=data.metadata&&typeof data.metadata==='object'?data.metadata:{};
      if(!kind||!subject||!message)return send(400,{error:'Completa el asunto y el contenido de la comunicación.'});
      if(threadId&&!UUID.test(threadId))return send(400,{error:'La conversación seleccionada no es válida.'});
      const cleanMetadata={deadline:text(metadata.deadline,10),budget:text(metadata.budget,30),valid_until:text(metadata.validUntil,10)};
      await pool.network('activity.create',companyId,{target_company_id:privateActivity[1],kind,subject,body:message,thread_id:threadId||null,metadata:cleanMetadata});
      return send(201,applyMessageRetention(await pool.network('bootstrap',companyId,{})));
    }
    if(privateActivityRead&&req.method==='POST'){await pool.network('activity.read',companyId,{thread_id:privateActivityRead[1]});return send(200,applyMessageRetention(await pool.network('bootstrap',companyId,{})));}
    if(url.pathname==='/api/network/posts' && req.method==='POST'){
      requireJson(req);const data=cleanPost(await bodyJson(req));await pool.requireCommunityAdmin(data.community_id,companyId);return send(201,await pool.network('post.create',companyId,data));
    }
    if(postUpdate && req.method==='PUT'){
      if(!UUID.test(postUpdate[1]))return send(400,{error:'La publicación seleccionada no es válida.'});
      requireJson(req);const data=cleanPost(await bodyJson(req));await pool.requireCommunityAdmin(data.community_id,companyId);return send(200,await pool.network('post.update',companyId,{post_id:postUpdate[1],...data}));
    }
    if(postUpdate && req.method==='DELETE'){
      if(!UUID.test(postUpdate[1]))return send(400,{error:'La publicación seleccionada no es válida.'});
      return send(200,await pool.network('post.delete',companyId,{post_id:postUpdate[1]}));
    }
    return send(404,{error:'Ruta no encontrada.'});
  }catch(error){
    const duplicateResponse=error.code==='23505'||/community_form_responses_form_id_company_id_key|duplicate key/i.test(error.message||'');
    return send(duplicateResponse?409:error.status||500,{error:duplicateResponse?'Este formulario ya fue respondido por tu empresa.':error.message||'No se pudo completar la acción en RED Pymio.'});
  }
}
