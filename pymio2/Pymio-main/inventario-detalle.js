import { offlineFetch as fetch } from './offline.js';
import { fechaMovimiento } from './movimientos-vista.js';

export function prepararDetalleInventario(fila, producto, { companyId, apiUrl, onToggleStatus, onEditProduct }) {
  fila.classList.add('inventario-resumen');
  const boton = document.createElement('button');
  boton.type = 'button'; boton.className = 'movimiento-toggle';
  boton.textContent = `▸ ${producto.name}`;
  boton.setAttribute('aria-expanded','false');
  boton.setAttribute('aria-controls',`inventario-detalle-${producto.id}`);
  fila.cells[0].replaceChildren(boton);
  const detalle = fila.parentElement.insertRow();
  detalle.id = `inventario-detalle-${producto.id}`;
  detalle.hidden = true; detalle.className = 'inventario-detalle';
  const celda = detalle.insertCell(); celda.colSpan = 8;
  const acciones = document.createElement('div'); acciones.className = 'inventario-detalle-acciones';
  const estadoMensaje = document.createElement('p'); estadoMensaje.className = 'inventario-estado-mensaje'; estadoMensaje.setAttribute('role','status'); estadoMensaje.hidden = true;
  const editarBoton = document.createElement('button'); editarBoton.type = 'button'; editarBoton.className = 'detalle-editar';
  editarBoton.setAttribute('aria-label',`Modificar producto ${producto.name}`); editarBoton.title = 'Editar';
  editarBoton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z" stroke-linejoin="round"/><path d="m13.5 6.5 4 4"/></svg>';
  editarBoton.onclick = evento => { evento.stopPropagation(); onEditProduct?.(producto); };
  const estadoActual = producto.Estado === 'Inhabilitado' ? 'Inhabilitado' : 'Habilitado';
  const estadoDestino = estadoActual === 'Habilitado' ? 'Inhabilitado' : 'Habilitado';
  const estadoBoton = document.createElement('button'); estadoBoton.type = 'button'; estadoBoton.className = 'producto-estado-toggle';
  estadoBoton.dataset.targetStatus = estadoDestino;
  estadoBoton.textContent = estadoDestino === 'Inhabilitado' ? 'Inhabilitar producto' : 'Habilitar producto';
  estadoBoton.onclick = async evento => {
    evento.stopPropagation();
    if (typeof onToggleStatus !== 'function') return;
    estadoBoton.disabled = true; estadoMensaje.hidden = true;
    try { const cambiado = await onToggleStatus(producto, estadoDestino); if (!cambiado && estadoBoton.isConnected) estadoBoton.disabled = false; }
    catch (error) { estadoMensaje.textContent = error.message || 'No se pudo cambiar el estado del producto.'; estadoMensaje.hidden = false; estadoBoton.disabled = false; }
  };
  const botones = document.createElement('div'); botones.className = 'inventario-detalle-botones'; botones.append(editarBoton,estadoBoton);
  acciones.append(estadoMensaje,botones);
  const layout = document.createElement('div'); layout.className = 'inventario-detalle-grid';
  const stockColumn = document.createElement('div'); stockColumn.className = 'inventario-stock-column';
  const stock = document.createElement('section'); stock.className = 'inventario-detalle-card';
  const stockTitle = document.createElement('h3'); stockTitle.textContent = 'Información de stock';
  const limites = document.createElement('dl'); limites.className = 'inventario-umbrales';
  for (const [nombre, valor] of [['Stock se considera bajo si hay menos de:',producto.low_qty]]) {
    const item = document.createElement('div');
    const label = document.createElement('dt'); label.textContent = nombre;
    const number = document.createElement('dd'); number.textContent = valor == null ? '—' : Number(valor).toLocaleString('es-CL');
    const unidad = document.createElement('span'); unidad.className = 'inventario-stock-unidad'; unidad.textContent = ' unidades';
    number.appendChild(unidad);
    item.append(label,number); limites.appendChild(item);
  }
  stock.append(stockTitle,limites);
  const stockState = document.createElement('section'); stockState.className = 'inventario-detalle-card inventario-estado-stock';
  const stockStateTitle = document.createElement('h3'); stockStateTitle.textContent = 'Estado de Stock';
  const currentStock = Number(producto.qty);
  const lowStock = Number(producto.low_qty);
  const storedState = producto['Estado Stock'];
  const state = ['Stock Normal','Stock Bajo','Sin Stock'].includes(storedState) ? storedState : (currentStock === 0 ? 'Sin Stock' : currentStock < lowStock ? 'Stock Bajo' : 'Stock Normal');
  const stockStateValue = document.createElement('p'); stockStateValue.className = 'inventario-estado-valor';
  stockStateValue.dataset.state = state === 'Sin Stock' ? 'out' : state === 'Stock Bajo' ? 'low' : 'normal';
  const stockStateDot = document.createElement('span'); stockStateDot.setAttribute('aria-hidden','true');
  stockStateValue.append(stockStateDot,state);
  stockState.append(stockStateTitle,stockStateValue);
  stockColumn.append(stock,stockState);
  const movimientos = document.createElement('section'); movimientos.className = 'inventario-detalle-card';
  const titulo = document.createElement('h3'); titulo.textContent = 'Últimos 5 movimientos';
  const historial = document.createElement('div'); historial.className = 'table-scroll inventario-historial';
  historial.setAttribute('aria-live','polite');
  movimientos.append(titulo,historial);
  layout.append(stockColumn,movimientos); celda.append(acciones,layout);
  let cargado = false, cargando = false;
  async function cargar() {
    if (cargado || cargando) return;
    cargando = true; historial.textContent = 'Cargando movimientos…';
    try {
      const url = new URL(`/api/products/${encodeURIComponent(producto.id)}/movements`,apiUrl);
      url.searchParams.set('company_id',companyId);
      const respuesta = await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const datos = await respuesta.json();
      if (!respuesta.ok || !Array.isArray(datos)) throw new Error('No se pudieron cargar los movimientos.');
      if (!detalle.isConnected) return;
      historial.replaceChildren();
      if (!datos.length) historial.textContent = 'Este producto aún no tiene movimientos.';
      else {
        const tabla = document.createElement('table');
        const encabezados = tabla.createTHead().insertRow();
        for (const nombre of ['Fecha y Hora','Tipo de operación','Unidades','Código']) {
          const th = document.createElement('th'); th.scope = 'col'; th.textContent = nombre; encabezados.appendChild(th);
        }
        const cuerpo = tabla.createTBody();
        for (const movimiento of datos) {
          const row = cuerpo.insertRow();
          for (const valor of [fechaMovimiento(movimiento.occurred_at),movimiento.operation,movimiento.units]) row.insertCell().textContent = valor;
          const enlace = document.createElement('a');
          enlace.href = `#movimiento-${movimiento.code}`; enlace.textContent = movimiento.code;
          enlace.onclick = evento => {
            evento.preventDefault();
            document.dispatchEvent(new CustomEvent('abrir-movimiento',{detail:{code:movimiento.code}}));
          };
          row.insertCell().appendChild(enlace);
        }
        historial.appendChild(tabla);
      }
      cargado = true;
    } catch (error) {
      historial.textContent = 'No se pudieron cargar los movimientos. ';
      const reintentar = document.createElement('button'); reintentar.type = 'button';
      reintentar.textContent = 'Reintentar'; reintentar.onclick = cargar; historial.appendChild(reintentar);
    } finally { cargando = false; }
  }
  fila.onclick = () => {
    detalle.hidden = !detalle.hidden;
    boton.setAttribute('aria-expanded',String(!detalle.hidden));
    boton.textContent = `${detalle.hidden ? '▸' : '▾'} ${producto.name}`;
    if (!detalle.hidden) cargar();
  };
}
