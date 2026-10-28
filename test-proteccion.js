// Pruebas de la Tarea 3: protecciones (calendario macro, aviso de fin de semana, pausa tras rachas, aviso a la mitad) y borrar señales.
// Uso: node test-proteccion.js <carpeta> [archivo]. Reutiliza el simulador de test-panel.js y los datos de datos-tablero.js.
// Los datos son inventados. AHORA: miércoles 14-oct-2026, 11:05 en Nueva York = 11:05 en Bolivia (en octubre las dos van en UTC−4).
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
const pagina = path.join(dir, 'test-proteccion-page.html');
fs.writeFileSync(pagina, skeleton);

const results = [], errors = [];
const ok = (name, pass, got) => results.push({ name, pass: !!pass, got });
const TABS = ['hoy', 'analizar', 'operar', 'abiertas', 'diario'];
const BO = (m, d, h, mi) => Date.UTC(2026, m - 1, d, h + 4, mi); // Bolivia: UTC−4 todo el año
const VIERNES = NY(10, 16, 11, 5); // viernes 16-oct-2026, 11:05 NY
// Operación cerrada inventada (riesgo 10 por defecto) para sembrar en la base.
const cerrada = (id, pnl, cierreTs, riesgo = 10) => [id, { activo: 'X' + id.toUpperCase(), dir: 'compra', entrada: 50, entradaPlan: 50, sl1: 49, sl2: 50, tp1: 52, tp2: 54, nivel: 10, nivelEf: 10, d: 1, unidades: riesgo, unidadesAbiertas: 0,
  riesgoInicial: riesgo, stopActual: 49, estado: 'cerrada', ts: cierreTs - 20 * 60000, parciales: [], movimientos: [], reglasRotas: [], nota: '', origen: 'Radar', tipo: 'limite', tipoActivo: 'Tecnología', seguridad: null,
  cierre: { ts: cierreTs, precio: pnl < 0 ? 49 : 51, unidades: riesgo, pnl, motivo: pnl < 0 ? 'SL1' : 'A mano' }, pnl, r: pnl / riesgo, plan: 'si' }];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

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
  const sembrar = async (pg, col, docs) => {
    await pg.evaluate(async ([c, d]) => { const db = await window.claude.use('db'); for (const [id, x] of d) await db.collection(c).doc(id).set(x); }, [col, docs]);
    // El simulador avisa a cada suscripción con un setTimeout(0). El reloj falso los dispara en orden de creación, así que un
    // setTimeout(0) agendado ahora corre recién cuando la página ya recibió todos los avisos y se re-dibujó: no depende de cuánto tarde.
    await pg.evaluate(() => new Promise(r => setTimeout(r, 0)));
    await pg.waitForTimeout(400); // margen que ya tenía la prueba
  };
  const guardados = (pg, col) => pg.evaluate((c) => [...window.__mockStore.entries()].filter(([k]) => k.startsWith(c + '/')).map(([k, v]) => Object.assign({ _id: k.split('/')[1] }, v)), col);
  const txt = (pg, sel) => pg.textContent(sel);
  const visible = (pg, sel) => pg.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; }, sel);
  // Llena Operar con una entrada válida (no es el ejemplo: ese no se puede registrar).
  const llenarOperar = async (pg, { macro = true } = {}) => {
    await pg.click('#t-operar');
    for (const [id, v] of [['#f-activo', 'NVDA'], ['#f-entrada', '50,00'], ['#f-sl1', '49,20'], ['#f-tp1', '51,30'], ['#f-tp2', '52,40'], ['#f-ahora', '50,05']]) await pg.fill(id, v);
    await pg.check('#chk-horario'); await pg.check('#chk-stop');
    if (macro) await pg.check('#chk-macro');
  };
  const yaEntre = async (pg) => {
    await pg.click('#btnYaEntre');
    await pg.click('#btnYaEntre');
    await pg.waitForFunction(() => /Anotada NVDA/.test(document.getElementById('calcMsg').textContent), null, { timeout: 5000 });
    return (await guardados(pg, 'trades')).find(t => t.activo === 'NVDA');
  };

  /* ---- 1) Funciones puras ---- */
  const { ctx, pg } = await abrir();
  const puras = await pg.evaluate(() => {
    const P = window.PanelTrading, out = [];
    const eq = (name, got, exp) => out.push({ name, got, pass: JSON.stringify(got) === JSON.stringify(exp) });
    const BO = (m, d, h, mi, s = 0) => Date.UTC(2026, m - 1, d, h + 4, mi, s);
    const NY = (y, m, d, h, mi, off) => Date.UTC(y, m - 1, d, h + off, mi); // off = 4 en verano (EDT), 5 en invierno (EST)
    const ev = (id, m, d, h, mi, nombre) => ({ id, ts: BO(m, d, h, mi), nombre });
    const pm = (lista, ts) => { const r = P.proximidadMacro(lista, ts); return [r.estado, r.evento && r.evento.nombre, r.desde, r.hasta]; };

    // proximidadMacro: sin datos
    eq('macro: lista vacía → sin_datos', pm([], BO(10, 14, 11, 5)), ['sin_datos', null, null, null]);
    eq('macro: sin lista (undefined) → sin_datos', pm(undefined, BO(10, 14, 11, 5)), ['sin_datos', null, null, null]);
    eq('macro: día distinto (solo mañana) → sin_datos', pm([ev('a', 10, 15, 11, 5, 'CPI')], BO(10, 14, 11, 5)), ['sin_datos', null, null, null]);
    eq('macro: día distinto (solo ayer) → sin_datos', pm([ev('a', 10, 13, 11, 5, 'CPI')], BO(10, 14, 11, 5)), ['sin_datos', null, null, null]);
    eq('macro: datos inválidos se ignoran → sin_datos', pm([{ id: 'x', ts: 'nada', nombre: 'CPI' }, { id: 'y', ts: BO(10, 14, 11, 20), nombre: '  ' }, null], BO(10, 14, 11, 5)), ['sin_datos', null, null, null]);
    // Bordes de la ventana ±30 min (dato a las 11:30)
    const cpi = [ev('a', 10, 14, 11, 30, 'CPI')];
    eq('macro: 30 min antes justos → libre (no es "menos de 30")', pm(cpi, BO(10, 14, 11, 0)), ['libre', 'CPI', BO(10, 14, 11, 0), BO(10, 14, 12, 0)]);
    eq('macro: 29 min 59 s antes → cerca', pm(cpi, BO(10, 14, 11, 0, 1)), ['cerca', 'CPI', BO(10, 14, 11, 0), BO(10, 14, 12, 0)]);
    eq('macro: a la hora del dato → cerca', pm(cpi, BO(10, 14, 11, 30))[0], 'cerca');
    eq('macro: 29 min 59 s después → cerca', pm(cpi, BO(10, 14, 11, 59, 59))[0], 'cerca');
    eq('macro: 30 min después justos → libre (ya no queda ninguno hoy)', pm(cpi, BO(10, 14, 12, 0)), ['libre', null, null, null]);
    eq('macro: texto del motivo', P.textoMacro(P.proximidadMacro(cpi, BO(10, 14, 11, 10))), 'Dato macro «CPI» a las 11:30 (Bolivia): esperá hasta 12:00');
    eq('macro: textoMacro vacío si no está cerca', P.textoMacro(P.proximidadMacro(cpi, BO(10, 14, 9, 0))), '');
    // Varios eventos
    const dos = [ev('b', 10, 14, 14, 0, 'Fed'), ev('a', 10, 14, 8, 30, 'CPI')];
    eq('macro: varios, libre → el próximo (orden por hora, no por lista)', pm(dos, BO(10, 14, 10, 0)), ['libre', 'Fed', BO(10, 14, 13, 30), BO(10, 14, 14, 30)]);
    eq('macro: varios, cerca del segundo', pm(dos, BO(10, 14, 13, 45)), ['cerca', 'Fed', BO(10, 14, 13, 30), BO(10, 14, 14, 30)]);
    const cadena = [ev('a', 10, 14, 8, 30, 'CPI'), ev('b', 10, 14, 9, 15, 'Ventas')];
    eq('macro: ventanas que se tocan → "hasta" es el final del bloque', pm(cadena, BO(10, 14, 8, 40)), ['cerca', 'CPI', BO(10, 14, 8, 0), BO(10, 14, 9, 45)]);
    eq('macro: en el bloque gana el dato más cercano', pm(cadena, BO(10, 14, 9, 5))[1], 'Ventas');
    eq('macro: el motivo dice cuántos más hay en el bloque', P.textoMacro(P.proximidadMacro(cadena, BO(10, 14, 8, 40))), 'Dato macro «CPI» a las 08:30 (Bolivia) y 1 más: esperá hasta 09:45');
    eq('macro: dos datos a la misma hora', P.proximidadMacro([ev('a', 10, 14, 8, 30, 'CPI'), ev('b', 10, 14, 8, 30, 'Empleo')], BO(10, 14, 8, 20)).eventos.length, 2);
    eq('macro: libre con el próximo dato mañana', pm([ev('a', 10, 14, 8, 30, 'CPI'), ev('b', 10, 15, 9, 0, 'Fed')], BO(10, 14, 11, 5)).slice(0, 2), ['libre', 'Fed']);
    eq('macro: un dato de otro día a menos de 30 min igual frena (pasada la medianoche)', pm([ev('a', 10, 15, 0, 10, 'Asia')], BO(10, 14, 23, 50))[0], 'cerca');
    eq('macro: acepta ts guardado como texto', pm([{ id: 'a', ts: String(BO(10, 14, 11, 20)), nombre: 'CPI' }], BO(10, 14, 11, 5))[0], 'cerca');

    // instanteBolivia y nuevoEvento
    eq('fecha: AAAA-MM-DD y HH:MM de Bolivia (UTC−4)', P.instanteBolivia('2026-10-14', '08:30'), BO(10, 14, 8, 30));
    eq('fecha: DD/MM/AAAA y H:MM', P.instanteBolivia('14/10/2026', '8:30'), BO(10, 14, 8, 30));
    eq('fecha: en enero también UTC−4 (sin horario de verano)', P.instanteBolivia('2027-01-15', '10:00'), Date.UTC(2027, 0, 15, 14, 0));
    eq('fecha: inválidas → NaN', ['2026-02-30|10:00', '2026-10-14|24:00', '2026-10-14|10:60', '|10:00', '2026-10-14|', 'mañana|10:00'].map(x => isNaN(P.instanteBolivia(...x.split('|')))), [true, true, true, true, true, true]);
    const ahora = BO(10, 14, 11, 5);
    eq('nuevo: válido, nombre limpio', P.nuevoEvento('2026-10-14', '14:00', '  Fed   (actas) ', [], ahora), { evento: { ts: BO(10, 14, 14, 0), nombre: 'Fed (actas)' } });
    eq('nuevo: sin hora → error', !!P.nuevoEvento('2026-10-14', '', 'CPI', [], ahora).error, true);
    eq('nuevo: sin nombre → error', /nombre/.test(P.nuevoEvento('2026-10-14', '14:00', ' ', [], ahora).error), true);
    eq('nuevo: salió hace más de 2 h → error', /más de 2 horas/.test(P.nuevoEvento('2026-10-14', '09:00', 'CPI', [], ahora).error), true);
    eq('nuevo: salió hace 1 h → se acepta (todavía se muestra)', P.nuevoEvento('2026-10-14', '10:05', 'CPI', [], ahora).evento.ts, BO(10, 14, 10, 5));
    eq('nuevo: repetido (sin importar mayúsculas ni tildes) → error', /ya está cargado/.test(P.nuevoEvento('2026-10-14', '14:00', 'decisión FED', [ev('a', 10, 14, 14, 0, 'Decision Fed')], ahora).error), true);
    eq('nuevo: nombre de 40 letras como máximo', P.nuevoEvento('2026-10-14', '14:00', 'x'.repeat(60), [], ahora).evento.nombre.length, 40);
    eq('visibles: oculta los que pasaron hace más de 2 h y ordena', P.eventosVisibles([ev('c', 10, 15, 9, 0, 'Mañana'), ev('a', 10, 14, 8, 0, 'Viejo'), ev('b', 10, 14, 9, 30, 'Reciente')], ahora).map(e => e.nombre), ['Reciente', 'Mañana']);
    eq('visibles: 2 h justas todavía se muestra', P.eventosVisibles([ev('a', 10, 14, 9, 5, 'CPI')], ahora).length, 1);

    // avisoFinDeSemana
    const fd = (ts) => P.avisoFinDeSemana(ts);
    eq('finde: viernes normal → aviso', !!fd(NY(2026, 10, 16, 11, 0, 4)), true);
    eq('finde: viernes normal → dice "el lunes" y no inventa montos ni el broker', [/el lunes puede abrir/.test(fd(NY(2026, 10, 16, 11, 0, 4)).texto), /\$|\d|Quantfury/.test(fd(NY(2026, 10, 16, 11, 0, 4)).texto), /Si tu broker cobra swap/.test(fd(NY(2026, 10, 16, 11, 0, 4)).texto)], [true, false, true]);
    eq('finde: viernes desde las 00:00 hasta las 23:59 de NY', [!!fd(NY(2026, 10, 16, 0, 0, 4)), !!fd(NY(2026, 10, 16, 23, 59, 4)), fd(NY(2026, 10, 15, 23, 59, 4))], [true, true, null]);
    eq('finde: jueves con viernes feriado (24-dic-2026) → aviso', [!!fd(NY(2026, 12, 24, 10, 0, 5)), /el viernes no abre Wall Street/.test(fd(NY(2026, 12, 24, 10, 0, 5)).texto), fd(NY(2026, 12, 24, 10, 0, 5)).proximo], [true, true, '2026-12-28']);
    eq('finde: jueves antes de Viernes Santo (25-mar-2027) → aviso', !!fd(NY(2027, 3, 25, 10, 0, 4)), true);
    eq('finde: viernes feriado → nada (25-dic-2026 y 26-mar-2027)', [fd(NY(2026, 12, 25, 10, 0, 5)), fd(NY(2027, 3, 26, 10, 0, 4))], [null, null]);
    eq('finde: sábado y domingo → nada', [fd(NY(2026, 10, 17, 11, 0, 4)), fd(NY(2026, 10, 18, 11, 0, 4))], [null, null]);
    eq('finde: lunes, martes, miércoles y jueves normales → nada', [19, 20, 21, 22].map(d => fd(NY(2026, 10, d, 11, 0, 4))), [null, null, null, null]);
    eq('finde: viernes antes de un lunes feriado dice "el martes" (15-ene-2027)', /el martes puede abrir/.test(fd(NY(2027, 1, 15, 11, 0, 5)).texto), true);
    eq('finde: viernes de cierre temprano igual avisa (27-nov-2026)', !!fd(NY(2026, 11, 27, 11, 0, 5)), true);
    eq('finde: mira la hora de NY, no la de Bolivia (invierno: vie 00:30 Bolivia = jue 23:30 NY)', [fd(Date.UTC(2026, 11, 4, 4, 30)), !!fd(Date.UTC(2026, 11, 5, 4, 30))], [null, true]);

    // estadoPausa y avisoMitad
    const t = (pnl, h, mi, d = 14, r) => ({ estado: 'cerrada', cierre: { ts: BO(10, d, h, mi) }, pnl, r: r == null ? pnl / 10 : r });
    const ep = (lista, ts, regla) => { const e = P.estadoPausa(lista, P.DEF, ts, regla); return [e.pausa, e.hasta, e.restanteMin]; };
    eq('pausa: constantes con nombre', [P.PAUSA_RACHA, P.AVISO_MITAD], [{ perdidasSeguidas: 2, minutos: 30 }, 0.5]);
    eq('pausa: sin operaciones → no', ep([], BO(10, 14, 11, 5)), [false, null, 0]);
    eq('pausa: 2 pérdidas seguidas → 30 min desde el cierre de la segunda', ep([t(-10, 10, 0), t(-8, 10, 20)], BO(10, 14, 10, 30)), [true, BO(10, 14, 10, 50), 20]);
    const e2 = P.estadoPausa([t(-10, 10, 0), t(-8, 10, 20)], P.DEF, BO(10, 14, 10, 30));
    eq('pausa: motivo en lenguaje llano y sin culpa', [/^Dos pérdidas seguidas: es momento de parar y respirar\. Volvé a mirar el mercado a las 10:50 \(Bolivia\)\.$/.test(e2.motivo), /culpa|error|mal|deberías/i.test(e2.motivo)], [true, false]);
    eq('pausa: cuenta atrás redondea hacia arriba (30 s → 1 min)', ep([t(-10, 10, 0), t(-8, 10, 20)], BO(10, 14, 10, 49, 30))[2], 1);
    eq('pausa: termina a los 30 min justos', ep([t(-10, 10, 0), t(-8, 10, 20)], BO(10, 14, 10, 50)), [false, null, 0]);
    eq('pausa: una sola pérdida → no', ep([t(-10, 10, 0)], BO(10, 14, 10, 5))[0], false);
    eq('pausa: ganancia en medio reinicia la racha', ep([t(-10, 10, 0), t(5, 10, 10), t(-8, 10, 20)], BO(10, 14, 10, 30))[0], false);
    eq('pausa: R = 0 en medio no cuenta ni reinicia', ep([t(-10, 10, 0), t(0, 10, 10, 14, 0), t(-8, 10, 20)], BO(10, 14, 10, 30)), [true, BO(10, 14, 10, 50), 20]);
    eq('pausa: R = 0 después no corre la pausa (se cuenta desde la última pérdida)', ep([t(-10, 10, 0), t(-8, 10, 20), t(0, 10, 25, 14, 0)], BO(10, 14, 10, 30))[1], BO(10, 14, 10, 50));
    eq('pausa: casi cero (−$0,003) cuenta como cero, igual que el diario', ep([t(-10, 10, 0), t(-0.003, 10, 10), t(5, 10, 15)], BO(10, 14, 10, 20))[0], false);
    eq('pausa: una ganancia después de la racha la termina', ep([t(-10, 10, 0), t(-8, 10, 20), t(4, 10, 25)], BO(10, 14, 10, 30))[0], false);
    eq('pausa: ayer no cuenta', ep([t(-10, 15, 0, 13), t(-8, 10, 20)], BO(10, 14, 10, 30))[0], false);
    eq('pausa: ayer a las 23:50 y hoy a las 00:10 no son seguidas del mismo día', ep([t(-10, 23, 50, 13), t(-8, 0, 10)], BO(10, 14, 0, 20))[0], false);
    eq('pausa: se ordena por cierre, no por el orden de la lista', ep([t(-8, 10, 20), t(5, 10, 10), t(-10, 10, 0)], BO(10, 14, 10, 30))[0], false);
    eq('pausa: orden de cierre aunque la entrada haya sido en otro orden', ep([Object.assign(t(-8, 10, 20), { ts: BO(10, 14, 9, 0) }), Object.assign(t(5, 9, 50), { ts: BO(10, 14, 9, 30) }), Object.assign(t(-10, 10, 5), { ts: BO(10, 14, 9, 40) })], BO(10, 14, 10, 30)), [true, BO(10, 14, 10, 50), 20]);
    eq('pausa: tres pérdidas → se cuenta desde la tercera', ep([t(-10, 10, 0), t(-8, 10, 20), t(-6, 10, 40)], BO(10, 14, 10, 45)), [true, BO(10, 14, 11, 10), 25]);
    eq('pausa: las abiertas no cuentan (aunque tengan parciales en pérdida)', ep([t(-10, 10, 0), { estado: 'abierta', parciales: [{ ts: BO(10, 14, 10, 10), pnl: -5 }], pnl: -5 }], BO(10, 14, 10, 30))[0], false);
    eq('pausa: otros números con el parámetro regla', [ep([t(-10, 10, 0), t(-8, 10, 20)], BO(10, 14, 10, 30), { perdidasSeguidas: 3, minutos: 60 })[0], ep([t(-10, 10, 0), t(-8, 10, 20), t(-6, 10, 25)], BO(10, 14, 10, 30), { perdidasSeguidas: 3, minutos: 60 })[1]], [false, BO(10, 14, 11, 25)]);
    const am = (perd) => P.avisoMitad({ perdHoy: perd }, P.DEF);
    eq('mitad: debajo del 50 % → nada', am(26.99), null);
    eq('mitad: al 50 % justo → aviso', !!am(27), true);
    eq('mitad: texto con cifras y sin culpa', [am(27).texto, /culpa|error|mal|deberías/i.test(am(27).texto)], ['Las pérdidas de hoy suman $27,00 de $54,00 (50 % del presupuesto diario). Buen momento para bajar el ritmo.', false]);
    eq('mitad: entre 50 % y el tope → aviso', !!am(40), true);
    eq('mitad: en el tope ya lo dice el semáforo → nada', am(54), null);
    eq('mitad: sin pérdidas o sin estado → nada', [am(0), P.avisoMitad(null, P.DEF)], [null, null]);
    // bloqueosProteccion
    const cerca = P.proximidadMacro(cpi, BO(10, 14, 11, 10)), pausa = P.estadoPausa([t(-10, 11, 0), t(-8, 11, 5)], P.DEF, BO(10, 14, 11, 10));
    eq('bloqueos: macro cerca y pausa → dos motivos con su regla', P.bloqueosProteccion(cerca, pausa).map(b => b.regla), ['Entrada a menos de 30 min de un dato macro', 'Entrada durante la pausa tras pérdidas seguidas']);
    eq('bloqueos: el motivo de la pausa lleva la cuenta atrás', P.bloqueosProteccion(null, pausa)[0].motivo, 'Pausa: 25 min tras 2 pérdidas seguidas (hasta las 11:35)');
    eq('bloqueos: libre y sin pausa → nada', P.bloqueosProteccion(P.proximidadMacro(cpi, BO(10, 14, 9, 0)), P.estadoPausa([], P.DEF, BO(10, 14, 9, 0))), []);
    eq('bloqueos: sin datos no bloquea (la casilla se marca a mano)', P.bloqueosProteccion(P.proximidadMacro([], BO(10, 14, 9, 0)), null), []);
    return out;
  });
  puras.forEach(x => ok(x.name, x.pass, x.got));
  await ctx.close();

  /* ---- 2) Calendario macro en Hoy: vacío, añadir, validar, aviso destacado y quitar con confirmación ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'macro ' });
    ok('Hoy vacío: dice que no cargaste datos (nunca "no hay datos macro")', /No cargaste datos macro para hoy: revisalos vos/.test(await txt(pg, '#tb-prot')) && !/no hay datos macro/i.test(await pg.evaluate(() => document.body.innerText)), await txt(pg, '#tb-prot'));
    ok('Hoy vacío: la tarjeta "Datos macro" invita a cargarlos', /No hay datos cargados/.test(await txt(pg, '#mc-lista')) && await visible(pg, '#tb-macro'), await txt(pg, '#mc-lista'));
    ok('Hoy vacío: la fecha arranca en hoy (Bolivia)', (await pg.inputValue('#mc-fecha')) === '2026-10-14', await pg.inputValue('#mc-fecha'));
    await pg.click('#tb-prot [data-ir-macro]');
    ok('Hoy vacío: "Cargar datos macro" lleva al formulario', await pg.evaluate(() => document.activeElement && document.activeElement.id === 'mc-hora'), null);
    await pg.fill('#mc-hora', '11:20'); await pg.click('#btnMacro');
    ok('validar: sin nombre no guarda y lo explica', /nombre/.test(await txt(pg, '#mc-msg')) && (await guardados(pg, 'eventos')).length === 0, await txt(pg, '#mc-msg'));
    await pg.fill('#mc-nombre', 'CPI'); await pg.press('#mc-nombre', 'Enter');
    await pg.waitForFunction(() => /CPI/.test(document.getElementById('mc-lista').textContent));
    let ev = await guardados(pg, 'eventos');
    ok('guardar: colección "eventos", un documento por dato con ts en ms y nombre', ev.length === 1 && ev[0].ts === BO(10, 14, 11, 20) && ev[0].nombre === 'CPI' && Object.keys(ev[0]).sort().join() === '_id,nombre,ts', ev);
    ok('guardar: no toca las colecciones existentes', (await guardados(pg, 'trades')).length === 0 && (await guardados(pg, 'senales')).length === 0 && !(await pg.evaluate(() => window.__mockStore.has('config/main'))), null);
    ok('guardar: limpia hora y nombre y confirma', (await pg.inputValue('#mc-hora')) === '' && (await pg.inputValue('#mc-nombre')) === '' && /Anotado: CPI, hoy a las 11:20/.test(await txt(pg, '#mc-msg')), await txt(pg, '#mc-msg'));
    ok('lista: el dato con hora de Bolivia y "Cerca: no entres"', /CPIhoy a las 11:20 Cerca: no entres/.test((await txt(pg, '#mc-lista')).replace(/Quitar/, '')), await txt(pg, '#mc-lista'));
    const aviso = await pg.evaluate(() => { const a = document.querySelector('#tb-prot .aviso-p'); return a && { tag: a.querySelector('.ap-tag').textContent, ico: !!a.querySelector('.ap-tag svg'), p: a.querySelector('p').textContent, debajo: a.getBoundingClientRect().top >= document.getElementById('verdict').getBoundingClientRect().bottom }; });
    ok('Hoy cerca: aviso destacado bajo el semáforo, con icono y palabra', aviso && aviso.tag === 'Esperá' && aviso.ico && aviso.debajo && aviso.p === 'Dato macro «CPI» a las 11:20 (Bolivia): esperá hasta 11:50 para entrar.', aviso);
    ok('Hoy cerca: el semáforo de presupuesto no cambia', (await pg.getAttribute('#verdict', 'data-luz')) === 'verde' && /Podés operar/.test(await txt(pg, '#v-estado')), await txt(pg, '#v-estado'));
    await pg.fill('#mc-hora', '11:20'); await pg.fill('#mc-nombre', 'cpi'); await pg.click('#btnMacro');
    ok('validar: el mismo dato dos veces no se guarda', /ya está cargado/.test(await txt(pg, '#mc-msg')) && (await guardados(pg, 'eventos')).length === 1, await txt(pg, '#mc-msg'));
    await pg.fill('#mc-hora', '14:00'); await pg.fill('#mc-nombre', 'Fed'); await pg.click('#btnMacro');
    await pg.waitForFunction(() => document.querySelectorAll('#mc-lista .mc-ev').length === 2);
    ok('lista: ordenada por hora, el futuro con cuenta atrás', (await pg.$$eval('#mc-lista .mc-ev strong', e => e.map(x => x.textContent))).join() === 'CPI,Fed' && /en 2 h 55 min/.test(await txt(pg, '#mc-lista')), await txt(pg, '#mc-lista'));
    // Quitar con confirmación
    await pg.click('#mc-lista .mc-ev:nth-child(2) [data-quitar-ev]');
    ok('quitar: el primer toque pregunta y no borra', (await txt(pg, '#mc-lista .mc-ev:nth-child(2) [data-quitar-ev]')) === '¿Quitar?' && (await guardados(pg, 'eventos')).length === 2 && await pg.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-quitar-ev')), await txt(pg, '#mc-lista'));
    await pg.click('#mc-lista .mc-ev:nth-child(2) [data-quitar-ev]');
    await pg.waitForFunction(() => document.querySelectorAll('#mc-lista .mc-ev').length === 1);
    ev = await guardados(pg, 'eventos');
    ok('quitar: el segundo toque quita ese dato y solo ese', ev.length === 1 && ev[0].nombre === 'CPI' && /Dato quitado/.test(await txt(pg, '#mc-msg')), ev);
    // Pasa el tiempo: a las 11:51 el dato ya salió hace más de 30 min
    await adelantar(pg, '46:00');
    await pg.waitForFunction(() => !document.querySelector('#tb-prot .aviso-p'));
    ok('Hoy libre: sin aviso y con una línea (los datos de hoy ya salieron)', /Ya salieron los datos macro que cargaste para hoy/.test(await txt(pg, '#tb-prot')) && /Ya salió/.test(await txt(pg, '#mc-lista')), await txt(pg, '#tb-prot'));
    await pg.fill('#mc-hora', '14:01'); await pg.fill('#mc-nombre', 'Fed'); await pg.click('#btnMacro');
    await pg.waitForFunction(() => /Próximo dato/.test(document.getElementById('tb-prot').textContent));
    ok('Hoy libre: "Próximo dato: Fed en 2 h 10 min"', /Próximo dato: Fed en 2 h 10 min \(14:01 Bolivia · 14:01 NY\)\./.test(await txt(pg, '#tb-prot')), await txt(pg, '#tb-prot'));
    // Pasadas más de 2 horas, el dato viejo deja de mostrarse
    await adelantar(pg, '01:30:00');
    await pg.waitForFunction(() => !/CPI/.test(document.getElementById('mc-lista').textContent));
    ok('lista: los que salieron hace más de 2 h no se muestran (pero no se borran)', (await guardados(pg, 'eventos')).length === 2 && (await pg.$$('#mc-lista .mc-ev')).length === 1, await txt(pg, '#mc-lista'));
    await ctx.close();
  }

  /* ---- 3) Operar bloqueada por un dato macro; "Ya entré igual" sigue funcionando ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'operar-macro ' });
    await llenarOperar(pg);
    ok('Operar sin datos: la casilla se marca a mano y avisa que el calendario está vacío', await pg.isChecked('#chk-macro') && /Tu calendario de hoy está vacío/.test(await txt(pg, '#chk-macro-nota')) && (await txt(pg, '#btnRegistrar')) === 'Registrar entrada', [await txt(pg, '#chk-macro-nota'), await txt(pg, '#btnRegistrar')]);
    await sembrar(pg, 'eventos', [['e1', { ts: BO(10, 14, 11, 20), nombre: 'CPI' }]]);
    await pg.waitForFunction(() => document.getElementById('chk-macro').disabled);
    ok('Operar cerca: la casilla macro queda desmarcada y no se puede marcar', !(await pg.isChecked('#chk-macro')) && await pg.isDisabled('#chk-macro'), null);
    await pg.click('#chk-macro-lbl', { force: true });
    ok('Operar cerca: tocar la etiqueta tampoco la marca', !(await pg.isChecked('#chk-macro')), null);
    ok('Operar cerca: la nota de la casilla dice por qué', /No se puede marcar: Dato macro «CPI» a las 11:20 \(Bolivia\): esperá hasta 11:50/.test(await txt(pg, '#chk-macro-nota')), await txt(pg, '#chk-macro-nota'));
    ok('Operar cerca: botón deshabilitado con el motivo', await pg.isDisabled('#btnRegistrar') && (await txt(pg, '#btnRegistrar')) === 'Dato macro «CPI» a las 11:20 (Bolivia): esperá hasta 11:50', await txt(pg, '#btnRegistrar'));
    ok('Operar cerca: aviso ámbar sobre el botón', /Esperá/.test(await txt(pg, '#op-prot .ap-tag')) && await pg.evaluate(() => document.querySelector('#op-prot .aviso-p').getBoundingClientRect().bottom <= document.getElementById('btnRegistrar').getBoundingClientRect().top), await txt(pg, '#op-prot'));
    await pg.evaluate(() => { const b = document.getElementById('btnRegistrar'); b.disabled = false; b.click(); });
    await pg.waitForTimeout(200);
    ok('Operar cerca: aunque se fuerce el botón, no registra', (await guardados(pg, 'trades')).length === 0, null);
    ok('Operar cerca: "Ya entré igual" visible y habilitado', await visible(pg, '#btnYaEntre') && !(await pg.isDisabled('#btnYaEntre')) && /1 regla rota/.test(await txt(pg, '#btnYaEntre')), await txt(pg, '#btnYaEntre'));
    const t = await yaEntre(pg);
    ok('Ya entré igual: registra y marca la regla del dato macro (sin contarla dos veces)', t && t.estado === 'abierta' && JSON.stringify(t.reglasRotas) === '["Entrada a menos de 30 min de un dato macro"]', t && t.reglasRotas);
    // Al pasar la ventana, todo vuelve a la normalidad
    await adelantar(pg, '46:00');
    await pg.waitForFunction(() => !document.getElementById('chk-macro').disabled);
    await llenarOperar(pg);
    ok('Operar después del dato: la casilla vuelve a marcarse y se registra normal', await pg.isChecked('#chk-macro') && (await txt(pg, '#btnRegistrar')) === 'Registrar entrada' && !(await txt(pg, '#op-prot')), await txt(pg, '#btnRegistrar'));
    await ctx.close();
  }

  /* ---- 4) Pausa tras dos pérdidas seguidas ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'pausa ' });
    await sembrar(pg, 'trades', [cerrada('a', -10, BO(10, 14, 10, 40)), cerrada('b', -10, BO(10, 14, 10, 50))]);
    await pg.waitForFunction(() => document.querySelector('#tb-prot .aviso-p'));
    const av = await pg.evaluate(() => { const a = document.querySelector('#tb-prot .aviso-p'); return { tag: a.querySelector('.ap-tag').textContent, ico: !!a.querySelector('.ap-tag svg'), p: a.querySelector('p').textContent }; });
    ok('Hoy pausa: aviso ámbar con cuenta atrás "Pausa: 15 min"', av.tag === 'Pausa: 15 min' && av.ico && /^Dos pérdidas seguidas: es momento de parar y respirar\. Volvé a mirar el mercado a las 11:20 \(Bolivia\)\. Lo que tenés abierto lo seguís gestionando igual\.$/.test(av.p), av);
    ok('Hoy pausa: el semáforo de presupuesto no cambia (sigue verde con $34)', (await pg.getAttribute('#verdict', 'data-luz')) === 'verde' && /\$34,00/.test(await txt(pg, '#v-line')), await txt(pg, '#v-line'));
    ok('Hoy pausa: sin aviso de la mitad ($20 de $54)', !/presupuesto diario\)/.test(await txt(pg, '#tb-prot')), await txt(pg, '#tb-prot'));
    await llenarOperar(pg);
    ok('Operar pausa: botón deshabilitado con el motivo', await pg.isDisabled('#btnRegistrar') && (await txt(pg, '#btnRegistrar')) === 'Pausa: 15 min tras 2 pérdidas seguidas (hasta las 11:20)', await txt(pg, '#btnRegistrar'));
    ok('Operar pausa: aviso ámbar sobre el botón', (await txt(pg, '#op-prot .ap-tag')) === 'Pausa: 15 min', await txt(pg, '#op-prot'));
    await adelantar(pg, '05:00');
    await pg.waitForFunction(() => /Pausa: 10 min/.test(document.getElementById('tb-prot').textContent));
    ok('Hoy pausa: la cuenta atrás baja sola', /Pausa: 10 min/.test(await txt(pg, '#tb-prot .ap-tag')) && /Pausa: 10 min/.test(await txt(pg, '#btnRegistrar')), await txt(pg, '#tb-prot .ap-tag'));
    ok('Operar pausa: "Ya entré igual" disponible', await visible(pg, '#btnYaEntre') && !(await pg.isDisabled('#btnYaEntre')), await txt(pg, '#btnYaEntre'));
    const t = await yaEntre(pg);
    ok('Ya entré igual en pausa: registra y lo marca en el diario', t && JSON.stringify(t.reglasRotas) === '["Entrada durante la pausa tras pérdidas seguidas"]', t && t.reglasRotas);
    await ctx.close();
    // Fin de la pausa a los 30 minutos
    const r = await abrir({ pre: 'pausa-fin ' });
    await sembrar(r.pg, 'trades', [cerrada('a', -10, BO(10, 14, 10, 40)), cerrada('b', -10, BO(10, 14, 10, 50))]);
    await llenarOperar(r.pg);
    ok('pausa: activa antes de las 11:20', await r.pg.isDisabled('#btnRegistrar'), await txt(r.pg, '#btnRegistrar'));
    await adelantar(r.pg, '15:30');
    await r.pg.waitForFunction(() => !document.querySelector('#tb-prot .aviso-p'));
    ok('pausa: a los 30 min se levanta sola (Hoy y Operar)', (await txt(r.pg, '#btnRegistrar')) === 'Registrar entrada' && !(await txt(r.pg, '#op-prot')), await txt(r.pg, '#btnRegistrar'));
    await r.ctx.close();
    // Una ganancia en medio: no hay pausa
    const g = await abrir({ pre: 'pausa-ganancia ' });
    await sembrar(g.pg, 'trades', [cerrada('a', -10, BO(10, 14, 10, 30)), cerrada('c', 6, BO(10, 14, 10, 40)), cerrada('b', -10, BO(10, 14, 10, 50))]);
    await llenarOperar(g.pg);
    ok('pausa: con una ganancia en medio no hay pausa', !(await g.pg.$('#tb-prot .aviso-p')) && (await txt(g.pg, '#btnRegistrar')) === 'Registrar entrada', await txt(g.pg, '#btnRegistrar'));
    await g.ctx.close();
  }

  /* ---- 5) Aviso a la mitad del presupuesto (solo texto) ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'mitad ' });
    await sembrar(pg, 'trades', [cerrada('a', -27, BO(10, 14, 9, 40), 27)]);
    await pg.waitForFunction(() => /presupuesto diario/.test(document.getElementById('tb-prot').textContent));
    ok('Hoy mitad: nota con las pérdidas, sin bloquear ni pausar', /Las pérdidas de hoy suman \$27,00 de \$54,00 \(50 % del presupuesto diario\)\. Buen momento para bajar el ritmo\./.test(await txt(pg, '#tb-prot .nota-p:last-child')) && !(await pg.$('#tb-prot .aviso-p')), await txt(pg, '#tb-prot'));
    ok('Hoy mitad: el semáforo sigue con sus propias reglas', (await pg.getAttribute('#verdict', 'data-luz')) === 'verde', await pg.getAttribute('#verdict', 'data-luz'));
    await llenarOperar(pg);
    ok('Operar mitad: se puede registrar', (await txt(pg, '#btnRegistrar')) === 'Registrar entrada', await txt(pg, '#btnRegistrar'));
    await ctx.close();
  }

  /* ---- 6) Aviso de fin de semana: Hoy, Operar y cada posición de Abiertas; nunca bloquea ---- */
  {
    const { ctx, pg } = await abrir({ hora: VIERNES, pre: 'viernes ' });
    await sembrar(pg, 'trades', datosSemana());
    ok('Hoy viernes: línea bajo la ventana de sesión', await visible(pg, '#vt-finde') && /^Último día hábil de la semana: si dejás una posición abierta el fin de semana, el lunes puede abrir con un salto de precio \(gap\)/.test(await txt(pg, '#vt-finde')) && await pg.evaluate(() => document.getElementById('vt-finde').getBoundingClientRect().top > document.getElementById('vt-head').getBoundingClientRect().bottom), await txt(pg, '#vt-finde'));
    await llenarOperar(pg);
    ok('Operar viernes: nota sobre el botón y el botón sigue habilitado', /Último día hábil de la semana/.test(await txt(pg, '#op-prot .nota-p')) && (await txt(pg, '#btnRegistrar')) === 'Registrar entrada' && !(await pg.isDisabled('#btnRegistrar')), await txt(pg, '#btnRegistrar'));
    await pg.click('#t-abiertas');
    const notas = await pg.$$eval('#listaAbiertas .pos', ps => ps.map(p => (p.querySelector('.nota-p') || {}).textContent || ''));
    ok('Abiertas viernes: cada posición lleva el aviso', notas.length === 2 && notas.every(n => /el lunes puede abrir con un gap que ejecute el stop peor de lo previsto/.test(n)), notas);
    await ctx.close();
    const m = await abrir({ pre: 'miércoles ' });
    await sembrar(m.pg, 'trades', datosSemana());
    ok('miércoles: sin aviso de fin de semana en Hoy, Operar ni Abiertas', !(await visible(m.pg, '#vt-finde')) && !(await txt(m.pg, '#op-prot')) && (await m.pg.$$('#listaAbiertas .nota-p')).length === 0, null);
    await m.ctx.close();
    const s = await abrir({ hora: NY(10, 17, 11, 0), pre: 'sábado ' });
    ok('sábado: sin aviso de fin de semana', !(await visible(s.pg, '#vt-finde')), null);
    await s.ctx.close();
  }

  /* ---- 7) Borrar una señal desde Comprobar señales ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'señales ' });
    const senal = (activo, h, extra) => ({ ts: BO(10, 14, h, 0), dia: '2026-10-14', origen: 'Radar', activo, dir: 'compra', entrada: 100, sl1: 99, sl2: 100, tp1: 102, tp2: 104, nivel: 27, market: false, noVigente: false, condicional: false, evento: false, texto: 'REGISTRO: …', estado: 'vista', ...extra });
    await sembrar(pg, 'senales', [['s-aaa', senal('AAA', 9, { estado: 'operada', comprobacion: { ts: 1, resultado: 'tp1', detalle: 'Tocó TP1', confianza_lectura: 'media' } })], ['s-bbb', senal('BBB', 10)]]);
    await sembrar(pg, 'trades', [[ 't-aaa', Object.assign(cerrada('aaa', 5, BO(10, 14, 10, 0))[1], { activo: 'AAA', senalId: 's-aaa' }) ]]);
    await pg.click('#t-diario');
    const boton = (a) => '#comprobarLista .sig:has(strong:text-is("' + a + '")) [data-sen-borrar]';
    ok('señales: cada señal tiene "Eliminar"', (await pg.$$eval('#comprobarLista [data-sen-borrar]', b => b.map(x => x.textContent))).join() === 'Eliminar,Eliminar' && /Señales de esta semana: 2/.test(await txt(pg, '#diarioStats')) && /TP primero/.test(await txt(pg, '#comprobarStats')), await txt(pg, '#comprobarLista'));
    await pg.click(boton('AAA'));
    ok('señales: el primer toque pregunta "¿Seguro?" y no borra', (await txt(pg, boton('AAA'))) === '¿Seguro?' && (await guardados(pg, 'senales')).length === 2 && await pg.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-sen-borrar') === 's-aaa'), await txt(pg, boton('AAA')));
    await pg.click(boton('BBB'));
    ok('señales: tocar otra mueve la pregunta y tampoco borra', (await txt(pg, boton('AAA'))) === 'Eliminar' && (await txt(pg, boton('BBB'))) === '¿Seguro?' && (await guardados(pg, 'senales')).length === 2, null);
    await pg.click(boton('AAA')); await pg.click(boton('AAA'));
    await pg.waitForFunction(() => document.querySelectorAll('#comprobarLista .sig').length === 1);
    const quedan = await guardados(pg, 'senales');
    ok('señales: el segundo toque borra solo esa señal de la base', quedan.length === 1 && quedan[0]._id === 's-bbb' && /Señal eliminada/.test(await txt(pg, '#chkMsg')), quedan.map(x => x._id));
    ok('señales: se actualizan la lista y las estadísticas', /Señales de esta semana: 1 · operadas 0/.test(await txt(pg, '#diarioStats')) && !(await txt(pg, '#comprobarStats')), [await txt(pg, '#diarioStats'), await txt(pg, '#comprobarStats')]);
    const tr = await guardados(pg, 'trades');
    ok('señales: no afecta las operaciones del diario', tr.length === 1 && tr[0].senalId === 's-aaa' && /AAA/.test(await txt(pg, '#diarioLista')), tr.map(x => x.senalId));
    await ctx.close();
  }

  /* ---- 8) Modo local: el calendario y el borrado de señales funcionan en memoria ---- */
  {
    const { ctx, pg } = await abrir({ mock: false, pre: 'local ' });
    await pg.waitForFunction(() => /fuera de Claude/.test(document.getElementById('aviso').textContent));
    await pg.fill('#mc-hora', '11:15'); await pg.fill('#mc-nombre', 'CPI'); await pg.click('#btnMacro');
    await pg.waitForFunction(() => document.querySelector('#tb-prot .aviso-p'));
    ok('local: el dato queda en memoria y frena', /CPI/.test(await txt(pg, '#mc-lista')) && /esperá hasta 11:45/.test(await txt(pg, '#tb-prot')), await txt(pg, '#tb-prot'));
    await pg.click('#mc-lista [data-quitar-ev]'); await pg.click('#mc-lista [data-quitar-ev]');
    ok('local: quitar con confirmación', /No hay datos cargados/.test(await txt(pg, '#mc-lista')) && !(await pg.$('#tb-prot .aviso-p')), await txt(pg, '#mc-lista'));
    await pg.click('#t-operar');
    await pg.fill('#f-pegar', 'REGISTRO: 14/10/2026 | NVDA | compra | 180,50 | 178,90 | 180,50 | 183,00 | 185,50 | 27 | 145,00 | estándar (USD 27)');
    await pg.click('#btnPegar');
    await adelantar(pg, '00:31'); // en modo local la lista de señales se refresca con el reloj (cada 30 s), como antes de esta tarea
    await pg.click('#t-diario');
    ok('local: la señal pegada aparece con "Eliminar"', (await pg.$$('#comprobarLista [data-sen-borrar]')).length === 1, await txt(pg, '#comprobarLista'));
    await pg.click('#comprobarLista [data-sen-borrar]'); await pg.click('#comprobarLista [data-sen-borrar]');
    ok('local: la señal se borra con dos toques', /Todavía no hay señales/.test(await txt(pg, '#comprobarLista')), await txt(pg, '#comprobarLista'));
    await ctx.close();
  }

  /* ---- 9) Reglas y ajustes (solo lectura) ---- */
  {
    const { ctx, pg } = await abrir({ pre: 'reglas ' });
    await pg.click('#t-diario'); await pg.evaluate(() => { document.getElementById('ajustes').open = true; });
    const reglas = await txt(pg, '#reglasLista');
    ok('reglas: muestra la pausa, la mitad, el dato macro y el fin de semana', /Pausa tras rachas: después de 2 operaciones cerradas seguidas con pérdida, 30 min sin entradas nuevas/.test(reglas) && /50 % del presupuesto diario/.test(reglas) && /a menos de 30 min/.test(reglas) && /Último día hábil de la semana/.test(reglas) && /Ya entré igual/.test(reglas), reglas);
    ok('reglas: no se agregaron campos editables nuevos (no cambia cfg)', (await pg.$$('#ajustes input')).length === 16, (await pg.$$('#ajustes input')).length);
    await ctx.close();
  }

  /* ---- 10) Sin scroll horizontal con todos los avisos a la vista: 5 pestañas × 2 temas × 4 anchos ---- */
  const conTodo = async (ancho) => {
    const r = await abrir({ ancho, hora: VIERNES, pre: ancho + ' ' });
    // Viernes 11:05: dos pérdidas seguidas que llegan a la mitad (pausa + mitad), un dato macro cerca con nombre largo, otro más tarde, posiciones abiertas y señales.
    await sembrar(r.pg, 'trades', datosSemana().filter(([, d]) => d.estado === 'abierta').concat([cerrada('p1', -14, BO(10, 16, 10, 45), 14), cerrada('p2', -14, BO(10, 16, 10, 55), 14)]));
    await sembrar(r.pg, 'eventos', [['e1', { ts: BO(10, 16, 11, 20), nombre: 'Sentimiento del consumidor (U. Michigan)' }], ['e2', { ts: BO(10, 16, 14, 0), nombre: 'Discurso Fed' }]]);
    await sembrar(r.pg, 'senales', [['s-1', { ts: BO(10, 16, 9, 0), dia: '2026-10-16', origen: 'Pre-apertura', activo: 'BRK.B', dir: 'venta', entrada: 480.5, sl1: 484, sl2: 480.5, tp1: 474, tp2: 468, nivel: 27, estado: 'vista', texto: '' }]]);
    await r.pg.waitForFunction(() => document.querySelectorAll('#tb-prot .aviso-p').length === 2);
    return r;
  };
  const desbordes = [], contrastes = [];
  for (const ancho of [360, 390, 768, 1280]) {
    const r = await conTodo(ancho);
    for (const tema of ['claro', 'oscuro']) {
      await r.pg.click('label[for="tema-' + tema + '"]');
      for (const t of TABS) {
        await r.pg.click('#t-' + t);
        if (t === 'operar') { await llenarOperar(r.pg, { macro: false }); }
        // Las confirmaciones "¿Seguro?" y "¿Quitar?" también tienen que entrar (un solo toque: el segundo borraría).
        if (t === 'diario' && tema === 'claro') await r.pg.click('#comprobarLista [data-sen-borrar]');
        if (t === 'hoy' && tema === 'claro') await r.pg.click('#mc-lista [data-quitar-ev]');
        const sw = await r.pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (sw > 1) desbordes.push(ancho + ' ' + tema + ' ' + t + ' +' + sw + 'px');
      }
    }
    if (ancho === 390) {
      ok('390: Hoy muestra a la vez macro cerca, pausa, mitad y fin de semana', await r.pg.evaluate(() => { document.getElementById('t-hoy').click(); const p = document.getElementById('tb-prot'); return p.querySelectorAll('.aviso-p').length === 2 && /presupuesto diario/.test(p.textContent) && !document.getElementById('vt-finde').hidden; }), await txt(r.pg, '#tb-prot'));
      ok('390: con macro cerca y pausa, el botón explica el primero y cuenta el resto', await r.pg.evaluate(() => { document.getElementById('t-operar').click(); return /^Dato macro «Sentimiento del consumidor \(U\. Michigan\)» a las 11:20 \(Bolivia\): esperá hasta 11:50 \(y 1 más\)$/.test(document.getElementById('btnRegistrar').textContent); }), await txt(r.pg, '#btnRegistrar'));
    }
    if (ancho === 390) {
      /* Contraste de los avisos nuevos, medido en pantalla: texto 4,5:1 e iconos 3:1, en claro y en oscuro. */
      for (const tema of ['claro', 'oscuro']) {
        await r.pg.click('label[for="tema-' + tema + '"]');
        const medir = (sel, min) => r.pg.evaluate(([s, m]) => {
          const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
          const lum = (c) => c.slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
          const fondo = (el) => { while (el) { const c = rgb(getComputedStyle(el).backgroundColor); if (c.length < 4 || c[3] > 0) return c; el = el.parentElement; } return [255, 255, 255]; };
          return [...document.querySelectorAll(s)].filter(e => e.getBoundingClientRect().width > 0).map(e => { const a = lum(rgb(getComputedStyle(e).color)), b = lum(fondo(e)); const k = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); return { s, k: +k.toFixed(2), ok: k >= m }; });
        }, [sel, min]);
        const casos = [];
        await r.pg.click('#t-hoy');
        for (const [s, m] of [['#tb-prot .aviso-p p', 4.5], ['#tb-prot .ap-tag', 4.5], ['#tb-prot .ap-tag svg', 3], ['#tb-prot .nota-p > span', 4.5], ['#tb-prot .nota-p > svg', 3], ['#vt-finde > span', 4.5], ['#vt-finde > svg', 3],
          ['#mc-lista strong', 4.5], ['#mc-lista .mc-cuando', 4.5], ['#mc-lista .chip', 4.5], ['#mc-lista [data-quitar-ev]', 4.5], ['#tb-macro .vt-nota', 4.5], ['#tb-macro label', 4.5]]) casos.push(...await medir(s, m));
        await r.pg.click('#t-operar');
        for (const [s, m] of [['#op-prot .aviso-p p', 4.5], ['#op-prot .ap-tag', 4.5], ['#op-prot .nota-p > span', 4.5], ['#chk-macro-nota', 4.5], ['#chk-macro-lbl span', 4.5], ['#btnRegistrar', 4.5]]) casos.push(...await medir(s, m));
        await r.pg.click('#t-abiertas');
        casos.push(...await medir('#listaAbiertas .nota-p > span', 4.5), ...await medir('#listaAbiertas .nota-p > svg', 3));
        await r.pg.click('#t-diario');
        casos.push(...await medir('#comprobarLista [data-sen-borrar]', 4.5));
        const malos = casos.filter(c => !c.ok);
        contrastes.push(tema + ': ' + casos.length + ' medidas');
        ok('contraste ' + tema + ': avisos, notas, lista de datos macro, casilla bloqueada y botones nuevos (' + casos.length + ' elementos)', casos.length >= 25 && !malos.length, malos.length ? malos : casos.length);
      }
    }
    await r.ctx.close();
  }
  ok('sin scroll horizontal con todos los avisos: 5 pestañas × 2 temas × 360/390/768/1280 px (40 combinaciones)', !desbordes.length, desbordes);

  /* ---- 11) Portabilidad: lo nuevo que usa la plataforma está marcado y concentrado ---- */
  const js = html.slice(html.indexOf('<script>'), html.indexOf('</script>'));
  ok('plataforma: las funciones nuevas que guardan llevan /* PLATAFORMA */', ['borrarSenal', 'escucharEventos', 'guardarEvento', 'quitarEvento'].every(f => new RegExp('/\\* PLATAFORMA:[^*]*\\*/\\s*function ' + f + '\\(').test(js)), null);
  ok('plataforma: EVENTOS solo se usa dentro de sus tres funciones', (js.match(/EVENTOS\./g) || []).length === 3 && (js.match(/SENALES\.doc\(id\)\.delete/g) || []).length === 1, (js.match(/.{0,30}EVENTOS\..{0,20}/g) || []));
  const jsSinComentarios = js.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('plataforma: no hay llamadas nuevas a claude.use (siguen las 4 del arranque)', (jsSinComentarios.match(/claude\.use\(/g) || []).length === 4, (jsSinComentarios.match(/claude\.use\('[a-z]+'\)/g) || []));
  ok('constantes: PAUSA_RACHA y AVISO_MITAD en un solo lugar y fuera de DEF (cfg)', (js.match(/var PAUSA_RACHA = /g) || []).length === 1 && (js.match(/var AVISO_MITAD = /g) || []).length === 1 && !/DEF = \{[^}]*(pausa|mitad)/i.test(js), null);

  const fails = results.filter(x => !x.pass);
  console.log('Pruebas de protecciones: ' + results.length + ' · fallas: ' + fails.length);
  fails.forEach(f => console.log('FALLA ' + f.name + ' → ' + JSON.stringify(f.got)));
  console.log('Errores de página: ' + (errors.length ? errors.join(' | ') : 'ninguno'));
  fs.writeFileSync(path.join(dir, 'resultado-proteccion.json'), JSON.stringify({ fecha: new Date().toISOString(), total: results.length, fallas: fails.length, errores: errors, contrastes, casos: results }, null, 2));
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => {
  console.error('ERROR TEST', e);
  results.filter(x => !x.pass).forEach(f => console.log('FALLA ' + f.name + ' → ' + JSON.stringify(f.got)));
  if (errors.length) console.log('Errores de página: ' + errors.join(' | '));
  process.exit(1);
});
