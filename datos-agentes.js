// Datos inventados para probar y fotografiar los agentes (v3.8). No son operaciones reales: todo es una cuenta simulada.
// AHORA: miércoles 14-oct-2026, 11:05 en Nueva York = 11:05 en Bolivia (en octubre las dos van en UTC−4).
// Límites de partida de cada cuenta (AGENTE_DEF): capital $100, riesgo $2 por operación, pérdida del día $6, acumulada $20, 3 abiertas, B/R 1,5, sin apalancamiento.
const H = (d, h, mi) => Date.UTC(2026, 9, d, h + 4, mi); // día de octubre de 2026, hora de Bolivia/NY

// Tres agentes: Vigía investigando (corre cada 30 min), Búho pausado por Johannes a las 10:20 y Lince sin noticias
// (última corrida 08:05, la próxima era 08:35: esperado 30 min; a las 11:05 pasaron 3 h, más del doble → "Sin noticias desde 08:05").
function agentes() {
  return [
    ['vigia', { nombre: 'Vigía', rol: 'Busca entradas en semiconductores', avatar: 'vigia', estado: 'investigando', texto: 'Revisando NVDA y AMD en 15 minutos', ultimaCorrida: H(14, 10, 55), proximaCorrida: H(14, 11, 25), pausado: false }],
    ['buho', { nombre: 'Búho', rol: 'Vigila el riesgo de las cuentas simuladas', avatar: 'buho', estado: 'riesgo', texto: 'Revisando que ninguna cuenta pase sus límites', ultimaCorrida: H(14, 10, 15), proximaCorrida: H(14, 10, 45), pausado: true, pausadoTs: H(14, 10, 20) }],
    ['lince', { nombre: 'Lince', rol: 'Propone operaciones de práctica en tecnología', avatar: 'lince', estado: 'analizando', texto: 'Esperando el precio de AMD para decidir', ultimaCorrida: H(14, 8, 5), proximaCorrida: H(14, 8, 35), pausado: false }]
  ];
}

// Una operación del agente como la escribe el contrato (AGENTES.md): practica: true, cuenta: 'agente', agente: <id>, fuente 'Agente'.
function op(id, o) {
  const riesgo = Math.abs(o.entrada - o.sl1) * o.unidades, cerrada = o.sale != null;
  return [id, Object.assign({
    cuenta: 'agente', practica: true, agente: o.agente, fuente: 'Agente', origen: 'Agente', activo: o.activo, dir: o.dir || 'compra', tipo: 'limite',
    entrada: o.entrada, entradaPlan: o.entrada, sl1: o.sl1, sl2: o.entrada, tp1: o.tp1, tp2: o.tp2, nivel: 2, unidades: o.unidades, unidadesAbiertas: cerrada ? 0 : o.unidades,
    riesgoInicial: Math.round(riesgo * 10000) / 10000, stopActual: o.sl1, estado: cerrada ? 'cerrada' : 'abierta', ts: o.entra, parciales: [], movimientos: [], reglasRotas: [], nota: ''
  }, cerrada ? { cierre: { ts: o.sale, precio: o.precio, unidades: o.unidades, pnl: o.pnl, motivo: o.motivo || (o.pnl < 0 ? 'SL1' : 'TP1') }, pnl: o.pnl, r: Math.round(o.pnl / riesgo * 1000) / 1000 } : {},
  o.costos ? { costos: o.costos } : {})];
}

