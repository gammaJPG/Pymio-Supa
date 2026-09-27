  const salesMonths = [
    {m:'Abr', v:38.4}, {m:'May', v:41.2}, {m:'Jun', v:39.8},
    {m:'Jul', v:44.6}, {m:'Ago', v:45.9}, {m:'Sep', v:48.25}
  ];

  const topProducts = [
    {name:'Set de ollas antiadherentes', units:214, margin:38},
    {name:'Aspiradora vertical 1200W', units:156, margin:29},
    {name:'Organizador modular x6', units:301, margin:44},
    {name:'Lámpara LED de escritorio', units:189, margin:33},
    {name:'Silla ergonómica oficina', units:97, margin:26},
  ];

  export function renderDashboard(){
    const max = Math.max(...salesMonths.map(s => s.v));
    document.getElementById('sales-chart').innerHTML = salesMonths.map((s, i) => `
      <div class="bar-wrap" tabindex="0" aria-label="${s.m}: ${s.v.toFixed(2)} millones de pesos">
        <span class="bar-value">${s.v.toLocaleString('es-CL',{maximumFractionDigits:1})}</span>
        <div class="bar ${i === salesMonths.length - 1 ? 'current' : ''}" style="height:${(s.v/max*70).toFixed(2)}%" title="$${s.v.toFixed(1)}M"></div>
        <div class="bar-month">${s.m}</div>
      </div>
    `).join('');

    document.getElementById('top-products').innerHTML = topProducts.map((p, i) => `
      <tr><td><span class="product-rank">${String(i+1).padStart(2,'0')}</span>${p.name}</td><td class="num">${p.units}</td><td class="num">${p.margin}%</td></tr>
    `).join('');
  }
