// Pruebas de "Ya estoy dentro" en Capturas (Tarea 1): validación del stop y flujo en pantalla con la IA simulada.
// Uso: node test-gestion.js <carpeta> [archivo]. Reutiliza el simulador de test-panel.js.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const archivo = process.argv[3] || 'panel-trading.html';
const html = fs.readFileSync(path.join(dir, archivo), 'utf8');
const suite = fs.readFileSync(path.join(__dirname, 'test-panel.js'), 'utf8');
const MOCK = suite.slice(suite.indexOf('const MOCK = `') + 'const MOCK = `'.length, suite.indexOf('})();`;') + '})();'.length);
const skeleton = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>';
const pagina = path.join(dir, 'test-gestion-page.html');
fs.writeFileSync(pagina, skeleton);

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const img = (n) => ({ name: n + '.png', mimeType: 'image/png', buffer: png });
const TRADE = { activo: 'NVDA', dir: 'compra', origen: 'Radar', tipo: 'limite', entradaPlan: 180.5, entrada: 180.5, sl1: 179, sl2: 180.5, tp1: 183, tp2: 185.5, nivel: 27, nivelEf: 27, evento: false, d: 1.5,
  unidades: 18, unidadesAbiertas: 18, riesgoInicial: 27, margen: 162.45, nocional: 3249, precioVerificado: 180.5, stopActual: 179, tp1Hecho: false, parciales: [], movimientos: [], estado: 'abierta',
  reglasRotas: [], nota: '', limitante: 'nivel', senalId: null, tipoActivo: 'Semis/IA', seguridad: null };

