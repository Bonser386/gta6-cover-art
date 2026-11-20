// Vice Cover Studio's editor: wires the controls to the cover engine (./cover.js).
// Photos come from the file picker, drag and drop, or the built-in samples; clicking a
// panel selects it, dragging pans it, the wheel zooms it. Export downloads the preview
// canvas itself, so the PNG is exactly the cover on screen. A `?shot=` query sets up a
// fixed scene for a screenshot instead (./shots.js).
import { drawCover, defaultState, panelAt, panelRects, SIZES } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const titleInput = document.getElementById('title');
const subtitleInput = document.getElementById('subtitle');
const status = document.getElementById('status');
const panelLabel = document.getElementById('panelLabel');
const zoomInput = document.getElementById('zoom');
const previewWrap = document.getElementById('previewWrap');

const state = defaultState();
window.__state = state;

/** The built-in sample photos: our own game renders plus the starter's two. */
const SAMPLES = [
  { file: '1-chase', label: 'Chase' },
  { file: '2-street', label: 'Street' },
  { file: '3-drive', label: 'Drive' },
  { file: '4-mission', label: 'Mission' },
  { file: 'boulevard', label: 'Boulevard' },
  { file: 'pier', label: 'Pier' },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Fits the preview canvas into its box, keeping the cover's aspect ratio. */
function fitPreview() {
  if (document.body.classList.contains('shot-cover')) {
    canvas.style.width = '';
    canvas.style.height = '';
    return;
  }
  const box = previewWrap.getBoundingClientRect();
  const { w, h } = SIZES[state.size];
  const scale = Math.min((box.width - 40) / w, (box.height - 40) / h);
  canvas.style.width = `${Math.floor(w * scale)}px`;
  canvas.style.height = `${Math.floor(h * scale)}px`;
}

function redraw() {
  drawCover(canvas, state);
  fitPreview();
}

/** Reflects the state in the buttons, inputs and panel readout. */
function syncUI() {
  for (const [rowId, key, attr] of [
    ['layoutRow', 'layout', 'data-layout'],
    ['sizeRow', 'size', 'data-size'],
    ['gradeRow', 'grade', 'data-grade'],
  ]) {
    document.querySelectorAll(`#${rowId} button`).forEach((b) => {
      b.classList.toggle('active', b.getAttribute(attr) === state[key]);
    });
  }
  titleInput.value = state.title;
  subtitleInput.value = state.subtitle;
  syncPanelUI();
}

function syncPanelUI() {
  panelLabel.textContent = `Panel ${state.selected + 1} selected — drag to pan, scroll to zoom`;
  zoomInput.value = String(Math.round(state.views[state.selected].zoom * 100));
  document.querySelectorAll('#samples button').forEach((b) => {
    b.classList.toggle('assigned', b.dataset.sample === currentSampleOf(state.selected));
  });
}

function currentSampleOf(slot) {
  const img = state.photos[slot];
  if (!img) return '';
  const src = img.currentSrc || img.src || '';
  const match = src.match(/samples\/([^/.]+)\.jpg$/);
  return match ? match[1] : '';
}

function setState(patch) {
  Object.assign(state, patch);
  syncUI();
}

/** Builds the sample thumbnail strip. */
function buildSamples() {
  const strip = document.getElementById('samples');
  for (const s of SAMPLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.sample = s.file;
    b.title = `Use the ${s.label} photo in the selected panel`;
    const img = document.createElement('img');
    img.src = `samples/${s.file}.jpg`;
    img.alt = `${s.label} sample photo`;
    const span = document.createElement('span');
    span.textContent = s.label;
    b.append(img, span);
    b.addEventListener('click', async () => {
      state.photos[state.selected] = await loadImage(`samples/${s.file}.jpg`);
      state.views[state.selected] = { x: 0, y: 0, zoom: 1 };
      syncPanelUI();
      redraw();
    });
    strip.append(b);
  }
}

buildSamples();

/** Adds image files to the first empty panels, else to the selected one. */
async function addFiles(files) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  for (const f of images) {
    const img = await loadImage(URL.createObjectURL(f));
    let slot = state.photos.findIndex((p) => !p);
    if (slot === -1) slot = state.selected;
    state.photos[slot] = img;
    state.views[slot] = { x: 0, y: 0, zoom: 1 };
    state.selected = slot;
  }
  if (images.length) {
    status.textContent = `${images.length} photo${images.length > 1 ? 's' : ''} loaded`;
    syncPanelUI();
    redraw();
  }
}

