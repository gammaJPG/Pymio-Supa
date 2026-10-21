const DAY_MS = 86_400_000;

function dateOnly(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === match[0] ? date : null;
}

export function formatExpiryDate(value) {
  const date = dateOnly(value);
  return date ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date) : 'Sin vencimiento';
}

export function expiryState(product, today = new Date()) {
  const date = dateOnly(product?.expiry_date);
  if (!date) return { state: 'none', days: null, label: 'Sin vencimiento' };
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((date.getTime() - start) / DAY_MS);
  const dateLabel = formatExpiryDate(product.expiry_date);
  if (days < 0) return { state: 'expired', days, label: `Vencido hace ${Math.abs(days)} día${days === -1 ? '' : 's'} · ${dateLabel}` };
  if (days === 0) return { state: 'urgent', days, label: `Vence hoy · ${dateLabel}` };
  if (days <= 7) return { state: 'urgent', days, label: `Vence en ${days} día${days === 1 ? '' : 's'} · ${dateLabel}` };
  if (days <= 30) return { state: 'soon', days, label: `Vence en ${days} días · ${dateLabel}` };
  return { state: 'dated', days, label: `Vence ${dateLabel}` };
}

export function compareFefo(left, right) {
  const a = dateOnly(left?.expiry_date)?.getTime() ?? Number.POSITIVE_INFINITY;
  const b = dateOnly(right?.expiry_date)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (a !== b) return a - b;
  const createdA = Date.parse(left?.created_at || '') || 0;
  const createdB = Date.parse(right?.created_at || '') || 0;
  if (createdA !== createdB) return createdA - createdB;
  return Number(left?.id || 0) - Number(right?.id || 0);
}

const lotKey = product => `${String(product?.name || '').trim().toLocaleLowerCase('es')}\u0000${String(product?.category || '').trim().toLocaleLowerCase('es')}`;

export function annotateFefo(products) {
  const groups = new Map();
  for (const product of products) {
    if (Number(product.qty) <= 0 || product.Estado === 'Inhabilitado') continue;
    const key = lotKey(product);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }
  const firstByKey = new Map();
  for (const [key, lots] of groups) firstByKey.set(key, [...lots].sort(compareFefo)[0]);
  return products.map(product => {
    const first = firstByKey.get(lotKey(product));
    return {...product, fefo_recommended: Boolean(first && String(first.id) === String(product.id)), fefo_first: first || null};
  });
}

export function lotLabel(product, { recommended = false } = {}) {
  const expiry = product?.expiry_date ? ` · vence ${formatExpiryDate(product.expiry_date)}` : ' · sin vencimiento';
  return `${recommended ? 'Recomendado · ' : ''}${product.name} - ${product.sku}${expiry}`;
}
