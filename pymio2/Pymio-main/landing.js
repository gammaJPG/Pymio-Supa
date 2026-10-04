document.documentElement.classList.add('js');

const menuButton = document.querySelector('[data-menu-toggle]');
const menu = document.querySelector('[data-menu]');

function closeMenu() {
  if (!menuButton || !menu) return;
  menuButton.setAttribute('aria-expanded', 'false');
  menu.classList.remove('is-open');
  document.body.classList.remove('menu-open');
}

menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  menu?.classList.toggle('is-open', open);
  document.body.classList.toggle('menu-open', open);
});

menu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealItems = [...document.querySelectorAll('.reveal')];
const motionScenes = [...document.querySelectorAll('[data-motion-scene]')];

if (reducedMotion || !('IntersectionObserver' in window)) {
  revealItems.forEach((item) => item.classList.add('is-visible'));
  motionScenes.forEach((scene) => scene.classList.add('is-motion-active'));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  revealItems.forEach((item) => observer.observe(item));

  const motionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle('is-motion-active', entry.isIntersecting);
    });
  }, { threshold: 0.06, rootMargin: '8% 0px 8% 0px' });
  motionScenes.forEach((scene) => motionObserver.observe(scene));
}

const header = document.querySelector('[data-header]');
const setHeaderState = () => header?.classList.toggle('is-scrolled', window.scrollY > 12);
setHeaderState();
window.addEventListener('scroll', setHeaderState, { passive: true });

const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());
