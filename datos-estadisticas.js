// Datos inventados para las estadísticas del Diario (v3.7): los usan test-estadisticas.js y capturas-revision.js.
// Semana del lunes 12-oct-2026. En octubre Bolivia y Nueva York van las dos en UTC−4, así que la hora es la misma en las dos.
// Ventanas de sesión (hora de NY): 09:30–10:00 REGULAR, 10:00–11:30 BUENA, 11:30–15:00 REGULAR, 15:00–16:00 BUENA; fuera de horario, MALA.
const H = (d, h, mi) => Date.UTC(2026, 9, d, h + 4, mi); // día de octubre de 2026, hora de Bolivia/NY

// Una operación cerrada como la guarda el panel: pnl y r son el total (salidas parciales incluidas).
function cerrada(id, o) {
  const riesgo = o.riesgo || 10, pnl = o.pnl, parciales = o.parciales || [];
  const final = Math.round((pnl - parciales.reduce((a, p) => a + p.pnl, 0)) * 100) / 100;
  return [id, Object.assign({
    activo: o.activo || id.toUpperCase(), dir: o.dir || 'compra', entrada: 50, entradaPlan: 50, sl1: 49, sl2: 50, tp1: 52, tp2: 54, nivel: riesgo, nivelEf: riesgo, d: 1,
    unidades: riesgo, unidadesAbiertas: 0, riesgoInicial: riesgo, stopActual: 49, estado: 'cerrada', ts: o.entra, parciales, movimientos: [], reglasRotas: o.rotas || [], nota: '',
    origen: o.origen || '', tipo: 'limite', tipoActivo: o.tipoActivo || 'Tecnología', seguridad: o.seguridad == null ? null : o.seguridad, plan: o.plan || 'si',
    cierre: { ts: o.sale, precio: 51, unidades: riesgo, pnl: final, motivo: o.motivo || (pnl < 0 ? 'SL1' : 'A mano') }, pnl, r: Math.round(pnl / riesgo * 1000) / 1000
  }, o.fuente ? { fuente: o.fuente } : {}, o.practica ? { practica: true } : {})];
}

// Seis cerradas reales de esta semana, en orden de cierre. Cuentas a mano:
//   R: +1,5  −1  0  −1  −0,5  +1,5  → total +0,5 R, promedio 0,5/6 = +0,083 R ("+0,08 R"); $: +15 −20 +0 −18 −5 +40,5 = +$12,50
//   Ganadas 2 de 6 (33%), perdidas 3, en cero 1 (A3). Ganado $55,50, perdido $43,00 → factor 55,5/43 = 1,29.
//   R acumulado: 1,5 · 0,5 · 0,5 · −0,5 · −1,0 · 0,5 → máximo 1,5, mínimo después −1,0: caída máxima 2,5 R (de +1,5 a −1,0).
//   Rachas (la de cero no suma ni corta): G P [0] P P G → actual 1 ganada, mejor 1 ganada, peor 3 perdidas.
//   Fuera de tu plan: A4 (fuera del plan y una regla rota) y A5 (una regla rota) → 2 de 6, suman −1,5 R (−$23,00); sin ellas: (0,5 + 1,5) / 4 = +0,5 R.
//   Por fuente: ChatGPT 3 (2 ganadas, (1,5 − 1 + 1,5)/3 = +0,67 R) → Pre-apertura 1 (0, −1 R) y Radar 2 (2, +1,5 R); Claude 1 (0, 0 R); Propia 1 (0, −1 R); Sin dato 1 (0, −0,5 R).
//   Por ventana (hora de entrada): BUENA A1 10:15, A4 10:30, A6 10:05 → 3, (1,5 − 1 + 1,5)/3 = +0,67 R; REGULAR A2 12:00, A3 09:40 → 2, −0,5 R; MALA A5 08:00 → 1, −0,5 R.
//   Barras: la más grande es BUENA (0,667) → 100%; REGULAR y MALA 0,5/0,667 = 75%.
function semanaEjemplo() {
  return [
    cerrada('a1', { activo: 'NVDA', entra: H(12, 10, 15), sale: H(12, 10, 50), riesgo: 10, pnl: 15, fuente: 'ChatGPT', origen: 'Radar', tipoActivo: 'Semis/IA' }),
    cerrada('a2', { activo: 'MU', dir: 'venta', entra: H(12, 12, 0), sale: H(12, 12, 40), riesgo: 20, pnl: -20, fuente: 'ChatGPT', origen: 'Pre-apertura', tipoActivo: 'Semis/IA' }),
    cerrada('a3', { activo: 'AMD', entra: H(13, 9, 40), sale: H(13, 10, 20), riesgo: 10, pnl: 0, fuente: 'Claude', origen: 'Capturas', seguridad: 78, motivo: 'Stop en la entrada' }),
    cerrada('a4', { activo: 'TSLA', entra: H(13, 10, 30), sale: H(13, 11, 0), riesgo: 18, pnl: -18, fuente: 'Propia', origen: 'Propia', plan: 'no', rotas: ['Sin revisar datos macro'], tipoActivo: 'Consumo' }),
    cerrada('a5', { activo: 'AAPL', entra: H(13, 8, 0), sale: H(13, 11, 30), riesgo: 10, pnl: -5, origen: 'Radar', rotas: ['Fuera de horario regular'], motivo: 'A mano' }),
    cerrada('a6', { activo: 'AVGO', entra: H(14, 10, 5), sale: H(14, 10, 45), riesgo: 27, pnl: 40.5, fuente: 'ChatGPT', origen: 'Radar', parciales: [{ ts: H(14, 10, 25), tipo: 'TP1', precio: 51, unidades: 13.5, pnl: 13.5 }], motivo: 'TP2' })
  ];
}

