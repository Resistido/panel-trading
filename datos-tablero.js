// Datos inventados para probar y fotografiar el tablero de Hoy. No son operaciones reales.
// Semana del lunes 12-oct-2026. AHORA: miércoles 14-oct-2026, 11:05 en Nueva York (= 11:05 en Bolivia, ambos UTC-4).
const NY = (m, d, h, mi) => Date.UTC(2026, m - 1, d, h + 4, mi); // octubre: Nueva York en UTC-4
const AHORA = NY(10, 14, 11, 5);

const base = { origen: 'Radar', tipo: 'limite', evento: false, reglasRotas: [], nota: '', movimientos: [], parciales: [], tipoActivo: 'Tecnología', seguridad: null, senalId: null, limitante: 'nivel' };
const cerrada = (activo, dir, entrada, sl1, unidades, riesgo, pnl, tsIn, tsOut, precio, motivo) => ({ ...base, activo, dir, entrada, entradaPlan: entrada, sl1, sl2: entrada, tp1: entrada + (dir === 'compra' ? 2 : -2), tp2: entrada + (dir === 'compra' ? 4 : -4),
  nivel: 27, nivelEf: 27, d: Math.abs(entrada - sl1), unidades, unidadesAbiertas: 0, riesgoInicial: riesgo, margen: 100, nocional: 2000, precioVerificado: entrada, stopActual: sl1, tp1Hecho: false,
  estado: 'cerrada', ts: tsIn, cierre: { ts: tsOut, precio, unidades, pnl, motivo }, pnl, r: Math.round(pnl / riesgo * 1000) / 1000, plan: 'si' });

function datosSemana() {
  return [
    ['t-nvda', cerrada('NVDA', 'compra', 180.5, 179, 18, 27, 40.5, NY(10, 12, 10, 20), NY(10, 12, 11, 40), 182.75, 'TP2')],
    ['t-amd', cerrada('AMD', 'venta', 160, 161, 18, 18, -18, NY(10, 12, 13, 0), NY(10, 12, 14, 5), 161, 'SL1')],
    ['t-tsla', cerrada('TSLA', 'compra', 250, 248, 13.5, 27, 27, NY(10, 13, 10, 30), NY(10, 13, 12, 0), 252, 'A mano')],
    ['t-mu', cerrada('MU', 'compra', 120, 119, 10, 10, -10, NY(10, 14, 9, 45), NY(10, 14, 10, 15), 119, 'SL1')],
    // Abierta con TP1 hecho y stop en la entrada (breakeven): riesgo abierto 0.
    ['t-avgo', { ...base, activo: 'AVGO', dir: 'compra', entrada: 330, entradaPlan: 330, sl1: 326, sl2: 330, tp1: 336, tp2: 342, nivel: 27, nivelEf: 27, d: 4, unidades: 6.75, unidadesAbiertas: 3.38, riesgoInicial: 27,
      margen: 111.38, nocional: 2227.5, precioVerificado: 330, stopActual: 330, tp1Hecho: true, estado: 'abierta', ts: NY(10, 14, 9, 50),
      parciales: [{ ts: NY(10, 14, 10, 40), tipo: 'TP1', precio: 336, unidades: 3.37, pnl: 20.22 }], movimientos: [{ ts: NY(10, 14, 10, 40), de: 326, a: 330, por: 'TP1' }] }],
    // Abierta con el stop inicial; el último precio verificado es de la entrada, hace 25 minutos: sin precio vigente.
    ['t-smci', { ...base, activo: 'SMCI', dir: 'venta', entrada: 42, entradaPlan: 42, sl1: 42.9, sl2: 42, tp1: 40.65, tp2: 39.3, nivel: 18, nivelEf: 18, d: 0.9, unidades: 20, unidadesAbiertas: 20, riesgoInicial: 18,
      margen: 42, nocional: 840, precioVerificado: 42, stopActual: 42.9, tp1Hecho: false, estado: 'abierta', ts: NY(10, 14, 10, 40) }]
  ];
}

module.exports = { NY, AHORA, datosSemana };
