"""Recheck color after optical-flow synthesis and repack generated RGBA pages."""
import json
import hashlib
import sys
import argparse
from pathlib import Path
import numpy as np
from PIL import Image
import importlib.util
spec = importlib.util.spec_from_file_location('motion_build', Path(__file__).with_name('build-hq-motion.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
stable_color, ROOT, OUTPUT, REPORT = module.stable_color, module.ROOT, module.OUTPUT, module.REPORT

manifest = json.loads((OUTPUT / 'manifest.json').read_text())
manifest['encoding'] = 'lossless-webp'
targets = json.loads((ROOT / 'renderer-modules/desktop-frame-colors.json').read_text())['target']
parser = argparse.ArgumentParser()
parser.add_argument('--repack-only', action='store_true')
parser.add_argument('--settle', action='store_true')
parser.add_argument('--clips', nargs='*')
args = parser.parse_args()
existing = REPORT / 'final-assets.json'
records = json.loads(existing.read_text())['sheets'] if existing.exists() else {}
for name, spec in manifest['sheets'].items():
    if args.clips and name not in args.clips:
        continue
    page = Image.new('RGBA', (2048, 2048))
    samples = []
    for index in range(spec['count']):
        file = REPORT / 'frames' / name / f'{index:04d}.png'
        rgba = np.array(Image.open(file).convert('RGBA'))
        original_alpha = rgba[:, :, 3].copy()
        if not args.repack_only:
            for iteration in range(6 if args.settle else 1):
                rgba = stable_color(rgba, targets)
                rgb = rgba[:, :, :3].astype(np.float32)
                r, g, b = rgb.transpose(2, 0, 1)
                pink = (rgba[:, :, 3] >= 250) & (r - g > 25) & (np.abs(g - b) < 15) & (r > 150) & (g > 85)
                if np.max(np.abs(np.median(rgb[pink], axis=0) - targets['pink'])) <= .5:
                    break
        assert np.array_equal(original_alpha, rgba[:, :, 3])
        image = Image.fromarray(rgba)
        if not args.repack_only:
            image.save(file, compress_level=2)
        slot = index % 16
        page.paste(image, (slot % 4 * 512, slot // 4 * 512))
        r, g, b = rgba[:, :, :3].astype(np.float32).transpose(2, 0, 1)
        mask = (rgba[:, :, 3] >= 250) & (g - b > 35) & (r - g > 16) & (r > 125)
        samples.append(np.median(rgba[:, :, :3][mask], axis=0).tolist())
        if slot == 15 or index == spec['count'] - 1:
            page.save(OUTPUT / spec['pages'][index // 16], 'WEBP', lossless=True, method=4, exact=True)
            page = Image.new('RGBA', (2048, 2048))
    records[name] = {'count': spec['count'], 'goldMedians': samples, 'pages': [{'file': file, 'bytes': (OUTPUT / file).stat().st_size, 'sha256': hashlib.sha256((OUTPUT / file).read_bytes()).hexdigest()} for file in spec['pages']]}
    print(name, spec['count'], flush=True)
(OUTPUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(REPORT / 'final-assets.json').write_text(json.dumps({'colorPassAfterInterpolation': True, 'alphaPreserved': True, 'encoding': 'lossless-webp', 'sheets': records}, indent=2) + '\n')
