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
  assert.match(platform,/id="forgot-password-button"[^>]*>Olvidé mi contraseña/);assert.match(platform,/id="profile-current-password"/);assert.match(platform,/id="recovery-request-dialog"/);assert.match(platform,/id="recovery-reset-dialog"/);
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

test('Móvil: Inicio no muestra la leyenda de mes actual en curso',async()=>{
  const dashboard=await readFile(new URL('../dashboard.js',import.meta.url),'utf8');
  assert.match(dashboard,/mobileComparison='Mes anterior: '\+clp\(previous\.income\)/);
  assert.doesNotMatch(dashboard,/mobileComparison=.*Mes actual en curso/i);
});

test('Inicio: elimina la leyenda Espacio de demostración de la tarjeta inferior',async()=>{
  const home=await readFile(new URL('../inicio.html',import.meta.url),'utf8');
  assert.match(home,/class="home-network"/);
  assert.doesNotMatch(home,/Espacio de demostración/);
});

test('Notificaciones: abrir la campana limpia inmediatamente el contador de no leídas',async()=>{
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
  assert.match(app,/for\(const notification of currentNotifications\(\)\)if\(notification\.id!=null\)readNotificationIds\.add\(String\(notification\.id\)\)/);
  assert.match(app,/const unread=visible\.filter\(notification=>!readNotificationIds\.has\(String\(notification\.id\)\)\)\.length/);
  assert.match(app,/notifPanel\.classList\.add\('open'\);\s*bellBtn\.setAttribute\('aria-expanded','true'\);\s*markCurrentNotificationsRead\(\);\s*renderNotifications\(\)/);
});
