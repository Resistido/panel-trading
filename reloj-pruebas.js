// Reloj de las pruebas: adelantar la hora de la página sin la carrera del reloj falso de Playwright.
//
// Por qué no basta con pg.clock.fastForward: en Playwright 1.56, mientras la hora corre sola, el reloj falso
// dispara los temporizadores de la página en pasadas que esperan un instante entre uno y otro (por ejemplo, los
// avisos del simulador de la base después de cada guardado, un setTimeout por suscripción). Si fastForward llega
// en medio de una de esas pasadas, la pasada vieja termina después y deja la hora donde estaba antes del salto:
// la página ya se dibujó a las 11:51 pero Date.now() vuelve a dar las 11:05, y lo siguiente que se dibuja
// (por ejemplo, la casilla del dato macro al llenar la calculadora) usa la hora vieja.
//
// adelantar(pg, ms) hace el salto con fastForward (dispara una vez lo vencido, como antes, a la hora de destino)
// y después fija la hora con setFixedTime: una hora fija no la mueve ninguna pasada, así que todo lo que sigue
// ve exactamente la hora de destino. Los temporizadores siguen corriendo con el tiempo real; solo Date.now()
// queda quieto hasta el próximo salto.
const MS = (t) => typeof t === 'number' ? t : t.split(':').reduce((a, x) => a * 60 + Number(x), 0) * 1000;

async function adelantar(pg, cuanto) {
  const ms = MS(cuanto);
  const desde = await pg.evaluate(() => Date.now());
  await pg.clock.setSystemTime(desde); // si un salto anterior la dejó quieta, que vuelva a correr para este salto
  await pg.clock.fastForward(ms);
  await pg.clock.setFixedTime(desde + ms);
  return desde + ms;
}

module.exports = { adelantar, MS };
