const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const archivo = process.argv[3] || 'panel-trading.html';
const html = fs.readFileSync(path.join(dir, archivo), 'utf8');
const skeleton = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>';
fs.writeFileSync(path.join(dir, 'test-page.html'), skeleton);

const MOCK = `(() => {
  const store = new Map(); const listeners = new Set(); let idc = 0;
  const snapDoc = (p) => { const data = store.get(p); return { id: p.split('/').pop(), exists: data !== undefined, data: () => data && JSON.parse(JSON.stringify(data)), metadata: { fromCache: false, hasPendingWrites: false } }; };
  const notify = () => { for (const l of listeners) setTimeout(() => l.fire(), 0); };
  const docRef = (p) => ({ id: p.split('/').pop(), path: p,
    get: async () => snapDoc(p),
    set: async (d) => { store.set(p, JSON.parse(JSON.stringify(d))); notify(); },
    update: async (d) => { if (!store.has(p)) throw { code: 'invalid_argument', message: 'no doc' }; store.set(p, Object.assign({}, store.get(p), JSON.parse(JSON.stringify(d)))); notify(); },
    delete: async () => { store.delete(p); notify(); },
    onSnapshot: (next) => { const l = { fire: () => next(snapDoc(p)) }; listeners.add(l); setTimeout(l.fire, 0); return () => listeners.delete(l); } });
  const qs = (p, ord, lim) => { let docs = [...store.keys()].filter(k => k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 1).map(snapDoc);
    if (ord) docs.sort((a, b) => { const x = a.data()[ord.f], y = b.data()[ord.f]; return (x < y ? -1 : x > y ? 1 : 0) * (ord.dir === 'desc' ? -1 : 1); });
    if (lim) docs = docs.slice(0, lim); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }; };
  const query = (p, ord, lim) => ({ where() { return this; }, orderBy: (f, d = 'asc') => query(p, { f, dir: d }, lim), limit: (n) => query(p, ord, n), get: async () => qs(p, ord, lim),
    onSnapshot: (next) => { const l = { fire: () => next(qs(p, ord, lim)) }; listeners.add(l); setTimeout(l.fire, 0); return () => listeners.delete(l); } });
  const coll = (p) => Object.assign(query(p), { path: p, doc: (id) => docRef(p + '/' + (id || ('m' + (++idc)))), add: async (d) => { const r = docRef(p + '/m' + (++idc)); await r.set(d); return r; } });
  const db = { doc: docRef, collection: coll };
  window.__mockStore = store;
  window.__sampleCalls = [];
  const ANALISIS = { activo: 'NVDA', legible: true, problemas: [], capturas: [{ n: 1, temporalidad: 'diario', tendencia: 'alcista', lectura: 'Máximos crecientes' }, { n: 2, temporalidad: '4H', tendencia: 'alcista', lectura: 'Retroceso a soporte' }, { n: 3, temporalidad: '15 min', tendencia: 'lateral', lectura: 'Rango' }],
    precio_actual: 180.6, soportes: [179, 176.5], resistencias: [183.2, 186], direccion: 'compra', tipo_entrada: 'limite', entrada: 180.5, sl1: 179, sl2: 180.5, tp1: 183, tp2: 185.5,
    motivos: { entrada: 'Retesteo del soporte', sl1: 'Debajo del mínimo del rango', tp1: 'Resistencia previa', tp2: 'Máximo del mes' }, invalidacion: 'Cierre de 15 min debajo de 179',
    criterios: [{ id: 'tendencia', puntos: 22, motivo: 'Diario y 4H alcistas' }, { id: 'stop', puntos: 16, motivo: 'Mínimo claro' }, { id: 'espacio', puntos: 15, motivo: 'Hay recorrido' }, { id: 'entrada', puntos: 11, motivo: 'Cerca del soporte' }, { id: 'confirmacion', puntos: 6, motivo: 'Volumen normal' }, { id: 'lectura', puntos: 8, motivo: 'Se leen bien' }],
    resumen: 'Compra en retroceso a soporte con tendencia a favor.', advertencias: ['Resultados en 10 días'] };
  const sample = async (input, opts) => { window.__sampleCalls.push({ tipo: 'texto', input: String(input), opts }); const text = ['## Qué funciona', '- Respetaste los stops', '## Qué no funciona', '- Pocas operaciones', '## Reglas rotas', '- Ninguna', '## Un cambio para la próxima semana', '- Registrar todas las señales'].join(String.fromCharCode(10)); if (opts && opts.onText) opts.onText({ text, delta: text }); return { text, truncated: false, modelTierApplied: 'default' }; };
  sample.json = async (input, opts) => { const n = opts && opts.images ? (opts.images.length || 1) : 0; window.__sampleCalls.push({ tipo: 'json', input: String(input), imagenes: n, tier: opts && opts.modelTier }); await new Promise(r => setTimeout(r, 50));
    if (/Comprobá con la captura/.test(input)) return { activada: true, resultado: 'tp1', detalle: 'Tocó TP1 a las 10:40 sin tocar el stop.', confianza_lectura: 'media' };
    return JSON.parse(JSON.stringify(ANALISIS)); };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 20971520, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] } });
  window.claude = { use: async (n) => n === 'db' ? db : n === 'user' ? { isOwner: async () => true, canEdit: async () => true, can: async () => true, id: async () => 'u_test' } : n === 'sample' ? sample : null };
})();`;

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const errors = [];
  const ok = (name, pass, got) => results.push({ name, pass: !!pass, got });

  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(MOCK);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errors.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  await pg.goto('file://' + path.join(dir, 'test-page.html'));
  await pg.waitForFunction(() => document.getElementById('v-title').textContent !== 'Cargando tus operaciones…', null, { timeout: 15000 });

  /* ---- Funciones puras ---- */
  const pure = await pg.evaluate(() => {
    const P = window.PanelTrading, out = [];
    const eq = (name, got, exp, tol = 1e-6) => { const pass = (typeof exp === 'number') ? Math.abs(got - exp) <= tol : JSON.stringify(got) === JSON.stringify(exp); out.push({ name, got, exp, pass }); };
    [['5,123', 5.123], ['180,50', 180.5], ['1.234,56', 1234.56], ['1,234.56', 1234.56], ['1 234,56', 1234.56], ['1.234.567', 1234567], ['USD 27', 27], ['$180.50', 180.5], ['0,345', 0.345], ['0.345', 0.345], ['27', 27], ['-5,2', -5.2], ['183,00', 183], ['12.5', 12.5], ['1,5', 1.5], ['180,50 USD', 180.5], ['−3,5', -3.5]].forEach(([s, e]) => eq('num ' + s, P.parseNum(s), e));
    eq('num 5.123 ambiguo', P.analizarNum('5.123').amb, true); eq('num 1.234 ambiguo', P.analizarNum('1.234').amb, true); eq('num 0.345 no ambiguo', P.analizarNum('0.345').amb, false); eq('num 5,123 no ambiguo', P.analizarNum('5,123').amb, false);
    eq('num vacío', isNaN(P.parseNum('')), true);
    eq('campo 5.123', P.campoPrecio(5.123), '5,1230'); eq('campo 1200', P.campoPrecio(1200), '1200,00'); eq('campo 180.5', P.campoPrecio(180.5), '180,50'); eq('campo ida y vuelta', P.parseNum(P.campoPrecio(5.123)), 5.123);
    const reg1 = P.parseRegistro('blah\nREGISTRO: 13/10/2026 | NVDA | compra | 180,50 | 178,90 | 180,50 | 183,00 | 185,50 | 27 | 145,00 | estándar (USD 27)\nAL ENTRAR...', P.DEF.niveles);
    eq('reg1 activo', reg1.activo, 'NVDA'); eq('reg1 dir', reg1.dir, 'compra'); eq('reg1 entrada', reg1.entrada, 180.5); eq('reg1 sl1', reg1.sl1, 178.9); eq('reg1 sl2', reg1.sl2, 180.5); eq('reg1 tp1', reg1.tp1, 183); eq('reg1 tp2', reg1.tp2, 185.5); eq('reg1 nivel', reg1.nivelIdx, 2);
    const reg2 = P.parseRegistro('«REGISTRO: 2026-10-13 | Moderna (MRNA) | venta corta | 30,10 | 30,60 | entrada tras TP1 | 29,30 | 28,80 | 10 | 22 | USD 10 (evento)»\nAPUESTA DE EVENTO', P.DEF.niveles);
    eq('reg2 activo', reg2.activo, 'MRNA'); eq('reg2 dir', reg2.dir, 'venta'); eq('reg2 entrada', reg2.entrada, 30.1); eq('reg2 sl2 vacío', isNaN(reg2.sl2), true); eq('reg2 tp1', reg2.tp1, 29.3); eq('reg2 nivel', reg2.nivelIdx, 0); eq('reg2 evento', reg2.evento, true); eq('reg2 origen', reg2.origen, 'Overnight');
    const reg3 = P.parseRegistro('REGISTRO: 12/10 | AMD | compra | 160,00 | 158,00 | TP1 163,00 / TP2 166,00 | 27 | 120', P.DEF.niveles);
    eq('reg3 viejo tp1', reg3.tp1, 163); eq('reg3 viejo tp2', reg3.tp2, 166); eq('reg3 nivel', reg3.nivelIdx, 2);
    const dos = 'RADAR INTRADÍA\nIdea 1: AAA\nTipo de entrada: límite en 10,00\nREGISTRO: a | AAA | compra | 10,00 | 9,00 | 10,00 | 11,50 | 12,00 | 18 | 5 | 18\nAL ENTRAR: pon el stop\nIdea 2: BBB\nTipo de entrada: market-urgente, mínimo aceptable 19,90\nSeñal NO VIGENTE\nREGISTRO: b | BBB | venta | 20,00 | 20,50 | 20,00 | 19,00 | 18,00 | 27 | 5 | 27\nAL ENTRAR: pon el stop';
    const ls = P.parseSenales(dos, P.DEF.niveles);
    eq('multi cuántas', ls.length, 2); eq('multi A activo', ls[0].activo, 'AAA'); eq('multi A límite', ls[0].market, false); eq('multi A vigente', ls[0].noVigente, false); eq('multi B market', ls[1].market, true); eq('multi B no vigente', ls[1].noVigente, true); eq('multi origen', ls[0].origen, 'Radar'); eq('multi A nivel 18', ls[0].nivelIdx, 1);
    const amb = P.parseRegistro('REGISTRO: x | XYZ | compra | 5.123 | 5,05 | 5,123 | 5,30 | 5,50 | 10 | 3 | 10', P.DEF.niveles);
    eq('registro ambiguo marcado', amb.amb, ['entrada']); eq('registro coma no ambigua', amb.sl2, 5.123);
    eq('reg nada', P.parseRegistro('hola', P.DEF.niveles), null);

    const cfg = P.DEF;
    const est0 = P.estadoDe([], cfg, Date.UTC(2026, 9, 13, 19, 0));
    eq('est0 luz', est0.luz, 'verde'); eq('est0 proximo', est0.proximo, 36); eq('est0 título', est0.titulo, 'Hay presupuesto');
    const base = { dir: 'compra', entrada: 50, sl1: 49.2, tp1: 51.3, tp2: 52.4, nivel: 27, evento: false, precioAhora: 50.05, sl2In: NaN, unidadesReales: NaN, tipo: 'limite', amb: [] };
    let r = P.calcular(base, est0, cfg);
    eq('c1 d', r.d, 0.8); eq('c1 unidades', r.unidades, 33.75); eq('c1 riesgo', r.riesgo, 27); eq('c1 margen', r.margen, 84.375); eq('c1 nocional', r.nocional, 1687.5); eq('c1 rr1', r.rr1, 1.625); eq('c1 rr2', r.rr2, 3); eq('c1 noEntres', r.noEntres, 50.24); eq('c1 sin bloqueos', r.bloqueos.length, 0); eq('c1 limitante', r.limitante.k, 'nivel');
    eq('c1 u1', r.u1, 16.87); eq('c1 u2', r.u2, 16.88); eq('c1 gan1', r.gan1, 16.87 * 1.3); eq('c1 gan2', r.gan2, 16.88 * 2.4);
    r = P.calcular({ ...base, precioAhora: NaN }, est0, cfg);
    eq('c1b sin precio: regla', r.bloqueos.some(b => b.regla === 'Precio de Quantfury no verificado'), true); eq('c1b no fatal', r.fatal, false);
    r = P.calcular({ ...base, entrada: 200, sl1: 199, tp1: 201.5, tp2: 203, nivel: 36, precioAhora: 200 }, est0, cfg);
    eq('c2 margen limita', r.unidades, 22.5); eq('c2 riesgo', r.riesgo, 22.5); eq('c2 limitante', r.limitante.k, 'margenOp'); eq('c2 margen', r.margen, 225);
    r = P.calcular({ ...base, entrada: 30, sl1: 27, tp1: 34.5, tp2: 36, nivel: 27, evento: true, precioAhora: 30 }, est0, cfg);
    eq('c3 evento nivelEf', r.nivelEf, 10); eq('c3 unidades', r.unidades, 3.33); eq('c3 riesgo', r.riesgo, 9.99);
    r = P.calcular({ ...base, entrada: 100, sl1: 99.5, tp1: 101, tp2: 102, nivel: 10, evento: true, precioAhora: 100 }, est0, cfg);
    eq('c4 evento nocional', r.unidades, 2.7); eq('c4 limitante', r.limitante.k, 'evento'); eq('c4 nocional', r.nocional, 270);
    r = P.calcular({ ...base, dir: 'venta', entrada: 100, sl1: 101, tp1: 98.5, tp2: 97, precioAhora: 99.6 }, est0, cfg);
    eq('c5 venta rr1 borde', r.rr1, 1.5); eq('c5 noEntres', r.noEntres, 99.7); eq('c5 bloquea NO ENTRES', r.bloqueos.some(b => /NO ENTRES/.test(b.t)), true); eq('c5 no fatal', r.fatal, false); eq('c5 sin bloqueo rr', r.bloqueos.some(b => /TP1 da/.test(b.t)), false);
    r = P.calcular({ ...base, dir: 'venta', entrada: 100, sl1: 101, tp1: 98.5, tp2: 97, precioAhora: 99.8 }, est0, cfg);
    eq('c6 venta ok', r.bloqueos.length, 0);
    r = P.calcular({ ...base, tp1: 51.1 }, est0, cfg); eq('c7 rr1 bajo', r.bloqueos.some(b => b.regla && /TP1/.test(b.regla)), true); eq('c7 no fatal', r.fatal, false);
    r = P.calcular({ ...base, sl1: 50.5 }, est0, cfg); eq('c8 SL lado malo', r.fatal, true);
    r = P.calcular({ ...base, tp2: 51.0 }, est0, cfg); eq('c9 TP2<TP1', r.fatal, true);
    r = P.calcular({ ...base, sl2In: 49.9 }, est0, cfg); eq('c10 SL2 peor', r.fatal, true);
    r = P.calcular({ ...base, unidadesReales: 40 }, est0, cfg); eq('c11 manual grande', r.bloqueos.some(b => b.regla === 'Tamaño mayor al permitido'), true); eq('c11 riesgo', r.riesgo, 32);
    r = P.calcular({ ...base, precioAhora: 49.1 }, est0, cfg); eq('c12 invalidada', r.bloqueos.some(b => /invalidada/.test(b.t)), true);
    r = P.calcular({ ...base, tipo: 'market', precioAhora: 50.1 }, est0, cfg);
    eq('m1 entrada real', r.entradaEf, 50.1); eq('m1 d', r.d, 0.9); eq('m1 unidades', r.unidades, 30); eq('m1 rr1 con entrada real', r.rr1, 1.2 / 0.9); eq('m1 bloquea rr1', r.bloqueos.some(b => /TP1 da/.test(b.t)), true);
    r = P.calcular({ ...base, tipo: 'market', precioAhora: 50.02, sl2In: 50 }, est0, cfg);
    eq('m2 SL2 a entrada real', r.sl2, 50.02); eq('m2 no fatal', r.fatal, false);
    r = P.calcular({ ...base, amb: [{ campo: 'entrada', raw: '5.123' }] }, est0, cfg); eq('amb fatal', r.fatal, true);
    r = P.calcular({ ...base, entrada: 5123, sl1: 5.05, tp1: 5.3, tp2: 5.5, precioAhora: 5.1 }, est0, cfg); eq('magnitud fatal', r.fatal, true);
    r = P.calcular({ ...base, precioAhora: 500 }, est0, cfg); eq('precio ahora lejos fatal', r.fatal, true);
    const cfg1 = { ...cfg, paso: 1 };
    r = P.calcular({ ...base, entrada: 100, sl1: 91, tp1: 113.5, tp2: 120, precioAhora: 100 }, est0, cfg1);
    eq('paso1 unidades 3', r.unidades, 3); eq('paso1 aviso 33%', r.avisos.some(a => /33%/.test(a)), true);
    r = P.calcular({ ...base, entrada: 100, sl1: 80, tp1: 130, tp2: 140, precioAhora: 100 }, est0, cfg1);
    eq('paso1 unidad 1', r.unidades, 1); eq('paso1 sin mitad', r.avisos.some(a => /no hay mitad/.test(a)), true);

    const now = Date.UTC(2026, 9, 13, 19, 0);
    const H = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h + 4, mi);
    const mk = (o) => P.normTrade(o.id, o);
    const trades = [
      mk({ id: 'a', ts: H(2026, 10, 13, 10, 0), estado: 'cerrada', dir: 'compra', entrada: 50, sl1: 49, unidades: 27, riesgoInicial: 27, pnl: -27, r: -1, cierre: { ts: H(2026, 10, 13, 11, 0), precio: 49, motivo: 'SL1' }, nivel: 27 }),
      mk({ id: 'b', ts: H(2026, 10, 12, 10, 0), estado: 'cerrada', dir: 'compra', entrada: 50, sl1: 49, unidades: 27, riesgoInicial: 27, pnl: -27, r: -1, cierre: { ts: H(2026, 10, 12, 12, 0), precio: 49, motivo: 'SL1' }, nivel: 27 }),
      mk({ id: 'c', ts: H(2026, 10, 11, 10, 0), estado: 'cerrada', dir: 'compra', entrada: 50, sl1: 49, unidades: 30, riesgoInicial: 30, pnl: -30, r: -1, cierre: { ts: H(2026, 10, 11, 12, 0), precio: 49, motivo: 'SL1' }, nivel: 36 }),
      mk({ id: 'd', ts: H(2026, 10, 12, 14, 0), estado: 'abierta', dir: 'compra', entrada: 100, sl1: 99, stopActual: 99, unidades: 27, unidadesAbiertas: 27, riesgoInicial: 27, nivel: 27 }),
      mk({ id: 'e', ts: H(2026, 10, 13, 9, 50), estado: 'abierta', dir: 'venta', entrada: 20, sl1: 20.5, stopActual: 20, unidades: 20, unidadesAbiertas: 10, riesgoInicial: 10, tp1Hecho: true, nivel: 10 }),
      mk({ id: 'f', ts: H(2026, 10, 13, 9, 40), estado: 'cerrada', dir: 'compra', entrada: 10, sl1: 9, unidades: 18, riesgoInicial: 18, pnl: 30, r: 1.667, cierre: { ts: H(2026, 10, 13, 10, 30), precio: 11.7, motivo: 'TP2' }, nivel: 18 })
    ];
    const e1 = P.estadoDe(trades, cfg, now);
    eq('e1 perdHoy', e1.perdHoy, 27); eq('e1 perdSem', e1.perdSem, 54); eq('e1 riesgoAb', e1.riesgoAb, 27); eq('e1 dispHoy', e1.dispHoy, 0); eq('e1 dispSem', e1.dispSem, 27);
    eq('e1 opsHoy', e1.opsHoy, 3); eq('e1 margenOc', e1.margenOc, 145); eq('e1 luz', e1.luz, 'rojo'); eq('e1 netoHoy', e1.netoHoy, 3); eq('e1 semana', e1.semana, '2026-10-12');
    eq('e1 calc bloquea', P.calcular(base, e1, cfg).fatal, true);
    const e2 = P.estadoDe(trades.filter(t => t.id !== 'd'), cfg, now);
    eq('e2 dispHoy', e2.dispHoy, 27); eq('e2 verde', e2.luz, 'verde'); eq('e2 proximo', e2.proximo, 27);
    const e3 = P.estadoDe(trades.filter(t => t.id !== 'd').concat([mk({ id: 'g', ts: H(2026, 10, 13, 12, 0), estado: 'cerrada', dir: 'compra', entrada: 5, sl1: 4, unidades: 15, riesgoInicial: 15, pnl: -15, r: -1, cierre: { ts: H(2026, 10, 13, 12, 30), precio: 4, motivo: 'SL1' }, nivel: 18 })]), cfg, now);
    eq('e3 ámbar', e3.luz, 'ambar'); eq('e3 proximo', e3.proximo, 12);
    // Casos de la auditoría
    const parcialAbierta = mk({ id: 'p', ts: H(2026, 10, 13, 10, 0), estado: 'abierta', dir: 'compra', entrada: 50, sl1: 49, stopActual: 49, unidades: 10, unidadesAbiertas: 5, riesgoInicial: 10, nivel: 10, parciales: [{ ts: H(2026, 10, 13, 10, 30), tipo: 'Parcial', precio: 48, unidades: 5, pnl: -10 }] });
    const e4 = P.estadoDe([parcialAbierta], cfg, now);
    eq('auditoría: pérdida parcial cuenta', e4.perdHoy, 10); eq('auditoría: riesgo abierto 5', e4.riesgoAb, 5); eq('auditoría: quedan 39', e4.dispHoy, 39);
    const mixta = mk({ id: 'q', ts: H(2026, 10, 13, 10, 0), estado: 'cerrada', dir: 'compra', entrada: 50, sl1: 49, unidades: 10, unidadesAbiertas: 0, riesgoInicial: 10, nivel: 10, pnl: 5, r: 0.5, parciales: [{ ts: H(2026, 10, 13, 10, 30), tipo: 'Parcial', precio: 48, unidades: 5, pnl: -10 }], cierre: { ts: H(2026, 10, 13, 11, 0), precio: 53, unidades: 5, pnl: 15, motivo: 'A mano' } });
    const e5 = P.estadoDe([mixta], cfg, now);
    eq('auditoría: pérdida no se compensa', e5.perdHoy, 10); eq('auditoría: neto +5', e5.netoHoy, 5);
    eq('veredicto cerrado', P.veredicto(e2, { estado: 'cerrado', abre: 'mañana a las 09:30' }).titulo, 'Wall Street cerrado');
    eq('veredicto rojo manda', P.veredicto(e1, { estado: 'cerrado', abre: 'x' }).luz, 'rojo');
    eq('veredicto abierto', P.veredicto(e2, { estado: 'abierto' }).titulo, 'Hay presupuesto');
    const t2 = mk({ id: 'x', dir: 'compra', entrada: 50, sl1: 49.2, unidades: 33.75, unidadesAbiertas: 16.88, riesgoInicial: 27, estado: 'abierta', parciales: [{ pnl: 21.93 }] });
    const cc = P.cerrarCalc(t2, 50);
    eq('cerrar resto 0', cc.resto, 0); eq('cerrar pnl', cc.pnl, 21.93); eq('cerrar r', cc.r, 21.93 / 27);
    let m = P.mercado(Date.UTC(2026, 9, 13, 14, 0)); eq('mk abierto', m.estado, 'abierto'); eq('mk bo', m.bo, '10:00');
    m = P.mercado(Date.UTC(2026, 10, 2, 14, 0)); eq('mk pre nov', m.estado, 'pre'); out.push({ name: 'mk nov 10:30 Bolivia', got: m.texto, pass: /10:30 Bolivia/.test(m.texto) }); eq('mk nov ny', m.ny, '09:00');
    m = P.mercado(Date.UTC(2026, 9, 30, 21, 0)); out.push({ name: 'mk viernes → lunes 10:30', got: m.abre, pass: /lunes a las 10:30/.test(m.abre) });
    m = P.mercado(Date.UTC(2026, 10, 26, 15, 0)); eq('mk feriado', m.estado, 'cerrado'); out.push({ name: 'mk feriado mañana', got: m.texto, pass: /mañana/.test(m.texto) });
    m = P.mercado(Date.UTC(2026, 10, 27, 18, 30)); eq('mk cierre temprano', m.estado, 'cerrado');
    m = P.mercado(Date.UTC(2026, 10, 27, 17, 30)); eq('mk antes de 13:00', m.estado, 'abierto');
    m = P.mercado(Date.UTC(2026, 9, 17, 15, 0)); out.push({ name: 'mk sábado → lunes 09:30', got: m.texto, pass: /lunes a las 09:30/.test(m.texto) });
    return out;
  });
  pure.forEach(x => ok(x.name, x.pass, x.got));

  /* ---- Funciones nuevas (v3) ---- */
  const nuevas = await pg.evaluate(() => {
    const P = window.PanelTrading, out = [];
    const eq = (name, got, exp) => out.push({ name, got, pass: JSON.stringify(got) === JSON.stringify(exp) });
    const p1 = P.puntajeDe([{ id: 'tendencia', puntos: 99 }, { id: 'stop', puntos: -3 }, { id: 'espacio', puntos: 12.6 }]);
    eq('puntaje recorta al máximo', p1.det[0].puntos, 25); eq('puntaje no negativo', p1.det[1].puntos, 0); eq('puntaje redondea', p1.det[2].puntos, 13); eq('puntaje faltantes en 0', p1.total, 38);
    eq('banda 80', P.bandaDe(80).nivelIdx, 3); eq('banda 65', P.bandaDe(65).nivelIdx, 2); eq('banda 50', P.bandaDe(50).nivelIdx, 1); eq('banda 49', P.bandaDe(49).nivelIdx, null);
    const base = { activo: 'nvda', direccion: 'compra', entrada: 180.5, sl1: 179, tp1: 183, tp2: 185.5, criterios: [{ id: 'tendencia', puntos: 25 }, { id: 'stop', puntos: 20 }, { id: 'espacio', puntos: 20 }, { id: 'entrada', puntos: 15 }, { id: 'confirmacion', puntos: 10 }, { id: 'lectura', puntos: 10 }] };
    let a = P.normalizarAnalisis(base, {});
    eq('análisis 100 → $36', a.nivelIdx, 3); eq('análisis rr1', Math.round(a.rr1 * 1000) / 1000, 1.667); eq('análisis sin problemas', a.problemasNiveles.length, 0); eq('análisis activo mayúsculas', a.activo, 'NVDA'); eq('análisis SL2 por defecto', a.sl2, 180.5);
    a = P.normalizarAnalisis({ ...base, legible: false }, {}); eq('ilegible tope 49', a.puntaje, 49); eq('ilegible no operar', a.nivelIdx, null);
    a = P.normalizarAnalisis({ ...base, sl1: 182 }, {}); eq('SL1 lado malo detectado', a.problemasNiveles.some(x => /lado equivocado/.test(x)), true);
    a = P.normalizarAnalisis({ ...base, tp1: 181.5 }, {}); eq('TP1 bajo detectado', a.problemasNiveles.some(x => /TP1 da/.test(x)), true);
    a = P.normalizarAnalisis({ ...base, direccion: 'ninguna', entrada: null }, {}); eq('sin setup → no operar', a.nivelIdx, null);
    a = P.normalizarAnalisis({ ...base, sl2: 179.5 }, {}); eq('SL2 peor que entrada se corrige', a.sl2, 180.5);
    a = P.normalizarAnalisis('basura', { activo: 'amd' }); eq('respuesta rara no rompe', a.direccion, 'ninguna'); eq('activo del usuario', a.activo, 'AMD');
    const h = P.textoAHtml('## Título\n- uno\n- dos\ntexto **negrita** https://example.com/a <script>');
    eq('texto: título', /<h4>Título<\/h4>/.test(h), true); eq('texto: lista', /<ul><li>uno<\/li><li>dos<\/li><\/ul>/.test(h), true); eq('texto: negrita', /<b>negrita<\/b>/.test(h), true); eq('texto: link', /<a href="https:\/\/example.com\/a"/.test(h), true); eq('texto: escapa html', /&lt;script&gt;/.test(h) && !/<script>/.test(h), true);
    const pr = P.promptAnalisis({ n: 3, activo: 'NVDA', dir: '', notas: '' });
    eq('prompt pide JSON', /SOLO con un objeto JSON/.test(pr), true); eq('prompt con regla 1:1.5', /1:1\.5/.test(pr), true); eq('prompt sin probabilidades', /No des probabilidades/.test(pr), true);
    return out;
  });
  nuevas.forEach(x => ok(x.name, x.pass, x.got));

  /* ---- Flujo de pantalla ---- */
  const store = (col = 'trades/') => pg.evaluate((c) => [...window.__mockStore.entries()].filter(([k]) => k.startsWith(c)).map(([k, v]) => ({ k, ...v })), col);
  const txt = (sel) => pg.textContent(sel);
  const tab = async (t) => { await pg.click('#t-' + t); };
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const img = (n) => ({ name: n + '.png', mimeType: 'image/png', buffer: png });

  ok('ui arranca en Hoy', await pg.isVisible('#p-hoy') && !(await pg.isVisible('#p-operar')), null);
  ok('ui resumen vacío explica', /7:50/.test(await txt('#resumenTxt')), await txt('#resumenTxt'));
  await pg.evaluate(async () => { const db = await window.claude.use('db'); const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date()); await db.collection('resumenes').doc(p).set({ ts: Date.now(), dia: p, texto: '## Mercado\n- S&P 500 sube **0,5%**\nFuente: https://example.com/x' }); });
  await pg.waitForFunction(() => /S&P 500 sube/.test(document.getElementById('resumenTxt').textContent));
  ok('ui resumen se muestra', (await pg.innerHTML('#resumenTxt')).includes('<b>0,5%</b>') && /Hoy/.test(await txt('#resumenFecha')), await pg.innerHTML('#resumenTxt'));

  await tab('operar');
  await pg.click('#btnEjemplo');
  ok('ui ejemplo 33,75', /33,75/.test(await txt('#calcOut')), await txt('#calcOut'));
  await pg.fill('#f-activo', 'TEST');
  ok('ui sin checks: no deja', /No cumple/.test(await txt('#btnRegistrar')) && await pg.isDisabled('#btnRegistrar'), await txt('#btnRegistrar'));
  for (const id of ['chk-macro', 'chk-horario', 'chk-stop']) await pg.check('#' + id);
  await pg.selectOption('#f-tipoact', 'Tecnología');
  ok('ui registrar limpio', (await txt('#btnRegistrar')) === 'Registrar entrada', await txt('#btnRegistrar'));
  await pg.click('#btnRegistrar');
  await pg.waitForFunction(() => document.querySelectorAll('.pos').length === 1);
  let st = await store();
  ok('ui guardó', st.length === 1 && st[0].unidades === 33.75 && st[0].tipoActivo === 'Tecnología' && st[0].seguridad === null && st[0].reglasRotas.length === 0, st[0]);
  ok('ui insignia Abiertas', (await txt('#ab-badge')) === '1', await txt('#ab-badge'));
  ok('ui chip superior', /\$27,00/.test(await txt('#mini-txt')), await txt('#mini-txt'));

  await tab('abiertas');
  await pg.fill('.pos [data-now]', '51,4');
  ok('ui flotante TP1', /Llegó al TP1/.test(await txt('.pos .float')), await txt('.pos .float'));
  await pg.click('.pos [data-act="tp1"]');
  await pg.click('.pos [data-act="ok-tp1"]');
  await pg.waitForFunction(() => /Stop \(SL2\)/.test(document.querySelector('.pos') && document.querySelector('.pos').textContent));
  await pg.click('.pos [data-act="cerrar"]');
  await pg.click('.pos label[for^="plan-si-"]');
  await pg.click('.pos [data-act="ok-cerrar"]');
  await pg.waitForFunction(() => document.querySelectorAll('.pos').length === 0);
  st = await store();
  ok('ui cierre', st[0].estado === 'cerrada' && Math.abs(st[0].pnl - 21.93) < 0.001 && st[0].plan === 'si', { pnl: st[0].pnl });

  // Lector de capturas
  await tab('analizar');
  ok('ui capturas disponible', !(await pg.isVisible('#cap-no')), await txt('#cap-no'));
  await pg.setInputFiles('#cap-files', [img('diario'), img('4h'), img('15m')]);
  ok('ui 3 miniaturas', (await pg.$$('#cap-thumbs .thumb')).length === 3, null);
  await pg.click('#cap-thumbs [data-quitar="2"]');
  ok('ui quitar miniatura', (await pg.$$('#cap-thumbs .thumb')).length === 2, null);
  await pg.setInputFiles('#cap-files', [img('15m')]);
  await pg.click('#btnAnalizar');
  await pg.waitForSelector('#cap-resultado .score');
  const res = await txt('#cap-resultado');
  ok('ui análisis puntaje 78', /78\/100/.test(res) && /Con matices/.test(res), res.slice(0, 200));
  ok('ui análisis riesgo $27', /Riesgo sugerido: \$27/.test(res), res.slice(0, 300));
  ok('ui análisis beneficio/riesgo', /1:1,67/.test(res) && /1:3,33/.test(res), null);
  const llamada = await pg.evaluate(() => window.__sampleCalls.filter(c => c.tipo === 'json').pop());
  ok('ui mandó 3 imágenes al modelo más capaz', llamada.imagenes === 3 && llamada.tier === 'complex', llamada);
  let sen = await store('senales/');
  const sc = sen.find(x => x.origen === 'Capturas');
  ok('ui análisis guardado como señal', sc && sc.analisis.puntaje === 78 && sc.entrada === 180.5 && sc.estado === 'vista', sc && sc.analisis && sc.analisis.puntaje);
  await pg.click('#btnCargarAnalisis');
  ok('ui cargó en Operar', await pg.isVisible('#p-operar') && (await pg.inputValue('#f-entrada')) === '180,50' && (await pg.inputValue('#f-origen')) === 'Capturas' && await pg.isChecked('#f-n2') && (await pg.inputValue('#f-tipoact')) === 'Semis/IA', [await pg.inputValue('#f-entrada'), await pg.inputValue('#f-tipoact')]);
  await pg.fill('#f-ahora', '180,55');
  for (const id of ['chk-macro', 'chk-horario', 'chk-stop']) await pg.check('#' + id);
  ok('ui análisis registrable', (await txt('#btnRegistrar')) === 'Registrar entrada', await txt('#calcOut'));
  await pg.click('#btnRegistrar');
  await pg.waitForFunction(() => document.querySelector('#ab-badge') && document.querySelector('#ab-badge').textContent === '1');
  await pg.waitForTimeout(150);
  st = await store(); sen = await store('senales/');
  const nv = st.find(x => x.activo === 'NVDA');
  ok('ui operación con seguridad', nv && nv.seguridad === 78 && nv.tipoActivo === 'Semis/IA' && nv.senalId === sc.k.split('/')[1], nv && { seg: nv.seguridad, tipo: nv.tipoActivo });
  ok('ui señal de capturas operada', sen.find(x => x.origen === 'Capturas').estado === 'operada', null);

  // Comprobador, revisión y ver por
  await tab('diario');
  ok('ui comprobar lista', (await pg.$$('#comprobarLista [data-chk]')).length >= 1, await txt('#comprobarLista'));
  const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#comprobarLista [data-chk]')]);
  await fc.setFiles(img('5m'));
  await pg.waitForFunction(() => /TP1 primero/.test(document.getElementById('comprobarLista').textContent));
  sen = await store('senales/');
  ok('ui comprobación guardada', sen.some(x => x.comprobacion && x.comprobacion.resultado === 'tp1' && x.comprobacion.confianza_lectura === 'media'), null);
  ok('ui tabla de comprobadas', /TP primero/.test(await txt('#comprobarStats')), await txt('#comprobarStats'));
  await pg.click('#btnRevision');
  await pg.waitForFunction(() => /Qué funciona/.test(document.getElementById('revisionTxt').textContent) && !document.getElementById('btnRevision').disabled);
  const rev = await store('revisiones/');
  ok('ui revisión guardada', rev.length === 1 && /Qué funciona/.test(rev[0].texto), rev.length);
  const promptRev = await pg.evaluate(() => window.__sampleCalls.filter(c => c.tipo === 'texto').pop().input);
  ok('ui revisión manda datos del diario', /"operaciones":1/.test(promptRev) && /menos de 20 operaciones/.test(promptRev), promptRev.slice(0, 120));
  await pg.selectOption('#verPor', 'tipo');
  ok('ui ver por tipo', /Tecnología/.test(await txt('#diarioStats')), null);
  await pg.selectOption('#verPor', 'hora');
  ok('ui ver por hora', /:00 a /.test(await txt('#diarioStats')), null);

  // Estado, CSV, JSON, desborde
  await tab('hoy');
  await pg.click('#btnEstado'); await pg.waitForTimeout(150);
  const estadoTxt = await pg.evaluate(() => { const b = document.getElementById('estadoTxt'); return b.hidden ? null : b.value; });
  ok('ui estado', estadoTxt === null || /Abiertas: NVDA compra/.test(estadoTxt), estadoTxt);
  const csv = await pg.evaluate(() => window.PanelTrading.csv());
  ok('csv con tipo y seguridad', /;tipo_activo;seguridad;/.test(csv) && /NVDA;Semis\/IA;78;/.test(csv), csv.slice(0, 300));
  const js = await pg.evaluate(() => JSON.parse(window.PanelTrading.respaldoJson()));
  ok('json completo', js.trades.length === 2 && js.senales.length === 1 && js.resumenes.length === 1 && js.revisiones.length === 1, { t: js.trades.length, s: js.senales.length, r: js.resumenes.length, v: js.revisiones.length });
  for (const t of ['hoy', 'analizar', 'operar', 'abiertas', 'diario']) { await tab(t); ok('sin scroll 390 en ' + t, !(await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), null); }

  await tab('analizar');
  await pg.screenshot({ path: path.join(dir, 'shot-v3-capturas.png'), fullPage: true });
  await tab('hoy');
  await pg.screenshot({ path: path.join(dir, 'shot-v3-hoy.png'), fullPage: false });
  await pg.setViewportSize({ width: 1280, height: 900 });
  await tab('diario');
  ok('sin scroll 1280', !(await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), null);

  const fails = results.filter(r => !r.pass);
  const resumen = { fecha: new Date().toISOString(), archivo: 'panel-trading.html', total: results.length, fallas: fails.length, erroresPagina: errors, casos: results.map(r => ({ caso: r.name, paso: r.pass })) };
  fs.writeFileSync(path.join(dir, 'resultado-pruebas.json'), JSON.stringify(resumen, null, 2));
  console.log('Pruebas: ' + results.length + ' · fallas: ' + fails.length);
  fails.forEach(f => console.log('FALLA ' + f.name + ' → ' + JSON.stringify(f.got)));
  console.log('Errores de página: ' + (errors.length ? errors.join(' | ') : 'ninguno'));
  await browser.close();
})().catch(e => { console.error('ERROR TEST', e); process.exit(1); });
