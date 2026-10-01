import { revealView } from './motion.js';
import { setupPymium } from './pymium.js';
setupPymium();
import { iniciarEcosistema } from './ecosistema.js';
import { setupOfflineUI, startOffline, stopOffline } from './offline.js';
setupOfflineUI();
import { renderDashboard, renderInicio } from './dashboard.js?v=43';
import { renderAlerts } from './diagnostico.js';
import { iniciarMovimientos } from './movimientos.js';

// Inserta las vistas antes de iniciar sus controladores. Conserva el DOM al volver a entrar.
let seccionesCargadas = false;
async function cargarSecciones() {
  if (seccionesCargadas) return;
  const vistas = await Promise.all(['inicio', 'dashboard', 'movimientos', 'inventario', 'diagnostico', 'ecosistema'].map(async nombre => {
    const respuesta = await fetch(new URL(nombre + '.html', import.meta.url));
    if (!respuesta.ok) throw new Error(nombre + ': HTTP ' + respuesta.status);
    return { nombre, html: await respuesta.text() };
  }));
  for (const vista of vistas) {
    document.querySelector('[data-section="' + vista.nombre + '"]').outerHTML = vista.html;
  }
  document.querySelectorAll('.filter-menu').forEach(menu => {
    const button = menu.querySelector('[data-filter-toggle]');
    const options = menu.querySelector('.filter-options');
    const close = () => { options.hidden = true; button.setAttribute('aria-expanded', 'false'); };
    button.addEventListener('click', () => {
      options.hidden = !options.hidden;
      button.setAttribute('aria-expanded', String(!options.hidden));
    });
    document.addEventListener('click', event => { if (!menu.contains(event.target)) close(); });
    menu.addEventListener('keydown', event => { if (event.key === 'Escape') { close(); button.focus(); } });
  });
  seccionesCargadas = true;
}


  
  // ---------- DATOS FICTICIOS ----------

  const notifData = [
    {sev:'critical', title:'Margen en descenso', desc:'La categoría Hogar bajó su margen a 19% este mes.', time:'Hace 2 horas'},
    {sev:'warn', title:'Stock bajo', desc:'"Organizador modular x6" quedó con solo 4 unidades.', time:'Hace 5 horas'},
  ];

  // ---------- LOGIN ----------
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value;
    if(u === 'pilotodepruebas' && p === 'consultoriaswc'){
      const submit = loginForm.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      loginError.style.display = 'none';
      try {
        await cargarSecciones();
      } catch (error) {
        console.error('No se pudieron cargar las secciones:', error);
        loginError.textContent = 'No se pudieron cargar las secciones. Comprueba la conexión e inténtalo nuevamente.';
        loginError.style.display = 'block';
        return;
      } finally {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
      }
      const Id = 1;
      startOffline(Id);
      iniciarMovimientos({ companyId: Id });
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app-screen').style.display = 'block';
      document.querySelector('.skip-link').href = '#main-content';
      initApp();
      navigateTo('inicio');
      revealView(document.querySelector('.tab-panel.active'), {first:true});

      import('./inventario.js').then(({ iniciarInventario }) => {
        return iniciarInventario({ companyId: Id });
      }).catch(error => {
        console.error('No se pudo iniciar el inventario:', error);
        const tabla = document.getElementById('inv-table');
        tabla.replaceChildren();
        const celda = tabla.insertRow().insertCell();
        celda.colSpan = 10;
        celda.textContent = 'No se pudo iniciar el inventario. Recarga la página e inténtalo nuevamente.';
      });
    } else {
      loginError.textContent = 'Usuario o contraseña incorrectos. Inténtalo de nuevo.';
      loginError.style.display = 'block';
    }
  });



  document.getElementById('logout-btn').addEventListener('click', () => {
    stopOffline();
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    loginForm.reset();
    document.querySelector('.skip-link').href = '#login-form';
    loginError.style.display = 'none';
  });

  // ---------- NAV TABS ----------
  const tabTitles = {inicio:'Inicio', dashboard:'Dashboard', diagnostico:'Diagnóstico', movimientos:'Movimientos', inventario:'Inventario', ecosistema:'RED Pymio'};
  function navigateTo(name, keyboard = false, focus = false) {
    const panel = document.getElementById('tab-' + name);
    if (!panel) return;
    if (name === 'inicio') renderInicio();
    const changed = !panel.classList.contains('active');
    document.querySelectorAll('.nav-item').forEach(button => {
      const selected = button.dataset.tab === name;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('.tab-panel').forEach(view => view.classList.toggle('active', view === panel));
    document.getElementById('page-title').textContent = tabTitles[name];
    if (changed) {
      document.querySelector('.content').scrollTo({top:0, behavior:'instant'});
      revealView(panel, {keyboard});
    }
    if (focus) {
      panel.tabIndex = -1;
      panel.focus({preventScroll:true});
    }
  }
  document.querySelectorAll('.nav-item').forEach(button => {
    button.setAttribute('aria-label', button.textContent.trim());
    button.title = button.textContent.trim();
    if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', event => navigateTo(button.dataset.tab, event.detail === 0));
  });
  document.querySelector('.sidebar-home').addEventListener('click', event => navigateTo('inicio', event.detail === 0, true));
  document.querySelector('.content').addEventListener('click', event => {
    const movement = event.target.closest('[data-start-movement]');
    if (movement) {
      navigateTo('movimientos', event.detail === 0);
      document.querySelector(movement.dataset.startMovement === 'sale' ? '[data-sale-add]' : '[data-purchase-add]').click();
      return;
    }
    const button = event.target.closest('[data-go-tab]');
    if (button) navigateTo(button.dataset.goTab, event.detail === 0, true);
  });

  // ---------- NOTIFICATIONS ----------
  const bellBtn = document.getElementById('bell-btn');
  const notifPanel = document.getElementById('notif-panel');
  const notifBadge = document.getElementById('notif-badge');
  let unread = notifData.length;
  bellBtn.setAttribute('aria-expanded', 'false');
  bellBtn.setAttribute('aria-controls', 'notif-panel');

  function renderNotifications(){
    const list = document.getElementById('notif-list');
    list.innerHTML = notifData.map((n, i) => `
      <div class="notif-item ${i >= unread ? 'read' : ''}">
        <div class="dot ${n.sev}"></div>
        <div>
          <div class="n-title">${n.title}</div>
          <div class="n-desc">${n.desc}</div>
          <div class="n-time">${n.time}</div>
        </div>
      </div>
    `).join('');
    notifBadge.style.display = unread > 0 ? 'flex' : 'none';
    notifBadge.textContent = unread;
  }

  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notifPanel.classList.toggle('open');
    bellBtn.setAttribute('aria-expanded', String(notifPanel.classList.contains('open')));
  });
  document.addEventListener('click', (e) => {
    if(!notifPanel.contains(e.target) && e.target !== bellBtn){
      notifPanel.classList.remove('open');
      bellBtn.setAttribute('aria-expanded', 'false');
    }
  });
  document.getElementById('mark-read-btn').addEventListener('click', () => {
    unread = 0;
    renderNotifications();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && notifPanel.classList.contains('open')) {
      notifPanel.classList.remove('open');
      bellBtn.setAttribute('aria-expanded', 'false');
      bellBtn.focus();
    }
  });

  // ---------- INIT ----------
  function initApp(){
    iniciarEcosistema();
    renderDashboard();
    renderInicio();
    renderAlerts();

    renderNotifications();
  }
