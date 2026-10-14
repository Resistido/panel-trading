# Tarea 1: modo "Ya estoy dentro" en la pestaña Capturas

Una sola tarea, acotada. No agregues otros módulos ni rediseñes la app en esta sesión.

## El problema

Hoy Capturas siempre responde como si Johannes buscara una entrada nueva. Cuando ya tiene una operación abierta, igual le propone entrar. Necesita que la app distinga las dos situaciones.

## Qué construir

1. **Selector de situación** al inicio de Capturas: "Busco entrada" (el comportamiento actual) o "Ya estoy dentro".
2. **Modo "Ya estoy dentro":**
   - Si hay posiciones en Abiertas, permite elegir una y rellena ticker, dirección, entrada, unidades abiertas, stop vigente y objetivos.
   - Si no está registrada, pide esos datos a mano.
   - Exige el precio actual de Quantfury, igual que en Operar.
   - Con las capturas, la IA (`sample.json`, igual que el análisis actual) evalúa si la idea sigue vigente, está debilitada o quedó invalidada, y propone una de cuatro acciones: mantener, mover el stop a favor (con nivel), tomar un parcial (con nivel y porcentaje) o salir ahora. Siempre con su motivo.
3. **Validación determinista, en código y no en la IA**, antes de mostrar la propuesta:
   - Un stop propuesto que aleje la pérdida (más abajo en compra, más arriba en venta corta) se descarta y se avisa.
   - Si el precio actual ya pasó el stop, la única acción es "salir: el stop ya debió ejecutarse".
   - Si no hay stop vigente, aviso rojo de exposición sin stop.
   - Muestra el riesgo actual en dólares y en R, y cuánto quedaría con la acción propuesta.
4. **Aplicar es opcional y manual:** si la posición está registrada, un botón lleva a la función existente de Abiertas (mover stop o registrar parcial), con la confirmación de siempre. La app nunca da por hecho que algo se ejecutó en Quantfury.
5. **"Busco entrada" sin capturas:** si escribe un ticker y no sube imágenes, muestra qué capturas tomar: diario de 6 a 9 meses, 4H de 4 a 6 semanas y 15 minutos de las últimas 2 o 3 sesiones.

## Criterios de terminado

- Pruebas nuevas para la validación del stop (compra y venta corta, precio más allá del stop, sin stop) y para el flujo en pantalla con la respuesta simulada de la IA. Amplía el simulador de `test-panel.js` si hace falta.
- Pasan las 219 pruebas originales y las 33 de niveles.
- Sin scroll horizontal a 390 px.
- Entrega `panel-trading.html` actualizado en una rama, con un resumen de 5 líneas y la lista de lo que Johannes debe comprobar a mano.
