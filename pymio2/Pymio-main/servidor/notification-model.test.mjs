import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyNotificationId,notificationDayKey,notificationDaySortTime,notificationTimestamp,orderNotifications} from '../notification-model.js';

test('Notificaciones: el día se calcula en Chile y no según UTC',()=>{
  const beforeMidnight=new Date('2026-10-31T02:59:59Z');
  const afterMidnight=new Date('2026-10-31T03:00:00Z');
  assert.equal(notificationDayKey(beforeMidnight),'2026-10-30');
  assert.equal(notificationDayKey(afterMidnight),'2026-10-31');
  assert.notEqual(dailyNotificationId('stock-7',beforeMidnight),dailyNotificationId('stock-7',afterMidnight));
});

test('Notificaciones: el cambio de horario de Chile no altera la clave diaria',()=>{
  assert.equal(notificationDayKey(new Date('2026-04-05T03:30:00Z')),'2026-04-04');
  assert.equal(notificationDayKey(new Date('2026-04-05T04:30:00Z')),'2026-04-05');
  assert.match(notificationDaySortTime(new Date('2026-04-05T04:30:00Z')),/^2026-04-05T00:00:00\.000Z$/);
});

test('Notificaciones: una alerta conserva identidad durante el día y reaparece al día siguiente',()=>{
  const morning=new Date('2026-10-30T12:00:00-03:00'),night=new Date('2026-10-30T23:59:00-03:00'),tomorrow=new Date('2026-10-31T08:00:00-03:00');
  assert.equal(dailyNotificationId('receivable-a',morning),dailyNotificationId('receivable-a',night));
  assert.notEqual(dailyNotificationId('receivable-a',morning),dailyNotificationId('receivable-a',tomorrow));
});

test('Notificaciones: mezcla fuentes por fecha sin mover elementos al refrescar',()=>{
  const inventory={id:'inventory-1',sortAt:'2026-10-30T10:00:00Z'},network={id:'network-1',created_at:'2026-10-30T12:00:00Z'},support={id:'support-1',createdAt:'2026-10-30T11:00:00Z'};
  assert.deepEqual(orderNotifications([inventory],[network],[support]).map(item=>item.id),['network-1','support-1','inventory-1']);
  assert.deepEqual(orderNotifications([support],[inventory],[network]).map(item=>item.id),['network-1','support-1','inventory-1']);
});

test('Notificaciones: elimina duplicados y conserva la aparición más reciente',()=>{
  const old={id:'same',sortAt:'2026-10-29T10:00:00Z',title:'Anterior'},recent={id:'same',sortAt:'2026-10-30T10:00:00Z',title:'Actual'};
  const result=orderNotifications([old],[recent]);
  assert.equal(result.length,1);assert.equal(result[0].title,'Actual');
});

test('Notificaciones: fechas inválidas quedan al final y los IDs con milisegundos siguen ordenando',()=>{
  assert.equal(notificationTimestamp({id:'movement-1793350800000-x'}),1793350800000);
  assert.deepEqual(orderNotifications([{id:'sin-fecha'},{id:'movement-1793350800000-x'}]).map(item=>item.id),['movement-1793350800000-x','sin-fecha']);
});
