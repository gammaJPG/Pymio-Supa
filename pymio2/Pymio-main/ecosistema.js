import { revealView } from './motion.js';
import { configureIntegerInput, parseFormattedInteger } from './number-format.js';

let initialized=false,currentView='overview',selectViewImpl=null;
const views=new Set(['overview','pymio','red','explorar','eventos']);
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
  profile:{company_id:1,display_name:'Distribuidora Andes Ltda.',description:'Logística y distribución regional para comercios que necesitan entregas confiables.',store_tagline:'Movemos tu negocio a tiempo.',industry:'Logística',product_tags:['Distribución','Última milla'],location:'Quilicura',website:'https://pymio.cl',instagram:'https://instagram.com',linkedin:'https://linkedin.com',contact_email:'contacto@pymio.cl',accent_color:'#f4ce4f',verified:true,is_self:true},
  businesses:[
    {company_id:2,display_name:'EcoPack SpA',description:'Fabricante de empaques compostables.',store_tagline:'Empaques que cuidan lo que importa.',industry:'Manufactura',product_tags:['Empaques reciclables','Envases'],location:'Providencia',instagram:'https://instagram.com',website:'https://example.com',verified:true,connected:true},
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
async function optimizarImagenProducto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Selecciona una imagen JPG, PNG o WebP de hasta 10 MB.');
  let source;try{source=await createImageBitmap(file);}catch{throw new Error('No pudimos leer la imagen seleccionada.');}
  const scale=Math.min(1,800/Math.max(source.width,source.height)),width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale)),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(source,0,0,width,height);source.close?.();
  const encode=quality=>new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));let blob;
  for(const quality of [.8,.7,.6,.5]){blob=await encode(quality);if(blob?.size<=250*1024)break;}
  if(!blob||blob.size>250*1024)throw new Error('La foto no pudo optimizarse al tamaño permitido. Prueba con otra imagen.');
  return {blob};
}
async function optimizarImagenPerfil(file,{width,height,maxBytes}){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Selecciona una imagen JPG, PNG o WebP de hasta 10 MB.');
  let source;try{source=await createImageBitmap(file);}catch{throw new Error('No pudimos leer la imagen seleccionada.');}
  const targetRatio=width/height,sourceRatio=source.width/source.height;
  let sx=0,sy=0,sw=source.width,sh=source.height;
  if(sourceRatio>targetRatio){sw=Math.round(source.height*targetRatio);sx=Math.round((source.width-sw)/2);}else{sh=Math.round(source.width/targetRatio);sy=Math.round((source.height-sh)/2);}
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(source,sx,sy,sw,sh,0,0,width,height);source.close?.();
  const encode=quality=>new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));let blob;
  for(const quality of [.82,.74,.66,.58,.5]){blob=await encode(quality);if(blob?.size<=maxBytes)break;}
  if(!blob||blob.size>maxBytes)throw new Error('La imagen no pudo optimizarse al tamaño permitido. Prueba con otra imagen.');
  return {blob};
}
const socialDefs={
  website:{label:'Sitio web',viewBox:'0 0 16 16',path:'M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m7.5-6.923c-.67.204-1.335.82-1.887 1.855A8 8 0 0 0 5.145 4H7.5zM4.09 4a9.3 9.3 0 0 1 .64-1.539 7 7 0 0 1 .597-.933A7.03 7.03 0 0 0 2.255 4zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a7 7 0 0 0-.656 2.5zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5zM8.5 5v2.5h2.99a12.5 12.5 0 0 0-.337-2.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5zM5.145 12q.208.58.468 1.068c.552 1.035 1.218 1.65 1.887 1.855V12zm.182 2.472a7 7 0 0 1-.597-.933A9.3 9.3 0 0 1 4.09 12H2.255a7 7 0 0 0 3.072 2.472M3.82 11a13.7 13.7 0 0 1-.312-2.5h-2.49c.062.89.291 1.733.656 2.5zm6.853 3.472A7 7 0 0 0 13.745 12H11.91a9.3 9.3 0 0 1-.64 1.539 7 7 0 0 1-.597.933M8.5 12v2.923c.67-.204 1.335-.82 1.887-1.855q.26-.487.468-1.068zm3.68-1h2.146c.365-.767.594-1.61.656-2.5h-2.49a13.7 13.7 0 0 1-.312 2.5m2.802-3.5a7 7 0 0 0-.656-2.5H12.18c.174.782.282 1.623.312 2.5zM11.27 2.461c.247.464.462.98.64 1.539h1.835a7 7 0 0 0-3.072-2.472c.218.284.418.598.597.933M10.855 4a8 8 0 0 0-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077V4z'},
  instagram:{label:'Instagram',viewBox:'0 0 16 16',path:'M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.9 3.9 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599s.453.546.598.92c.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.5 2.5 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.388.046-3.231c.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92s.546-.453.92-.598c.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92m-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217m0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334'},
  youtube:{label:'YouTube',viewBox:'0 0 16 16',path:'M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.01 2.01 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.01 2.01 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31 31 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022-.26.01-.104c.048-.519.119-1.023.22-1.402a2.01 2.01 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A100 100 0 0 1 7.858 2zM6.4 5.209v4.818l4.157-2.408z'},
  tiktok:{label:'TikTok',viewBox:'0 0 16 16',path:'M9 0h1.98c.144.715.54 1.617 1.235 2.512C12.895 3.389 13.797 4 15 4v2c-1.753 0-3.07-.814-4-1.829V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3z'},
  facebook:{label:'Facebook',viewBox:'0 0 16 16',path:'M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951'},
  linkedin:{label:'LinkedIn',viewBox:'0 0 16 16',path:'M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854zm4.943 12.248V6.169H2.542v7.225zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248S2.4 3.226 2.4 3.934c0 .694.521 1.248 1.327 1.248zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016l.016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225z'},
  contact_email:{label:'Correo electrónico',viewBox:'0 0 16 16',path:'M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414zM0 4.697v7.104l5.803-3.558zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586zm3.436-.586L16 11.801V4.697z'},
};
function socialHTML(profile){
  return Object.entries(socialDefs).map(([key,{label,viewBox,path}])=>{
    const value=profile?.[key]; if(!value)return '';
    const href=key==='contact_email'?`mailto:${value}`:value;
    return `<a class="social-link social-${key}" href="${escapeHTML(href)}" target="${key==='contact_email'?'_self':'_blank'}" rel="noopener noreferrer" aria-label="${label}" title="${label}" data-social="${key}"><svg viewBox="${viewBox}" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg></a>`;
  }).join('');
}

