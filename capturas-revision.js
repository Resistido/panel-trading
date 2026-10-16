// Capturas para revisión visual (Tarea 2): las cinco pestañas en claro y oscuro a 390 px, y Hoy a 1280 px.
// Uso: node capturas-revision.js <carpeta> [archivo]. Guarda los PNG en <carpeta>/revision-visual/.
// Usa el simulador de test-panel.js, un reloj fijo (miércoles 14-oct-2026, 11:05 en Nueva York) y datos inventados.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const archivo = process.argv[3] || 'panel-trading.html';
const html = fs.readFileSync(path.join(dir, archivo), 'utf8');
const suite = fs.readFileSync(path.join(__dirname, 'test-panel.js'), 'utf8');
const MOCK = suite.slice(suite.indexOf('const MOCK = `') + 'const MOCK = `'.length, suite.indexOf('})();`;') + '})();'.length);
const { datosSemana, AHORA } = require('./datos-tablero.js');
const skeleton = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>';
const pagina = path.join(dir, 'test-capturas-page.html');
fs.writeFileSync(pagina, skeleton);
const salida = path.join(dir, 'revision-visual');
fs.mkdirSync(salida, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const errores = [];
  const preparar = async (ancho) => {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 860 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(MOCK);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errores.push(e.message));
    await pg.clock.install({ time: AHORA });
    await pg.goto('file://' + pagina);
    await pg.waitForFunction(() => document.getElementById('v-title').textContent !== 'Cargando tus operaciones…', null, { timeout: 15000 });
    await pg.evaluate(async (docs) => { const db = await window.claude.use('db'); for (const [id, d] of docs) await db.collection('trades').doc(id).set(d); }, datosSemana());
    await pg.waitForFunction(() => document.querySelectorAll('#tb-ab-lista .ab-fila').length === 2);
    await pg.waitForTimeout(500); // que el simulador termine de re-dibujar antes de escribir
    // Precio escrito en Abiertas para una de las dos posiciones (la otra queda sin precio vigente).
    await pg.click('#t-abiertas');
    await pg.fill('.pos[data-id="t-avgo"] [data-now]', '334,10');
    await pg.click('#t-hoy');
    await pg.evaluate(() => document.fonts && document.fonts.ready);
    return { ctx, pg };
  };
  // La barra de pestañas es fija: se agranda la ventana al alto de la página para que quede al final y no tape nada.
  const completa = async (pg, ancho, archivo) => {
    const alto = await pg.evaluate(() => document.documentElement.scrollHeight);
    await pg.setViewportSize({ width: ancho, height: alto });
    await pg.waitForTimeout(60);
    await pg.screenshot({ path: archivo });
    await pg.setViewportSize({ width: ancho, height: 860 });
  };
  const tema = async (pg, t) => { await pg.click('label[for="tema-' + t + '"]'); await pg.waitForTimeout(80); };

  const { ctx, pg } = await preparar(390);
  for (const t of ['claro', 'oscuro']) {
    await tema(pg, t);
    for (const tab of ['hoy', 'analizar', 'operar', 'abiertas', 'diario']) {
      await pg.click('#t-' + tab);
      if (tab === 'operar') await pg.click('#btnEjemplo');
      await pg.waitForTimeout(80);
      await completa(pg, 390, path.join(salida, '390-' + t + '-' + (tab === 'analizar' ? 'capturas' : tab) + '.png'));
    }
  }
  await ctx.close();
  const g = await preparar(1280);
  for (const t of ['claro', 'oscuro']) {
    await tema(g.pg, t);
    await g.pg.click('#t-hoy');
    await completa(g.pg, 1280, path.join(salida, '1280-' + t + '-hoy.png'));
  }
  await browser.close();
  fs.unlinkSync(pagina);
  console.log('Capturas en ' + salida + (errores.length ? ' · errores de página: ' + errores.join(' | ') : ' · sin errores de página'));
  process.exit(errores.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
