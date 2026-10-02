export function stockDisponibleParaEgreso(productId, currentQty, pendingRows = [], restoredUnits = 0) {
  let available = Number(currentQty) + Number(restoredUnits || 0);
  for (const row of pendingRows) {
    if (row?.state === 'conflict' || row?.method !== 'POST') continue;
    let movement;
    try { movement = JSON.parse(row.body); } catch { continue; }
    const item = movement?.items?.find(candidate => String(candidate.product_id) === String(productId));
    if (!item || !Number.isFinite(Number(item.units))) continue;
    if (movement.operation === 'Egreso') available -= Number(item.units);
    else if (movement.operation === 'Ingreso') available += Number(item.units);
  }
  return Math.max(0, available);
}
