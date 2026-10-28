// Pruebas de la Tarea 5 (v3.7): Diario en tres partes (Operaciones, Estadísticas, Revisión), estadísticas con cuentas a mano y revisión semanal guardada.
// Uso: node test-estadisticas.js <carpeta> [archivo]. Reutiliza el simulador de test-panel.js y los datos de datos-estadisticas.js (inventados).
// AHORA: miércoles 14-oct-2026, 11:05 en Nueva York = 11:05 en Bolivia (en octubre las dos van en UTC−4).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const archivo = process.argv[3] || 'panel-trading.html';
const html = fs.readFileSync(path.join(dir, archivo), 'utf8');
const suite = fs.readFileSync(path.join(__dirname, 'test-panel.js'), 'utf8');
const MOCK = suite.slice(suite.indexOf('const MOCK = `') + 'const MOCK = `'.length, suite.indexOf('})();`;') + '})();'.length);
const { AHORA } = require('./datos-tablero.js');
const D = require('./datos-estadisticas.js');
const skeleton = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>';
const pagina = path.join(dir, 'test-estadisticas-page.html');
fs.writeFileSync(pagina, skeleton);

const results = [], errors = [];
const ok = (name, pass, got) => results.push({ name, pass: !!pass, got });
const H = D.H;

(async () => {
  const browser = await chromium.launch();
  const abrir = async ({ ancho = 390, hora = AHORA, mock = true, pre = '' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    if (mock) await ctx.addInitScript(MOCK);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errors.push(pre + 'pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(pre + 'console: ' + m.text()); });
    if (hora) await pg.clock.install({ time: hora });
    await pg.goto('file://' + pagina);
    await pg.waitForFunction(() => document.getElementById('v-title').textContent !== 'Cargando tus operaciones…', null, { timeout: 15000 });
    return { ctx, pg };
  };
  // El simulador avisa a cada suscripción con un setTimeout(0); el reloj falso los dispara en orden de creación, así que un
  // setTimeout(0) agendado después corre cuando la página ya recibió todos los avisos y se re-dibujó.
  const sembrar = async (pg, col, docs) => {
    await pg.evaluate(async ([c, d]) => { const db = await window.claude.use('db'); for (const [id, x] of d) await db.collection(c).doc(id).set(x); }, [col, docs]);
    await pg.evaluate(() => new Promise(r => setTimeout(r, 0)));
  };
  const guardados = (pg, col) => pg.evaluate((c) => [...window.__mockStore.entries()].filter(([k]) => k.startsWith(c + '/')).map(([k, v]) => Object.assign({ _id: k.split('/')[1] }, v)), col);
  const txt = (pg, sel) => pg.textContent(sel);
  const visible = (pg, sel) => pg.evaluate((s) => { const e = document.querySelector(s); return !!e && e.getBoundingClientRect().height > 0; }, sel);
  const parte = async (pg, p) => { await pg.click('label[for="d-p-' + p + '"]'); };
  const tarjetas = (pg) => pg.$$eval('#estStats > .stats .stat', l => l.map(c => ({ label: c.querySelector('span').textContent, val: c.querySelector('b').textContent, cls: c.querySelector('b').className, sub: (c.querySelector('small') || {}).textContent || '', exp: (c.querySelector('.exp') || {}).textContent || '', x: Math.round(c.getBoundingClientRect().left) })));
  // Cada .res visible: el signo en el texto y la flecha del CSS coinciden (▲ con +, ▼ con −, nada sin signo).
  const flechas = (pg, sel) => pg.evaluate((s) => [...document.querySelectorAll(s)].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ t: e.textContent.trim(), c: e.className, f: getComputedStyle(e, '::before').content })), sel);
  const bien = (l) => l.length > 0 && l.every(x => /\bup\b/.test(x.c) ? /^\+/.test(x.t) && x.f.includes('▲') : /\bdown\b/.test(x.c) ? /^−/.test(x.t) && x.f.includes('▼') : !/^[+−]/.test(x.t) && (x.f === 'none' || x.f === 'normal'));

  /* ---- 1) Funciones puras, con las cuentas hechas a mano ---- */
  const { ctx, pg } = await abrir();
  const C = (id, o) => D.cerrada(id, o)[1];
  const L = (lista) => lista.map(([, t]) => t);
  const datos = {
    semana: L(D.semanaEjemplo()),
    todasGanadas: [C('g1', { entra: H(13, 10, 10), sale: H(13, 10, 40), riesgo: 10, pnl: 10 }), C('g2', { entra: H(13, 10, 50), sale: H(13, 11, 20), riesgo: 10, pnl: 5 }), C('g3', { entra: H(14, 10, 10), sale: H(14, 10, 50), riesgo: 10, pnl: 20 })],
    empates: [C('e1', { entra: H(13, 10, 10), sale: H(13, 10, 40), pnl: 0 }), C('e2', { entra: H(13, 10, 50), sale: H(13, 11, 20), pnl: 0.003 }), C('e3', { entra: H(14, 10, 10), sale: H(14, 10, 50), pnl: -0.003 })],
    // Parcial de +13,50 en el TP1 y el resto en la entrada (total +13,50: ganada); parcial de +5 y el resto con −8 (total −3: perdida).
    parciales: [C('p1', { entra: H(13, 10, 10), sale: H(13, 11, 0), riesgo: 27, pnl: 13.5, parciales: [{ ts: H(13, 10, 30), tipo: 'TP1', precio: 51, unidades: 13.5, pnl: 13.5 }], motivo: 'Stop en la entrada' }),
      C('p2', { entra: H(14, 10, 10), sale: H(14, 10, 50), riesgo: 10, pnl: -3, parciales: [{ ts: H(14, 10, 20), tipo: 'Parcial', precio: 50.5, unidades: 10, pnl: 5 }] })],
    // R en orden de cierre: +1 +1 −0,5 −1 +0,3 −2 +4 → acumulado 1 · 2 · 1,5 · 0,5 · 0,8 · −1,2 · 2,8: caída máxima 3,2 R (de +2 a −1,2).
    caida: [1, 1, -0.5, -1, 0.3, -2, 4].map((r, i) => C('c' + i, { entra: H(13, 10, i * 5), sale: H(13, 11, i * 5), riesgo: 10, pnl: r * 10 })),
    // G [0] G P P [0] P → racha actual 3 perdidas, mejor 2 ganadas, peor 3 perdidas (las de cero no suman ni cortan).
    rachas: [1, 0, 1, -1, -1, 0, -1].map((r, i) => C('r' + i, { entra: H(13, 10, i * 5), sale: H(13, 11, i * 5), riesgo: 10, pnl: r * 10 })),
    // G G G P G G → actual 2 ganadas, mejor 3, peor 1.
    rachas2: [1, 1, 1, -1, 1, 1].map((r, i) => C('s' + i, { entra: H(13, 10, i * 5), sale: H(13, 11, i * 5), riesgo: 10, pnl: r * 10 })),
    todasFuera: [C('f1', { entra: H(13, 10, 10), sale: H(13, 10, 40), pnl: 10, plan: 'no' }), C('f2', { entra: H(13, 10, 50), sale: H(13, 11, 20), pnl: -10, rotas: ['Stop no preparado'] })],
    veinteClaude: Array.from({ length: 20 }, (_, i) => C('k' + i, { entra: H(13, 10, i), sale: H(13, 11, i), pnl: i % 2 ? 10 : -10, fuente: 'Claude', origen: 'Capturas' })),
    revisiones: D.revisionesEjemplo().map(([id, r]) => Object.assign({ id }, r)).concat([{ id: 'rx', ts: H(13, 9, 0), periodo: 'este mes', texto: 'Del mes' }]) // sin "semana": se saca de la fecha
  };
  const puras = await pg.evaluate((d) => {
    const P = window.PanelTrading, out = [];
    const r4 = (x) => x == null ? x : Math.round(x * 10000) / 10000;
    const eq = (name, got, exp) => out.push({ name, got, pass: JSON.stringify(got) === JSON.stringify(exp) });
    const resumen = (st) => ({ n: st.n, gan: st.gan, perd: st.perd, emp: st.emp, pnl: r4(st.pnl), rSum: r4(st.rSum), rAvg: r4(st.rAvg), ganado: r4(st.ganado), perdido: r4(st.perdido), factor: r4(st.factor) });

    // Cero operaciones: nada inventado (sin factor, sin caída, sin racha, sin promedio sin las fuera del plan)
    const z = P.estadisticas([]);
    eq('cero: todo en cero y sin factor', resumen(z), { n: 0, gan: 0, perd: 0, emp: 0, pnl: 0, rSum: 0, rAvg: 0, ganado: 0, perdido: 0, factor: null });
    eq('cero: sin caída, sin racha, sin "fuera del plan"', [z.caida, z.racha, z.fueraPlan.n, z.fueraPlan.promSin], [{ r: 0, desde: 0, hasta: 0 }, { actual: null, mejor: 0, peor: 0 }, 0, null]);
    eq('cero: sin aviso de pocas (no hay nada que avisar)', P.avisoPocas(0), null);
    eq('cero: quién acierta sin filas', P.quienAcierta([]).filas.length, 0);
    eq('cero: por ventana, las tres filas vacías y sin barra', P.porVentana([]).map(f => [f.clave, f.n, f.rAvg, f.lado, f.barra]), [['BUENA', 0, null, null, 0], ['REGULAR', 0, null, null, 0], ['MALA', 0, null, null, 0]]);

    // La semana de ejemplo (ver datos-estadisticas.js)
    const s = P.estadisticas(d.semana);
    eq('semana: 6 cerradas, 2 ganadas, 3 perdidas, 1 en cero; +$12,50 y +0,5 R; promedio 0,5/6', resumen(s), { n: 6, gan: 2, perd: 3, emp: 1, pnl: 12.5, rSum: 0.5, rAvg: 0.0833, ganado: 55.5, perdido: 43, factor: 1.2907 });
    eq('semana: caída máxima 2,5 R, de +1,5 a −1,0', s.caida, { r: 2.5, desde: 1.5, hasta: -1 });
    eq('semana: racha actual 1 ganada, mejor 1, peor 3 (la de cero no corta)', s.racha, { actual: { tipo: 'ganadas', n: 1 }, mejor: 1, peor: 3 });
    eq('semana: fuera de tu plan 2 (una vez cada una), −1,5 R, −$23; sin ellas +0,5 R en 4', [s.fueraPlan.n, r4(s.fueraPlan.r), r4(s.fueraPlan.pnl), s.fueraPlan.nSin, r4(s.fueraPlan.promSin)], [2, -1.5, -23, 4, 0.5]);
    eq('semana: reglas rotas 2 y fuera del plan 1 (lo de antes no cambia)', [s.rotasN, r4(s.rotasR), s.fueraN, r4(s.fueraR), s.mejor, s.peor], [2, -1.5, 1, -1, 1.5, -1]);
    eq('semana: el orden de entrada no cambia nada (al revés da lo mismo)', JSON.stringify(P.estadisticas(d.semana.slice().reverse())), JSON.stringify(s));
    const copia = JSON.stringify(d.semana); P.estadisticas(d.semana);
    eq('semana: no modifica la lista que recibe', JSON.stringify(d.semana) === copia, true);
    eq('orden de cierre: de la más vieja a la más nueva', P.enOrdenDeCierre(d.semana.slice().reverse()).map(t => t.activo), ['NVDA', 'MU', 'AMD', 'TSLA', 'AAPL', 'AVGO']);

    // Todas ganadas: el factor no es infinito
    const g = P.estadisticas(d.todasGanadas);
    eq('todas ganadas: 3 de 3, sin pérdidas → factor null (la pantalla dice "Sin pérdidas todavía")', [g.gan, g.n, g.perdido, g.factor], [3, 3, 0, null]);
    eq('todas ganadas: sin caída y racha de 3 ganadas', [g.caida.r, g.racha], [0, { actual: { tipo: 'ganadas', n: 3 }, mejor: 3, peor: 0 }]);
    eq('todas ganadas: promedio (1 + 0,5 + 2) / 3', r4(g.rAvg), 1.1667);

    // Empates: medio centavo de tolerancia; no son ganadas
    const e = P.estadisticas(d.empates);
    eq('empates: $0, +$0,003 y −$0,003 cuentan en cero, no como ganadas ni perdidas', [e.gan, e.perd, e.emp, e.factor], [0, 0, 3, null]);
    eq('empates: sin racha (no suman ni cortan)', e.racha, { actual: null, mejor: 0, peor: 0 });
    eq('empates: agrupar también los cuenta aparte', P.agrupar(d.empates, P.VER_POR.fuente).map(f => [f[0], f[1].n, f[1].gan, f[1].perd, f[1].emp]), [['Sin dato', 3, 0, 0, 3]]);

    // Salidas parciales: cuenta el total de la operación (parcial + cierre)
    const p = P.estadisticas(d.parciales);
    eq('parciales: +13,50 (TP1 y resto en la entrada) es ganada y +$5 −$8 es perdida', [p.gan, p.perd, r4(p.ganado), r4(p.perdido), r4(p.factor)], [1, 1, 13.5, 3, 4.5]);
    eq('parciales: R del total (13,5/27 = 0,5 y −3/10 = −0,3)', [r4(p.rSum), r4(p.rAvg)], [0.2, 0.1]);

    // Caída máxima y rachas
    eq('caída: 3,2 R desde +2 hasta −1,2 (en orden de cierre)', P.estadisticas(d.caida).caida, { r: 3.2, desde: 2, hasta: -1.2 });
    eq('caída: mezclar la lista no cambia la caída', P.estadisticas(d.caida.slice().sort((a, b) => a.activo < b.activo ? 1 : -1)).caida, { r: 3.2, desde: 2, hasta: -1.2 });
    eq('caída: si la primera pierde, la caída se mide desde 0', P.estadisticas([d.caida[3]]).caida, { r: 1, desde: 0, hasta: -1 });
    eq('rachas: G 0 G P P 0 P → actual 3 perdidas, mejor 2, peor 3', P.estadisticas(d.rachas).racha, { actual: { tipo: 'perdidas', n: 3 }, mejor: 2, peor: 3 });
    eq('rachas: G G G P G G → actual 2 ganadas, mejor 3, peor 1', P.estadisticas(d.rachas2).racha, { actual: { tipo: 'ganadas', n: 2 }, mejor: 3, peor: 1 });
    const tf = P.estadisticas(d.todasFuera).fueraPlan;
    eq('fuera del plan: si todas lo son, no hay promedio sin ellas (null, no cero)', [tf.n, tf.nSin, tf.promSin], [2, 0, null]);

    // Aviso de menos de 20
    eq('aviso: 6 → texto exacto', P.avisoPocas(6), '6 operaciones cerradas: son primeras señales, no conclusiones. Hacen falta 20 o más.');
    eq('aviso: 1 → singular', P.avisoPocas(1), '1 operación cerrada: son primeras señales, no conclusiones. Hacen falta 20 o más.');
    eq('aviso: 19 sí, 20 ya no', [!!P.avisoPocas(19), P.avisoPocas(20), P.avisoPocas(57)], [true, null, null]);
    eq('aviso: el umbral es una constante (20)', P.MIN_CONCLUSION, 20);

    // ¿Quién acierta más?
    const q = P.quienAcierta(d.semana);
    eq('fuente: ChatGPT, Claude, Propia y Sin dato, en ese orden', q.filas.map(f => f.clave), ['ChatGPT', 'Claude', 'Propia', 'Sin dato']);
    eq('fuente: operaciones, ganadas y promedio en R', q.filas.map(f => [f.n, f.gan, r4(f.rAvg)]), [[3, 2, 0.6667], [1, 0, 0], [1, 0, -1], [1, 0, -0.5]]);
    eq('fuente: dentro de ChatGPT, por origen (Pre-apertura 1 con −1 R, Radar 2 con +1,5 R)', q.filas[0].origenes.map(o => [o.clave, o.n, o.gan, r4(o.rAvg)]), [['Pre-apertura', 1, 0, -1], ['Radar', 2, 2, 1.5]]);
    eq('fuente: solo ChatGPT se abre por origen', q.filas.slice(1).every(f => f.origenes.length === 0), true);
    eq('fuente: con pocas operaciones, pocas = true', q.pocas, true);
    eq('fuente: con 20 o más en cada fuente, pocas = false', P.quienAcierta(d.veinteClaude).pocas, false);
    eq('fuente: una desconocida se lee "Sin dato" (no se inventa)', P.agrupar([Object.assign({}, d.semana[0], { fuente: 'Gemini' })], P.VER_POR.fuente).map(f => f[0]), ['Sin dato']);

    // Por ventana de sesión (hora de entrada)
    const v = P.porVentana(d.semana);
    eq('ventana: BUENA 3 (+0,67 R), REGULAR 2 (−0,5 R), MALA 1 (−0,5 R)', v.map(f => [f.clave, f.n, r4(f.rAvg)]), [['BUENA', 3, 0.6667], ['REGULAR', 2, -0.5], ['MALA', 1, -0.5]]);
    eq('ventana: barras divergentes desde el cero (la mayor al borde, las otras 0,5/0,667 = 75%)', v.map(f => [f.lado, f.barra]), [['pos', 100], ['neg', 75], ['neg', 75]]);
    const vt = (ts) => P.VER_POR.ventana.clave({ ts });
    eq('ventana: 15:30 BUENA, 09:45 REGULAR, 16:30 y 08:00 MALA, sábado MALA', [vt(Date.UTC(2026, 9, 13, 19, 30)), vt(Date.UTC(2026, 9, 13, 13, 45)), vt(Date.UTC(2026, 9, 13, 20, 30)), vt(Date.UTC(2026, 9, 13, 12, 0)), vt(Date.UTC(2026, 9, 17, 15, 0))], ['BUENA', 'REGULAR', 'MALA', 'MALA', 'MALA']);
    const sinHora = Object.assign({}, d.semana[0], { ts: NaN });
    eq('ventana: sin hora de entrada válida no rompe ni se inventa (fuera de las tres filas, "Sin hora" en Más detalle)', [P.porVentana([sinHora]).map(f => f.n), P.agrupar([sinHora], P.VER_POR.ventana).map(f => f[0])], [[0, 0, 0], ['Sin hora']]);
    eq('ventana: un resultado en cero no dibuja barra', P.porVentana(d.empates).map(f => [f.clave, f.n, f.lado, f.barra]), [['BUENA', 3, null, 0], ['REGULAR', 0, null, 0], ['MALA', 0, null, 0]]);

    // VER_POR: las tablas de siempre más fuente y ventana
    eq('Más detalle: las tablas de antes y las dos nuevas', Object.keys(P.VER_POR), ['nivel', 'seguridad', 'hora', 'tipo', 'origen', 'dia', 'dir', 'fuente', 'ventana']);

    // Revisiones guardadas por semana
    const rs = P.revisionesPorSemana(d.revisiones);
    eq('revisiones: por semana, la más nueva arriba; la que no tiene "semana" se ubica por su fecha', rs.map(x => [x.semana, x.revisiones.map(r => r.id)]), [['2026-10-12', ['rx', d.revisiones[0].id]], ['2026-10-05', [d.revisiones[1].id]]]);
    eq('revisiones: sin datos o con fechas inválidas no se rompe', [P.revisionesPorSemana([]).length, P.revisionesPorSemana(null).length, P.revisionesPorSemana([{ ts: 'x' }]).length], [0, 0, 0]);

    // Lo que recibe Claude
    const dr = P.datosRevisionDe(d.semana, [], P.DEF, 'semana');
    eq('revisión: los datos de siempre siguen (operaciones, ganadas, totales)', [dr.periodo, dr.operaciones, dr.ganadas, dr.perdidas, dr.resultadoUSD, dr.totalR, dr.promedioR], ['esta semana', 6, 2, 3, 12.5, 0.5, 0.08]);
    eq('revisión: métricas nuevas', dr.metricas, { promedioPorOperacionR: 0.08, ganadas: 2, perdidas: 3, enCero: 1, porcentajeGanadas: 33, factorDeBeneficio: 1.29, factorDeBeneficioTexto: null, ganadoUSD: 55.5, perdidoUSD: 43,
      caidaMaximaR: 2.5, rachaActual: '1 ganada', mejorRachaGanadas: 1, peorRachaPerdidas: 3, totalR: 0.5, totalUSD: 12.5 });
    eq('revisión: tabla por fuente con ChatGPT por origen', dr.porFuente.map(f => [f.fuente, f.operaciones, f.ganadas, f.promedioR, (f.porOrigen || []).map(o => o.origen + ':' + o.operaciones)]), [['ChatGPT', 3, 2, 0.67, ['Pre-apertura:1', 'Radar:2']], ['Claude', 1, 0, 0, []], ['Propia', 1, 0, -1, []], ['Sin dato', 1, 0, -0.5, []]]);
    eq('revisión: por ventana y fuera de tu plan', [dr.porVentanaDeSesion.map(f => f.ventana + ':' + f.operaciones + ':' + f.promedioR), dr.reglasRotasOFueraDelPlan], [['BUENA:3:0.67', 'REGULAR:2:-0.5', 'MALA:1:-0.5'], { operaciones: 2, totalR: -1.5, promedioSinEllasR: 0.5 }]);
    eq('revisión: con menos de 20 lo marca y trae el aviso', [dr.pocasOperaciones, dr.aviso], [true, '6 operaciones cerradas: son primeras señales, no conclusiones. Hacen falta 20 o más.']);
    eq('revisión: las tablas de Más detalle incluyen Fuente y Ventana de sesión', Object.keys(dr.grupos).slice(-2), ['Fuente', 'Ventana de sesión']);
    eq('revisión: sin pérdidas, el factor va como null con su texto', [P.datosRevisionDe(d.todasGanadas, [], P.DEF, 'mes').metricas.factorDeBeneficio, P.datosRevisionDe(d.todasGanadas, [], P.DEF, 'mes').metricas.factorDeBeneficioTexto], [null, 'Sin pérdidas todavía']);
    const pr = P.promptRevision(dr);
    eq('revisión: el prompt mantiene la regla de menos de 20 ("primeras señales")', /Si hay menos de 20 operaciones cerradas, decilo al principio y no saques conclusiones firmes: hablá de "primeras señales"\./.test(pr), true);
    eq('revisión: el prompt pide usar las métricas y avisa que entre fuentes puede ser suerte', /porFuente/.test(pr) && /puede ser suerte/.test(pr) && /no lo llames infinito/.test(pr) && /"metricas":\{/.test(pr) && /"porFuente":\[/.test(pr), true);
    eq('revisión: mismos títulos de siempre', ['## Qué funciona', '## Qué no funciona', '## Reglas rotas', '## Un cambio para la próxima semana'].every(t => pr.includes(t)), true);
    return out;
  }, datos);
  puras.forEach(r => ok(r.name, r.pass, r.got));
  await ctx.close();

  /* ---- 2) Pantalla: selector de tres partes y Estadísticas con la semana de ejemplo (menos de 20) ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'semana ' });
    await sembrar(pg, 'trades', D.semanaEjemplo().concat(D.practicaEjemplo()));
    await pg.click('#t-diario');
    ok('selector: Operaciones | Estadísticas | Revisión arriba del Diario, Operaciones por defecto', (await pg.$$eval('input[name="d-parte"] + label', l => l.map(x => x.textContent))).join('|') === 'Operaciones|Estadísticas|Revisión' && await pg.isChecked('#d-p-ops') &&
      await pg.evaluate(() => { const s = document.querySelector('.seg.partes'), m = document.querySelector('input[name="d-modo"]').parentElement; return s.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING; }), null);
    const vistas = async () => pg.evaluate(() => ['operaciones', 'estadisticas', 'revision'].filter(p => document.getElementById('d-' + p).getBoundingClientRect().height > 0));
    ok('Operaciones: la lista, CSV, respaldo, Comprobar señales y Reglas y ajustes (y nada de Estadísticas ni Revisión)', JSON.stringify(await vistas()) === '["operaciones"]' && await visible(pg, '#diarioLista .tr') && await visible(pg, '#btnCsv') && await visible(pg, '#btnJson') && await visible(pg, '#comprobarBox') && await visible(pg, '#ajustes') && !(await visible(pg, '#revisionBox')) && !(await visible(pg, '#estStats')), await vistas());
    ok('Operaciones: el resumen corto sigue (6 operaciones, +$12,50) y lleva a Estadísticas', /Operaciones6/.test(await txt(pg, '#diarioStats')) && /\+\$12,50/.test(await txt(pg, '#diarioStats')) && !!(await pg.$('#diarioStats [data-ir-parte="estadisticas"]')), await txt(pg, '#diarioStats'));
    await pg.click('#diarioStats [data-ir-parte="estadisticas"]');
    ok('Operaciones → "Ver estadísticas" cambia de parte', JSON.stringify(await vistas()) === '["estadisticas"]' && await pg.isChecked('#d-p-est'), await vistas());
    await parte(pg, 'rev');
    ok('selector: Revisión muestra solo la revisión', JSON.stringify(await vistas()) === '["revision"]' && await visible(pg, '#revisionBox'), await vistas());
    await parte(pg, 'est');
    ok('selector: Estadísticas muestra solo las estadísticas', JSON.stringify(await vistas()) === '["estadisticas"]', await vistas());
    ok('selector: la parte elegida va con relleno de marca (navegación) y las otras no', await pg.evaluate(() => { const on = getComputedStyle(document.querySelector('label[for="d-p-est"]')).backgroundColor, off = getComputedStyle(document.querySelector('label[for="d-p-ops"]')).backgroundColor; return on !== off && on === getComputedStyle(document.getElementById('t-diario')).backgroundColor; }), null);

    // Aviso de menos de 20: ámbar, con icono y palabra
    const av = await pg.evaluate(() => { const a = document.querySelector('#estStats .aviso-p'); return a && { tag: a.querySelector('.ap-tag').textContent, ico: !!a.querySelector('.ap-tag svg'), p: a.querySelector('p').textContent, fondo: getComputedStyle(a).backgroundColor, warn: getComputedStyle(document.documentElement).getPropertyValue('--warn-bg').trim() }; });
    ok('aviso: "6 operaciones cerradas: son primeras señales…" en ámbar con icono y palabra', av && av.tag === 'Pocos datos' && av.ico && av.p === '6 operaciones cerradas: son primeras señales, no conclusiones. Hacen falta 20 o más.', av);
    // Seis tarjetas
    const c = await tarjetas(pg);
    ok('tarjetas: las seis, en orden', c.map(x => x.label).join('|') === 'Promedio por operación|Ganadas|Factor de beneficio|Caída máxima|Racha actual|Total del período', c.map(x => x.label));
    ok('tarjetas: cada una con su explicación en una línea debajo', c.length === 6 && c.every(x => x.exp.length > 20 && x.exp.length < 100), c.map(x => x.exp));
    ok('tarjetas: dos columnas en el celular (390 px)', new Set(c.map(x => x.x)).size === 2, c.map(x => x.x));
    const por = Object.fromEntries(c.map(x => [x.label, x]));
    ok('Promedio por operación: +0,08 R con ▲ y "por cada 1 R"', por['Promedio por operación'].val === '+0,08 R' && /\bup\b/.test(por['Promedio por operación'].cls) && /por cada 1 R/.test(por['Promedio por operación'].exp), por['Promedio por operación']);
    ok('Ganadas: "2 de 6", 33%, y las de cero aparte', por.Ganadas.val === '2 de 6' && /^33% · 3 perdidas · 1 en cero$/.test(por.Ganadas.sub) && /cero van aparte/.test(por.Ganadas.exp), por.Ganadas);
    ok('Factor de beneficio: 1,29 con lo ganado y lo perdido en dólares', por['Factor de beneficio'].val === '1,29' && por['Factor de beneficio'].sub === 'ganado +$55,50 · perdido −$43,00' && /dividido lo perdido, en dólares/.test(por['Factor de beneficio'].exp), por['Factor de beneficio']);
    ok('Caída máxima: −2,5 R con ▼, de +1,5 R a −1,0 R', por['Caída máxima'].val === '−2,5 R' && /\bdown\b/.test(por['Caída máxima'].cls) && por['Caída máxima'].sub === 'de +1,5 R a −1,0 R' && /desde un máximo/.test(por['Caída máxima'].exp), por['Caída máxima']);
    ok('Racha actual: 1 ganada, mejor 1 y peor 3 en chico', por['Racha actual'].val === '1 ganada' && por['Racha actual'].sub === 'mejor 1 ganada · peor 3 perdidas', por['Racha actual']);
    ok('Total del período: +0,5 R y +$12,50', por['Total del período'].val === '+0,5 R' && por['Total del período'].sub === '+$12,50', por['Total del período']);
    // ¿Quién acierta más?
    const filas = await pg.$$eval('#estStats .tbl-wrap tbody tr', l => l.map(r => [...r.children].map(td => td.textContent).join('|') + (r.classList.contains('sub') ? ' (sub)' : '')));
    ok('¿Quién acierta más?: por fuente y ChatGPT por origen, con ops, ganadas y promedio', JSON.stringify(filas) === JSON.stringify(['ChatGPT|3|2 · 67%|+0,67 R', 'ChatGPT, Pre-apertura|1|0 · 0%|−1,0 R (sub)', 'ChatGPT, Radar|2|2 · 100%|+1,5 R (sub)', 'Claude|1|0 · 0%|0,0 R', 'Propia|1|0 · 0%|−1,0 R', 'Sin dato|1|0 · 0%|−0,5 R']), filas);
    ok('¿Quién acierta más?: columnas Fuente, Ops, Ganadas y Promedio', (await pg.$$eval('#estStats .tbl-wrap thead th', l => l.map(x => x.textContent))).join() === 'Fuente,Ops,Ganadas,Promedio', null);
    ok('¿Quién acierta más?: debajo, "puede ser suerte"', /Con tan pocas operaciones, la diferencia entre fuentes puede ser suerte\./.test(await txt(pg, '#estStats')), null);
    // Por ventana de sesión: barras divergentes con signo y flecha
    const ven = await pg.$$eval('#estStats .vent li', l => l.map(li => { const i = li.querySelector('.vent-bar i'), b = li.querySelector('.vent-bar').getBoundingClientRect(); return { n: li.querySelector('.vent-n').textContent, ico: !!li.querySelector('.vent-n svg'), v: li.querySelector('.vent-v').textContent, lado: i && i.getAttribute('data-lado'), w: i ? Math.round(i.getBoundingClientRect().width / b.width * 1000) / 10 : 0, izq: i ? Math.round(i.getBoundingClientRect().left - b.left) : null, centro: Math.round(b.width / 2) }; }));
    ok('ventana: BUENA, REGULAR y MALA con icono, cantidad y promedio con signo', ven.map(x => x.n + '|' + x.v).join(' / ') === 'BUENA3 operaciones|+0,67 R / REGULAR2 operaciones|−0,5 R / MALA1 operación|−0,5 R' && ven.every(x => x.ico), ven);
    ok('ventana: barras desde el cero, a la derecha lo positivo y a la izquierda lo negativo (50% y 37,5%)', ven[0].lado === 'pos' && ven[0].w === 50 && Math.abs(ven[0].izq - ven[0].centro) <= 1 && ven[1].lado === 'neg' && ven[1].w === 37.5 && ven[2].lado === 'neg' && ven[2].w === 37.5 && ven[1].izq < ven[1].centro, ven);
    // Fuera de tu plan
    const fuera = await txt(pg, '#estFuera');
    ok('Fuera de tu plan: 2 de 6, cuánto sumaron y el promedio sin ellas', /Operaciones2 de 61 con reglas rotas|Operaciones2 de 62 con reglas rotas/.test(fuera) && /Sumaron−1,5 R−\$23,00/.test(fuera) && /Sin ellas, tu promedio habría sido \+0,5 R por operación \(en 4 operaciones\), en vez de \+0,08 R\./.test(fuera), fuera);
    // Todo R e importe con signo y flecha coherentes
    const fl = await flechas(pg, '#d-estadisticas .res');
    ok('signos y flechas: todo R e importe de Estadísticas con +/− y ▲/▼ coherentes', bien(fl) && fl.length >= 25, fl.filter(x => !bien([x])).concat([fl.length]));
    // Más detalle: desplegable con las tablas de antes y las dos nuevas
    ok('Más detalle: cerrado al llegar', await visible(pg, '#estDetalle') && !(await pg.evaluate(() => document.getElementById('estDetalle').open)), null);
    await pg.click('#estDetalle > summary');
    const opc = await pg.$$eval('#verPor option', l => l.map(o => o.textContent));
    ok('Más detalle: nivel, seguridad, hora, tipo, señal, día, dirección, fuente y ventana', opc.join('|') === 'Nivel de riesgo|Seguridad del setup|Hora de entrada (Bolivia)|Tipo de acción|Señal|Día de la semana|Dirección|Fuente|Ventana de sesión', opc);
    await pg.selectOption('#verPor', 'fuente');
    ok('Más detalle: tabla por fuente (ops, acierto, R y $)', /ChatGPT3.*67%.*\+2,0 R.*\+\$35,50/.test(await txt(pg, '#estTablas')) && /Sin dato1.*−0,5 R.*−\$5,00/.test(await txt(pg, '#estTablas')), await txt(pg, '#estTablas'));
    await pg.selectOption('#verPor', 'ventana');
    ok('Más detalle: tabla por ventana', /BUENA3.*\+2,0 R/.test(await txt(pg, '#estTablas')) && /REGULAR2.*−1,0 R/.test(await txt(pg, '#estTablas')) && /MALA1/.test(await txt(pg, '#estTablas')), await txt(pg, '#estTablas'));
    ok('Más detalle: sigue abierto después de cambiar la tabla', await pg.evaluate(() => document.getElementById('estDetalle').open), null);

    /* ---- 3) Real y Práctica nunca se mezclan ---- */
    await pg.click('label[for="d-prac"]');
    let cp = await tarjetas(pg);
    const pp = Object.fromEntries(cp.map(x => [x.label, x]));
    ok('Práctica: solo las 3 de práctica (2 de 3; +2 R; factor 38/10 = 3,8)', pp.Ganadas.val === '2 de 3' && pp['Total del período'].val === '+2,0 R' && pp['Total del período'].sub === '+$28,00' && pp['Factor de beneficio'].val === '3,8' && pp['Promedio por operación'].val === '+0,67 R', cp.map(x => x.label + ' ' + x.val));
    ok('Práctica: lo dice arriba y trae su propio aviso de pocas', /Solo tus operaciones de práctica: estos números no cuentan en tus resultados reales\./.test(await txt(pg, '#estStats')) && /^3 operaciones cerradas: son primeras señales/.test(await txt(pg, '#estStats .aviso-p p')), null);
    const fp = await pg.$$eval('#estStats .tbl-wrap tbody tr td:first-child', l => l.map(x => x.textContent));
    ok('Práctica: la tabla por fuente sin ninguna real (no aparece "Sin dato" ni NVDA)', fp.join() === 'ChatGPT,ChatGPT, Radar,Claude,Propia', fp);
    ok('Práctica: la ventana solo con las de práctica (BUENA 1 a las 10:20; REGULAR 2 a las 12:30 y 09:50)', (await pg.$$eval('#estStats .vent .vent-n', l => l.map(x => x.textContent))).join('|') === 'BUENA1 operación|REGULAR2 operaciones|MALAninguna', null);
    await pg.click('label[for="d-real"]');
    cp = await tarjetas(pg);
    ok('Real otra vez: 2 de 6, sin las de práctica', cp.find(x => x.label === 'Ganadas').val === '2 de 6' && cp.find(x => x.label === 'Total del período').sub === '+$12,50', cp.map(x => x.val));
    // Período: vale para Estadísticas (Este mes y Todo incluyen la semana; Esta semana es la de hoy)
    await pg.click('label[for="d-todo"]');
    ok('período Todo: las mismas 6 (no hay otras)', (await tarjetas(pg)).find(x => x.label === 'Ganadas').val === '2 de 6' && /del diario/.test((await tarjetas(pg)).find(x => x.label === 'Total del período').exp), null);
    await pg.click('label[for="d-sem"]');
    // Revisión en Práctica: explicada, sin la caja
    await parte(pg, 'rev');
    await pg.click('label[for="d-prac"]');
    ok('Revisión en Práctica: dice que es solo de lo real y no muestra la caja ni las anteriores', await visible(pg, '#rev-prac') && !(await visible(pg, '#revisionBox')) && !(await visible(pg, '#revAnteriores')), await txt(pg, '#rev-prac'));
    await pg.click('label[for="d-real"]');
    await ctx.close();
  }

  /* ---- 4) Sin operaciones: un mensaje claro en vez de ceros ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'vacío ' });
    await pg.click('#t-diario'); await parte(pg, 'est');
    const t = await txt(pg, '#estStats');
    ok('vacío: mensaje claro, sin tarjetas, sin aviso y sin Más detalle', /^No hay operaciones cerradas esta semana, así que no hay números que mostrar\./.test(t) && !(await pg.$('#estStats .stat')) && !(await pg.$('#estStats .aviso-p')) && !(await visible(pg, '#estDetalle')) && !/0,0|\$0/.test(t), t);
    await pg.click('label[for="d-prac"]');
    ok('vacío en Práctica: lo dice para la práctica', /^No hay operaciones de práctica cerradas esta semana/.test(await txt(pg, '#estStats')), await txt(pg, '#estStats'));
    // Todas ganadas, en pantalla: el factor nunca es infinito y sin caídas lo dice con palabras
    await pg.click('label[for="d-real"]');
    await sembrar(pg, 'trades', [D.cerrada('g1', { entra: H(13, 10, 10), sale: H(13, 10, 40), pnl: 10 }), D.cerrada('g2', { entra: H(13, 10, 50), sale: H(13, 11, 20), pnl: 5 }), D.cerrada('g3', { entra: H(14, 10, 10), sale: H(14, 10, 50), pnl: 20 })]);
    const c = Object.fromEntries((await tarjetas(pg)).map(x => [x.label, x]));
    ok('todas ganadas: "Sin pérdidas todavía", nunca infinito', c['Factor de beneficio'].val === 'Sin pérdidas todavía' && c['Factor de beneficio'].sub === 'ganado +$35,00 · perdido $0,00' && !/∞|Infinity|NaN/.test(await txt(pg, '#estStats')), c['Factor de beneficio']);
    ok('todas ganadas: "Sin caídas" y racha de 3 ganadas (mejor 3, peor 0)', c['Caída máxima'].val === 'Sin caídas' && c['Caída máxima'].sub === '' && c['Racha actual'].val === '3 ganadas' && c['Racha actual'].sub === 'mejor 3 ganadas · peor 0 perdidas' && c.Ganadas.val === '3 de 3', [c['Caída máxima'], c['Racha actual']]);
    await ctx.close();
  }

  /* ---- 5) Más de 20 operaciones: sin aviso ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'mes ' });
    await sembrar(pg, 'trades', D.mesEjemplo());
    await pg.click('#t-diario'); await parte(pg, 'est'); await pg.click('label[for="d-mes"]');
    const c = await tarjetas(pg);
    ok('más de 20: sin el aviso de pocas', !(await pg.$('#estStats .aviso-p')) && c.length === 6, c.length);
    ok('más de 20: 24 cerradas en el mes', c.find(x => x.label === 'Ganadas').val === '12 de 24', c.map(x => x.val));
    ok('más de 20: cada fuente tiene menos de 20, así que la nota de suerte sigue', /puede ser suerte/.test(await txt(pg, '#estStats')), null);
    await pg.click('label[for="d-sem"]');
    ok('más de 20 en el mes pero pocas esta semana: el aviso vuelve', /^\d+ operaciones cerradas: son primeras señales/.test(await txt(pg, '#estStats .aviso-p p')), await txt(pg, '#estStats .aviso-p p'));
    await ctx.close();
  }

  /* ---- 6) Revisión: se pide con las métricas, se guarda y se lista por semana ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'revisión ' });
    await sembrar(pg, 'trades', D.semanaEjemplo().concat(D.practicaEjemplo()));
    await sembrar(pg, 'revisiones', D.revisionesEjemplo());
    await pg.click('#t-diario'); await parte(pg, 'rev');
    ok('Revisión: la última arriba, con su fecha', /Última revisión: 12\/10 19:00 · esta semana/.test(await txt(pg, '#revisionFecha')) && /Respetaste los stops en las 6 operaciones/.test(await txt(pg, '#revisionTxt')), await txt(pg, '#revisionFecha'));
    let ant = await pg.$$eval('#revAnteriores .rev-sem', l => l.map(g => ({ h: g.querySelector('h4').textContent, items: [...g.querySelectorAll('details.rev')].map(d => ({ s: d.querySelector('summary').textContent, open: d.open })) })));
    ok('Revisión: las anteriores por semana, desplegables y cerradas', JSON.stringify(ant) === JSON.stringify([{ h: 'Semana del 05/10', items: [{ s: 'Revisión de la semanaviernes 09/10 · 19:00', open: false }] }]), ant);
    ok('Revisión: el botón dice qué período pide', (await txt(pg, '#btnRevision')) === 'Pedir revisión de esta semana', await txt(pg, '#btnRevision'));
    await pg.click('label[for="d-mes"]');
    ok('Revisión: el período también vale acá ("de este mes")', (await txt(pg, '#btnRevision')) === 'Pedir revisión de este mes', await txt(pg, '#btnRevision'));
    await pg.click('label[for="d-sem"]');
    // Abrir una anterior: se lee y sigue abierta aunque la página se re-dibuje
    await pg.click('#revAnteriores details.rev > summary');
    ok('Revisión: al abrir una anterior se lee su texto', await visible(pg, '#revAnteriores details.rev .prose') && /Las entradas en la ventana BUENA/.test(await txt(pg, '#revAnteriores details.rev .prose')), null);
    await pg.click('label[for="d-mes"]'); await pg.click('label[for="d-sem"]');
    ok('Revisión: la que abriste sigue abierta después de re-dibujar', await pg.evaluate(() => document.querySelector('#revAnteriores details.rev').open), null);
    // Pedir una nueva (con la hora quieta a las 11:30 para saber exactamente con qué fecha se guarda)
    await pg.clock.setFixedTime(H(14, 11, 30));
    await pg.click('#btnRevision');
    await pg.waitForFunction(() => /Qué funciona/.test(document.getElementById('revisionTxt').textContent) && !document.getElementById('btnRevision').disabled);
    await pg.waitForFunction(() => document.querySelectorAll('#revAnteriores details.rev').length === 2);
    const prompt = await pg.evaluate(() => window.__sampleCalls.filter(c => c.tipo === 'texto').pop().input);
    const dj = JSON.parse(prompt.slice(prompt.indexOf('Datos (JSON):') + 'Datos (JSON):'.length));
    ok('pedir: Claude recibe las métricas nuevas', dj.metricas && dj.metricas.caidaMaximaR === 2.5 && dj.metricas.factorDeBeneficio === 1.29 && dj.metricas.rachaActual === '1 ganada' && dj.metricas.porcentajeGanadas === 33, dj.metricas);
    ok('pedir: y la tabla por fuente (con ChatGPT por origen)', dj.porFuente.map(f => f.fuente).join() === 'ChatGPT,Claude,Propia,Sin dato' && dj.porFuente[0].porOrigen.map(o => o.origen).join() === 'Pre-apertura,Radar', dj.porFuente);
    ok('pedir: solo las reales (6, no las 3 de práctica) y la regla de menos de 20', dj.operaciones === 6 && dj.pocasOperaciones === true && !/"activo":"(PLTR|SMCI|ARM)"/.test(prompt) && /"activo":"NVDA"/.test(prompt) && /menos de 20 operaciones cerradas/.test(prompt) && /primeras señales/.test(prompt), dj.operaciones);
    const revs = await guardados(pg, 'revisiones');
    const nueva = revs.find(r => r.ts === H(14, 11, 30));
    ok('pedir: la revisión se guarda con la misma forma de siempre ({ ts, periodo, semana, texto })', revs.length === 3 && nueva && Object.keys(nueva).filter(k => k !== '_id').sort().join() === 'periodo,semana,texto,ts' && nueva.semana === '2026-10-12' && nueva.periodo === 'esta semana', nueva);
    ok('pedir: la nueva queda arriba y la que estaba arriba pasa a las anteriores', /Última revisión: 14\/10 11:30/.test(await txt(pg, '#revisionFecha')) && (await txt(pg, '#btnRevision')) === 'Pedir revisión de esta semana', await txt(pg, '#revisionFecha'));
    ant = await pg.$$eval('#revAnteriores .rev-sem', l => l.map(g => g.querySelector('h4').textContent + ': ' + [...g.querySelectorAll('summary small')].map(s => s.textContent).join(', ')));
    ok('pedir: anteriores por semana, la más nueva arriba', JSON.stringify(ant) === JSON.stringify(['Semana del 12/10: lunes 12/10 · 19:00', 'Semana del 05/10: viernes 09/10 · 19:00']), ant);
    ok('pedir: la que estaba abierta sigue abierta y la que se sumó llega cerrada', JSON.stringify(await pg.$$eval('#revAnteriores details.rev', l => l.map(d => d.open))) === '[false,true]', null);
    await ctx.close();
  }

  /* ---- 6b) Más de 10 revisiones guardadas: la lista no se corta (antes se leían solo las últimas 10) ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'muchas revisiones ' });
    const doce = Array.from({ length: 12 }, (_, i) => { const ts = H(12, 19, 0) - i * 7 * 86400000; return ['r' + ts, { ts, periodo: 'esta semana', semana: new Date(ts - 4 * 3600000).toISOString().slice(0, 10) /* todas de un lunes */, texto: '## Qué funciona\n- Semana ' + (i + 1) }]; });
    await sembrar(pg, 'revisiones', doce);
    await pg.click('#t-diario'); await parte(pg, 'rev');
    ok('12 revisiones: la última arriba y las otras 11 abajo, cada una en su semana', (await pg.$$('#revAnteriores details.rev')).length === 11 && (await pg.$$('#revAnteriores .rev-sem')).length === 11, (await pg.$$('#revAnteriores details.rev')).length);
    await ctx.close();
  }

  /* ---- 7) Modo local: calcula sin guardar y no se rompe ---- */
  {
    const { ctx, pg } = await abrir({ mock: false, pre: 'local ' });
    await pg.waitForFunction(() => /fuera de Claude/.test(document.getElementById('aviso').textContent));
    await pg.click('#t-diario');
    for (const p of ['est', 'rev', 'ops']) await parte(pg, p);
    await parte(pg, 'est');
    ok('local: Estadísticas con su mensaje de vacío', /No hay operaciones cerradas/.test(await txt(pg, '#estStats')), await txt(pg, '#estStats'));
    await parte(pg, 'rev');
    ok('local: Revisión explica que funciona dentro de Claude y no ofrece el botón', !(await visible(pg, '#btnRevision')) && /dentro de Claude/.test(await txt(pg, '#revisionTxt')), await txt(pg, '#revisionTxt'));
    await ctx.close();
  }

  /* ---- 8) Sin scroll horizontal: 3 partes × Real/Práctica × claro/oscuro × 360/390/768/1280 ---- */
  const desbordes = [];
  let contrasteHecho = false;
  for (const ancho of [360, 390, 768, 1280]) {
    const r = await abrir({ ancho, pre: ancho + ' ' });
    await sembrar(r.pg, 'trades', D.semanaEjemplo().concat(D.practicaEjemplo()));
    await sembrar(r.pg, 'revisiones', D.revisionesEjemplo());
    await r.pg.click('#t-diario');
    for (const tema of ['claro', 'oscuro']) {
      await r.pg.click('label[for="tema-' + tema + '"]');
      for (const modo of ['real', 'prac']) {
        await r.pg.click('label[for="d-' + modo + '"]');
        for (const p of ['ops', 'est', 'rev']) {
          await parte(r.pg, p);
          await r.pg.evaluate(() => { document.getElementById('estDetalle').open = true; document.querySelectorAll('#revAnteriores details.rev').forEach(d => { d.open = true; }); });
          const sw = await r.pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (sw > 1) desbordes.push(ancho + ' ' + tema + ' ' + modo + ' ' + p + ' +' + sw + 'px');
        }
      }
    }
    if (ancho === 390) {
      // Nada se sale de su caja: tarjetas, filas de ventana y resúmenes de revisión
      await r.pg.click('label[for="d-real"]'); await parte(r.pg, 'est');
      ok('390: textos de las tarjetas y filas de ventana dentro de su caja', await r.pg.evaluate(() => [...document.querySelectorAll('#estStats .stat, #estStats .vent li')].every(c => { const cr = c.getBoundingClientRect(); return [...c.querySelectorAll('b, small, .exp, span')].every(e => { const er = e.getBoundingClientRect(); return er.left >= cr.left - 1 && er.right <= cr.right + 1; }); })), null);
      /* ---- 9) Contraste medido en pantalla: texto 4,5:1, iconos y barras 3:1, en claro y en oscuro ---- */
      for (const tema of ['claro', 'oscuro']) {
        await r.pg.click('label[for="tema-' + tema + '"]');
        const medir = (sel, min, fondoDe) => r.pg.evaluate(([s, m, fd]) => {
          const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
          const lum = (c) => c.slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
          const fondo = (el) => { while (el) { const c = rgb(getComputedStyle(el).backgroundColor); if (c.length < 4 || c[3] > 0) return c; el = el.parentElement; } return [255, 255, 255]; };
          return [...document.querySelectorAll(s)].filter(e => e.getBoundingClientRect().width > 0).map(e => {
            const color = fd ? rgb(getComputedStyle(e).backgroundColor) : rgb(getComputedStyle(e).color), base = fd ? fondo(e.parentElement) : fondo(e);
            const a = lum(color), b = lum(base), k = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); return { s, k: +k.toFixed(2), ok: k >= m };
          });
        }, [sel, min, !!fondoDe]);
        const casos = [];
        await r.pg.click('label[for="d-real"]'); await parte(r.pg, 'est');
        for (const [s, m] of [['label[for^="d-p-"]', 4.5], ['#estStats .stat span', 4.5], ['#estStats .stat b', 4.5], ['#estStats .stat small', 4.5], ['#estStats .stat small .res', 4.5], ['#estStats .stat .exp', 4.5], ['#estStats .aviso-p .ap-tag', 4.5], ['#estStats .aviso-p p', 4.5], ['#estStats .aviso-p svg', 3],
          ['#estStats h3', 4.5], ['#estStats .hint', 4.5], ['#estStats th', 4.5], ['#estStats td', 4.5], ['#estStats .vent-n', 4.5], ['#estStats .vent-n small', 4.5], ['#estStats .vent-n svg', 3], ['#estStats .vent-v .res', 4.5], ['#estStats .line-note', 4.5], ['#estDetalle summary', 4.5], ['#estTablas td', 4.5]]) casos.push(...await medir(s, m));
        casos.push(...await medir('#estStats .vent-bar i', 3, true)); // la barra contra su riel
        await parte(r.pg, 'rev');
        for (const [s, m] of [['#revisionBox h3', 4.5], ['#revisionFecha', 4.5], ['#revAnteriores h3', 4.5], ['#revAnteriores h4', 4.5], ['#revAnteriores summary span', 4.5], ['#revAnteriores summary small', 4.5], ['#revAnteriores .prose p, #revAnteriores .prose li', 4.5]]) casos.push(...await medir(s, m));
        await r.pg.click('label[for="d-prac"]');
        casos.push(...await medir('#rev-prac span', 4.5), ...await medir('#rev-prac svg', 3));
        await r.pg.click('label[for="d-real"]');
        const malos = casos.filter(c => !c.ok);
        ok('contraste ' + tema + ': selector, tarjetas, aviso, tablas, ventanas, barras y revisiones (' + casos.length + ' elementos)', casos.length >= 80 && !malos.length, malos.length ? malos : casos.length);
      }
      contrasteHecho = true;
    }
    await r.ctx.close();
  }
  ok('sin scroll horizontal: 3 partes × Real/Práctica × 2 temas × 360/390/768/1280 px', !desbordes.length, desbordes);
  ok('contraste: se midió en claro y en oscuro', contrasteHecho, null);

  /* ---- 10) Portabilidad: las cuentas nuevas son funciones puras ---- */
  const js = html.slice(html.indexOf('<script>'), html.indexOf('</script>'));
  const cuerpo = (f) => { const i = js.indexOf('function ' + f + '('); if (i < 0) return ''; let n = 0, j = js.indexOf('{', i); for (let k = j; k < js.length; k++) { if (js[k] === '{') n++; else if (js[k] === '}' && --n === 0) return js.slice(i, k + 1); } return ''; };
  const puras2 = ['estadisticas', 'agrupar', 'enOrdenDeCierre', 'signoResultado', 'nivelVentanaDe', 'avisoPocas', 'filaDe', 'quienAcierta', 'porVentana', 'revisionesPorSemana', 'datosRevisionDe', 'promptRevision'];
  const sucias = puras2.filter(f => /document\.|\$\(|\bS\.|claude\.|REVISIONES|TRADES|SAMPLE|Date\.now/.test(cuerpo(f)) || !cuerpo(f));
  ok('portabilidad: estadísticas y datos de la revisión no tocan la pantalla, S ni la plataforma', !sucias.length, sucias);
  ok('portabilidad: se reutiliza lo que había (estadisticas, agrupar y VER_POR extendidos, no copiados)', (js.match(/function estadisticas\(/g) || []).length === 1 && (js.match(/function agrupar\(/g) || []).length === 1 && (js.match(/var VER_POR = /g) || []).length === 1, null);
  const sinComentarios = js.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('portabilidad: sin llamadas nuevas a claude.use ni SAMPLE', (sinComentarios.match(/claude\.use\(/g) || []).length === 4 && (sinComentarios.match(/SAMPLE(\.json)?\(/g) || []).length === 4, [(sinComentarios.match(/claude\.use\(/g) || []).length, (sinComentarios.match(/SAMPLE(\.json)?\(/g) || []).length]);
  ok('pie: Centinela · v3.7', /Centinela · v3\.7/.test(html), null);

  const fails = results.filter(r => !r.pass);
  fs.writeFileSync(path.join(dir, 'resultado-estadisticas.json'), JSON.stringify({ fecha: new Date().toISOString(), archivo, total: results.length, fallas: fails.length, erroresPagina: errors, casos: results.map(r => ({ caso: r.name, paso: r.pass })) }, null, 2));
  console.log('Pruebas de estadísticas y revisión: ' + results.length + ' · fallas: ' + fails.length);
  fails.forEach(f => console.log('FALLA ' + f.name + ' → ' + JSON.stringify(f.got)));
  console.log('Errores de página: ' + (errors.length ? errors.join(' | ') : 'ninguno'));
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => { console.error('ERROR TEST', e); process.exit(1); });
