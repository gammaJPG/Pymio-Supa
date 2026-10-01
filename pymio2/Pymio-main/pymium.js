export function setupPymium() {
  const dialog = document.createElement('dialog');
  dialog.className = 'pymium-dialog';
  dialog.setAttribute('aria-labelledby', 'pymium-title');
  dialog.innerHTML = `
    <button type="button" class="pymium-close" aria-label="Cerrar Pymium"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke-linecap="round"/></svg></button>
    <div class="pymium-layout">
      <section class="pymium-benefits">
        <div class="pymium-heading"><span class="bee-outline pymium-mark" aria-hidden="true"></span><div><h2 id="pymium-title">Hazte Pymium</h2><p>Más herramientas. Más oportunidades.</p></div></div>
        <p class="pymium-description">Dale a tu pyme un espacio para crecer con los beneficios de Pymium.</p>
        <ul>
          <li><strong>Documentación para tu pyme</strong><p>Accede a guías, plantillas y documentos específicos para organizar y gestionar tu negocio.</p></li>
          <li><strong>Negocio verificado, mayor visibilidad</strong><p>Verificación automática e insignia Pymium para destacar tu perfil frente a los no verificados en RED Pymio.</p></li>
          <li><strong>Reportes avanzados</strong><p>Profundiza en tus ventas y tendencias con informes personalizados y exportables.</p></li>
          <li><strong>Soporte prioritario</strong><p>Recibe atención preferente para resolver tus dudas sobre el uso de la plataforma.</p></li>
          <li><strong>Beneficios exclusivos</strong><p>Accede a talleres, oportunidades y descuentos de aliados de la comunidad.</p></li>
        </ul>
        <p class="pymium-demo-note">Vista de prueba del plan. Los beneficios y la suscripción aún no se activan.</p>
        <button type="button" class="pymium-subscribe">Suscribirme a Pymium <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </section>
      <section class="pymium-checkout" aria-labelledby="pymium-checkout-title" hidden>
        <h3 id="pymium-checkout-title">Prueba tu suscripción</h3>
        <p>Simula el pago de Pymium. No se realizará ningún cobro.</p>
        <div class="pymium-test-card">Usa la tarjeta ficticia <strong>4242 4242 4242 4242</strong>, una fecha futura y el código <strong>123</strong>.</div>
        <form class="pymium-payment" autocomplete="off">
          <label>Nombre de prueba<input name="test_name" placeholder="Empresa de ejemplo" maxlength="80" required autocomplete="off"></label>
          <label>Número de tarjeta de prueba<input name="test_number" inputmode="numeric" placeholder="4242 4242 4242 4242" maxlength="19" required autocomplete="off" aria-describedby="pymium-payment-note"></label>
          <div class="pymium-payment-row"><label>Vencimiento<input name="test_expiry" inputmode="numeric" placeholder="MM/AA" maxlength="5" required autocomplete="off"></label><label>Código de prueba<input name="test_code" inputmode="numeric" placeholder="123" maxlength="3" required autocomplete="off"></label></div>
          <p id="pymium-payment-note">Introduce solo datos ficticios. No se guardan ni se envían.</p>
          <p class="pymium-payment-error" role="alert" hidden></p>
          <button type="submit" class="pymium-subscribe">Confirmar suscripción de prueba</button>
          <button type="button" class="pymium-back">Volver a los beneficios</button>
        </form>
        <div class="pymium-success" role="status" tabindex="-1" hidden><span class="bee-outline pymium-mark" aria-hidden="true"></span><h3>Simulación completada</h3><p>Tu suscripción de prueba se completó. No se realizó ningún cobro ni se activó un plan real.</p><button type="button" class="pymium-finish">Cerrar</button></div>
      </section>
    </div>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const checkout = dialog.querySelector('.pymium-checkout');
  const subscribe = dialog.querySelector('.pymium-benefits > .pymium-subscribe');
  const error = dialog.querySelector('.pymium-payment-error');
  const success = dialog.querySelector('.pymium-success');
  let opener;
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-pymium-open]');
    if (!button) return;
    opener = button;
    dialog.showModal();
  });
  subscribe.onclick = () => {
    checkout.hidden = false;
    dialog.classList.add('is-expanded');
    subscribe.disabled = true;
    form.elements.test_name.focus({preventScroll:true});
    if (window.matchMedia('(max-width:700px)').matches) checkout.scrollIntoView({block:'start',behavior:'instant'});
  };
  dialog.querySelector('.pymium-back').onclick = () => {
    checkout.hidden = true; dialog.classList.remove('is-expanded'); dialog.scrollTop = 0; subscribe.disabled = false; subscribe.focus();
  };
  dialog.querySelector('.pymium-close').onclick = dialog.querySelector('.pymium-finish').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    form.reset(); error.hidden = success.hidden = checkout.hidden = true; form.hidden = false;
    dialog.classList.remove('is-expanded'); subscribe.disabled = false;
    dialog.scrollTop = 0;
    opener?.focus({preventScroll:true});
  });
  form.elements.test_number.addEventListener('input', event => {
    const digits = event.target.value.replace(/\D/g, '').slice(0,16);
    event.target.value = digits.replace(/(.{4})(?=.)/g, '$1 ');
  });
  form.elements.test_expiry.addEventListener('input', event => {
    const digits = event.target.value.replace(/\D/g, '').slice(0,4);
    event.target.value = digits.length > 2 ? digits.slice(0,2) + '/' + digits.slice(2) : digits;
  });
  form.onsubmit = event => {
    event.preventDefault();
    const expiry = /^(\d{2})\/(\d{2})$/.exec(form.elements.test_expiry.value);
    const now = new Date();
    const validExpiry = expiry && Number(expiry[1]) >= 1 && Number(expiry[1]) <= 12 && new Date(2000 + Number(expiry[2]), Number(expiry[1]), 1) > now;
    if (form.elements.test_number.value.replace(/\D/g,'') !== '4242424242424242' || form.elements.test_code.value !== '123' || !validExpiry || !form.elements.test_name.value.trim()) {
      error.textContent = 'Usa los datos ficticios indicados y una fecha de vencimiento futura (MM/AA).'; error.hidden = false; return;
    }
    form.reset(); form.hidden = true; error.hidden = true; success.hidden = false; success.focus();
  };
}