// Cuentas a mano (en orden de entrada; cada una contra las que ya cumplieron):
//  Vigía
//   v1 PLTR 12/10 10:10 compra 2 a 20, stop 19 (riesgo $2), TP1 21,5 (1,5) y TP2 23 (3,0), posición $40 ≤ $100 → cumple. Cierra +$3 (TP1). Costos $0,15.
//   v2 SOFI 13/10 10:20 compra 4 a 10, stop 9,5 (riesgo $2), TP1 10,75 (1,5) → cumple. Cierra −$2 en el stop. Costos $0,10.
//   v3 F    14/10 09:40 compra 3 a 12, stop 11,5 (riesgo $1,50), TP1 12,9 (1,8) → cumple. Abierta. Costos $0,10.
//   v4 RIVN 14/10 10:15 compra 3 a 15, stop 14: riesgo $3 → FUERA "Riesgo de $3,00 (máximo $2,00)". Su +$4,50 no cuenta.
//   v5 SNAP 14/10 10:30 venta 5 a 8, stop 8,4 (riesgo $2), TP1 7,6: B/R 0,4/0,4 = 1,0 → FUERA "TP1 con B/R 1,0 (mínimo 1,5)".
//   Saldo: 100 + 3 − 2 − (0,15 + 0,10 + 0,10) = $100,65. Hoy: nada cerrado hoy y $0,10 de costos de v3 → −$0,10. Fuera de límites: 2. Abiertas: 1 (F).
//  Lince
//   l1 AMD 14/10 08:20 compra 4 a 25, stop 24,5 (riesgo $2), TP1 25,75 (1,5) → cumple. Cierra −$2 a las 08:50. Saldo $98, hoy −$2, fuera 0.
//  Búho (pausado por Johannes a las 10:20)
//   b1 MSFT 14/10 10:40 compra 3 a 30, stop 29,5 (riesgo $1,50), TP1 30,75 (1,5): todo bien salvo que el agente estaba en pausa → FUERA "El agente estaba en pausa a las 10:40".
//   Saldo $100, hoy $0,00, fuera 1.
function operaciones() {
  return [
    op('ag-v1', { agente: 'vigia', activo: 'PLTR', entra: H(12, 10, 10), entrada: 20, sl1: 19, tp1: 21.5, tp2: 23, unidades: 2, sale: H(12, 11, 0), precio: 21.5, pnl: 3, costos: { comision: 0.1, deslizamiento: 0.05 } }),
    op('ag-v2', { agente: 'vigia', activo: 'SOFI', entra: H(13, 10, 20), entrada: 10, sl1: 9.5, tp1: 10.75, tp2: 11.5, unidades: 4, sale: H(13, 12, 0), precio: 9.5, pnl: -2, costos: { comision: 0.1 } }),
    op('ag-v3', { agente: 'vigia', activo: 'F', entra: H(14, 9, 40), entrada: 12, sl1: 11.5, tp1: 12.9, tp2: 13.5, unidades: 3, costos: { comision: 0.1 } }),
    op('ag-v4', { agente: 'vigia', activo: 'RIVN', entra: H(14, 10, 15), entrada: 15, sl1: 14, tp1: 16.5, tp2: 18, unidades: 3, sale: H(14, 10, 45), precio: 16.5, pnl: 4.5 }),
    op('ag-v5', { agente: 'vigia', activo: 'SNAP', dir: 'venta', entra: H(14, 10, 30), entrada: 8, sl1: 8.4, tp1: 7.6, tp2: 7.2, unidades: 5 }),
    op('ag-l1', { agente: 'lince', activo: 'AMD', entra: H(14, 8, 20), entrada: 25, sl1: 24.5, tp1: 25.75, tp2: 26.5, unidades: 4, sale: H(14, 8, 50), precio: 24.5, pnl: -2 }),
    op('ag-b1', { agente: 'buho', activo: 'MSFT', entra: H(14, 10, 40), entrada: 30, sl1: 29.5, tp1: 30.75, tp2: 31.5, unidades: 3 })
  ];
}

// Bitácora: un documento por agente y por día (id <agente>-<AAAA-MM-DD>), con los eventos en orden de hora.
const ev = (ts, tipo, texto, extra) => Object.assign({ ts, tipo, texto }, extra || {});
function bitacora() {
  return [
    ['vigia-2026-10-14', { agente: 'vigia', dia: '2026-10-14', ts: H(14, 10, 55), eventos: [
      ev(H(14, 9, 30), 'investiga', 'Arranca la corrida: reviso 12 semiconductores en 15 minutos.'),
      ev(H(14, 9, 38), 'analiza', 'F en 15 minutos: rebote en el soporte de 11,50.'),
      ev(H(14, 9, 40), 'registra', 'Abro F compra: 3 acciones a 12,00, stop 11,50 (riesgo $1,50).'),
      ev(H(14, 10, 15), 'registra', 'Abro RIVN compra: 3 acciones a 15,00, stop 14,00.'),
      ev(H(14, 10, 30), 'propone', 'Propongo SNAP venta corta en 8,00.'),
      ev(H(14, 10, 55), 'resumen', 'Corrida terminada: 1 abierta, saldo $100,65.', { costo: 0.04 })
    ] }],
    ['vigia-2026-10-13', { agente: 'vigia', dia: '2026-10-13', ts: H(13, 12, 0), eventos: [
      ev(H(13, 10, 0), 'investiga', 'Reviso semiconductores antes de la primera hora.'),
      ev(H(13, 10, 20), 'registra', 'Abro SOFI compra: 4 acciones a 10,00, stop 9,50.'),
      ev(H(13, 12, 0), 'registra', 'SOFI tocó el stop: −$2,00.')
    ] }],
    ['buho-2026-10-14', { agente: 'buho', dia: '2026-10-14', ts: H(14, 10, 20), eventos: [
      ev(H(14, 10, 0), 'riesgo', 'Reviso los límites de las cuentas simuladas: todo dentro.'),
      ev(H(14, 10, 15), 'investiga', 'Miro las abiertas de Vigía y Lince.'),
      ev(H(14, 10, 20), 'pausa', 'Johannes pausó al agente desde Centinela (apagado de emergencia).', { origen: 'Johannes', datos: { pausado: true } })
    ] }],
    ['lince-2026-10-14', { agente: 'lince', dia: '2026-10-14', ts: H(14, 8, 50), eventos: [
      ev(H(14, 8, 5), 'error', 'No pude leer el precio de AMD: lo dejo para la próxima corrida.'),
      ev(H(14, 8, 20), 'registra', 'Abro AMD compra: 4 acciones a 25,00, stop 24,50.'),
      ev(H(14, 8, 50), 'registra', 'AMD tocó el stop: −$2,00.')
    ] }]
  ];
}

module.exports = { H, agentes, op, operaciones, bitacora, ev };
