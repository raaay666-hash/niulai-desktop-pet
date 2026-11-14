import json
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
folder = root / 'assets/2d/frames/hq'
manifest = json.loads((folder / 'manifest.json').read_text())
targets = json.loads((root / 'renderer-modules/desktop-frame-colors.json').read_text())['target']
results = {}
for name, spec in manifest['sheets'].items():
    samples = []
    for page_index, filename in enumerate(spec['pages']):
        image = Image.open(folder / filename).convert('RGBA')
        assert image.size == (2048, 2048)
        pixels = np.asarray(image)
        for slot in range(min(16, spec['count'] - page_index * 16)):
            y, x = slot // 4 * 512, slot % 4 * 512
            frame = pixels[y:y + 512, x:x + 512]
            r, g, b = frame[:, :, :3].astype(np.float32).transpose(2, 0, 1)
            a = frame[:, :, 3]
            gold = (a >= 250) & (g - b > 35) & (r - g > 16) & (r > 125)
            pink = (a >= 250) & (r - g > 25) & (np.abs(g - b) < 15) & (r > 150) & (g > 85)
            color = {key: np.median(frame[:, :, :3][mask], axis=0).tolist() for key, mask in [('gold', gold), ('pink', pink)]}
            area = float(np.mean(a > 128))
            assert .12 < area < .9, (name, slot, area)
            assert int(a[:8, :8].max()) < 10 and int(a[:8, -8:].max()) < 10, (name, slot, 'opaque corners')
            samples.append({'colors': color, 'opaqueArea': area})
    jumps = {key: max(float(np.linalg.norm(np.array(frame['colors'][key]) - np.array(samples[(index - 1) % len(samples)]['colors'][key]))) for index, frame in enumerate(samples)) for key in ['gold', 'pink']}
    results[name] = {'frames': len(samples), 'maximumMedianRgbJump': jumps, 'areaRange': [min(s['opaqueArea'] for s in samples), max(s['opaqueArea'] for s in samples)]}
    print(name, results[name], flush=True)
assert all(s['maximumMedianRgbJump']['gold'] <= 5 and s['maximumMedianRgbJump']['pink'] <= 5 for s in results.values()), results
(root / 'outputs/desktop-hq-20261113/asset-audit.json').write_text(json.dumps({'passed': True, 'scope': 'Every final compressed HQ frame: material color medians, opaque-area bounds and transparent corners; median color distance is not perceptual Delta E.', 'sheets': results}, indent=2) + '\n')
