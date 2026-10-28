// Pruebas de la Tarea 4 (v3.6): bandeja de señales, modo práctica, fuente de cada señal y pestañas nuevas (Buscar y Señales).
// Uso: node test-senales.js <carpeta> [archivo]. Reutiliza el simulador de test-panel.js y los datos de datos-tablero.js.
// Los datos son inventados. AHORA: miércoles 14-oct-2026, 11:05 en Nueva York = 11:05 en Bolivia (en octubre las dos van en UTC−4).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const archivo = process.argv[3] || 'panel-trading.html';
const html = fs.readFileSync(path.join(dir, archivo), 'utf8');
const suite = fs.readFileSync(path.join(__dirname, 'test-panel.js'), 'utf8');
const MOCK = suite.slice(suite.indexOf('const MOCK = `') + 'const MOCK = `'.length, suite.indexOf('})();`;') + '})();'.length);
// La captura del mensaje: el simulador de test-panel.js responde siempre un análisis de gráfico; acá se agrega la transcripción (window.__capturaSenalResp).
const MOCK_CAPTURA = `(() => {
  const usar = window.claude.use; window.__capturaSenalResp = null;
  window.claude.use = async (n) => {
    const r = await usar(n);
    if (n === 'sample' && r && !r.__conCaptura) {
      const json = r.json;
      r.json = async (input, opts) => {
        if (!/TRANSCRIPCIÓN DE SEÑALES/.test(input)) return json(input, opts);
        window.__sampleCalls.push({ tipo: 'json', input: String(input), imagenes: opts && opts.images ? opts.images.length : 0, tier: opts && opts.modelTier, captura: true });
        await new Promise(x => setTimeout(x, 40));
        return JSON.parse(JSON.stringify(window.__capturaSenalResp || { legible: true, texto: '', senales: [] }));
      };
      r.__conCaptura = true;
    }
    return r;
  };
})();`;
const { NY, AHORA, datosSemana } = require('./datos-tablero.js');
const { adelantar } = require('./reloj-pruebas.js'); // saltos de reloj sin la carrera del reloj falso (ver el archivo)
const skeleton = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>';
const pagina = path.join(dir, 'test-senales-page.html');
fs.writeFileSync(pagina, skeleton);

const results = [], errors = [];
const ok = (name, pass, got) => results.push({ name, pass: !!pass, got });
const TABS = ['hoy', 'analizar', 'operar', 'abiertas', 'diario'];
const BO = (m, d, h, mi) => Date.UTC(2026, m - 1, d, h + 4, mi); // Bolivia: UTC−4 todo el año
const REG = (activo, dir, e, s1, t1, t2, nivel) => 'REGISTRO: 14/10/2026 | ' + activo + ' | ' + dir + ' | ' + e + ' | ' + s1 + ' | ' + e + ' | ' + t1 + ' | ' + t2 + ' | 27 | 120 | ' + nivel;
// NVDA cumple (verde), MU tiene el TP1 en 1:1,2 (ámbar) y AMD trae un nivel que no existe (ámbar).
const TRES = 'PRE-APERTURA\n' + REG('NVDA', 'compra', '182,40', '180,90', '184,90', '186,20', 'Estándar') + '\nAL ENTRAR: pon el stop\n\n' +
  REG('MU', 'venta corta', '248,60', '250,10', '246,80', '244,10', 'Moderado') + '\n\n' + REG('AMD', 'compra', '214,20', '212,70', '216,90', '218,40', 'Agresivo');
