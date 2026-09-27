import { revealView } from './motion.js';
// Contenido de demostración adaptado del archivo pymio-ecosistema-piloto.html.
let initialized = false;
export function iniciarEcosistema() {
  if (initialized) return;
  const root = document.getElementById('tab-ecosistema');
  if (!root) return;
  initialized = true;
  const get = id => root.querySelector('#' + id);

  // ---------- DATOS FICTICIOS ----------
  const tabs = [
    {id:'red', label:'Mi Red', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="8" r="3"/><circle cx="12" cy="17" r="3"/><path d="M9.8 10.2 11 15M14.2 10.2 13 15M9.8 8h4.7" stroke-linecap="round"/></svg>'},
    {id:'explorar', label:'Explorar y Matchmaking', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" stroke-linecap="round"/></svg>'},
    {id:'mercado', label:'Mercado B2B', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3.5 9 5 4h14l1.5 5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h16v10.5a.5.5 0 0 1-.5.5H4.5a.5.5 0 0 1-.5-.5V9Z"/><path d="M9 13.5a3 3 0 0 0 6 0" stroke-linecap="round"/></svg>'},
    {id:'express', label:'Pymio Express', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke-linejoin="round"/></svg>'},
    {id:'eventos', label:'Eventos y Beneficios', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5.5" width="16" height="15" rx="1.8"/><path d="M4 10h16M8 3.5v3.5M16 3.5v3.5" stroke-linecap="round"/></svg>'},
  ];

  const communities = [
    {name:'Gastronomía RM', tipo:'Por sector', members:482, desc:'Restaurantes, cafeterías y productores de alimentos de la Región Metropolitana.'},
    {name:'Zona Industrial Quilicura', tipo:'Por territorio', members:167, desc:'Empresas manufactureras y logísticas del sector industrial de Quilicura.'},
    {name:'Fondos y Subsidios Pyme', tipo:'Por temática', members:310, desc:'Mapeo colaborativo de fondos públicos, Corfo y subsidios vigentes.'},
    {name:'Exportadores Emergentes', tipo:'Por temática', members:98, desc:'Pymes en proceso de exportar por primera vez, con apoyo de asesores validados.'},
    {name:'Retail y Comercio Ñuñoa-Providencia', tipo:'Por territorio', members:214, desc:'Comercio local de dos comunas vecinas, coordinación de ferias y eventos conjuntos.'},
    {name:'Servicios TI para Pymes', tipo:'Por sector', members:156, desc:'Desarrolladores, consultoras TI y agencias digitales que atienden a otras pymes.'},
  ];

  const qaList = [
    {title:'¿Cómo declaro un crédito fiscal por importación de insumos?', replies:12, status:'answered'},
    {title:'¿Alguien ha usado el subsidio Crece Mujer Emprendedora este año?', replies:8, status:'open'},
    {title:'¿Conviene arrendar o comprar una bodega de 200 m² en Quilicura?', replies:5, status:'open'},
    {title:'¿Qué certificación piden para vender a supermercados grandes?', replies:15, status:'answered'},
  ];

  const matches = [
    {name:'EcoPack SpA', rubro:'Fabricante de empaques compostables', loc:'Providencia', reason:'Coincide con tu búsqueda activa de "empaques reciclables".', badges:['Verificado','Responde en <1h']},
    {name:'Distribuidora Andes Ltda.', rubro:'Logística y distribución regional', loc:'Quilicura', reason:'Cobertura en tu zona de despacho habitual y volumen compatible.', badges:['Verificado','3 años en Pymio']},
    {name:'Estudio Trazo Digital', rubro:'Diseño y marketing para retail', loc:'Ñuñoa', reason:'Buscan activamente alianzas con retailers medianos como el tuyo.', badges:['Nuevo en la red']},
    {name:'QuimLimpia SpA', rubro:'Insumos de aseo industrial', loc:'Rancagua', reason:'Ofrece condiciones especiales por volumen a pymes de tu comunidad.', badges:['Verificado']},
    {name:'Cafetalera del Sur', rubro:'Café en grano, origen Los Ríos', loc:'Talca', reason:'Publicó un excedente que calza con tu categoría de abarrotes.', badges:['Descuento por pago al contado']},
    {name:'RM Publicidad Exterior', rubro:'Espacios publicitarios locales', loc:'Santiago Centro', reason:'Sugerido por tu actividad reciente en la comunidad Retail.', badges:['Verificado']},
  ];

  const wallItems = [
    {tag:'Oferta', color:'honey', title:'Excedente de 500 cajas de envases PET', company:'Alimentos Sur SpA', meta:'Vence en 2 días · Retiro en Maipú'},
    {tag:'Demanda', color:'info', title:'Buscamos proveedor de fletes refrigerados en la RM', company:'Distribuidora Andes Ltda.', meta:'Publicado hace 4 horas'},
    {tag:'Licitación', color:'teal', title:'Servicio de mantención de flota (10 vehículos)', company:'Logística Express', meta:'Cierre de propuestas: 28 de septiembre'},
    {tag:'Oferta', color:'honey', title:'Arriendo de compactadora de suelo, 2 semanas ociosa', company:'Constructora Maipo', meta:'Vence en 5 días · Zona Sur'},
  ];

  const groupBuys = [
    {title:'Insumos de oficina', community:'Zona Industrial Quilicura', joined:6, target:10, saving:'18%'},
    {title:'Servicio de embalaje por volumen', community:'Gastronomía RM', joined:14, target:20, saving:'12%'},
    {title:'Fletes consolidados a Región de Valparaíso', community:'Exportadores Emergentes', joined:4, target:8, saving:'25%'},
  ];

  const flashDealsData = [
    {seller:'Cafetalera del Sur', loc:'Talca', title:'200 kg de café verde, origen Los Ríos', oldPrice:'$1.450.000', newPrice:'$942.500', discount:'35% OFF', stock:68, save:'$507.500', hours:6, mins:12},
    {seller:'QuimLimpia SpA', loc:'Rancagua', title:'80 cajas de detergente industrial biodegradable', oldPrice:'$680.000', newPrice:'$530.400', discount:'22% OFF', stock:41, save:'$149.600', hours:14, mins:40},
    {seller:'Constructora Maipo', loc:'Zona Sur', title:'Arriendo de compactadora de suelo (2 semanas)', oldPrice:'$260.000', newPrice:'$156.000', discount:'40% OFF', stock:20, save:'$104.000', hours:29, mins:5},
  ];

  const swipeProfiles = [
    {name:'Bodega Norte Distribución', rubro:'Distribución de abarrotes al por mayor', loc:'Recoleta', rating:'4.8', years:'5 años en Pymio', info:'Capacidad de despacho diario a toda la RM. Cliente ideal: retail mediano y minimarkets.'},
    {name:'TazaLinda Café Tostado', rubro:'Tostaduría de café artesanal', loc:'La Reina', rating:'4.9', years:'2 años en Pymio', info:'Busca puntos de venta y cafeterías para distribución directa. Responde en menos de 1 hora.'},
    {name:'RM Publicidad Exterior', rubro:'Espacios publicitarios locales', loc:'Santiago Centro', rating:'4.6', years:'4 años en Pymio', info:'Ofrece paquetes de exhibición para comercio local con descuento por contrato trimestral.'},
    {name:'Envases del Maipo', rubro:'Fabricación de envases plásticos', loc:'San Bernardo', rating:'4.7', years:'6 años en Pymio', info:'Producción a pedido desde 500 unidades. Certificación para uso alimenticio.'},
  ];

  const events = [
    {day:'24', mon:'Sep', title:'Taller: Cómo postular a fondos Corfo 2026', meta:'Online · Gremio Pymes RM'},
    {day:'02', mon:'Oct', title:'Networking Zona Industrial Quilicura', meta:'Presencial · Quilicura'},
    {day:'15', mon:'Oct', title:'Webinar: Exportar por primera vez a Perú', meta:'Online · ProChile'},
  ];

  const benefits = [
    {title:'20% de descuento en fletes con Distribuidora Andes', meta:'Exclusivo para la comunidad Gastronomía RM'},
    {title:'Asesoría tributaria gratuita (1 hora) con asesor validado', meta:'Para miembros con más de 3 meses activos'},
    {title:'Stand gratuito en feria Pymes Exportadoras 2026', meta:'Sorteo entre miembros de Exportadores Emergentes'},
  ];


  // ---------- SUBNAV ----------
  const subnav = get('subnav');
  subnav.innerHTML = tabs.map((t,i) => `
    <button class="subnav-btn ${i===0?'active':''}" aria-pressed="${i===0}" data-tab="${t.id}">${t.icon}<span>${t.label}</span></button>
  `).join('');
  subnav.querySelectorAll('.subnav-btn').forEach(btn => {
    btn.addEventListener('click', event => {
      subnav.querySelectorAll('.subnav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      root.querySelectorAll('.subpanel').forEach(p => p.classList.remove('active'));
      get('sub-' + btn.dataset.tab).classList.add('active');
      revealView(get('sub-' + btn.dataset.tab), {keyboard: event.detail === 0});
      subnav.querySelectorAll('.subnav-btn').forEach(b => b.setAttribute('aria-pressed', String(b === btn))); 
    });
  });
  get('sub-red').classList.add('active');

  // ---------- MI RED ----------
  get('community-grid').innerHTML = communities.map((c, index) => `
    <div class="card community-card">
      <div class="community-heading"><span class="community-monogram" aria-hidden="true">${String(index + 1).padStart(2,'0')}</span><span class="community-arrow" aria-hidden="true">↗</span></div>
      <span class="pill honey c-type">${c.tipo}</span>
      <h3>${c.name}</h3>
      <p>${c.desc}</p>
      <div class="community-meta">
        <span class="members">${c.members} miembros</span>
        <button class="btn-outline">Ver comunidad</button>
      </div>
    </div>`).join('');

  get('qa-list').innerHTML = qaList.map(q => `
    <div class="qa-item">
      <div class="qa-top">
        <span class="pill ${q.status === 'answered' ? 'teal' : 'honey'}">${q.status === 'answered' ? 'Respondida' : 'Abierta'}</span>
        <span class="qa-title">${q.title}</span>
      </div>
      <div class="qa-meta">${q.replies} respuestas ${q.status === 'answered' ? '· con aporte de asesor validado' : ''}</div>
    </div>`).join('');

  // ---------- MATCHMAKING ----------
  function initials(name){ return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase(); }
  function renderMatches(filter){
    const q = (filter || '').trim().toLowerCase();
    const rows = matches.filter(m => !q || m.name.toLowerCase().includes(q) || m.rubro.toLowerCase().includes(q) || m.loc.toLowerCase().includes(q));
    if (!rows.length) { get('match-grid').innerHTML = '<p role="status">No hay empresas que coincidan con tu búsqueda.</p>'; return; }
    get('match-grid').innerHTML = rows.map(m => `
      <div class="card match-card">
        <div class="match-top">
          <div class="match-avatar">${initials(m.name)}</div>
          <div>
            <div class="match-name">${m.name}</div>
            <div class="match-rubro">${m.rubro} · ${m.loc}</div>
          </div>
        </div>
        <div class="match-reason">${m.reason}</div>
        <div class="match-badges">${m.badges.map(b => `<span class="pill teal">${b}</span>`).join('')}</div>
        <button class="btn btn-block">Conectar</button>
      </div>`).join('');
  }
  renderMatches('');
  get('match-search').addEventListener('input', e => renderMatches(e.target.value));

  // ---------- MERCADO B2B ----------
  get('wall-list').innerHTML = wallItems.map(w => `
    <div class="wall-item">
      <div>
        <span class="pill ${w.color}">${w.tag}</span>
        <div class="wall-title">${w.title}</div>
        <div class="wall-meta">${w.company} · ${w.meta}</div>
      </div>
      <button class="btn-outline">Ver</button>
    </div>`).join('');

  get('groupbuy-list').innerHTML = groupBuys.map(g => `
    <div class="wall-item" style="display:block;">
      <div class="wall-title">${g.title}</div>
      <div class="wall-meta">${g.community} · ahorro estimado ${g.saving}</div>
      <div class="progress-wrap"><div class="progress-fill" style="width:${(g.joined/g.target*100).toFixed(0)}%"></div></div>
      <div class="wall-meta" style="margin-top:6px;">${g.joined} de ${g.target} pymes unidas</div>
    </div>`).join('');

  // ---------- PYMIO EXPRESS: FLASH DEALS ----------
  const flashList = get('flash-list');
  flashList.innerHTML = flashDealsData.map((d,i) => `
    <div class="flash-card">
      <div class="flash-top">
        <span class="flash-seller">${d.seller} · ${d.loc}</span>
        <span class="flash-discount">${d.discount}</span>
      </div>
      <div class="flash-title">${d.title}</div>
      <div class="flash-price"><span class="old">${d.oldPrice}</span><span class="new">${d.newPrice}</span></div>
      <div class="flash-bar-wrap"><div class="flash-bar-fill" style="width:${d.stock}%"></div></div>
      <div class="flash-bottom">
        <span class="flash-countdown num" id="countdown-${i}">--:--:--</span>
        <button class="btn">Reservar stock</button>
      </div>
      <div class="flash-save">Ahorras ${d.save} · ${d.stock}% del stock ya reservado</div>
    </div>`).join('');

  const deadlines = flashDealsData.map(d => Date.now() + (d.hours*3600 + d.mins*60) * 1000);
  function tickCountdowns(){
    deadlines.forEach((dl, i) => {
      let diff = Math.max(0, dl - Date.now());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const el = get('countdown-' + i);
      if(el) el.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    });
  }
  tickCountdowns();
  setInterval(tickCountdowns, 1000);

  // ---------- PYMIO EXPRESS: SWIPE ----------
  const swipeStack = get('swipe-stack');
  let swipeIndex = 0;
  let swiping = false;
  function renderSwipeStack(){
    if(swipeIndex >= swipeProfiles.length){
      swipeStack.innerHTML = '<div class="swipe-empty">Ya revisaste todos los perfiles sugeridos por hoy.<br>Vuelve mañana por más matches.</div>';
      return;
    }
    const visible = swipeProfiles.slice(swipeIndex, swipeIndex + 2);
    swipeStack.innerHTML = visible.map((p, idx) => {
      const depth = idx;
      const isTop = idx === 0;
      return `
      <div class="swipe-card" id="swipe-card-${swipeIndex + idx}" style="z-index:${10 - idx}; transform:scale(${1 - depth*0.04}) translateY(${depth*10}px); opacity:${isTop ? 1 : 0.7};">
        <div class="sc-photo">${initials(p.name)}</div>
        <div class="sc-body">
          <h3>${p.name}</h3>
          <div class="sc-rubro">${p.rubro} · ${p.loc}</div>
          <div class="sc-badges">
            <span class="pill honey">★ ${p.rating}</span>
            <span class="pill teal">${p.years}</span>
          </div>
          <div class="sc-info">${p.info}</div>
        </div>
      </div>`;
    }).reverse().join('');
  }
  renderSwipeStack();

  function swipeAction(direction){
    const card = get('swipe-card-' + swipeIndex);
    if(!card || swiping) return;
    swiping = true;
    card.classList.add('leaving-' + direction);
    swipeIndex++;
    setTimeout(() => { renderSwipeStack(); swiping = false; }, window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.input === 'keyboard' ? 0 : 360);
  }
  get('btn-skip').addEventListener('click', () => swipeAction('left'));
  get('btn-connect').addEventListener('click', () => swipeAction('right'));
  get('btn-quote').addEventListener('click', () => swipeAction('up'));

  // ---------- EVENTOS & BENEFICIOS ----------
  get('event-list').innerHTML = events.map(e => `
    <div class="event-item">
      <div class="event-date"><div class="day">${e.day}</div><div class="mon">${e.mon}</div></div>
      <div>
        <div class="event-title">${e.title}</div>
        <div class="event-meta">${e.meta}</div>
      </div>
      <button class="btn-outline" style="margin-left:auto;">Inscribirme</button>
    </div>`).join('');

  get('benefit-list').innerHTML = benefits.map(b => `
    <div class="benefit-item">
      <div>
        <div class="benefit-title">${b.title}</div>
        <div class="benefit-meta">${b.meta}</div>
      </div>
      <button class="btn-outline">Ver</button>
    </div>`).join('');

  // Prototype actions stay local and never claim that a request was sent.
  root.addEventListener('click', event => {
    const button = event.target.closest('.btn, .btn-outline, .filter-chip');
    if (!button) return;
    const feedback = root.querySelector('.ecosistema-feedback');
    feedback.textContent = button.textContent.trim() + ': disponible solo como demostración; no se ha enviado ninguna solicitud.';
    feedback.hidden = false;
    feedback.scrollIntoView({block:'nearest'});
  });

}
