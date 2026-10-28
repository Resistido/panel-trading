// Pruebas de la Tarea 2: tablero de Hoy, ventana de sesión, curva semanal, sistema de diseño, tema y desborde.
// Uso: node test-tablero.js <carpeta> [archivo]. Reutiliza el simulador de test-panel.js y los datos de datos-tablero.js.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const archivo = process.argv[3] || 'panel-trading.html';
const html = fs.readFileSync(path.join(dir, archivo), 'utf8');
const suite = fs.readFileSync(path.join(__dirname, 'test-panel.js'), 'utf8');
const MOCK = suite.slice(suite.indexOf('const MOCK = `') + 'const MOCK = `'.length, suite.indexOf('})();`;') + '})();'.length);
const { NY, AHORA, datosSemana } = require('./datos-tablero.js');
const { adelantar } = require('./reloj-pruebas.js'); // saltos de reloj sin la carrera del reloj falso (ver el archivo)
const skeleton = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>';
const pagina = path.join(dir, 'test-tablero-page.html');
fs.writeFileSync(pagina, skeleton);

const results = [], errors = [];
const ok = (name, pass, got) => results.push({ name, pass: !!pass, got });
const TABS = ['hoy', 'analizar', 'operar', 'abiertas', 'diario'];

(async () => {
  const browser = await chromium.launch();
  const escuchar = (pg, pre) => {
    pg.on('pageerror', e => errors.push(pre + 'pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(pre + 'console: ' + m.text()); });
  };
  /* Página con el simulador de Claude y un reloj fijo. */
  const abrir = async ({ ancho = 390, hora = AHORA, mock = true, init = null, ctx = null, pre = '' } = {}) => {
    ctx = ctx || await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    if (init) await ctx.addInitScript(init);
    if (mock) await ctx.addInitScript(MOCK);
    const pg = await ctx.newPage();
    escuchar(pg, pre);
    if (hora) await pg.clock.install({ time: hora });
    await pg.goto('file://' + pagina);
    await pg.waitForFunction(() => document.getElementById('v-title').textContent !== 'Cargando tus operaciones…', null, { timeout: 15000 });
    return { ctx, pg };
  };
  const sembrar = async (pg, docs) => {
    await pg.evaluate(async (d) => { const db = await window.claude.use('db'); for (const [id, x] of d) await db.collection('trades').doc(id).set(x); }, docs);
    /* El simulador avisa los cambios con setTimeout: se espera a que termine de re-dibujar para no escribir en un campo que está por reemplazarse. */
    await pg.waitForTimeout(500);
  };
  const txt = (pg, sel) => pg.textContent(sel);

  /* ---- 1) Funciones puras ---- */
  const { pg } = await abrir();
  const puras = await pg.evaluate(({ NYs }) => {
    const P = window.PanelTrading, out = [];
    const eq = (name, got, exp) => out.push({ name, got, pass: JSON.stringify(got) === JSON.stringify(exp) });
    const NY = (y, m, d, h, mi, off) => Date.UTC(y, m - 1, d, h + off, mi); // off = 4 en horario de verano (EDT), 5 en invierno (EST)
    const V = (ts) => P.ventanaSesion(ts);

    // Una fila por franja (miércoles 14-oct-2026, EDT)
    P.VENTANAS.forEach((f) => {
      const [h, mi] = f.desde.split(':').map(Number), v = V(NY(2026, 10, 14, h, mi + 1, 4));
      eq('ventana franja ' + f.desde + '–' + f.hasta + ' → ' + f.nivel, [v.nivel, v.motivo], [f.nivel, f.motivo]);
    });
    // Bordes exactos
    const borde = (h, mi, nivel) => eq('ventana borde ' + h + ':' + String(mi).padStart(2, '0') + ' → ' + nivel, V(NY(2026, 10, 14, h, mi, 4)).nivel, nivel);
    borde(9, 29, 'mala'); borde(9, 30, 'regular'); borde(9, 59, 'regular'); borde(10, 0, 'buena'); borde(11, 29, 'buena'); borde(11, 30, 'regular');
    borde(14, 59, 'regular'); borde(15, 0, 'buena'); borde(15, 59, 'buena'); borde(16, 0, 'mala');
    eq('ventana antes de abrir: motivo de mercado cerrado', /Mercado cerrado: no se operan acciones fuera de horario regular/.test(V(NY(2026, 10, 14, 8, 0, 4)).motivo), true);
    // Próximo cambio
    let v = V(NY(2026, 10, 14, 9, 30, 4));
    eq('próximo cambio desde 9:30 → 10:00 buena', [v.proximoCambio.ts, v.proximoCambio.nivel], [NY(2026, 10, 14, 10, 0, 4), 'buena']);
    v = V(NY(2026, 10, 14, 11, 5, 4));
    eq('próximo cambio desde 11:05 → 11:30 regular', [v.proximoCambio.ts, v.proximoCambio.nivel, v.proximoCambio.bo], [NY(2026, 10, 14, 11, 30, 4), 'regular', '11:30']);
    v = V(NY(2026, 10, 14, 16, 0, 4));
    eq('próximo cambio tras el cierre → mañana 9:30 regular', [v.proximoCambio.ts, v.proximoCambio.nivel], [NY(2026, 10, 15, 9, 30, 4), 'regular']);
    v = V(NY(2026, 10, 14, 7, 0, 4));
    eq('próximo cambio antes de abrir → hoy 9:30', v.proximoCambio.ts, NY(2026, 10, 14, 9, 30, 4));
    eq('ventana horas Bolivia y NY', [v.bo, v.ny], ['07:00', '07:00']);
    // Fin de semana
    v = V(NY(2026, 10, 17, 11, 0, 4));
    eq('sábado → mala', [v.nivel, /Mercado cerrado/.test(v.motivo)], ['mala', true]);
    eq('sábado → próximo cambio lunes 9:30', v.proximoCambio.ts, NY(2026, 10, 19, 9, 30, 4));
    v = V(NY(2026, 10, 18, 10, 30, 4));
    eq('domingo en horario de mercado → mala', v.nivel, 'mala');
    // Feriado (Acción de Gracias, 26-nov-2026, EST)
    v = V(NY(2026, 11, 26, 11, 0, 5));
    eq('feriado → mala', [v.nivel, /Mercado cerrado/.test(v.motivo)], ['mala', true]);
    eq('feriado → próximo cambio al día siguiente 9:30', [v.proximoCambio.ts, v.proximoCambio.nivel], [NY(2026, 11, 27, 9, 30, 5), 'regular']);
    // Cierre temprano (27-nov-2026, 13:00 ET)
    eq('cierre temprano 10:30 → buena', V(NY(2026, 11, 27, 10, 30, 5)).nivel, 'buena');
    v = V(NY(2026, 11, 27, 12, 0, 5));
    eq('cierre temprano 12:00 → regular y cambia a mala a las 13:00', [v.nivel, v.proximoCambio.ts, v.proximoCambio.nivel], ['regular', NY(2026, 11, 27, 13, 0, 5), 'mala']);
    v = V(NY(2026, 11, 27, 13, 0, 5));
    eq('cierre temprano 13:00 → mala, motivo cierre temprano', [v.nivel, /Cierre temprano/.test(v.motivo)], ['mala', true]);
    v = V(NY(2026, 11, 27, 15, 30, 5));
    eq('cierre temprano 15:30: el tramo de 15:00 no existe', v.nivel, 'mala');
    eq('cierre temprano → próximo cambio lunes 9:30', v.proximoCambio.ts, NY(2026, 11, 30, 9, 30, 5));
    // Cambio de horario de verano (EE. UU. pasa a EST el 1-nov-2026; Bolivia no cambia)
    v = V(NY(2026, 10, 30, 16, 0, 4));
    eq('DST: viernes 30-oct tras el cierre → lunes 2-nov 9:30 EST (14:30 UTC)', v.proximoCambio.ts, Date.UTC(2026, 10, 2, 14, 30));
    eq('DST: ese cambio en Bolivia es 10:30', v.proximoCambio.bo, '10:30');
    eq('DST: 14:45 UTC del viernes (10:45 EDT) → buena', V(Date.UTC(2026, 9, 30, 14, 45)).nivel, 'buena');
    eq('DST: 14:45 UTC del lunes (9:45 EST) → regular', V(Date.UTC(2026, 10, 2, 14, 45)).nivel, 'regular');
    eq('DST: lunes 2-nov 13:30 UTC (8:30 EST) → mala', V(Date.UTC(2026, 10, 2, 13, 30)).nivel, 'mala');
    eq('DST marzo 2027: 13:45 UTC del lunes 15 (9:45 EDT) → regular', V(Date.UTC(2027, 2, 15, 13, 45)).nivel, 'regular');
    eq('DST marzo 2027: 13:45 UTC del viernes 12 (8:45 EST) → mala', V(Date.UTC(2027, 2, 12, 13, 45)).nivel, 'mala');

    // Curva de resultados
    const c = (id, r, h, pnl) => ({ id, activo: id, r, pnl: pnl == null ? r * 10 : pnl, cierre: { ts: NYs + h * 3600e3 } });
    let k = P.curvaResultados([]);
    eq('curva sin cierres', [k.n, k.pocos, k.total, k.puntos.length], [0, true, 0, 0]);
    eq('curva sin cierres: sin dibujo', P.trazoCurva(k, 300, 100), null);
    k = P.curvaResultados([c('A', 1.5, 1), c('B', -1, 2)]);
    eq('curva con 2: pocos datos', [k.n, k.pocos, k.total], [2, true, 0.5]);
    eq('curva con 2: sin dibujo', P.trazoCurva(k, 300, 100), null);
    k = P.curvaResultados([c('C', 1, 3), c('A', 1.5, 1), c('B', -1, 2)]);
    eq('curva con 3: ordena por cierre y acumula', k.puntos.map(p => [p.activo, p.acum]), [['A', 1.5], ['B', 0.5], ['C', 1.5]]);
    eq('curva con 3: ya dibuja', [k.pocos, k.total, k.pnl], [false, 1.5, 15]);
    let tz = P.trazoCurva(k, 300, 100, 10);
    eq('trazo: arranca en 0 y tiene un punto por operación', [/^M10 /.test(tz.d), tz.puntos.length, (tz.d.match(/L/g) || []).length], [true, 3, 3]);
    eq('trazo: el máximo arriba y el 0 abajo', [tz.puntos[0].y, tz.cero], [10, 90]);
    k = P.curvaResultados([c('A', -1, 1), c('B', 2.5, 2), c('C', -1, 3), c('D', 0.5, 4), c('E', -1.2, 5)]);
    eq('curva mezclada: acumulado', k.puntos.map(p => p.acum), [-1, 1.5, 0.5, 1, -0.2]);
    tz = P.trazoCurva(k, 300, 100, 10);
    eq('curva mezclada: el 0 queda entre el mínimo y el máximo', tz.cero > 10 && tz.cero < 90 && tz.min === -1 && tz.max === 1.5, true);
    k = P.curvaResultados([c('A', -1, 1), c('B', -1, 2), c('C', -0.5, 3)]);
    tz = P.trazoCurva(k, 300, 100, 10);
    eq('curva solo pérdidas: el 0 arriba', [tz.cero, k.total], [10, -2.5]);
    eq('curva: r faltante cuenta 0 y no rompe', P.curvaResultados([c('A', null, 1), c('B', 1, 2), c('C', 1, 3)]).total, 2);
    eq('curva: ignora cierres sin fecha', P.curvaResultados([{ r: 1 }, c('A', 1, 1)]).n, 1);

    // Abiertas en compacto
    const tr = (o) => P.normTrade(o.id || 'x', Object.assign({ id: 'x', activo: 'NVDA', dir: 'compra', entrada: 100, sl1: 99, unidades: 27, unidadesAbiertas: 27, riesgoInicial: 27, estado: 'abierta', stopActual: 99, ts: NYs }, o));
    eq('stop inicial', P.estadoStop(tr({})), 'inicial');
    eq('stop a favor (compra)', P.estadoStop(tr({ stopActual: 99.5 })), 'favor');
    eq('stop en breakeven', P.estadoStop(tr({ stopActual: 100 })), 'breakeven');
    eq('stop más allá de la entrada = a favor', P.estadoStop(tr({ stopActual: 101 })), 'favor');
    eq('stop peor que el SL1 se señala', P.estadoStop(tr({ stopActual: 98 })), 'peor');
    eq('stop a favor (venta)', P.estadoStop(tr({ dir: 'venta', entrada: 50, sl1: 51, stopActual: 50.5 })), 'favor');
    eq('stop peor (venta)', P.estadoStop(tr({ dir: 'venta', entrada: 50, sl1: 51, stopActual: 51.5 })), 'peor');
    const t0 = tr({});
    let f = P.filaAbierta(t0, { precio: 101, ts: NYs - 5 * 60e3 }, NYs);
    eq('fila: riesgo abierto y R', [f.riesgo, f.rRiesgo, f.stop], [27, 1, 'inicial']);
    eq('fila: precio de hace 5 min → flotante', [Math.round(f.flotante.pnl * 100) / 100, Math.round(f.flotante.r * 100) / 100], [27, 1]);
    f = P.filaAbierta(t0, { precio: 101, ts: NYs - 16 * 60e3 }, NYs);
    eq('fila: precio de hace 16 min → sin número', [f.flotante, f.precio], [null, null]);
    eq('fila: exactamente 15 min ya no vale', P.filaAbierta(t0, { precio: 101, ts: NYs - 15 * 60e3 }, NYs).flotante, null);
    eq('fila: 14 min 59 s todavía vale', P.filaAbierta(t0, { precio: 101, ts: NYs - (15 * 60e3 - 1000) }, NYs).flotante !== null, true);
    eq('fila: sin precio → sin número', P.filaAbierta(t0, null, NYs).flotante, null);
    eq('fila: precio del futuro (reloj raro) → sin número', P.filaAbierta(t0, { precio: 101, ts: NYs + 60e3 }, NYs).flotante, null);
    eq('fila: venta con parcial realizado', Math.round(P.filaAbierta(tr({ dir: 'venta', entrada: 50, sl1: 51, stopActual: 50, unidades: 20, unidadesAbiertas: 10, riesgoInicial: 20, parciales: [{ pnl: 15 }] }), { precio: 49, ts: NYs }, NYs).flotante.pnl * 100) / 100, 25);
    eq('fila: breakeven → riesgo 0', P.filaAbierta(tr({ stopActual: 100 }), null, NYs).riesgo, 0);
    eq('precio reciente: gana el más nuevo', P.precioReciente(tr({ precioVerificado: 100, ts: NYs }), { precio: 101, ts: NYs + 1000 }).precio, 101);
    eq('precio reciente: usa el verificado si no hay otro', P.precioReciente(tr({ precioVerificado: 100.5, ts: NYs }), null), { precio: 100.5, ts: NYs });
    eq('precio reciente: nada', P.precioReciente(tr({ precioVerificado: null }), undefined), null);

    // Semáforo y próxima acción
    eq('semáforo verde', P.semaforoDe({ luz: 'verde' }), { luz: 'verde', palabra: 'Podés operar', icono: 'ok' });
    eq('semáforo ámbar', P.semaforoDe({ luz: 'ambar' }).palabra, 'Con cuidado');
    eq('semáforo rojo', P.semaforoDe({ luz: 'rojo' }).palabra, 'No operes');
    eq('semáforo cerrado', P.semaforoDe({ luz: '' }).palabra, 'Esperá la apertura');
    eq('semáforo desconocido no supone verde', P.semaforoDe({ luz: 'raro' }).luz, '');
    const cfg = P.DEF, est = (trades) => P.estadoDe(trades, cfg, NYs);
    const acciones = [];
    const e0 = est([]); acciones.push(P.proximaAccion(e0, P.veredicto(e0, { estado: 'abierto' }), { estado: 'abierto' }));
    eq('próximo paso verde → Operar con el máximo', [acciones[0].ir, /\$36,00/.test(acciones[0].texto)], ['operar', true]);
    acciones.push(P.proximaAccion(e0, P.veredicto(e0, { estado: 'cerrado', abre: 'mañana a las 10:30' }), { estado: 'cerrado', abre: 'mañana a las 10:30' }));
    eq('próximo paso cerrado → cuándo abre', /mañana a las 10:30/.test(acciones[1].texto), true);
    const perd = (id, pnl) => tr({ id, estado: 'cerrada', unidadesAbiertas: 0, pnl, r: -1, cierre: { ts: NYs - 60e3, pnl } });
    const eDia = est([perd('p1', -27), perd('p2', -27)]);
    acciones.push(P.proximaAccion(eDia, P.veredicto(eDia, { estado: 'abierto' }), { estado: 'abierto' }));
    eq('próximo paso día cerrado', /mañana se reinicia/.test(acciones[2].texto), true);
    const eAb = est([tr({ id: 'a1', unidadesAbiertas: 54 })]);
    acciones.push(P.proximaAccion(eAb, P.veredicto(eAb, { estado: 'abierto' }), { estado: 'abierto' }));
    eq('próximo paso sin presupuesto → Abiertas', [eAb.luz, acciones[3].ir], ['rojo', 'abiertas']);
    eq('regla 8: ningún paso sugiere promediar ni ampliar el stop', acciones.every(a => !/promedi|ampli(á|a|ar)\b|alej/i.test(a.texto.replace(/Nunca amplíes un stop\./, ''))), true);

    // Tema
    eq('tema auto → sin atributo', P.temaAtributo('auto'), null);
    eq('tema claro → light', P.temaAtributo('claro'), 'light');
    eq('tema oscuro → dark', P.temaAtributo('oscuro'), 'dark');
    eq('tema inválido → auto', [P.temaValido('violeta'), P.temaValido(null)], ['auto', 'auto']);
    return out;
  }, { NYs: AHORA });
  puras.forEach(x => ok(x.name, x.pass, x.got));

  /* ---- 2) Tablero con datos simulados ---- */
  // a) Sin posiciones, mercado abierto (miércoles 11:05 NY)
  ok('tablero vacío: semáforo verde con palabra e icono', (await pg.getAttribute('#verdict', 'data-luz')) === 'verde' && /Podés operar/.test(await txt(pg, '#v-estado')) && !!(await pg.$('#v-estado svg')), await txt(pg, '#v-estado'));
  ok('tablero vacío: próximo paso', /Próximo paso: Pegá la señal/.test(await txt(pg, '#v-next')) && !!(await pg.$('#v-next [data-ir="operar"]')), await txt(pg, '#v-next'));
  ok('tablero vacío: ventana en primera línea', (await txt(pg, '#vt-head')).trim() === 'VENTANA ACTUAL: BUENA — Mayor liquidez de la sesión', await txt(pg, '#vt-head'));
  ok('tablero vacío: horas Bolivia y NY', (await txt(pg, '#vt-bo')) === '11:05' && (await txt(pg, '#vt-ny')) === '11:05', null);
  ok('tablero vacío: falta para el cambio', /Pasa a REGULAR en 25 min \(11:30 Bolivia · 11:30 NY\)/.test(await txt(pg, '#vt-prox')), await txt(pg, '#vt-prox'));
  ok('tablero: la ventana dice que no es una predicción', /no una predicción/.test(await txt(pg, '#ventana')), null);
  ok('tablero vacío: sin posiciones', /No tenés posiciones abiertas/.test(await txt(pg, '#tb-ab-lista')), null);
  ok('tablero vacío: pocos datos y sin curva', /Todavía pocos datos/.test(await txt(pg, '#tb-sem')) && !(await pg.$('#tb-sem svg')), await txt(pg, '#tb-sem'));
  const metros = await txt(pg, '#meters');
  ok('tablero vacío: presupuestos con los números de siempre', /\$0,00 \/ \$54,00/.test(metros) && /\$0,00 \/ \$108,00/.test(metros) && /0 \/ 6/.test(metros) && /\$0,00 \/ \$450,00/.test(metros) && (await pg.$$('#meters .bar')).length === 4, metros);
  ok('tablero: el orden es semáforo, ventana, presupuestos, abiertas, semana', await pg.evaluate(() => { const ids = ['verdict', 'ventana', 'presupuestos', 'tb-abiertas', 'tb-semana'].map(id => document.getElementById(id)); return ids.every((el, i) => i === 0 || (ids[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)); }), null);
  ok('tablero: botones y resumen siguen debajo', await pg.evaluate(() => !!(document.getElementById('tablero').compareDocumentPosition(document.getElementById('btnEstado')) & Node.DOCUMENT_POSITION_FOLLOWING) && !!document.getElementById('resumenBox')), null);

  // b) Con posiciones y cierres de la semana
  await sembrar(pg, datosSemana());
  await pg.waitForFunction(() => document.querySelectorAll('#tb-ab-lista .ab-fila').length === 2);
  let filas = await pg.$$eval('#tb-ab-lista .ab-fila', els => els.map(e => e.textContent));
  ok('tablero: una fila por posición, en orden de entrada', /^AVGO/.test(filas[0]) && /^SMCI/.test(filas[1]), filas);
  ok('tablero: fila con dirección, riesgo en $ y R y stop', /Compra/.test(filas[0]) && /Stop en breakeven/.test(filas[0]) && /Riesgo abierto \$0,00 · 0,0 R/.test(filas[0]) && /Venta corta/.test(filas[1]) && /Stop inicial/.test(filas[1]) && /Riesgo abierto \$18,00 · 1,0 R/.test(filas[1]), filas);
  ok('tablero: precio verificado de hace 25 min → sin precio vigente', filas.every(f => /sin precio vigente/.test(f) && !/Ahora/.test(f)), filas);
  ok('tablero: semáforo ámbar con su palabra', (await pg.getAttribute('#verdict', 'data-luz')) === 'ambar' && /Con cuidado/.test(await txt(pg, '#v-estado')) && /\$26,00/.test(await txt(pg, '#v-next')), await txt(pg, '#verdict'));
  ok('tablero: presupuestos con pérdidas y riesgo abierto', /\$28,00 \/ \$54,00/.test(await txt(pg, '#meters')) && /3 \/ 6/.test(await txt(pg, '#meters')), await txt(pg, '#meters'));
  const sem = await txt(pg, '#tb-sem');
  ok('tablero: R acumulado de la semana', /\+0,5 R/.test(sem) && /4 cerradas · \+\$39,50/.test(sem), sem);
  ok('tablero: curva SVG hecha a mano con 4 puntos', (await pg.$$('#tb-sem svg.curva circle')).length === 4 && !!(await pg.$('#tb-sem svg path.c-linea')), null);
  // Precio escrito en Abiertas → Hoy muestra el flotante
  await pg.click('#t-abiertas');
  await pg.fill('.pos[data-id="t-avgo"] [data-now]', '334,10');
  await pg.click('#t-hoy');
  filas = await pg.$$eval('#tb-ab-lista .ab-fila', els => els.map(e => e.textContent));
  ok('tablero: precio vigente → resultado flotante', /Ahora \+\$34,08 · \+1,26 R/.test(filas[0]) && /hace 0 min/.test(filas[0]), filas[0]);
  ok('tablero: la otra posición sigue sin precio', /sin precio vigente/.test(filas[1]), filas[1]);
  ok('tablero: el precio no se guarda en la base', await pg.evaluate(() => [...window.__mockStore.values()].every(v => !('precioAhora' in v) && !('precios' in v))), null);
  // Tocar la fila lleva a Abiertas
  await pg.click('#tb-ab-lista .ab-fila[data-ab="t-smci"]');
  ok('tablero: tocar la fila lleva a Abiertas', await pg.isVisible('#p-abiertas') && !(await pg.isVisible('#p-hoy')), null);
  await pg.click('#t-hoy');
  // c) 16 minutos después el precio ya no vale
  await adelantar(pg, '16:00');
  await pg.waitForTimeout(100);
  filas = await pg.$$eval('#tb-ab-lista .ab-fila', els => els.map(e => e.textContent));
  ok('tablero: precio de más de 15 min → "sin precio vigente" y ningún número', /sin precio vigente/.test(filas[0]) && !/Ahora/.test(filas[0]) && !/\+\$34/.test(filas[0]), filas[0]);
  ok('tablero: la cuenta regresiva de la ventana avanza', /en 9 min/.test(await txt(pg, '#vt-prox')), await txt(pg, '#vt-prox'));

  // d) Presupuesto agotado
  const r2 = await abrir({ pre: 'agotado ' });
  const perdida = (id, h, pnl) => [id, { activo: 'X' + id, dir: 'compra', entrada: 50, entradaPlan: 50, sl1: 49, sl2: 50, tp1: 52, tp2: 54, nivel: 27, nivelEf: 27, d: 1, unidades: 27, unidadesAbiertas: 0, riesgoInicial: 27, stopActual: 49,
    estado: 'cerrada', ts: NY(10, 14, h, 0), parciales: [], movimientos: [], reglasRotas: [], cierre: { ts: NY(10, 14, h, 30), precio: 49, unidades: 27, pnl, motivo: 'SL1' }, pnl, r: pnl / 27, plan: 'si', origen: 'Radar', tipo: 'limite' }];
  await sembrar(r2.pg, [perdida('a', 9, -27), perdida('b', 10, -27)]);
  await r2.pg.waitForFunction(() => document.getElementById('verdict').getAttribute('data-luz') === 'rojo');
  ok('agotado: semáforo rojo con palabra "No operes" e icono', /No operes/.test(await txt(r2.pg, '#v-estado')) && !!(await r2.pg.$('#v-estado svg')) && /Día cerrado/.test(await txt(r2.pg, '#v-title')), await txt(r2.pg, '#verdict'));
  ok('agotado: el diario dice "agotado" y la barra llena', await r2.pg.evaluate(() => { const m = document.querySelector('#meters .meter'); return m.getAttribute('data-luz') === 'rojo' && /agotado/.test(m.textContent) && parseFloat(m.querySelector('.bar i').style.width) === 100; }), await txt(r2.pg, '#meters'));
  ok('agotado: próximo paso sin sugerir entrar', /No abras nada nuevo hoy/.test(await txt(r2.pg, '#v-next')) && !/Ir a (Operar|Señales)/.test(await txt(r2.pg, '#v-next')), await txt(r2.pg, '#v-next'));
  ok('agotado: pocos datos con 2 cerradas', /Todavía pocos datos/.test(await txt(r2.pg, '#tb-sem')) && /llevás 2/.test(await txt(r2.pg, '#tb-sem')) && /−2,0 R/.test(await txt(r2.pg, '#tb-sem')), await txt(r2.pg, '#tb-sem'));
  ok('agotado: chip de cabecera con icono', !!(await r2.pg.$('#mini-ico svg')) && /Día cerrado/.test(await txt(r2.pg, '#mini-txt')), null);
  await r2.ctx.close();

  // e) Sábado: mercado cerrado
  const r3 = await abrir({ hora: NY(10, 17, 12, 0), pre: 'sábado ' });
  ok('sábado: "Esperá la apertura" y ventana MALA', /Esperá la apertura/.test(await txt(r3.pg, '#v-estado')) && /VENTANA ACTUAL: MALA — Mercado cerrado/.test(await txt(r3.pg, '#vt-head')) && /lunes a las/.test(await txt(r3.pg, '#vt-prox')), [await txt(r3.pg, '#v-estado'), await txt(r3.pg, '#vt-prox')]);
  await r3.ctx.close();

  /* ---- 3) Sistema de diseño: contraste de los pares de variables ---- */
  const PARES_TEXTO = [['fg', 'bg'], ['fg', 'surface'], ['fg', 'surface-2'], ['muted', 'bg'], ['muted', 'surface'], ['muted', 'surface-2'], ['accent', 'bg'], ['accent', 'surface'], ['accent', 'surface-2'],
    ['accent-ink', 'accent'], ['loss-ink', 'loss'], ['gain', 'gain-bg'], ['loss', 'loss-bg'], ['warn', 'warn-bg'], ['gain', 'surface'], ['loss', 'surface'], ['warn', 'surface'], ['gain', 'surface-2'], ['loss', 'surface-2'], ['warn', 'surface-2'],
    ['fg', 'gain-bg'], ['fg', 'warn-bg'], ['fg', 'loss-bg'], ['muted', 'gain-bg'], ['muted', 'warn-bg'], ['muted', 'loss-bg'], ['neutral', 'neutral-bg'], ['fg', 'neutral-bg'], ['muted', 'neutral-bg']];
  const PARES_UI = [['line-strong', 'surface'], ['line-strong', 'bg'], ['line-strong', 'surface-2'], ['accent', 'bg'], ['accent', 'surface'], ['gain', 'surface-2'], ['warn', 'surface-2'], ['loss', 'surface-2'],
    ['gain', 'gain-bg'], ['warn', 'warn-bg'], ['loss', 'loss-bg'], ['neutral', 'neutral-bg']];
  const tokens = (p) => p.evaluate(() => { const cs = getComputedStyle(document.documentElement), o = {}; ['bg', 'surface', 'surface-2', 'line', 'line-strong', 'fg', 'muted', 'accent', 'accent-ink', 'gain', 'gain-bg', 'loss', 'loss-bg', 'loss-ink', 'warn', 'warn-bg', 'neutral', 'neutral-bg'].forEach(k => o[k] = cs.getPropertyValue('--' + k).trim()); return o; });
  const lum = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
  const razon = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const temaTokens = {};
  for (const [tema, attr] of [['claro', 'light'], ['oscuro', 'dark']]) {
    await pg.evaluate((a) => document.documentElement.setAttribute('data-theme', a), attr);
    const T = await tokens(pg); temaTokens[tema] = T;
    ok('contraste ' + tema + ': todas las variables son colores hex', Object.values(T).every(v => /^#[0-9a-f]{6}$/i.test(v)), T);
    const malosT = PARES_TEXTO.map(([a, b]) => [a + '/' + b, razon(T[a], T[b])]).filter(x => x[1] < 4.5);
    const malosU = PARES_UI.map(([a, b]) => [a + '/' + b, razon(T[a], T[b])]).filter(x => x[1] < 3);
    ok('contraste ' + tema + ': texto ≥ 4,5:1 en ' + PARES_TEXTO.length + ' pares', !malosT.length, malosT);
    ok('contraste ' + tema + ': interfaz ≥ 3:1 en ' + PARES_UI.length + ' pares', !malosU.length, malosU);
  }
  ok('contraste: los dos temas son distintos', temaTokens.claro.bg !== temaTokens.oscuro.bg, null);
  await pg.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await pg.emulateMedia({ colorScheme: 'dark' });
  ok('automático + sistema oscuro = tokens oscuros', JSON.stringify(await tokens(pg)) === JSON.stringify(temaTokens.oscuro), null);
  await pg.emulateMedia({ colorScheme: 'light' });
  ok('automático + sistema claro = tokens claros', JSON.stringify(await tokens(pg)) === JSON.stringify(temaTokens.claro), null);

  // Sin colores sueltos: fuera de los bloques de variables no hay hex, rgb ni hsl.
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const sinTokens = css.replace(/:root\s*\{[^}]*\}/g, '').replace(/:root:not\(\[data-theme="light"\]\)\s*\{[^}]*\}/g, '').replace(/:root\[data-theme="dark"\]\s*\{[^}]*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const sueltos = sinTokens.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|(?<![-\w])(white|black|red|green|blue|gray|grey)(?![-\w])/g);
  ok('sistema de diseño: CSS sin colores sueltos', !sueltos, sueltos);
  const js = html.slice(html.indexOf('<script>'));
  const jsColores = js.match(/['"][^'"]*(#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![-\w])|rgba?\(|hsla?\()[^'"]*['"]/g);
  ok('sistema de diseño: código sin colores sueltos', !jsColores, jsColores);
  const estilos = (html.match(/style="[^"]*"/g) || []).concat(js.match(/style="[^"']*/g) || []).filter(s => /color|background|border/.test(s) && !/var\(--/.test(s));
  ok('sistema de diseño: estilos en línea solo con variables', !estilos.length, estilos);
  ok('sistema de diseño: espacios, radios y tipografías como variables', /--s-4:16px/.test(css) && /--r-md:\d+px/.test(css) && /--t-md:1rem/.test(css) && /--f-data:/.test(css), null);
  ok('fuentes: solo Google Fonts, sin otros dominios', (html.match(/https?:\/\/[^"' )]+/g) || []).filter(u => !/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(u) && !/example\.com/.test(u)).length === 0, (html.match(/<(link|script)[^>]+(src|href)="https?:[^"]+/g) || []));
  ok('números del tablero en fuente de datos con cifras tabulares', await pg.evaluate(() => ['#vt-bo', '#meters .m-top b', '#tb-sem .sem-top b'].every(s => { const cs = getComputedStyle(document.querySelector(s)); return /Plex Mono|monospace/.test(cs.fontFamily) && /tabular-nums/.test(cs.fontVariantNumeric); })), null);

  /* ---- 4) Zonas táctiles de al menos 44 px ---- */
  await pg.click('#t-abiertas');
  await pg.click('.pos[data-id="t-smci"] [data-act="stop"]');
  const chicos = [];
  for (const t of TABS) {
    await pg.click('#t-' + t);
    if (t === 'diario') await pg.evaluate(() => { document.getElementById('ajustes').open = true; });
    const c = await pg.evaluate(() => [...document.querySelectorAll('button, select, textarea, summary, [role="button"], .seg label, label.check, input:not([type="radio"]):not([type="checkbox"]):not([type="file"])')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })
      .filter(el => { const r = el.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; })
      .map(el => (el.id || el.getAttribute('for') || el.className || el.tagName) + ' ' + Math.round(el.getBoundingClientRect().width) + '×' + Math.round(el.getBoundingClientRect().height)));
    c.forEach(x => chicos.push(t + ': ' + x));
  }
  ok('zonas táctiles ≥ 44 px en las cinco pestañas', !chicos.length, chicos);

  /* ---- 5) Selector de tema ---- */
  await pg.click('#t-hoy');
  const fondo = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await pg.click('label[for="tema-oscuro"]');
  ok('tema: Oscuro cambia los colores', (await pg.getAttribute('html', 'data-theme')) === 'dark' && (await fondo(pg)) === 'rgb(12, 10, 10)', await fondo(pg));
  await pg.click('label[for="tema-claro"]');
  ok('tema: Claro aunque el sistema esté oscuro', await (async () => { await pg.emulateMedia({ colorScheme: 'dark' }); return (await fondo(pg)) === 'rgb(246, 241, 238)'; })(), await fondo(pg));
  await pg.click('label[for="tema-oscuro"]');
  await pg.reload();
  await pg.waitForFunction(() => document.getElementById('v-title').textContent !== 'Cargando tus operaciones…');
  ok('tema: se conserva al recargar', (await pg.getAttribute('html', 'data-theme')) === 'dark' && await pg.isChecked('#tema-oscuro') && (await fondo(pg)) === 'rgb(12, 10, 10)', null);
  ok('tema: se guarda en el navegador, no en la base', await pg.evaluate(() => localStorage.getItem('panel-trading-tema') === 'oscuro' && ![...window.__mockStore.keys()].some(k => /tema/.test(k) || /tema/.test(JSON.stringify(window.__mockStore.get(k))))), null);
  await pg.click('label[for="tema-auto"]');
  ok('tema: Automático quita el atributo y sigue al sistema', (await pg.getAttribute('html', 'data-theme')) === null && (await fondo(pg)) === 'rgb(12, 10, 10)', null);
  await pg.emulateMedia({ colorScheme: 'light' });
  ok('tema: Automático con sistema claro', (await fondo(pg)) === 'rgb(246, 241, 238)', null);
  // Sin localStorage (navegador privado o bloqueado)
  const SIN_LS = `Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('SecurityError: localStorage bloqueado'); } });`;
  const r4 = await abrir({ init: SIN_LS, pre: 'sin localStorage ' });
  ok('sin localStorage: arranca en Automático y el tablero funciona', await r4.pg.isChecked('#tema-auto') && (await r4.pg.getAttribute('html', 'data-theme')) === null && /VENTANA ACTUAL/.test(await txt(r4.pg, '#vt-head')), null);
  await r4.pg.click('label[for="tema-oscuro"]');
  ok('sin localStorage: igual se puede cambiar el tema', (await r4.pg.getAttribute('html', 'data-theme')) === 'dark', null);
  await r4.pg.click('#t-operar');
  await r4.pg.reload();
  await r4.pg.waitForFunction(() => document.getElementById('v-title').textContent !== 'Cargando tus operaciones…');
  ok('sin localStorage: al recargar vuelve a Automático sin romper', await r4.pg.isChecked('#tema-auto') && await r4.pg.isVisible('#p-hoy'), null);
  await r4.ctx.close();

  /* ---- 6) Sin scroll horizontal: cinco pestañas × dos temas × cuatro anchos ---- */
  const largo = datosSemana().map(([id, d]) => [id, Object.assign({}, d, id === 't-smci' ? { activo: 'BRK.B' } : {})]);
  const desbordes = [];
  for (const ancho of [360, 390, 768, 1280]) {
    const r = await abrir({ ancho, pre: ancho + ' ' });
    await sembrar(r.pg, largo);
    await r.pg.waitForFunction(() => document.querySelectorAll('#tb-ab-lista .ab-fila').length === 2);
    await r.pg.click('#t-abiertas'); await r.pg.fill('.pos[data-id="t-avgo"] [data-now]', '1334,10');
    for (const tema of ['claro', 'oscuro']) {
      await r.pg.click('label[for="tema-' + tema + '"]');
      for (const t of TABS) {
        await r.pg.click('#t-' + t);
        if (t === 'operar') await r.pg.click('#btnEjemplo');
        const sw = await r.pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (sw > 1) desbordes.push(ancho + ' ' + tema + ' ' + t + ' +' + sw + 'px');
      }
    }
    if (ancho === 1280) ok('1280: tablero en dos columnas', await r.pg.evaluate(() => { document.getElementById('t-hoy').click(); const c = document.querySelectorAll('#tablero > .tb-col'); return c[0].getBoundingClientRect().top === c[1].getBoundingClientRect().top && c[1].getBoundingClientRect().left > c[0].getBoundingClientRect().right; }), null);
    if (ancho === 390) ok('390: tablero en una columna', await r.pg.evaluate(() => { document.getElementById('t-hoy').click(); const c = document.querySelectorAll('#tablero > .tb-col'); return c[1].getBoundingClientRect().top >= c[0].getBoundingClientRect().bottom; }), null);
    await r.ctx.close();
  }
  ok('sin scroll horizontal en 5 pestañas × 2 temas × 4 anchos (40 combinaciones)', !desbordes.length, desbordes);

  /* ---- 7) Modo local (fuera de Claude) ---- */
  const r5 = await abrir({ mock: false, pre: 'local ' });
  await r5.pg.waitForFunction(() => /fuera de Claude/.test(document.getElementById('aviso').textContent));
  ok('local: el tablero se arma sin guardar', /Podés operar/.test(await txt(r5.pg, '#v-estado')) && /VENTANA ACTUAL: BUENA/.test(await txt(r5.pg, '#vt-head')) && /No tenés posiciones/.test(await txt(r5.pg, '#tb-ab-lista')) && (await r5.pg.$$('#meters .meter')).length === 4, await txt(r5.pg, '#verdict'));
  await r5.pg.click('label[for="tema-oscuro"]');
  ok('local: el tema funciona', (await r5.pg.getAttribute('html', 'data-theme')) === 'dark', null);
  await r5.ctx.close();

  const fails = results.filter(x => !x.pass);
  console.log('Pruebas del tablero: ' + results.length + ' · fallas: ' + fails.length);
  fails.forEach(f => console.log('FALLA ' + f.name + ' → ' + JSON.stringify(f.got)));
  console.log('Errores de página: ' + (errors.length ? errors.join(' | ') : 'ninguno'));
  fs.writeFileSync(path.join(dir, 'resultado-tablero.json'), JSON.stringify({ fecha: new Date().toISOString(), total: results.length, fallas: fails.length, errores: errors, casos: results }, null, 2));
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => {
  console.error('ERROR TEST', e);
  results.filter(x => !x.pass).forEach(f => console.log('FALLA ' + f.name + ' → ' + JSON.stringify(f.got)));
  if (errors.length) console.log('Errores de página: ' + errors.join(' | '));
  process.exit(1);
});
