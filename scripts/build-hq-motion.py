"""Offline RGBA motion assets. RIFE warps premultiplied RGB and alpha together."""
import argparse
import hashlib
import importlib.util
import json
import math
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
import torch
from torch import nn
from torch.nn import functional as F

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / '.tools/animation-quality'
OUTPUT = ROOT / 'assets/2d/frames/hq'
REPORT = ROOT / 'outputs/desktop-hq-20261113'


class Dense(nn.Module):
    def __init__(self):
        super().__init__()
        for i in range(1, 6):
            setattr(self, f'conv{i}', nn.Conv2d(64 + (i - 1) * 32, 32 if i < 5 else 64, 3, 1, 1))
        self.lrelu = nn.LeakyReLU(.2, inplace=True)

    def forward(self, x):
        values = [x]
        for i in range(1, 5):
            values.append(self.lrelu(getattr(self, f'conv{i}')(torch.cat(values, 1))))
        return self.conv5(torch.cat(values, 1)) * .2 + x


class RRDB(nn.Module):
    def __init__(self):
        super().__init__()
        self.rdb1, self.rdb2, self.rdb3 = Dense(), Dense(), Dense()

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * .2 + x


class Upscaler(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv_first = nn.Conv2d(12, 64, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB() for _ in range(23)])
        self.conv_body = nn.Conv2d(64, 64, 3, 1, 1)
        self.conv_up1, self.conv_up2, self.conv_hr = [nn.Conv2d(64, 64, 3, 1, 1) for _ in range(3)]
        self.conv_last = nn.Conv2d(64, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(F.pixel_unshuffle(x, 2))
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def smooth(x, low, high):
    t = np.clip((x - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def stable_color(rgba, target):
    rgb = rgba[:, :, :3].astype(np.float32)
    r, g, b = rgb.transpose(2, 0, 1)
    opaque = rgba[:, :, 3] >= 250
    selectors = {'gold': opaque & (g - b > 35) & (r - g > 16) & (r > 125),
                 'pink': opaque & (r - g > 25) & (np.abs(g - b) < 15) & (r > 150) & (g > 85)}
    gold = smooth(g - b, 15, 35) * smooth(r - g, 5, 16) * smooth(r, 80, 125)
    pink = (1 - gold) * smooth(r - g, 15, 25) * (1 - smooth(np.abs(g - b), 15, 30)) * smooth(r, 110, 150) * smooth(g, 60, 85)
    result = rgb.copy()
    for material, weight in [('gold', gold), ('pink', pink)]:
        selected = rgb[selectors[material]]
        if len(selected) < 100:
            continue
        pivot = np.clip(np.median(selected, axis=0), 1, 254)
        goal = np.array(target[material], dtype=np.float32)
        mapped = np.where(rgb <= pivot, rgb * goal / pivot, goal + (rgb - pivot) * (255 - goal) / (255 - pivot))
        result += (mapped - rgb) * weight[:, :, None]
    return np.concatenate([np.round(np.clip(result, 0, 255)).astype(np.uint8), rgba[:, :, 3:4]], axis=2)


def tensor(array):
    return torch.from_numpy(np.ascontiguousarray(array.transpose(2, 0, 1))).unsqueeze(0).cuda().half()


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--clips', nargs='*')
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    REPORT.mkdir(parents=True, exist_ok=True)
    animation = json.loads((ROOT / 'niulai-android/web/bull-frames.json').read_text())
    targets = json.loads((ROOT / 'renderer-modules/desktop-frame-colors.json').read_text())['target']
    original_arch = (TOOLS / 'rife_arch.py').read_text(encoding='utf-8')
    standalone = original_arch.replace('from comfy.model_management import get_torch_device', "def get_torch_device():\n    return torch.device('cuda')")
    arch_path = TOOLS / 'rife_standalone.py'
    arch_path.write_text(standalone, encoding='utf-8')
    spec = importlib.util.spec_from_file_location('niulai_rife', arch_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    rife = module.IFNet(arch_ver='4.26').eval()
    rife_weights = torch.load(TOOLS / 'rife426.pth', map_location='cpu', weights_only=True)
    # The published training checkpoint also contains its teacher/time heads;
    # neither participates in this inference architecture. All inference keys
    # must still match exactly, rather than silently accepting missing layers.
    rife.load_state_dict({key: value for key, value in rife_weights.items() if not key.startswith(('teacher.', 'caltime.'))}, strict=True)
    rife = rife.cuda().half()
    upscaler = Upscaler().eval()
    checkpoint = torch.load(TOOLS / 'RealESRGAN_x2plus.pth', map_location='cpu', weights_only=True)
    upscaler.load_state_dict(checkpoint.get('params_ema', checkpoint.get('params', checkpoint)), strict=True)
    upscaler = upscaler.cuda().half()
    manifest_path = OUTPUT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'version': 1, 'frameSize': 512, 'columns': 4, 'rows': 4, 'pageFrames': 16, 'sheets': {}}
    provenance = {'rife': {'model': 'RIFE 4.26', 'weightsSha256': sha(TOOLS / 'rife426.pth'), 'architectureSha256': sha(TOOLS / 'rife_arch.py')},
                  'upscale': {'model': 'Real-ESRGAN x2plus', 'weightsSha256': sha(TOOLS / 'RealESRGAN_x2plus.pth'), 'neuralBlend': .55}, 'device': torch.cuda.get_device_name(), 'clips': {}}
    for name, sheet in animation['sheets'].items():
        if args.clips and name not in args.clips:
            continue
        started = time.perf_counter()
        source = ROOT / 'assets/2d/frames' / sheet['file'].replace('.webp', '.png')
        atlas = np.asarray(Image.open(source).convert('RGBA'))
        originals, enhanced, inputs = [], [], []
        with torch.inference_mode():
            for index in range(24):
                y, x = index // 6 * 256, index % 6 * 256
                frame = stable_color(atlas[y:y + 256, x:x + 256], targets)
                # Remove sub-1% matte noise outside the original silhouette.
                frame[:, :, 3] = np.where(frame[:, :, 3] <= 2, 0, frame[:, :, 3])
                originals.append(frame)
                rgb = frame[:, :, :3].astype(np.float32) / 255
                # Grow edge colors into transparent pixels for the upscaler;
                # the original alpha remains authoritative for the silhouette.
                mask = (frame[:, :, 3] < 20).astype(np.uint8)
                filled = cv2.inpaint(frame[:, :, :3], mask, 3, cv2.INPAINT_TELEA).astype(np.float32) / 255
                neural = upscaler(tensor(filled)).clamp(0, 1)[0].float().cpu().numpy().transpose(1, 2, 0)
                base = cv2.resize(rgb, (512, 512), interpolation=cv2.INTER_LANCZOS4)
                high_rgb = np.clip(.55 * neural + .45 * base, 0, 1)
                alpha = np.clip(cv2.resize(frame[:, :, 3].astype(np.float32) / 255, (512, 512), interpolation=cv2.INTER_CUBIC), 0, 1)
                rgba = stable_color(np.round(np.concatenate([high_rgb, alpha[:, :, None]], 2) * 255).astype(np.uint8), targets)
                rgba[rgba[:, :, 3] <= 2] = 0
                enhanced.append(rgba)
                value = rgba.astype(np.float32) / 255
                value[:, :, :3] *= value[:, :, 3:4]
                inputs.append(tensor(value))
            count = max(24, round(sheet['duration'] * .06))
            pages, page = [], Image.new('RGBA', (2048, 2048))
            proof_dir = REPORT / 'frames' / name
            proof_dir.mkdir(parents=True, exist_ok=True)
            intermediate_differences = []
            for index in range(count):
                position = index * 23 / (count - 1)
                left = min(22, int(position))
                t = position - left
                if t < 1e-6:
                    result = enhanced[left]
                elif t > 1 - 1e-6:
                    result = enhanced[left + 1]
                else:
                    value = rife(inputs[left], inputs[left + 1], timestep=t, scale_list=[16, 8, 4, 2, 1], training=False, fastmode=True, ensemble=False)
                    value = value[0].float().cpu().numpy().transpose(1, 2, 0)
                    alpha = np.clip(value[:, :, 3:4], 0, 1)
                    rgb = np.divide(value[:, :, :3], np.maximum(alpha, 1e-5))
                    result = np.round(np.clip(np.concatenate([rgb, alpha], 2), 0, 1) * 255).astype(np.uint8)
                    result[result[:, :, 3] <= 2] = 0
                    linear = (enhanced[left].astype(np.float32) * (1 - t) + enhanced[left + 1].astype(np.float32) * t)
                    intermediate_differences.append(float(np.abs(result.astype(np.float32) - linear).mean()))
                result = stable_color(result, targets)
                image = Image.fromarray(result)
                image.save(proof_dir / f'{index:04d}.png', compress_level=2)
                slot = index % 16
                page.paste(image, (slot % 4 * 512, slot // 4 * 512))
                if slot == 15 or index == count - 1:
                    filename = f'{name}-{len(pages):02d}.webp'
                    page.save(OUTPUT / filename, 'WEBP', lossless=True, method=4, exact=True)
                    pages.append(filename)
                    page = Image.new('RGBA', (2048, 2048))
            # A neutral/source frame comparison, including transparent edges.
            Image.fromarray(originals[8]).save(REPORT / f'{name}-source.png')
            Image.fromarray(enhanced[8]).save(REPORT / f'{name}-enhanced.png')
            manifest['sheets'][name] = {'duration': sheet['duration'], 'count': count, 'pages': pages}
            manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
            provenance['clips'][name] = {'source': str(source), 'sourceSha256': sha(source), 'inputFrames': 24, 'outputFrames': count, 'seconds': round(time.perf_counter() - started, 2), 'meanDifferenceFromCrossfade': float(np.mean(intermediate_differences)) if intermediate_differences else 0, 'pages': [{'file': p, 'sha256': sha(OUTPUT / p), 'bytes': (OUTPUT / p).stat().st_size} for p in pages]}
            print(json.dumps({'clip': name, **{k: v for k, v in provenance['clips'][name].items() if k not in ['pages', 'source']}}), flush=True)
    (REPORT / ('generation-' + ('-'.join(args.clips) if args.clips else 'all') + '.json')).write_text(json.dumps(provenance, indent=2) + '\n')


if __name__ == '__main__':
    main()
