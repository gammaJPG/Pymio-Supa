export function normalizeDashboardData(products = [], movements = [], customers = []) {
  const byId = new Map(products.map(product => [String(product.id), product]));
  const sales = movements
    .filter(movement => movement.operation === 'Egreso' && movement.operation_detail === 'Venta')
    .map(movement => ({
      id: movement.code,
      date: new Date(movement.occurred_at),
      status: movement.Estado || 'Pagado',
      customerId: movement.customer_id == null ? null : String(movement.customer_id),
      customerName: movement.customer_name || '',
      items: (movement.products || []).map(item => {
        const product = byId.get(String(item.product_id));
        return {
          productId: String(item.product_id),
          sku: item.sku || product?.sku || '',
          name: item.name || product?.name || 'Producto sin nombre',
          category: product?.category || 'Sin categoría',
          units: Math.abs(Number(item.units) || 0),
          amount: Number(item.net_total ?? item.total) || 0,
        };
      }),
    }))
    .filter(sale => Number.isFinite(sale.date.getTime()));
  return { products, sales, customers };
}

export function rangeForPeriod(period, now = new Date()) {
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const start = new Date(day);
  if (period === 'month') start.setDate(1);
  else if (period === '30' || period === '7') start.setDate(start.getDate() - Number(period) + 1);
  const end = new Date(day); end.setDate(end.getDate() + 1);
  return { start, end };
}

export function previousRangeForPeriod(period, now = new Date()) {
  const current = rangeForPeriod(period, now);
  if (period === 'month') return monthRange(-1, now);
  const duration = current.end.getTime() - current.start.getTime();
  return { start: new Date(current.start.getTime() - duration), end: new Date(current.start) };
}

export function sixMonthRange(now = new Date()) {
  return {
    start: new Date(now.getFullYear(), now.getMonth() - 5, 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}

export function monthRange(offset = 0, now = new Date()) {
  return {
    start: new Date(now.getFullYear(), now.getMonth() + offset, 1),
    end: new Date(now.getFullYear(), now.getMonth() + offset + 1, 1),
  };
}

export function selectSales(sales, { start, end, category = '' }) {
  return sales
    .filter(sale => sale.date >= start && sale.date < end)
    .map(sale => ({ ...sale, items: category ? sale.items.filter(item => item.category === category) : sale.items }))
    .filter(sale => sale.items.length);
}

export function summarizeSales(sales) {
  const items = sales.flatMap(sale => sale.items);
  const income = items.reduce((sum, item) => sum + item.amount, 0);
  const units = items.reduce((sum, item) => sum + item.units, 0);
  const clients = new Set(sales.map(sale => sale.customerId).filter(Boolean));
  return {
    count: sales.length,
    income,
    units,
    ticket: sales.length ? income / sales.length : 0,
    pending: sales.filter(sale => sale.status === 'Pendiente de Pago').length,
    clients: clients.size,
    items,
  };
}

export function isLowStock(product) {
  const qty = Number(product.qty);
  return qty > 0 && qty <= Number(product.low_qty);
}