export function iniciarEcosistema({session,apiUrl}={}){
  if(initialized)return;
  const root=document.getElementById('tab-ecosistema'); if(!root)return;
  initialized=true;
  const get=id=>root.querySelector('#'+id),demo=Boolean(session?.demo);
  let state=demo?structuredClone(demoData):{profile:null,businesses:[],connections:[],communities:[],community_requests:[],posts:[]},products=[];
  const feedback=root.querySelector('.ecosistema-feedback');
  const announce=(message,type='success')=>{feedback.textContent=message;feedback.dataset.type=type;feedback.hidden=false;};
  const setBusy=(button,busy,label)=>{button.disabled=busy;if(label){if(!button.dataset.label)button.dataset.label=button.textContent;button.textContent=busy?label:button.dataset.label;}};
  const request=async(path,options={})=>{const response=await fetch(apiUrl+path,{cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'No pudimos completar la acción.');return result;};
  const profileImageUrl=path=>{
    const match=String(path||'').match(/^([1-9]\d*)\/(avatar|banner)\/([0-9a-f-]{36})\.webp$/i);
    return match?`${apiUrl}/api/profile-images/${match[1]}/${match[2]}/${match[3]}`:'';
  };
  const setProfileImage=(img,initialsNode,path,alt)=>{
    const src=profileImageUrl(path);img.hidden=!src;img.src=src||'';img.alt=src?alt:'';if(initialsNode)initialsNode.hidden=Boolean(src);
  };
  const avatarMarkup=profile=>{const src=profileImageUrl(profile?.avatar_path);return src?`<img src="${escapeHTML(src)}" alt="Foto de ${escapeHTML(profile.display_name||'negocio')}" loading="lazy">`:escapeHTML(initials(profile?.display_name));};

  selectViewImpl=(view,keyboard=false)=>{
    currentView=view;
    root.querySelectorAll('.subpanel').forEach(panel=>panel.classList.toggle('active',panel.id===`sub-${view}`));
    document.querySelectorAll('[data-network-view]').forEach(button=>button.classList.toggle('active',button.dataset.networkView===view));
    const target=get('sub-'+view); if(target)revealView(target,{keyboard});
    if(view==='pymio')loadProducts();
  };
  root.addEventListener('click',event=>{const button=event.target.closest('[data-network-view]');if(!button)return;mostrarVistaEcosistema(button.dataset.networkView,{keyboard:event.detail===0});});
  selectViewImpl(currentView);

  function renderCommunities(){
    const rows=state.communities||[],joined=rows.filter(item=>item.joined).length,owned=rows.filter(item=>item.owned).length;
    const summary=root.querySelector('[data-community-summary]');summary.hidden=demo;summary.innerHTML=`<span><strong>${joined}</strong> en tu red</span><span><strong>${owned}</strong> creadas por ti</span><span><strong>${rows.length}</strong> disponibles</span>`;
    get('community-grid').innerHTML=rows.length?rows.map((item,index)=>{
      const requests=(state.community_requests||[]).filter(request=>request.community_id===item.id);
      const action=item.owned?'<span class="joined-label">Administras</span>':item.joined?'<span class="joined-label">Miembro - Usuario</span>':item.pending_request?'<button class="btn-outline" disabled>Solicitud enviada</button>':`<button class="btn-outline" data-community-join="${escapeHTML(item.id)}">${item.is_open?'Unirme':'Solicitar acceso'}</button>`;
      const requestList=item.owned&&requests.length?`<div class="join-requests"><strong>${requests.length===1?'1 solicitud pendiente':`${requests.length} solicitudes pendientes`}</strong>${requests.map(request=>`<div class="join-request"><div class="match-avatar">${avatarMarkup(request)}</div><div><b>${escapeHTML(request.display_name)}</b><small>${escapeHTML([request.industry,request.location].filter(Boolean).join(' · ')||'Perfil en Pymio')}</small></div><div class="request-actions"><button type="button" data-community-request="${escapeHTML(request.id)}" data-community-id="${escapeHTML(item.id)}" data-decision="approve">Aceptar</button><button type="button" data-community-request="${escapeHTML(request.id)}" data-community-id="${escapeHTML(item.id)}" data-decision="reject">Rechazar</button></div></div>`).join('')}</div>`:'';
      return `<article class="card community-card"><div class="community-heading"><span class="community-monogram">${String(index+1).padStart(2,'0')}</span><span class="community-access-label">${item.is_open?'Abierta':'Con aprobación'}</span></div><span class="pill honey">${escapeHTML(item.industry||'Comunidad')}</span><h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.description)}</p><div class="community-owner">Creada por ${escapeHTML(item.owner_name||'una empresa de Pymio')}</div><div class="community-meta"><span>${Number(item.member_count||0).toLocaleString('es-CL')} miembros</span>${action}</div>${requestList}</article>`;
    }).join(''):emptyState('Aún no hay comunidades','Crea la primera comunidad de RED Pymio y define el espacio que tu sector necesita.');
  }
  function renderConnections(){
    const rows=state.connections||[];root.querySelector('[data-connection-count]').textContent=`${rows.length} ${rows.length===1?'conexión':'conexiones'}`;
    get('connection-grid').innerHTML=rows.length?rows.map(item=>`<article class="card connection-card"><div class="match-top"><div class="match-avatar">${avatarMarkup(item)}</div><div><div class="match-name">${escapeHTML(item.display_name)} ${verifiedMark(item.verified)}</div><div class="match-rubro">${escapeHTML([item.industry,item.location].filter(Boolean).join(' · ')||'Perfil en Pymio')}</div></div></div><p>${escapeHTML(item.store_tagline||item.description||'Esta empresa forma parte de tu red.')}</p><button type="button" class="profile-link" data-profile-view="${escapeHTML(item.company_id)}"><span>Ver perfil Pymio</span><span>→</span></button></article>`).join(''):emptyState('Todavía no conectas con otras empresas','Explora perfiles y usa el botón Conectar para construir tu red.');
  }
  function updateFilters(){
    const businesses=state.businesses||[];
    const industries=[...new Set(businesses.map(item=>item.industry).filter(Boolean))].sort();
    const tags=[...new Set(businesses.flatMap(item=>item.product_tags||[]))].sort();
    get('industry-filter').innerHTML='<option value="">Todos los rubros</option>'+industries.map(v=>`<option>${escapeHTML(v)}</option>`).join('');
    get('product-filter').innerHTML='<option value="">Todos los productos</option>'+tags.map(v=>`<option>${escapeHTML(v)}</option>`).join('');
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
  }
  function filteredBusinesses(){
    const query=get('match-search').value.trim().toLocaleLowerCase('es'),industry=get('industry-filter').value,product=get('product-filter').value;
    return (state.businesses||[]).filter(item=>{const haystack=[item.display_name,item.description,item.industry,item.location,...(item.product_tags||[])].join(' ').toLocaleLowerCase('es');return (!query||haystack.includes(query))&&(!industry||item.industry===industry)&&(!product||(item.product_tags||[]).includes(product));});
  }
  function renderMatches(){
    const rows=filteredBusinesses();get('match-count').textContent=`${rows.length} ${rows.length===1?'empresa encontrada':'empresas encontradas'}`;
    get('match-grid').innerHTML=rows.length?rows.map(item=>`<article class="card match-card ${item.is_self?'is-self':''}"><div class="match-top"><div class="match-avatar">${avatarMarkup(item)}</div><div><div class="match-name">${escapeHTML(item.display_name)} ${verifiedMark(item.verified)} ${item.is_self?'<span class="self-label">Tu negocio</span>':''}</div><div class="match-rubro">${escapeHTML([item.industry,item.location].filter(Boolean).join(' · ')||'Perfil en preparación')}</div></div></div><p class="match-description">${escapeHTML(item.store_tagline||item.description||'Esta empresa aún no agregó una descripción.')}</p><div class="match-badges">${(item.product_tags||[]).slice(0,3).map(tag=>`<span class="pill teal">${escapeHTML(tag)}</span>`).join('')}</div><div class="match-actions"><button type="button" class="profile-link" data-profile-view="${escapeHTML(item.company_id)}"><span>Ver perfil</span><span>→</span></button>${item.is_self?'':item.connected?'<button type="button" class="connect-button is-connected" disabled>Conectado</button>':`<button type="button" class="connect-button" data-connect-business="${escapeHTML(item.company_id)}">Conectar</button>`}</div></article>`).join(''):emptyState('No encontramos coincidencias','Prueba con otro rubro, producto o ubicación.');
  }
  const formatDate=value=>value?new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)):'';
  function renderPosts(){
    const events=(state.posts||[]).filter(p=>p.kind==='event'),benefits=(state.posts||[]).filter(p=>p.kind==='benefit');
    root.querySelector('[data-event-count]').textContent=events.length;root.querySelector('[data-benefit-count]').textContent=benefits.length;
    get('event-list').innerHTML=events.length?events.map(item=>`<article class="event-item"><div class="event-date"><div class="day">${new Date(item.event_at).getDate()}</div><div class="mon">${new Date(item.event_at).toLocaleDateString('es-CL',{month:'short'})}</div></div><div class="post-copy"><div class="post-heading"><div class="event-title">${escapeHTML(item.title)}</div>${item.is_author?`<button type="button" class="post-edit" data-post-edit="${escapeHTML(item.id)}">Editar</button>`:''}</div><p>${escapeHTML(item.description)}</p><div class="event-meta">${escapeHTML([item.location,item.community_name||item.author_name].filter(Boolean).join(' · '))}</div></div></article>`).join(''):emptyState('Sin eventos publicados','Los eventos creados por la red aparecerán aquí.');
    get('benefit-list').innerHTML=benefits.length?benefits.map(item=>`<article class="benefit-item"><div class="benefit-icon">%</div><div class="post-copy"><div class="post-heading"><div class="benefit-title">${escapeHTML(item.title)}</div>${item.is_author?`<button type="button" class="post-edit" data-post-edit="${escapeHTML(item.id)}">Editar</button>`:''}</div><p>${escapeHTML(item.description)}</p><div class="benefit-meta">${escapeHTML([item.community_name||item.author_name,item.expires_at?'Hasta '+formatDate(item.expires_at):'Sin fecha de término'].filter(Boolean).join(' · '))}</div></div></article>`).join(''):emptyState('Sin beneficios publicados','Los descuentos y alianzas compartidos por la red aparecerán aquí.');
    root.querySelector('[name="communityId"]').innerHTML='<option value="">Toda RED Pymio</option>'+(state.communities||[]).filter(item=>item.joined).map(item=>`<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join('');
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
  function renderAll(){renderCommunities();renderConnections();renderProfile();updateFilters();renderMatches();renderPosts();if(currentView==='pymio')loadProducts();}
  async function load(){
    if(demo){renderAll();return;}root.classList.add('network-loading');feedback.hidden=true;
    try{state=await request('/api/network/bootstrap');renderAll();}catch(error){announce(error.message,'error');get('community-grid').innerHTML=emptyState('No pudimos cargar RED Pymio','Revisa tu conexión y vuelve a intentarlo.');}finally{root.classList.remove('network-loading');}
  }
  function openDialog(dialog){feedback.hidden=true;dialog.showModal();requestAnimationFrame(()=>dialog.classList.add('is-open'));}
  function closeDialog(dialog){dialog.classList.remove('is-open');setTimeout(()=>{if(dialog.open)dialog.close();},180);}
  root.querySelectorAll('[data-dialog-close]').forEach(button=>button.addEventListener('click',()=>closeDialog(button.closest('dialog'))));
  root.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog(dialog);}));
  function openPublicProfile(profile){
    const dialog=get('profile-view-dialog'),name=profile.display_name||'Negocio en Pymio';
    dialog.querySelector('[data-public-initials]').textContent=initials(name);
    setProfileImage(dialog.querySelector('[data-public-avatar-img]'),dialog.querySelector('[data-public-initials]'),profile.avatar_path,`Foto de ${name}`);
    const banner=dialog.querySelector('[data-public-banner-img]'),bannerSrc=profileImageUrl(profile.banner_path);banner.hidden=!bannerSrc;banner.src=bannerSrc||'';
    dialog.querySelector('[data-public-name]').innerHTML=escapeHTML(name)+verifiedMark(profile.verified);
    dialog.querySelector('[data-public-meta]').textContent=[profile.industry,profile.location].filter(Boolean).join(' · ')||'Negocio en Pymio';
    dialog.querySelector('[data-public-description]').textContent=profile.description||profile.store_tagline||'Este negocio aún no agregó una descripción.';
    dialog.querySelector('[data-public-tags]').innerHTML=(profile.product_tags||[]).map(tag=>`<span class="pill teal">${escapeHTML(tag)}</span>`).join('');
    dialog.querySelector('[data-public-socials]').innerHTML=socialHTML(profile)||'<span class="no-socials">Este negocio aún no agregó canales de contacto.</span>';
    const connect=dialog.querySelector('[data-public-connect]');connect.hidden=Boolean(profile.is_self);connect.disabled=Boolean(profile.connected);connect.textContent=profile.connected?'Conectado':'Conectar';connect.dataset.connectBusiness=profile.company_id||'';
    dialog.querySelector('.public-profile-cover').style.background=profile.accent_color||'#f4ce4f';openDialog(dialog);
  }
  const findBusiness=id=>(state.businesses||[]).find(row=>String(row.company_id)===String(id))||(state.connections||[]).find(row=>String(row.company_id)===String(id));
  async function connectBusiness(button){
    if(demo)return announce('Las conexiones no se envían desde la cuenta piloto.','info');
    setBusy(button,true,'Conectando…');try{state=await request(`/api/network/connections/${encodeURIComponent(button.dataset.connectBusiness)}`,{method:'POST'});renderAll();closeDialog(get('profile-view-dialog'));announce('La empresa ya forma parte de tu red.');}catch(error){announce(error.message,'error');setBusy(button,false);}
  }
  root.addEventListener('click',event=>{const profileButton=event.target.closest('[data-profile-view]');if(profileButton){const item=findBusiness(profileButton.dataset.profileView);if(item)openPublicProfile(item);return;}const connectButton=event.target.closest('[data-connect-business]');if(connectButton)connectBusiness(connectButton);});
  root.querySelector('[data-open-own-profile]').addEventListener('click',()=>openPublicProfile(state.profile||{}));

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
      if(image instanceof File&&image.size){const optimized=await optimizarImagenProducto(image),uploadUrl=new URL('/api/product-images',apiUrl);uploadUrl.searchParams.set('company_id',session.companyId);const upload=await fetch(uploadUrl,{method:'POST',headers:{'Content-Type':'image/webp'},body:optimized.blob,signal:AbortSignal.timeout(20000)}),result=await upload.json();if(!upload.ok)throw new Error(result.error||'No se pudo guardar la foto.');uploadedPath=result.path;}
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
    releaseProfilePreviews();profileForm.reset();const p=state.profile||{},map={displayName:'display_name',storeTagline:'store_tagline',accentColor:'accent_color',contactEmail:'contact_email'};
    for(const name of ['displayName','description','industry','location','storeTagline','accentColor','website','instagram','youtube','tiktok','facebook','linkedin','contactEmail'])profileForm.elements[name].value=p[map[name]||name]||(name==='accentColor'?'#f4ce4f':'');
    profileForm.elements.productTags.value=(p.product_tags||[]).join(', ');profileForm.elements.bannerMode.value=p.banner_path?'image':'color';
    showEditorImage(profileForm.querySelector('[data-avatar-preview]'),profileImageUrl(p.avatar_path),{initialsText:initials(p.display_name)});syncBannerEditor();openDialog(profileDialog);
  }));
  profileForm.elements.accentColor.addEventListener('input',syncBannerEditor);
  profileForm.querySelectorAll('[name="bannerMode"]').forEach(input=>input.addEventListener('change',syncBannerEditor));
  profileForm.elements.avatarImage.addEventListener('change',()=>{const file=profileForm.elements.avatarImage.files[0];if(!file)return;profileForm.elements.removeAvatar.checked=false;const url=URL.createObjectURL(file);profilePreviewUrls.push(url);showEditorImage(profileForm.querySelector('[data-avatar-preview]'),url,{initialsText:initials(profileForm.elements.displayName.value)});});
  profileForm.elements.removeAvatar.addEventListener('change',()=>{const p=state.profile||{},src=profileForm.elements.removeAvatar.checked?'':profileImageUrl(p.avatar_path);showEditorImage(profileForm.querySelector('[data-avatar-preview]'),src,{initialsText:initials(profileForm.elements.displayName.value)});});
  profileForm.elements.displayName.addEventListener('input',()=>{profileForm.querySelector('[data-avatar-preview-initials]').textContent=initials(profileForm.elements.displayName.value);});
  profileForm.elements.bannerImage.addEventListener('change',()=>{const file=profileForm.elements.bannerImage.files[0];if(!file)return;profileForm.elements.bannerMode.value='image';const url=URL.createObjectURL(file);profilePreviewUrls.push(url);showEditorImage(profileForm.querySelector('[data-banner-preview]'),url,{color:profileForm.elements.accentColor.value});});
  const uploadProfileImage=async(kind,blob)=>{const response=await fetch(`${apiUrl}/api/profile-images/${kind}`,{method:'POST',headers:{'Content-Type':'image/webp'},body:blob,signal:AbortSignal.timeout(20000)}),result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'No se pudo guardar la imagen del perfil.');return result.path;};
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
  root.querySelector('[data-community-create]').addEventListener('click',()=>{if(demo)return announce('La creación de comunidades está disponible en las cuentas personales.','info');communityForm.reset();openDialog(communityDialog);});
  communityForm.addEventListener('submit',async event=>{event.preventDefault();const button=communityForm.querySelector('[type="submit"]'),error=communityForm.querySelector('.form-error');setBusy(button,true,'Creando…');error.hidden=true;try{state=await request('/api/network/communities',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(communityForm)))});renderAll();closeDialog(communityDialog);announce('La comunidad fue creada.');}catch(cause){error.textContent=cause.message;error.hidden=false;}finally{setBusy(button,false);}});
  get('community-grid').addEventListener('click',async event=>{
    const decisionButton=event.target.closest('[data-community-request]');
    if(decisionButton){if(demo)return;setBusy(decisionButton,true,decisionButton.dataset.decision==='approve'?'Aceptando…':'Rechazando…');try{state=await request(`/api/network/communities/${encodeURIComponent(decisionButton.dataset.communityId)}/requests/${encodeURIComponent(decisionButton.dataset.communityRequest)}`,{method:'POST',body:JSON.stringify({decision:decisionButton.dataset.decision})});renderAll();announce(decisionButton.dataset.decision==='approve'?'La empresa se unió a la comunidad.':'La solicitud fue rechazada.');}catch(error){announce(error.message,'error');setBusy(decisionButton,false);}return;}
    const button=event.target.closest('[data-community-join]');if(!button)return;if(demo)return announce('Las solicitudes no se envían desde la cuenta piloto.','info');
    const community=(state.communities||[]).find(item=>item.id===button.dataset.communityJoin);setBusy(button,true,community?.is_open?'Uniéndote…':'Enviando…');try{state=await request(`/api/network/communities/${encodeURIComponent(button.dataset.communityJoin)}/join`,{method:'POST'});renderAll();announce(community?.is_open?'Ya formas parte de la comunidad.':'La solicitud fue enviada a quien administra la comunidad.');}catch(error){announce(error.message,'error');setBusy(button,false);}
  });

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
  root.querySelector('[data-post-create]').addEventListener('click',()=>{if(demo)return announce('La publicación está disponible en las cuentas personales.','info');setPostDialogMode();openDialog(postDialog);});
  root.querySelector('.network-post-columns').addEventListener('click',event=>{const button=event.target.closest('[data-post-edit]');if(!button)return;const post=(state.posts||[]).find(item=>item.id===button.dataset.postEdit&&item.is_author);if(!post)return announce('Solo la empresa creadora puede editar esta publicación.','error');setPostDialogMode(post);openDialog(postDialog);});
  postForm.addEventListener('submit',async event=>{event.preventDefault();const button=postForm.querySelector('[type="submit"]'),error=postForm.querySelector('.form-error'),data=Object.fromEntries(new FormData(postForm));if(data.kind==='benefit'){data.expiresAt=data.eventAt;delete data.eventAt;}const editing=Boolean(editingPostId);setBusy(button,true,editing?'Guardando…':'Publicando…');error.hidden=true;try{state=await request(editing?`/api/network/posts/${encodeURIComponent(editingPostId)}`:'/api/network/posts',{method:editing?'PUT':'POST',body:JSON.stringify(data)});renderAll();closeDialog(postDialog);announce(editing?'La publicación fue actualizada.':'La publicación ya está visible.');editingPostId=null;}catch(cause){error.textContent=cause.message;error.hidden=false;}finally{setBusy(button,false);}});
  for(const id of ['match-search','industry-filter','product-filter'])get(id).addEventListener(id==='match-search'?'input':'change',renderMatches);
  if(demo)root.classList.add('is-demo');
  load();
}
