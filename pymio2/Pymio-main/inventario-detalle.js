import { offlineFetch as fetch } from './offline.js';
import { fechaMovimiento } from './movimientos-vista.js';

export function prepararDetalleInventario(fila, producto, { companyId, apiUrl }) {
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
  const layout = document.createElement('div'); layout.className = 'inventario-detalle-grid';
  const stock = document.createElement('section'); stock.className = 'inventario-detalle-card';
  const stockTitle = document.createElement('h3'); stockTitle.textContent = 'Información de stock';
  const limites = document.createElement('dl'); limites.className = 'inventario-umbrales';
  for (const [nombre, valor] of [['Stock se considera crítico si hay menos de:',producto.crit_qty]]) {
    const item = document.createElement('div');
    const label = document.createElement('dt'); label.textContent = nombre;
    const number = document.createElement('dd'); number.textContent = valor == null ? '—' : Number(valor).toLocaleString('es-CL');
    const unidad = document.createElement('span'); unidad.className = 'inventario-stock-unidad'; unidad.textContent = ' unidades';
    number.appendChild(unidad);
    item.append(label,number); limites.appendChild(item);
  }
  stock.append(stockTitle,limites);
  const movimientos = document.createElement('section'); movimientos.className = 'inventario-detalle-card';
  const titulo = document.createElement('h3'); titulo.textContent = 'Últimos 5 movimientos';
  const historial = document.createElement('div'); historial.className = 'table-scroll inventario-historial';
  historial.setAttribute('aria-live','polite');
  movimientos.append(titulo,historial);
  layout.append(stock,movimientos); celda.appendChild(layout);
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