const cerrada = (id, pnl, cierreTs, extra = {}) => [id, Object.assign({ activo: 'X' + id.toUpperCase(), dir: 'compra', entrada: 50, entradaPlan: 50, sl1: 49, sl2: 50, tp1: 52, tp2: 54, nivel: 10, nivelEf: 10, d: 1, unidades: 10, unidadesAbiertas: 0,
  riesgoInicial: 10, stopActual: 49, estado: 'cerrada', ts: cierreTs - 20 * 60000, parciales: [], movimientos: [], reglasRotas: [], nota: '', origen: 'Radar', tipo: 'limite', tipoActivo: 'Tecnología', seguridad: null,
  cierre: { ts: cierreTs, precio: pnl < 0 ? 49 : 51, unidades: 10, pnl, motivo: pnl < 0 ? 'SL1' : 'A mano' }, pnl, r: pnl / 10, plan: 'si' }, extra)];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const browser = await chromium.launch();
  const abrir = async ({ ancho = 390, hora = AHORA, mock = true, pre = '' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    if (mock) { await ctx.addInitScript(MOCK); await ctx.addInitScript(MOCK_CAPTURA); }
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errors.push(pre + 'pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(pre + 'console: ' + m.text()); });
    if (hora) await pg.clock.install({ time: hora });
    await pg.goto('file://' + pagina);
    await pg.waitForFunction(() => document.getElementById('v-title').textContent !== 'Cargando tus operaciones…', null, { timeout: 15000 });
    return { ctx, pg };
  };
  const sembrar = async (pg, col, docs) => {
    await pg.evaluate(async ([c, d]) => { const db = await window.claude.use('db'); for (const [id, x] of d) await db.collection(c).doc(id).set(x); }, [col, docs]);
    // El simulador avisa a cada suscripción con un setTimeout(0). El reloj falso los dispara en orden de creación, así que un
    // setTimeout(0) agendado ahora corre recién cuando la página ya recibió todos los avisos y se re-dibujó: no depende de cuánto tarde.
    await pg.evaluate(() => new Promise(r => setTimeout(r, 0)));
    await pg.waitForTimeout(400); // margen que ya tenía la prueba
  };
  const guardados = (pg, col) => pg.evaluate((c) => [...window.__mockStore.entries()].filter(([k]) => k.startsWith(c + '/')).map(([k, v]) => Object.assign({ _id: k.split('/')[1] }, v)), col);
  const txt = (pg, sel) => pg.textContent(sel);
  const tarjetas = (pg) => pg.$$eval('#sen-lista .sen', l => l.map(c => ({ id: c.getAttribute('data-sen'), activo: c.querySelector('.sen-h strong').textContent, t: c.textContent,
    luz: (c.querySelector('.sen-est') || {}).getAttribute ? c.querySelector('.sen-est').getAttribute('data-luz') : null })));
  const card = (a) => '#sen-lista .sen:has(.sen-h strong:text-is("' + a + '"))';
  // El mensaje aparece al terminar de guardar; las tarjetas se re-dibujan cuando la base avisa del cambio (un instante después): esperarlas en pantalla.
  const hayTarjeta = (pg, activo, si = true) => pg.waitForFunction(([a, s]) => [...document.querySelectorAll('#sen-lista .sen-h strong')].some(e => e.textContent === a) === s, [activo, si]);
  const nTarjetas = (pg, n) => pg.waitForFunction((k) => document.querySelectorAll('#sen-lista .sen').length === k, n);
  const leer = async (pg, texto, fuente) => {
    await pg.click('#t-operar');
    if (fuente) await pg.selectOption('#sen-fuente', fuente);
    await pg.fill('#f-pegar', texto);
    await pg.click('#btnPegar');
    await pg.waitForFunction(() => !document.getElementById('btnPegar').disabled && document.getElementById('sen-msg').textContent);
    // Las nuevas llegan con el aviso de la base: esperar a que estén todas las que dice el mensaje.
    await pg.waitForFunction(() => { const m = document.getElementById('sen-msg').textContent.match(/Agregué (\d+)/), f = document.getElementById('sen-f-nuevas-l').textContent.match(/(\d+)$/); return !m || (f && +f[1] >= +m[1]); });
    await pg.waitForTimeout(120);
  };
  // Copiar el estado para ChatGPT: sin portapapeles, el texto queda a la vista en el cuadro.
  const estadoChatGPT = async (pg) => {
    await pg.click('#t-hoy');
    await pg.evaluate(() => { try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('sin portapapeles')) } }); } catch (e) { } document.getElementById('estadoTxt').hidden = true; });
    await pg.click('#btnEstado');
    await pg.waitForFunction(() => !document.getElementById('estadoTxt').hidden);
    return pg.inputValue('#estadoTxt');
  };

  /* ---- 1) Funciones puras: estadoSenal, no duplicar, captura, práctica y filtros ---- */
  const { ctx, pg } = await abrir();
  const puras = await pg.evaluate(([AH, TRES, REG_S]) => {
    const P = window.PanelTrading, out = [], D = P.DEF, N = D.niveles;
    const eq = (name, got, exp) => out.push({ name, got, pass: JSON.stringify(got) === JSON.stringify(exp) });
    const BO = (m, d, h, mi) => Date.UTC(2026, m - 1, d, h + 4, mi), NY = (m, d, h, mi) => Date.UTC(2026, m - 1, d, h + 4, mi); // octubre: Bolivia y Nueva York en UTC−4
    const REG = new Function('return ' + REG_S)();
    const leer = (texto, ts = AH, fuente = 'ChatGPT') => P.parseSenales(texto, N).map((o, i) => Object.assign(P.docSenal(Object.assign(o, { orden: i }), fuente, N, ts), { id: 'x' + i }));
    const tr = (id, o) => P.normTrade(id, Object.assign({ activo: 'X', dir: 'compra', entrada: 50, sl1: 49, sl2: 50, tp1: 52, tp2: 54, unidades: 10, unidadesAbiertas: 0, riesgoInicial: 27, stopActual: 49, estado: 'cerrada', ts: AH - 3600e3, parciales: [], movimientos: [], reglasRotas: [] }, o));
    const perdida = (id, pnl, ts, riesgo = 27) => tr(id, { estado: 'cerrada', ts: ts - 600e3, riesgoInicial: riesgo, cierre: { ts, pnl }, pnl, r: pnl / riesgo });
    const est = (trades, ts = AH) => P.estadoDe(trades, D, ts);
    const libre = (ts = AH, extra = {}) => Object.assign({ macro: P.proximidadMacro([], ts), pausa: P.estadoPausa([], D, ts), mkt: P.mercado(ts) }, extra);
    const ES = (doc, e = est([]), ts = AH, ex = libre(ts)) => P.estadoSenal(doc, e, D, ts, ex);
    const todos = [];
    const ev = (...a) => { const r = ES(...a); todos.push(r); return r; };
    const [nvda, mu, amd] = leer(TRES);

    // Verde
    let r = ev(nvda);
    eq('verde: NVDA cumple (luz, palabra e icono)', [r.luz, r.palabra, r.icono], ['verde', 'Cumple tus reglas', 'ok']);
    eq('verde: unidades y beneficio/riesgo de calcular (18 acc., 1,67 y 2,53)', [r.unidades, Math.round(r.rr1 * 1000) / 1000, Math.round(r.rr2 * 1000) / 1000], [18, 1.667, 2.533]);
    eq('verde: explica por qué cumple', r.explica, 'B/R de 1,67 y 2,53 (tu mínimo es 1,5) y entra en tu presupuesto de hoy.');
    eq('verde: Operar habilitado y Practicar habilitado', [r.operar, r.practicar], [{ habilitado: true, texto: 'Operar' }, { habilitado: true, texto: 'Practicar' }]);
    eq('verde: "precio de Quantfury no verificado" no cuenta para el color', [r.calc.bloqueos.some(b => b.regla === 'Precio de Quantfury no verificado'), r.luz], [true, 'verde']);
    eq('toda tarjeta: "Mirá el precio en Quantfury antes de entrar"', r.lineas, ['Mirá el precio en Quantfury antes de entrar.']);
    eq('antigüedad: a los 15 min todavía no dice "hace"', ES(nvda, est([]), AH + 15 * 60000 + 59000).lineas[0], 'Mirá el precio en Quantfury antes de entrar.');
    eq('antigüedad: con más de 15 min, "Señal de hace 16 min: …"', ES(nvda, est([]), AH + 16 * 60000).lineas[0], 'Señal de hace 16 min: mirá el precio en Quantfury antes de entrar.');
    eq('antigüedad: en horas y minutos', ES(nvda, est([]), AH + 75 * 60000).lineas[0], 'Señal de hace 1 h 15 min: mirá el precio en Quantfury antes de entrar.');
    eq('verde: tamaño limitado por el presupuesto lo dice', ev(nvda, est([perdida('a', -40, BO(10, 14, 9, 0), 40)])).explica, 'B/R de 1,67 y 2,53 (tu mínimo es 1,5). El tamaño lo limita el presupuesto que te queda hoy ($14,00).');

    // Ámbar: problemas de la señal
    r = ev(mu);
    eq('ámbar: beneficio/riesgo del TP1 bajo (luz, palabra e icono)', [r.luz, r.palabra, r.icono], ['ambar', 'Revisala antes de operar', 'alerta']);
    eq('ámbar: motivo del TP1 como en el diseño', r.ambar, ['El TP1 da 1,2 y tu mínimo es 1,5. Podés ajustar el TP1 o practicarla.']);
    eq('ámbar: el botón dice "Ajustar niveles" y Practicar sigue', [r.operar, r.practicar.habilitado, r.unidades], [{ habilitado: true, texto: 'Ajustar niveles' }, true, 12]);
    const [bajos] = leer(REG('XYZ', 'compra', '100,00', '99,00', '101,20', '101,40', 'Estándar'));
    eq('ámbar: TP1 y TP2 bajos, cada uno con su motivo', ev(bajos).ambar, ['El TP1 da 1,2 y tu mínimo es 1,5.', 'El TP2 da 1,4 y tu mínimo es 1,5. Podés ajustar el TP1 y el TP2 o practicarla.']);
    r = ev(amd);
    eq('ámbar: nivel no reconocido → el más bajo y lo avisa', [r.luz, r.ambar, r.nivelIdx, r.unidades], ['ambar', ['No reconocí el nivel de riesgo «Agresivo»: calculé con el más bajo ($10). Elegí el nivel al operar.'], 0, 6.66]);
    r = ev(Object.assign({}, nvda, { nivel: 25, nivelDudoso: undefined, nivelTxt: undefined }));
    eq('ámbar: señal vieja con un nivel que ya no existe ($25) no se supone', [r.luz, r.nivelIdx, r.ambar[0]], ['ambar', 0, 'No reconocí el nivel de riesgo «$25»: calculé con el más bajo ($10). Elegí el nivel al operar.']);
    const [amb] = leer('REGISTRO: x | XYZ | compra | 5.123 | 5,05 | 5,123 | 5,30 | 5,50 | 10 | 3 | Cauteloso');
    r = ev(amb);
    eq('ámbar: número ambiguo (5.123)', [r.luz, r.ambar, r.practicar], ['ambar', ['No sé si «5.123» (entrada) lleva decimales o miles. Escribilo con coma decimal (5,123) o sin punto (5123).'], { habilitado: false, texto: 'Revisá los niveles para practicar' }]);
    eq('ámbar: niveles incoherentes (SL1 arriba en una compra)', ev(leer(REG('XYZ', 'compra', '50,00', '51,00', '52,00', '54,00', 'Cauteloso'))[0]).ambar, ['En una compra el SL1 va por debajo de la entrada.']);
    eq('ámbar: niveles incoherentes (TP2 más cerca que el TP1)', ev(leer(REG('XYZ', 'venta', '50,00', '51,00', '48,00', '49,00', 'Cauteloso'))[0]).ambar, ['El TP2 tiene que estar más lejos que el TP1.']);
    eq('ámbar: niveles incoherentes (precios de otro activo)', /no parecen del mismo activo/.test(ev(leer(REG('XYZ', 'compra', '50,00', '49,00', '52,00', '540,00', 'Cauteloso'))[0]).ambar[0]), true);
    const falta = P.docSenal({ activo: 'NVDA', dir: '', entrada: 182.4, sl1: 180.9, tp1: 184.9, tp2: NaN, amb: [], txt: {}, nivelIdx: 2 }, 'ChatGPT', N, AH);
    r = ev(falta);
    eq('ámbar: faltan datos → la tarjeta dice cuáles', [r.luz, r.ambar, r.faltan], ['ambar', ['Faltan datos: dirección, TP2.'], ['dirección', 'TP2']]);
    eq('ámbar: faltan datos → "Ajustar niveles" y no se puede practicar', [r.operar.texto, r.practicar], ['Ajustar niveles', { habilitado: false, texto: 'Faltan datos para practicar' }]);
    eq('ámbar: sin activo también falta', ev(P.docSenal({ activo: '', dir: 'compra', entrada: 182.4, sl1: 180.9, tp1: 184.9, tp2: 186.2, amb: [], txt: {}, nivelIdx: 2 }, 'ChatGPT', N, AH)).ambar, ['Faltan datos: activo.']);
    const evento = leer(REG('MRNA', 'compra', '30,10', '29,60', '30,90', '31,40', 'Moderado') + '\nAPUESTA DE EVENTO')[0];
    r = ev(evento);
    eq('evento: siempre el nivel más bajo ($10)', [r.nivelIdx, r.calc.nivelEf], [0, 10]);

    // Rojo: condiciones del momento
    r = ev(nvda, est([perdida('a', -27, BO(10, 14, 9, 0)), perdida('b', -27, BO(10, 14, 10, 0))]));
    eq('rojo: tope diario (luz, palabra e icono)', [r.luz, r.palabra, r.icono], ['rojo', 'No se puede operar ahora', 'no']);
    eq('rojo: tope diario → motivo y Operar deshabilitado con el motivo', [r.rojos, r.operar], [['Día cerrado. Llegaste al tope diario de $54,00. Mañana se reinicia.'], { habilitado: false, texto: 'Día cerrado' }]);
    eq('rojo: sin presupuesto no se puede practicar (0 acciones)', r.practicar, { habilitado: false, texto: 'Sin acciones para practicar' });
    r = ev(nvda, est([perdida('a', -54, BO(10, 12, 10, 0)), perdida('b', -54, BO(10, 13, 10, 0))]));
    eq('rojo: tope semanal', [r.luz, r.rojos[0], r.operar.texto], ['rojo', 'Semana cerrada. Llegaste al tope semanal de $108,00. Sin operaciones hasta el lunes.', 'Semana cerrada']);
    r = ev(nvda, est([tr('ab', { estado: 'abierta', entrada: 50, sl1: 48, stopActual: 48, unidades: 27, unidadesAbiertas: 27, riesgoInicial: 54, ts: AH - 600e3 })]));
    eq('rojo: sin presupuesto (riesgo abierto)', [r.luz, /^Sin presupuesto ahora\./.test(r.rojos[0]), r.operar.texto], ['rojo', true, 'Sin presupuesto ahora']);
    r = ev(nvda, est([perdida('a', -100, BO(10, 12, 10, 0), 100), tr('ab', { estado: 'abierta', entrada: 50, sl1: 49, stopActual: 49, unidades: 8, unidadesAbiertas: 8, riesgoInicial: 8, ts: AH - 600e3 })]));
    eq('rojo: sin presupuesto semanal', [r.luz, r.operar.texto], ['rojo', 'Sin presupuesto semanal']);
    const seis = [1, 2, 3, 4, 5, 6].map(i => tr('o' + i, { ts: BO(10, 14, 9, i * 5), cierre: { ts: BO(10, 14, 9, i * 5 + 2), pnl: 0 }, pnl: 0, r: 0 }));
    r = ev(nvda, est(seis));
    eq('rojo: máximo de operaciones del día', [r.luz, r.rojos[0]], ['rojo', 'Día cerrado. Ya hiciste 6 operaciones hoy.']);
    r = ev(nvda, est([tr('m', { estado: 'abierta', entrada: 100, sl1: 99, stopActual: 100, unidades: 90, unidadesAbiertas: 90, riesgoInicial: 90, ts: AH - 600e3 })]));
    eq('rojo: sin margen libre', [r.luz, /^Sin margen libre\./.test(r.rojos[0]), r.operar.texto], ['rojo', true, 'Sin margen libre']);
    const caro = leer(REG('BKNG', 'compra', '500,00', '490,00', '520,00', '540,00', 'Estándar'))[0];
    r = ev(caro, est([perdida('a', -53.95, BO(10, 14, 9, 0), 53.95)]));
    eq('rojo: en esta señal el presupuesto que queda da 0 acciones', [r.luz, r.rojos, r.operar.texto], ['rojo', ['No hay espacio para esta señal: con el presupuesto que te queda hoy ($0,05) el tamaño da 0 acciones.'], 'Sin presupuesto']);
    const fed = [{ id: 'f', ts: BO(10, 14, 14, 0), nombre: 'Fed' }], t1343 = BO(10, 14, 13, 43);
    r = ev(nvda, est([], t1343), t1343, libre(t1343, { macro: P.proximidadMacro(fed, t1343) }));
    eq('rojo: dato macro cerca, con la hora de Bolivia y hasta cuándo', [r.luz, r.rojos], ['rojo', ['Dato macro «Fed» a las 14:00 (Bolivia). Esperá hasta las 14:30.']]);
    eq('rojo: dato macro → "Operar a las 14:30" deshabilitado y Practicar sigue (diseño)', [r.operar, r.practicar.habilitado], [{ habilitado: false, texto: 'Operar a las 14:30' }, true]);
    const dosFed = fed.concat([{ id: 'g', ts: BO(10, 14, 14, 20), nombre: 'Bonos' }]);
    eq('rojo: dato macro con otro en el mismo bloque', ev(nvda, est([], t1343), t1343, libre(t1343, { macro: P.proximidadMacro(dosFed, t1343) })).rojos[0], 'Dato macro «Fed» a las 14:00 (Bolivia) y 1 más. Esperá hasta las 14:50.');
    const racha = [perdida('a', -10, BO(10, 14, 10, 40), 10), perdida('b', -10, BO(10, 14, 10, 50), 10)];
    r = ev(nvda, est(racha), AH, libre(AH, { pausa: P.estadoPausa(racha, D, AH) }));
    eq('rojo: pausa tras dos pérdidas, con la hora', [r.luz, r.rojos, r.operar.texto], ['rojo', ['Dos pérdidas seguidas: es momento de parar y respirar. Volvé a mirar el mercado a las 11:20 (Bolivia).'], 'Operar a las 11:20']);
    const temprano = NY(10, 14, 8, 0), antes = leer(TRES, NY(10, 14, 7, 30))[0];
    r = ev(antes, est([], temprano), temprano, libre(temprano));
    eq('rojo: Wall Street cerrado antes de abrir', [r.luz, r.rojos, r.operar.texto], ['rojo', ['Wall Street está cerrado: abre a las 09:30 (Bolivia). No se operan acciones fuera de horario.'], 'Operar a las 09:30']);
    eq('rojo: Wall Street cerrado de noche → mañana', ev(nvda, est([], NY(10, 14, 17, 0)), NY(10, 14, 17, 0), libre(NY(10, 14, 17, 0))).operar.texto, 'Operar mañana a las 09:30');
    eq('rojo: Wall Street cerrado el sábado → el lunes (mkt calculado si falta)', ev(nvda, est([], NY(10, 17, 11, 0)), NY(10, 17, 11, 0), {}).operar.texto, 'Operar el lunes a las 09:30');
    eq('rojo: el mismo criterio que el semáforo de Hoy (feriado 26-nov)', ev(nvda, est([], Date.UTC(2026, 10, 26, 16, 0)), Date.UTC(2026, 10, 26, 16, 0), {}).luz, 'rojo');
    r = ev(mu, est([], t1343), t1343, libre(t1343, { macro: P.proximidadMacro(fed, t1343) }));
    eq('rojo y ámbar a la vez: se muestra el rojo y también los motivos ámbar', [r.luz, r.rojos.length, r.ambar], ['rojo', 1, ['El TP1 da 1,2 y tu mínimo es 1,5. Podés ajustar el TP1 o practicarla.']]);
    const racha2 = [perdida('a', -10, BO(10, 14, 13, 30), 10), perdida('b', -10, BO(10, 14, 13, 40), 10)];
    r = ev(nvda, est(racha2, t1343), t1343, libre(t1343, { macro: P.proximidadMacro(fed, t1343), pausa: P.estadoPausa(racha2, D, t1343) }));
    eq('rojo: varios motivos con hora → Operar a la más tardía', [r.rojos.length, r.operar.texto], [2, 'Operar a las 14:30']);
    r = ev(nvda, est([perdida('a', -27, BO(10, 14, 9, 0)), perdida('b', -27, BO(10, 14, 10, 0))], t1343), t1343, libre(t1343, { macro: P.proximidadMacro(fed, t1343) }));
    eq('rojo: si un motivo no tiene hora, Operar dice ese motivo', [r.rojos.length, r.operar.texto], [2, 'Día cerrado']);
    eq('siempre icono y palabra, y coinciden con la luz (' + todos.length + ' estados)', todos.every(x => x.icono && x.palabra && P.LUZ_SENAL[x.luz].palabra === x.palabra && P.LUZ_SENAL[x.luz].icono === x.icono) && ['verde', 'ambar', 'rojo'].every(l => todos.some(x => x.luz === l)), true);
    eq('estadoSenal no cambia la señal ni el estado', (() => { const d = JSON.stringify(nvda), e0 = est([]), e = JSON.stringify(e0); ES(nvda, e0); return JSON.stringify(nvda) === d && JSON.stringify(e0) === e; })(), true);

    // Lectura de varias señales y no duplicar
    const l3 = P.parseSenales(TRES, N);
    eq('leer: tres señales de un pegado', l3.map(o => [o.activo, o.dir, o.nivelIdx, !!o.nivelDudoso]), [['NVDA', 'compra', 2, false], ['MU', 'venta', 1, false], ['AMD', 'compra', 0, true]]);
    eq('guardar: estado "nueva", fuente y nivel', [nvda.estado, nvda.fuente, nvda.nivel, mu.nivel, amd.nivelDudoso, amd.nivelTxt, nvda.origen, nvda.orden, mu.orden], ['nueva', 'ChatGPT', 27, 18, true, 'Agresivo', 'Pre-apertura', 0, 1]);
    eq('guardar: lo que no vino queda en null', [falta.tp2, falta.dir], [null, '']);
    eq('guardar: fuente desconocida → null ("Sin dato")', P.docSenal(l3[0], 'Grok', N, AH).fuente, null);
    eq('guardar: el número ambiguo guarda su texto para volver a preguntarlo', [amb.amb, amb.txt], [['entrada'], { entrada: '5.123' }]);
    eq('no duplicar: misma señal el mismo día → la encuentra', P.senalRepetida(l3[0], [nvda, mu], AH + 3600e3) === nvda, true);
    eq('no duplicar: otro SL1 → es otra señal', P.senalRepetida(Object.assign({}, l3[0], { sl1: 180.8 }), [nvda], AH), null);
    eq('no duplicar: otra dirección, otro activo u otra entrada → otra señal', [{ dir: 'venta' }, { activo: 'AMD' }, { entrada: 182.5 }].map(c => P.senalRepetida(Object.assign({}, l3[0], c), [nvda], AH)), [null, null, null]);
    eq('no duplicar: al día siguiente (Nueva York) es otra', P.senalRepetida(l3[0], [nvda], AH + 24 * 3600e3), null);
    eq('no duplicar: entrada y SL1 como texto o número dan la misma clave', P.claveSenal({ activo: 'nvda', dir: 'compra', entrada: '182.40', sl1: 180.9 }, AH), P.claveSenal(nvda, nvda.ts));
    eq('no duplicar: sin entrada o sin SL1 nunca se toma por repetida', [P.claveSenal(falta, AH) !== null, P.senalRepetida(Object.assign({}, falta, { sl1: NaN }), [falta], AH)], [false, null]);

    // Compatibilidad con señales guardadas antes de v3.6
    const vieja = { id: 'sv', ts: AH - 600e3, dia: '2026-10-14', origen: 'Radar', activo: 'TSLA', dir: 'compra', entrada: 250, sl1: 248, sl2: 250, tp1: 253.5, tp2: 256, nivel: 27, market: false, noVigente: false, condicional: false, evento: false, texto: 'REGISTRO: …', estado: 'vista' };
    const ov = P.senalComoOpcion(vieja, N);
    eq('compatibilidad: señal "vista" sin fuente se lee', [ov.fuente, ov.nivelIdx, ov.nivelDudoso, ov.amb, ES(vieja).luz], [null, 2, false, [], 'verde']);
    eq('compatibilidad: "vista" y "nueva" de hoy en Nuevas; "operada" no', P.filtrarSenales([vieja, Object.assign({}, vieja, { id: 'so', estado: 'operada' }), nvda], 'nuevas', AH).map(x => x.id), ['x0', 'sv']);

    // Filtros
    const ayer = Object.assign({}, vieja, { id: 'ay', ts: BO(10, 13, 23, 30) });
    const analisisNo = { id: 'an', ts: AH - 60e3, origen: 'Capturas', fuente: 'Claude', activo: 'INTC', dir: '', entrada: null, sl1: null, estado: 'vista', analisis: { puntaje: 40 } };
    const analisisSi = Object.assign({}, analisisNo, { id: 'as', activo: 'AVGO', dir: 'compra', entrada: 352.4, sl1: 349.9, tp1: 356.4, tp2: 359.9, nivel: 27 });
    const lista = [nvda, mu, amd, ayer, analisisNo, analisisSi, Object.assign({}, vieja, { id: 'pr', estado: 'practicada' }), Object.assign({}, vieja, { id: 'de', estado: 'descartada' })];
    eq('filtro Nuevas: hoy, en el orden del pegado; ni las de ayer ni el análisis que dijo no operar', P.filtrarSenales(lista, 'nuevas', AH).map(x => x.id), ['x0', 'x1', 'x2', 'as']);
    eq('filtro Practicando y Descartadas', [P.filtrarSenales(lista, 'practicando', AH).map(x => x.id), P.filtrarSenales(lista, 'descartadas', AH).map(x => x.id)], [['pr'], ['de']]);
    eq('filtro Nuevas: el día es el de Nueva York (23:30 de ayer no entra)', P.filtrarSenales([ayer], 'nuevas', AH).length, 0);

    // Captura del mensaje (transcripción): nada se inventa
    const cap = P.normalizarCapturaSenal({ legible: true, texto: 'RADAR INTRADÍA', senales: [
      { activo: 'Nvidia (NVDA)', direccion: 'compra', tipo_entrada: 'límite', entrada: '182,40', sl1: '180,90', sl2: null, tp1: '184,90', tp2: null, nivel: 'Estándar (USD 27)', origen: null, texto: 'NVDA compra' },
      { activo: null, direccion: 'venta corta', tipo_entrada: 'market urgente', entrada: '5.123', sl1: '5,25', sl2: null, tp1: '4,90', tp2: '4,70', nivel: null, origen: null },
      'basura', null] }, N);
    eq('captura: dos señales (lo que no es una señal se ignora)', cap.length, 2);
    eq('captura: números como se escriben en Bolivia y ticker entre paréntesis', [cap[0].activo, cap[0].dir, cap[0].entrada, cap[0].sl1, cap[0].tp1, cap[0].nivelIdx, cap[0].market, cap[0].origen], ['NVDA', 'compra', 182.4, 180.9, 184.9, 2, false, 'Radar']);
    eq('captura: lo que no se ve queda vacío y "Faltan datos" lo dice', [isNaN(cap[0].tp2), P.faltanDatos(cap[0]), P.docSenal(cap[0], 'ChatGPT', N, AH).tp2], [true, ['TP2'], null]);
    eq('captura: sin activo y sin nivel → falta el activo y el nivel no se supone', [cap[1].activo, P.faltanDatos(cap[1]), cap[1].nivelDudoso, cap[1].nivelIdx, cap[1].dir, cap[1].market], ['', ['activo'], true, 0, 'venta', true]);
    eq('captura: un número ambiguo se marca igual que al pegar', [cap[1].amb, cap[1].txt.entrada], [['entrada'], '5.123']);
    eq('captura: respuesta rara → ninguna señal', [P.normalizarCapturaSenal('basura', N), P.normalizarCapturaSenal({ senales: 'x' }, N), P.normalizarCapturaSenal(null, N)], [[], [], []]);
    const pr = P.promptCapturaSenal();
    eq('captura: el pedido es transcribir, con null y sin inventar', [/TRANSCRIB/.test(pr), /null/.test(pr), /Nunca lo deduzcas, lo calcules ni lo inventes/.test(pr), /SOLO con un objeto JSON/.test(pr), /probabilidades/.test(pr)], [true, true, true, true, true]);

    // Práctica: la operación que se crea
    r = ES(nvda);
    const p = P.practicaDeSenal(r.o, r.calc, D, AH + 1000);
    eq('práctica: marcada, con las unidades de calcular y sin precio de Quantfury', [p.practica, p.unidades, p.unidadesAbiertas, p.riesgoInicial, p.entrada, p.stopActual, p.sl2, p.precioVerificado, p.estado], [true, 18, 18, 27, 182.4, 180.9, 182.4, null, 'abierta']);
    eq('práctica: copia la fuente, el origen y la señal', [p.fuente, p.origen, p.senalId, p.tipoActivo, p.nivel], ['ChatGPT', 'Pre-apertura', 'x0', 'Semis/IA', 27]);
    eq('práctica: solo cuenta como práctica si es exactamente true', [P.esPractica({ practica: true }), P.esPractica({ practica: 'true' }), P.esPractica({}), P.esPractica(null), P.normTrade('a', { practica: 1 }).practica], [true, false, false, false, false]);

    // Práctica: nunca cuenta (funciones puras)
    const pAb = P.normTrade('pa', Object.assign({}, p)), pPerd = [perdida('p1', -27, BO(10, 14, 10, 0)), perdida('p2', -27, BO(10, 14, 10, 30))].map(t => Object.assign(t, { practica: true }));
    const conP = est([pAb].concat(pPerd)), sinP = est([]);
    eq('práctica fuera de los presupuestos (pérdidas, riesgo abierto, disponible)', [conP.perdHoy, conP.perdSem, conP.riesgoAb, conP.dispHoy, conP.dispSem, conP.proximo], [0, 0, 0, 54, 108, 36]);
    eq('práctica fuera de las operaciones del día y del margen', [conP.opsHoy, conP.margenOc, conP.margenLibre, conP.abiertas.length], [0, 0, 450, 0]);
    eq('práctica fuera del semáforo', [P.veredicto(conP, { estado: 'abierto' }), P.semaforoDe(P.veredicto(conP, { estado: 'abierto' })).palabra], [P.veredicto(sinP, { estado: 'abierto' }), 'Podés operar']);
    eq('práctica fuera de lo realizado', [conP.netoHoy, conP.rHoy, conP.netoSem], [0, 0, 0]);
    eq('práctica fuera de la pausa tras rachas', P.estadoPausa(pPerd, D, BO(10, 14, 10, 40)).pausa, false);
    eq('práctica fuera de la curva de la semana', [P.curvaResultados(pPerd).n, P.curvaResultados(pPerd.concat([perdida('r', 13.5, BO(10, 14, 9, 0))])).n], [0, 1]);
    eq('práctica: una real con las mismas pérdidas sí pausa (control)', P.estadoPausa(pPerd.map(t => Object.assign({}, t, { practica: false })), D, BO(10, 14, 10, 40)).pausa, true);
    eq('soloReales deja fuera solo las de práctica', P.soloReales([pAb, nvda, null].filter(Boolean)).length, 1);
    return out;
  }, [AHORA, TRES, REG.toString()]);
  puras.forEach(x => ok(x.name, x.pass, x.got));
  await ctx.close();

  /* ---- 2) Pestañas: siguen siendo cinco, con nombres e iconos nuevos e identificadores de siempre ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'pestañas ' });
    const tabs = await pg.$$eval('.tabs [data-tab]', b => b.map(x => ({ id: x.id, tab: x.getAttribute('data-tab'), panel: x.getAttribute('aria-controls'), txt: x.querySelector('span').textContent, svg: !!x.querySelector('svg') })));
    ok('pestañas: cinco, en orden Hoy · Buscar · Señales · Abiertas · Diario', tabs.map(t => t.txt).join() === 'Hoy,Buscar,Señales,Abiertas,Diario', tabs.map(t => t.txt));
    ok('pestañas: identificadores internos sin cambios (data-tab, ids y paneles)', JSON.stringify(tabs.map(t => [t.id, t.tab, t.panel])) === JSON.stringify(TABS.map(t => ['t-' + t, t, 'p-' + t])) && (await pg.$$('[data-panel]')).length === 5, tabs);
    ok('pestañas: cada una con su icono (lupa en Buscar, bandeja en Señales)', tabs.every(t => t.svg) && await pg.evaluate(() => !!document.querySelector('#t-analizar svg circle') && /M3 13h5l1\.5 2\.5h5L16 13h5/.test(document.querySelector('#t-operar svg').innerHTML)), null);
    await pg.click('#t-analizar');
    ok('Buscar: título nuevo y conserva "Busco entrada" y "Ya estoy dentro"', (await txt(pg, '#h-an')) === 'Buscar' && await pg.isVisible('label[for="cap-modo-e"]') && await pg.isVisible('label[for="cap-modo-d"]') && await pg.isVisible('#cap-zona'), await txt(pg, '#h-an'));
    ok('Buscar: sin nada de la búsqueda con Claude todavía', !/Buscar con Claude|Con Claude|Alpha Vantage/.test(await txt(pg, '#p-analizar')), null);
    await pg.click('#t-operar');
    ok('Señales: título, bloque "Agregar señales" arriba y calculadora debajo', (await txt(pg, '#h-sen')) === 'Señales' && await pg.evaluate(() => { const a = document.getElementById('sen-agregar'), l = document.getElementById('sen-lista'), c = document.getElementById('form'); return !!(a.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(l.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING); }), null);
    ok('Señales: selector "¿De dónde viene?" con ChatGPT, Claude, Propia y Otra (ChatGPT por defecto)', (await pg.$$eval('#sen-fuente option', o => o.map(x => x.value))).join() === 'ChatGPT,Claude,Propia,Otra' && (await pg.inputValue('#sen-fuente')) === 'ChatGPT' && /¿De dónde viene\?/.test(await txt(pg, '#sen-agregar')), null);
    ok('Señales: botones "Leer señales" y "Subir captura"', (await txt(pg, '#btnPegar')) === 'Leer señales' && (await txt(pg, '#btnSenCaptura')) === 'Subir captura', null);
    ok('Señales: filtros Nuevas · Practicando · Descartadas (Nuevas por defecto)', (await pg.$$eval('.sen-filtros label', l => l.map(x => x.textContent))).join() === 'Nuevas,Practicando,Descartadas' && await pg.isChecked('#sen-f-nuevas'), null);
    ok('Señales: sin señales, la bandeja lo dice', /No hay señales nuevas de hoy/.test(await txt(pg, '#sen-lista')), await txt(pg, '#sen-lista'));
    ok('Hoy: el próximo paso nombra la pestaña nueva', await pg.evaluate(() => { document.getElementById('t-hoy').click(); return /Pegá la señal en Señales/.test(document.getElementById('v-next').textContent) && /Ir a Señales/.test(document.getElementById('v-next').textContent); }), await txt(pg, '#v-next'));
    await ctx.close();
  }

  /* ---- 3) Leer varias señales, no duplicar, tarjetas, Operar ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'bandeja ' });
    await leer(pg, TRES, 'Claude');
    let s = await guardados(pg, 'senales');
    ok('leer: tres señales guardadas con estado "nueva" y la fuente elegida', s.length === 3 && s.every(x => x.estado === 'nueva' && x.fuente === 'Claude') && (await txt(pg, '#sen-msg')) === 'Agregué 3 señales a Nuevas.', [s.map(x => [x.activo, x.estado, x.fuente]), await txt(pg, '#sen-msg')]);
    ok('leer: el cuadro queda vacío y el filtro cuenta 3', (await pg.inputValue('#f-pegar')) === '' && (await txt(pg, '#sen-f-nuevas-l')) === 'Nuevas3', await txt(pg, '#sen-f-nuevas-l'));
    let c = await tarjetas(pg);
    ok('tarjetas: una por señal, en el orden del pegado', c.map(x => x.activo).join() === 'NVDA,MU,AMD', c.map(x => x.activo));
    ok('tarjetas: verde, ámbar y ámbar', c.map(x => x.luz).join() === 'verde,ambar,ambar', c.map(x => x.luz));
    const nv = c[0].t;
    ok('tarjeta: activo, dirección, fuente y origen, hora, tipo', /^NVDA/.test(nv) && /Compra/.test(nv) && /Claude · Pre-apertura/.test(nv) && /11:05 · recién/.test(nv) && /Límite/.test(nv), nv);
    ok('tarjeta: entrada, SL1, TP1 y TP2', /Entrada182,40/.test(nv) && /SL1180,90/.test(nv) && /TP1184,90/.test(nv) && /TP2186,20/.test(nv), nv);
    ok('tarjeta: beneficio/riesgo del TP1 y del TP2, nivel y unidades', /B\/R 1,67 · 2,53/.test(nv) && /Estándar \$27 · 18 acc\./.test(nv), nv);
    ok('tarjeta: estado con icono y palabra', await pg.evaluate(() => [...document.querySelectorAll('#sen-lista .sen-est')].every(e => e.querySelector('svg') && e.querySelector('b').textContent.trim())) && /Cumple tus reglas/.test(nv) && /Revisala antes de operar/.test(c[1].t), null);
    ok('tarjeta: siempre "Mirá el precio en Quantfury antes de entrar"', c.every(x => /Mirá el precio en Quantfury antes de entrar\./.test(x.t)), null);
    ok('tarjeta ámbar: el B/R bajo resaltado y el motivo', /B\/R 1,2 · 3,0/.test(c[1].t) && (await pg.$$eval(card('MU') + ' .sen-num b.bajo', b => b.map(x => x.textContent))).join() === '1,2' && /El TP1 da 1,2 y tu mínimo es 1,5\. Podés ajustar el TP1 o practicarla\./.test(c[1].t), c[1].t);
    ok('tarjeta ámbar: nivel no reconocido → Cauteloso $10 y lo avisa', /Cauteloso \$10 · 6,66 acc\./.test(c[2].t) && /No reconocí el nivel de riesgo «Agresivo»/.test(c[2].t), c[2].t);
    ok('botones: verde "Operar", ámbar "Ajustar niveles"; Practicar y Descartar en todas', (await pg.$$eval('#sen-lista [data-sen-op]', b => b.map(x => x.textContent))).join() === 'Operar,Ajustar niveles,Ajustar niveles' && (await pg.$$('#sen-lista [data-sen-prac]:not([disabled])')).length === 3 && (await pg.$$('#sen-lista [data-sen-desc]')).length === 3, null);
    // No duplicar
    await leer(pg, REG('NVDA', 'compra', '182,40', '180,90', '184,90', '186,20', 'Estándar'));
    s = await guardados(pg, 'senales');
    ok('no duplicar: la misma señal otra vez se avisa y no se guarda', s.length === 3 && /La señal NVDA compra ya estaba \(mismo día, activo, dirección, entrada y SL1\): no la dupliqué\./.test(await txt(pg, '#sen-msg')) && /aviso/.test(await pg.getAttribute('#sen-msg', 'class')), await txt(pg, '#sen-msg'));
    ok('no duplicar: el texto queda en el cuadro para revisarlo', /NVDA/.test(await pg.inputValue('#f-pegar')), null);
    await leer(pg, REG('NVDA', 'compra', '182,40', '180,90', '184,90', '186,20', 'Estándar') + '\n' + REG('NVDA', 'compra', '182,40', '180,70', '184,90', '186,20', 'Estándar') + '\n' + REG('NVDA', 'compra', '182,40', '180,70', '184,90', '186,20', 'Estándar'));
    s = await guardados(pg, 'senales');
    ok('no duplicar: con otro SL1 es otra; repetida dentro del mismo pegado tampoco se duplica', s.length === 4 && /Agregué 1 señal a Nuevas\. Ya estaban NVDA compra, NVDA compra/.test(await txt(pg, '#sen-msg')), [s.length, await txt(pg, '#sen-msg')]);
    await leer(pg, 'hola, sin señal');
    ok('leer: sin REGISTRO lo dice y muestra el formato', /No encontré ninguna señal/.test(await txt(pg, '#sen-msg')) && /REGISTRO: fecha \| ACTIVO/.test(await txt(pg, '#sen-msg')), await txt(pg, '#sen-msg'));
    // Operar desde la tarjeta verde: la calculadora sigue exigiendo el precio de Quantfury
    const idNv = (await tarjetas(pg)).find(x => x.activo === 'NVDA' && /180,90/.test(x.t)).id;
    await pg.click('#sen-lista .sen[data-sen="' + idNv + '"] [data-sen-op]');
    // Cargar es inmediato; el paso a "vista" se guarda un instante después: esperarlo en la base.
    await pg.waitForFunction((id) => document.getElementById('f-activo').value === 'NVDA' && (window.__mockStore.get('senales/' + id) || {}).estado === 'vista', idNv);
    ok('Operar: carga la señal en la calculadora', (await pg.inputValue('#f-activo')) === 'NVDA' && (await pg.inputValue('#f-entrada')) === '182,40' && (await pg.inputValue('#f-sl1')) === '180,90' && (await pg.inputValue('#f-tp2')) === '186,20' && await pg.isChecked('#f-n2') && (await pg.inputValue('#f-tipoact')) === 'Semis/IA', await txt(pg, '#pegarMsg'));
    ok('Operar: el precio de Quantfury sigue siendo obligatorio', (await pg.inputValue('#f-ahora')) === '' && await pg.isDisabled('#btnRegistrar') && /Precio de Quantfury no verificado/.test(await txt(pg, '#btnRegistrar')) && await pg.evaluate(() => document.activeElement && document.activeElement.id === 'f-ahora'), await txt(pg, '#btnRegistrar'));
    s = await guardados(pg, 'senales');
    ok('Operar: la señal pasa a "vista" y sigue en Nuevas hasta registrarla', s.find(x => x._id === idNv).estado === 'vista' && (await tarjetas(pg)).some(x => x.id === idNv), s.find(x => x._id === idNv).estado);
    await pg.fill('#f-ahora', '182,45');
    for (const id of ['chk-macro', 'chk-horario', 'chk-stop']) await pg.check('#' + id);
    ok('Operar: con el precio y las casillas se registra como siempre', (await txt(pg, '#btnRegistrar')) === 'Registrar entrada', await txt(pg, '#btnRegistrar'));
    await pg.click('#btnRegistrar');
    await pg.waitForFunction(() => /Registrada NVDA/.test(document.getElementById('calcMsg').textContent));
    // La señal pasa a "operada" después de guardar la operación, y la tarjeta se va con el aviso de la base: esperar las dos cosas.
    await pg.waitForFunction((id) => (window.__mockStore.get('senales/' + id) || {}).estado === 'operada' && !document.querySelector('#sen-lista .sen[data-sen="' + id + '"]'), idNv);
    const t = (await guardados(pg, 'trades'))[0];
    s = await guardados(pg, 'senales');
    ok('Operar: la operación guarda la fuente y la señal; no es de práctica', t.fuente === 'Claude' && t.senalId === idNv && !t.practica && t.unidades === 18, t);
    ok('Operar: la señal queda "operada" y sale de Nuevas', s.find(x => x._id === idNv).estado === 'operada' && !(await tarjetas(pg)).some(x => x.id === idNv), null);
    // Ajustar niveles (ámbar) también carga, con el aviso del nivel
    await pg.click(card('AMD') + ' [data-sen-op]');
    await pg.waitForFunction(() => document.getElementById('f-activo').value === 'AMD');
    ok('Ajustar niveles: carga la señal y avisa del nivel no reconocido', (await pg.inputValue('#f-activo')) === 'AMD' && await pg.isChecked('#f-n0') && /No reconocí el nivel de riesgo «Agresivo»/.test(await txt(pg, '#pegarMsg')), await txt(pg, '#pegarMsg'));
    await ctx.close();
  }

  /* ---- 4) Descartar con motivo opcional de un toque ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'descartar ' });
    await leer(pg, TRES);
    await pg.click(card('MU') + ' [data-sen-desc]');
    ok('descartar: el primer toque muestra los motivos y no guarda nada', (await pg.$$eval(card('MU') + ' [data-sen-mot]', b => b.map(x => x.textContent))).join() === 'No me convence,Llegué tarde,Rompe reglas,Otro,Descartar sin motivo' && (await guardados(pg, 'senales')).every(x => x.estado === 'nueva') && await pg.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-sen-mot')), null);
    await pg.click(card('MU') + ' [data-sen-desc-no]');
    ok('descartar: Cancelar vuelve a los botones', !(await pg.$(card('MU') + ' [data-sen-mot]')) && !!(await pg.$(card('MU') + ' [data-sen-op]')), null);
    await pg.click(card('MU') + ' [data-sen-desc]');
    await pg.click(card('MU') + ' [data-sen-mot="Llegué tarde"]');
    await pg.waitForFunction(() => !document.querySelector('#sen-lista .sen:nth-child(3)'));
    let s = await guardados(pg, 'senales');
    const mu = s.find(x => x.activo === 'MU');
    ok('descartar: un toque en el motivo la marca "descartada" con el motivo', mu.estado === 'descartada' && mu.descarte.motivo === 'Llegué tarde' && mu.descarte.ts > 0 && /Descartaste MU \(llegué tarde\)/.test(await txt(pg, '#sen-msg')), mu);
    await pg.click(card('AMD') + ' [data-sen-desc]');
    await pg.click(card('AMD') + ' [data-sen-mot=""]');
    await pg.waitForFunction(() => document.querySelectorAll('#sen-lista .sen').length === 1);
    s = await guardados(pg, 'senales');
    ok('descartar: sin motivo también se puede', s.find(x => x.activo === 'AMD').estado === 'descartada' && s.find(x => x.activo === 'AMD').descarte.motivo === null, s.find(x => x.activo === 'AMD').descarte);
    await pg.click('label[for="sen-f-descartadas"]');
    const d = await tarjetas(pg);
    ok('filtro Descartadas: muestra las dos con su motivo', d.length === 2 && d.some(x => /^MU/.test(x.t) && /Llegué tarde/.test(x.t)) && d.some(x => /^AMD/.test(x.t) && /Descartada/.test(x.t)) && (await txt(pg, '#sen-f-descartadas-l')) === 'Descartadas2', d.map(x => x.t.slice(0, 120)));
    await ctx.close();
  }

  /* ---- 5) Modo práctica: Practicar, Abiertas, Diario y nada de lo real cambia ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'práctica ' });
    await pg.click('#t-hoy');
    const antes = { meters: await txt(pg, '#meters'), luz: await pg.getAttribute('#verdict', 'data-luz'), mini: await txt(pg, '#mini-txt'), estado: await estadoChatGPT(pg) };
    await leer(pg, TRES);
    await pg.click(card('NVDA') + ' [data-sen-prac]');
    await pg.waitForFunction(() => /Practicando NVDA/.test(document.getElementById('sen-msg').textContent));
    await hayTarjeta(pg, 'NVDA', false);
    let tr = await guardados(pg, 'trades'), s = await guardados(pg, 'senales');
    const p = tr[0], sNv = s.find(x => x.activo === 'NVDA');
    ok('Practicar: crea la operación con practica: true y las unidades calculadas', tr.length === 1 && p.practica === true && p.unidades === 18 && p.estado === 'abierta' && p.precioVerificado === null && p.fuente === 'ChatGPT' && p.senalId === sNv._id, p);
    ok('Practicar: la señal pasa a "practicada" y sale de Nuevas', sNv.estado === 'practicada' && sNv.tradeTs === p.ts && !(await tarjetas(pg)).some(x => x.activo === 'NVDA'), sNv.estado);
    ok('Practicar: el mensaje dice que no cuenta', /Practicando NVDA: 18 acc\. a 182,40\. Está en Abiertas con el chip PRÁCTICA y no cuenta en tus presupuestos\./.test(await txt(pg, '#sen-msg')), await txt(pg, '#sen-msg'));
    await pg.click('label[for="sen-f-practicando"]');
    ok('filtro Practicando: muestra la señal y dónde está', (await tarjetas(pg)).length === 1 && /Practicando desde las 11:05 con 18 acc\. a 182,40: está en Abiertas/.test(await txt(pg, '#sen-lista')) && !!(await pg.$('#sen-lista [data-ir="abiertas"]')), await txt(pg, '#sen-lista'));
    // Practicar también la ámbar (MU, beneficio/riesgo bajo): se puede, no exige precio
    await pg.click('label[for="sen-f-nuevas"]');
    await pg.click(card('MU') + ' [data-sen-prac]');
    await pg.waitForFunction(() => /Practicando MU/.test(document.getElementById('sen-msg').textContent));
    await hayTarjeta(pg, 'MU', false);
    await pg.waitForFunction(() => document.querySelectorAll('#listaAbiertas .pos').length === 2);
    // Nada de lo real cambia
    await pg.click('#t-hoy');
    ok('práctica fuera de los presupuestos de Hoy (pantalla)', (await txt(pg, '#meters')) === antes.meters && /\$0,00 \/ \$54,00/.test(await txt(pg, '#meters')), await txt(pg, '#meters'));
    ok('práctica fuera de las operaciones del día y del margen (pantalla)', /0 \/ 6/.test(await txt(pg, '#meters')) && /\$0,00 \/ \$450,00/.test(await txt(pg, '#meters')) && /0 abiertas ahora/.test(await txt(pg, '#meters')), await txt(pg, '#meters'));
    ok('práctica fuera del semáforo (pantalla)', (await pg.getAttribute('#verdict', 'data-luz')) === antes.luz && (await txt(pg, '#mini-txt')) === antes.mini, await txt(pg, '#mini-txt'));
    ok('práctica fuera de las abiertas de Hoy y de la insignia', /No tenés posiciones abiertas/.test(await txt(pg, '#tb-ab-lista')) && await pg.evaluate(() => document.getElementById('ab-badge').hidden), null);
    const estadoDespues = await estadoChatGPT(pg);
    ok('práctica fuera del estado que se copia para ChatGPT', estadoDespues.replace(/^Estado \S+ \S+/, '') === antes.estado.replace(/^Estado \S+ \S+/, '') && !/NVDA|MU/.test(estadoDespues) && /Abiertas: ninguna\./.test(estadoDespues), estadoDespues);
    // Abiertas: chip PRÁCTICA, se gestiona y cierra igual
    await pg.click('#t-abiertas');
    const pos = await pg.$$eval('#listaAbiertas .pos', l => l.map(x => ({ t: x.textContent, prac: x.classList.contains('practica'), chip: (x.querySelector('.chip.prac') || {}).textContent })));
    ok('Abiertas: las de práctica con el chip PRÁCTICA', pos.length === 2 && pos.every(x => x.prac && x.chip === 'Práctica') && pos.every(x => /de práctica: no cuenta en tus presupuestos/.test(x.t)) && (await txt(pg, '#ab-count')) === '(2)', pos.map(x => x.t.slice(0, 80)));
    ok('Abiertas: el chip se lee PRÁCTICA (mayúsculas por estilo)', await pg.evaluate(() => getComputedStyle(document.querySelector('#listaAbiertas .chip.prac')).textTransform === 'uppercase'), null);
    const idP = (await guardados(pg, 'trades')).find(x => x.activo === 'NVDA')._id, idM = (await guardados(pg, 'trades')).find(x => x.activo === 'MU')._id;
    // Mover el stop a favor, igual que en una real
    await pg.click('.pos[data-id="' + idP + '"] [data-act="stop"]');
    await pg.fill('#ns-' + idP, '181,50');
    await pg.click('.pos[data-id="' + idP + '"] [data-act="ok-stop"]');
    await pg.waitForFunction((id) => (window.__mockStore.get('trades/' + id) || {}).stopActual === 181.5, idP);
    await pg.waitForFunction((id) => /Stop movido181,50/.test((document.querySelector('.pos[data-id="' + id + '"] dl.lv') || {}).textContent || ''), idP);
    const movida = (await guardados(pg, 'trades')).find(x => x._id === idP);
    ok('Abiertas: mover el stop de una de práctica funciona igual (se guarda con su movimiento y se ve en la tarjeta)', movida.stopActual === 181.5 && movida.practica === true && movida.estado === 'abierta' && movida.movimientos.length === 1 &&
      movida.movimientos[0].de === 180.9 && movida.movimientos[0].a === 181.5 && movida.movimientos[0].por === 'manual', movida.movimientos);
    await pg.click('#t-hoy');
    ok('Abiertas: mover el stop de una de práctica no toca los presupuestos ni el semáforo', (await txt(pg, '#meters')) === antes.meters && (await pg.getAttribute('#verdict', 'data-luz')) === antes.luz && (await txt(pg, '#mini-txt')) === antes.mini, await txt(pg, '#meters'));
    await pg.click('#t-abiertas');
    await pg.click('.pos[data-id="' + idP + '"] [data-act="tp1"]');
    ok('Abiertas: el TP1 de una de práctica avisa que no cuenta', /Es de práctica: el resultado no cuenta en tu presupuesto\./.test(await txt(pg, '.pos[data-id="' + idP + '"] .panel')), await txt(pg, '.pos[data-id="' + idP + '"] .panel'));
    await pg.click('.pos[data-id="' + idP + '"] [data-act="cancelar"]');
    // Cerrar las dos con pérdida: el precio de cierre lo escribe Johannes
    for (const [id, precio] of [[idP, '180,90'], [idM, '250,10']]) {
      await pg.click('.pos[data-id="' + id + '"] [data-act="cerrar"]');
      await pg.fill('#pc-' + id, precio);
      await pg.click('.pos[data-id="' + id + '"] label[for^="plan-si-"]');
      await pg.click('.pos[data-id="' + id + '"] [data-act="ok-cerrar"]');
      await pg.waitForFunction((x) => (window.__mockStore.get('trades/' + x) || {}).estado === 'cerrada', id);
    }
    tr = await guardados(pg, 'trades');
    ok('Abiertas: se cierran igual que las reales, con el precio que escribe Johannes', tr.every(x => x.estado === 'cerrada' && x.practica === true) && tr.find(x => x.activo === 'NVDA').pnl < 0, tr.map(x => [x.activo, x.pnl]));
    await pg.click('#t-hoy');
    ok('práctica: dos pérdidas seguidas de práctica no pausan', !(await pg.$('#tb-prot .aviso-p')) && !/Pausa/.test(await txt(pg, '#tb-prot')), await txt(pg, '#tb-prot'));
    ok('práctica: las pérdidas de práctica no tocan los presupuestos ni el realizado', (await txt(pg, '#meters')) === antes.meters && /Realizado hoy \$0,00/.test(await txt(pg, '#v-res')), [await txt(pg, '#meters'), await txt(pg, '#v-res')]);
    ok('práctica fuera de la curva de la semana (pantalla)', /0 cerradas/.test(await txt(pg, '#tb-sem')) && /\+0,0 R|0,0 R/.test(await txt(pg, '#tb-sem')), await txt(pg, '#tb-sem'));
    // Diario: Real | Práctica
    await pg.click('#t-diario');
    ok('Diario: selector Real | Práctica, Real por defecto', await pg.isChecked('#d-real') && (await pg.$$eval('input[name="d-modo"] + label', l => l.map(x => x.textContent))).join() === 'Real,Práctica', null);
    ok('Diario Real: sin las de práctica (listas y números)', /No hay operaciones cerradas esta semana/.test(await txt(pg, '#diarioLista')) && !/NVDA/.test(await txt(pg, '#diarioLista')) && !/Operaciones/.test(await txt(pg, '#diarioStats')), await txt(pg, '#diarioStats'));
    await pg.click('label[for="d-prac"]');
    const st = await txt(pg, '#diarioStats'), li = await txt(pg, '#diarioLista');
    ok('Diario Práctica: muestra las de práctica con sus totales', /Operaciones2/.test(st) && /0 ganadas · 2 perdidas/.test(st) && /−\$27,00|−\$27,0/.test(li) && /NVDA/.test(li) && /MU/.test(li) && (await txt(pg, '#h-cerradas')) === 'Operaciones de práctica cerradas', [st, li.slice(0, 200)]);
    ok('Diario Práctica: cada una con el chip PRÁCTICA', (await pg.$$('#diarioLista .tr .chip.prac')).length === 2, null);
    // Desde v3.7 la revisión vive en la parte Revisión del Diario: se mira ahí (en Operaciones no se ve nunca).
    await pg.click('label[for="d-p-rev"]');
    ok('Diario Práctica: la revisión con Claude (que es de lo real) no se muestra', !(await pg.isVisible('#revisionBox')) && await pg.isVisible('#rev-prac') && /solo tus operaciones reales/.test(await txt(pg, '#rev-prac')), await txt(pg, '#rev-prac'));
    await pg.click('label[for="d-real"]');
    ok('Diario Real otra vez: la revisión vuelve', await pg.isVisible('#revisionBox') && !(await pg.isVisible('#rev-prac')) && /No hay operaciones cerradas/.test(await txt(pg, '#diarioLista')), null);
    await pg.click('label[for="d-p-ops"]');
    const csv = await pg.evaluate(() => window.PanelTrading.csv());
    ok('CSV: columna "practica" al final (las demás no se mueven)', /;senal_id;nota;practica\r\n/.test(csv) && csv.split('\r\n').slice(1).every(l => /;si$/.test(l)), csv.split('\r\n').slice(0, 2));
    await ctx.close();
  }

  /* ---- 6) Práctica con operaciones reales: los números reales no se mezclan ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'real+práctica ' });
    await sembrar(pg, 'trades', datosSemana().concat([cerrada('pp', -10, AHORA - 600000, { practica: true, activo: 'PRAC' }), ['pab', Object.assign({}, datosSemana()[5][1], { activo: 'PRAB', practica: true })]]));
    await pg.waitForFunction(() => document.querySelectorAll('#tb-ab-lista .ab-fila').length === 2);
    const m = await txt(pg, '#meters');
    ok('reales + práctica: presupuestos y operaciones del día solo con las reales', /\$28,00 \/ \$54,00/.test(m) && /3 \/ 6/.test(m), m);
    ok('reales + práctica: Hoy solo lista las abiertas reales', !/PRAB/.test(await txt(pg, '#tb-ab-lista')) && (await txt(pg, '#ab-badge')) === '2', await txt(pg, '#tb-ab-lista'));
    ok('reales + práctica: curva y R de la semana solo con las reales', /\+0,5 R/.test(await txt(pg, '#tb-sem')) && /4 cerradas · \+\$39,50/.test(await txt(pg, '#tb-sem')) && (await pg.$$('#tb-sem svg.curva circle')).length === 4, await txt(pg, '#tb-sem'));
    const e = await estadoChatGPT(pg);
    ok('reales + práctica: el estado para ChatGPT no nombra las de práctica', /AVGO/.test(e) && !/PRAB|PRAC/.test(e) && /Operaciones hoy: 3 de 6/.test(e), e);
    await pg.click('#t-abiertas');
    ok('reales + práctica: Abiertas muestra las tres, la de práctica marcada', (await pg.$$('#listaAbiertas .pos')).length === 3 && (await pg.$$('#listaAbiertas .pos.practica')).length === 1, null);
    await pg.click('#t-diario');
    ok('reales + práctica: Diario Real no la cuenta', /Operaciones4/.test(await txt(pg, '#diarioStats')) && !/PRAC/.test(await txt(pg, '#diarioLista')), await txt(pg, '#diarioStats'));
    await pg.click('label[for="d-prac"]');
    ok('reales + práctica: Diario Práctica solo la de práctica', /Operaciones1/.test(await txt(pg, '#diarioStats')) && /PRAC/.test(await txt(pg, '#diarioLista')) && !/NVDA/.test(await txt(pg, '#diarioLista')), await txt(pg, '#diarioStats'));
    await ctx.close();
  }

  /* ---- 7) Rojo: dato macro, pausa y Wall Street cerrado, en pantalla ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'rojo ' });
    await leer(pg, TRES);
    await sembrar(pg, 'eventos', [['e1', { ts: BO(10, 14, 11, 20), nombre: 'CPI' }]]);
    await pg.waitForFunction(() => document.querySelector('#sen-lista .sen-est[data-luz="rojo"]'));
    let c = await tarjetas(pg);
    ok('rojo: con un dato macro cerca, todas las tarjetas en rojo', c.length === 3 && c.every(x => x.luz === 'rojo') && c.every(x => /No se puede operar ahora/.test(x.t) && /Dato macro «CPI» a las 11:20 \(Bolivia\)\. Esperá hasta las 11:50\./.test(x.t)), c.map(x => x.t.slice(0, 60)));
    ok('rojo: Operar deshabilitado con la hora y Practicar habilitado', (await pg.$$eval('#sen-lista [data-sen-op]', b => b.map(x => x.disabled + ':' + x.textContent))).every(x => x === 'true:Operar a las 11:50') && (await pg.$$('#sen-lista [data-sen-prac]:not([disabled])')).length === 3, null);
    ok('rojo y ámbar: debajo del rojo, los motivos ámbar', await pg.evaluate(() => { const c = [...document.querySelectorAll('#sen-lista .sen')].find(x => /^MU/.test(x.querySelector('.sen-h strong').textContent)); const e = [...c.querySelectorAll('.sen-est')].map(x => x.getAttribute('data-luz')); return e.join() === 'rojo,ambar' && /El TP1 da 1,2/.test(c.querySelectorAll('.sen-est')[1].textContent); }), null);
    await pg.evaluate(() => { const b = document.querySelector('#sen-lista [data-sen-op]'); b.disabled = false; b.click(); });
    await pg.waitForTimeout(150);
    ok('rojo: aunque se fuerce el botón, no carga la señal', (await pg.inputValue('#f-activo')) === '', await pg.inputValue('#f-activo'));
    await adelantar(pg, '46:00');
    await pg.waitForFunction(() => !document.querySelector('#sen-lista .sen-est[data-luz="rojo"]'));
    c = await tarjetas(pg);
    ok('rojo: pasado el dato vuelven a su color, y la señal vieja lo dice', c.map(x => x.luz).join() === 'verde,ambar,ambar' && c.every(x => /Señal de hace 46 min: mirá el precio en Quantfury antes de entrar\./.test(x.t)) && /11:05 · hace 46 min/.test(c[0].t), c.map(x => x.luz));
    await ctx.close();
    const sab = await abrir({ hora: NY(10, 17, 11, 0), pre: 'sábado ' });
    await leer(sab.pg, TRES);
    c = await tarjetas(sab.pg);
    ok('rojo: sábado → Wall Street cerrado y "Operar el lunes a las 09:30"', c.every(x => x.luz === 'rojo' && /Wall Street está cerrado: abre el lunes a las 09:30 \(Bolivia\)/.test(x.t)) && (await sab.pg.$$eval('#sen-lista [data-sen-op]', b => b.map(x => x.textContent))).every(x => x === 'Operar el lunes a las 09:30'), c.map(x => x.t.slice(0, 80)));
    await sab.ctx.close();
  }

  /* ---- 8) Captura del mensaje (SAMPLE.json simulado): transcribe y no inventa ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'captura ' });
    await pg.click('#t-operar');
    await pg.waitForFunction(() => !document.getElementById('btnSenCaptura').disabled);
    await pg.evaluate(() => { window.__capturaSenalResp = { legible: true, texto: 'RADAR INTRADÍA …', senales: [
      { activo: 'NVDA', direccion: 'compra', tipo_entrada: 'límite', entrada: '182,40', sl1: '180,90', sl2: '182,40', tp1: '184,90', tp2: null, nivel: 'Estándar', origen: 'Radar', texto: 'NVDA compra 182,40 …' },
      { activo: 'MU', direccion: 'venta corta', tipo_entrada: 'límite', entrada: '248,60', sl1: '250,10', sl2: null, tp1: '245,60', tp2: '243,40', nivel: 'Moderado', origen: 'Radar', texto: 'MU venta …' }] }; });
    await pg.selectOption('#sen-fuente', 'Otra');
    const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#btnSenCaptura')]);
    await fc.setFiles({ name: 'mensaje.png', mimeType: 'image/png', buffer: png });
    await pg.waitForFunction(() => /Agregué 2 señales/.test(document.getElementById('sen-msg').textContent), null, { timeout: 5000 });
    await nTarjetas(pg, 2);
    const llamada = await pg.evaluate(() => window.__sampleCalls.filter(c => c.captura).pop());
    ok('captura: una llamada a SAMPLE.json con la imagen y el pedido de transcribir', llamada && llamada.imagenes === 1 && /TRANSCRIPCIÓN DE SEÑALES/.test(llamada.input) && /null/.test(llamada.input), llamada && { img: llamada.imagenes, tier: llamada.tier });
    const s = await guardados(pg, 'senales'), nv = s.find(x => x.activo === 'NVDA');
    ok('captura: el campo que no se ve queda en null en la base', nv && nv.tp2 === null && nv.entrada === 182.4 && nv.estado === 'nueva' && nv.fuente === 'Otra' && nv.origen === 'Radar', nv);
    const c = await tarjetas(pg);
    ok('captura: la tarjeta dice "Faltan datos: TP2" (ámbar)', /Faltan datos: TP2\./.test(c.find(x => x.activo === 'NVDA').t) && c.find(x => x.activo === 'NVDA').luz === 'ambar' && /TP2—/.test(c.find(x => x.activo === 'NVDA').t), c.find(x => x.activo === 'NVDA').t);
    ok('captura: la otra señal completa queda en verde, con su fuente', c.find(x => x.activo === 'MU').luz === 'verde' && /Otra · Radar/.test(c.find(x => x.activo === 'MU').t), c.find(x => x.activo === 'MU').t);
    ok('captura: el mensaje avisa de los datos faltantes y de comparar con la captura', /A una le faltan datos: la tarjeta dice cuáles\./.test(await txt(pg, '#sen-msg')) && /Compará los números con la captura/.test(await txt(pg, '#sen-msg')), await txt(pg, '#sen-msg'));
    ok('captura: no se puede practicar sin los datos que faltan', await pg.isDisabled(card('NVDA') + ' [data-sen-prac]') && (await txt(pg, card('NVDA') + ' [data-sen-prac]')) === 'Faltan datos para practicar', null);
    // La misma captura otra vez: no duplica
    await pg.evaluate(() => { window.__capturaSenalResp.senales = window.__capturaSenalResp.senales.slice(0, 1); });
    const [fc2] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#btnSenCaptura')]);
    await fc2.setFiles({ name: 'mensaje.png', mimeType: 'image/png', buffer: png });
    await pg.waitForFunction(() => /ya estaba/.test(document.getElementById('sen-msg').textContent), null, { timeout: 5000 });
    ok('captura: la misma señal otra vez no se duplica', (await guardados(pg, 'senales')).length === 2, null);
    // Ilegible
    await pg.evaluate(() => { window.__capturaSenalResp = { legible: false, texto: null, senales: [] }; });
    const [fc3] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#btnSenCaptura')]);
    await fc3.setFiles({ name: 'borrosa.png', mimeType: 'image/png', buffer: png });
    await pg.waitForFunction(() => /No pude leer la captura/.test(document.getElementById('sen-msg').textContent), null, { timeout: 5000 });
    ok('captura: si no se lee, lo dice y no guarda nada', (await guardados(pg, 'senales')).length === 2, await txt(pg, '#sen-msg'));
    await ctx.close();
  }

  /* ---- 9) Compatibilidad: señales 'vista' y 'operada' de antes, análisis de capturas y el comprobador ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'compat ' });
    const vieja = (activo, h, extra) => ({ ts: BO(10, 14, h, 0), dia: '2026-10-14', origen: 'Radar', activo, dir: 'compra', entrada: 250, sl1: 248, sl2: 250, tp1: 253.5, tp2: 256, nivel: 27, market: false, noVigente: false, condicional: false, evento: false, texto: 'REGISTRO: …', estado: 'vista', ...extra });
    await sembrar(pg, 'senales', [['s-vista', vieja('TSLA', 10)], ['s-oper', vieja('AAPL', 9, { estado: 'operada', tradeTs: BO(10, 14, 9, 5) })], ['s-ayer', vieja('META', 10, { ts: BO(10, 13, 10, 0), dia: '2026-10-13' })],
      ['c1', { ts: BO(10, 14, 10, 30), dia: '2026-10-14', origen: 'Capturas', activo: 'INTC', dir: '', entrada: null, sl1: null, sl2: null, tp1: null, tp2: null, nivel: null, estado: 'vista', texto: 'Sin setup', analisis: { puntaje: 35, banda: 'No cumple: mejor no operar' } }]]);
    await pg.click('#t-operar');
    await hayTarjeta(pg, 'TSLA');
    const c = await tarjetas(pg);
    ok('compatibilidad: la "vista" de hoy aparece en Nuevas con "Sin dato"', c.length === 1 && c[0].activo === 'TSLA' && /Sin dato · Radar/.test(c[0].t) && c[0].luz === 'verde', c.map(x => x.t.slice(0, 80)));
    ok('compatibilidad: ni la operada, ni la de ayer, ni el análisis que dijo no operar', !c.some(x => /AAPL|META|INTC/.test(x.activo)), null);
    await pg.click(card('TSLA') + ' [data-sen-op]');
    await pg.waitForFunction(() => document.getElementById('f-entrada').value === '250,00');
    ok('compatibilidad: Operar en una señal vieja carga la calculadora', (await pg.inputValue('#f-entrada')) === '250,00' && await pg.isChecked('#f-n2') && /Nivel de riesgo: Estándar/.test(await txt(pg, '#pegarMsg')), await txt(pg, '#pegarMsg'));
    ok('compatibilidad: la vieja no se reescribe (sigue "vista", sin fuente)', await pg.evaluate(() => { const d = window.__mockStore.get('senales/s-vista'); return d.estado === 'vista' && !('fuente' in d); }), null);
    await pg.click('#t-diario');
    const comp = await txt(pg, '#comprobarLista');
    ok('comprobador: sigue mostrando todas las señales con niveles (también las viejas)', /TSLA/.test(comp) && /AAPL/.test(comp) && /META/.test(comp) && /Operada/.test(comp) && (await pg.$$('#comprobarLista [data-chk]')).length === 3, comp.slice(0, 200));
    const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#comprobarLista .sig:has(strong:text-is("AAPL")) [data-chk]')]);
    await fc.setFiles({ name: '5m.png', mimeType: 'image/png', buffer: png });
    await pg.waitForFunction(() => /TP1 primero/.test(document.getElementById('comprobarLista').textContent));
    ok('comprobador: comprobar una señal "operada" funciona como antes', (await pg.evaluate(() => window.__mockStore.get('senales/s-oper').comprobacion.resultado)) === 'tp1', null);
    // Análisis de Buscar: fuente Claude y aparece en Nuevas como "Claude · Buscar"
    await pg.click('#t-analizar');
    await pg.setInputFiles('#cap-files', [{ name: 'd.png', mimeType: 'image/png', buffer: png }]);
    await pg.click('#btnAnalizar');
    await pg.waitForSelector('#cap-resultado .score');
    // El análisis se guarda como señal después de mostrarse: esperarlo en la base.
    await pg.waitForFunction(() => [...window.__mockStore.entries()].some(([k, v]) => k.startsWith('senales/') && v.origen === 'Capturas' && v.activo === 'NVDA'));
    const an = (await guardados(pg, 'senales')).find(x => x.origen === 'Capturas' && x.activo === 'NVDA');
    ok('Buscar: el análisis se guarda como señal con fuente "Claude"', an && an.fuente === 'Claude' && an.estado === 'vista', an && an.fuente);
    ok('Buscar: el botón dice "Cargar en la calculadora"', (await txt(pg, '#btnCargarAnalisis')) === 'Cargar en la calculadora', null);
    await pg.click('#t-operar');
    await hayTarjeta(pg, 'NVDA');
    ok('Buscar → Señales: el análisis aparece en Nuevas como "Claude · Buscar"', (await tarjetas(pg)).some(x => x.activo === 'NVDA' && /Claude · Buscar/.test(x.t)), (await tarjetas(pg)).map(x => x.t.slice(0, 60)));
    await pg.click(card('NVDA') + ' [data-sen-prac]');
    await pg.waitForFunction(() => /Practicando NVDA/.test(document.getElementById('sen-msg').textContent));
    const p = (await guardados(pg, 'trades')).find(x => x.practica);
    ok('Buscar → Practicar: la práctica lleva la fuente y la seguridad del análisis', p && p.fuente === 'Claude' && p.seguridad === 78 && p.origen === 'Capturas', p && [p.fuente, p.seguridad]);
    await ctx.close();
  }

  /* ---- 10) Modo local: leer, practicar y descartar en memoria; Subir captura no está ---- */
  {
    const { ctx, pg } = await abrir({ mock: false, pre: 'local ' });
    await pg.waitForFunction(() => /fuera de Claude/.test(document.getElementById('aviso').textContent));
    await leer(pg, TRES);
    ok('local: leer señales funciona en memoria', (await tarjetas(pg)).length === 3 && (await txt(pg, '#sen-msg')) === 'Agregué 3 señales a Nuevas.', await txt(pg, '#sen-msg'));
    await leer(pg, REG('NVDA', 'compra', '182,40', '180,90', '184,90', '186,20', 'Estándar'));
    ok('local: tampoco duplica', (await tarjetas(pg)).length === 3 && /ya estaba/.test(await txt(pg, '#sen-msg')), await txt(pg, '#sen-msg'));
    ok('local: Subir captura deshabilitado y explica por qué', await pg.isDisabled('#btnSenCaptura') && await pg.isVisible('#sen-cap-no') && /dentro de Claude/.test(await txt(pg, '#sen-cap-no')), null);
    await pg.click(card('NVDA') + ' [data-sen-prac]');
    await pg.waitForFunction(() => /Practicando NVDA/.test(document.getElementById('sen-msg').textContent));
    await hayTarjeta(pg, 'NVDA', false);
    await pg.click('#t-hoy');
    ok('local: la práctica no toca el presupuesto', /\$0,00 \/ \$54,00/.test(await txt(pg, '#meters')) && /0 \/ 6/.test(await txt(pg, '#meters')), await txt(pg, '#meters'));
    await pg.click('#t-abiertas');
    ok('local: la práctica está en Abiertas con su chip', (await pg.$$('#listaAbiertas .pos.practica .chip.prac')).length === 1, null);
    await pg.click('#t-operar');
    await pg.click(card('MU') + ' [data-sen-desc]'); await pg.click(card('MU') + ' [data-sen-mot="Rompe reglas"]');
    await pg.waitForFunction(() => document.querySelectorAll('#sen-lista .sen').length === 1);
    await pg.click(card('AMD') + ' [data-sen-op]');
    ok('local: descartar y operar (cargar la calculadora) también', (await pg.inputValue('#f-activo')) === 'AMD', null);
    await ctx.close();
  }

  /* ---- 11) Sin scroll horizontal: 5 pestañas × 2 temas × 360/390/768/1280, con tarjetas, práctica y Diario Práctica ---- */
  const desbordes = [], contrastes = [];
  for (const ancho of [360, 390, 768, 1280]) {
    const r = await abrir({ ancho, pre: ancho + ' ' });
    await sembrar(r.pg, 'trades', datosSemana().filter(([, d]) => d.estado === 'abierta').map(([id, d]) => [id, id === 't-smci' ? Object.assign({}, d, { activo: 'BRK.B' }) : d])
      .concat([cerrada('pc', -9.5, AHORA - 900000, { practica: true, activo: 'GOOGL', fuente: 'ChatGPT' }), ['pab', Object.assign({}, datosSemana()[4][1], { activo: 'BRK.B', practica: true })]]));
    await leer(r.pg, TRES + '\nBRK.B: señal NO VIGENTE\n' + REG('BRK.B', 'venta', '1.480,50', '1.484,00', '1.474,00', '1.468,00', 'Alta convicción'));
    // Una tarjeta en rojo con motivos ámbar debajo: dato macro con nombre largo
    await sembrar(r.pg, 'eventos', [['e1', { ts: BO(10, 14, 11, 20), nombre: 'Sentimiento del consumidor (U. Michigan)' }]]);
    await r.pg.waitForFunction(() => document.querySelector('#tb-prot .aviso-p')); // que el aviso del dato macro esté en pantalla antes de medir
    for (const tema of ['claro', 'oscuro']) {
      await r.pg.click('label[for="tema-' + tema + '"]');
      for (const t of TABS) {
        await r.pg.click('#t-' + t);
        if (t === 'operar' && tema === 'claro') await r.pg.click(card('MU') + ' [data-sen-desc]'); // los motivos de descartar también tienen que entrar
        if (t === 'diario') await r.pg.click('label[for="d-prac"]');
        const sw = await r.pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (sw > 1) desbordes.push(ancho + ' ' + tema + ' ' + t + ' +' + sw + 'px');
      }
      // Filtros Practicando y Descartadas
      await r.pg.click('#t-operar');
      for (const f of ['practicando', 'descartadas', 'nuevas']) {
        await r.pg.click('label[for="sen-f-' + f + '"]');
        const sw = await r.pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (sw > 1) desbordes.push(ancho + ' ' + tema + ' señales-' + f + ' +' + sw + 'px');
      }
    }
    if (ancho === 390) {
      // Tarjetas sin desbordar su caja: botones y niveles adentro
      ok('390: botones y niveles de cada tarjeta dentro de la tarjeta', await r.pg.evaluate(() => { document.getElementById('t-operar').click(); return [...document.querySelectorAll('#sen-lista .sen')].every(c => { const cr = c.getBoundingClientRect(); return [...c.querySelectorAll('button, dd, .chip, .sen-cuando')].every(e => { const b = e.getBoundingClientRect(); return b.left >= cr.left - 0.5 && b.right <= cr.right + 0.5; }); }); }), null);
      ok('390: los cuatro niveles en una fila, como en el diseño', await r.pg.evaluate(() => { const dd = [...document.querySelectorAll('#sen-lista .sen .lv dd')].slice(0, 4).map(d => d.getBoundingClientRect().top); return dd.length === 4 && dd.every(t => Math.abs(t - dd[0]) < 1); }), null);
      /* Contraste de lo nuevo, medido en pantalla: texto 4,5:1 e iconos 3:1, en claro y en oscuro.
         Primero con el dato macro cerca (rojo con ámbar debajo) y después sin él (verde y ámbar): así se miden las tres cajas. */
      const luces = new Set();
      for (const [momento, tema] of [['macro', 'claro'], ['macro', 'oscuro'], ['libre', 'claro'], ['libre', 'oscuro']]) {
        if (momento === 'libre' && tema === 'claro') {
          await r.pg.evaluate(async () => { const db = await window.claude.use('db'); await db.collection('eventos').doc('e1').delete(); });
          await r.pg.waitForFunction(() => document.querySelector('#sen-lista .sen-est[data-luz="verde"]'));
        }
        await r.pg.click('label[for="tema-' + tema + '"]');
        const medir = (sel, min) => r.pg.evaluate(([s, m]) => {
          const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
          const lum = (c) => c.slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
          const fondo = (el) => { while (el) { const c = rgb(getComputedStyle(el).backgroundColor); if (c.length < 4 || c[3] > 0) return c; el = el.parentElement; } return [255, 255, 255]; };
          return [...document.querySelectorAll(s)].filter(e => e.getBoundingClientRect().width > 0).map(e => { const a = lum(rgb(getComputedStyle(e).color)), b = lum(fondo(e)); const k = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); return { s, k: +k.toFixed(2), ok: k >= m }; });
        }, [sel, min]);
        const casos = [];
        await r.pg.click('#t-operar'); await r.pg.click('label[for="sen-f-nuevas"]');
        for (const [s, m] of [['#sen-lista .sen-est b', 4.5], ['#sen-lista .sen-est p', 4.5], ['#sen-lista .sen-est > svg', 3], ['#sen-lista .sen-linea > span', 4.5], ['#sen-lista .sen-linea > svg', 3], ['#sen-lista .sen-cuando', 4.5],
          ['#sen-lista .sen-num span', 4.5], ['#sen-lista .sen-num b', 4.5], ['#sen-lista .chip', 4.5], ['#sen-lista .lv dt', 4.5], ['#sen-lista [data-sen-op]', 4.5], ['#sen-lista [data-sen-prac]', 4.5], ['#sen-lista [data-sen-desc]', 4.5],
          ['#sen-agregar .card-lbl', 4.5], ['#sen-agregar .sen-fuente label', 4.5], ['#sen-agregar .hint', 4.5], ['.sen-filtros label', 4.5], ['#btnPegar', 4.5], ['#btnSenCaptura', 4.5]]) casos.push(...await medir(s, m));
        await r.pg.click('#t-abiertas');
        casos.push(...await medir('#listaAbiertas .chip.prac', 4.5));
        await r.pg.click('#t-diario');
        casos.push(...await medir('#diarioLista .chip.prac', 4.5), ...await medir('input[name="d-modo"] + label', 4.5));
        (await r.pg.$$eval('#sen-lista .sen-est', l => l.map(e => e.getAttribute('data-luz')))).forEach(l => luces.add(l));
        const malos = casos.filter(c => !c.ok);
        contrastes.push(momento + ' ' + tema + ': ' + casos.length + ' medidas');
        ok('contraste ' + tema + (momento === 'macro' ? ' con dato macro (rojo y ámbar)' : ' sin dato macro (verde y ámbar)') + ': tarjetas, bandeja, filtros y chip PRÁCTICA (' + casos.length + ' elementos)', casos.length >= 60 && !malos.length, malos.length ? malos : casos.length);
      }
      ok('contraste: se midieron las cajas verde, ámbar y roja', ['verde', 'ambar', 'rojo'].every(l => luces.has(l)), [...luces]);
    }
    await r.ctx.close();
  }
  ok('sin scroll horizontal: 5 pestañas × 2 temas × 360/390/768/1280 px, con tarjetas, práctica y Diario Práctica', !desbordes.length, desbordes);

  /* ---- 12) Portabilidad: funciones puras sin pantalla ni plataforma; lo que usa la plataforma, marcado ---- */
  const js = html.slice(html.indexOf('<script>'), html.indexOf('</script>'));
  const cuerpo = (f) => { const i = js.indexOf('function ' + f + '('); let n = 0, j = js.indexOf('{', i); for (let k = j; k < js.length; k++) { if (js[k] === '{') n++; else if (js[k] === '}' && --n === 0) return js.slice(i, k + 1); } return ''; };
  const puras2 = ['estadoSenal', 'claveSenal', 'senalRepetida', 'docSenal', 'senalComoOpcion', 'faltanDatos', 'inpDeSenal', 'filtrarSenales', 'practicaDeSenal', 'normalizarCapturaSenal', 'promptCapturaSenal', 'esPractica', 'soloReales', 'cuandoBo'];
  const sucias = puras2.filter(f => /document\.|\$\(|\bS\.|claude\.|SENALES|TRADES|SAMPLE|Date\.now/.test(cuerpo(f)) || !cuerpo(f));
  ok('portabilidad: las funciones nuevas de reglas y lectura no tocan la pantalla, S ni la plataforma', !sucias.length, sucias);
  ok('portabilidad: guardarSenal y transcribirCapturaSenal marcadas /* PLATAFORMA */', ['guardarSenal', 'transcribirCapturaSenal'].every(f => new RegExp('/\\* PLATAFORMA:[^*]*\\*/\\s*function ' + f + '\\(').test(js)), null);
  const sinComentarios = js.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('portabilidad: no hay llamadas nuevas a claude.use, SAMPLE ni SENALES fuera de sus funciones', (sinComentarios.match(/claude\.use\(/g) || []).length === 4 && (sinComentarios.match(/SAMPLE(\.json)?\(/g) || []).length === 4 && /function transcribirCapturaSenal\(archivo\) \{\s*return pedirJsonConCapturas\(/.test(js), [(sinComentarios.match(/claude\.use\(/g) || []).length, (sinComentarios.match(/SAMPLE(\.json)?\(/g) || []).length]);
  ok('estadoDe filtra las de práctica en un solo lugar (soloReales)', /function estadoDe\(trades, cfg, ts\) \{\s*trades = soloReales\(trades\);/.test(js) && /soloReales\(trades\)\.filter/.test(cuerpo('estadoPausa')) && /!esPractica\(t\)/.test(cuerpo('curvaResultados')), null);

  const fails = results.filter(x => !x.pass);
  console.log('Pruebas de señales y práctica: ' + results.length + ' · fallas: ' + fails.length);
  fails.forEach(f => console.log('FALLA ' + f.name + ' → ' + JSON.stringify(f.got)));
  console.log('Errores de página: ' + (errors.length ? errors.join(' | ') : 'ninguno'));
  fs.writeFileSync(path.join(dir, 'resultado-senales.json'), JSON.stringify({ fecha: new Date().toISOString(), total: results.length, fallas: fails.length, errores: errors, contrastes, casos: results }, null, 2));
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => {
  console.error('ERROR TEST', e);
  results.filter(x => !x.pass).forEach(f => console.log('FALLA ' + f.name + ' → ' + JSON.stringify(f.got)));
  if (errors.length) console.log('Errores de página: ' + errors.join(' | '));
  process.exit(1);
});
