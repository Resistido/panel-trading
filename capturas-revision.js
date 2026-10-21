// Capturas para revisión visual: las cinco pestañas en claro y oscuro a 390 px, Capturas en modo "Ya estoy dentro" con su bloque de acción, y Hoy a 1280 px.
// Protecciones (v3.5), en claro y oscuro a 390 px: Hoy con un dato macro cerca, con pausa activa y con aviso de fin de semana, y Operar bloqueada.
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
const { datosSemana, AHORA, NY } = require('./datos-tablero.js');
const BO = (m, d, h, mi) => Date.UTC(2026, m - 1, d, h + 4, mi); // Bolivia: UTC−4 todo el año
// Una pérdida chica cerrada hoy a las 10:50: con la de MU (10:15) son dos seguidas → pausa hasta las 11:20.
const perdida = ['t-pausa', { activo: 'AMD', dir: 'compra', entrada: 160, entradaPlan: 160, sl1: 159, sl2: 160, tp1: 162, tp2: 164, nivel: 10, nivelEf: 10, d: 1, unidades: 8, unidadesAbiertas: 0, riesgoInicial: 8, stopActual: 159,
  estado: 'cerrada', ts: BO(10, 14, 10, 30), parciales: [], movimientos: [], reglasRotas: [], nota: '', origen: 'Radar', tipo: 'limite', tipoActivo: 'Tecnología', seguridad: null,
  cierre: { ts: BO(10, 14, 10, 50), precio: 159, unidades: 8, pnl: -8, motivo: 'SL1' }, pnl: -8, r: -1, plan: 'si' }];
const skeleton = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>';
const pagina = path.join(dir, 'test-capturas-page.html');
fs.writeFileSync(pagina, skeleton);
const salida = path.join(dir, 'revision-visual');
fs.mkdirSync(salida, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const errores = [];
  const preparar = async (ancho, { hora = AHORA, trades = [], eventos = [['e-fed', { ts: BO(10, 14, 14, 0), nombre: 'Fed (actas)' }]] } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 860 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(MOCK);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errores.push(e.message));
    await pg.clock.install({ time: hora });
    await pg.goto('file://' + pagina);
    await pg.waitForFunction(() => document.getElementById('v-title').textContent !== 'Cargando tus operaciones…', null, { timeout: 15000 });
    await pg.evaluate(async ([docs, evs]) => { const db = await window.claude.use('db'); for (const [id, d] of docs) await db.collection('trades').doc(id).set(d); for (const [id, d] of evs) await db.collection('eventos').doc(id).set(d); }, [datosSemana().concat(trades), eventos]);
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
  // Imagen mínima: el simulador no la mira, responde siempre la revisión de ejemplo.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const dentro = async (pg) => {
    await pg.click('#t-analizar');
    await pg.click('label[for="cap-modo-d"]');
    await pg.selectOption('#ge-pos', 't-avgo');
    await pg.setInputFiles('#cap-files', [{ name: '4h.png', mimeType: 'image/png', buffer: png }, { name: '15m.png', mimeType: 'image/png', buffer: png }]);
    await pg.fill('#ge-ahora', '334,10');
    await pg.evaluate(() => { window.__gestionResp = { activo: 'AVGO', legible: true, problemas: [], advertencias: ['Resultados en 8 días'], capturas: [{ n: 1, temporalidad: '4H', tendencia: 'alcista', lectura: 'Sobre el soporte' }, { n: 2, temporalidad: '15 min', tendencia: 'alcista', lectura: 'Máximos crecientes' }],
      estado: 'vigente', motivo_estado: 'Sigue sobre el soporte de 330', accion: 'mover_stop', nivel: 332, porcentaje: null, motivo: 'Asegurar parte de la ganancia bajo el último mínimo de 15 min', invalidacion: 'Cierre de 4H debajo de 330' }; });
    await pg.click('#btnAnalizar');
    await pg.waitForFunction(() => !document.getElementById('ge-resultado').hidden && document.querySelector('#ge-resultado .accion'), null, { timeout: 10000 });
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
  // Capturas: "Ya estoy dentro" con la propuesta de la IA, en los dos temas.
  await dentro(pg);
  for (const t of ['claro', 'oscuro']) {
    await tema(pg, t);
    await completa(pg, 390, path.join(salida, '390-' + t + '-capturas-dentro.png'));
  }
  await ctx.close();
  // Protecciones: Hoy con un dato macro cerca, con pausa y con aviso de fin de semana; Operar bloqueada por el dato macro.
  const casos = [
    ['hoy-macro', { eventos: [['e-cpi', { ts: BO(10, 14, 11, 20), nombre: 'CPI' }], ['e-fed', { ts: BO(10, 14, 14, 0), nombre: 'Fed (actas)' }]] }, 'hoy'],
    ['hoy-pausa', { trades: [perdida] }, 'hoy'],
    ['hoy-finde', { hora: NY(10, 16, 11, 5) }, 'hoy'],
    ['operar-bloqueada', { eventos: [['e-cpi', { ts: BO(10, 14, 11, 20), nombre: 'CPI' }]] }, 'operar']
  ];
  for (const [nombre, opciones, tab] of casos) {
    const c = await preparar(390, opciones);
    if (tab === 'operar') {
      await c.pg.click('#t-operar'); await c.pg.click('#btnEjemplo');
      await c.pg.check('#chk-horario'); await c.pg.check('#chk-stop');
    }
    for (const t of ['claro', 'oscuro']) {
      await tema(c.pg, t);
      await completa(c.pg, 390, path.join(salida, '390-' + t + '-' + nombre + '.png'));
    }
    await c.ctx.close();
  }
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
