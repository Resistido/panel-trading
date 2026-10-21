// Pruebas de la Tarea 2b: identidad visual "Centinela" (nombre, tokens y contraste, barra del día, signos y flechas, semáforo, desborde).
// Uso: node test-centinela.js <carpeta> [archivo]. Reutiliza el simulador de test-panel.js y los datos de datos-tablero.js.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const archivo = process.argv[3] || 'panel-trading.html';
const html = fs.readFileSync(path.join(dir, archivo), 'utf8');
const suite = fs.readFileSync(path.join(__dirname, 'test-panel.js'), 'utf8');
const MOCK = suite.slice(suite.indexOf('const MOCK = `') + 'const MOCK = `'.length, suite.indexOf('})();`;') + '})();'.length);
const { NY, AHORA, datosSemana } = require('./datos-tablero.js');
const skeleton = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>';
const pagina = path.join(dir, 'test-centinela-page.html');
fs.writeFileSync(pagina, skeleton);

const results = [], errors = [];
const ok = (name, pass, got) => results.push({ name, pass: !!pass, got });
const TABS = ['hoy', 'analizar', 'operar', 'abiertas', 'diario'];
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
  const sembrar = async (pg, docs) => {
    await pg.evaluate(async (d) => { const db = await window.claude.use('db'); for (const [id, x] of d) await db.collection('trades').doc(id).set(x); }, docs);
    await pg.waitForTimeout(500);
  };
  const txt = (pg, sel) => pg.textContent(sel);

  /* ---- 1) Nombre: Centinela en el título y la cabecera, sin "Panel de Trading" en ningún texto visible ---- */
  const { pg } = await abrir();
  ok('nombre: <title> es Centinela', (await pg.title()) === 'Centinela', await pg.title());
  ok('nombre: la cabecera dice Centinela (en mayúsculas con espaciado)', await pg.evaluate(() => { const h = document.querySelector('header h1'), cs = getComputedStyle(h); return /Centinela/.test(h.textContent) && cs.textTransform === 'uppercase' && parseFloat(cs.letterSpacing) > 2; }), await txt(pg, 'header h1'));
  ok('nombre: la barra / de la marca va en el rojo de marca', await pg.evaluate(() => { const b = document.querySelector('header h1 .marca-barra'); const d = document.createElement('i'); d.style.color = getComputedStyle(document.documentElement).getPropertyValue('--accent'); document.body.appendChild(d); const exp = getComputedStyle(d).color; d.remove();
    return !!b && b.textContent === '/' && getComputedStyle(b).color === exp && b.getAttribute('aria-hidden') === 'true'; }), null);
  ok('nombre: el pie dice Centinela', /Centinela/.test(await txt(pg, 'footer')), await txt(pg, 'footer'));
  const visibles = [];
  for (const t of TABS) {
    await pg.click('#t-' + t);
    if (t === 'diario') await pg.evaluate(() => { document.getElementById('ajustes').open = true; });
    visibles.push(await pg.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('[aria-label],[title],[placeholder]')].map(e => (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('title') || '') + ' ' + (e.getAttribute('placeholder') || '')).join(' ')));
  }
  ok('nombre: ningún texto visible dice "Panel de Trading" (5 pestañas, etiquetas y ayudas)', visibles.every(v => !/panel de trading/i.test(v)), visibles.map(v => (v.match(/.{0,30}panel de trading.{0,30}/i) || [''])[0]).filter(Boolean));
  ok('nombre: el HTML ya no muestra "Panel de Trading" (solo queda como dato del respaldo JSON)', (html.match(/Panel de Trading/g) || []).length === 1 && /panel: 'Panel de Trading'/.test(html), (html.match(/.{0,40}Panel de Trading.{0,20}/g) || []));
  ok('nombre: sin emojis en el HTML', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(html.replace(/▲|▼/g, '')), null);
  await pg.click('#t-hoy');

  /* ---- 2) Tokens: valores del oscuro, pares de contraste y tipografías ---- */
  const NOMBRES = ['bg', 'surface', 'surface-2', 'line', 'line-strong', 'fg', 'muted', 'accent', 'accent-ink', 'brand-fill', 'brand-ink', 'gain', 'gain-bg', 'gain-fill', 'gain-ink', 'loss', 'loss-bg', 'loss-ink',
    'warn', 'warn-bg', 'warn-fill', 'warn-ink', 'neutral', 'neutral-bg', 'btn-bg', 'btn-ink', 'bar', 'bar-track', 'bar-warn', 'bar-loss'];
  const tokens = (p) => p.evaluate((ns) => { const cs = getComputedStyle(document.documentElement), o = {}; ns.forEach(k => o[k] = cs.getPropertyValue('--' + k).trim().toUpperCase()); return o; }, NOMBRES);
  const lum = (h) => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
  const razon = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const tono = (h) => { const [r, g, b] = [0, 2, 4].map(i => parseInt(h.replace('#', '').substr(i, 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; let t = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; t *= 60; return t < 0 ? t + 360 : t; };
  const TEXTO = [['fg', 'bg'], ['fg', 'surface'], ['fg', 'surface-2'], ['muted', 'bg'], ['muted', 'surface'], ['muted', 'surface-2'], ['accent', 'bg'], ['accent', 'surface'], ['accent', 'surface-2'],
    ['brand-ink', 'brand-fill'], ['gain-ink', 'gain-fill'], ['warn-ink', 'warn-fill'], ['btn-ink', 'btn-bg'], ['accent-ink', 'accent'], ['loss-ink', 'loss'], ['neutral', 'neutral-bg'],
    ['gain', 'surface'], ['loss', 'surface'], ['warn', 'surface'], ['gain', 'gain-bg'], ['loss', 'loss-bg'], ['warn', 'warn-bg'], ['fg', 'warn-bg'], ['muted', 'surface-2']];
  const UI = [['line-strong', 'bg'], ['line-strong', 'surface'], ['line-strong', 'surface-2'], ['bar', 'bar-track'], ['bar-warn', 'bar-track'], ['bar-loss', 'bar-track'],
    ['btn-bg', 'bg'], ['btn-bg', 'surface'], ['brand-fill', 'bg'], ['brand-fill', 'surface'], ['accent', 'surface'], ['gain', 'surface'], ['loss', 'surface']];
  const T = {};
  for (const [tema, attr] of [['claro', 'light'], ['oscuro', 'dark']]) {
    await pg.evaluate((a) => document.documentElement.setAttribute('data-theme', a), attr);
    const t = await tokens(pg); T[tema] = t;
    ok('tokens ' + tema + ': ' + NOMBRES.length + ' variables, todas hex', Object.values(t).every(v => /^#[0-9A-F]{6}$/.test(v)), t);
    const mt = TEXTO.map(([a, b]) => [a + '/' + b, +razon(t[a], t[b]).toFixed(2)]).filter(x => x[1] < 4.5);
    const mu = UI.map(([a, b]) => [a + '/' + b, +razon(t[a], t[b]).toFixed(2)]).filter(x => x[1] < 3);
    ok('tokens ' + tema + ': texto ≥ 4,5:1 en ' + TEXTO.length + ' pares (incluye rellenos de marca, menta, ámbar y botón)', !mt.length, mt);
    ok('tokens ' + tema + ': controles y barras ≥ 3:1 en ' + UI.length + ' pares', !mu.length, mu);
    const dt = Math.abs(tono(t.loss) - tono(t.accent)), dh = Math.min(dt, 360 - dt);
    // Rosa contra rojo anaranjado: se separan por tono o por luminosidad (los hex del oscuro vienen del pedido: 9° de tono, 1,5:1 de luminosidad).
    ok('tokens ' + tema + ': la pérdida se distingue del rojo de marca (≥ 10° de tono o ≥ 1,4:1 de luminosidad)', t.loss !== t.accent && (dh >= 10 || razon(t.loss, t.accent) >= 1.4), [t.loss, t.accent, Math.round(dh), +razon(t.loss, t.accent).toFixed(2)]);
  }
  const SPEC = { bg: '#0C0A0A', surface: '#171212', line: '#2E2424', fg: '#F3EEEE', muted: '#A89C9C', accent: '#FF5A4E', 'brand-fill': '#D7261B', gain: '#8FE3B0', loss: '#FF9AA2', 'warn-fill': '#FFB020', bar: '#F3EEEE', 'bar-track': '#2E2424' };
  ok('tokens oscuro: usan los hex del pedido', Object.keys(SPEC).every(k => T.oscuro[k] === SPEC[k]), Object.keys(SPEC).filter(k => T.oscuro[k] !== SPEC[k]).map(k => k + ' ' + T.oscuro[k]));
  ok('tokens claro: rojo de marca #C0261B y fondo claro cálido', T.claro['brand-fill'] === '#C0261B' && lum(T.claro.bg) > 0.8 && parseInt(T.claro.bg.substr(1, 2), 16) > parseInt(T.claro.bg.substr(5, 2), 16), [T.claro['brand-fill'], T.claro.bg]);
  await pg.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await pg.emulateMedia({ colorScheme: 'dark' });
  ok('tokens: Automático con sistema oscuro = oscuro (todas las variables nuevas)', JSON.stringify(await tokens(pg)) === JSON.stringify(T.oscuro), null);
  await pg.emulateMedia({ colorScheme: 'light' });
  const fuentes = await pg.evaluate(() => { const cs = getComputedStyle(document.documentElement), f = (s) => getComputedStyle(document.querySelector(s)).fontFamily;
    return { body: getComputedStyle(document.body).fontFamily, data: cs.getPropertyValue('--f-data'), h1: f('header h1'), prose: f('#resumenTxt'), cifra: f('#meters .m-top b'), sem: f('#tb-sem .sem-top b') }; });
  ok('tipografía: Chakra Petch para títulos y texto', /^"?Chakra Petch/.test(fuentes.body) && /^"?Chakra Petch/.test(fuentes.h1), fuentes);
  ok('tipografía: JetBrains Mono para las cifras', /JetBrains Mono/.test(fuentes.data) && /^"?JetBrains Mono/.test(fuentes.cifra) && /^"?JetBrains Mono/.test(fuentes.sem), fuentes);
  ok('tipografía: Atkinson Hyperlegible solo en párrafos largos (Resumen y Revisión)', /^"?Atkinson Hyperlegible/.test(fuentes.prose) && (html.match(/var\(--f-prose\)/g) || []).length === 1, fuentes.prose);
  ok('tipografía: se cargan por un solo <link> de Google Fonts con los pesos pedidos', /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Chakra\+Petch:wght@500;600;700&family=JetBrains\+Mono:wght@400;600;700&family=Atkinson\+Hyperlegible:wght@400;700&display=swap">/.test(html) && (html.match(/<link rel="stylesheet"/g) || []).length === 1 && !/<script[^>]+src=/.test(html), null);

  /* ---- 3) segmentosVentana: función pura ---- */
  const seg = await pg.evaluate(() => {
    const P = window.PanelTrading, out = [];
    const eq = (name, got, exp) => out.push({ name, got, pass: JSON.stringify(got) === JSON.stringify(exp) });
    const NY = (y, m, d, h, mi, off) => Date.UTC(y, m - 1, d, h + off, mi);
    let b = P.segmentosVentana(NY(2026, 10, 14, 11, 5, 4));
    eq('barra: día normal, cuatro tramos de VENTANAS en orden', b.segmentos.map(s => [s.desde, s.hasta, s.nivel]), P.VENTANAS.map(v => [v.desde, v.hasta, v.nivel]));
    eq('barra: posiciones en % (9:30–16:00)', b.segmentos.map(s => [s.izq, s.ancho]), [[0, 7.69], [7.69, 23.08], [30.77, 53.85], [84.62, 15.38]]);
    eq('barra: los tramos cubren el 100%', Math.round(b.segmentos.reduce((a, s) => a + s.ancho, 0)), 100);
    eq('barra: cada tramo lleva el motivo de VENTANAS', b.segmentos.map(s => s.motivo), P.VENTANAS.map(v => v.motivo));
    eq('barra: marca de la hora actual (11:05 → 24,36%)', b.ahora, { pct: 24.36, ny: '11:05', bo: '11:05' });
    eq('barra: marcas de hora en cada borde y el cierre', b.marcas.map(m => [m.pct, m.ny]), [[0, '09:30'], [7.69, '10:00'], [30.77, '11:30'], [84.62, '15:00'], [100, '16:00']]);
    eq('barra: día normal no está cerrado', [b.cerrado, b.fuera, b.motivo], [false, null, '']);
    b = P.segmentosVentana(NY(2026, 10, 14, 9, 30, 4)); eq('barra: marca en la apertura → 0%', b.ahora.pct, 0);
    b = P.segmentosVentana(NY(2026, 10, 14, 16, 0, 4)); eq('barra: marca en el cierre → 100%', b.ahora.pct, 100);
    b = P.segmentosVentana(NY(2026, 10, 14, 8, 0, 4)); eq('barra: antes de abrir no hay marca', [b.ahora, b.fuera, b.segmentos.length], [null, 'antes', 4]);
    b = P.segmentosVentana(NY(2026, 10, 14, 17, 30, 4)); eq('barra: después del cierre no hay marca', [b.ahora, b.fuera], [null, 'despues']);
    // Feriado: Acción de Gracias, 26-nov-2026
    b = P.segmentosVentana(NY(2026, 11, 26, 11, 0, 5));
    eq('barra: feriado → un solo tramo MALA, cerrado y sin marca', [b.cerrado, b.segmentos.map(s => [s.nivel, s.izq, s.ancho]), b.ahora, /Mercado cerrado/.test(b.motivo)], [true, [['mala', 0, 100]], null, true]);
    // Fin de semana
    b = P.segmentosVentana(NY(2026, 10, 17, 11, 0, 4));
    eq('barra: sábado → un solo tramo MALA y cerrado', [b.cerrado, b.segmentos.length, b.segmentos[0].nivel, b.ahora], [true, 1, 'mala', null]);
    eq('barra: domingo también', P.segmentosVentana(NY(2026, 10, 18, 10, 0, 4)).cerrado, true);
    // Cierre temprano: 27-nov-2026, 13:00 NY (EST: Bolivia va una hora adelante)
    b = P.segmentosVentana(NY(2026, 11, 27, 12, 0, 5));
    eq('barra: cierre temprano corta la tabla a las 13:00 y el resto es MALA', b.segmentos.map(s => [s.desde, s.hasta, s.nivel]), [['09:30', '10:00', 'regular'], ['10:00', '11:30', 'buena'], ['11:30', '13:00', 'regular'], ['13:00', '16:00', 'mala']]);
    eq('barra: cierre temprano, el último tramo dice por qué', [/Cierre temprano/.test(b.segmentos[3].motivo), /Cierre temprano/.test(b.motivo), b.segmentos[3].izq], [true, true, 53.85]);
    eq('barra: en invierno las horas de Bolivia van una hora adelante', [b.segmentos[0].bo, b.marcas[b.marcas.length - 1].bo, b.ahora.bo], ['10:30', '17:00', '13:00']);
    eq('barra: cierre temprano a las 14:00 la marca cae en el tramo MALA', P.segmentosVentana(NY(2026, 11, 27, 14, 0, 5)).ahora.pct, 69.23);
    eq('barra: coincide con ventanaSesion en cada franja', P.VENTANAS.every(v => { const [h, m] = v.desde.split(':').map(Number), ts = NY(2026, 10, 14, h, m + 1, 4), bb = P.segmentosVentana(ts); return bb.segmentos.find(s => bb.ahora.pct >= s.izq && bb.ahora.pct < s.izq + s.ancho).nivel === P.ventanaSesion(ts).nivel; }), true);
    return out;
  });
  seg.forEach(x => ok(x.name, x.pass, x.got));
  // En pantalla
  const barra = await pg.evaluate(() => ({ segs: [...document.querySelectorAll('#vt-dia .vt-seg')].map(s => s.getAttribute('data-nivel')), ahora: (document.querySelector('#vt-dia .vt-ahora') || {}).style, aria: document.querySelector('#vt-dia .vt-barra').getAttribute('aria-label') }));
  ok('barra en pantalla: cuatro tramos con su nivel y la marca de ahora', JSON.stringify(barra.segs) === '["regular","buena","regular","buena"]' && barra.ahora && barra.ahora.left === '24.36%' && /ahora 11:05 NY/.test(barra.aria), barra);
  ok('barra en pantalla: los tramos usan los rellenos del sistema', await pg.evaluate(() => { const cs = getComputedStyle(document.documentElement), c = (n) => getComputedStyle(document.querySelector('#vt-dia .vt-seg[data-nivel="' + n + '"]')).backgroundColor; const hex = (v) => { const d = document.createElement('i'); d.style.color = v; document.body.appendChild(d); const r = getComputedStyle(d).color; d.remove(); return r; }; return c('buena') === hex(cs.getPropertyValue('--gain-fill')) && c('regular') === hex(cs.getPropertyValue('--warn-fill')); }), null);
  // Arreglo 1: sin guion suelto
  ok('ventana: etiqueta VENTANA ACTUAL, píldora con icono y palabra, motivo aparte', await pg.evaluate(() => { const h = document.getElementById('vt-head'), p = h.querySelector('.vt-nivel'); return /^VENTANA ACTUAL/.test(h.querySelector('.vt-lbl').textContent) && !!p.querySelector('svg') && p.textContent === 'BUENA' && h.querySelector('.vt-motivo').textContent === 'Mayor liquidez de la sesión'; }), null);
  ok('ventana: en pantalla no queda ninguna raya (solo la oyen los lectores de pantalla)', await pg.evaluate(() => { const w = document.createTreeWalker(document.getElementById('vt-head'), NodeFilter.SHOW_TEXT); let n, malos = []; while ((n = w.nextNode())) if (/[—–-]/.test(n.textContent) && !n.parentElement.closest('.sr')) malos.push(n.textContent); return !malos.length && [...document.querySelectorAll('#vt-head .sr')].every(s => s.getBoundingClientRect().width <= 1); }), null);

  /* ---- 4) Semáforo en sus tres estados, siempre con icono y palabra ---- */
  const semaforo = async (p) => p.evaluate(() => { const v = document.getElementById('verdict'), e = document.getElementById('v-estado'), cs = getComputedStyle(e), r = getComputedStyle(document.documentElement);
    const hex = (x) => { const d = document.createElement('i'); d.style.color = x; document.body.appendChild(d); const o = getComputedStyle(d).color; d.remove(); return o; };
    return { luz: v.getAttribute('data-luz'), palabra: e.textContent.trim(), svg: !!e.querySelector('svg path,svg circle'), mayus: cs.textTransform, fondo: cs.backgroundColor, tinta: cs.color, alto: e.getBoundingClientRect().height,
      fills: { verde: hex(r.getPropertyValue('--gain-fill')), ambar: hex(r.getPropertyValue('--warn-fill')), rojo: hex(r.getPropertyValue('--brand-fill')) }, inks: { verde: hex(r.getPropertyValue('--gain-ink')), ambar: hex(r.getPropertyValue('--warn-ink')), rojo: hex(r.getPropertyValue('--brand-ink')) } }; });
  const comprobarSemaforo = (s, luz, palabra) => s.luz === luz && s.palabra === palabra && s.svg && s.mayus === 'uppercase' && s.fondo === s.fills[luz] && s.tinta === s.inks[luz] && s.alto >= 60;
  for (const tema of ['oscuro', 'claro']) {
    const r = await abrir({ pre: 'semáforo ' + tema + ' ' });
    await r.pg.click('label[for="tema-' + tema + '"]');
    let s = await semaforo(r.pg);
    ok('semáforo ' + tema + ': verde = bloque menta, texto oscuro, icono y "Podés operar"', comprobarSemaforo(s, 'verde', 'Podés operar') && s.tinta !== 'rgb(255, 255, 255)', s);
    await sembrar(r.pg, datosSemana());
    await r.pg.waitForFunction(() => document.getElementById('verdict').getAttribute('data-luz') === 'ambar');
    s = await semaforo(r.pg);
    ok('semáforo ' + tema + ': ámbar = bloque ámbar, texto oscuro, icono y "Con cuidado"', comprobarSemaforo(s, 'ambar', 'Con cuidado'), s);
    const perdida = (id, h) => [id, { activo: 'X' + id, dir: 'compra', entrada: 50, entradaPlan: 50, sl1: 49, sl2: 50, tp1: 52, tp2: 54, nivel: 27, nivelEf: 27, d: 1, unidades: 27, unidadesAbiertas: 0, riesgoInicial: 27, stopActual: 49,
      estado: 'cerrada', ts: NY(10, 14, h, 0), parciales: [], movimientos: [], reglasRotas: [], cierre: { ts: NY(10, 14, h, 30), precio: 49, unidades: 27, pnl: -27, motivo: 'SL1' }, pnl: -27, r: -1, plan: 'si', origen: 'Radar', tipo: 'limite' }];
    await r.pg.evaluate(async () => { const db = await window.claude.use('db'); for (const id of ['t-avgo', 't-smci', 't-nvda', 't-amd', 't-tsla', 't-mu']) await db.collection('trades').doc(id).delete(); });
    await sembrar(r.pg, [perdida('a', 9), perdida('b', 10)]);
    await r.pg.waitForFunction(() => document.getElementById('verdict').getAttribute('data-luz') === 'rojo');
    s = await semaforo(r.pg);
    ok('semáforo ' + tema + ': rojo = relleno de marca, texto blanco, icono de alto y "NO OPERES"', comprobarSemaforo(s, 'rojo', 'No operes') && s.tinta === 'rgb(255, 255, 255)' && await r.pg.evaluate(() => /M8\.2 3h7\.6L21 8\.2/.test(document.querySelector('#v-estado svg').innerHTML)), s);
    ok('semáforo ' + tema + ': presupuesto agotado → barra en rojo de marca', await r.pg.evaluate(() => { const i = document.querySelector('#meters .meter[data-luz="rojo"] .bar i'), d = document.createElement('i'); d.style.color = getComputedStyle(document.documentElement).getPropertyValue('--bar-loss'); document.body.appendChild(d); const exp = getComputedStyle(d).color; d.remove(); return !!i && getComputedStyle(i).backgroundColor === exp; }), null);
    await r.ctx.close();
  }
  const rs = await abrir({ hora: NY(10, 17, 12, 0), pre: 'sábado ' });
  const sab = await semaforo(rs.pg);
  ok('semáforo: mercado cerrado también lleva icono y palabra', sab.luz === '' && sab.palabra === 'Esperá la apertura' && sab.svg, sab);
  ok('barra: el sábado se ve un solo tramo MALA y dice que hoy no abre', await rs.pg.evaluate(() => document.querySelectorAll('#vt-dia .vt-seg[data-nivel="mala"]').length === 1 && !document.querySelector('#vt-dia .vt-ahora') && /Hoy no abre/.test(document.querySelector('#vt-dia .vt-barra').getAttribute('aria-label'))), null);
  await rs.ctx.close();

  /* ---- 5) Signo y flecha en importes y R (Hoy, Abiertas, Diario) ---- */
  await sembrar(pg, datosSemana());
  await pg.waitForFunction(() => document.querySelectorAll('#tb-ab-lista .ab-fila').length === 2);
  await pg.click('#t-abiertas');
  await pg.fill('.pos[data-id="t-avgo"] [data-now]', '334,10');
  const flechas = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ t: e.textContent.trim(), c: e.className, f: getComputedStyle(e, '::before').content })), sel);
  const bien = (l) => l.length > 0 && l.every(x => /\bup\b/.test(x.c) ? /^\+/.test(x.t) && x.f.includes('▲') : /\bdown\b/.test(x.c) ? /^−/.test(x.t) && x.f.includes('▼') : !/^[+−]/.test(x.t) && (x.f === 'none' || x.f === 'normal'));
  let l = await flechas(pg, '#p-abiertas .res');
  ok('Abiertas: el flotante lleva signo y ▲', bien(l) && l.some(x => x.t === '+$34,08 · +1,26 R' && x.f.includes('▲')) && l.some(x => x.t === '+$20,22'), l);
  await pg.click('#t-hoy');
  l = await flechas(pg, '#p-hoy .res');
  ok('Hoy: todo resultado con signo y flecha coherentes', bien(l), l);
  ok('Hoy: abiertas, semana y realizado con ▲ / ▼', ['+$34,08 · +1,26 R', '+0,5 R', '+$39,50', '+$59,72', '+$10,22', '−0,25 R'].every(t => l.some(x => x.t === t)), l.map(x => x.t + ' ' + x.f));
  ok('Hoy: realizado de hoy en $ y en R con flecha propia (pueden tener signo distinto)', await pg.evaluate(() => [...document.querySelectorAll('#v-res .res')].map(e => e.className).join('|')) === 'res up|res down|res up|res up', null);
  await pg.click('#t-diario');
  l = await flechas(pg, '#p-diario .res');
  ok('Diario: resultados, R, mejor y peor, tabla y operaciones con signo y flecha', bien(l) && l.some(x => x.t === '+$39,50') && l.some(x => x.t === '−1,0 R' && x.f.includes('▼')) && l.some(x => /^−\$18,00 · −1,0 R$/.test(x.t) && x.f.includes('▼')) && l.some(x => /^\+\$40,50/.test(x.t)), l.map(x => x.t + ' ' + x.f));
  await pg.click('#t-operar'); await pg.click('#btnEjemplo');
  l = await flechas(pg, '#p-operar .res');
  ok('Operar: ganancias posibles con signo y ▲', bien(l), l);
  ok('flechas: el lector de pantalla no lee los triángulos', /\.res\.up::before\{content:"▲" \/ ""/.test(html) && /\.res\.down::before\{content:"▼" \/ ""/.test(html), null);

  /* ---- 6) Arreglos de la revisión de v3.3 ---- */
  await pg.click('#t-hoy');
  ok('arreglo 3: el realizado del semáforo dice "con parciales" y la curva "solo operaciones cerradas"', /Realizado en la semana, con parciales \+\$59,72/.test(await txt(pg, '#v-res')) && /solo operaciones cerradas/.test(await txt(pg, '#tb-semana')) && /4 cerradas · \+\$39,50/.test(await txt(pg, '#tb-sem')), [await txt(pg, '#v-res'), await txt(pg, '#tb-semana')]);
  await pg.click('#t-analizar');
  const dirSel = await pg.evaluate(() => { const s = document.getElementById('cap-dir'), cs = getComputedStyle(s), c = document.createElement('canvas').getContext('2d'); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    return { texto: c.measureText('Que decida Claude').width, lugar: s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 20 }; });
  ok('arreglo 2: "Que decida Claude" entra completo a 390 px', dirSel.texto <= dirSel.lugar, dirSel);

  /* ---- 7) Pestañas, botones y piel en todas las pestañas ---- */
  const piel = await pg.evaluate(() => { const r = getComputedStyle(document.documentElement), hex = (x) => { const d = document.createElement('i'); d.style.color = x; document.body.appendChild(d); const o = getComputedStyle(d).color; d.remove(); return o; };
    const on = document.querySelector('.tabs button.on'), cs = getComputedStyle(on), pri = getComputedStyle(document.getElementById('btnAnalizar'));
    return { onBg: cs.backgroundColor === hex(r.getPropertyValue('--brand-fill')), onInk: cs.color === hex(r.getPropertyValue('--brand-ink')), etiquetas: [...document.querySelectorAll('.tabs button')].every(b => { const s = b.querySelector('span'); return s && s.textContent.trim() && s.getBoundingClientRect().width > 0; }),
      fondo: getComputedStyle(document.body).backgroundColor === hex(r.getPropertyValue('--bg')) }; });
  ok('pestañas: la activa con relleno de marca y texto blanco; todas con etiqueta visible', piel.onBg && piel.onInk && piel.etiquetas && piel.fondo, piel);
  await pg.click('#t-abiertas'); await pg.click('.pos[data-id="t-smci"] [data-act="borrar"]');
  ok('botones: el destructivo va en rojo de marca y el principal claro con texto oscuro (en oscuro)', await (async () => { await pg.click('label[for="tema-oscuro"]'); return pg.evaluate(() => { const d = getComputedStyle(document.querySelector('[data-act="ok-borrar"]')), r = getComputedStyle(document.documentElement), hex = (x) => { const e = document.createElement('i'); e.style.color = x; document.body.appendChild(e); const o = getComputedStyle(e).color; e.remove(); return o; };
    const b = document.createElement('button'); b.className = 'primary'; document.body.appendChild(b); const pb = getComputedStyle(b); const okP = pb.backgroundColor === hex(r.getPropertyValue('--btn-bg')) && pb.color === hex(r.getPropertyValue('--btn-ink')) && hex(r.getPropertyValue('--btn-bg')) === 'rgb(243, 238, 238)'; b.remove();
    return d.backgroundColor === hex(r.getPropertyValue('--brand-fill')) && d.color === 'rgb(255, 255, 255)' && okP; }); })(), null);
  // Ningún componente con el aspecto anterior: ni las fuentes ni los colores de v3.3
  ok('piel: no quedan las fuentes ni los colores de v3.3', !/"Archivo"|family=Archivo|IBM Plex|#2B50C0|#8EA7FF|#0B1017|#EEF1F5/i.test(html), (html.match(/"Archivo"|family=Archivo|IBM Plex|#2B50C0|#8EA7FF|#0B1017|#EEF1F5/gi) || []));

  /* ---- 8) Sin scroll horizontal: 5 pestañas (más "Ya estoy dentro") × 2 temas × 4 anchos ---- */
  const desbordes = [];
  for (const ancho of [360, 390, 768, 1280]) {
    const r = await abrir({ ancho, pre: ancho + ' ' });
    await sembrar(r.pg, datosSemana().map(([id, d]) => [id, Object.assign({}, d, id === 't-smci' ? { activo: 'BRK.B' } : {})]));
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
    // Capturas en "Ya estoy dentro" con la propuesta de la IA
    await r.pg.click('#t-analizar'); await r.pg.click('label[for="cap-modo-d"]'); await r.pg.selectOption('#ge-pos', 't-avgo');
    await r.pg.setInputFiles('#cap-files', [{ name: '4h.png', mimeType: 'image/png', buffer: png }]);
    await r.pg.fill('#ge-ahora', '334,10'); await r.pg.click('#btnAnalizar');
    await r.pg.waitForFunction(() => document.querySelector('#ge-resultado .accion'), null, { timeout: 10000 });
    for (const tema of ['claro', 'oscuro']) {
      await r.pg.click('label[for="tema-' + tema + '"]');
      const sw = await r.pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (sw > 1) desbordes.push(ancho + ' ' + tema + ' capturas-dentro +' + sw + 'px');
    }
    await r.ctx.close();
  }
  ok('sin scroll horizontal: 6 vistas × 2 temas × 360/390/768/1280 px (48 combinaciones)', !desbordes.length, desbordes);

  /* ---- 9) Modo local sigue funcionando con la piel nueva ---- */
  const loc = await abrir({ mock: false, pre: 'local ' });
  await loc.pg.waitForFunction(() => /fuera de Claude/.test(document.getElementById('aviso').textContent));
  ok('local: tablero, barra del día y nombre', /Podés operar/.test(await txt(loc.pg, '#v-estado')) && (await loc.pg.$$('#vt-dia .vt-seg')).length === 4 && (await loc.pg.title()) === 'Centinela', null);
  await loc.ctx.close();

  const fails = results.filter(x => !x.pass);
  console.log('Pruebas de Centinela: ' + results.length + ' · fallas: ' + fails.length);
  fails.forEach(f => console.log('FALLA ' + f.name + ' → ' + JSON.stringify(f.got)));
  console.log('Errores de página: ' + (errors.length ? errors.join(' | ') : 'ninguno'));
  fs.writeFileSync(path.join(dir, 'resultado-centinela.json'), JSON.stringify({ fecha: new Date().toISOString(), total: results.length, fallas: fails.length, errores: errors, casos: results }, null, 2));
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => {
  console.error('ERROR TEST', e);
  results.filter(x => !x.pass).forEach(f => console.log('FALLA ' + f.name + ' → ' + JSON.stringify(f.got)));
  if (errors.length) console.log('Errores de página: ' + errors.join(' | '));
  process.exit(1);
});
