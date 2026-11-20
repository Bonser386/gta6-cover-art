// Fixed scenes for screenshots and self-tests: ?shot=editor shows the page with sample
// photos loaded; ?shot=cover shows the exported cover alone; ?shot=export measures the
// export path for all three sizes and reports it in window.__exportInfo.
// `photo` picks the first sample, `caption` the title, `layout`/`size`/`grade` the look.
// window.__shotReady is set once the scene is painted.
import { panelCount } from './cover.js';

const SAMPLE_ORDER = ['1-chase', '2-street', '3-drive', '4-mission', 'boulevard', 'pier'];

export async function runShot(shot, query, api) {
  try {
    await document.fonts.load('100px Anton');
  } catch {
    // Anton is vendored under app/fonts; without it the bold system stack draws.
  }
  const state = api.state;
  if (shot === 'export') {
    const order = ['1-chase', '2-street', '3-drive', '4-mission'];
    for (let i = 0; i < 4; i++) state.photos[i] = await api.loadImage(`samples/${order[i]}.jpg`);
    state.layout = 'grid';
    state.title = 'Vice Nights';
    state.subtitle = 'VICE CITY';
    api.draw();
    window.__exportInfo = await window.__testExport();
    window.__shotReady = true;
    return;
  }
  api.setState({
    layout: query.get('layout') ?? 'hero',
    size: query.get('size') ?? '1080x1080',
    grade: query.get('grade') ?? 'sunset',
    title: query.get('caption') ?? 'Neon Shores',
    subtitle: query.get('subtitle') ?? 'VICE CITY',
  });
  const first = query.get('photo') ?? '1-chase';
  const order = [first, ...SAMPLE_ORDER.filter((s) => s !== first)];
  const count = panelCount(state.layout);
  for (let i = 0; i < count; i++) state.photos[i] = await api.loadImage(`samples/${order[i]}.jpg`);
  state.views = state.views.map(() => ({ x: 0, y: 0, zoom: 1 }));
  if (shot === 'cover') document.body.classList.add('shot-cover');
  api.syncUI();
  api.draw();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}
