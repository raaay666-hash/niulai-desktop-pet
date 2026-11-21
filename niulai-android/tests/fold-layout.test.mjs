import test from 'node:test';
import assert from 'node:assert/strict';
import { foldLayout } from '../web/fold-layout.mjs';

test('narrow windows and partial-width occlusions keep the ordinary navigation', () => {
  assert.equal(foldLayout(280, 512), null);
  assert.equal(foldLayout(390, 844, [{ left: 20, right: 70, top: 0, bottom: 35 }]), null);
});

test('book posture fits parallel content and anchors controls to the wider pane', () => {
  assert.deepEqual(foldLayout(780, 690, [{ left: 365, right: 401, top: -28, bottom: 715 }]), {
    type: 'book', left: 401, right: 0, top: 0, bottom: 0, firstWidth: 365, gap: 36
  });
  assert.equal(foldLayout(672, 820, [{ left: 336, right: 336, top: 0, bottom: 820 }]).gap, 0);
});

test('tabletop and three-part folds choose one unbroken region', () => {
  assert.deepEqual(foldLayout(780, 690, [{ left: 0, right: 780, top: 335, bottom: 355 }]), {
    type: 'single', left: 0, right: 0, top: 0, bottom: 355, firstWidth: 0, gap: 0
  });
  assert.equal(foldLayout(680, 700, [{ left: 200, right: 220, top: 0, bottom: 700 }]).type, 'single');
  const tri = foldLayout(1100, 760, [
    { left: 350, right: 370, top: 0, bottom: 760 },
    { left: 740, right: 760, top: 0, bottom: 760 }
  ]);
  assert.deepEqual(tri, { type: 'single', left: 370, right: 360, top: 0, bottom: 0, firstWidth: 0, gap: 0 });
});

test('browser segments also describe hinges when native fold data is absent', () => {
  const segments = [
    { left: 0, right: 382, top: 0, bottom: 650 },
    { left: 418, right: 800, top: 0, bottom: 650 }
  ];
  assert.deepEqual(foldLayout(800, 650, [], segments), {
    type: 'book', left: 0, right: 418, top: 0, bottom: 0, firstWidth: 382, gap: 36
  });
  assert.equal(foldLayout(800, 650, [], [segments[0]]), null);
});

test('staggered segments keep content inside a real viewport pane', () => {
  assert.deepEqual(foldLayout(840, 720, [], [
    { left: 0, right: 320, top: 0, bottom: 720 },
    { left: 340, right: 840, top: 200, bottom: 720 },
    { left: 340, right: 840, top: 0, bottom: 180 }
  ]), { type: 'single', left: 340, right: 0, top: 200, bottom: 0, firstWidth: 0, gap: 0 });
  assert.equal(foldLayout(630, 720, [{ left: 270, right: 290, top: 0, bottom: 720 }]).type, 'single');
  assert.equal(foldLayout(800, 700, [
    { left: 390, right: 410, top: 0, bottom: 700 },
    { left: 0, right: 800, top: 350, bottom: 370 }
  ]).type, 'single');
});
