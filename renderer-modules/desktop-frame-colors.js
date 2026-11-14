import calibration from './desktop-frame-colors.json' with { type: 'json' };

const smooth = (value, low, high) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

function channelMap(pivot, target) {
  // Anchor black and white, move the material midtone. Avoid clipping fur
  // highlights or flattening the shadows with a uniform brightness offset.
  return Float32Array.from({ length: 256 }, (_, value) => value <= pivot
    ? value * target / pivot
    : target + (value - pivot) * (255 - target) / (255 - pivot));
}

const lookups = new Map();
export function correctFramePixels(pixels, width, frameWidth, frameHeight, name, rowStart = 0, rowEnd = frameHeight * 4) {
  const frames = calibration.sheets[name];
  if (!frames) return;
  if (!lookups.has(name)) lookups.set(name, frames.map(frame => Object.fromEntries(['gold', 'pink'].map(material => [material,
    frame[material].map((pivot, channel) => channelMap(pivot, calibration.target[material][channel]))
  ]))));
  const maps = lookups.get(name);
  for (let y = rowStart; y < rowEnd; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    if (!pixels[offset + 3]) continue;
    const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
    const gold = smooth(g - b, 15, 35) * smooth(r - g, 5, 16) * smooth(r, 80, 125);
    const pink = (1 - gold) * smooth(r - g, 15, 25) * (1 - smooth(Math.abs(g - b), 15, 30)) * smooth(r, 110, 150) * smooth(g, 60, 85);
    if (gold + pink < .001) continue;
    const map = maps[Math.floor(y / frameHeight) * 6 + Math.floor(x / frameWidth)];
    for (let channel = 0; channel < 3; channel++) {
      const value = pixels[offset + channel];
      pixels[offset + channel] = Math.round(value + (map.gold[channel][value] - value) * gold + (map.pink[channel][value] - value) * pink);
    }
  }
}

// Process each decoded atlas once, outside the drawing loop. Yield between
// atlas rows so a first-time action load cannot monopolize the UI thread.
export async function prepareDesktopSheet(image, name) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const frameWidth = canvas.width / 6, frameHeight = canvas.height / 4;
  for (let row = 0; row < 4; row++) {
    correctFramePixels(data.data, canvas.width, frameWidth, frameHeight, name, row * frameHeight, (row + 1) * frameHeight);
    if (row < 3) await new Promise(resolve => setTimeout(resolve, 0));
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}
