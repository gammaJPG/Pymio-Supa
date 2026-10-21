import { revealView } from './motion.js';
import { configureIntegerInput, parseFormattedInteger } from './number-format.js';

let initialized=false,currentView='overview',selectViewImpl=null;
const views=new Set(['overview','pymio','red','comunicaciones','explorar','eventos']);
export function mostrarVistaEcosistema(view='overview',{keyboard=false}={}){
  currentView=views.has(view)?view:'overview';
  sessionStorage.setItem('pymio:network-view',currentView);
  selectViewImpl?.(currentView,keyboard);
}
const demoData={
  communities:[
    {id:'demo-1',name:'Gastronomía RM',industry:'Alimentos',member_count:482,description:'Restaurantes, cafeterías y productores de alimentos de la Región Metropolitana.',joined:true,is_open:true,owner_name:'Mesa Gastronómica'},
    {id:'demo-2',name:'Zona Industrial Quilicura',industry:'Logística',member_count:167,description:'Empresas manufactureras y logísticas de Quilicura.',joined:true,is_open:false,owner_name:'Empresas Quilicura'},
    {id:'demo-3',name:'Fondos y Subsidios Pyme',industry:'Financiamiento',member_count:310,description:'Mapeo colaborativo de fondos públicos, Corfo y subsidios vigentes.',joined:false,is_open:false,owner_name:'Impulsa Pyme'},
  ],
  profile:{company_id:1,display_name:'Distribuidora Andes Ltda.',description:'Logística y distribución regional para comercios que necesitan entregas confiables.',store_tagline:'Movemos tu negocio a tiempo.',industry:'Logística',product_tags:['Distribución','Última milla'],location:'Quilicura',website:'https://pymio.cl',instagram:'https://instagram.com',linkedin:'https://linkedin.com',whatsapp_phone:'+56911111111',contact_email:'contacto@pymio.cl',accent_color:'#f4ce4f',verified:true,is_self:true},
  businesses:[
    {company_id:2,display_name:'EcoPack SpA',description:'Fabricante de empaques compostables.',store_tagline:'Empaques que cuidan lo que importa.',industry:'Manufactura',product_tags:['Empaques reciclables','Envases'],location:'Providencia',instagram:'https://instagram.com',whatsapp_phone:'+56922222222',website:'https://example.com',verified:true,connected:true},
    {company_id:1,display_name:'Distribuidora Andes Ltda.',description:'Logística y distribución regional.',store_tagline:'Movemos tu negocio a tiempo.',industry:'Logística',product_tags:['Distribución','Última milla'],location:'Quilicura',linkedin:'https://linkedin.com',contact_email:'contacto@pymio.cl',verified:true,is_self:true},
    {company_id:3,display_name:'Estudio Trazo Digital',description:'Diseño y marketing para retail.',store_tagline:'Diseño que vende sin perder identidad.',industry:'Servicios creativos',product_tags:['Branding','Marketing'],location:'Ñuñoa',instagram:'https://instagram.com',tiktok:'https://tiktok.com',verified:false},
    {company_id:4,display_name:'QuimLimpia SpA',description:'Insumos de aseo industrial.',industry:'Insumos',product_tags:['Aseo industrial'],location:'Rancagua',facebook:'https://facebook.com',verified:true,connected:true},
    {company_id:5,display_name:'Cafetalera del Sur',description:'Café en grano de origen.',industry:'Alimentos',product_tags:['Café','Venta mayorista'],location:'Talca',youtube:'https://youtube.com',verified:false},
    {company_id:6,display_name:'RM Publicidad Exterior',description:'Espacios publicitarios locales.',industry:'Publicidad',product_tags:['Publicidad exterior'],location:'Santiago Centro',verified:true},
  ],
  connections:[],community_requests:[],
  posts:[
    {kind:'event',title:'Taller: Cómo postular a fondos Corfo 2026',description:'Revisión práctica de requisitos y errores frecuentes.',event_at:'2026-10-24T18:00:00-03:00',location:'Online',author_name:'Gremio Pymes RM'},
    {kind:'event',title:'Networking Zona Industrial Quilicura',description:'Encuentro entre proveedores y empresas de la zona.',event_at:'2026-11-02T09:30:00-03:00',location:'Quilicura',author_name:'Zona Industrial Quilicura'},
    {kind:'benefit',title:'20% de descuento en fletes',description:'Tarifa preferente para miembros de Gastronomía RM.',expires_at:'2026-12-31T23:59:00-03:00',author_name:'Distribuidora Andes Ltda.'},
  ],
};
demoData.connections=demoData.businesses.filter(item=>item.connected);
const demoProducts=[
  {name:'Aceite vegetal 900 ml',category:'Abarrotes',qty:42,price:2890,image_path:''},
  {name:'Café molido premium',category:'Bebidas',qty:18,price:6490,image_path:''},
  {name:'Pack de envases reciclables',category:'Embalaje',qty:76,price:3990,image_path:''},
];

const escapeHTML=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const initials=name=>String(name||'PY').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();
const emptyState=(title,copy)=>`<div class="network-empty"><span class="network-empty-mark" aria-hidden="true">✦</span><strong>${escapeHTML(title)}</strong><p>${escapeHTML(copy)}</p></div>`;
const verifiedMark=verified=>verified?'<span class="pymium-verified" role="img" tabindex="0" aria-label="Perfil Verificado Pymium"><span class="bee-outline" aria-hidden="true"></span><span class="pymium-verified-tooltip" aria-hidden="true">Perfil Verificado Pymium</span></span>':'';
const money=new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
const IMAGE_INPUT_TYPES=new Set(['image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif']);
const canvasBlob=(canvas,type,quality)=>new Promise(resolve=>canvas.toBlob(resolve,type,quality));
async function imageBlobFormat(blob){
  if(!blob)return '';
  const bytes=new Uint8Array(await blob.slice(0,12).arrayBuffer());
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
  if(bytes.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value,index)=>bytes[index]===value))return 'image/png';
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
  return '';
}
async function decodeImage(file){
  if(typeof createImageBitmap==='function'){try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch{}}
  return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),image=new Image();image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight,draw:(context,...args)=>context.drawImage(image,...args),close:()=>URL.revokeObjectURL(url)});image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('No pudimos leer la imagen seleccionada.'));};image.src=url;});
}
async function encodeCompatibleImage(canvas,maxBytes){
  let blob=await canvasBlob(canvas,'image/webp',.82),format=await imageBlobFormat(blob);
  if(format==='image/webp'){
    for(const quality of [.82,.74,.66,.58,.5]){blob=await canvasBlob(canvas,'image/webp',quality);if(blob?.size<=maxBytes)return {blob,mime:'image/webp'};}
  }else if(format==='image/png'&&blob?.size<=maxBytes)return {blob,mime:'image/png'};
  const opaque=document.createElement('canvas');opaque.width=canvas.width;opaque.height=canvas.height;const context=opaque.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,opaque.width,opaque.height);context.drawImage(canvas,0,0);
  for(const quality of [.84,.74,.64,.54,.44]){blob=await canvasBlob(opaque,'image/jpeg',quality);if(await imageBlobFormat(blob)==='image/jpeg'&&blob.size<=maxBytes)return {blob,mime:'image/jpeg'};}
  throw new Error('La imagen no pudo optimizarse al tamaño permitido. Prueba con otra imagen.');
}
function validateImageInput(file){
  if(!IMAGE_INPUT_TYPES.has(file.type)||file.size>10*1024*1024)throw new Error('Selecciona una imagen JPG, PNG, WebP, AVIF o HEIC de hasta 10 MB.');
}
async function optimizarImagenProducto(file){
  validateImageInput(file);
  let source;try{source=await decodeImage(file);}catch{throw new Error('No pudimos leer la imagen seleccionada.');}
  const scale=Math.min(1,800/Math.max(source.width,source.height)),width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale)),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');source.draw?source.draw(context,0,0,width,height):context.drawImage(source,0,0,width,height);source.close?.();
  return encodeCompatibleImage(canvas,250*1024);
}
async function optimizarImagenPerfil(file,{width,height,maxBytes}){
  validateImageInput(file);
  let source;try{source=await decodeImage(file);}catch{throw new Error('No pudimos leer la imagen seleccionada.');}
  const targetRatio=width/height,sourceRatio=source.width/source.height;
  let sx=0,sy=0,sw=source.width,sh=source.height;
  if(sourceRatio>targetRatio){sw=Math.round(source.height*targetRatio);sx=Math.round((source.width-sw)/2);}else{sh=Math.round(source.width/targetRatio);sy=Math.round((source.height-sh)/2);}
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');source.draw?source.draw(context,sx,sy,sw,sh,0,0,width,height):context.drawImage(source,sx,sy,sw,sh,0,0,width,height);source.close?.();
  return encodeCompatibleImage(canvas,maxBytes);
}
const socialDefs={
  website:{label:'Sitio web',viewBox:'0 0 16 16',path:'M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m7.5-6.923c-.67.204-1.335.82-1.887 1.855A8 8 0 0 0 5.145 4H7.5zM4.09 4a9.3 9.3 0 0 1 .64-1.539 7 7 0 0 1 .597-.933A7.03 7.03 0 0 0 2.255 4zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a7 7 0 0 0-.656 2.5zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5zM8.5 5v2.5h2.99a12.5 12.5 0 0 0-.337-2.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5zM5.145 12q.208.58.468 1.068c.552 1.035 1.218 1.65 1.887 1.855V12zm.182 2.472a7 7 0 0 1-.597-.933A9.3 9.3 0 0 1 4.09 12H2.255a7 7 0 0 0 3.072 2.472M3.82 11a13.7 13.7 0 0 1-.312-2.5h-2.49c.062.89.291 1.733.656 2.5zm6.853 3.472A7 7 0 0 0 13.745 12H11.91a9.3 9.3 0 0 1-.64 1.539 7 7 0 0 1-.597.933M8.5 12v2.923c.67-.204 1.335-.82 1.887-1.855q.26-.487.468-1.068zm3.68-1h2.146c.365-.767.594-1.61.656-2.5h-2.49a13.7 13.7 0 0 1-.312 2.5m2.802-3.5a7 7 0 0 0-.656-2.5H12.18c.174.782.282 1.623.312 2.5zM11.27 2.461c.247.464.462.98.64 1.539h1.835a7 7 0 0 0-3.072-2.472c.218.284.418.598.597.933M10.855 4a8 8 0 0 0-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077V4z'},
  instagram:{label:'Instagram',viewBox:'0 0 16 16',path:'M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.9 3.9 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599s.453.546.598.92c.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.5 2.5 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.388.046-3.231c.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92s.546-.453.92-.598c.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92m-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217m0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334'},
  youtube:{label:'YouTube',viewBox:'0 0 16 16',path:'M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.01 2.01 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.01 2.01 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31 31 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022-.26.01-.104c.048-.519.119-1.023.22-1.402a2.01 2.01 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A100 100 0 0 1 7.858 2zM6.4 5.209v4.818l4.157-2.408z'},
  tiktok:{label:'TikTok',viewBox:'0 0 16 16',path:'M9 0h1.98c.144.715.54 1.617 1.235 2.512C12.895 3.389 13.797 4 15 4v2c-1.753 0-3.07-.814-4-1.829V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3z'},
  facebook:{label:'Facebook',viewBox:'0 0 16 16',path:'M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951'},
  linkedin:{label:'LinkedIn',viewBox:'0 0 16 16',path:'M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854zm4.943 12.248V6.169H2.542v7.225zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248S2.4 3.226 2.4 3.934c0 .694.521 1.248 1.327 1.248zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016l.016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225z'},
  whatsapp_phone:{label:'Enviar mensaje por WhatsApp',viewBox:'0 0 16 16',path:'M8 0a8 8 0 0 0-6.9 12.06L0 16l4.06-1.07A8 8 0 1 0 8 0m3.73 11.33c-.16.45-.93.86-1.28.91-.34.05-.77.07-1.24-.08-.29-.09-.67-.22-1.16-.43-2.04-.88-3.37-2.94-3.47-3.07-.1-.13-.83-1.1-.83-2.1s.52-1.49.71-1.69c.18-.2.4-.25.54-.25h.38c.12 0 .28-.05.44.34.16.4.54 1.37.58 1.47.05.1.08.22.02.35-.05.13-.08.21-.18.33-.1.12-.21.27-.3.36-.1.1-.2.2-.09.4.11.2.48.79 1.04 1.28.72.64 1.32.84 1.52.94.2.1.31.08.43-.05.12-.13.5-.58.63-.78.13-.2.26-.17.44-.1.18.06 1.14.54 1.34.64.2.1.33.15.38.23.05.08.05.47-.11.92'},
  contact_email:{label:'Correo electrónico',viewBox:'0 0 16 16',path:'M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414zM0 4.697v7.104l5.803-3.558zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586zm3.436-.586L16 11.801V4.697z'},
};
function socialHTML(profile){
  return Object.entries(socialDefs).map(([key,{label,viewBox,path}])=>{
    const value=profile?.[key]; if(!value)return '';
    const href=key==='contact_email'?`mailto:${value}`:key==='whatsapp_phone'?`https://wa.me/${String(value).replace(/\D/g,'')}`:value;
    return `<a class="social-link social-${key}" href="${escapeHTML(href)}" target="${key==='contact_email'?'_self':'_blank'}" rel="noopener noreferrer" aria-label="${label}" title="${label}" data-social="${key}"><svg viewBox="${viewBox}" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg></a>`;
  }).join('');
}

