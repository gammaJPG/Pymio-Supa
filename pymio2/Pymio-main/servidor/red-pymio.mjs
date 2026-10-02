const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function atenderRedPymio(req,pool,companyId,send,url){
  try{
    const communityJoin=/^\/api\/network\/communities\/([0-9a-f-]{36})\/join$/i.exec(url.pathname);
    const communityDecision=/^\/api\/network\/communities\/([0-9a-f-]{36})\/requests\/([0-9a-f-]{36})$/i.exec(url.pathname);
    const connection=/^\/api\/network\/connections\/([1-9]\d{0,18})$/i.exec(url.pathname);
    if(url.pathname==='/api/network/bootstrap' && req.method==='GET'){
      return send(200,await pool.network('bootstrap',companyId,{}));
    }
    if(url.pathname==='/api/network/profile' && req.method==='PUT'){
      requireJson(req);return send(200,await pool.network('profile.update',companyId,cleanProfile(await bodyJson(req))));
    }
    if(url.pathname==='/api/network/communities' && req.method==='POST'){
      requireJson(req);return send(201,await pool.network('community.create',companyId,cleanCommunity(await bodyJson(req))));
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
    return send(404,{error:'Ruta no encontrada.'});
  }catch(error){
    return send(error.status||500,{error:error.message||'No se pudo completar la acción en RED Pymio.'});
  }
}
