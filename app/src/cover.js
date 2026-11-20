// Vice Cover Studio's drawing engine: turns photos, a layout, a colour grade and a
// caption into a GTA-style multi-panel poster, drawn on any canvas at any export size.
// Every measurement is derived from the cover's own width and height, so the same state
// draws identically at 1080 x 1080, 1080 x 1350 and 1920 x 1080.

/** Export sizes, keyed by their label. */
export const SIZES = {
  '1080x1080': { w: 1080, h: 1080 },
  '1080x1350': { w: 1080, h: 1350 },
  '1920x1080': { w: 1920, h: 1080 },
};

/** Layouts: each panel count is the number of photo slots it uses. */
export const LAYOUTS = {
  hero: { label: 'Hero + two', panels: 3 },
  strips: { label: 'Three strips', panels: 3 },
  grid: { label: 'Four grid', panels: 4 },
  fullbleed: { label: 'Full bleed', panels: 1 },
};

/** Colour grades: a per-panel tint, a top-to-bottom wash and a vignette strength. */
export const GRADES = {
  sunset: {
    label: 'Sunset',
    panel: 'rgba(255, 90, 40, 0.10)',
    top: 'rgba(255, 140, 60, 0)',
    mid: 'rgba(255, 80, 120, 0.14)',
    bottom: 'rgba(170, 20, 110, 0.42)',
    vignette: 0.38,
  },
  neon: {
    label: 'Neon',
    panel: 'rgba(255, 0, 150, 0.10)',
    top: 'rgba(255, 0, 150, 0.10)',
    mid: 'rgba(0, 200, 255, 0.08)',
    bottom: 'rgba(120, 0, 180, 0.38)',
    vignette: 0.48,
  },
  midnight: {
    label: 'Midnight',
    panel: 'rgba(20, 20, 80, 0.14)',
    top: 'rgba(10, 10, 50, 0.18)',
    mid: 'rgba(30, 40, 140, 0.16)',
    bottom: 'rgba(8, 6, 40, 0.45)',
    vignette: 0.52,
  },
};

/** A fresh editor state: no photos yet, hero layout, square size, sunset grade. */
export function defaultState() {
  return {
    layout: 'hero',
    size: '1080x1080',
    grade: 'sunset',
    title: 'Neon Shores',
    subtitle: 'VICE CITY',
    photos: [null, null, null, null],
    views: [
      { x: 0, y: 0, zoom: 1 },
      { x: 0, y: 0, zoom: 1 },
      { x: 0, y: 0, zoom: 1 },
      { x: 0, y: 0, zoom: 1 },
    ],
    selected: 0,
  };
}

/** Panel rectangles for a layout, in pixels of a cover `w` by `h`. */
export function panelRects(layout, w, h) {
  const g = Math.max(4, Math.round(w * 0.006));
  if (layout === 'strips') {
    const pw = Math.floor((w - 2 * g) / 3);
    return [
      { x: 0, y: 0, w: pw, h },
      { x: pw + g, y: 0, w: pw, h },
      { x: 2 * pw + 2 * g, y: 0, w: w - 2 * pw - 2 * g, h },
    ];
  }
  if (layout === 'grid') {
    const pw = Math.floor((w - g) / 2);
    const ph = Math.floor((h - g) / 2);
    return [
      { x: 0, y: 0, w: pw, h: ph },
      { x: pw + g, y: 0, w: w - pw - g, h: ph },
      { x: 0, y: ph + g, w: pw, h: h - ph - g },
      { x: pw + g, y: ph + g, w: w - pw - g, h: h - ph - g },
    ];
  }
  if (layout === 'fullbleed') return [{ x: 0, y: 0, w, h }];
  const heroH = Math.round(h * 0.6);
  const bw = Math.floor((w - g) / 2);
  return [
    { x: 0, y: 0, w, h: heroH },
    { x: 0, y: heroH + g, w: bw, h: h - heroH - g },
    { x: bw + g, y: heroH + g, w: w - bw - g, h: h - heroH - g },
  ];
}

/** How many photo slots a layout uses. */
export function panelCount(layout) {
  return panelRects(layout, 100, 100).length;
}

/** Which panel, if any, holds the point `x, y` in cover pixels. */
export function panelAt(layout, w, h, x, y) {
  const rects = panelRects(layout, w, h);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
  }
  return -1;
}

/** Draws one photo into one panel rect, cover-fit, panned and zoomed by `view`. */
function drawPhotoInto(ctx, img, r, view) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const base = Math.max(r.w / iw, r.h / ih);
  const zoom = view?.zoom ?? 1;
  const sw = iw * base * zoom;
  const sh = ih * base * zoom;
  const dx = (r.w - sw) / 2 + (view?.x ?? 0) * (sw - r.w);
  const dy = (r.h - sh) / 2 + (view?.y ?? 0) * (sh - r.h);
  ctx.drawImage(img, r.x + dx, r.y + dy, sw, sh);
}

