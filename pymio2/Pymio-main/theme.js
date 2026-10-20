(() => {
  const storageKey = 'pymio:theme';
  const root = document.documentElement;
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)');
  const savedTheme = () => {
    try {
      const value = localStorage.getItem(storageKey);
      return value === 'light' || value === 'dark' ? value : null;
    } catch { return null; }
  };
  const preferredTheme = () => savedTheme() || (systemDark?.matches ? 'dark' : 'light');
  function updateControls(theme) {
    const dark = theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      button.title = dark ? 'Modo claro' : 'Modo oscuro';
    });
  }
  function applyTheme(theme, persist = false) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => { meta.content = theme === 'dark' ? '#141812' : '#f7f6ef'; });
    if (persist) try { localStorage.setItem(storageKey, theme); } catch { /* Storage may be unavailable. */ }
    updateControls(theme);
  }
  function themeButton(extraClass = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `theme-toggle ${extraClass}`.trim();
    button.dataset.themeToggle = '';
    button.innerHTML = `<svg class="theme-toggle__moon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20.2 15.2A8.8 8.8 0 0 1 8.8 3.8 9 9 0 1 0 20.2 15.2Z"/></svg><svg class="theme-toggle__sun" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6m11 11 1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6m11-11 1.6-1.6"/></svg>`;
    button.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
    return button;
  }
  applyTheme(preferredTheme());
  const mountControls = () => {
    const navActions = document.querySelector('.site-header .nav-actions');
    if (navActions && !navActions.querySelector('[data-theme-toggle]')) navActions.prepend(themeButton('theme-toggle--landing'));
    const menuToggle = document.querySelector('.site-header [data-menu-toggle]');
    if (menuToggle && !document.querySelector('.theme-toggle--landing-mobile')) menuToggle.before(themeButton('theme-toggle--landing-mobile'));
    const login = document.getElementById('login-screen');
    if (login && !login.querySelector('.theme-toggle--login')) login.append(themeButton('theme-toggle--login'));
    const topbar = document.querySelector('#app-screen .topbar-right');
    if (topbar && !topbar.querySelector('[data-theme-toggle]')) topbar.prepend(themeButton('theme-toggle--app'));
    updateControls(root.dataset.theme || preferredTheme());
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountControls, { once: true });
  else mountControls();
  systemDark?.addEventListener?.('change', (event) => { if (!savedTheme()) applyTheme(event.matches ? 'dark' : 'light'); });
})();