// Veinticuatro cerradas reales de octubre (para ver Estadísticas con más de 20, sin aviso). Mezcla fuentes, ventanas, empates y reglas rotas.
function mesEjemplo() {
  const fuentes = ['ChatGPT', 'ChatGPT', 'ChatGPT', 'Claude', 'Propia', 'Otra', null];
  const origenes = ['Pre-apertura', 'Radar', 'Overnight'];
  const horas = [[10, 10], [10, 40], [12, 15], [9, 45], [15, 20], [13, 30], [10, 55], [8, 50]];
  const res = [1.5, -1, 0.8, -1, 2, 0, -0.6, 1.5, -1, 1.2, 0.5, -1, 1.5, -0.4, 1, -1, 0, 2.2, -1, 0.9, 1.5, -0.8, -1, 1.3];
  const out = [];
  for (let i = 0; i < res.length; i++) {
    const d = [1, 2, 5, 6, 7, 8, 9, 12, 13][Math.min(8, Math.floor(i / 2.67))]; // días hábiles de octubre hasta el martes 13
    const [h, mi] = horas[i % horas.length], f = fuentes[i % fuentes.length], riesgo = [10, 18, 27, 18][i % 4];
    out.push(cerrada('m' + (i + 1), { activo: ['NVDA', 'MU', 'AMD', 'META', 'AAPL', 'MSFT'][i % 6], entra: H(d, h, mi), sale: H(d, h, mi) + 40 * 60000, riesgo, pnl: Math.round(res[i] * riesgo * 100) / 100,
      fuente: f || undefined, origen: f === 'ChatGPT' ? origenes[i % 3] : f === 'Claude' ? 'Capturas' : f === 'Propia' ? 'Propia' : 'Radar', plan: i % 9 === 4 ? 'no' : 'si', rotas: i % 7 === 3 ? ['Sin revisar datos macro'] : [] }));
  }
  return out;
}

// Práctica: tres cerradas de esta semana que nunca se mezclan con las reales. +2 R, −1 R y +1 R → total +2 R, 2 de 3 ganadas.
function practicaEjemplo() {
  return [
    cerrada('p1', { activo: 'PLTR', entra: H(13, 10, 20), sale: H(13, 11, 5), riesgo: 10, pnl: 20, fuente: 'ChatGPT', origen: 'Radar', practica: true }),
    cerrada('p2', { activo: 'SMCI', entra: H(13, 12, 30), sale: H(13, 13, 10), riesgo: 10, pnl: -10, fuente: 'Claude', origen: 'Capturas', practica: true }),
    cerrada('p3', { activo: 'ARM', entra: H(14, 9, 50), sale: H(14, 10, 40), riesgo: 18, pnl: 18, fuente: 'Propia', origen: 'Propia', practica: true })
  ];
}

// Dos revisiones guardadas como las guarda el panel ({ ts, periodo, semana, texto }): una del lunes de esta semana y una del viernes anterior.
function revisionesEjemplo() {
  const txt = (a, b) => ['## Qué funciona', '- ' + a, '## Qué no funciona', '- ' + b, '## Reglas rotas', '- Una, costó −1 R', '## Un cambio para la próxima semana', '- Revisar el calendario macro antes de la primera entrada'].join('\n');
  return [
    ['r' + H(12, 19, 0), { ts: H(12, 19, 0), periodo: 'esta semana', semana: '2026-10-12', texto: txt('Respetaste los stops en las 6 operaciones.', 'Con 6 operaciones son primeras señales: la fuente Propia lleva −1 R.') }],
    ['r' + H(9, 19, 0), { ts: H(9, 19, 0), periodo: 'esta semana', semana: '2026-10-05', texto: txt('Las entradas en la ventana BUENA rindieron más.', 'Dos entradas en after-hours.') }]
  ];
}

module.exports = { H, cerrada, semanaEjemplo, mesEjemplo, practicaEjemplo, revisionesEjemplo };