const results = [], errors = [];
(async () => {
  const browser = await chromium.launch();
  const ok = (name, pass, got) => results.push({ name, pass: !!pass, got });
  const escuchar = (pg, pre) => {
    pg.on('pageerror', e => errors.push(pre + 'pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(pre + 'console: ' + m.text()); });
  };

  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(MOCK);
  const pg = await ctx.newPage();
  escuchar(pg, '');
  await pg.goto('file://' + pagina);
  await pg.waitForFunction(() => document.getElementById('v-title').textContent !== 'Cargando tus operaciones…', null, { timeout: 15000 });

  /* ---- 1) Validación determinista (funciones puras) ---- */
  const pure = await pg.evaluate(() => {
    const P = window.PanelTrading, cfg = P.DEF, out = [];
    const ok = (name, pass, got) => out.push({ name, pass: !!pass, got: got === undefined ? null : JSON.parse(JSON.stringify(got)) });
    const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-6;
    const N = (o) => P.normalizarGestion(o);
    const V = (p, prop, precio) => P.validarGestion(p, prop ? N(prop) : null, precio, cfg);
    const aviso = (r, re) => r.avisos.some(a => re.test(a.t));
    const rojo = (r, re) => r.avisos.some(a => a.b && re.test(a.t));

    // Compra: entrada 50, stop 49,20, 33,75 u, 1R = $27
    const C = { dir: 'compra', entrada: 50, unidades: 33.75, stop: 49.2, tp1: 51.3, tp2: 52.4, riesgoInicial: 27 };
    let r = V(C, null, 50.6);
    ok('compra: chequeo sin propuesta', r.ok && !r.sinStop && !r.stopSuperado && r.accion === null && r.avisos.length === 0, r);
    ok('compra: riesgo actual $27 = 1 R', near(r.ahora.riesgo, 27) && near(r.ahora.riesgoR, 1), r.ahora);
    ok('compra: desde el precio de ahora devolvés $47,25', near(r.ahora.devolver, 47.25), r.ahora);
    r = V(C, { accion: 'mover_stop', nivel: 49, motivo: 'x' }, 50.6);
    ok('compra: stop más abajo se descarta y avisa', r.accion === null && r.descartada && rojo(r, /por debajo de tu stop actual.*alejaría la pérdida/) && near(r.tras.riesgo, 27), r.avisos);
    r = V(C, { accion: 'mover_stop', nivel: 49.8, motivo: 'x' }, 50.6);
    ok('compra: stop a favor se acepta', r.accion === 'mover_stop' && r.nivel === 49.8 && !r.descartada, r);
    ok('compra: con el stop movido quedan $6,75 = 0,25 R', near(r.tras.riesgo, 6.75) && near(r.tras.riesgoR, 0.25) && near(r.tras.devolver, 27), r.tras);
    r = V(C, { accion: 'mover_stop', nivel: 50.3, motivo: 'x' }, 50.6);
    ok('compra: stop sobre la entrada deja riesgo 0 y asegura ganancia', r.accion === 'mover_stop' && near(r.tras.riesgo, 0) && near(r.tras.siToca, 10.125), r.tras);
    r = V(C, { accion: 'mover_stop', nivel: 50.6, motivo: 'x' }, 50.6);
    ok('compra: stop en el precio actual se descarta (se ejecutaría al instante)', r.accion === null && rojo(r, /se ejecutaría al instante/), r.avisos);
    r = V(C, { accion: 'mover_stop', nivel: 49.2, motivo: 'x' }, 50.6);
    ok('compra: stop igual al actual queda como mantener', r.accion === 'mantener' && !r.descartada, r.accion);
    r = V(C, { accion: 'mover_stop', motivo: 'x' }, 50.6);
    ok('compra: mover stop sin nivel se descarta', r.accion === null && rojo(r, /no dice a qué nivel/), r.avisos);
    r = V(C, { accion: 'mantener', motivo: 'x' }, 49.1);
    ok('compra: precio más allá del stop → única acción salir', r.stopSuperado && r.forzada && r.accion === 'salir' && /el stop ya debió ejecutarse/.test(r.motivo), r);
    ok('compra: la propuesta de mantener queda descartada', r.descartada && rojo(r, /única acción es salir/), r.avisos);
    ok('compra: tras salir no queda riesgo', near(r.tras.riesgo, 0) && r.tras.unidades === 0, r.tras);
    r = V(C, { accion: 'mover_stop', nivel: 49.5, motivo: 'x' }, 49.2);
    ok('compra: precio justo en el stop → salir', r.stopSuperado && r.accion === 'salir' && r.descartada, r.accion);
    r = V(C, null, 48);
    ok('compra: sin IA, precio más allá del stop → salir', r.accion === 'salir' && r.forzada && !r.descartada, r);
    r = V(C, { accion: 'parcial', nivel: 51.3, porcentaje: 50, motivo: 'x' }, 50.6);
    ok('compra: parcial del 50% en 51,30', r.accion === 'parcial' && r.unidadesCerrar === 16.87 && near(r.tras.unidades, 16.88), r);
    ok('compra: riesgo y resultado tras el parcial', near(r.tras.riesgo, 0.8 * 16.88) && near(r.realiza, 1.3 * 16.87), { tras: r.tras, realiza: r.realiza });
    r = V(C, { accion: 'parcial', nivel: 49, porcentaje: 50, motivo: 'x' }, 50.6);
    ok('compra: parcial detrás del stop se descarta', r.accion === null && rojo(r, /detrás de tu stop/), r.avisos);
    r = V(C, { accion: 'parcial', nivel: 51.3, motivo: 'x' }, 50.6);
    ok('compra: parcial sin porcentaje se descarta', r.accion === null && rojo(r, /qué porcentaje/), r.avisos);
    r = V(C, { accion: 'parcial', nivel: 51.3, porcentaje: 100, motivo: 'x' }, 50.6);
    ok('compra: parcial del 100% cierra todo', r.accion === 'parcial' && r.tras.unidades === 0 && aviso(r, /cierra toda/), r.tras);
    r = V(C, { accion: 'parcial', nivel: 50.4, porcentaje: 50, motivo: 'x' }, 50.6);
    ok('compra: parcial por debajo del precio avisa que va a mercado', r.accion === 'parcial' && aviso(r, /precio de mercado/), r.avisos);
    r = V(C, { accion: 'salir', motivo: 'x' }, 50.6);
    ok('compra: salir ahora', r.accion === 'salir' && !r.forzada && near(r.realiza, 20.25) && near(r.tras.riesgo, 0), r);
    r = V(C, { estado: 'invalidada', accion: 'mantener', motivo: 'x' }, 50.6);
    ok('compra: idea invalidada + mantener avisa', r.accion === 'mantener' && aviso(r, /invalidada y aun así/), r.avisos);
    r = V(C, { accion: 'mantener' }, 50.6);
    ok('propuesta sin motivo avisa', aviso(r, /no trae motivo/), r.avisos);

    // Venta corta: entrada 100, stop 101, 27 u, 1R = $27
    const VC = { dir: 'venta', entrada: 100, unidades: 27, stop: 101, riesgoInicial: 27 };
    r = V(VC, null, 99.5);
    ok('venta: riesgo $27 = 1 R y devolvés $40,50', near(r.ahora.riesgo, 27) && near(r.ahora.riesgoR, 1) && near(r.ahora.devolver, 40.5), r.ahora);
    r = V(VC, { accion: 'mover_stop', nivel: 101.5, motivo: 'x' }, 99.5);
    ok('venta: stop más arriba se descarta y avisa', r.accion === null && rojo(r, /por encima de tu stop actual.*alejaría la pérdida/), r.avisos);
    r = V(VC, { accion: 'mover_stop', nivel: 100.5, motivo: 'x' }, 99.5);
    ok('venta: stop más abajo se acepta: $13,50 = 0,5 R', r.accion === 'mover_stop' && near(r.tras.riesgo, 13.5) && near(r.tras.riesgoR, 0.5), r.tras);
    r = V(VC, { accion: 'mover_stop', nivel: 99.4, motivo: 'x' }, 99.5);
    ok('venta: stop debajo del precio actual se descarta', r.accion === null && rojo(r, /por debajo del precio de ahora/), r.avisos);
    r = V(VC, { accion: 'mantener', motivo: 'x' }, 101.2);
    ok('venta: precio más allá del stop → única acción salir', r.stopSuperado && r.accion === 'salir' && r.forzada && r.descartada, r);
    r = V(VC, { accion: 'parcial', nivel: 98.5, porcentaje: 50, motivo: 'x' }, 99.5);
    ok('venta: parcial del 50% en 98,50', r.accion === 'parcial' && r.unidadesCerrar === 13.5 && near(r.realiza, 20.25) && near(r.tras.riesgo, 13.5), r);
    r = V(VC, { accion: 'parcial', nivel: 101.5, porcentaje: 50, motivo: 'x' }, 99.5);
    ok('venta: parcial detrás del stop se descarta', r.accion === null && r.descartada, r.avisos);

    // Sin stop
    const SS = { dir: 'compra', entrada: 50, unidades: 33.75, stop: NaN, riesgoInicial: 27 };
    r = V(SS, null, 50.6);
    ok('sin stop: aviso rojo y riesgo sin límite', r.ok && r.sinStop && !r.stopSuperado && rojo(r, /expuesto sin stop/) && r.ahora.sinLimite, r);
    r = V(SS, { accion: 'mantener', motivo: 'x' }, 50.6);
    ok('sin stop + mantener: el aviso rojo sigue', r.accion === 'mantener' && rojo(r, /expuesto sin stop/), r.avisos);
    r = V(SS, { accion: 'mover_stop', nivel: 49.5, motivo: 'x' }, 50.6);
    ok('sin stop + poner stop: se acepta y calcula el riesgo', r.accion === 'mover_stop' && near(r.tras.riesgo, 16.875) && rojo(r, /la propuesta: 49,50/), r);
    r = V(SS, { accion: 'mover_stop', nivel: 50.8, motivo: 'x' }, 50.6);
    ok('sin stop + stop sobre el precio: se descarta', r.accion === null && r.descartada && rojo(r, /expuesto sin stop/), r.avisos);
    r = V({ dir: 'venta', entrada: 160, unidades: 10, stop: 0 }, { accion: 'mantener', motivo: 'x' }, 159);
    ok('sin stop (0) en venta corta: aviso rojo', r.sinStop && rojo(r, /expuesto sin stop/), r.avisos);

    // Datos que faltan o están mal
    r = V(C, null, NaN);
    ok('sin precio de Quantfury no hay revisión', !r.ok && r.errores.some(e => /precio que ves ahora en Quantfury/.test(e)), r.errores);
    r = V({ ...C, unidades: 0 }, null, 50.6);
    ok('sin unidades no hay revisión', !r.ok && r.errores.some(e => /unidades/.test(e)), r.errores);
    r = V({ ...C, amb: [{ campo: 'precio ahora', raw: '5.123' }] }, null, 50.6);
    ok('número ambiguo se pide aclarar', !r.ok && r.errores.some(e => /5,123/.test(e)), r.errores);
    r = V(C, null, 150);
    ok('precio demasiado lejos de la entrada se rechaza', !r.ok && r.errores.length === 1, r.errores);
    r = V({ ...C, riesgoInicial: NaN }, null, 50.6);
    ok('sin riesgo inicial: dólares sí, R sin dato', r.ok && r.ahora.riesgoR === null && near(r.ahora.riesgo, 27), r.ahora);

    // Respuesta de la IA
    ok('acción "Mover stop" → mover_stop', N({ accion: 'Mover stop' }).accion === 'mover_stop');
    ok('acción "tomar parcial" → parcial', N({ accion: 'tomar parcial' }).accion === 'parcial');
    ok('acción "SALIR" → salir', N({ accion: 'SALIR' }).accion === 'salir');
    ok('acción "promediar" no existe', N({ accion: 'promediar' }).accion === null);
    ok('acción "ampliar stop" no existe', N({ accion: 'ampliar stop' }).accion === null);
    ok('acción "constructor" no existe', N({ accion: 'constructor' }).accion === null);
    ok('estado "Debilitada" → debilitada', N({ estado: 'Debilitada' }).estado === 'debilitada');
    ok('estado raro → sin dato', N({ estado: 'rara' }).estado === 'sin_dato');
    ok('con tildes: "Tomár parcial" → parcial e "Invalidáda" → invalidada', N({ accion: 'Tomár parcial' }).accion === 'parcial' && N({ estado: 'Invalidáda' }).estado === 'invalidada', null);
    ok('porcentaje 150 no vale', N({ porcentaje: 150 }).porcentaje === null);
    ok('porcentaje "50" vale', N({ porcentaje: '50' }).porcentaje === 50);
    ok('capturas ilegibles avisan', N({ legible: false }).advertencias.some(a => /no se leyeron bien/.test(a)));
    r = P.validarGestion(C, N('basura'), 50.6, cfg);
    ok('respuesta rara: sin acción y con aviso', r.ok && r.accion === null && rojo(r, /cuatro acciones/), r.avisos);

    // Prompt y guía de capturas
    const pr = P.promptGestion({ n: 2, activo: 'NVDA', dir: 'compra', entrada: 180.5, unidades: 18, stop: null, tp1: 183, tp2: 185.5, precio: 181.2, notas: '' }, {});
    ok('prompt: marca, JSON y reglas', /REVISIÓN DE POSICIÓN ABIERTA/.test(pr) && /SOLO con un objeto JSON/.test(pr) && /Nunca sugieras promediar/.test(pr) && /No des probabilidades/.test(pr));
    ok('prompt: sin stop y con el precio de Quantfury', /SIN STOP/.test(pr) && /Precio ahora en Quantfury: 181\.2\./.test(pr));
    ok('prompt: las cuatro acciones y los tres estados', ['"mantener"', '"mover_stop"', '"parcial"', '"salir"', '"vigente"', '"debilitada"', '"invalidada"'].every(k => pr.indexOf(k) >= 0));
    const gc = P.guiaCapturas(' nvda ');
    ok('guía: tres capturas con sus rangos', gc && gc.activo === 'NVDA' && JSON.stringify(gc.items) === JSON.stringify(['Diario: 6 a 9 meses', '4H: 4 a 6 semanas', '15 minutos: las últimas 2 o 3 sesiones']), gc);
    ok('guía: sin ticker no hay guía', P.guiaCapturas('') === null && P.guiaCapturas('  ') === null);
    return out;
  });
  pure.forEach(x => ok(x.name, x.pass, x.got));

  /* ---- 2) Flujo en pantalla con la respuesta simulada de la IA ---- */
  const txt = (sel) => pg.textContent(sel);
  const trade = () => pg.evaluate(() => JSON.parse(JSON.stringify(window.__mockStore.get('trades/t1'))));
  const llamadas = () => pg.evaluate(() => window.__sampleCalls.filter(c => c.tipo === 'json').length);
  const ultima = () => pg.evaluate(() => window.__sampleCalls.filter(c => c.tipo === 'json').pop());
  const resp = (o) => pg.evaluate((x) => { window.__gestionResp = x; }, Object.assign({ capturas: [], problemas: [], advertencias: [] }, o));
  const revisar = async (sel = '#btnAnalizar') => {
    const n = await llamadas();
    await pg.click(sel);
    await pg.waitForFunction((k) => window.__sampleCalls.filter(c => c.tipo === 'json').length > k && document.getElementById('btnAnalizar').textContent === 'Revisar posición', n);
    return txt('#ge-resultado');
  };
  const tabla = () => pg.evaluate(() => [...document.querySelectorAll('#ge-resultado .ge-t tbody tr')].map(tr => [...tr.children].map(td => td.innerText.replace(/\n/g, ' '))));
  const sinScroll = () => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  await pg.evaluate(async (t) => { const db = await window.claude.use('db'); await db.collection('trades').doc('t1').set(Object.assign({ ts: Date.now() - 3600e3 }, t)); }, TRADE);
  await pg.waitForFunction(() => document.getElementById('ab-badge').textContent === '1');
  await pg.click('#t-analizar');
  ok('capturas: arranca en Busco entrada', await pg.isChecked('#cap-modo-e') && !(await pg.isVisible('#ge-box')) && await pg.isVisible('#cap-activo'), null);

  // Busco entrada sin capturas: qué capturas tomar
  await pg.fill('#cap-activo', 'amd');
  const guia = await txt('#cap-guia');
  ok('busco entrada: ticker sin capturas muestra qué tomar', /AMD/.test(guia) && /Diario: 6 a 9 meses/.test(guia) && /4H: 4 a 6 semanas/.test(guia) && /15 minutos: las últimas 2 o 3 sesiones/.test(guia), guia);
  await pg.setInputFiles('#cap-files', [img('diario')]);
  ok('busco entrada: con capturas la guía se va', (await txt('#cap-guia')) === '', await txt('#cap-guia'));
  await pg.click('#cap-thumbs [data-quitar="0"]');
  ok('busco entrada: sin capturas vuelve la guía', /AMD/.test(await txt('#cap-guia')), null);
  await pg.fill('#cap-activo', '');
  ok('busco entrada: sin ticker no hay guía', (await txt('#cap-guia')) === '' && (await txt('#btnAnalizar')) === 'Analizar', null);

  // Ya estoy dentro con una posición de Abiertas
  await pg.click('label[for="cap-modo-d"]');
  ok('dentro: muestra la posición y oculta lo de entrada', await pg.isVisible('#ge-box') && !(await pg.isVisible('#cap-activo')) && /vigente/.test(await txt('#cap-intro')), await txt('#cap-intro'));
  const opciones = await pg.evaluate(() => [...document.querySelectorAll('#ge-pos option')].map(o => o.value + '|' + o.textContent));
  ok('dentro: lista las posiciones de Abiertas y la opción manual', opciones.length === 3 && opciones[0] === '|Elegí una posición…' && opciones[1].startsWith('t1|NVDA · compra · 18 u') && opciones[2].startsWith('manual|'), opciones);
  await pg.selectOption('#ge-pos', 't1');
  const campos = await pg.evaluate(() => ['ge-activo', 'ge-dir', 'ge-entrada', 'ge-unidades', 'ge-stop', 'ge-tp1', 'ge-tp2', 'ge-riesgo'].map(id => document.getElementById(id).value + (document.getElementById(id).disabled ? '' : ' (editable)')));
  ok('dentro: rellena ticker, dirección, entrada, unidades, stop y objetivos', JSON.stringify(campos) === JSON.stringify(['NVDA', 'compra', '180,50', '18', '179,00', '183,00', '185,50', '27,00']), campos);
  await pg.setInputFiles('#cap-files', [img('4h'), img('15m')]);
  ok('dentro: sin precio de Quantfury no deja revisar', await pg.isDisabled('#btnAnalizar') && (await txt('#btnAnalizar')) === 'Revisar posición' && /precio que ves ahora en Quantfury/.test(await txt('#ge-check')), await txt('#ge-check'));
  await pg.fill('#ge-ahora', '181,20');
  const chk = await txt('#ge-check');
  ok('dentro: riesgo actual en dólares y en R', /Riesgo abierto: \$27,00 \(1,0 R\)/.test(chk) && /devolvés \$39,60/.test(chk), chk);
  ok('dentro: con el precio deja revisar', !(await pg.isDisabled('#btnAnalizar')), null);

  // a) La IA propone alejar el stop: se descarta
  await resp({ estado: 'debilitada', motivo_estado: 'Perdió el mínimo de 15 min', accion: 'mover_stop', nivel: 178, motivo: 'Darle aire debajo del mínimo' });
  let res = await revisar();
  ok('pantalla: stop que aleja la pérdida se descarta y avisa', /Propuesta descartada \(mover el stop a 178,00\)/.test(res) && /alejaría la pérdida/.test(res) && /Sin acción válida/.test(res) && !(await pg.$('[data-ge-aplicar]')), res.slice(0, 400));
  ok('pantalla: muestra el estado de la idea y lo que dijo el análisis', /Idea: Debilitada/.test(res) && /Lo que dijo el análisis: Darle aire/.test(res), null);
  let tb = await tabla();
  ok('pantalla: descartada, el riesgo con la acción es el mismo', tb[2][1] === '$27,00 1,0 R' && tb[2][2] === '$27,00 1,0 R', tb);
  const ll = await ultima();
  ok('pantalla: manda las capturas y los datos de la posición', ll.imagenes === 2 && ll.tier === 'complex' && /REVISIÓN DE POSICIÓN ABIERTA/.test(ll.input) && /activo NVDA; compra; entrada 180\.5; 18 unidades abiertas; stop vigente 179;/.test(ll.input) && /Precio ahora en Quantfury: 181\.2\./.test(ll.input), ll.input.slice(0, 500));

  // b) Stop a favor: se propone y "aplicar" lleva a Abiertas sin guardar nada
  await resp({ estado: 'debilitada', motivo_estado: 'Perdió fuerza', accion: 'mover_stop', nivel: 180.6, motivo: 'Proteger sobre la entrada' });
  res = await revisar('#btnReRevisar');
  ok('pantalla: stop a favor se propone con su motivo', /Mover el stop a 180,60/.test(res) && /Proteger sobre la entrada/.test(res) && !/Propuesta descartada/.test(res), res.slice(0, 400));
  tb = await tabla();
  ok('pantalla: riesgo ahora $27 (1 R) y con la acción $0', tb[0][2] === '180,60' && tb[2][1] === '$27,00 1,0 R' && tb[2][2] === '$0,00 0,0 R' && tb[3][2] === '$10,80', tb);
  ok('sin scroll 390 con el resultado', await sinScroll(), null);
  let antes = await trade();
  await pg.click('[data-ge-aplicar="mover_stop"]');
  ok('aplicar stop: abre Mover stop en Abiertas con el nivel', await pg.isVisible('#p-abiertas') && (await pg.inputValue('#ns-t1')) === '180,60', null);
  ok('aplicar stop: nada se guarda antes de confirmar', JSON.stringify(await trade()) === JSON.stringify(antes), null);
  await pg.click('.pos [data-act="ok-stop"]');
  await pg.waitForFunction(() => window.__mockStore.get('trades/t1').stopActual === 180.6);
  let t = await trade();
  ok('aplicar stop: se mueve con la confirmación de siempre', t.stopActual === 180.6 && t.movimientos.length === 1 && t.movimientos[0].de === 179, t.movimientos);

  // c) Parcial con nivel y porcentaje
  await pg.click('#t-analizar');
  ok('vuelve a Capturas en Ya estoy dentro', await pg.isVisible('#ge-box') && (await pg.inputValue('#ge-stop')) === '180,60', await pg.inputValue('#ge-stop'));
  await resp({ estado: 'vigente', motivo_estado: 'Sigue a favor', accion: 'parcial', nivel: 183, porcentaje: 50, motivo: 'Llega a la resistencia del TP1' });
  res = await revisar('#btnReRevisar');
  ok('pantalla: parcial con nivel y porcentaje', /Tomar un parcial del 50% en 183,00 \(9 u\)/.test(res) && /Idea: Sigue vigente/.test(res), res.slice(0, 400));
  tb = await tabla();
  ok('pantalla: con el parcial quedan 9 u y realizás +$22,50', tb[1][2] === '9' && tb[4][2] === '+$22,50', tb);
  ok('sin scroll 390 con la tabla completa', await sinScroll(), null);
  antes = await trade();
  await pg.click('[data-ge-aplicar="parcial"]');
  const pf = await pg.evaluate(() => ({ p: document.getElementById('tp1p-t1').value, u: document.getElementById('tp1u-t1').value, m: document.getElementById('tp1m-t1').checked }));
  ok('aplicar parcial: abre la salida parcial en Abiertas con los datos', await pg.isVisible('#p-abiertas') && pf.p === '183,00' && pf.u === '9' && pf.m === true, pf);
  ok('aplicar parcial: nada se guarda antes de confirmar', JSON.stringify(await trade()) === JSON.stringify(antes), null);
  await pg.click('.pos [data-act="ok-tp1"]');
  await pg.waitForFunction(() => window.__mockStore.get('trades/t1').parciales.length === 1);
  t = await trade();
  ok('aplicar parcial: se registra con la confirmación de siempre', t.unidadesAbiertas === 9 && t.parciales[0].unidades === 9 && t.parciales[0].precio === 183 && t.tp1Hecho === true, t.parciales);

  // d) Precio más allá del stop: la única acción es salir, sin llamar a la IA
  await pg.click('#t-analizar');
  const n0 = await llamadas();
  await pg.fill('#ge-ahora', '180,40');
  res = await txt('#ge-resultado');
  ok('pantalla: precio más allá del stop → salir', /Única acción posible/.test(res) && /Salir: el stop ya debió ejecutarse/.test(res), res.slice(0, 400));
  ok('pantalla: la propuesta anterior queda descartada', /Propuesta descartada \(tomar un parcial del 50% en 183,00\)/.test(res), null);
  ok('pantalla: no llama a la IA y no deja revisar', (await llamadas()) === n0 && await pg.isDisabled('#btnAnalizar'), null);
  antes = await trade();
  await pg.click('[data-ge-aplicar="salir"]');
  const pc = await pg.evaluate(() => ({ v: document.getElementById('pc-t1').value, mot: (document.querySelector('input[name="mot-t1"]:checked') || {}).value }));
  ok('aplicar salir: abre Cerrar con motivo stop', await pg.isVisible('#p-abiertas') && pc.mot === 'stop' && pc.v === '180,60', pc);
  ok('aplicar salir: nada se guarda solo', JSON.stringify(await trade()) === JSON.stringify(antes), null);
  await pg.click('.pos [data-act="cancelar"]');

  // e) Posición no registrada y sin stop
  await pg.click('#t-analizar');
  await pg.selectOption('#ge-pos', 'manual');
  ok('manual: campos vacíos y editables', (await pg.inputValue('#ge-entrada')) === '' && !(await pg.isDisabled('#ge-entrada')) && (await pg.inputValue('#ge-ahora')) === '' && /No está en Abiertas/.test(await txt('#ge-pos-hint')), null);
  await pg.fill('#ge-activo', 'amd');
  await pg.selectOption('#ge-dir', 'venta');
  await pg.fill('#ge-entrada', '160');
  await pg.fill('#ge-unidades', '10');
  await pg.fill('#ge-ahora', '159');
  const chk2 = await txt('#ge-check');
  ok('manual sin stop: aviso rojo de exposición', /expuesto sin stop/.test(chk2) && /sin límite/.test(chk2) && await pg.evaluate(() => !!document.querySelector('#ge-check li.b')), chk2);
  await resp({ estado: 'vigente', accion: 'mantener', motivo: 'Sigue bajista' });
  res = await revisar();
  const ll2 = await ultima();
  ok('manual sin stop: el pedido a la IA dice SIN STOP', /SIN STOP/.test(ll2.input) && /activo AMD; venta corta; entrada 160; 10 unidades abiertas/.test(ll2.input), ll2.input.slice(0, 500));
  ok('manual sin stop: la propuesta mantiene el aviso rojo', /Mantener/.test(res) && /expuesto sin stop/.test(res) && /Sin límite/.test(res) && await pg.evaluate(() => !!document.querySelector('#ge-resultado li.b')), res.slice(0, 400));

  // f) Manual en venta corta con stop: alejar se descarta; acercar se acepta, sin botón de aplicar
  await pg.fill('#ge-stop', '161');
  await resp({ estado: 'debilitada', accion: 'mover_stop', nivel: 162, motivo: 'Más aire' });
  res = await revisar('#btnReRevisar');
  ok('manual venta: stop más arriba se descarta', /Propuesta descartada/.test(res) && /por encima de tu stop actual/.test(res), res.slice(0, 400));
  await resp({ estado: 'debilitada', accion: 'mover_stop', nivel: 160.5, motivo: 'Bajar el stop' });
  res = await revisar('#btnReRevisar');
  ok('manual venta: stop más abajo se acepta, sin botón para aplicar', /Mover el stop a 160,50/.test(res) && !(await pg.$('[data-ge-aplicar]')) && /no está en Abiertas/.test(res) && /R sin dato/.test(res), res.slice(0, 400));

  // g) Acción fuera de las cuatro
  await resp({ estado: 'debilitada', accion: 'promediar', nivel: 158, motivo: 'Mejorar el precio' });
  res = await revisar('#btnReRevisar');
  ok('acción no permitida: no hay propuesta', /cuatro acciones/.test(res) && /Sin acción válida/.test(res) && !(await pg.$('[data-ge-aplicar]')), res.slice(0, 400));
  ok('sin scroll 390 en Ya estoy dentro', await sinScroll(), null);
  await pg.screenshot({ path: path.join(dir, 'shot-gestion-390.png'), fullPage: true });

  // h) Volver a Busco entrada: el flujo de siempre sigue igual
  await pg.click('label[for="cap-modo-e"]');
  ok('volver a Busco entrada', !(await pg.isVisible('#ge-box')) && !(await pg.isVisible('#ge-resultado')) && await pg.isVisible('#cap-activo') && (await txt('#btnAnalizar')) === 'Analizar', null);
  await pg.click('#btnAnalizar');
  await pg.waitForSelector('#cap-resultado .score');
  ok('Busco entrada sigue analizando como antes', /78\/100/.test(await txt('#cap-resultado')) && !/REVISIÓN DE POSICIÓN/.test((await ultima()).input), null);

  /* ---- 3) Modo local (fuera de Claude): la validación funciona sin IA ---- */
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const pl = await ctx2.newPage();
  escuchar(pl, 'local ');
  await pl.goto('file://' + pagina);
  await pl.waitForFunction(() => /fuera de Claude/.test(document.getElementById('aviso').textContent));
  await pl.click('#t-analizar');
  await pl.click('label[for="cap-modo-d"]');
  ok('local: sin posiciones, se carga a mano', (await pl.inputValue('#ge-pos')) === 'manual' && await pl.isVisible('#ge-entrada'), null);
  await pl.fill('#ge-entrada', '50');
  await pl.fill('#ge-unidades', '10');
  await pl.fill('#ge-stop', '49');
  await pl.fill('#ge-ahora', '50,50');
  ok('local: riesgo en dólares; sin riesgo inicial no hay R', /Riesgo abierto: \$10,00 si toca el stop/.test(await pl.textContent('#ge-check')) && /Sin riesgo inicial no se puede medir en R/.test(await pl.textContent('#ge-check')), await pl.textContent('#ge-check'));
  await pl.fill('#ge-ahora', '48,50');
  ok('local: precio más allá del stop → salir, sin IA', /el stop ya debió ejecutarse/.test(await pl.textContent('#ge-resultado')) && await pl.isDisabled('#btnAnalizar'), await pl.textContent('#ge-resultado'));
  ok('local: sin scroll 390', await pl.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), null);

  const fails = results.filter(x => !x.pass);
  console.log('Pruebas de Ya estoy dentro: ' + results.length + ' · fallas: ' + fails.length);
  fails.forEach(f => console.log('FALLA ' + f.name + ' → ' + JSON.stringify(f.got)));
  console.log('Errores de página: ' + (errors.length ? errors.join(' | ') : 'ninguno'));
  fs.writeFileSync(path.join(dir, 'resultado-gestion.json'), JSON.stringify({ fecha: new Date().toISOString(), total: results.length, fallas: fails.length, errores: errors, casos: results }, null, 2));
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => {
  console.error('ERROR TEST', e);
  results.filter(x => !x.pass).forEach(f => console.log('FALLA ' + f.name + ' → ' + JSON.stringify(f.got)));
  if (errors.length) console.log('Errores de página: ' + errors.join(' | '));
  process.exit(1);
});
