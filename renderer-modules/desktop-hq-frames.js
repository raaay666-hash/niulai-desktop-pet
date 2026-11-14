import manifest from '../assets/2d/frames/hq/manifest.json' with { type: 'json' };

const pages = new Map();
const imageMetadata = new WeakMap();
const LIMIT = 4;

function pageRecord(name, index, assetBase) {
  const spec = manifest.sheets[name];
  const url = new URL('../hq/' + spec.pages[index], new URL(assetBase, location.href)).href;
  let record = pages.get(url);
  if (record && (!record.failedAt || performance.now() - record.failedAt < 5000)) {
    pages.delete(url); pages.set(url, record); return record;
  }
  record = { image: null, failedAt: 0 };
  record.promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      try {
        await image.decode();
        record.image = image;
        imageMetadata.set(image, { name, page: index });
        resolve(image);
      } catch (error) { record.failedAt = performance.now() || 1; reject(error); }
    };
    image.onerror = () => { record.failedAt = performance.now() || 1; reject(new Error('高清动画加载失败')); };
    image.src = url;
  });
  // Speculative pages may fail; the current pose remains visible and the next
  // request retries after a bounded delay, without unhandled rejections.
  record.promise.catch(() => {});
  pages.set(url, record);
  while (pages.size > LIMIT) pages.delete(pages.keys().next().value);
  return record;
}

export function loadFirstHQPage(name, assetBase) {
  if (!manifest.sheets[name]) return null;
  const first = pageRecord(name, 0, assetBase);
  if (manifest.sheets[name].pages.length > 1) pageRecord(name, 1, assetBase);
  return first.promise;
}

export function resolveHQDrawing(motion, frame) {
  const spec = manifest.sheets[frame.sheet];
  if (!spec || imageMetadata.get(motion.sheet)?.name !== frame.sheet) return null;
  const duration = motion.player.id === 'muyu' ? motion.player.strokeDuration : spec.duration;
  const index = Math.min(spec.count - 1, Math.floor(frame.elapsed * spec.count / duration));
  const page = Math.floor(index / manifest.pageFrames);
  const record = pageRecord(frame.sheet, page, motion.assetBase);
  // Prefetch the next page, including the first page while resting at the end.
  pageRecord(frame.sheet, (page + 1) % spec.pages.length, motion.assetBase);
  if (record.image) {
    motion.sheet = record.image;
    motion.lastHQDrawing = { image: record.image, index: index % manifest.pageFrames, columns: manifest.columns, rows: manifest.rows, key: 'hq-' + index, name: frame.sheet };
  }
  if (motion.lastHQDrawing?.name === frame.sheet) return motion.lastHQDrawing;
  return { image: motion.sheet, index: 0, columns: manifest.columns, rows: manifest.rows, key: 'hq-wait' };
}

export function hqCacheSnapshot() { return { pages: pages.size, ready: [...pages.values()].filter(page => page.image).length, limit: LIMIT }; }
export { manifest as hqManifest };