document.getElementById('photo').addEventListener('change', (e) => addFiles(e.target.files));
const drop = document.getElementById('drop');
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  addFiles(e.dataTransfer.files);
});

for (const [rowId, key] of [['layoutRow', 'layout'], ['sizeRow', 'size'], ['gradeRow', 'grade']]) {
  document.getElementById(rowId).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const value = b.dataset[key];
    if (value) {
      state[key] = value;
      syncUI();
      redraw();
    }
  });
}

titleInput.addEventListener('input', () => {
  state.title = titleInput.value;
  redraw();
});
subtitleInput.addEventListener('input', () => {
  state.subtitle = subtitleInput.value;
  redraw();
});
zoomInput.addEventListener('input', () => {
  state.views[state.selected].zoom = clamp(Number(zoomInput.value) / 100, 1, 3);
  redraw();
});
document.getElementById('fit').addEventListener('click', () => {
  state.views[state.selected] = { x: 0, y: 0, zoom: 1 };
  syncPanelUI();
  redraw();
});

document.getElementById('export').addEventListener('click', () => {
  const { w, h } = SIZES[state.size];
  canvas.toBlob((blob) => {
    if (!blob) {
      status.textContent = 'Export failed.';
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cover-${w}x${h}.png`;
    a.click();
    status.textContent = `Saved cover-${w}x${h}.png (${Math.round(blob.size / 1024)} KB)`;
  }, 'image/png');
});

/** Panel picking, panning and zooming on the preview canvas. */
function toCanvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * canvas.width,
    y: ((e.clientY - r.top) / r.height) * canvas.height,
  };
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  const p = toCanvasPoint(e);
  const i = panelAt(state.layout, canvas.width, canvas.height, p.x, p.y);
  if (i === -1) return;
  state.selected = i;
  syncPanelUI();
  redraw();
  drag = { i, x: p.x, y: p.y };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = toCanvasPoint(e);
  const dx = p.x - drag.x;
  const dy = p.y - drag.y;
  const r = panelRects(state.layout, canvas.width, canvas.height)[drag.i];
  const img = state.photos[drag.i];
  if (img) {
    const base = Math.max(r.w / img.naturalWidth, r.h / img.naturalHeight);
    const zoom = state.views[drag.i].zoom;
    const ox = Math.max(1, img.naturalWidth * base * zoom - r.w);
    const oy = Math.max(1, img.naturalHeight * base * zoom - r.h);
    state.views[drag.i].x = clamp(state.views[drag.i].x + dx / ox, -0.5, 0.5);
    state.views[drag.i].y = clamp(state.views[drag.i].y + dy / oy, -0.5, 0.5);
  }
  drag.x = p.x;
  drag.y = p.y;
  redraw();
});
canvas.addEventListener('pointerup', () => {
  drag = null;
  syncPanelUI();
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const p = toCanvasPoint(e);
  const i = panelAt(state.layout, canvas.width, canvas.height, p.x, p.y);
  if (i === -1) return;
  state.selected = i;
  state.views[i].zoom = clamp(state.views[i].zoom * Math.exp(-e.deltaY * 0.0012), 1, 3);
  syncPanelUI();
  redraw();
}, { passive: false });

window.addEventListener('resize', fitPreview);

/**
 * Self-test for the export path: draws the current cover at every export size on an
 * offscreen canvas and reports each PNG's dimensions and byte size.
 */
window.__testExport = async () => {
  const out = [];
  for (const key of Object.keys(SIZES)) {
    const probe = { ...state, size: key, photos: state.photos, views: state.views };
    const off = document.createElement('canvas');
    drawCover(off, probe);
    const blob = await new Promise((resolve) => off.toBlob(resolve, 'image/png'));
    out.push({ size: key, width: off.width, height: off.height, bytes: blob ? blob.size : 0 });
  }
  return out;
};

const query = new URLSearchParams(location.search);
const shot = query.get('shot');
if (shot) {
  runShot(shot, query, { state, loadImage, setState, syncUI, draw: redraw }).catch((err) => {
    console.error(err);
  });
} else {
  syncUI();
  redraw();
  document.fonts.load('100px Anton').then(redraw).catch(() => {});
  loadImage('samples/1-chase.jpg').then((img) => {
    state.photos[0] = img;
    syncPanelUI();
    redraw();
  }).catch(() => {});
}
