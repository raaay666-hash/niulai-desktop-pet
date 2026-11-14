"""Create lossless, paged 384px mobile frames from the verified desktop master."""
from pathlib import Path
from PIL import Image
import json, hashlib
root = Path(__file__).resolve().parents[1]
source = root / 'assets/2d/frames/hq'
target = root / 'assets/2d/frames/mobile-hq'
target.mkdir(exist_ok=True)
manifest = json.loads((source / 'manifest.json').read_text())
manifest['frameSize'] = 384
records = []
for file in sorted(source.glob('*.webp')):
    with Image.open(file) as im:
        im.resize((1536, 1536), Image.Resampling.LANCZOS).save(target / file.name, lossless=True, method=4)
    data = (target / file.name).read_bytes()
    records.append({'file': file.name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    print(file.name, len(data), flush=True)
(target / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf8')
out = root / 'outputs/polish-20261113'
out.mkdir(exist_ok=True)
(out / 'mobile-assets.json').write_text(json.dumps({'frameSize':384,'lossless':True,'pages':records}, indent=2), encoding='utf8')
