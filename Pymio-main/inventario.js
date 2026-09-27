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
  if (!panel || !tbody || !search || !categoria) throw new Error('Primero debes insertar inventario.html.');
  const encabezados = panel.querySelectorAll('[data-sort]');
  const compararTexto = new Intl.Collator('es', { sensitivity: 'base' });
  let orden = null;
  let cargando = false;
  const indicadores = panel.querySelectorAll('.chip-row .kpi-value');
  const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const numero = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });
  const normalizar = texto => String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let inventory = [];

  function celda(fila, texto, clase = '') {
    const td = fila.insertCell();
    td.textContent = texto;
    td.className = clase;
    return td;
  }
  function mensaje(texto) {
    tbody.replaceChildren();
    celda(tbody.insertRow(), texto).colSpan = 8;
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
  function render() {
    if (cargando) return;
    const filtro = normalizar(search.value.trim());
    const visibles = inventory.filter(p => normalizar(`${p.name} ${p.sku}`).includes(filtro)
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

      prepararDetalleInventario(fila, p, { companyId, apiUrl });
    }
    if (!visibles.length) mensaje('No se encontraron productos.');
  }

  // Se reutiliza el formato existente; el botón también permite consultar cambios sin recargar.


  let botonRI = panel.querySelector('[data-refresh-inventory]');
  if (!botonRI) {
    botonRI = document.createElement('button');
    botonRI.type = 'button';
    botonRI.className = 'btn-secondary';
    botonRI.dataset.refreshInventory = '';
    botonRI.textContent = 'Actualizar inventario';
    (panel.querySelector('.toolbar') ?? panel).appendChild(botonRI);
  }

   
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
    ['agregar', 'Crear Producto'],
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
    botonRI.disabled = true;
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
        numero.format(inventory.filter(p => ['Stock Bajo', 'Stock Crítico'].includes(p['Estado Stock'])).length),
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
      mensaje('No se pudo cargar el inventario. Revisa la configuración de Supabase y pulsa Actualizar inventario.');
    } finally {
      cargando = false;
      botonRI.disabled = false;
    }
  }
  botonAMI.textContent = '+ Productos';
  prepararCategorias({panel,companyId,apiUrl,alGuardar:actualizar});
  prepararFormularioProducto({ panel, companyId, apiUrl, alGuardar: async () => {
    search.value = '';
    await actualizar();
  } });
  search.oninput = render;
  categoria.onchange = render;
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
  botonRI.onclick = actualizar;
  if (panel.actualizarPorMovimiento) document.removeEventListener('inventario-actualizado', panel.actualizarPorMovimiento);
  panel.actualizarPorMovimiento = () => actualizar();
  document.addEventListener('inventario-actualizado', panel.actualizarPorMovimiento);
  await actualizar();

}
