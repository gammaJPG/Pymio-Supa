const moneda = valor => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(valor));
export function fechaMovimiento(value) {
  const date = new Date(value);
  const fecha = date.toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' });
  return `${fecha} ${String(date.getHours() % 12 || 12).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')} ${date.getHours() >= 12 ? 'pm' : 'am'}`;
}

export function datosMovimientoPagado(movement, actionId) {
  const productDiscount = movement.discount_scope === 'product';
  const discount = productDiscount
    ? {scope:'product'}
    : movement.discount_type
      ? {scope:'global',type:movement.discount_type,value:Number(movement.discount_value)}
      : null;
  return {
    action_id: actionId,
    revision: Number(movement.revision),
    operation: movement.operation,
    operation_detail: movement.operation_detail,
    channel: movement.channel,
    payment_method: movement.payment_method,
    Estado: 'Pagado',
    ...(movement.customer_id == null ? {} : {customer_id:String(movement.customer_id)}),
    occurred_at: new Date(movement.occurred_at).toISOString(),
    discount,
    items: movement.products.map(product => ({
      product_id: String(product.product_id),
      units: Math.abs(Number(product.units)),
      discount: productDiscount ? {type:product.discount_type,value:Number(product.discount_value)} : null
    }))
  };
}

export function ordenarMovimientos(movements, order, collator = new Intl.Collator('es',{sensitivity:'base'})) {
  if (!order) return [...movements];
  return [...movements].sort((a,b) => {
    const getValue = movement => {
      const raw=movement[order.field];
      if(raw==null || raw==='')return null;
      if(order.type==='texto')return String(raw);
      const value=order.type==='fecha'?Date.parse(raw):Number(raw);
      return Number.isFinite(value)?value:null;
    };
    const first=getValue(a),second=getValue(b);
    if(first===null)return second===null?0:1;
    if(second===null)return -1;
    return (order.type==='texto'?collator.compare(first,second):first-second)*order.direction;
  });
}

