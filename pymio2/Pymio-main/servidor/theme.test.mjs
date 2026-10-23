import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Tema: landing, acceso y plataforma comparten un selector persistente',async()=>{
  const [script,styles,landing,platform,worker]=await Promise.all([
    readFile(new URL('../theme.js',import.meta.url),'utf8'),
    readFile(new URL('../theme.css',import.meta.url),'utf8'),
    readFile(new URL('../index.html',import.meta.url),'utf8'),
    readFile(new URL('../piloto.html',import.meta.url),'utf8'),
    readFile(new URL('../sw.js',import.meta.url),'utf8'),
  ]);
  assert.match(script,/pymio:theme/);assert.match(script,/savedTheme\(\) \|\| 'light'/);
  assert.doesNotMatch(script,/prefers-color-scheme: dark/);
  assert.match(script,/Cambiar a modo claro/);assert.match(script,/Cambiar a modo oscuro/);
  assert.match(script,/theme-toggle--login/);assert.match(script,/theme-toggle--app/);
  assert.match(platform,/id="password-toggle"/);assert.match(platform,/aria-label="Mostrar contraseña"/);
  assert.match(await readFile(new URL('../app.js',import.meta.url),'utf8'),/setPasswordVisibility/);
  assert.match(styles,/html\[data-theme=dark\]/);assert.match(styles,/prefers-reduced-motion:reduce/);
  for(const html of [landing,platform]){assert.match(html,/theme\.js\?v=2/);assert.match(html,/theme\.css\?v=4/);}
  assert.match(worker,/theme\.css/);assert.match(worker,/theme\.js/);
});

test('Móvil: permite actualizar al arrastrar desde el límite superior',async()=>{
  const mobile=await readFile(new URL('../mobile.css',import.meta.url),'utf8');
  assert.match(mobile,/html\{[^}]*overscroll-behavior-x:none;overscroll-behavior-y:auto/);
  assert.match(mobile,/body\{[^}]*overscroll-behavior-x:none;overscroll-behavior-y:auto/);
  assert.match(mobile,/\.content\{[^}]*overscroll-behavior-x:none;overscroll-behavior-y:auto/);
  assert.match(mobile,/\.mobile-sheet\{[^}]*overscroll-behavior:contain/);
});
