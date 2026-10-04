const integerFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

const digitsOnly = value => String(value ?? '').replace(/\D/g, '');

export function parseFormattedInteger(value) {
  const digits = digitsOnly(value);
  return digits ? Number(digits) : Number.NaN;
}

export function formatInteger(value) {
  const digits = digitsOnly(value).replace(/^0+(?=\d)/, '');
  return digits ? integerFormatter.format(Number(digits)) : '';
}

export function configureIntegerInput(input, { min = 0, max = 2147483647 } = {}) {
  if (!input) return null;
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';

  const validate = () => {
    const value = parseFormattedInteger(input.value);
    const message = Number.isNaN(value)
      ? (input.required ? 'Ingresa un número entero.' : '')
      : value < min || value > max
        ? `Ingresa un valor entre ${formatInteger(min)} y ${formatInteger(max)}.`
        : '';
    input.setCustomValidity(message);
    return value;
  };
  const set = value => {
    input.value = value === '' || value == null ? '' : formatInteger(value);
    validate();
  };
  const onInput = () => {
    const start = input.selectionStart ?? input.value.length;
    const digitsBeforeCaret = digitsOnly(input.value.slice(0, start)).length;
    input.value = formatInteger(input.value);
    let caret = 0, seen = 0;
    while (caret < input.value.length && seen < digitsBeforeCaret) {
      if (/\d/.test(input.value[caret])) seen++;
      caret++;
    }
    input.setSelectionRange?.(caret, caret);
    validate();
  };
  input.addEventListener('input', onInput);
  input.addEventListener('blur', () => set(input.value));
  set(input.value);
  return { get: () => validate(), set };
}
