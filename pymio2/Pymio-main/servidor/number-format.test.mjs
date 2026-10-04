import test from 'node:test';
import assert from 'node:assert/strict';
import { formatInteger, parseFormattedInteger, configureIntegerInput } from '../number-format.js';

test('Formato numérico: agrega separadores de miles y recupera el entero', () => {
  assert.equal(formatInteger('20000'), '20.000');
  assert.equal(formatInteger('123456789'), '123.456.789');
  assert.equal(parseFormattedInteger('123.456.789'), 123456789);
  assert.ok(Number.isNaN(parseFormattedInteger('')));
});

test('Formato numérico: actualiza el campo mientras el usuario escribe', () => {
  const listeners = {};
  const input = {
    value: '', required: true, selectionStart: 5,
    addEventListener(type, handler) { listeners[type] = handler; },
    setCustomValidity(message) { this.validationMessage = message; },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  };
  const controller = configureIntegerInput(input, { min: 1 });
  input.value = '20000';
  listeners.input();
  assert.equal(input.value, '20.000');
  assert.equal(controller.get(), 20000);
  controller.set(3500000);
  assert.equal(input.value, '3.500.000');
});
