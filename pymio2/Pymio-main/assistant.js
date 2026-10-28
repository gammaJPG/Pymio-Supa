const escapeStorageMessages = value => Array.isArray(value)
  ? value.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-40)
  : [];

export function setupPymioAssistant({ apiUrl = '', session } = {}) {
  if (!session || document.querySelector('[data-pymio-assistant]')) return;

  const storageKey = `pymio:assistant:${session.demo ? 'demo' : session.companyId}`;
  const greeting = {
    role: 'assistant',
    content: 'Hola, soy Miel. Puedo orientarte sobre ventas, inventario, indicadores, RED Pymio y el uso de la plataforma. ¿Qué necesitas hacer?'
  };
  let messages;
  try { messages = escapeStorageMessages(JSON.parse(localStorage.getItem(storageKey) || '[]')); }
  catch { messages = []; }
  if (!messages.length) messages = [greeting];

  const root = document.createElement('section');
  root.className = 'pymio-assistant';
  root.dataset.pymioAssistant = '';
  root.innerHTML = `
    <aside class="pymio-assistant-panel" id="pymio-assistant-panel" aria-label="Asistente de Pymio" aria-hidden="true" hidden>
      <header class="pymio-assistant-head">
        <span class="pymio-assistant-avatar" aria-hidden="true"><img src="assets/pymio-icon-transparent.png" alt=""></span>
        <div><span>Asistente de Pymio</span><strong>Miel</strong></div>
        <button type="button" class="pymio-assistant-reset" aria-label="Borrar conversación" title="Borrar conversación">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg>
        </button>
        <button type="button" class="pymio-assistant-close" aria-label="Cerrar asistente">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </header>
      <div class="pymio-assistant-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
      <form class="pymio-assistant-compose">
        <label><span class="sr-only">Pregunta para Miel</span><textarea rows="1" maxlength="1200" required placeholder="Pregunta sobre Pymio…"></textarea></label>
        <button type="submit" aria-label="Enviar pregunta">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 16-8-5.5 16-3-6.5L4 12Zm7.5 1.5L20 4"/></svg>
        </button>
      </form>
      <p class="pymio-assistant-note">Miel puede equivocarse. No compartas información sensible.</p>
    </aside>
    <button type="button" class="pymio-assistant-trigger" aria-controls="pymio-assistant-panel" aria-expanded="false">
      <img src="assets/pymio-icon-transparent.png" alt="">
      <span>Pregúntale a Miel</span>
    </button>`;
  document.body.append(root);

  const panel = root.querySelector('.pymio-assistant-panel');
  const trigger = root.querySelector('.pymio-assistant-trigger');
  const closeButton = root.querySelector('.pymio-assistant-close');
  const resetButton = root.querySelector('.pymio-assistant-reset');
  const list = root.querySelector('.pymio-assistant-messages');
  const form = root.querySelector('.pymio-assistant-compose');
  const field = form.querySelector('textarea');
  const submit = form.querySelector('[type="submit"]');
  let busy = false;

  const save = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(messages.slice(-40))); } catch {}
  };
  const supportButton = () => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pymio-assistant-support';
    button.innerHTML = '<span>Ir al Centro de ayuda</span><span aria-hidden="true">→</span>';
    button.addEventListener('click', () => {
      close();
      document.dispatchEvent(new Event('pymio-open-help'));
    });
    return button;
  };
  const messageNode = item => {
    const article = document.createElement('article');
    article.className = `pymio-assistant-message ${item.role}`;
    const label = document.createElement('strong');
    label.textContent = item.role === 'assistant' ? 'Miel' : 'Tú';
    const copy = document.createElement('p');
    copy.textContent = item.content;
    article.append(label, copy);
    if (item.supportRecommended) article.append(supportButton());
    return article;
  };
  const render = () => {
    list.replaceChildren(...messages.map(messageNode));
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  };
  const append = item => {
    messages.push(item);
    messages = messages.slice(-40);
    save();
    list.append(messageNode(item));
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  };
  const setBusy = value => {
    busy = value;
    field.disabled = value;
    submit.disabled = value;
    form.toggleAttribute('aria-busy', value);
    root.classList.toggle('is-thinking', value);
    const existing = list.querySelector('.pymio-assistant-thinking');
    if (value && !existing) {
      const indicator = document.createElement('div');
      indicator.className = 'pymio-assistant-thinking';
      indicator.setAttribute('role', 'status');
      indicator.setAttribute('aria-label', 'Miel está preparando una respuesta');
      indicator.innerHTML = '<i></i><i></i><i></i>';
      list.append(indicator);
      list.scrollTop = list.scrollHeight;
    } else if (!value) existing?.remove();
  };
  const open = () => {
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => { root.classList.add('is-open'); field.focus(); list.scrollTop = list.scrollHeight; });
  };
  const close = () => {
    root.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => { if (!root.classList.contains('is-open')) panel.hidden = true; }, 180);
    trigger.focus({ preventScroll: true });
  };

  trigger.addEventListener('click', () => root.classList.contains('is-open') ? close() : open());
  closeButton.addEventListener('click', close);
  resetButton.addEventListener('click', () => {
    if (busy) return;
    messages = [greeting];
    save();
    render();
    field.focus();
  });
  field.addEventListener('input', () => {
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 120)}px`;
  });
  field.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root.classList.contains('is-open')) close();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const question = field.value.trim();
    if (!question || busy) return;
    append({ role: 'user', content: question });
    field.value = '';
    field.style.height = '';
    setBusy(true);
    try {
      const history = messages.filter(item => ['user', 'assistant'].includes(item.role)).slice(-8).map(({ role, content }) => ({ role, content }));
      const response = await fetch(`${apiUrl}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 404
        ? 'Miel estará disponible cuando esta versión se publique en Cloudflare.'
        : result.error || 'No pudimos consultar al asistente.');
      append({ role: 'assistant', content: result.answer, supportRecommended: result.supportRecommended === true });
    } catch (error) {
      append({
        role: 'assistant',
        content: error.message || 'Miel no está disponible en este momento.',
        supportRecommended: true
      });
    } finally {
      setBusy(false);
      field.focus();
    }
  });

  render();
}