export function renderMovimientos(table, movements, {onMarkPaid, onEdit} = {}) {
  table.replaceChildren();
  for (const [index, movement] of movements.entries()) {
    const row = table.insertRow();
    row.className = 'movimiento-resumen';
    row.dataset.movementCode = movement.code;
    const movementKind = String(movement.operation_detail ?? movement.operation ?? 'otros')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    row.dataset.movementKind = movementKind.includes('venta') ? 'venta' : movementKind.includes('compra') ? 'compra' : 'otro';
    const dateCell = row.insertCell();
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'movimiento-toggle';
    const toggleIndicator = document.createElement('span');
    toggleIndicator.className = 'movimiento-toggle-indicator';
    toggleIndicator.setAttribute('aria-hidden', 'true');
    toggleIndicator.textContent = '▸';
    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = fechaMovimiento(movement.occurred_at);
    toggle.append(toggleIndicator, toggleLabel);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', `movimiento-detalle-${index}`);
    dateCell.appendChild(toggle);
    const summaryValues = [
      ['Operación', movement.operation_detail ?? 'Otros'],
      ['Canal', movement.channel ?? '-'],
      ['Pago', movement.payment_method ?? '-'],
      ['Total', moneda(movement.total)]
    ];
    for (const [label, value] of summaryValues) {
      const summaryCell = row.insertCell();
      summaryCell.dataset.label = label;
      summaryCell.textContent = value;
    }
    const detail = table.insertRow();
    detail.id = `movimiento-detalle-${index}`;
    detail.hidden = true;
    detail.className = 'movimiento-detalle';
    const cell = detail.insertCell(); cell.colSpan = 5;
    if (onEdit || (movement.Estado === 'Pendiente de Pago' && onMarkPaid)) {
      const actions = document.createElement('div'); actions.className = 'movimiento-detalle-acciones';
      if (onEdit) {
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'detalle-editar';
        edit.setAttribute('aria-label',`Modificar movimiento ${movement.code}`); edit.title = 'Editar';
        edit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z" stroke-linejoin="round"/><path d="m13.5 6.5 4 4"/></svg>';
        edit.onclick = () => onEdit(movement);
        actions.appendChild(edit);
      }
      if (movement.Estado === 'Pendiente de Pago' && onMarkPaid) {
        const paid = document.createElement('button');
        paid.type = 'button'; paid.className = 'movimiento-marcar-pagado';
        paid.innerHTML = '<span aria-hidden="true">✓</span> Marcar como pagado';
        paid.onclick = async () => {
          paid.disabled = true; paid.setAttribute('aria-busy','true');
          try { await onMarkPaid(movement); } catch {}
          finally { paid.disabled = false; paid.removeAttribute('aria-busy'); }
        };
        actions.appendChild(paid);
      }
      cell.appendChild(actions);
    }
    const wrap = document.createElement('div'); wrap.className = 'table-scroll';
    const nested = document.createElement('table');
    const headers = nested.createTHead().insertRow();
    const isPurchase = movement.operation === 'Ingreso' && movement.operation_detail === 'Compra';
    const unitsTitle = movement.operation === 'Egreso' ? 'Unidades (Egresadas)' : 'Unidades (Ingresadas)';
    for (const title of ['Nombre Producto',isPurchase ? 'Costo Unitario' : 'Precio Unitario','Subtotal','Descuento','Total','Stock Inicial',unitsTitle,'Stock Final','SKU']) {
      const th = document.createElement('th'); th.scope = 'col'; th.textContent = title; headers.appendChild(th);
    }
    const body = nested.createTBody();
    const productLabels = ['Producto', isPurchase ? 'Costo unitario' : 'Precio unitario', 'Subtotal', 'Descuento', 'Total', 'Stock inicial', unitsTitle, 'Stock final', 'SKU'];
    for (const product of movement.products) {
      const productRow = body.insertRow();
      const values = [product.name, moneda(product.unit_price), moneda(product.total), Number(product.discount_amount ?? 0) === 0 ? '-' : product.discount_type === 'percentage' ? product.discount_value + '% (' + moneda(product.discount_amount) + ')' : moneda(product.discount_amount ?? 0), moneda(product.net_total ?? product.total), product.initial_qty];
      values.forEach((value, valueIndex) => {
        const productCell = productRow.insertCell();
        productCell.dataset.label = productLabels[valueIndex];
        productCell.textContent = value;
      });
      const units = productRow.insertCell();
      const signedUnits = movement.operation === 'Egreso' ? -Math.abs(Number(product.units)) : Math.abs(Number(product.units));
      units.dataset.label = productLabels[6];
      units.textContent = `${signedUnits >= 0 ? '+' : '−'}${Math.abs(signedUnits)}`;
      units.className = signedUnits >= 0 ? 'movimiento-unidades-positivas' : 'movimiento-unidades-negativas';
      const finalStockCell = productRow.insertCell();
      finalStockCell.dataset.label = productLabels[7];
      finalStockCell.textContent = product.final_qty;
      const skuCell = productRow.insertCell(), sku = document.createElement('a');
      skuCell.dataset.label = productLabels[8];
      sku.href = '#tab-inventario'; sku.textContent = product.sku; sku.className = 'movimiento-sku-link';
      sku.onclick = event => {
        event.preventDefault();
        document.querySelector('[data-tab="inventario"]')?.click();
        document.dispatchEvent(new CustomEvent('abrir-producto', {detail:{id:String(product.product_id)}}));
      };
      skuCell.appendChild(sku);
    }
    wrap.appendChild(nested); cell.appendChild(wrap);
    const summary = document.createElement('div'); summary.className = 'movimiento-detalle-resumen';
    for (const [title, value] of [['Descuento Total', Number(movement.discount_amount ?? 0) === 0 ? '-' : moneda(movement.discount_amount)], ['Estado', movement.Estado ?? 'Pagado'], ['Medio de pago', movement.payment_method ?? '-'], ['Tipo', movement.operation], ['Código', movement.code], ...(movement.customer_name ? [['Cliente', movement.customer_name]] : [])]) {
      const item = document.createElement('p'), label = document.createElement('strong');
      label.textContent = title + ': '; item.append(label, String(value)); summary.appendChild(item);
    }
    cell.appendChild(summary);
    // La fila completa responde al clic; el botón permite abrirla también con teclado.
    row.onclick = () => {
      detail.hidden = !detail.hidden;
      toggle.setAttribute('aria-expanded', String(!detail.hidden));
      toggleIndicator.textContent = detail.hidden ? '▸' : '▾';
    };
  }
  if (!movements.length) {
    const cell = table.insertRow().insertCell(); cell.colSpan = 5;
    cell.textContent = 'Aún no hay movimientos registrados.';
  }
}

export function dentroDelRangoHorario(value, from = '', to = '') {
  const date = new Date(value);
  const hour = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  if (from && to && from > to) return hour >= from || hour <= to;
  return (!from || hour >= from) && (!to || hour <= to);
}
