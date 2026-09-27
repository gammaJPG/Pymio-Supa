const moneda = valor => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(valor));
export function fechaMovimiento(value) {
  const date = new Date(value);
  const fecha = date.toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' });
  return `${fecha} ${String(date.getHours() % 12 || 12).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')} ${date.getHours() >= 12 ? 'pm' : 'am'}`;
}

export function renderMovimientos(table, movements) {
  table.replaceChildren();
  for (const [index, movement] of movements.entries()) {
    const row = table.insertRow();
    row.className = 'movimiento-resumen';
    row.dataset.movementCode = movement.code;
    const dateCell = row.insertCell();
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'movimiento-toggle';
    toggle.textContent = `▸ ${fechaMovimiento(movement.occurred_at)}`;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', `movimiento-detalle-${index}`);
    dateCell.appendChild(toggle);
    for (const value of [movement.operation, movement.operation_detail ?? 'Otros', moneda(movement.total)]) row.insertCell().textContent = value;
    const detail = table.insertRow();
    detail.id = `movimiento-detalle-${index}`;
    detail.hidden = true;
    detail.className = 'movimiento-detalle';
    const cell = detail.insertCell(); cell.colSpan = 4;
    const wrap = document.createElement('div'); wrap.className = 'table-scroll';
    const nested = document.createElement('table');
    const headers = nested.createTHead().insertRow();
    for (const title of ['SKU','Nombre Producto','Precio unitario','Subtotal','Descuento','Total producto','Stock Inicial','Unidades','Stock Final']) {
      const th = document.createElement('th'); th.scope = 'col'; th.textContent = title; headers.appendChild(th);
    }
    const body = nested.createTBody();
    for (const product of movement.products) {
      const productRow = body.insertRow();
      for (const value of [product.sku, product.name, moneda(product.unit_price), moneda(product.total), Number(product.discount_amount ?? 0) === 0 ? '-' : product.discount_type === 'percentage' ? product.discount_value + '% (' + moneda(product.discount_amount) + ')' : moneda(product.discount_amount ?? 0), moneda(product.net_total ?? product.total), product.initial_qty, product.units, product.final_qty]) productRow.insertCell().textContent = value;
    }
    wrap.appendChild(nested); cell.appendChild(wrap);
    const summary = document.createElement('div'); summary.className = 'movimiento-detalle-resumen';
    for (const [title, value] of [['Descuento Total', Number(movement.discount_amount ?? 0) === 0 ? '-' : moneda(movement.discount_amount)], ['Estado', movement.Estado ?? 'Pagado'], ['Código del movimiento', movement.code]]) {
      const item = document.createElement('p'), label = document.createElement('strong');
      label.textContent = title + ': '; item.append(label, String(value)); summary.appendChild(item);
    }
    cell.appendChild(summary);
    // La fila completa responde al clic; el botón permite abrirla también con teclado.
    row.onclick = () => {
      detail.hidden = !detail.hidden;
      toggle.setAttribute('aria-expanded', String(!detail.hidden));
      toggle.textContent = `${detail.hidden ? '▸' : '▾'} ${fechaMovimiento(movement.occurred_at)}`;
    };
  }
  if (!movements.length) {
    const cell = table.insertRow().insertCell(); cell.colSpan = 4;
    cell.textContent = 'Aún no hay movimientos registrados.';
  }
}

export function dentroDelRangoHorario(value, from = '', to = '') {
  const date = new Date(value);
  const hour = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  if (from && to && from > to) return hour >= from || hour <= to;
  return (!from || hour >= from) && (!to || hour <= to);
}
