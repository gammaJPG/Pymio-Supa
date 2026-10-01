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
            <div class="match-name">${m.name}${m.badges.includes('Verificado') ? '<span class="pymium-verified" role="img" tabindex="0" aria-label="Perfil Verificado Pymium"><span class="bee-outline" aria-hidden="true"></span><span class="pymium-verified-tooltip" aria-hidden="true">Perfil Verificado Pymium</span></span>' : ''}</div>
            <div class="match-rubro">${m.rubro} · ${m.loc}</div>
          </div>
        </div>
        <div class="match-reason">${m.reason}</div>
        <div class="match-badges">${m.badges.filter(b => b !== 'Verificado').map(b => `<span class="pill teal">${b}</span>`).join('')}</div>
        <button class="btn btn-block">Conectar</button>
      </div>`).join('');
  }
  renderMatches('');
  get('match-search').addEventListener('input', e => renderMatches(e.target.value));

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