/** An empty panel: a dark diagonal gradient with a small invitation. */
function drawEmptyPanel(ctx, r) {
  const grad = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  grad.addColorStop(0, '#2a1740');
  grad.addColorStop(1, '#12081f');
  ctx.fillStyle = grad;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const size = Math.max(14, Math.min(r.w, r.h) * 0.09);
  ctx.font = `${Math.round(size)}px Anton, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText('ADD A PHOTO', r.x + r.w / 2, r.y + r.h / 2);
}

/** The caption: a big Anton title with a dark outline and neon glow, subtitle below. */
function drawLettering(ctx, w, h, title, subtitle) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const text = (title ?? '').trim().toUpperCase();
  if (text) {
    let size = Math.round(h * 0.115);
    ctx.font = `${size}px Anton, "Arial Black", sans-serif`;
    while (size > 24 && ctx.measureText(text).width > w * 0.92) {
      size -= 2;
      ctx.font = `${size}px Anton, "Arial Black", sans-serif`;
    }
    const baseline = Math.round(h * 0.9);
    const ruleY = baseline - size - Math.round(h * 0.025);
    const rule = ctx.createLinearGradient(w * 0.28, 0, w * 0.72, 0);
    rule.addColorStop(0, 'rgba(255, 0, 150, 0)');
    rule.addColorStop(0.5, 'rgba(255, 0, 150, 0.9)');
    rule.addColorStop(1, 'rgba(0, 220, 255, 0)');
    ctx.fillStyle = rule;
    ctx.fillRect(w * 0.28, ruleY, w * 0.44, Math.max(3, Math.round(h * 0.004)));
    ctx.strokeStyle = '#160420';
    ctx.lineWidth = Math.max(4, size * 0.16);
    ctx.shadowColor = 'rgba(255, 0, 140, 0.6)';
    ctx.shadowBlur = size * 0.14;
    ctx.shadowOffsetY = size * 0.03;
    ctx.strokeText(text, w / 2, baseline);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, w / 2, baseline);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
  const sub = (subtitle ?? '').trim().toUpperCase();
  if (sub) {
    let size = Math.round(h * 0.034);
    ctx.font = `${size}px Anton, "Arial Black", sans-serif`;
    try {
      ctx.letterSpacing = `${Math.round(size * 0.45)}px`;
    } catch {
      // letterSpacing is Chrome-only; without it the subtitle still draws.
    }
    while (size > 14 && ctx.measureText(sub).width > w * 0.9) {
      size -= 1;
      ctx.font = `${size}px Anton, "Arial Black", sans-serif`;
    }
    ctx.strokeStyle = '#160420';
    ctx.lineWidth = Math.max(2, size * 0.14);
    ctx.fillStyle = '#ffe066';
    const y = Math.round(h * 0.955);
    ctx.strokeText(sub, w / 2, y);
    ctx.fillText(sub, w / 2, y);
    try {
      ctx.letterSpacing = '0px';
    } catch {
      // No-op where letterSpacing is unsupported.
    }
  }
}

/**
 * Draws the whole cover onto `canvas` from `state`, resizing the canvas to the
 * state's export size first. The same state draws identically at every size.
 */
export function drawCover(canvas, state) {
  const size = SIZES[state.size] ?? SIZES['1080x1080'];
  const w = size.w;
  const h = size.h;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  const grade = GRADES[state.grade] ?? GRADES.sunset;
  ctx.fillStyle = '#0d0616';
  ctx.fillRect(0, 0, w, h);
  const rects = panelRects(state.layout, w, h);
  rects.forEach((r, i) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    if (state.photos[i]) drawPhotoInto(ctx, state.photos[i], r, state.views[i]);
    else drawEmptyPanel(ctx, r);
    ctx.fillStyle = grade.panel;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  });
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, grade.top);
  wash.addColorStop(0.55, grade.mid);
  wash.addColorStop(1, grade.bottom);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  const vig = ctx.createRadialGradient(
    w / 2, h * 0.45, Math.min(w, h) * 0.42,
    w / 2, h * 0.5, Math.max(w, h) * 0.75,
  );
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, `rgba(0, 0, 0, ${grade.vignette})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  const band = ctx.createLinearGradient(0, h * 0.6, 0, h);
  band.addColorStop(0, 'rgba(8, 3, 18, 0)');
  band.addColorStop(1, 'rgba(8, 3, 18, 0.85)');
  ctx.fillStyle = band;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);
  drawLettering(ctx, w, h, state.title, state.subtitle);
}
