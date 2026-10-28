const escapeStorageMessages = value => Array.isArray(value)
  ? value.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-40)
  : [];

export function setupPymioAssistant({ apiUrl = '', session } = {}) {
  if (!session || document.querySelector('[data-pymio-assistant]')) return;

  const storageKey = `pymio:assistant:${session.demo ? 'demo' : session.companyId}`;
  const legacyAssistantName = String.fromCharCode(77, 105, 101, 108);
  const greeting = {
    role: 'assistant',
    content: 'Hola, soy PymBot. Puedo orientarte sobre ventas, inventario, indicadores, RED Pymio y el uso de la plataforma. ¿Qué necesitas hacer?'
  };
  let messages;
  try {
    messages = escapeStorageMessages(JSON.parse(localStorage.getItem(storageKey) || '[]')).map(item => item.role === 'assistant'
      ? { ...item, content: item.content.replaceAll(legacyAssistantName, 'PymBot') }
      : item);
  }
  catch { messages = []; }
  if (!messages.length) messages = [greeting];

  const root = document.createElement('section');
  root.className = 'pymio-assistant';
  root.dataset.pymioAssistant = '';
  root.innerHTML = `
    <aside class="pymio-assistant-panel" id="pymio-assistant-panel" aria-label="Asistente de Pymio" aria-hidden="true" hidden>
      <header class="pymio-assistant-head">
        <span class="pymio-assistant-avatar" aria-hidden="true"><img src="assets/pymio-icon-transparent.png" alt=""></span>
        <div><span>Asistente de Pymio</span><strong>PymBot</strong></div>
        <button type="button" class="pymio-assistant-reset" aria-label="Borrar conversación" title="Borrar conversación">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg>
        </button>
        <button type="button" class="pymio-assistant-close" aria-label="Cerrar asistente">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </header>
      <div class="pymio-assistant-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
      <form class="pymio-assistant-compose">
        <label><span class="sr-only">Pregunta para PymBot</span><textarea rows="1" maxlength="1200" required placeholder="Pregunta sobre Pymio…"></textarea></label>
        <button type="submit" aria-label="Enviar pregunta">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 16-8-5.5 16-3-6.5L4 12Zm7.5 1.5L20 4"/></svg>
        </button>
      </form>
      <p class="pymio-assistant-note">PymBot puede equivocarse. No compartas información sensible.</p>
    </aside>
    <button type="button" class="pymio-assistant-trigger" aria-controls="pymio-assistant-panel" aria-expanded="false">
      <img src="assets/pymio-icon-transparent.png" alt="">
      <span>Pregúntale a PymBot</span>
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
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let busy = false;
  let thinkingStartedAt = 0;

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
  const messageNode = (item, { includeSupport = true } = {}) => {
    const article = document.createElement('article');
    article.className = `pymio-assistant-message ${item.role}`;
    const label = document.createElement('strong');
    label.textContent = item.role === 'assistant' ? 'PymBot' : 'Tú';
    const copy = document.createElement('p');
    copy.textContent = item.content;
    article.append(label, copy);
    if (includeSupport && item.supportRecommended) article.append(supportButton());
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
  const setThinking = value => {
    root.classList.toggle('is-thinking', value);
    const existing = list.querySelector('.pymio-assistant-thinking');
    if (value && !existing) {
      thinkingStartedAt = performance.now();
      const indicator = document.createElement('div');
      indicator.className = 'pymio-assistant-thinking';
      indicator.setAttribute('role', 'status');
      indicator.setAttribute('aria-label', 'PymBot está escribiendo');
      indicator.innerHTML = '<span>PymBot está escribiendo</span><span class="pymio-assistant-thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
      list.append(indicator);
      list.scrollTop = list.scrollHeight;
    } else if (!value) existing?.remove();
  };
  const setBusy = value => {
    busy = value;
    field.disabled = value;
    submit.disabled = value;
    form.toggleAttribute('aria-busy', value);
    if (value) setThinking(true);
    else setThinking(false);
  };
  const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
  const appendAnimatedAssistant = async item => {
    messages.push(item);
    messages = messages.slice(-40);
    save();
    const article = messageNode(item, { includeSupport: false });
    const copy = article.querySelector('p');
    const content = String(item.content || '');
    copy.textContent = '';
    copy.setAttribute('aria-hidden', 'true');
    list.append(article);
    list.scrollTop = list.scrollHeight;

    if (reduceMotion.matches || content.length < 2) copy.textContent = content;
    else {
      const duration = Math.min(3200, Math.max(650, content.length * 14));
      const startedAt = performance.now();
      await new Promise(resolve => {
        const typeNext = now => {
          const progress = Math.min(1, (now - startedAt) / duration);
          const visibleCharacters = Math.max(1, Math.floor(content.length * progress));
          copy.textContent = content.slice(0, visibleCharacters);
          list.scrollTop = list.scrollHeight;
          if (progress < 1) requestAnimationFrame(typeNext);
          else resolve();
        };
        requestAnimationFrame(typeNext);
      });
    }

    copy.removeAttribute('aria-hidden');
    if (item.supportRecommended) article.append(supportButton());
    list.scrollTop = list.scrollHeight;
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
    let reply;
    try {
      const history = messages.filter(item => ['user', 'assistant'].includes(item.role)).slice(-8).map(({ role, content }) => ({ role, content }));
      const response = await fetch(`${apiUrl}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 404
        ? 'PymBot estará disponible cuando esta versión se publique en Cloudflare.'
        : result.error || 'No pudimos consultar al asistente.');
      reply = { role: 'assistant', content: result.answer, supportRecommended: result.supportRecommended === true };
    } catch (error) {
      reply = {
        role: 'assistant',
        content: error.message || 'PymBot no está disponible en este momento.',
        supportRecommended: true
      };
    }
    try {
      await wait(Math.max(0, 700 - (performance.now() - thinkingStartedAt)));
      setThinking(false);
      await appendAnimatedAssistant(reply);
    } finally {
      setBusy(false);
      field.focus();
    }
  });

  render();
}
