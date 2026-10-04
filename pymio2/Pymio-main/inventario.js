import { offlineFetch as fetch, apiBase } from './offline.js';
import { prepararCategorias } from './categorias.js';
import { prepararFormularioProducto } from './producto-form.js';
import { prepararDetalleInventario } from './inventario-detalle.js';

// Los productos se consultan en Supabase mediante la API del servidor.
export async function iniciarInventario({
  companyId,
  apiUrl = apiBase
} = {}) {
  const panel = document.getElementById('tab-inventario');
  const tbody = panel?.querySelector('#inv-table');
  const search = panel?.querySelector('#inv-search');
  const categoria = panel?.querySelector('#inv-category');
  const viewSelect = panel?.querySelector('#inv-view');
  const detailedView = panel?.querySelector('[data-inventory-detailed]');
  const simpleView = panel?.querySelector('[data-inventory-simple]');
  const statusDialog = panel?.querySelector('#producto-estado-confirmacion');
  const statusQuestion = statusDialog?.querySelector('[data-product-status-question]');
  if (!panel || !tbody || !search || !categoria || !viewSelect || !detailedView || !simpleView || !statusDialog || !statusQuestion) throw new Error('Primero debes insertar inventario.html.');
  const encabezados = panel.querySelectorAll('[data-sort]');
  const compararTexto = new Intl.Collator('es', { sensitivity: 'base' });
  let orden = null;
  let cargando = false;
  const indicadores = panel.querySelectorAll('.chip-row .kpi-value');
  const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const numero = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });
  const normalizar = texto => String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let inventory = [];
  let dashboardProductIds = null;
  let productFormController = null;
  const viewKey = 'pymio-inventory-view';
  let currentView;
  try { currentView = sessionStorage.getItem(viewKey); } catch {}
  if (!['detailed','simple'].includes(currentView)) currentView = matchMedia('(max-width: 1024px)').matches ? 'simple' : 'detailed';

  function aplicarVista() {
    viewSelect.value = currentView;
    detailedView.hidden = currentView !== 'detailed';
    simpleView.hidden = currentView !== 'simple';
  }
  viewSelect.onchange = () => {
    currentView = viewSelect.value;
    try { sessionStorage.setItem(viewKey,currentView); } catch {}
    aplicarVista();
  };
  aplicarVista();

  function celda(fila, texto, clase = '') {
    const td = fila.insertCell();
    td.textContent = texto;
    td.className = clase;
    return td;
  }
  function mensaje(texto) {
    tbody.replaceChildren();
    celda(tbody.insertRow(), texto).colSpan = 8;
    simpleView.replaceChildren();
    const message = document.createElement('p'); message.className = 'inventario-simple-mensaje'; message.textContent = texto;
    simpleView.appendChild(message);
  }
  function imagenProducto(producto) {
    const match = String(producto.image_path ?? '').match(new RegExp(`^${companyId}/([0-9a-f-]{36})\\.webp$`));
    if (!match) return null;
    const url = new URL(`/api/product-images/${match[1]}`,apiUrl); url.searchParams.set('company_id',companyId);
    return url.href;
  }
  function renderSimple(productos) {
    simpleView.replaceChildren();
    for (const producto of productos) {
      const card=document.createElement('article'); card.className='inventario-producto-card';
      card.setAttribute('aria-label',`${producto.name}. Stock: ${numero.format(producto.qty)}. Precio: ${clp.format(producto.price)}.`);
      const stock=document.createElement('p'); stock.className='inventario-card-stock';
      if (Number(producto.qty) === 0 || Number(producto.qty) < Number(producto.low_qty)) stock.classList.add('critico');
      stock.append('Stock: ',Object.assign(document.createElement('strong'),{textContent:numero.format(producto.qty)}));
      const name=document.createElement('h3'); name.className='inventario-card-name'; name.textContent=producto.name;
      name.title=producto.name;
      const header=document.createElement('div'); header.className='inventario-card-header'; header.append(stock,name);
      const media=document.createElement('div'); media.className='inventario-card-media';
      const placeholder=()=>{media.replaceChildren();const empty=document.createElement('div');empty.className='inventario-card-placeholder';empty.setAttribute('aria-label',`${producto.name}, sin imagen`);empty.innerHTML='<span aria-hidden="true">◇</span><small>Sin imagen</small>';media.appendChild(empty);};
      const source=imagenProducto(producto);
      if(source){const image=document.createElement('img');image.src=source;image.alt=producto.name;image.loading='lazy';image.decoding='async';image.onerror=placeholder;media.appendChild(image);}else placeholder();
      const price=document.createElement('p'); price.className='inventario-card-price'; price.append('Precio: ',Object.assign(document.createElement('strong'),{textContent:clp.format(producto.price)}));
      card.append(header,media,price); simpleView.appendChild(card);
    }
    if (!productos.length) {
      const message=document.createElement('p');message.className='inventario-simple-mensaje';message.textContent='No disponible';simpleView.appendChild(message);
    }
  }
  function actualizarCategorias() {
    const seleccionada = categoria.value;
    const categorias = [...new Set(inventory.map(p => String(p.category ?? '')))];
    categorias.sort(compararTexto.compare);
    categoria.replaceChildren(new Option('Todas las categorías', ''));
    for (const nombre of categorias) {
      categoria.add(new Option(nombre || 'Sin categoría', JSON.stringify(nombre)));
    }
    categoria.value = [...categoria.options].some(opcion => opcion.value === seleccionada) ? seleccionada : '';
  }
  function confirmarCambioEstado(nombre, estadoDestino) {
    statusQuestion.textContent = `¿Seguro que quieres cambiar el Estado de "${nombre}" a "${estadoDestino}"?`;
    statusDialog.returnValue = 'cancel';
    return new Promise(resolve => {
      statusDialog.addEventListener('close',() => resolve(statusDialog.returnValue === 'confirm'),{once:true});
      statusDialog.showModal();
    });
  }

  async function cambiarEstadoProducto(producto, estadoDestino) {
    if (!await confirmarCambioEstado(producto.name, estadoDestino)) return false;
    const url = new URL(`/api/products/${encodeURIComponent(producto.id)}/status`,apiUrl);
    url.searchParams.set('company_id',companyId);
    const respuesta = await fetch(url,{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({Estado:estadoDestino}),signal:AbortSignal.timeout(15000)
    });
    const resultado = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(resultado.error || 'No se pudo cambiar el estado del producto.');
    producto.Estado = estadoDestino;
    await actualizar();
    return true;
  }
  function render() {
    if (cargando) return;
    const filtro = normalizar(search.value.trim());
    const visibles = inventory.filter(p => (!dashboardProductIds || dashboardProductIds.has(String(p.id)))
      && normalizar(`${p.name} ${p.sku}`).includes(filtro)
      && (!categoria.value || String(p.category ?? '') === JSON.parse(categoria.value)));
    if (orden) {
      visibles.sort((a, b) => {
        const valor = producto => {
          const dato = producto[orden.campo];
          if (dato == null || dato === '') return null;
          if (orden.tipo === 'texto') return String(dato);
          const numero = orden.tipo === 'fecha' ? new Date(dato).getTime() : Number(dato);
          return Number.isFinite(numero) ? numero : null;
        };
        const primero = valor(a), segundo = valor(b);
        // Los valores ausentes siempre quedan al final.
        if (primero === null) return segundo === null ? 0 : 1;
        if (segundo === null) return -1;
        return (orden.tipo === 'texto' ? compararTexto.compare(primero, segundo) : primero - segundo) * orden.direccion;
      });
    }
    tbody.replaceChildren();
    for (const p of visibles) {
      const fila = tbody.insertRow();

      celda(fila, p.name);
      celda(fila, p.sku);
      celda(fila, p.category);
      celda(fila, numero.format(p.qty), 'num');
      celda(fila, clp.format(p.price), 'num');
      celda(fila, clp.format(p.cost), 'num');
      celda(fila, new Date(p.updated_at).toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }));
      celda(fila, new Date(p.created_at).toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }));

      prepararDetalleInventario(fila, p, { companyId, apiUrl, onToggleStatus: cambiarEstadoProducto, onEditProduct: producto => productFormController?.abrirModificar(producto.id) });
    }
    renderSimple(visibles);
    if (!visibles.length) {
      tbody.replaceChildren();
      celda(tbody.insertRow(), 'No disponible').colSpan = 8;
    }
  }

  // Se reutiliza el formato existente; el botón también permite consultar cambios sin recargar.


   
  let botonAMI = panel.querySelector('[data-add-modify-inventory]');

  if (!botonAMI) {
  // Contenedor del botón y su listado.
    const contenedor = document.createElement('div');
    contenedor.className = 'inventario-menu';

    botonAMI = document.createElement('button');
    botonAMI.type = 'button';
    botonAMI.className = 'btn-secondary';
    botonAMI.dataset.addModifyInventory = '';
    botonAMI.textContent = '+ Productos';
    botonAMI.setAttribute('aria-label', 'Gestionar inventario');
    botonAMI.setAttribute('aria-expanded', 'false');
    botonAMI.setAttribute('aria-controls', 'opciones-inventario');

    const menu = document.createElement('div');
    menu.id = 'opciones-inventario';
    menu.className = 'inventario-opciones';
    menu.hidden = true;

    const opciones = [
    ['agregar', 'Crear producto'],
    ['modificar', 'Modificar producto'],
    ['borrar', 'Eliminar producto']
    ];

    for (const [accion, texto] of opciones) {
      const opcion = document.createElement('button');
      opcion.type = 'button';
      opcion.dataset.accion = accion;
      opcion.textContent = texto;
      menu.appendChild(opcion);
    }

    contenedor.append(botonAMI, menu);
    (panel.querySelector('.toolbar') ?? panel).appendChild(contenedor);

    function cerrarMenu() {
     menu.hidden = true;
     botonAMI.setAttribute('aria-expanded', 'false');
    }

    botonAMI.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
       botonAMI.setAttribute('aria-expanded', String(!menu.hidden));
    });

    document.addEventListener('click', (evento) => {
       if (!contenedor.contains(evento.target)) {
        cerrarMenu();
       }
    });

    contenedor.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') {
        cerrarMenu();
       botonAMI.focus();
      }
    });
  }
  


  async function actualizar() {
    cargando = true;
    search.disabled = true;
    categoria.disabled = true;
    encabezados.forEach(boton => { boton.disabled = true; });
    indicadores.forEach(el => { el.textContent = '—'; });
    mensaje('Cargando inventario…');
    try {
      const url = new URL('/api/products', apiUrl);
      url.searchParams.set('company_id', companyId);
      const respuesta = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!respuesta.ok) throw new Error(`La API respondió ${respuesta.status}.`);
      const datos = await respuesta.json();
      if (!Array.isArray(datos)) throw new Error('La API no devolvió una lista de productos.');
      inventory = datos;
      actualizarCategorias();
      const valores = [
        numero.format(inventory.length),
        clp.format(inventory.reduce((total, p) => total + p.qty * p.cost, 0)),
        numero.format(inventory.filter(p => p['Estado Stock'] === 'Stock Bajo').length),
        numero.format(inventory.filter(p => p.qty === 0).length)
      ];
      indicadores.forEach((el, i) => { if (i < valores.length) el.textContent = valores[i]; });
      cargando = false;
      render();
      search.disabled = false;
      categoria.disabled = false;
      encabezados.forEach(boton => { boton.disabled = false; });
    } catch (error) {
      inventory = [];
      console.error('Inventario:', error);
      mensaje('No se pudo cargar el inventario. Revisa la conexión y pulsa Actualizar movimiento.');
    } finally {
      cargando = false;
    }
  }
  botonAMI.textContent = '+ Productos';
  const categorias=prepararCategorias({panel,companyId,apiUrl,alGuardar:actualizar});
  productFormController = prepararFormularioProducto({ panel, companyId, apiUrl, crearCategoria:categorias.crear, alGuardar: async () => {
    search.value = '';
    await actualizar();
    return true;
  } });
  search.oninput = () => {
    dashboardProductIds = null;
    // Una búsqueda escrita por el usuario tiene prioridad sobre filtros previos.
    if (search.value.trim()) categoria.value = '';
    render();
  };
  categoria.onchange = () => { dashboardProductIds = null; render(); };
  document.addEventListener('abrir-inventario-filtrado', event => {
    dashboardProductIds = new Set((event.detail?.ids ?? []).map(String));
    search.value = ''; categoria.value = '';
    document.querySelector('[data-tab="inventario"]').click();
    render();
  });
  document.addEventListener('abrir-inventario-producto', event => {
    const id=String(event.detail?.id||'');
    dashboardProductIds=id?new Set([id]):null;
    search.value='';categoria.value='';
    document.querySelector('[data-tab="inventario"]').click();
    render();
    if(event.detail?.edit&&id)requestAnimationFrame(()=>productFormController?.abrirModificar(id));
  });
  encabezados.forEach(boton => {
    boton.closest('th').setAttribute('aria-sort', 'none');
    boton.querySelector('span').textContent = '↕';
    boton.onclick = () => {
      orden = {
        campo: boton.dataset.sort,
        tipo: boton.dataset.type,
        direccion: orden?.campo === boton.dataset.sort ? -orden.direccion : 1
      };
      encabezados.forEach(encabezado => {
        const activo = encabezado === boton;
        encabezado.closest('th').setAttribute('aria-sort', activo ? (orden.direccion === 1 ? 'ascending' : 'descending') : 'none');
        encabezado.querySelector('span').textContent = activo ? (orden.direccion === 1 ? '↑' : '↓') : '↕';
      });
      render();
    };
  });
  if (panel.actualizarPorMovimiento) document.removeEventListener('inventario-actualizado', panel.actualizarPorMovimiento);
  panel.actualizarPorMovimiento = () => actualizar();
  document.addEventListener('inventario-actualizado', panel.actualizarPorMovimiento);
  await actualizar();

}
