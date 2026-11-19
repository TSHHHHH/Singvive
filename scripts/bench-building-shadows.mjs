// Run against a local dev server, e.g. node scripts/bench-building-shadows.mjs http://localhost:5190
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.argv[2] ?? 'http://localhost:5190');
assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname), 'Use a local dev server');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (/Building shadows unavailable|GL_INVALID|Shader Error/.test(message.text())) errors.push(message.text());
  });
  await page.goto(origin.href);
  await page.waitForFunction(() => !!window.__game);
  const spawn = await page.evaluate(async () => {
    const { useSettings } = await import('/src/game/settings.ts');
    useSettings.getState().setSetting('buildingShadows', 'on');
    const game = window.__game.getState();
    game.commitCharacter({
      name: 'Shadow benchmark', attributes: { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 }, traitIds: [],
    });
    return game.setSpawn({ lat: 1.3048, lng: 103.8318, name: 'Orchard' });
  });
  assert.equal(spawn, 'ok');
  await page.waitForFunction(() => window.__map?.getLayer('building-shadows') && window.__buildings?.shadowDisc);
  await page.evaluate(() => {
    window.__game.setState({ hour: 13 });
    window.__map.jumpTo({ center: [103.8318, 1.3048], zoom: 16.25, pitch: 47, bearing: -30 });
  });
  await page.waitForFunction(() => window.__buildings.shadowBlocks(1.3048, 103.8318, 700).length > 160, null, {
    timeout: 60000, polling: 500,
  });
  const report = await page.evaluate(async () => {
    const map = window.__map;
    const engine = window.__buildings;
    const radius = engine.shadowDisc.r;
    const gl = map.getCanvas().getContext('webgl2');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const times = { off: [], on: [] };
    const cpu = { off: [], on: [] };
    const frame = () => new Promise(resolve => {
      map.once('render', () => resolve(performance.now()));
      map.triggerRepaint();
    });
    // Follow the same 146 m path each pass. Discard the return jump and warm-up frames.
    async function glide(mode, record) {
      map.setLayoutProperty('building-shadows', 'visibility', mode === 'on' ? 'visible' : 'none');
      const layer = map.getLayer('building-shadows').implementation;
      const original = layer.render;
      let cost = 0;
      layer.render = function (...args) {
        const start = performance.now();
        try { return original.apply(this, args); }
        finally { cost += performance.now() - start; }
      };
      try {
        let previous = await frame();
        for (let i = 0; i < 165; i++) {
          cost = 0;
          const lng = 103.8318 + i * 0.000008;
          engine.setReveal({ lat: 1.3048, lng, radius });
          map.jumpTo({ center: [lng, 1.3048] });
          const now = await frame();
          if (record && i >= 15) {
            times[mode].push(now - previous);
            cpu[mode].push(cost);
          }
          previous = now;
        }
      } finally { layer.render = original; }
    }
    await glide('on', false);
    for (const mode of ['off', 'on', 'on', 'off']) await glide(mode, true);
    function summary(samples) {
      const sorted = samples.toSorted((a, b) => a - b);
      const percentile = p => Math.round(sorted[Math.floor(sorted.length * p)] * 10) / 10;
      return { medianMs: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99) };
    }
    return {
      gpu: debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      rangeMetres: Math.round(radius), castersAtEnd: engine.shadowBlocks(engine.shadowDisc.lat, engine.shadowDisc.lng, radius).length,
      framesPerMode: times.on.length, shadowsOff: summary(times.off), shadowsOn: summary(times.on),
      shadowLayerCpu: summary(cpu.on),
    };
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
