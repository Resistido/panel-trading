// Capturas para revisión visual: las cinco pestañas en claro y oscuro a 390 px, Buscar en modo "Ya estoy dentro" con su bloque de acción, y Hoy a 1280 px.
// Protecciones (v3.5), en claro y oscuro a 390 px: Hoy con un dato macro cerca, con pausa activa y con aviso de fin de semana, y la calculadora de Señales bloqueada.
// Señales y práctica (v3.6), en claro y oscuro a 390 px: Señales con tarjetas verde y ámbar, Señales en rojo (dato macro cerca, con los motivos ámbar debajo),
// Abiertas con una operación de práctica y Diario en Práctica. El rojo es del momento (vale para todas las tarjetas a la vez): por eso va en su propia captura.
// Diario en tres partes (v3.7), en claro y oscuro a 390 px: Estadísticas con menos de 20 operaciones (con el aviso) y con más de 20 (sin aviso),
// Estadísticas en Práctica y Revisión con dos revisiones guardadas (la anterior abierta). Datos de datos-estadisticas.js.
// Agentes (v3.8), en claro y oscuro a 390 px: Hoy con un agente investigando (Vigía), uno pausado (Búho) y uno sin noticias (Lince),
// la bitácora de Vigía abierta y el Diario en Agente (Operaciones con los chips de fuera de límites, y Estadísticas). Datos de datos-agentes.js.
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
const { adelantar } = require('./reloj-pruebas.js'); // saltos de reloj sin la carrera del reloj falso (ver el archivo)
const DE = require('./datos-estadisticas.js');
const DA = require('./datos-agentes.js');
const BO = (m, d, h, mi) => Date.UTC(2026, m - 1, d, h + 4, mi); // Bolivia: UTC−4 todo el año
// Una pérdida chica cerrada hoy a las 10:50: con la de MU (10:15) son dos seguidas → pausa hasta las 11:20.
// Tres señales: NVDA cumple (verde), MU tiene el TP1 en 1:1,2 (ámbar) y AMD no dice el nivel de riesgo (ámbar).
const REG = (activo, dir, e, s1, t1, t2, nivel) => 'REGISTRO: 14/10/2026 | ' + activo + ' | ' + dir + ' | ' + e + ' | ' + s1 + ' | ' + e + ' | ' + t1 + ' | ' + t2 + ' | 27 | 120 | ' + nivel;
const SENALES = 'PRE-APERTURA\n' + REG('NVDA', 'compra', '182,40', '180,90', '184,90', '186,20', 'Estándar') + '\n\nRADAR\n' + REG('MU', 'venta corta', '248,60', '250,10', '246,80', '244,10', 'Moderado') + '\n\n' + REG('AMD', 'compra', '214,20', '212,70', '216,90', '218,40', '');
// Dos prácticas cerradas hoy (una ganancia y una pérdida) para el Diario en Práctica.
const practica = (id, activo, pnl, h) => [id, { activo, dir: 'compra', entrada: 100, entradaPlan: 100, sl1: 99, sl2: 100, tp1: 101.5, tp2: 103, nivel: 27, nivelEf: 27, d: 1, unidades: 27, unidadesAbiertas: 0, riesgoInicial: 27, stopActual: 99,
  estado: 'cerrada', ts: BO(10, 14, h, 0), parciales: [], movimientos: [], reglasRotas: [], nota: '', origen: 'Radar', fuente: 'ChatGPT', tipo: 'limite', tipoActivo: 'Tecnología', seguridad: null, practica: true,
  cierre: { ts: BO(10, 14, h, 40), precio: 100 + pnl / 27, unidades: 27, pnl, motivo: pnl < 0 ? 'SL1' : 'TP2' }, pnl, r: pnl / 27, plan: 'si' }];
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
  // Pega las tres señales en la bandeja y deja pasar unos minutos para que las tarjetas digan su antigüedad.
  const pegarSenales = async (pg, minutos = 6) => {
    await pg.click('#t-operar');
    await pg.fill('#f-pegar', SENALES);
    await pg.click('#btnPegar');
    await pg.waitForFunction(() => document.querySelectorAll('#sen-lista .sen').length === 3);
    if (minutos) await adelantar(pg, minutos * 60000);
    await pg.waitForTimeout(150);
  };
  const nombre = (tab) => tab === 'analizar' ? 'buscar' : tab === 'operar' ? 'senales' : tab;

  const { ctx, pg } = await preparar(390);
  await pegarSenales(pg);
  for (const t of ['claro', 'oscuro']) {
    await tema(pg, t);
    for (const tab of ['hoy', 'analizar', 'operar', 'abiertas', 'diario']) {
      await pg.click('#t-' + tab);
      await pg.waitForTimeout(80);
      await completa(pg, 390, path.join(salida, '390-' + t + '-' + nombre(tab) + '.png'));
    }
  }
  // Buscar: "Ya estoy dentro" con la propuesta de la IA, en los dos temas.
  await dentro(pg);
  for (const t of ['claro', 'oscuro']) {
    await tema(pg, t);
    await completa(pg, 390, path.join(salida, '390-' + t + '-buscar-dentro.png'));
  }
  // Práctica: se practica NVDA desde su tarjeta (Abiertas) y el Diario muestra dos prácticas cerradas.
  await pg.click('#t-operar');
  await pg.click('#sen-lista .sen:has(.sen-h strong:text-is("NVDA")) [data-sen-prac]');
  await pg.waitForFunction(() => /Practicando NVDA/.test(document.getElementById('sen-msg').textContent));
  await pg.evaluate(async (docs) => { const db = await window.claude.use('db'); for (const [id, d] of docs) await db.collection('trades').doc(id).set(d); }, [practica('p-tsla', 'TSLA', 40.5, 9), practica('p-meta', 'META', -27, 10)]);
  await pg.waitForTimeout(300);
  for (const t of ['claro', 'oscuro']) {
    await tema(pg, t);
    await pg.click('#t-abiertas');
    await completa(pg, 390, path.join(salida, '390-' + t + '-abiertas-practica.png'));
    await pg.click('#t-diario'); await pg.click('label[for="d-prac"]'); await pg.waitForTimeout(80);
    await completa(pg, 390, path.join(salida, '390-' + t + '-diario-practica.png'));
    await pg.click('label[for="d-real"]');
  }
  await ctx.close();
  // Señales en rojo: con un dato macro a 15 minutos, ninguna se puede operar; MU muestra además su motivo ámbar.
  {
    const c = await preparar(390, { eventos: [['e-cpi', { ts: BO(10, 14, 11, 20), nombre: 'CPI' }]] });
    await pegarSenales(c.pg, 0);
    for (const t of ['claro', 'oscuro']) {
      await tema(c.pg, t);
      await completa(c.pg, 390, path.join(salida, '390-' + t + '-senales-rojo.png'));
    }
    await c.ctx.close();
  }
  // Protecciones: Hoy con un dato macro cerca, con pausa y con aviso de fin de semana; Operar bloqueada por el dato macro.
  const casos = [
    ['hoy-macro', { eventos: [['e-cpi', { ts: BO(10, 14, 11, 20), nombre: 'CPI' }], ['e-fed', { ts: BO(10, 14, 14, 0), nombre: 'Fed (actas)' }]] }, 'hoy'],
    ['hoy-pausa', { trades: [perdida] }, 'hoy'],
    ['hoy-finde', { hora: NY(10, 16, 11, 5) }, 'hoy'],
    ['senales-bloqueada', { eventos: [['e-cpi', { ts: BO(10, 14, 11, 20), nombre: 'CPI' }]] }, 'operar']
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
  // Diario (v3.7): Estadísticas y Revisión, solo con los datos de datos-estadisticas.js (sin los de la semana del tablero).
  const prepararDiario = async (trades, revisiones = []) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(MOCK);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errores.push(e.message));
    await pg.clock.install({ time: AHORA });
    await pg.goto('file://' + pagina);
    await pg.waitForFunction(() => document.getElementById('v-title').textContent !== 'Cargando tus operaciones…', null, { timeout: 15000 });
    await pg.evaluate(async ([tr, rv]) => { const db = await window.claude.use('db'); for (const [id, d] of tr) await db.collection('trades').doc(id).set(d); for (const [id, d] of rv) await db.collection('revisiones').doc(id).set(d); }, [trades, revisiones]);
    await pg.evaluate(() => new Promise(r => setTimeout(r, 0))); // después de todos los avisos del simulador
    await pg.evaluate(() => document.fonts && document.fonts.ready);
    await pg.click('#t-diario');
    return { ctx, pg };
  };
  const vistasDiario = [
    ['estadisticas-pocas', DE.semanaEjemplo().concat(DE.practicaEjemplo()), [], 'est', 'd-sem', 'd-real'],
    ['estadisticas-mas20', DE.mesEjemplo(), [], 'est', 'd-mes', 'd-real'],
    ['estadisticas-practica', DE.semanaEjemplo().concat(DE.practicaEjemplo()), [], 'est', 'd-sem', 'd-prac'],
    ['revision', DE.semanaEjemplo(), DE.revisionesEjemplo(), 'rev', 'd-sem', 'd-real']
  ];
  for (const [nombre, trades, revisiones, parte, per, modo] of vistasDiario) {
    const c = await prepararDiario(trades, revisiones);
    await c.pg.click('label[for="d-p-' + parte + '"]'); await c.pg.click('label[for="' + per + '"]'); await c.pg.click('label[for="' + modo + '"]');
    await c.pg.evaluate(() => { document.getElementById('estDetalle').open = true; const d = document.querySelector('#revAnteriores details.rev'); if (d) d.open = true; });
    for (const t of ['claro', 'oscuro']) {
      await tema(c.pg, t);
      await completa(c.pg, 390, path.join(salida, '390-' + t + '-' + nombre + '.png'));
    }
    await c.ctx.close();
  }
  // Agentes (v3.8): solo los datos de datos-agentes.js, con el reloj a las 11:05.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(MOCK);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errores.push(e.message));
    await pg.clock.install({ time: AHORA });
    await pg.goto('file://' + pagina);
    await pg.waitForFunction(() => document.getElementById('v-title').textContent !== 'Cargando tus operaciones…', null, { timeout: 15000 });
    await pg.evaluate(async ([a, t, b]) => { const db = await window.claude.use('db'); for (const [id, d] of a) await db.collection('agentes').doc(id).set(d); for (const [id, d] of t) await db.collection('trades').doc(id).set(d); for (const [id, d] of b) await db.collection('bitacora').doc(id).set(d); }, [DA.agentes(), DA.operaciones(), DA.bitacora()]);
    await pg.evaluate(() => new Promise(r => setTimeout(r, 0))); // después de todos los avisos del simulador
    await pg.waitForFunction(() => document.querySelectorAll('#ag-lista .ag').length === 3);
    await pg.evaluate(() => document.fonts && document.fonts.ready);
    for (const t of ['claro', 'oscuro']) {
      await tema(pg, t);
      await pg.click('#t-hoy');
      await pg.evaluate(() => document.querySelectorAll('details.ag-bit').forEach(d => { d.open = false; }));
      await completa(pg, 390, path.join(salida, '390-' + t + '-hoy-agentes.png'));
      // La bitácora de Vigía abierta: la ventana al alto de la página (la barra de pestañas queda al final) y solo el bloque de agentes.
      await pg.evaluate(() => { document.querySelector('[data-ag="vigia"] details.ag-bit').open = true; });
      await pg.setViewportSize({ width: 390, height: await pg.evaluate(() => document.documentElement.scrollHeight) });
      await pg.waitForTimeout(60);
      await (await pg.$('#agentes-box')).screenshot({ path: path.join(salida, '390-' + t + '-bitacora.png') });
      await pg.setViewportSize({ width: 390, height: 860 });
      await pg.click('#t-diario'); await pg.click('label[for="d-agente"]'); await pg.click('label[for="d-p-ops"]'); await pg.waitForTimeout(80);
      await completa(pg, 390, path.join(salida, '390-' + t + '-diario-agente.png'));
      await pg.click('label[for="d-p-est"]'); await pg.waitForTimeout(80);
      await completa(pg, 390, path.join(salida, '390-' + t + '-diario-agente-estadisticas.png'));
      await pg.click('label[for="d-p-ops"]'); await pg.click('label[for="d-real"]');
    }
    await ctx.close();
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
