const applied = new WeakMap();
const accentPattern = /^#[0-9a-f]{6}$/i;
const parse = value => [1, 3, 5].map(start => Number.parseInt(value.slice(start, start + 2), 16));
const hex = color => '#' + color.map(value => value.toString(16).padStart(2, '0')).join('');
const mix = (a, b, amount) => a.map((value, index) => Math.round(value + (b[index] - value) * amount));
const linear = value => value <= 10 ? value / (255 * 12.92) : ((value / 255 + .055) / 1.055) ** 2.4;
const luminance = ([red, green, blue]) => .2126 * linear(red) + .7152 * linear(green) + .0722 * linear(blue);
function contrast(a, b) {
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

export function readableSystemAccent(value, dark) {
  if (!accentPattern.test(value || '')) return '';
  const color = parse(value);
  const backdrop = parse(dark ? '#1c1f26' : '#ffffff');
  const soft = parse(dark ? '#252a34' : '#edf0f3');
  const ink = parse(dark ? '#ffffff' : '#000000');
  for (let step = 0; step <= 20; step++) {
    const candidate = mix(color, ink, step / 20);
    const selected = mix(backdrop, candidate, .12);
    if ([backdrop, soft, selected].every(background => contrast(candidate, background) >= 4.5)) return hex(candidate);
  }
  return hex(ink);
}

export function applyAppearance(data, mode, root = document.documentElement) {
  const dark = mode === 'dark' || mode === 'system' && Boolean(data.dark);
  const source = mode === 'system' ? data.accent : null;
  const previous = applied.get(root);
  if (previous?.dark === dark && previous.source === source) return dark;
  applied.set(root, { dark, source });
  const accent = readableSystemAccent(source, dark);
  root.classList.toggle('dark', dark);
  root.classList.toggle('system-accent', Boolean(accent));
  if (accent) {
    root.style.setProperty('--system-accent', accent);
    root.style.setProperty('--minute-shade', accent + '33');
    root.style.setProperty('--minute-shade-end', accent + '05');
  } else {
    for (const variable of ['--system-accent', '--minute-shade', '--minute-shade-end']) root.style.removeProperty(variable);
  }
  return dark;
}
