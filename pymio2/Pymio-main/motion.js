// Short, interruptible entrances. Never delay keyboard navigation or data updates.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const running = new Set();
let input = 'pointer';
document.addEventListener('keydown', () => {
  input = 'keyboard';
  document.documentElement.dataset.input = input;
  for (const animation of running) animation.cancel();
  running.clear();
}, {capture:true});
document.addEventListener('pointerdown', () => {
  input = 'pointer';
  document.documentElement.dataset.input = input;
}, {capture:true, passive:true});
reducedMotion.addEventListener('change', () => {
  for (const animation of running) animation.cancel();
  running.clear();
});

function enter(element, delay = 0) {
  if (!element?.animate) return;
  element.getAnimations().forEach(animation => animation.cancel());
  const frames = reducedMotion.matches
    ? [{opacity:0.65}, {opacity:1}]
    : [{opacity:0, transform:'translateY(8px)'}, {opacity:1, transform:'translateY(0)'}];
  const animation = element.animate(frames, {
    duration:reducedMotion.matches ? 100 : 330,
    delay:reducedMotion.matches ? 0 : delay,
    easing:'cubic-bezier(0.23, 1, 0.32, 1)',
    fill:'backwards'
  });
  running.add(animation);
  animation.finished.catch(() => {}).finally(() => running.delete(animation));
}

export function revealView(panel, {keyboard = input === 'keyboard', first = false} = {}) {
  for (const animation of running) animation.cancel();
  running.clear();
  if (!panel || keyboard) return;
  if (first) {
    // The initial overview earns a little delight; repeated navigation stays subtle.
    const parts = [...panel.children].filter(el => !el.hidden).slice(0, 3);
    parts.forEach((element, index) => enter(element, index * 65));
  } else enter(panel);
}
