// All coordinates describe the current viewport and are in CSS pixels.
function intervals(size, cuts) {
  const lanes = [];
  let start = 0;
  for (const [before, after] of cuts.sort((a, b) => a[0] - b[0])) {
    if (before > start) lanes.push([start, before]);
    start = Math.max(start, after);
  }
  if (start < size) lanes.push([start, size]);
  return lanes;
}

const span = ([a, b]) => b - a;
const widest = lanes => lanes.reduce((best, lane) => span(lane) > span(best) ? lane : best);
const minBookWidth = 280;

function viewportPanes(width, height, segments) {
  const unique = new Map();
  for (const segment of segments) {
    const { left, top, right, bottom } = segment;
    if (![left, top, right, bottom].every(Number.isFinite) ||
      left < 0 || top < 0 || right > width + 1 || bottom > height + 1 || right <= left || bottom <= top) continue;
    unique.set([left, top, right, bottom].join(','), { left, top, right: Math.min(width, right), bottom: Math.min(height, bottom) });
  }
  return [...unique.values()];
}

function browserLayout(width, height, segments) {
  const panes = viewportPanes(width, height, segments);
  if (panes.length < 2) return null;
  const area = pane => (pane.right - pane.left) * (pane.bottom - pane.top);
  const widestPane = panes.reduce((best, pane) => area(pane) > area(best) ? pane : best);
  const [first, second] = panes.sort((a, b) => a.left - b.left);
  const book = panes.length === 2 && first.top === second.top && first.bottom === second.bottom
    && first.left === 0 && second.right === width && first.right <= second.left
    && first.bottom - first.top >= 300 && first.right >= minBookWidth && second.right - second.left >= minBookWidth;
  return {
    type: book ? 'book' : 'single',
    left: widestPane.left, right: width - widestPane.right, top: widestPane.top, bottom: height - widestPane.bottom,
    firstWidth: book ? first.right : 0, gap: book ? second.left - first.right : 0
  };
}

export function foldLayout(width, height, folds = [], segments = []) {
  const vertical = [], horizontal = [];
  for (const { left, top, right, bottom } of folds) {
    if (![left, top, right, bottom].every(Number.isFinite)) continue;
    if (left > 0 && right < width && right >= left && bottom - top >= height * .75) {
      vertical.push([left, right]);
    } else if (top > 0 && bottom < height && bottom >= top && right - left >= width * .75) {
      horizontal.push([top, bottom]);
    }
  }
  if (!vertical.length && !horizontal.length) return browserLayout(width, height, segments);
  const columns = intervals(width, vertical);
  const rows = intervals(height, horizontal);

  const [left, right] = widest(columns);
  const [top, bottom] = widest(rows);
  const split = rows.length === 1 && columns.length === 2 && columns.every(column => span(column) >= minBookWidth) && span([top, bottom]) >= 300;
  return {
    type: split ? 'book' : 'single',
    left, right: Math.max(0, width - right), top, bottom: Math.max(0, height - bottom),
    firstWidth: split ? columns[0][1] : 0,
    gap: split ? Math.max(0, columns[1][0] - columns[0][1]) : 0
  };
}

export function watchFoldLayout() {
  const root = document.documentElement;
  let androidFolds = [];
  let pending = false;
  function update() {
    pending = false;
    const layout = foldLayout(root.clientWidth, root.clientHeight, androidFolds, Array.from(window.viewport?.segments || []));
    if (layout) root.dataset.fold = layout.type;
    else delete root.dataset.fold;
    for (const edge of ['left', 'top', 'right', 'bottom']) {
      document.body.style.setProperty('--pane-' + edge, (layout?.[edge] || 0) + 'px');
    }
    document.body.style.setProperty('--fold-left-width', (layout?.firstWidth || 0) + 'px');
    document.body.style.setProperty('--fold-gap', (layout?.gap || 0) + 'px');
  }
  function queueUpdate() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  }
  window.__niulaiFolds = folds => { androidFolds = folds; queueUpdate(); };
  window.addEventListener('resize', queueUpdate);
  for (const direction of ['horizontal', 'vertical']) {
    for (const count of [2, 3]) {
      window.matchMedia('(' + direction + '-viewport-segments: ' + count + ')')
        .addEventListener?.('change', queueUpdate);
    }
  }
  update();
}
