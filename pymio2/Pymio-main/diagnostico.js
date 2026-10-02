  const alerts = [
    {sev:'critical', tag:'Crítico', title:'Margen cayendo en categoría Hogar',
     desc:'El margen de la categoría Hogar bajó de 28% a 19% en los últimos dos meses, principalmente por un alza de costos de un proveedor.',
     metric:'Impacto estimado: <span class="num">-$3.200.000</span> de margen mensual',
     extra:'Recomendación: renegociar precio con el proveedor Distribuidora Andes o ajustar el precio de venta en los 6 SKUs más afectados. Se puede revisar el detalle producto por producto en la pestaña Inventario.'},
  ];

  export function renderAlerts({demo=true}={}){
    if(!demo){
      document.getElementById('alert-list').innerHTML='<div class="alert-card"><div class="alert-title">Aún no hay datos suficientes para crear un diagnóstico.</div><div class="alert-desc">Agrega productos y registra movimientos. Pymio mostrará aquí señales cuando pueda comparar tu operación.</div></div>';
      return;
    }
    document.getElementById('alert-list').innerHTML = alerts.map((a, i) => `
      <div class="alert-card ${a.sev}" id="alert-${i}">
        <div class="alert-top">
          <div class="alert-top-left">
            <span class="pill ${a.sev === 'critical' ? 'out' : a.sev === 'warn' ? 'low' : 'pending'}">${a.tag}</span>
            <span class="alert-title">${a.title}</span>
          </div>
          <button class="expand-btn" data-alert-index="${i}" aria-expanded="false" aria-controls="alert-extra-${i}">Ver detalle</button>
        </div>
        <div class="alert-desc">${a.desc}</div>
        <div class="alert-metric">${a.metric}</div>
        <div class="alert-extra" id="alert-extra-${i}">${a.extra}</div>
      </div>
    `).join('');
    document.querySelectorAll('#alert-list .expand-btn').forEach(button => {
      button.addEventListener('click', () => toggleAlert(button.dataset.alertIndex));
    });
  }
  function toggleAlert(i){
    const card = document.getElementById('alert-' + i);
    card.classList.toggle('open');
    const btn = card.querySelector('.expand-btn');
    btn.setAttribute('aria-expanded', String(card.classList.contains('open')));
    btn.textContent = card.classList.contains('open') ? 'Ocultar detalle' : 'Ver detalle';
  }