export function iniciarEcosistema({session,apiUrl}={}){
  if(initialized)return;
  const root=document.getElementById('tab-ecosistema'); if(!root)return;
  const requestedView=new URLSearchParams(location.search).get('network_view');if(views.has(requestedView))currentView=requestedView;
  initialized=true;
  const get=id=>root.querySelector('#'+id),demo=Boolean(session?.demo);
  let state=demo?structuredClone(demoData):{profile:null,businesses:[],connections:[],connection_requests:[],outgoing_connection_requests:[],connection_responses:[],private_notifications:[],private_activity:[],communities:[],community_requests:[],posts:[]},products=[];
  let communityFilter='all',communityQuery='',communicationsFilter='inbox',activeThreadId='',activeCommunity=null,activeForm=null,activeResponse=null,realtimeSource=null,realtimeCursor='';
  const feedback=root.querySelector('.ecosistema-feedback');
  const announce=(message,type='success')=>{feedback.textContent=message;feedback.dataset.type=type;feedback.hidden=false;};
  const setBusy=(button,busy,label)=>{
    if(!button.dataset.label)button.dataset.label=button.textContent;
    button.disabled=busy;
    if(busy&&label)button.textContent=label;
    else if(!busy)button.textContent=button.dataset.label;
  };
  const request=async(path,options={})=>{const response=await fetch(apiUrl+path,{cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'No pudimos completar la acción.');return result;};
  const profileImageUrl=path=>{
    const match=String(path||'').match(/^([1-9]\d*)\/(avatar|banner)\/([0-9a-f-]{36})\.webp$/i);
    return match?`${apiUrl}/api/profile-images/${match[1]}/${match[2]}/${match[3]}`:'';
  };
  const communityImageUrl=path=>{const match=String(path||'').match(/^([0-9a-f-]{36})\/(avatar|banner)\/([0-9a-f-]{36})\.webp$/i);return match?`${apiUrl}/api/network/community-images/${match[1]}/${match[2]}/${match[3]}`:'';};
  const setProfileImage=(img,initialsNode,path,alt)=>{
    const src=profileImageUrl(path);img.hidden=!src;img.src=src||'';img.alt=src?alt:'';if(initialsNode)initialsNode.hidden=Boolean(src);
  };
  const avatarMarkup=profile=>{const src=profileImageUrl(profile?.avatar_path);return src?`<img src="${escapeHTML(src)}" alt="Foto de ${escapeHTML(profile.display_name||'negocio')}" loading="lazy">`:escapeHTML(initials(profile?.display_name));};

  selectViewImpl=(view,keyboard=false)=>{
    currentView=view;
    feedback.hidden=true;
    root.querySelectorAll('.subpanel').forEach(panel=>panel.classList.toggle('active',panel.id===`sub-${view}`));
    document.querySelectorAll('[data-network-view]').forEach(button=>button.classList.toggle('active',button.dataset.networkView===view));
    const target=get('sub-'+view); if(target)revealView(target,{keyboard});
    if(view==='pymio')loadProducts();
  };
  root.addEventListener('click',event=>{const button=event.target.closest('[data-network-view]');if(!button)return;mostrarVistaEcosistema(button.dataset.networkView,{keyboard:event.detail===0});});
  selectViewImpl(currentView);

  function renderCommunities(){
    const rows=state.communities||[],joined=rows.filter(item=>item.joined).length,owned=rows.filter(item=>item.owned).length;
    const createButton=root.querySelector('[data-community-create]'),canCreate=state.can_create_community!==false,ownedCount=Number(state.owned_community_count||owned);createButton.disabled=!canCreate;createButton.textContent=canCreate?'Crear comunidad':'Límite alcanzado';createButton.title=canCreate?'Crear una comunidad':'Las cuentas básicas pueden crear una comunidad';root.querySelector('[data-community-plan-note]').textContent=state.is_pymium?'Plan Pymium · comunidades ilimitadas':ownedCount?`Plan básico · ${ownedCount} ${ownedCount===1?'comunidad creada':'comunidades creadas'} · límite 1`:'Plan básico · puedes crear 1 comunidad';
    const summary=root.querySelector('[data-community-summary]');summary.hidden=demo;summary.innerHTML=`<button type="button" data-community-filter="joined" class="${communityFilter==='joined'?'active':''}"><strong>${joined}</strong> en tu red</button><button type="button" data-community-filter="owned" class="${communityFilter==='owned'?'active':''}"><strong>${owned}</strong> creadas por ti</button><button type="button" data-community-filter="all" class="${communityFilter==='all'?'active':''}"><strong>${rows.length}</strong> disponibles</button>`;
    const query=communityQuery.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const visible=rows.filter(item=>(communityFilter==='all'||communityFilter==='joined'&&item.joined||communityFilter==='owned'&&item.owned)&&(!query||`${item.name} ${item.description} ${item.owner_name} ${item.industry}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query)));
    root.querySelector('[data-community-results]').textContent=`${visible.length} ${visible.length===1?'comunidad':'comunidades'}`;
    get('community-grid').innerHTML=visible.length?visible.map((item,index)=>{
      const requests=(state.community_requests||[]).filter(request=>request.community_id===item.id);
      const action=item.owned?'<span class="joined-label">Administras</span>':item.joined?'<span class="joined-label">Miembro - Usuario</span>':item.pending_request?'<button class="btn-outline" disabled>Solicitud enviada</button>':`<button class="btn-outline" data-community-join="${escapeHTML(item.id)}">${item.is_open?'Unirme':'Solicitar acceso'}</button>`;
      const requestList=item.owned&&requests.length?`<div class="join-requests"><strong>${requests.length===1?'1 solicitud pendiente':`${requests.length} solicitudes pendientes`}</strong>${requests.map(request=>`<div class="join-request"><div class="match-avatar">${avatarMarkup(request)}</div><div><b>${escapeHTML(request.display_name)}</b><small>${escapeHTML([request.industry,request.location].filter(Boolean).join(' · ')||'Perfil en Pymio')}</small></div><div class="request-actions"><button type="button" data-community-request="${escapeHTML(request.id)}" data-community-id="${escapeHTML(item.id)}" data-decision="approve">Aceptar</button><button type="button" data-community-request="${escapeHTML(request.id)}" data-community-id="${escapeHTML(item.id)}" data-decision="reject">Rechazar</button></div></div>`).join('')}</div>`:'';
      const canOpen=item.joined||item.owned,openAttributes=canOpen?` data-community-open="${escapeHTML(item.id)}" tabindex="0" role="button"`:'';
      return `<article class="card community-card"${openAttributes}><div class="community-heading"><span class="community-monogram">${String(index+1).padStart(2,'0')}</span><span class="community-access-label">${item.is_open?'Abierta':'Con aprobación'}</span></div><span class="pill honey">${escapeHTML(item.industry||'Comunidad')}</span><h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.description)}</p><div class="community-owner">Creada por ${escapeHTML(item.owner_name||'una empresa de Pymio')}</div><div class="community-meta"><span>${Number(item.member_count||0).toLocaleString('es-CL')} miembros</span>${action}</div>${requestList}</article>`;
    }).join(''):emptyState('Sin comunidades para este filtro','Cambia el filtro o escribe otra búsqueda.');
  }
  function renderConnections(){
    const rows=state.connections||[];root.querySelector('[data-connection-count]').textContent=`${rows.length} ${rows.length===1?'conexión':'conexiones'}`;
    get('connection-grid').innerHTML=rows.length?rows.map(item=>`<article class="card connection-card"><div class="match-top"><div class="match-avatar">${avatarMarkup(item)}</div><div><div class="match-name">${escapeHTML(item.display_name)} ${verifiedMark(item.verified)}</div><div class="match-rubro">${escapeHTML([item.industry,item.location].filter(Boolean).join(' · ')||'Perfil en Pymio')}</div></div></div><p>${escapeHTML(item.store_tagline||item.description||'Esta empresa forma parte de tu red.')}</p><button type="button" class="profile-link" data-profile-view="${escapeHTML(item.company_id)}"><span>Ver perfil Pymio</span><span>→</span></button><div class="connection-tools" aria-label="Herramientas privadas"><button type="button" data-private-action="message" data-private-company="${escapeHTML(item.company_id)}">Mensaje</button><button type="button" data-private-action="quote_request" data-private-company="${escapeHTML(item.company_id)}">Solicitar cotización</button><button type="button" data-private-action="offer" data-private-company="${escapeHTML(item.company_id)}">Enviar oferta</button><button type="button" data-private-action="business_update" data-private-company="${escapeHTML(item.company_id)}">Compartir novedad</button></div></article>`).join(''):emptyState('Todavía no conectas con otras empresas','Explora perfiles y envía una solicitud para construir tu red.');
  }
  const privateKindInfo={
    message:{label:'Mensaje',title:'Enviar mensaje privado',kicker:'Mensaje directo',subject:'Asunto',subjectPlaceholder:'Ej. Consulta sobre disponibilidad',body:'Mensaje',bodyPlaceholder:'Escribe tu mensaje',submit:'Enviar mensaje'},
    quote_request:{label:'Cotización',title:'Solicitar cotización',kicker:'Solicitud comercial',subject:'Producto o servicio requerido',subjectPlaceholder:'Ej. 100 cajas de embalaje',body:'Detalle de la solicitud',bodyPlaceholder:'Indica cantidades, especificaciones y condiciones de entrega',submit:'Enviar solicitud',extras:'<label class="field"><span>Fecha límite</span><input name="deadline" type="date"></label><label class="field"><span>Presupuesto estimado (CLP)</span><input name="budget" inputmode="numeric" maxlength="14" placeholder="Opcional"></label>'},
    offer:{label:'Oferta',title:'Enviar oferta exclusiva',kicker:'Propuesta comercial',subject:'Nombre de la oferta',subjectPlaceholder:'Ej. Precio preferente para tu empresa',body:'Condiciones de la oferta',bodyPlaceholder:'Describe el beneficio, alcance y forma de acceder',submit:'Enviar oferta',extras:'<label class="field"><span>Válida hasta</span><input name="validUntil" type="date"></label>'},
    business_update:{label:'Novedad',title:'Compartir novedad',kicker:'Actualización del negocio',subject:'Título de la novedad',subjectPlaceholder:'Ej. Nuevo horario de atención',body:'Novedad',bodyPlaceholder:'Cuenta qué cambió y por qué puede ser útil para esta empresa',submit:'Compartir novedad'}
  };
  const formatCommunicationDate=value=>new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  function communicationThreads(){
    const groups=new Map();for(const item of state.private_activity||[]){const id=String(item.thread_id||item.id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(item);}
    return [...groups.entries()].map(([id,items])=>({id,items:items.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)),last:items.at(-1)})).sort((a,b)=>new Date(b.last.created_at)-new Date(a.last.created_at));
  }
  function renderCommunications(){
    const all=communicationThreads(),inbox=all.filter(thread=>thread.items.some(item=>item.direction==='received')),sent=all.filter(thread=>thread.items.some(item=>item.direction==='sent'));
    const unread=(state.private_activity||[]).filter(item=>item.direction==='received'&&!item.read_at).length;root.querySelector('[data-inbox-count]').textContent=unread||inbox.length;
    const retention=root.querySelector('[data-message-retention]');if(retention)retention.textContent=state.is_pymium?'Plan Pymium · tus conversaciones se conservan sin límite.':'Plan básico · los mensajes se conservan durante 7 días.';
    root.querySelectorAll('[data-communications-filter]').forEach(button=>{const active=button.dataset.communicationsFilter===communicationsFilter;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
    const visible=communicationsFilter==='inbox'?inbox:communicationsFilter==='sent'?sent:all,list=root.querySelector('[data-communications-list]');
    list.innerHTML=visible.length?visible.map(thread=>{const item=thread.last,other=item.direction==='sent'?item.recipient_name:item.sender_name,isUnread=thread.items.some(row=>row.direction==='received'&&!row.read_at);return `<button type="button" class="communication-thread ${String(thread.id)===String(activeThreadId)?'active':''} ${isUnread?'unread':''}" data-thread-open="${escapeHTML(thread.id)}"><span class="communication-thread-top"><strong>${escapeHTML(other)}</strong><time>${escapeHTML(formatCommunicationDate(item.created_at))}</time></span><span class="communication-kind">${escapeHTML(privateKindInfo[item.kind]?.label||'Mensaje')}</span><b>${escapeHTML(item.subject||'Sin asunto')}</b><small>${escapeHTML(item.body)}</small></button>`;}).join(''):emptyState(communicationsFilter==='sent'?'Aún no has enviado comunicaciones':'No tienes comunicaciones aquí','Los mensajes y oportunidades aparecerán en esta bandeja.');
    if(activeThreadId&&!all.some(thread=>String(thread.id)===String(activeThreadId)))activeThreadId='';
    renderCommunicationDetail();
  }
  function renderCommunicationDetail(){
    const detail=root.querySelector('[data-communications-detail]'),thread=communicationThreads().find(item=>String(item.id)===String(activeThreadId));
    if(!thread){detail.innerHTML='<div class="communications-empty"><span aria-hidden="true">✉</span><h3>Selecciona una conversación</h3><p>Aquí podrás leer el historial completo y responder sin salir de Pymio.</p></div>';return;}
    const first=thread.items[0],last=thread.last,otherId=String(first.sender_company_id)===String(session.companyId)?first.recipient_company_id:first.sender_company_id,otherName=String(first.sender_company_id)===String(session.companyId)?first.recipient_name:first.sender_name,kind=first.kind,info=privateKindInfo[kind]||privateKindInfo.message;
    detail.innerHTML=`<header class="communications-detail-head"><div><span class="communication-kind">${escapeHTML(info.label)}</span><h3>${escapeHTML(first.subject||'Sin asunto')}</h3><p>Conversación con ${escapeHTML(otherName)}</p></div><span class="chat-live-status"><i></i> En tiempo real</span></header><div class="communication-messages" data-chat-messages>${thread.items.map(item=>`<article class="communication-message ${item.direction} ${item.pending?'pending':''}"><div><strong>${escapeHTML(item.direction==='sent'?'Tú':item.sender_name)}</strong><time>${escapeHTML(formatCommunicationDate(item.created_at))}</time></div><p>${escapeHTML(item.body)}</p>${Object.entries(item.metadata||{}).filter(([,value])=>value).map(([key,value])=>`<small>${escapeHTML({deadline:'Fecha límite',budget:'Presupuesto',valid_until:'Válida hasta'}[key]||key)}: ${escapeHTML(value)}</small>`).join('')}</article>`).join('')}</div><form class="chat-composer" data-chat-compose data-company="${escapeHTML(otherId)}" data-kind="${escapeHTML(kind)}" data-thread="${escapeHTML(thread.id)}" data-subject="${escapeHTML(first.subject||'Conversación')}"><label><span class="sr-only">Escribe un mensaje</span><textarea name="body" rows="1" maxlength="5000" required placeholder="Escribe un mensaje…"></textarea></label><button type="submit" class="btn" aria-label="Enviar mensaje">Enviar</button><p class="chat-compose-error" role="alert" hidden></p></form>`;
    requestAnimationFrame(()=>{const messages=detail.querySelector('[data-chat-messages]');if(messages)messages.scrollTop=messages.scrollHeight;});
  }

  function showRealtimeMessage(message){
    if(currentView==='comunicaciones'&&String(activeThreadId)===String(message.thread_id)&&document.visibilityState==='visible')return;
    let tray=document.querySelector('.pymio-chat-tray');if(!tray){tray=document.createElement('aside');tray.className='pymio-chat-tray';tray.setAttribute('aria-live','assertive');tray.setAttribute('aria-label','Mensajes nuevos');document.body.appendChild(tray);}
    const sender=message.display_name||message.sender_name||'RED Pymio',card=document.createElement('article');card.className='pymio-chat-popup';card.innerHTML=`<span class="chat-popup-avatar" aria-hidden="true">${escapeHTML(initials(sender))}</span><div class="chat-popup-copy"><span class="chat-popup-kicker"><i></i> Mensaje nuevo</span><strong>${escapeHTML(sender)}</strong><p>Te acaba de enviar un mensaje · ${escapeHTML(message.body||'Abre la conversación para leerlo.')}</p></div><button type="button" class="chat-popup-open">Ver chat</button><button type="button" class="chat-popup-close" aria-label="Cerrar">×</button>`;
    card.querySelector('.chat-popup-close').addEventListener('click',()=>card.remove());card.querySelector('.chat-popup-open').addEventListener('click',()=>{activeThreadId=String(message.thread_id);communicationsFilter='all';mostrarVistaEcosistema('comunicaciones');renderCommunications();card.remove();});tray.prepend(card);while(tray.children.length>3)tray.lastElementChild.remove();setTimeout(()=>card.remove(),15000);
  }
  function startRealtimeMessages(){
    if(demo||!window.EventSource||realtimeSource)return;
    const received=(state.private_activity||[]).filter(item=>item.direction==='received').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));realtimeCursor=received[0]?.created_at||new Date().toISOString();
    realtimeSource=new EventSource(`${apiUrl}/api/network/messages/stream?after=${encodeURIComponent(realtimeCursor)}`);
    realtimeSource.addEventListener('message',event=>{try{const update=JSON.parse(event.data),messages=update.realtime_messages||[];if(!messages.length)return;const existing=new Set((state.private_activity||[]).map(item=>String(item.id)));state={...state,...update};renderCommunications();publishNetworkNotifications();for(const message of messages)if(!existing.has(String(message.id)))showRealtimeMessage(message);}catch{}});
    realtimeSource.addEventListener('error',()=>{if(realtimeSource?.readyState===EventSource.CLOSED){realtimeSource=null;setTimeout(startRealtimeMessages,2500);}});
  }
  function updateFilters(){
    const businesses=state.businesses||[];
    const industries=[...new Set(businesses.map(item=>item.industry).filter(Boolean))].sort();
    const tags=[...new Set(businesses.flatMap(item=>item.product_tags||[]))].sort();
    get('industry-filter').innerHTML='<option value="">Todos los rubros</option>'+industries.map(v=>`<option>${escapeHTML(v)}</option>`).join('');
    get('product-filter').innerHTML='<option value="">Todos los productos</option>'+tags.map(v=>`<option>${escapeHTML(v)}</option>`).join('');
  }
  function renderCommunityRoles(container,roles){
    if(!container)return;container.hidden=!roles.length;
    container.innerHTML=roles.length?`<h3>Comunidades que gestionas</h3><div class="profile-community-role-list">${roles.map(item=>`<span class="profile-community-role"><strong>${escapeHTML(item.name)}</strong><small>${item.role==='owner'?'Creador':'Administrador'}</small></span>`).join('')}</div>`:'';
  }
  function renderProfile(){
    const p=state.profile||{};
    root.querySelector('[data-profile-name]').innerHTML=escapeHTML(p.display_name||'Completa tu perfil empresarial')+verifiedMark(p.verified);
    root.querySelector('[data-profile-summary]').textContent=p.description||'Agrega tu rubro, ubicación y oferta para aparecer en búsquedas relevantes.';
    root.querySelector('.profile-callout-mark').innerHTML=avatarMarkup(p);
    root.querySelector('[data-store-name]').innerHTML=escapeHTML(p.display_name||'Tu negocio')+verifiedMark(p.verified);
    root.querySelector('[data-store-initials]').textContent=initials(p.display_name);
    setProfileImage(root.querySelector('[data-store-avatar-img]'),root.querySelector('[data-store-initials]'),p.avatar_path,`Foto de ${p.display_name||'tu negocio'}`);
    const banner=root.querySelector('[data-store-banner-img]'),bannerSrc=profileImageUrl(p.banner_path);banner.hidden=!bannerSrc;banner.src=bannerSrc||'';root.querySelector('.store-hero').classList.toggle('has-banner',Boolean(bannerSrc));
    root.querySelector('[data-store-tagline]').textContent=p.store_tagline||p.description||'Personaliza cómo se presenta tu pyme a la red.';
    root.querySelector('[data-store-socials]').innerHTML=socialHTML(p);
    root.querySelector('[data-storefront]').style.setProperty('--store-accent',p.accent_color||'#f4ce4f');
    renderCommunityRoles(root.querySelector('[data-own-community-roles]'),state.managed_communities||[]);
  }
  function filteredBusinesses(){
    const query=get('match-search').value.trim().toLocaleLowerCase('es'),industry=get('industry-filter').value,product=get('product-filter').value;
    return (state.businesses||[]).filter(item=>{const haystack=[item.display_name,item.description,item.industry,item.location,...(item.product_tags||[])].join(' ').toLocaleLowerCase('es');return (!query||haystack.includes(query))&&(!industry||item.industry===industry)&&(!product||(item.product_tags||[]).includes(product));});
  }
  function renderMatches(){
    const rows=filteredBusinesses();get('match-count').textContent=`${rows.length} ${rows.length===1?'empresa encontrada':'empresas encontradas'}`;
    const outgoing=new Set((state.outgoing_connection_requests||[]).map(request=>String(request.company_id)));
    get('match-grid').innerHTML=rows.length?rows.map(item=>`<article class="card match-card ${item.is_self?'is-self':''}"><div class="match-top"><div class="match-avatar">${avatarMarkup(item)}</div><div><div class="match-name">${escapeHTML(item.display_name)} ${verifiedMark(item.verified)} ${item.is_self?'<span class="self-label">Tu negocio</span>':''}</div><div class="match-rubro">${escapeHTML([item.industry,item.location].filter(Boolean).join(' · ')||'Perfil en preparación')}</div></div></div><p class="match-description">${escapeHTML(item.store_tagline||item.description||'Esta empresa aún no agregó una descripción.')}</p><div class="match-badges">${(item.product_tags||[]).slice(0,3).map(tag=>`<span class="pill teal">${escapeHTML(tag)}</span>`).join('')}</div><div class="match-actions"><button type="button" class="profile-link" data-profile-view="${escapeHTML(item.company_id)}"><span>Ver perfil</span><span>→</span></button>${item.is_self?'':item.connected?'<button type="button" class="connect-button is-connected" disabled>Conectado</button>':outgoing.has(String(item.company_id))?'<button type="button" class="connect-button is-pending" disabled>Solicitud enviada</button>':`<button type="button" class="connect-button" data-connect-business="${escapeHTML(item.company_id)}">Conectar</button>`}</div></article>`).join(''):emptyState('No encontramos coincidencias','Prueba con otro rubro, producto o ubicación.');
  }
  const formatDate=value=>value?new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)):'';
  function renderPosts(){
    const events=(state.posts||[]).filter(p=>p.kind==='event'),benefits=(state.posts||[]).filter(p=>p.kind==='benefit');
    root.querySelector('[data-event-count]').textContent=events.length;root.querySelector('[data-benefit-count]').textContent=benefits.length;
    get('event-list').innerHTML=events.length?events.map(item=>`<article class="event-item"><div class="event-date"><div class="day">${new Date(item.event_at).getDate()}</div><div class="mon">${new Date(item.event_at).toLocaleDateString('es-CL',{month:'short'})}</div></div><div class="post-copy"><div class="post-heading"><div class="event-title">${escapeHTML(item.title)}</div>${item.is_author?`<button type="button" class="post-edit" data-post-edit="${escapeHTML(item.id)}">Editar</button>`:''}</div><p>${escapeHTML(item.description)}</p><div class="event-meta">${escapeHTML([item.location,item.community_name||item.author_name].filter(Boolean).join(' · '))}</div></div></article>`).join(''):emptyState('Sin eventos publicados','Los eventos creados por la red aparecerán aquí.');
    get('benefit-list').innerHTML=benefits.length?benefits.map(item=>`<article class="benefit-item"><div class="benefit-icon">%</div><div class="post-copy"><div class="post-heading"><div class="benefit-title">${escapeHTML(item.title)}</div>${item.is_author?`<button type="button" class="post-edit" data-post-edit="${escapeHTML(item.id)}">Editar</button>`:''}</div><p>${escapeHTML(item.description)}</p><div class="benefit-meta">${escapeHTML([item.community_name||item.author_name,item.expires_at?'Hasta '+formatDate(item.expires_at):'Sin fecha de término'].filter(Boolean).join(' · '))}</div></div></article>`).join(''):emptyState('Sin beneficios publicados','Los descuentos y alianzas compartidos por la red aparecerán aquí.');
    const adminIds=new Set((state.admin_community_ids||[]).map(String));root.querySelector('[name="communityId"]').innerHTML='<option value="">Toda RED Pymio</option>'+(state.communities||[]).filter(item=>item.owned||adminIds.has(String(item.id))).map(item=>`<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join('');
  }
  function imageUrl(product){
    const match=String(product.image_path||'').match(new RegExp(`^${session?.companyId}/([0-9a-f-]{36})\\.webp$`));
    return match?`${apiUrl}/api/product-images/${match[1]}?company_id=${encodeURIComponent(session.companyId)}`:'';
  }
  function renderProducts(){
    root.querySelector('[data-store-count]').textContent=`${products.length} ${products.length===1?'producto':'productos'}`;
    get('store-inventory-grid').innerHTML=products.length?products.slice(0,8).map(p=>`<article class="store-product"><div class="store-product-media">${imageUrl(p)?`<img src="${escapeHTML(imageUrl(p))}" alt="${escapeHTML(p.name)}" loading="lazy">`:'<span aria-hidden="true">◇</span>'}</div><div><span>${escapeHTML(p.category||'Sin categoría')}</span><h4>${escapeHTML(p.name)}</h4><p>${money.format(Number(p.price||0))}</p><small>Stock: ${Number(p.qty||0).toLocaleString('es-CL')}</small></div></article>`).join(''):`<div class="network-empty"><span class="network-empty-mark" aria-hidden="true">✦</span><strong>Tu vitrina está lista para recibir productos</strong><p>Agrega tu primer producto aquí y también aparecerá automáticamente en Inventario.</p><button type="button" class="btn" data-store-add-product>+ Agregar producto</button></div>`;
  }
  async function loadProducts(){
    if(products.length||demo){if(demo&&!products.length)products=demoProducts;renderProducts();return;}
    try{products=await request(`/api/products?company_id=${encodeURIComponent(session.companyId)}`);renderProducts();}catch{get('store-inventory-grid').innerHTML=emptyState('No pudimos cargar tu inventario','Inténtalo nuevamente desde el botón Actualizar.');}
  }
  function publishNetworkNotifications(){document.dispatchEvent(new CustomEvent('red-pymio-notifications',{detail:{requests:state.connection_requests||[],responses:state.connection_responses||[],activity:state.private_notifications||[],communityRoles:state.community_role_notifications||[]}}));}
  function renderAll(){renderCommunities();renderConnections();renderCommunications();renderProfile();updateFilters();renderMatches();renderPosts();publishNetworkNotifications();if(currentView==='pymio')loadProducts();}
  async function load(){
    if(demo){renderAll();return;}root.classList.add('network-loading');feedback.hidden=true;
    try{state=await request('/api/network/bootstrap');renderAll();startRealtimeMessages();}catch(error){announce(error.message,'error');get('community-grid').innerHTML=emptyState('No pudimos cargar RED Pymio','Revisa tu conexión y vuelve a intentarlo.');}finally{root.classList.remove('network-loading');}
  }
  function openDialog(dialog){feedback.hidden=true;dialog.showModal();requestAnimationFrame(()=>dialog.classList.add('is-open'));}
  function closeDialog(dialog){dialog.classList.remove('is-open');setTimeout(()=>{if(dialog.open)dialog.close();},180);}
  root.querySelectorAll('[data-dialog-close]').forEach(button=>button.addEventListener('click',()=>closeDialog(button.closest('dialog'))));
  root.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog&&dialog.id!=='community-form-builder')closeDialog(dialog);}));
  function openPublicProfile(profile){
    const dialog=get('profile-view-dialog'),name=profile.display_name||'Negocio en Pymio';
    dialog.querySelector('[data-public-initials]').textContent=initials(name);
    setProfileImage(dialog.querySelector('[data-public-avatar-img]'),dialog.querySelector('[data-public-initials]'),profile.avatar_path,`Foto de ${name}`);
    const banner=dialog.querySelector('[data-public-banner-img]'),bannerSrc=profileImageUrl(profile.banner_path);banner.hidden=!bannerSrc;banner.src=bannerSrc||'';
    dialog.querySelector('[data-public-name]').innerHTML=escapeHTML(name)+verifiedMark(profile.verified);
    dialog.querySelector('[data-public-meta]').textContent=[profile.industry,profile.location].filter(Boolean).join(' · ')||'Negocio en Pymio';
    dialog.querySelector('[data-public-description]').textContent=profile.description||profile.store_tagline||'Este negocio aún no agregó una descripción.';
    dialog.querySelector('[data-public-tags]').innerHTML=(profile.product_tags||[]).map(tag=>`<span class="pill teal">${escapeHTML(tag)}</span>`).join('');
    const roleBox=dialog.querySelector('[data-public-community-roles]'),roles=profile.is_self?(state.managed_communities||[]):[];renderCommunityRoles(roleBox,roles);
    dialog.querySelector('[data-public-socials]').innerHTML=socialHTML(profile)||'<span class="no-socials">Este negocio aún no agregó canales de contacto.</span>';
    const pending=(state.outgoing_connection_requests||[]).some(request=>String(request.company_id)===String(profile.company_id));
    const connect=dialog.querySelector('[data-public-connect]');connect.hidden=Boolean(profile.is_self);connect.disabled=Boolean(profile.connected||pending);connect.textContent=profile.connected?'Conectado':pending?'Solicitud enviada':'Conectar';connect.dataset.connectBusiness=profile.company_id||'';
    dialog.querySelector('.public-profile-cover').style.background=profile.accent_color||'#f4ce4f';openDialog(dialog);
  }
  const findBusiness=id=>(state.businesses||[]).find(row=>String(row.company_id)===String(id))||(state.connections||[]).find(row=>String(row.company_id)===String(id));
  async function connectBusiness(button){
    if(demo)return announce('Las conexiones no se envían desde la cuenta piloto.','info');
    setBusy(button,true,'Enviando…');try{state=await request(`/api/network/connections/${encodeURIComponent(button.dataset.connectBusiness)}`,{method:'POST'});renderAll();if(membersDialog?.open)renderMembers();closeDialog(get('profile-view-dialog'));announce('¡Solicitud enviada!');}catch(error){announce(error.message,'error');setBusy(button,false);}
  }
  root.addEventListener('click',event=>{const profileButton=event.target.closest('[data-profile-view]');if(profileButton){const item=findBusiness(profileButton.dataset.profileView);if(item)openPublicProfile(item);return;}const connectButton=event.target.closest('[data-connect-business]');if(connectButton)connectBusiness(connectButton);});
  root.querySelector('[data-open-own-profile]').addEventListener('click',()=>openPublicProfile(state.profile||{}));

  const privateDialog=get('private-activity-dialog'),privateForm=root.querySelector('[data-private-activity-form]');
  function openPrivateActivity(companyId,kind='message',threadId=''){
    const business=findBusiness(companyId);if(!business?.connected)return announce('Debes conectar con esta empresa antes de usar herramientas privadas.','error');
    const info=privateKindInfo[kind]||privateKindInfo.message;privateForm.reset();privateForm.elements.companyId.value=companyId;privateForm.elements.kind.value=kind;privateForm.elements.threadId.value=threadId;privateDialog.querySelector('[data-private-kicker]').textContent=threadId?'Responder conversación':info.kicker;privateDialog.querySelector('[data-private-title]').textContent=threadId?`Responder · ${info.label}`:info.title;privateDialog.querySelector('[data-private-recipient]').textContent=`Para ${business.display_name}`;privateDialog.querySelector('[data-private-fields]').innerHTML=`<div class="network-form-grid"><label class="field field-wide"><span>${escapeHTML(info.subject)}</span><input name="subject" maxlength="140" required placeholder="${escapeHTML(info.subjectPlaceholder)}"></label>${info.extras||''}<label class="field field-wide"><span>${escapeHTML(info.body)}</span><textarea name="body" maxlength="5000" rows="6" required placeholder="${escapeHTML(info.bodyPlaceholder)}"></textarea></label></div>`;privateDialog.querySelector('[data-private-submit]').textContent=threadId?'Responder':info.submit;openDialog(privateDialog);
  }
  root.addEventListener('click',event=>{const button=event.target.closest('[data-private-action]');if(button)openPrivateActivity(button.dataset.privateCompany,button.dataset.privateAction);});
  root.addEventListener('click',async event=>{
    const filter=event.target.closest('[data-communications-filter]');if(filter){communicationsFilter=filter.dataset.communicationsFilter;renderCommunications();return;}
    const threadButton=event.target.closest('[data-thread-open]');if(threadButton){activeThreadId=threadButton.dataset.threadOpen;renderCommunications();if(!demo){try{const connectionState=await request(`/api/network/activity/${encodeURIComponent(activeThreadId)}/read`,{method:'POST'});state={...state,...connectionState};renderCommunications();publishNetworkNotifications();}catch{}}return;}
    const reply=event.target.closest('[data-thread-reply]');if(reply)openPrivateActivity(reply.dataset.privateCompany,reply.dataset.privateKind,activeThreadId);
  });
  root.addEventListener('keydown',event=>{const field=event.target.closest('[data-chat-compose] textarea');if(field&&event.key==='Enter'&&!event.shiftKey){event.preventDefault();field.closest('form').requestSubmit();}});
  root.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-chat-compose]');if(!form)return;event.preventDefault();const button=form.querySelector('[type="submit"]'),body=new FormData(form).get('body')?.trim();if(!body)return;
    const threadId=form.dataset.thread,tempId=`pending-${crypto.randomUUID()}`,optimistic={id:tempId,thread_id:threadId,sender_company_id:session.companyId,recipient_company_id:form.dataset.company,sender_name:session.businessName||'Tú',recipient_name:findBusiness(form.dataset.company)?.display_name||'',kind:form.dataset.kind,subject:form.dataset.subject,body,metadata:{},created_at:new Date().toISOString(),read_at:null,direction:'sent',pending:true};
    setBusy(button,true,'Enviando…');state={...state,private_activity:[...(state.private_activity||[]),optimistic]};activeThreadId=threadId;renderCommunications();
    try{const connectionState=await request(`/api/network/connections/${encodeURIComponent(form.dataset.company)}/activity`,{method:'POST',body:JSON.stringify({kind:form.dataset.kind,subject:form.dataset.subject,body,threadId,metadata:{}})});state={...state,...connectionState};activeThreadId=threadId;renderCommunications();publishNetworkNotifications();}
    catch(cause){state={...state,private_activity:(state.private_activity||[]).filter(item=>String(item.id)!==tempId)};activeThreadId=threadId;renderCommunications();announce(`No pudimos enviar el mensaje: ${cause.message}`,'error');}
  });
  privateForm.addEventListener('submit',async event=>{event.preventDefault();const button=privateForm.querySelector('[type="submit"]'),data=Object.fromEntries(new FormData(privateForm)),metadata={deadline:data.deadline||'',budget:data.budget||'',validUntil:data.validUntil||''};setBusy(button,true,'Enviando…');try{const connectionState=await request(`/api/network/connections/${encodeURIComponent(data.companyId)}/activity`,{method:'POST',body:JSON.stringify({kind:data.kind,subject:data.subject,body:data.body,threadId:data.threadId,metadata})});state={...state,...connectionState};activeThreadId=data.threadId||state.private_activity?.at(-1)?.thread_id||activeThreadId;renderAll();closeDialog(privateDialog);announce(data.threadId?'Respuesta enviada.':'Comunicación enviada de forma privada.');}catch(error){privateForm.querySelector('.form-error').textContent=error.message;privateForm.querySelector('.form-error').hidden=false;}finally{setBusy(button,false);}});
  document.addEventListener('red-pymio-connection-decision',async event=>{if(demo)return;try{state=await request(`/api/network/connection-requests/${encodeURIComponent(event.detail.id)}`,{method:'POST',body:JSON.stringify({decision:event.detail.decision})});renderAll();announce(event.detail.decision==='accept'?'Conexión aceptada. La empresa ya aparece en Mi RED.':'Solicitud rechazada.');}catch(error){announce(error.message,'error');}});
  document.addEventListener('red-pymio-view-profile',event=>{const item=findBusiness(event.detail.companyId);if(item){mostrarVistaEcosistema('explorar');openPublicProfile(item);}});

  const productDialog=get('store-product-dialog'),productForm=root.querySelector('[data-store-product-form]');
  const productNumbers=new Map([
    ['qty',configureIntegerInput(productForm.elements.qty,{min:0})],
    ['cost',configureIntegerInput(productForm.elements.cost,{min:0})],
    ['price',configureIntegerInput(productForm.elements.price,{min:0})],
    ['crit_qty',configureIntegerInput(productForm.elements.crit_qty,{min:0})],
    ['low_qty',configureIntegerInput(productForm.elements.low_qty,{min:1})]
  ]);
  async function openProductDialog(){
    productForm.reset();productNumbers.forEach(controller=>controller?.set(''));productNumbers.get('qty')?.set(0);productNumbers.get('crit_qty')?.set(0);productNumbers.get('low_qty')?.set(1);
    const error=productForm.querySelector('.form-error'),category=productForm.elements.category;error.hidden=true;category.disabled=true;category.innerHTML='<option value="">Cargando categorías…</option>';openDialog(productDialog);
    if(demo){category.innerHTML='<option value="Sin Clasificar">Sin Clasificar</option><option value="Abarrotes">Abarrotes</option><option value="Bebidas">Bebidas</option>';category.disabled=false;return;}
    try{const categories=await request(`/api/categories?company_id=${encodeURIComponent(session.companyId)}`);category.innerHTML='<option value="">Selecciona una categoría</option>'+categories.map(item=>`<option value="${escapeHTML(item.name)}">${escapeHTML(item.name)}</option>`).join('');category.value=categories.some(item=>item.name==='Sin Clasificar')?'Sin Clasificar':'';category.disabled=false;}
    catch(cause){error.textContent=cause.message;error.hidden=false;category.innerHTML='<option value="">Categorías no disponibles</option>';}
  }
  root.addEventListener('click',event=>{if(event.target.closest('[data-store-add-product]'))openProductDialog();});
  productForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!productForm.reportValidity())return;
    const button=productForm.querySelector('[type="submit"]'),error=productForm.querySelector('.form-error'),formData=new FormData(productForm),image=formData.get('image');
    const data={name:String(formData.get('name')||'').trim(),category:String(formData.get('category')||'').trim()};
    for(const field of ['qty','cost','price','crit_qty','low_qty'])data[field]=parseFormattedInteger(formData.get(field));
    if(data.low_qty<=data.crit_qty){error.textContent='El stock bajo debe ser mayor que el stock crítico.';error.hidden=false;return;}
    error.hidden=true;setBusy(button,true,'Guardando…');let uploadedPath='';
    try{
      if(demo){products.push({...data,image_path:''});renderProducts();closeDialog(productDialog);return;}
      if(image instanceof File&&image.size){const optimized=await optimizarImagenProducto(image),uploadUrl=new URL('/api/product-images',apiUrl);uploadUrl.searchParams.set('company_id',session.companyId);const upload=await fetch(uploadUrl,{method:'POST',headers:{'Content-Type':optimized.mime},body:optimized.blob,signal:AbortSignal.timeout(20000)}),result=await upload.json();if(!upload.ok)throw new Error(result.error||'No se pudo guardar la foto.');uploadedPath=result.path;}
      const createdAt=new Date().toISOString();data.created_at=createdAt;data.updated_at=createdAt;data.image_path=uploadedPath||null;
      await request('/api/products',{method:'POST',body:JSON.stringify(data)});products=[];await loadProducts();document.dispatchEvent(new CustomEvent('inventario-actualizado'));closeDialog(productDialog);
    }catch(cause){if(uploadedPath){const id=uploadedPath.match(/\/([0-9a-f-]{36})\.webp$/)?.[1];if(id)fetch(`${apiUrl}/api/product-images/${id}?company_id=${encodeURIComponent(session.companyId)}`,{method:'DELETE'}).catch(()=>{});}error.textContent=cause.message;error.hidden=false;}
    finally{setBusy(button,false);}
  });

  const profileDialog=get('profile-dialog'),profileForm=root.querySelector('[data-profile-form]');let profilePreviewUrls=[];
  const releaseProfilePreviews=()=>{profilePreviewUrls.forEach(url=>URL.revokeObjectURL(url));profilePreviewUrls=[];};
  profileDialog.addEventListener('close',releaseProfilePreviews);
  const showEditorImage=(holder,src,{initialsText='',color='#f4ce4f'}={})=>{const img=holder.querySelector('img'),fallback=holder.querySelector('span');holder.style.setProperty('--profile-accent',color);img.hidden=!src;img.src=src||'';if(fallback){fallback.hidden=Boolean(src);if(initialsText)fallback.textContent=initialsText;}};
  const syncBannerEditor=()=>{const p=state.profile||{},mode=profileForm.elements.bannerMode.value,holder=profileForm.querySelector('[data-banner-preview]'),upload=profileForm.elements.bannerImage.closest('.media-upload');upload.toggleAttribute('aria-disabled',mode==='color');profileForm.elements.bannerImage.disabled=mode==='color';showEditorImage(holder,mode==='image'?profileImageUrl(p.banner_path):'',{color:profileForm.elements.accentColor.value});};
  root.querySelectorAll('[data-profile-edit]').forEach(button=>button.addEventListener('click',()=>{
    if(demo)return announce('La edición de perfil está desactivada en la cuenta piloto.','info');
    releaseProfilePreviews();profileForm.reset();const p=state.profile||{},map={displayName:'display_name',storeTagline:'store_tagline',accentColor:'accent_color',whatsappPhone:'whatsapp_phone',contactEmail:'contact_email'};
    for(const name of ['displayName','description','industry','location','storeTagline','accentColor','website','instagram','youtube','tiktok','facebook','linkedin','whatsappPhone','contactEmail'])profileForm.elements[name].value=p[map[name]||name]||(name==='accentColor'?'#f4ce4f':'');
    profileForm.elements.productTags.value=(p.product_tags||[]).join(', ');profileForm.elements.bannerMode.value=p.banner_path?'image':'color';
    showEditorImage(profileForm.querySelector('[data-avatar-preview]'),profileImageUrl(p.avatar_path),{initialsText:initials(p.display_name)});syncBannerEditor();openDialog(profileDialog);
  }));
  profileForm.elements.accentColor.addEventListener('input',syncBannerEditor);
  profileForm.querySelectorAll('[name="bannerMode"]').forEach(input=>input.addEventListener('change',syncBannerEditor));
  profileForm.elements.avatarImage.addEventListener('change',()=>{const file=profileForm.elements.avatarImage.files[0];if(!file)return;profileForm.elements.removeAvatar.checked=false;const url=URL.createObjectURL(file);profilePreviewUrls.push(url);showEditorImage(profileForm.querySelector('[data-avatar-preview]'),url,{initialsText:initials(profileForm.elements.displayName.value)});});
  profileForm.elements.removeAvatar.addEventListener('change',()=>{const p=state.profile||{},src=profileForm.elements.removeAvatar.checked?'':profileImageUrl(p.avatar_path);showEditorImage(profileForm.querySelector('[data-avatar-preview]'),src,{initialsText:initials(profileForm.elements.displayName.value)});});
  profileForm.elements.displayName.addEventListener('input',()=>{profileForm.querySelector('[data-avatar-preview-initials]').textContent=initials(profileForm.elements.displayName.value);});
  profileForm.elements.bannerImage.addEventListener('change',()=>{const file=profileForm.elements.bannerImage.files[0];if(!file)return;profileForm.elements.bannerMode.value='image';const url=URL.createObjectURL(file);profilePreviewUrls.push(url);showEditorImage(profileForm.querySelector('[data-banner-preview]'),url,{color:profileForm.elements.accentColor.value});});
  const uploadProfileImage=async(kind,blob)=>{const response=await fetch(`${apiUrl}/api/profile-images/${kind}`,{method:'POST',headers:{'Content-Type':blob.type},body:blob,signal:AbortSignal.timeout(20000)}),result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'No se pudo guardar la imagen del perfil.');return result.path;};
  const deleteProfileImage=path=>{const match=String(path||'').match(new RegExp(`^${session?.companyId}/(avatar|banner)/([0-9a-f-]{36})\\.webp$`,'i'));if(!match)return Promise.resolve();return fetch(`${apiUrl}/api/profile-images/${match[1]}/${match[2]}`,{method:'DELETE'}).catch(()=>{});};
  profileForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!profileForm.reportValidity())return;
    const button=profileForm.querySelector('[type="submit"]'),error=profileForm.querySelector('.form-error'),formData=new FormData(profileForm),p=state.profile||{},avatarFile=formData.get('avatarImage'),bannerFile=formData.get('bannerImage'),bannerMode=String(formData.get('bannerMode')||'color');
    const data=Object.fromEntries(formData);delete data.avatarImage;delete data.bannerImage;delete data.removeAvatar;delete data.bannerMode;data.productTags=String(data.productTags||'').split(',').map(v=>v.trim()).filter(Boolean);
    let avatarPath=formData.get('removeAvatar')?'':p.avatar_path||'',bannerPath=bannerMode==='image'?(p.banner_path||''):'';const uploaded=[];
    if(bannerMode==='image'&&!(bannerFile instanceof File&&bannerFile.size)&&!bannerPath){error.textContent='Elige una imagen para el banner o selecciona “Usar color”.';error.hidden=false;return;}
    setBusy(button,true,'Guardando…');error.hidden=true;
    try{
      if(avatarFile instanceof File&&avatarFile.size){const {blob}=await optimizarImagenPerfil(avatarFile,{width:600,height:600,maxBytes:250*1024});avatarPath=await uploadProfileImage('avatar',blob);uploaded.push(avatarPath);}
      if(bannerMode==='image'&&bannerFile instanceof File&&bannerFile.size){const {blob}=await optimizarImagenPerfil(bannerFile,{width:1440,height:480,maxBytes:500*1024});bannerPath=await uploadProfileImage('banner',blob);uploaded.push(bannerPath);}
      data.avatarPath=avatarPath;data.bannerPath=bannerPath;state=await request('/api/network/profile',{method:'PUT',body:JSON.stringify(data)});feedback.hidden=true;renderAll();closeDialog(profileDialog);releaseProfilePreviews();
      await Promise.all([p.avatar_path&&p.avatar_path!==avatarPath?deleteProfileImage(p.avatar_path):null,p.banner_path&&p.banner_path!==bannerPath?deleteProfileImage(p.banner_path):null]);
    }catch(cause){await Promise.all(uploaded.map(deleteProfileImage));error.textContent=cause.message;error.hidden=false;}finally{setBusy(button,false);}
  });

  const communityDialog=get('community-dialog'),communityForm=root.querySelector('[data-community-form]');
  root.querySelector('[data-community-summary]').addEventListener('click',event=>{const button=event.target.closest('[data-community-filter]');if(!button)return;communityFilter=button.dataset.communityFilter;renderCommunities();});
  get('community-search').addEventListener('input',event=>{communityQuery=event.target.value;renderCommunities();});
  root.querySelector('[data-community-create]').addEventListener('click',()=>{if(demo)return announce('La creación de comunidades está disponible en las cuentas personales.','info');communityForm.reset();openDialog(communityDialog);});
  communityForm.addEventListener('submit',async event=>{event.preventDefault();const button=communityForm.querySelector('[type="submit"]'),error=communityForm.querySelector('.form-error');setBusy(button,true,'Creando…');error.hidden=true;try{state=await request('/api/network/communities',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(communityForm)))});renderAll();closeDialog(communityDialog);announce('La comunidad fue creada.');}catch(cause){error.textContent=cause.message;error.hidden=false;}finally{setBusy(button,false);}});
  const detailDialog=get('community-detail-dialog'),communityEditDialog=get('community-edit-dialog'),membersDialog=get('community-members-dialog'),builderDialog=get('community-form-builder'),formView=get('community-form-view');
  let activeCommunityPane='overview';
  const canAdmin=()=>['owner','admin'].includes(activeCommunity?.community?.role);
  const isCommunityOwner=()=>activeCommunity?.community?.role==='owner';
  const activeCommunityRequests=()=>canAdmin()?(state.community_requests||[]).filter(request=>request.community_id===activeCommunity?.community?.id):[];
  const communityFromState=()=> (state.communities||[]).find(item=>item.id===activeCommunity?.community?.id)||{};
  const communityRoleLabel=role=>role==='owner'?'Creas y administras':role==='admin'?'Administras':'Eres miembro';
  const communityDate=value=>new Date(value).toLocaleString('es-CL',{dateStyle:'medium',timeStyle:'short'});
  function selectCommunityPane(pane='overview'){
    if(pane==='requests'&&!canAdmin())pane='overview';activeCommunityPane=pane;
    root.querySelectorAll('[data-community-pane]').forEach(button=>{const active=button.dataset.communityPane===pane;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    root.querySelectorAll('[data-community-panel]').forEach(panel=>{panel.hidden=panel.dataset.communityPanel!==pane;});
  }
  function renderMembers(){
    const query=root.querySelector('[data-member-search]').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const members=(activeCommunity?.members||[]).filter(item=>!query||item.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query));
    root.querySelector('[data-member-list]').innerHTML=members.map(item=>{const business=findBusiness(item.company_id),isSelf=String(item.company_id)===String(session.companyId),connected=Boolean(business?.connected);const connection=isSelf?'':connected?'<button type="button" class="connect-button is-connected" disabled>Conectado</button>':`<button type="button" class="connect-button" data-connect-business="${escapeHTML(item.company_id)}">Conectar</button>`;const mayChangeRole=canAdmin()&&item.role!=='owner'&&!isSelf&&(item.role!=='admin'||isCommunityOwner());const administration=mayChangeRole?`<button type="button" class="btn-outline" data-admin-company="${item.company_id}" data-admin-value="${item.role!=='admin'}">${item.role==='admin'?'Quitar administrador':'Hacer administrador'}</button>`:'';return `<article class="member-row"><span>${escapeHTML(initials(item.name))}</span><div class="member-identity"><strong>${escapeHTML(item.name)}</strong><small>${item.role==='owner'?'Creador - Administrador':item.role==='admin'?'Miembro - Administrador':'Miembro - Usuario'}</small></div><div class="member-actions">${connection}${administration}</div></article>`;}).join('')||emptyState('Sin resultados','No encontramos una tienda con ese nombre.');
  }
  function renderCommunityDetail(){
    const data=activeCommunity,community=data.community,members=data.members||[],events=data.events||[],forms=data.forms||[],admins=members.filter(item=>['owner','admin'].includes(item.role)),requests=activeCommunityRequests(),listedCommunity=communityFromState(),now=Date.now(),upcoming=events.filter(item=>new Date(item.event_at).getTime()>=now).sort((a,b)=>new Date(a.event_at)-new Date(b.event_at)),openForms=forms.filter(item=>item.status==='open');
    root.querySelector('[data-community-detail-title]').textContent=community.name;root.querySelector('[data-community-detail-description]').textContent=community.description||'Un espacio para coordinar, compartir y crecer en conjunto.';root.querySelector('[data-community-creator]').textContent=community.creator;
    root.querySelector('[data-community-access]').textContent=(community.is_open??listedCommunity.is_open)?'Acceso abierto':'Acceso con aprobación';root.querySelector('[data-community-role]').textContent=communityRoleLabel(community.role);
    const bannerSrc=communityImageUrl(community.banner_path),avatarSrc=communityImageUrl(community.avatar_path),banner=root.querySelector('[data-community-banner]'),avatar=root.querySelector('[data-community-avatar] img');banner.hidden=!bannerSrc;banner.src=bannerSrc||'';avatar.hidden=!avatarSrc;avatar.src=avatarSrc||'';avatar.alt=avatarSrc?`Foto de ${community.name}`:'';root.querySelector('[data-community-avatar-initials]').hidden=Boolean(avatarSrc);root.querySelector('[data-community-avatar-initials]').textContent=initials(community.name);root.querySelector('[data-community-socials]').innerHTML=socialHTML(community);
    root.querySelector('[data-community-admins]').innerHTML=admins.map(item=>`<div class="member-row compact"><span>${escapeHTML(initials(item.name))}</span><div><strong>${escapeHTML(item.name)}</strong><small>${item.role==='owner'?'Creador - Administrador':'Miembro - Administrador'}</small></div></div>`).join('');
    root.querySelector('[data-community-member-count]').textContent=members.length.toLocaleString('es-CL');root.querySelector('[data-community-event-count]').textContent=upcoming.length.toLocaleString('es-CL');root.querySelector('[data-community-form-count]').textContent=openForms.length.toLocaleString('es-CL');root.querySelector('[data-community-request-count]').textContent=requests.length.toLocaleString('es-CL');
    detailDialog.classList.toggle('community-detail-dialog--member',!canAdmin());root.querySelector('[data-members-view-label]').textContent=canAdmin()?'Gestionar miembros':'Ver miembros';root.querySelector('[data-community-inbox-title]').textContent=canAdmin()?'Pendientes de gestión':'Actividad de la comunidad';
    root.querySelector('[data-community-management]').hidden=!canAdmin();root.querySelector('[data-community-edit]').hidden=!canAdmin();root.querySelector('[data-community-request-metric]').hidden=!canAdmin();root.querySelector('[data-community-request-tab]').hidden=!canAdmin();root.querySelector('[data-community-request-tab-count]').textContent=requests.length;root.querySelector('[data-members-export]').hidden=!canAdmin();
    root.querySelectorAll('[data-form-create]').forEach(button=>{button.hidden=!canAdmin();});
    root.querySelector('[data-community-events]').innerHTML=events.map(item=>`<article class="community-resource"><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.description)}</p><small>${communityDate(item.event_at)}</small></article>`).join('')||emptyState('Sin eventos','Esta comunidad todavía no tiene eventos.');
    root.querySelector('[data-community-forms]').innerHTML=forms.map(item=>`<button type="button" class="community-resource form-resource" data-form-open="${escapeHTML(item.id)}"><span><strong>${escapeHTML(item.title)}</strong><small>${item.status==='open'?'Abierto':'Cerrado'}</small></span><span>→</span></button>`).join('')||emptyState('Sin formularios','Los administradores pueden crear el primero.');
    root.querySelector('[data-community-next-event]').innerHTML=upcoming[0]?`<article class="community-next-event"><time>${escapeHTML(communityDate(upcoming[0].event_at))}</time><strong>${escapeHTML(upcoming[0].title)}</strong><p>${escapeHTML(upcoming[0].description||'Revisa la información del evento en la agenda de la comunidad.')}</p></article>`:emptyState('Agenda disponible','Todavía no hay un próximo evento programado.');
    const inbox=[];
    if(canAdmin()&&requests.length)inbox.push({title:`${requests.length} ${requests.length===1?'solicitud pendiente':'solicitudes pendientes'}`,detail:'Revisa quién quiere sumarse.',pane:'requests',action:'Revisar'});
    if(canAdmin()&&!upcoming.length)inbox.push({title:'Agenda sin próximos eventos',detail:'Programa una actividad para la comunidad.',action:'Crear evento',createEvent:true});
    if(canAdmin()&&!openForms.length)inbox.push({title:'Sin formularios abiertos',detail:'Recopila opiniones o postulaciones.',action:'Crear',createForm:true});
    if(!canAdmin()&&upcoming.length)inbox.push({title:'Tienes un evento próximo',detail:communityDate(upcoming[0].event_at),pane:'events',action:'Ver'});
    if(!canAdmin()&&openForms.length)inbox.push({title:`${openForms.length} ${openForms.length===1?'formulario disponible':'formularios disponibles'}`,detail:'Tu participación ayuda a la comunidad.',pane:'forms',action:'Responder'});
    root.querySelector('[data-community-inbox]').innerHTML=inbox.length?inbox.map(item=>`<div class="community-inbox-row"><div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.detail)}</small></div><button type="button" ${item.pane?`data-community-pane-jump="${item.pane}"`:item.createEvent?'data-community-event-create':item.createForm?'data-form-create':''}>${escapeHTML(item.action)}</button></div>`).join(''):emptyState('Todo al día','No hay acciones pendientes en este momento.');
    root.querySelector('[data-community-requests]').innerHTML=requests.length?requests.map(request=>`<article class="community-request-row"><div class="match-avatar">${avatarMarkup(request)}</div><div><strong>${escapeHTML(request.display_name)}</strong><small>${escapeHTML([request.industry,request.location].filter(Boolean).join(' · ')||'Perfil en Pymio')}</small></div><div class="request-actions"><button type="button" data-community-request="${escapeHTML(request.id)}" data-community-id="${escapeHTML(community.id)}" data-decision="approve">Aceptar</button><button type="button" data-community-request="${escapeHTML(request.id)}" data-community-id="${escapeHTML(community.id)}" data-decision="reject">Rechazar</button></div></article>`).join(''):emptyState('Sin solicitudes pendientes','Las nuevas solicitudes aparecerán aquí.');
    selectCommunityPane(activeCommunityPane);
  }
  async function openCommunity(id){
    if(demo)return announce('El detalle interactivo está disponible en cuentas personales.','info');
    activeCommunity=await request(`/api/network/communities/${encodeURIComponent(id)}`);activeCommunityPane='overview';renderCommunityDetail();openDialog(detailDialog);
  }
  root.querySelectorAll('[data-members-view]').forEach(button=>button.onclick=()=>{root.querySelector('[data-member-search]').value='';renderMembers();openDialog(membersDialog);});
  root.querySelector('[data-member-search]').oninput=renderMembers;
  root.querySelector('[data-member-list]').onclick=async event=>{const button=event.target.closest('[data-admin-company]');if(!button)return;setBusy(button,true,'Guardando…');try{activeCommunity=await request(`/api/network/communities/${activeCommunity.community.id}/members/${button.dataset.adminCompany}/admin`,{method:'POST',body:JSON.stringify({isAdmin:button.dataset.adminValue==='true'})});renderCommunityDetail();renderMembers();}catch(error){announce(error.message,'error');setBusy(button,false);}};
  detailDialog.addEventListener('click',event=>{
    const requestButton=event.target.closest('[data-community-request]');if(requestButton){respondCommunityRequest(requestButton);return;}
    if(event.target.closest('[data-community-event-create]')){openCommunityEventComposer();return;}
    if(event.target.closest('[data-community-edit]')){openCommunityEditor();return;}
    if(event.target.closest('[data-form-create]')){openCommunityFormBuilder();return;}
    if(event.target.closest('[data-community-share]')){shareActiveCommunity();return;}
    if(event.target.closest('[data-members-export]')){exportCommunityMembers();return;}
    const button=event.target.closest('[data-community-pane],[data-community-pane-jump]');if(button)selectCommunityPane(button.dataset.communityPane||button.dataset.communityPaneJump);
  });
  const communityEditForm=root.querySelector('[data-community-edit-form]');let communityPreviewUrls=[];
  const releaseCommunityPreviews=()=>{communityPreviewUrls.forEach(url=>URL.revokeObjectURL(url));communityPreviewUrls=[];};
  communityEditDialog.addEventListener('close',releaseCommunityPreviews);
  const syncCommunityBannerEditor=()=>{const community=activeCommunity?.community||{},mode=communityEditForm.elements.bannerMode.value,holder=communityEditForm.querySelector('[data-community-banner-preview]'),upload=communityEditForm.elements.bannerImage.closest('.media-upload');upload.toggleAttribute('aria-disabled',mode==='color');communityEditForm.elements.bannerImage.disabled=mode==='color';showEditorImage(holder,mode==='image'?communityImageUrl(community.banner_path):'');};
  function openCommunityEditor(){
    if(!canAdmin())return;releaseCommunityPreviews();communityEditForm.reset();const community=activeCommunity.community;
    for(const name of ['name','description','industry','website','instagram','youtube','tiktok','facebook','linkedin'])communityEditForm.elements[name].value=community[name]||'';
    communityEditForm.elements.isOpen.checked=Boolean(community.is_open??communityFromState().is_open);communityEditForm.elements.bannerMode.value=community.banner_path?'image':'color';
    showEditorImage(communityEditForm.querySelector('[data-community-avatar-preview]'),communityImageUrl(community.avatar_path),{initialsText:initials(community.name)});syncCommunityBannerEditor();openDialog(communityEditDialog);
  }
  communityEditForm.querySelectorAll('[name="bannerMode"]').forEach(input=>input.addEventListener('change',syncCommunityBannerEditor));
  communityEditForm.elements.name.addEventListener('input',()=>{communityEditForm.querySelector('[data-community-avatar-preview-initials]').textContent=initials(communityEditForm.elements.name.value);});
  communityEditForm.elements.avatarImage.addEventListener('change',()=>{const file=communityEditForm.elements.avatarImage.files[0];if(!file)return;communityEditForm.elements.removeAvatar.checked=false;const url=URL.createObjectURL(file);communityPreviewUrls.push(url);showEditorImage(communityEditForm.querySelector('[data-community-avatar-preview]'),url,{initialsText:initials(communityEditForm.elements.name.value)});});
  communityEditForm.elements.removeAvatar.addEventListener('change',()=>{const src=communityEditForm.elements.removeAvatar.checked?'':communityImageUrl(activeCommunity?.community?.avatar_path);showEditorImage(communityEditForm.querySelector('[data-community-avatar-preview]'),src,{initialsText:initials(communityEditForm.elements.name.value)});});
  communityEditForm.elements.bannerImage.addEventListener('change',()=>{const file=communityEditForm.elements.bannerImage.files[0];if(!file)return;communityEditForm.elements.bannerMode.value='image';const url=URL.createObjectURL(file);communityPreviewUrls.push(url);showEditorImage(communityEditForm.querySelector('[data-community-banner-preview]'),url);});
  const uploadCommunityImage=async(kind,blob)=>{const response=await fetch(`${apiUrl}/api/network/communities/${activeCommunity.community.id}/images/${kind}`,{method:'POST',headers:{'Content-Type':blob.type},body:blob,signal:AbortSignal.timeout(20000)}),result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'No se pudo guardar la imagen de la comunidad.');return result.path;};
  const deleteCommunityImage=path=>{const match=String(path||'').match(/^([0-9a-f-]{36})\/(avatar|banner)\/([0-9a-f-]{36})\.webp$/i);if(!match)return Promise.resolve();return fetch(`${apiUrl}/api/network/communities/${match[1]}/images/${match[2]}/${match[3]}`,{method:'DELETE'}).catch(()=>{});};
  communityEditForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!communityEditForm.reportValidity())return;const button=communityEditForm.querySelector('[type="submit"]'),error=communityEditForm.querySelector('.form-error'),formData=new FormData(communityEditForm),community=activeCommunity.community,avatarFile=formData.get('avatarImage'),bannerFile=formData.get('bannerImage'),bannerMode=String(formData.get('bannerMode')||'color'),data=Object.fromEntries(formData);delete data.avatarImage;delete data.bannerImage;delete data.removeAvatar;delete data.bannerMode;
    let avatarPath=formData.get('removeAvatar')?'':community.avatar_path||'',bannerPath=bannerMode==='image'?(community.banner_path||''):'';const uploaded=[];
    if(bannerMode==='image'&&!(bannerFile instanceof File&&bannerFile.size)&&!bannerPath){error.textContent='Elige una imagen para el banner o selecciona “Usar color”.';error.hidden=false;return;}
    setBusy(button,true,'Guardando…');error.hidden=true;
    try{
      if(avatarFile instanceof File&&avatarFile.size){avatarPath=await uploadCommunityImage('avatar',(await optimizarImagenPerfil(avatarFile,{width:600,height:600,maxBytes:250*1024})).blob);uploaded.push(avatarPath);}
      if(bannerMode==='image'&&bannerFile instanceof File&&bannerFile.size){bannerPath=await uploadCommunityImage('banner',(await optimizarImagenPerfil(bannerFile,{width:1440,height:480,maxBytes:500*1024})).blob);uploaded.push(bannerPath);}
      data.avatarPath=avatarPath;data.bannerPath=bannerPath;activeCommunity=await request(`/api/network/communities/${community.id}/profile`,{method:'PUT',body:JSON.stringify(data)});state=await request('/api/network/bootstrap');renderAll();renderCommunityDetail();closeDialog(communityEditDialog);releaseCommunityPreviews();await Promise.all([community.avatar_path&&community.avatar_path!==avatarPath?deleteCommunityImage(community.avatar_path):null,community.banner_path&&community.banner_path!==bannerPath?deleteCommunityImage(community.banner_path):null]);announce('La comunidad fue actualizada.');
    }catch(cause){await Promise.all(uploaded.map(deleteCommunityImage));error.textContent=cause.message;error.hidden=false;}finally{setBusy(button,false);}
  });
  const questions=root.querySelector('[data-form-questions]');
  function addQuestion(){
    if(questions.children.length>=20)return announce('El máximo es de 20 preguntas.','error');
    const position=questions.children.length+1,row=document.createElement('fieldset');row.className='form-question';row.innerHTML=`<legend>Pregunta ${position}</legend><label class="field question-title-field"><span class="sr-only">Texto de la pregunta</span><input data-question-title maxlength="200" required aria-label="Texto de la pregunta" placeholder="Escribe aquí la pregunta"></label><label class="field"><span>Tipo de respuesta</span><select data-question-type><option value="text">Texto</option><option value="select">Lista desplegable</option><option value="file">Archivo</option></select></label><div class="question-answer-preview" data-answer-preview><label class="field" data-text-preview><span>Respuesta de texto</span><textarea rows="3" placeholder="El usuario escribirá aquí su respuesta" disabled></textarea></label><label class="field" data-options hidden><span>Opciones de la lista</span><small>Escribe cada opción en una línea separada.</small><textarea rows="4" placeholder="Opción 1&#10;Opción 2&#10;Opción 3"></textarea></label><label class="field form-file-field" data-file-preview hidden><span>Archivo solicitado</span><input type="file" accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif,.csv,.xls,.xlsx" disabled><small>PDF, DOCX, DOC, JPG, PNG, WebP, AVIF, HEIC, CSV, XLS o XLSX. Máximo 2,5 MB después de optimizar.</small></label></div><button type="button" class="btn-outline question-remove" data-question-remove>Eliminar pregunta</button>`;questions.appendChild(row);
    const updateType=()=>{const type=row.querySelector('[data-question-type]').value;row.querySelector('[data-text-preview]').hidden=type!=='text';row.querySelector('[data-options]').hidden=type!=='select';row.querySelector('[data-file-preview]').hidden=type!=='file';};
    row.querySelector('[data-question-type]').onchange=updateType;updateType();row.querySelector('[data-question-remove]').onclick=()=>{row.remove();[...questions.children].forEach((item,index)=>item.querySelector('legend').textContent=`Pregunta ${index+1}`);};
  }
  root.querySelector('[data-question-add]').onclick=addQuestion;
  function openCommunityFormBuilder(){if(!canAdmin())return;questions.replaceChildren();root.querySelector('[data-community-form-builder]').reset();addQuestion();openDialog(builderDialog);}
  root.querySelector('[data-community-form-builder]').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,error=form.querySelector('.form-error'),button=form.querySelector('[type="submit"]');if(!form.reportValidity())return;const payload={communityId:activeCommunity.community.id,title:form.elements.title.value.trim(),questions:[...questions.children].map((row,index)=>({position:index+1,title:row.querySelector('[data-question-title]').value.trim(),type:row.querySelector('[data-question-type]').value,options:row.querySelector('[data-options] textarea').value.split('\n').map(value=>value.trim()).filter(Boolean)}))};setBusy(button,true,'Publicando…');error.hidden=true;try{activeCommunity=await request('/api/network/forms',{method:'POST',body:JSON.stringify(payload)});renderCommunityDetail();closeDialog(builderDialog);}catch(cause){error.textContent=cause.message;error.hidden=false;}finally{setBusy(button,false);}};
  function renderFormView(){
    const form=activeForm,admin=canAdmin(),answers=new Map((activeResponse?.answers||[]).map(answer=>[answer.question_id,answer]));root.querySelector('[data-form-view-title]').textContent=form.title;root.querySelector('[data-form-view-status]').textContent=form.status==='open'?(activeResponse?'Respuesta enviada · puedes editarla mientras el formulario siga abierto.':'Formulario abierto'):'Formulario cerrado';
    root.querySelector('[data-form-view-questions]').innerHTML=form.questions.map(question=>{const answer=answers.get(question.id)||{};return `<label class="field form-answer"><span>Pregunta ${question.position}: ${escapeHTML(question.title)}</span>${question.type==='text'?`<textarea name="${question.id}" rows="4" required>${escapeHTML(answer.text_value||'')}</textarea>`:question.type==='select'?`<select name="${question.id}" required><option value="">Selecciona una alternativa</option>${question.options.map(option=>`<option${answer.option_value===option?' selected':''}>${escapeHTML(option)}</option>`).join('')}</select>`:`<input name="${question.id}" type="file" accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif,.csv,.xls,.xlsx" ${answer.file_path?'':'required'}>${answer.file_path?`<small class="form-current-file">Archivo actual: <strong>${escapeHTML(answer.file_name||'archivo adjunto')}</strong>. Selecciona otro archivo para reemplazarlo.</small>`:'<small>PDF, DOCX, DOC, JPG, PNG, WebP, AVIF, HEIC, CSV, XLS o XLSX. Máximo 2,5 MB después de optimizar.</small>'}`}</label>`}).join('');
    root.querySelector('[data-form-submit]').hidden=form.status!=='open';root.querySelector('[data-form-close]').hidden=!admin||form.status!=='open';root.querySelector('[data-form-download]').hidden=!admin;
  }
  root.querySelector('[data-community-forms]').onclick=async event=>{const button=event.target.closest('[data-form-open]');if(!button)return;activeForm=(activeCommunity.forms||[]).find(item=>item.id===button.dataset.formOpen);if(activeForm){setBusy(button,true,'Abriendo…');try{activeResponse=(await request(`/api/network/forms/${activeForm.id}/responses`)).response;renderFormView();openDialog(formView);}catch(error){announce(error.message,'error');}finally{setBusy(button,false);}}};
  root.querySelector('[data-form-close]').onclick=async()=>{activeCommunity=await request(`/api/network/forms/${activeForm.id}/close`,{method:'POST'});activeForm=(activeCommunity.forms||[]).find(item=>item.id===activeForm.id);renderCommunityDetail();renderFormView();};
  root.querySelector('[data-form-download]').onclick=()=>{location.href=`${apiUrl}/api/network/forms/${encodeURIComponent(activeForm.id)}/files.zip`;};
  root.querySelector('[data-community-form-response]').onsubmit=async event=>{event.preventDefault();const formNode=event.currentTarget,error=formNode.querySelector('.form-error'),button=root.querySelector('[data-form-submit]');if(!formNode.reportValidity())return;const responseId=activeResponse?.id||crypto.randomUUID(),answers=[],previous=new Map((activeResponse?.answers||[]).map(answer=>[answer.question_id,answer]));setBusy(button,true,'Enviando…');error.hidden=true;try{for(const question of activeForm.questions){const input=formNode.elements[question.id];if(question.type==='file'){const file=input.files[0];if(!file){const current=previous.get(question.id);if(!current?.file_path)throw new Error(`Selecciona un archivo para la Pregunta ${question.position}.`);answers.push({questionId:question.id,filePath:current.file_path,fileName:current.file_name,mimeType:current.mime_type,compressed:current.compressed});continue;}let body=file,mime=file.type||'application/octet-stream',name=file.name;if(IMAGE_INPUT_TYPES.has(file.type)){const optimized=await optimizarImagenProducto(file);body=optimized.blob;mime=optimized.mime;name=file.name.replace(/\.[^.]+$/,mime==='image/webp'?'.webp':mime==='image/png'?'.png':'.jpg');}if(body.size>2.5*1024*1024)throw new Error(`El archivo de Pregunta ${question.position} supera 2,5 MB después de optimizar.`);const upload=await fetch(`${apiUrl}/api/network/forms/${activeForm.id}/responses/${responseId}/questions/${question.id}/file`,{method:'POST',headers:{'Content-Type':mime,'X-File-Name':encodeURIComponent(name)},body}),result=await upload.json();if(!upload.ok)throw new Error(result.error||'No se pudo subir el archivo.');answers.push({questionId:question.id,...result});}else answers.push({questionId:question.id,[question.type==='select'?'optionValue':'textValue']:input.value});}const wasEditing=Boolean(activeResponse),saved=await request(`/api/network/forms/${activeForm.id}/responses`,{method:'POST',body:JSON.stringify({responseId,answers})});activeResponse=saved.response;closeDialog(formView);announce(wasEditing?'Tu respuesta fue actualizada.':'Tus respuestas fueron enviadas.');}catch(cause){error.textContent=cause.message;error.hidden=false;}finally{setBusy(button,false);}};
  async function respondCommunityRequest(button){
    if(demo)return;setBusy(button,true,button.dataset.decision==='approve'?'Aceptando…':'Rechazando…');
    try{
      state=await request(`/api/network/communities/${encodeURIComponent(button.dataset.communityId)}/requests/${encodeURIComponent(button.dataset.communityRequest)}`,{method:'POST',body:JSON.stringify({decision:button.dataset.decision})});renderAll();
      if(activeCommunity?.community?.id===button.dataset.communityId){activeCommunity=await request(`/api/network/communities/${encodeURIComponent(button.dataset.communityId)}`);renderCommunityDetail();}
      announce(button.dataset.decision==='approve'?'La empresa se unió a la comunidad.':'La solicitud fue rechazada.');
    }catch(error){announce(error.message,'error');setBusy(button,false);}
  }
  async function shareActiveCommunity(){
    const community=activeCommunity?.community;if(!community)return;
    const invitation=`Te invito a unirte a “${community.name}” en RED Pymio. Entra a RED Pymio y busca la comunidad por su nombre.`;
    const url=new URL('piloto.html',location.href).href;
    try{
      if(navigator.share)await navigator.share({title:`Comunidad ${community.name}`,text:invitation,url});
      else{await navigator.clipboard.writeText(`${invitation}\n${url}`);announce('La invitación fue copiada.');}
    }catch(error){if(error.name!=='AbortError')announce('No pudimos compartir la invitación.','error');}
  }
  function exportCommunityMembers(){
    if(!canAdmin())return;const safeCell=value=>{const text=String(value??'').replace(/^([=+\-@])/,'\'$1').replace(/"/g,'""');return `"${text}"`;},roleLabel=role=>role==='owner'?'Creador y administrador':role==='admin'?'Administrador':'Miembro';
    const rows=[['Negocio','Rol','Fecha de ingreso'],...(activeCommunity.members||[]).map(member=>[member.name,roleLabel(member.role),member.joined_at?new Date(member.joined_at).toLocaleDateString('es-CL'):''])];
    const blob=new Blob([`\ufeff${rows.map(row=>row.map(safeCell).join(',')).join('\r\n')}`],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`miembros-${activeCommunity.community.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'comunidad'}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('La lista de miembros fue exportada.');
  }
  get('community-grid').addEventListener('click',async event=>{
    const decisionButton=event.target.closest('[data-community-request]');
    if(decisionButton){respondCommunityRequest(decisionButton);return;}
    const button=event.target.closest('[data-community-join]');if(!button){const card=event.target.closest('[data-community-open]');if(card)openCommunity(card.dataset.communityOpen).catch(error=>announce(error.message,'error'));return;}if(demo)return announce('Las solicitudes no se envían desde la cuenta piloto.','info');
    const community=(state.communities||[]).find(item=>item.id===button.dataset.communityJoin);setBusy(button,true,community?.is_open?'Uniéndote…':'Enviando…');try{state=await request(`/api/network/communities/${encodeURIComponent(button.dataset.communityJoin)}/join`,{method:'POST'});renderAll();announce(community?.is_open?'Ya formas parte de la comunidad.':'La solicitud fue enviada a quien administra la comunidad.');}catch(error){announce(error.message,'error');setBusy(button,false);}
  });
  get('community-grid').addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key)||event.target.closest('button'))return;const card=event.target.closest('[data-community-open]');if(card){event.preventDefault();openCommunity(card.dataset.communityOpen).catch(error=>announce(error.message,'error'));}});

  const postDialog=get('post-dialog'),postForm=root.querySelector('[data-post-form]');
  let editingPostId=null;
  const localDateTime=value=>{if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  const syncPostKind=()=>{const isEvent=postForm.elements.kind.value==='event';postForm.querySelector('[data-date-label]').textContent=isEvent?'Fecha y hora':'Vigente hasta';postForm.elements.eventAt.required=isEvent;};
  postForm.addEventListener('change',event=>{if(event.target.name==='kind')syncPostKind();});
  const setPostDialogMode=(post=null)=>{
    editingPostId=post?.id||null;postForm.reset();
    postDialog.querySelector('.dialog-kicker').textContent=post?'Editar publicación':'Nueva publicación';
    postDialog.querySelector('h2').textContent=post?'Actualiza tu oportunidad':'Comparte una oportunidad';
    postForm.querySelector('[type="submit"]').textContent=post?'Guardar cambios':'Publicar';
    if(post){postForm.elements.kind.value=post.kind;postForm.elements.title.value=post.title||'';postForm.elements.description.value=post.description||'';postForm.elements.location.value=post.location||'';postForm.elements.eventAt.value=localDateTime(post.kind==='event'?post.event_at:post.expires_at);postForm.elements.communityId.value=post.community_id||'';}
    syncPostKind();
  };
  function openCommunityEventComposer(){
    if(!canAdmin())return;setPostDialogMode();postForm.elements.kind.value='event';const id=String(activeCommunity.community.id),select=postForm.elements.communityId;
    if(![...select.options].some(option=>option.value===id))select.add(new Option(activeCommunity.community.name,id));
    select.value=id;syncPostKind();openDialog(postDialog);
  }
  root.querySelector('[data-post-create]').addEventListener('click',()=>{if(demo)return announce('La publicación está disponible en las cuentas personales.','info');setPostDialogMode();openDialog(postDialog);});
  root.querySelector('.network-post-columns').addEventListener('click',event=>{const button=event.target.closest('[data-post-edit]');if(!button)return;const post=(state.posts||[]).find(item=>item.id===button.dataset.postEdit&&item.is_author);if(!post)return announce('Solo la empresa creadora puede editar esta publicación.','error');setPostDialogMode(post);openDialog(postDialog);});
  postForm.addEventListener('submit',async event=>{event.preventDefault();const button=postForm.querySelector('[type="submit"]'),error=postForm.querySelector('.form-error'),data=Object.fromEntries(new FormData(postForm));if(data.kind==='benefit'){data.expiresAt=data.eventAt;delete data.eventAt;}const editing=Boolean(editingPostId);setBusy(button,true,editing?'Guardando…':'Publicando…');error.hidden=true;try{state=await request(editing?`/api/network/posts/${encodeURIComponent(editingPostId)}`:'/api/network/posts',{method:editing?'PUT':'POST',body:JSON.stringify(data)});renderAll();closeDialog(postDialog);announce(editing?'La publicación fue actualizada.':'La publicación ya está visible.');editingPostId=null;}catch(cause){error.textContent=cause.message;error.hidden=false;}finally{setBusy(button,false);}});
  for(const id of ['match-search','industry-filter','product-filter'])get(id).addEventListener(id==='match-search'?'input':'change',renderMatches);
  if(demo)root.classList.add('is-demo');
  load();
}
