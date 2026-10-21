// Pruebas de la corrección de niveles de riesgo (v3.1).
// Uso: node test-niveles.js <carpeta> [archivo]. Reutiliza el simulador de test-panel.js.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const archivo = process.argv[3] || 'panel-trading.html';
const html = fs.readFileSync(path.join(dir, archivo), 'utf8');
const suite = fs.readFileSync(path.join(__dirname, 'test-panel.js'), 'utf8');
const MOCK = suite.slice(suite.indexOf('const MOCK = `') + 'const MOCK = `'.length, suite.indexOf('})();`;') + '})();'.length);
const { AHORA } = require('./datos-tablero.js');
const skeleton = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + html + '</body></html>';
fs.writeFileSync(path.join(dir, 'test-niveles-page.html'), skeleton);

const reg = (nivel, riesgo = '27') => 'REGISTRO: 14/10/2026 | NVDA | compra | 180,50 | 178,90 | 180,50 | 183,00 | 185,50 | ' + riesgo + ' | 120 | ' + nivel + '\nAL ENTRAR: pon el stop en Quantfury en el mismo momento. Sin stop puesto, no hay operación.';

(async () => {
  const browser = await chromium.launch();
  const results = [], errors = [];
  const ok = (name, pass, got) => results.push({ name, pass: !!pass, got });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(MOCK);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // Reloj fijo con Wall Street abierto (miércoles 14-oct-2026, 11:05 NY): desde v3.6 la señal se carga desde su tarjeta, y con el mercado cerrado Operar queda deshabilitado.
  await pg.clock.install({ time: AHORA });
  await pg.goto('file://' + path.join(dir, 'test-niveles-page.html'));
  await pg.waitForFunction(() => document.getElementById('v-title').textContent !== 'Cargando tus operaciones…', null, { timeout: 15000 });

  // 1) Lectura del nivel en la línea REGISTRO (formato real de las tres tareas: nivel EN PALABRAS)
  const casos = [
    ['Cauteloso', 0], ['cauteloso', 0], ['CAUTELOSO', 0],
    ['Moderado', 1], ['moderado', 1],
    ['Estándar', 2], ['Estandar', 2], ['estándar (USD 27)', 2],
    ['Alta convicción', 3], ['Alta conviccion', 3], ['ALTA CONVICCIÓN', 3],
    ['Cauteloso (USD 10)', 0], ['Alta convicción (hasta USD 36)', 3],
    ['Moderado — volátil por resultados', 1],
    ['Alta convicción 18', 1],                      // nombre y monto en conflicto: gana el más bajo
    ['USD 10 (evento)', 0], ['evento', 0], ['riesgosa', 1], ['muy buena', 3], ['36', 3], ['10', 0],
  ];
  for (const [txt, exp] of casos) {
    const o = await pg.evaluate(([t]) => window.PanelTrading.parseRegistro(t, window.PanelTrading.DEF.niveles), [reg(txt)]);
    ok('nivel «' + txt + '» → ' + exp, o && o.nivelIdx === exp && !o.nivelDudoso, o && { idx: o.nivelIdx, dudoso: o.nivelDudoso });
  }
  for (const txt of ['Agresivo', '', 'nivel ?']) {
    const o = await pg.evaluate(([t]) => window.PanelTrading.parseRegistro(t, window.PanelTrading.DEF.niveles), [reg(txt)]);
    ok('nivel desconocido «' + txt + '» → el más bajo y avisa', o && o.nivelIdx === 0 && o.nivelDudoso === true, o && { idx: o.nivelIdx, dudoso: o.nivelDudoso });
  }

  // 2) Flujo real en pantalla: pegar la señal, tocar Operar en su tarjeta (v3.6) y revisar el nivel elegido y el mensaje de la calculadora
  // Cada caso empieza con la bandeja vacía: la regla de no duplicar (mismo día, activo, dirección, entrada y SL1) frenaría la misma señal pegada otra vez.
  const vaciarBandeja = async () => {
    await pg.evaluate(async () => { const db = await window.claude.use('db'); for (const k of [...window.__mockStore.keys()].filter(k => k.startsWith('senales/'))) await db.collection('senales').doc(k.split('/')[1]).delete(); });
    await pg.waitForFunction(() => !document.querySelector('#sen-lista .sen'));
  };
  const pegar = async (texto) => {
    await pg.click('[data-tab="operar"]');
    await vaciarBandeja();
    await pg.fill('#f-pegar', texto);
    await pg.click('#btnPegar');
    await pg.waitForSelector('#sen-lista [data-sen-op]:not([disabled])');
    await pg.click('#sen-lista [data-sen-op]');
    await pg.waitForTimeout(150);
    return pg.evaluate(() => ({ sel: (document.querySelector('input[name="f-nivel"]:checked') || {}).value, msg: document.getElementById('pegarMsg').textContent, cls: document.getElementById('pegarMsg').className }));
  };
  let r = await pegar(reg('Cauteloso', '10'));
  ok('pantalla: Cauteloso marca $10', r.sel === '0' && /Nivel de riesgo: Cauteloso \(\$10\)/.test(r.msg), r);
  r = await pegar(reg('Moderado', '18'));
  ok('pantalla: Moderado marca $18', r.sel === '1' && /Moderado \(\$18\)/.test(r.msg), r);
  r = await pegar(reg('Alta convicción', '36'));
  ok('pantalla: Alta convicción marca $36', r.sel === '3' && /Alta convicción \(\$36\)/.test(r.msg), r);
  r = await pegar(reg('Estándar', '27'));
  ok('pantalla: Estándar marca $27', r.sel === '2' && /Estándar \(\$27\)/.test(r.msg) && /ok/.test(r.cls), r);
  r = await pegar(reg('Agresivo', '27'));
  ok('pantalla: nivel desconocido marca $10, avisa en rojo', r.sel === '0' && /No reconocí el nivel de riesgo «Agresivo»/.test(r.msg) && /err/.test(r.cls), r);
  r = await pegar(reg('Moderado', '18') + '\nAPUESTA DE EVENTO');
  ok('pantalla: apuesta de evento sigue forzando $10', r.sel === '0', r);

  // 3) Varias señales pegadas juntas: cada tarjeta de la bandeja muestra su nivel (antes, un botón por señal)
  await pg.click('[data-tab="operar"]');
  await vaciarBandeja();
  await pg.fill('#f-pegar', 'PRE-APERTURA\n' + reg('Cauteloso', '10') + '\n\n' + reg('Alta convicción', '36').replace('NVDA', 'AMD'));
  await pg.click('#btnPegar');
  await pg.waitForFunction(() => document.querySelectorAll('#sen-lista .sen').length === 2);
  const botones = await pg.evaluate(() => [...document.querySelectorAll('#sen-lista .sen')].map(b => b.textContent));
  ok('varias señales: cada opción muestra su nivel', botones.length === 2 && /NVDA.*\$10/.test(botones[0]) && /AMD.*\$36/.test(botones[1]), botones);
  await pg.click('#sen-lista .sen:nth-child(2) [data-sen-op]');
  await pg.waitForTimeout(150);
  const sel2 = await pg.evaluate(() => (document.querySelector('input[name="f-nivel"]:checked') || {}).value);
  ok('varias señales: elegir la segunda marca $36', sel2 === '3', sel2);

  // 4) Nombres alineados con las tareas en la pantalla
  const etiquetas = await pg.evaluate(() => [0, 1, 2, 3].map(i => document.querySelector('label[for="f-n' + i + '"] small').textContent));
  ok('botones con los nombres de las tareas', JSON.stringify(etiquetas) === JSON.stringify(['Cauteloso', 'Moderado', 'Estándar', 'Alta convicción']), etiquetas);

  const fails = results.filter(x => !x.pass);
  console.log('Pruebas de niveles: ' + results.length + ' · fallas: ' + fails.length);
  fails.forEach(f => console.log('FALLA ' + f.name + ' → ' + JSON.stringify(f.got)));
  console.log('Errores de página: ' + (errors.length ? errors.join(' | ') : 'ninguno'));
  fs.writeFileSync(path.join(dir, 'resultado-niveles.json'), JSON.stringify({ fecha: new Date().toISOString(), total: results.length, fallas: fails.length, errores: errors, casos: results }, null, 2));
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => { console.error('ERROR TEST', e); process.exit(1); });
