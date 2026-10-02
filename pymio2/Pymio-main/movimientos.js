import { offlineFetch as fetch, apiBase, pendingMovements } from './offline.js';
import { renderMovimientos, fechaMovimiento, dentroDelRangoHorario, ordenarMovimientos, datosMovimientoPagado } from './movimientos-vista.js';
import { stockDisponibleParaEgreso } from './movimientos-stock.js';
export function iniciarMovimientos({ companyId, apiUrl = apiBase }) {
  const panel = document.getElementById('tab-movimientos');
  if (panel.dataset.initialized) return;
  panel.dataset.initialized = 'true';
  const $ = selector => panel.querySelector(selector);
  const dialog = $('#movimiento-dialogo'), form = $('#movimiento-form');
  const lines = $('#movimiento-productos'), fields = $('[data-movement-fields]');
  const error = $('[data-movement-error]'), status = $('[data-movement-status]');
  const save = form.querySelector('[type="submit"]'), cancel = $('[data-cancel-movement]');
  const menu = $('#opciones-movimientos'), menuButton = $('[data-movement-menu]');
  const paymentPending = $('[data-payment-pending]');
  const customerField = $('[data-customer-field]'), customerSelect = $('#mov-customer');
  const customerDialog = $('#cliente-dialogo'), customerForm = $('#cliente-form');
  const customerError = $('[data-customer-error]');
  const paymentConfirm = $('#movimiento-pago-confirmacion');
  let customers = [], previousCustomer = '';
  function renderCustomers(value = '') {
    customerSelect.replaceChildren(new Option('+Crear Cliente', '__create__'), new Option('Sin cliente', ''));
    for (const customer of customers) customerSelect.add(new Option(customer.name, String(customer.id)));
    customerSelect.value = value;
    if (customerSelect.selectedIndex < 0) customerSelect.value = '';
  }
  customerSelect.onchange = () => {
    if (customerSelect.value !== '__create__') { previousCustomer = customerSelect.value; return; }
    customerSelect.value = previousCustomer;
    customerForm.reset(); customerError.hidden = true;
    customerDialog.showModal();
    $('#cliente-nombre').focus();
  };
  customerSelect.onfocus = () => { previousCustomer = customerSelect.value; };
  customerForm.elements.phone.oninput = () => customerForm.elements.phone.setCustomValidity('');
  $('[data-customer-cancel]').onclick = () => customerDialog.close();
  customerForm.onsubmit = async event => {
    event.preventDefault();
    if (!customerForm.reportValidity()) return;
    const phone = customerForm.elements.phone.value.trim();
    const digits = (phone.match(/\d/g) ?? []).length;
    if (phone && (digits < 7 || digits > 15)) {
      customerForm.elements.phone.setCustomValidity('Ingresa un teléfono de 7 a 15 dígitos.');
      customerForm.elements.phone.reportValidity();
      return;
    }
    customerForm.elements.phone.setCustomValidity('');
    const submit = customerForm.querySelector('[type="submit"]');
    submit.disabled = true; customerError.hidden = true;
    try {
      const data = Object.fromEntries(new FormData(customerForm));
      const response = await fetch(endpoint('/api/customers'), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
      const created = await response.json();
      if (!response.ok) throw new Error(created.error || 'No se pudo guardar el cliente.');
      customers.push(created);
      customers.sort((a,b) => a.name.localeCompare(b.name,'es'));
      renderCustomers(String(created.id));
      customerDialog.close();
      customerSelect.focus();
    } catch (error) { customerError.textContent = error.message; customerError.hidden = false; }
    finally { submit.disabled = false; }
  };
  paymentPending.onclick = () => paymentPending.setAttribute('aria-pressed', String(paymentPending.getAttribute('aria-pressed') !== 'true'));
  const discountDetails = $('[data-discount-details]'), discount = $('#mov-discount');
  const dateDetails = $('[data-date-details]');
  dateDetails.addEventListener('invalid', () => { dateDetails.open = true; }, true);
  discount.addEventListener('invalid', () => { discountDetails.open = true; }, true);
  let mode = 'add', movements = [], selected = null;
  const selector = $('#movement-selector');
  const actionLabel = () => mode === 'delete' ? 'Eliminar movimiento' : mode === 'edit' ? 'Guardar cambios' : 'Guardar movimiento';
  let products = [], busy = false, version = 0, lineId = 0, pending = null;
  const normalizar = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const label = product => `${product.name} - ${product.sku}`;
  const endpoint = path => { const url = new URL(path, apiUrl); url.searchParams.set('company_id', companyId); return url; };
  const showError = message => { error.textContent = message; error.hidden = false; };
  function closeMenu() { menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); }
  menuButton.onclick = () => { menu.hidden = !menu.hidden; menuButton.setAttribute('aria-expanded', String(!menu.hidden)); };
  document.addEventListener('click', event => { if (!menu.parentElement.contains(event.target)) closeMenu(); });
  menu.parentElement.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMenu(); menuButton.focus(); } });

  const filterPeriod = $('#mov-filter-period'), filterFrom = $('#mov-filter-from'), filterTo = $('#mov-filter-to');
  const hourFrom = $('#mov-filter-hour-from'), hourTo = $('#mov-filter-hour-to');
  let dashboardMovementCodes = null;
  const clearDashboardFilter = () => { dashboardMovementCodes = null; };
  for (const input of [hourFrom, hourTo]) input.onchange = () => { clearDashboardFilter(); status.textContent = ''; refresh(); };
  const localDate = date => [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
  function applyPeriod() {
    if (filterPeriod.value === 'custom') return;
    if (filterPeriod.value === 'all') { filterFrom.value = filterTo.value = ''; return; }
    const today = new Date(), from = new Date(today);
    from.setDate(from.getDate() - (filterPeriod.value === 'today' ? 0 : Number(filterPeriod.value)-1));
    filterFrom.value = localDate(from);
    filterTo.value = localDate(today);
  }
  filterPeriod.onchange = () => { clearDashboardFilter(); applyPeriod(); status.textContent = ''; refresh(); };
  for (const input of [filterFrom, filterTo]) input.onchange = () => { clearDashboardFilter(); filterPeriod.value = 'custom'; status.textContent = ''; refresh(); };
  const sortHeaders = [...panel.querySelectorAll('[data-movement-sort]')];
  let displayedMovements = [], movementOrder = null;
  function renderMovementList(openCode = null) {
    const ordered=ordenarMovimientos(displayedMovements,movementOrder);
    renderMovimientos($('#movimientos-table'),ordered,{onMarkPaid:markMovementPaid});
    if(!ordered.length)$('#movimientos-table').rows[0].cells[0].textContent='No hay movimientos para el período seleccionado.';
    if (openCode) panel.querySelector(`[data-movement-code="${openCode}"] .movimiento-toggle`)?.click();
  }
  function confirmMarkPaid() {
    paymentConfirm.returnValue = '';
    paymentConfirm.showModal();
    return new Promise(resolve => paymentConfirm.addEventListener('close', () => resolve(paymentConfirm.returnValue === 'confirm'), {once:true}));
  }
  async function markMovementPaid(movement) {
    if (!await confirmMarkPaid()) return;
    status.textContent = '';
    const response = await fetch(endpoint('/api/movements/' + encodeURIComponent(movement.code)), {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(datosMovimientoPagado(movement, crypto.randomUUID())), signal:AbortSignal.timeout(20000)
    });
    const result = await response.json();
    if (!response.ok) {
      status.textContent = result.error || 'No se pudo marcar el movimiento como pagado.';
      throw new Error(status.textContent);
    }
    movement.Estado = 'Pagado';
    if (result.revision) movement.revision = result.revision;
    status.textContent = result.queued ? 'Cambio guardado en el dispositivo. Se marcará como pagado al recuperar la conexión.' : 'Movimiento marcado como pagado.';
    renderMovementList(movement.code);
  }
  sortHeaders.forEach(header => {
    const sort=()=>{
      const same=movementOrder?.field===header.dataset.movementSort;
      movementOrder={field:header.dataset.movementSort,type:header.dataset.type,direction:same?-movementOrder.direction:(header.dataset.type==='texto'?1:-1)};
      sortHeaders.forEach(item=>{
        const active=item===header;
        item.setAttribute('aria-sort',active?(movementOrder.direction===1?'ascending':'descending'):'none');
        item.querySelector('span').textContent=active?(movementOrder.direction===1?'↑':'↓'):'↕';
      });
      renderMovementList();
    };
    header.onclick=sort;
    header.onkeydown=event=>{
      if(event.key!=='Enter' && event.key!==' ')return;
      event.preventDefault();
      sort();
    };
  });
  let refreshVersion = 0;
  async function refresh(targetCode = null) {
    const current = ++refreshVersion;
    if (targetCode) { filterPeriod.value = 'all'; hourFrom.value = hourTo.value = ''; applyPeriod(); }
    else applyPeriod();
    filterTo.setCustomValidity(filterFrom.value && filterTo.value && filterFrom.value > filterTo.value ? 'La fecha Hasta debe ser igual o posterior a Desde.' : '');
    if (!filterFrom.reportValidity() || !filterTo.reportValidity()) {
      status.textContent = 'Revisa el rango de fechas.';
      return;
    }
    const url = endpoint('/api/movements');
    if (filterFrom.value) url.searchParams.set('from', new Date(filterFrom.value + 'T00:00:00').toISOString());
    if (filterTo.value) {
      const end = new Date(filterTo.value + 'T00:00:00');
      end.setDate(end.getDate()+1);
      url.searchParams.set('to', end.toISOString());
    }
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) throw new Error(data.error || 'No se pudieron cargar los movimientos.');
      if (targetCode && !data.some(m => m.code === targetCode)) {
        const detailResponse = await fetch(endpoint('/api/movements/' + encodeURIComponent(targetCode)), {cache:'no-store',signal:AbortSignal.timeout(15000)});
        const detail = await detailResponse.json();
        if (!detailResponse.ok) throw new Error(detail.error || 'No se pudo abrir el movimiento.');
        data.unshift(detail);
      }
      if (current !== refreshVersion) return;
      displayedMovements = data.filter(m => dentroDelRangoHorario(m.occurred_at, hourFrom.value, hourTo.value) && (!dashboardMovementCodes || dashboardMovementCodes.has(m.code)));
      renderMovementList();
      if (targetCode) {
        const row = [...panel.querySelectorAll('[data-movement-code]')].find(r => r.dataset.movementCode === targetCode);
        const toggle = row.querySelector('.movimiento-toggle');
        toggle.click(); toggle.focus({preventScroll:true}); row.scrollIntoView({block:'center',behavior:'smooth'});
      }
    } catch (err) { if (current === refreshVersion) status.textContent = err.message; }
  }
  document.addEventListener('abrir-movimiento', event => {
    const code = event.detail?.code;
    if (!/^[a-f0-9]{12}$/.test(code ?? '')) return;
    document.querySelector('[data-tab="movimientos"]').click();
    status.textContent = '';
    refresh(code);
  });
  document.addEventListener('abrir-movimientos-filtrados', event => {
    dashboardMovementCodes = new Set((event.detail?.codes ?? []).map(String));
    filterPeriod.value = 'all'; filterFrom.value = filterTo.value = hourFrom.value = hourTo.value = '';
    document.querySelector('[data-tab="movimientos"]').click();
    status.textContent = event.detail?.label || 'Filtro aplicado desde el Dashboard: ventas por cobrar.';
    refresh();
  });

  function addLine(item) {
    if (lines.children.length >= 100) return;
    const row = $('#movimiento-linea').content.firstElementChild.cloneNode(true);
    const input = row.querySelector('[data-product]'), list = row.querySelector('datalist');
    list.id = `mov-product-options-${++lineId}`;
    input.setAttribute('list', list.id);
    const options = () => {
      const filter = normalizar(input.value);
      list.replaceChildren();
      products.filter(p => normalizar(label(p)).includes(filter)).forEach(p => list.appendChild(new Option(label(p), label(p))));
      input.setCustomValidity('');
    };
    input.oninput = options;
    options();
    row.querySelector('[data-remove-line]').onclick = () => { if (lines.children.length > 1) row.remove(); };
    if (item?.product_id) {
      const product = products.find(p => String(p.id) === String(item.product_id));
      input.value = product ? label(product) : item.name + ' - ' + item.sku;
      row.querySelector('[data-units]').value = Math.abs(item.units);
    }
    const unitsInput = row.querySelector('[data-units]');
    unitsInput.addEventListener('input', () => { unitsInput.setCustomValidity(''); error.hidden = true; });
    row.querySelector('[data-line-discount-type]').value = item?.discount_type ?? 'fixed';
    row.querySelector('[data-line-discount-value]').value = item?.discount_value ?? 0;
    row.addEventListener('input', discountSymbols);
    row.addEventListener('change', discountSymbols);
    lines.appendChild(row);
    discountSymbols();
  }
  $('[data-add-line]').onclick = addLine;
  discountDetails.ontoggle = () => {
    discount.disabled = !discountDetails.open;
    discountSymbols();
  };
  function discountSymbols() {
    const individual = discountDetails.open && form.elements.discount_scope.value === 'product';
    $('[data-global-discount]').hidden = individual;
    form.elements.discount_value.disabled = !discountDetails.open || individual;
    $('[data-product-discount-help]').hidden = !individual;
    for (const row of lines.children) {
      row.classList.toggle('con-descuento', individual);
      row.querySelector('[data-line-discount]').hidden = !individual;
      const type = row.querySelector('[data-line-discount-type]');
      const value = row.querySelector('[data-line-discount-value]');
      type.disabled = value.disabled = !individual;
      const product = products.find(p => label(p) === row.querySelector('[data-product]').value);
      const previous = mode === 'edit' ? selected?.products.find(p => String(p.product_id) === String(product?.id)) : null;
      const subtotal = Number(previous?.unit_price ?? product?.price ?? 0) * Number(row.querySelector('[data-units]').value);
      value.max = type.value === 'percentage' ? '100' : String(Math.min(subtotal, 2147483647));
      const amount = type.value === 'percentage' ? subtotal * Number(value.value) / 100 : Number(value.value);
      row.querySelector('[data-line-total]').textContent = product ? 'Total: ' + new Intl.NumberFormat('es-CL', {style:'currency',currency:'CLP',maximumFractionDigits:0}).format(subtotal - amount) : '';
    }
  }
  form.querySelectorAll('[name="discount_scope"]').forEach(radio => { radio.onchange = discountSymbols; });
  function operationDetails(value = '') {
    const choices = form.elements.operation.value === 'Egreso' ? ['Merma','Consumo Interno','Otros'] : ['Otros'];
    if ($('[data-operation-fields]').hidden && ['Venta', 'Compra'].includes(value)) choices.unshift(value);
    const select = form.elements.operation_detail;
    select.replaceChildren(new Option('Selecciona un detalle',''));
    choices.forEach(choice => select.add(new Option(choice,choice)));
    select.value = choices.includes(value) ? value : '';
  }
  form.elements.operation.onchange = () => operationDetails();
  function setDate(value) {
    const now = new Date(value);
    form.elements.occurred_at.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,10);
    form.elements.hour.value = String(now.getHours() % 12 || 12);
    form.elements.minute.value = String(now.getMinutes()).padStart(2,'0');
    form.elements.period.value = now.getHours() >= 12 ? 'pm' : 'am';
  }
  function resetFields() {
    lines.replaceChildren(); error.hidden = true;
    customerField.hidden = true; customerField.open = false; renderCustomers();
    paymentPending.hidden = true; paymentPending.setAttribute('aria-pressed', 'false');
    form.elements.channel.value = '';
    form.elements.payment_method.value = '';
    operationDetails();
    discountDetails.hidden = false; discountDetails.open = false; discount.disabled = true;
    form.elements.discount_scope.value = 'global';
    form.elements.discount_value.value = '';
    discountSymbols();
    dateDetails.open = false;
    setDate(new Date());
  }
  function configureCommercialFields(detail) {
    const isSale = detail === 'Venta';
    const isPurchase = detail === 'Compra';
    paymentPending.hidden = !isSale && !isPurchase;
    customerField.hidden = !isSale;
    if (!isSale) customerField.open = false;
    discountDetails.hidden = isPurchase;
    if (isPurchase) {
      discountDetails.open = false;
      discount.disabled = true;
      form.elements.discount_scope.value = 'global';
      form.elements.discount_value.value = '';
    }
    discountSymbols();
  }
  selector.onchange = () => {
    selected = movements.find(m => m.code === selector.value) ?? null;
    resetFields();
    save.disabled = !selected;
    fields.disabled = !selected || mode === 'delete';
    $('[data-movement-description]').textContent = selected
      ? mode === 'delete' ? 'Se eliminará este movimiento de la lista y se revertirán sus unidades en el inventario.' : 'Los cambios ajustarán el stock y los saldos posteriores. Se conservan los precios de los productos ya incluidos.' : '';
    if (!selected || mode === 'delete') return;
    form.elements.operation.value = selected.operation;
    form.elements.channel.value = selected.channel ?? '';
    form.elements.payment_method.value = selected.payment_method ?? '';
    $('[data-operation-fields]').hidden = ['Venta', 'Compra'].includes(selected.operation_detail);
    operationDetails(selected.operation_detail ?? 'Otros');
    configureCommercialFields(selected.operation_detail);
    if (!customerField.hidden) {
      renderCustomers(selected.customer_id == null ? '' : String(selected.customer_id));
      customerField.open = selected.customer_id != null;
    }
    paymentPending.setAttribute('aria-pressed', String(selected.Estado === 'Pendiente de Pago'));
    setDate(selected.occurred_at);
    selected.products.forEach(addLine);
    if (selected.operation_detail !== 'Compra' && (selected.discount_type || selected.discount_scope === 'product')) {
      discountDetails.open = true; discount.disabled = false;
      form.elements.discount_scope.value = selected.discount_scope === 'product' ? 'product' : 'global';
      if (selected.discount_type === 'fixed') {
        showError('Este movimiento tiene un descuento global fijo antiguo. Selecciona un porcentaje global o descuentos por producto antes de guardar.');
      }
      form.elements.discount_value.value = selected.discount_type === 'fixed' ? '' : selected.discount_value;
      discountSymbols();
    }
  };
  async function open(type, preset = null) {
    closeMenu(); mode = type; selected = null;
    const current = ++version;
    form.reset(); resetFields(); pending = null;
    $('[data-operation-fields]').hidden = Boolean(preset);
    operationDetails();
    if (preset) {
      form.elements.operation.value = preset.operation;
      operationDetails(preset.detail);
      configureCommercialFields(preset.detail);
    }
    save.textContent = actionLabel();
    $('#movimiento-titulo').textContent = mode === 'delete' ? 'Eliminar movimiento' : mode === 'edit' ? 'Modificar movimiento' : preset?.detail === 'Venta' ? 'Agregar venta' : preset?.detail === 'Compra' ? 'Agregar compra' : 'Agregar movimiento';
    fields.hidden = mode === 'delete'; fields.disabled = save.disabled = true;
    $('[data-movement-selector-wrap]').hidden = mode === 'add';
    $('[data-movement-description]').hidden = mode === 'add';
    $('[data-movement-description]').textContent = '';
    selector.disabled = true;
    selector.replaceChildren(new Option('Cargando movimientos…',''));
    dialog.showModal();
    try {
      const paths = mode === 'add' ? (preset?.detail === 'Venta' ? ['/api/products','/api/customers'] : ['/api/products'])
        : mode === 'edit' ? ['/api/products','/api/movements','/api/customers'] : ['/api/movements'];
      const results = await Promise.all(paths.map(async path => {
        const response = await fetch(endpoint(path), {cache:'no-store',signal:AbortSignal.timeout(15000)});
        const data = await response.json();
        if (!response.ok || !Array.isArray(data)) throw new Error('No se pudo cargar el listado. Cierra y vuelve a abrir el formulario.');
        return data;
      }));
      if (current !== version || !dialog.open) return;
      if (mode !== 'delete') products = results[0].filter(p => String(p.company_id) === String(companyId));
      if (mode === 'edit' || preset?.detail === 'Venta') { customers = results.at(-1); renderCustomers(); }
      if (mode === 'add') {
        if (!products.length) throw new Error('No hay productos disponibles para esta empresa.');
        addLine(); fields.disabled = save.disabled = false;
      } else {
        movements = mode === 'edit' ? results[1] : results[0];
        selector.replaceChildren(new Option(movements.length ? 'Selecciona un movimiento' : 'No hay movimientos disponibles',''));
        movements.forEach(m => selector.add(new Option(m.code + ' · ' + fechaMovimiento(m.occurred_at) + ' · ' + m.operation, m.code)));
        selector.disabled = !movements.length;
      }
    } catch(err) { if (current === version && dialog.open) showError(err.message); }
  }
  $('[data-movement-add]').onclick = () => open('add');
  $('[data-sale-add]').onclick = () => open('add', { operation: 'Egreso', detail: 'Venta' });
  $('[data-purchase-add]').onclick = () => open('add', { operation: 'Ingreso', detail: 'Compra' });
  $('[data-movement-edit]').onclick = () => open('edit');
  $('[data-movement-delete]').onclick = () => open('delete');
  cancel.onclick = () => { version++; dialog.close(); };
  dialog.oncancel = event => { if (busy) event.preventDefault(); else version++; };
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    error.hidden = true;
    if (!pending) {
      if (mode !== 'add' && !selected) return;
      if (mode === 'delete') {
        if (!window.confirm('¿Eliminar el movimiento ' + selected.code + ' y revertir sus unidades en el inventario?')) return;
        pending = { action_id: crypto.randomUUID(), revision: selected.revision };
      } else {
      for (const unitsInput of form.querySelectorAll('[data-units]')) unitsInput.setCustomValidity('');
      if (!form.reportValidity()) return;
      const items = [], seen = new Set();
      const outgoing = form.elements.operation.value === 'Egreso';
      const queuedRows = outgoing ? await pendingMovements().catch(()=>[]) : [];
      for (const row of lines.children) {
        const input = row.querySelector('[data-product]');
        const unitsInput = row.querySelector('[data-units]');
        unitsInput.setCustomValidity('');
        const product = products.find(p => label(p) === input.value);
        if (!product) { input.setCustomValidity('Selecciona un producto de la lista.'); input.reportValidity(); return; }
        if (seen.has(String(product.id))) return showError('Incluye cada producto una sola vez; ajusta sus unidades en la misma fila.');
        seen.add(String(product.id));
        const units = Number(unitsInput.value);
        if (outgoing) {
          const original = mode === 'edit' && selected?.operation === 'Egreso'
            ? selected.products.find(item => String(item.product_id) === String(product.id))
            : null;
          const available = stockDisponibleParaEgreso(product.id, product.qty, queuedRows, Math.abs(Number(original?.units ?? 0)));
          if (units > available) {
            const requestedLabel = `${units} ${units === 1 ? 'unidad' : 'unidades'}`;
            const availableLabel = `${available} ${available === 1 ? 'unidad disponible' : 'unidades disponibles'}`;
            const message = `${form.elements.operation_detail.value === 'Venta' ? 'No puedes vender' : 'No puedes retirar'} ${requestedLabel} de ${product.name}. Hay ${availableLabel}.`;
            unitsInput.setCustomValidity(message);
            unitsInput.reportValidity();
            showError(message);
            return;
          }
        }
        items.push({ product_id: String(product.id), units,
          discount: discountDetails.open && form.elements.discount_scope.value === 'product'
            ? {type: row.querySelector('[data-line-discount-type]').value, value: Number(row.querySelector('[data-line-discount-value]').value)} : null });
      }
      pending = { code: crypto.randomUUID(), operation: form.elements.operation.value, operation_detail: form.elements.operation_detail.value, occurred_at: new Date(form.elements.occurred_at.value + 'T' + String(Number(form.elements.hour.value) % 12 + (form.elements.period.value === 'pm' ? 12 : 0)).padStart(2,'0') + ':' + String(form.elements.minute.value).padStart(2,'0')).toISOString(), items,
        discount: !discountDetails.open ? null : form.elements.discount_scope.value === 'product' ? {scope:'product'} : {scope:'global', type:'percentage', value:Number(form.elements.discount_value.value)} };
      pending.Estado = paymentPending.getAttribute('aria-pressed') === 'true' ? 'Pendiente de Pago' : 'Pagado';
      pending.channel = form.elements.channel.value;
      pending.payment_method = form.elements.payment_method.value;
      pending.customer_id = customerField.hidden || !customerSelect.value ? null : customerSelect.value;
      if (mode === 'edit') { pending.action_id = pending.code; delete pending.code; pending.revision = selected.revision; }
      }
    }
    busy = true; selector.disabled = fields.disabled = save.disabled = cancel.disabled = true;
    save.textContent = mode === 'delete' ? 'Eliminando…' : 'Guardando…';
    try {
      const response = await fetch(endpoint(mode === 'add' ? '/api/movements' : '/api/movements/' + selected.code), { method: mode === 'delete' ? 'DELETE' : mode === 'edit' ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status < 500) pending = null;
        throw new Error(result.error || 'No se pudo guardar el movimiento.');
      }
      pending = null;
      dialog.close();
      status.textContent = result.queued ? (result.conflict ? 'Guardado en el dispositivo. Requiere revisión en el panel de sincronización.' : 'Guardado en el dispositivo. Pendiente de sincronizar; el stock se confirmará al conectar.') : mode === 'add' ? '' : `Movimiento ${result.code} ${mode === 'delete' ? 'eliminado' : 'guardado'}.`;
      document.dispatchEvent(new CustomEvent('inventario-actualizado'));
      await refresh();
    } catch (err) {
      showError(pending ? 'Si no hay espacio de almacenamiento, libera espacio y reintenta. No se pudo confirmar el guardado. Pulsa Reintentar para consultar o guardar el mismo movimiento sin duplicarlo.' : err.message);
    } finally {
      busy = false; fields.disabled = Boolean(pending) || mode === 'delete'; selector.disabled = Boolean(pending) || mode === 'add'; save.disabled = cancel.disabled = false;
      save.textContent = pending ? 'Reintentar' : actionLabel();
    }
  };
  document.querySelector('[data-tab="movimientos"]').addEventListener('click', () => refresh());
  document.addEventListener('movimientos-sincronizados', () => refresh());
  refresh();
}
