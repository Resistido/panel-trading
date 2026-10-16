# Tarea 2: rediseño visual con "tablero" en Hoy, modo oscuro y mapa de sesiones

Una sola tarea. Es un rediseño visual más un módulo nuevo y pequeño (la ventana de sesión). No cambies reglas de riesgo, cálculos, formas de datos guardados ni llamadas a `claude.use(...)`. Si ves algo que valga la pena y no está aquí, anótalo en el resumen final y no lo hagas.

## Objetivo

Johannes abre el panel justo antes de entrar a una operación, casi siempre en el celular (390 px). Tiene que ver de un vistazo: si puede operar, qué ventana de mercado es, cuánto presupuesto le queda, qué tiene abierto y cómo va la semana. Hoy esa información está repartida entre pestañas. Además quiere un modo oscuro cuidado, no solo el que sale por defecto.

## Qué construir

### 1. Sistema de diseño
- Define todos los colores, tipografías, espacios y radios como variables CSS en `:root` (claro) y sus equivalentes oscuros. Que cada pestaña los use, sin colores sueltos repartidos por el código.
- Semáforo verde / ámbar / rojo que no dependa solo del color: cada estado lleva además icono o palabra ("Puedes operar", "Con cuidado", "No operes").
- Contraste mínimo: texto 4,5:1 y elementos de interfaz 3:1, en claro y en oscuro. Se comprueba con una prueba que calcule las razones de contraste de los pares de variables.
- Fuentes: solo las que ya carga Google Fonts (o alternativas del mismo origen permitido). Nada de imágenes ni scripts de otros dominios.
- Zonas táctiles de al menos 44 px. Números siempre en la fuente de datos con cifras tabulares.
- Selector de tema Automático / Claro / Oscuro (en Ajustes o en la cabecera). La elección se guarda en el navegador con `localStorage` dentro de `try/catch` y, si no se puede, el panel funciona igual en Automático. No lo guardes en la base de datos.

### 2. Tablero en la pestaña Hoy
De arriba abajo, en una columna en el celular y en dos columnas desde 960 px:
1. **Semáforo** grande: el estado de hoy que ya existe, con su frase y la próxima acción posible.
2. **Ventana de sesión** (punto 3 de esta tarea): primera línea `VENTANA ACTUAL: BUENA / REGULAR / MALA — motivo`, con la hora de Bolivia y la de Nueva York, y cuánto falta para el próximo cambio de ventana.
3. **Presupuestos:** diario y semanal con barra, operaciones del día (n/6) y margen usado (de $450). Con los mismos números y reglas de hoy.
4. **Abiertas, en compacto:** una fila por posición con ticker, dirección, riesgo abierto en $ y R, y si el stop está en el inicial, a favor o en breakeven. Si hay un precio actual registrado de hace menos de 15 minutos, muestra el resultado flotante; si es más viejo, muestra "sin precio vigente" y no un número. Tocar la fila lleva a Abiertas.
5. **Resultados de la semana:** R acumulado y una curva pequeña dibujada con SVG hecho a mano en código (sin librerías). Con menos de 3 operaciones cerradas en la semana, muestra "Todavía pocos datos" y no la curva.
6. Debajo, lo que ya existe: botones de acción y el Resumen de mercado.

### 3. Ventana de sesión (función pura, con pruebas)
Crea una función pura, por ejemplo `ventanaSesion(ts)`, que reciba un instante y devuelva `{ nivel: 'buena' | 'regular' | 'mala', motivo, proximoCambio }`. Debe reutilizar `mercado()`, los feriados y los cierres tempranos que ya existen. Tabla de partida, en hora de Nueva York (ET), guardada como una constante fácil de editar:

| Franja (ET) | Nivel | Motivo |
|---|---|---|
| Fuera de 9:30–16:00, fin de semana o feriado | mala | Mercado cerrado: no se operan acciones fuera de horario regular |
| 9:30–10:00 | regular | Apertura con movimientos bruscos |
| 10:00–11:30 | buena | Mayor liquidez de la sesión |
| 11:30–15:00 | regular | Menos volumen a media sesión |
| 15:00–16:00 | buena | Cierre con volumen |
| Día de cierre temprano (13:00 ET) | La tabla aplica hasta las 13:00 (el tramo de 15:00 no existe). Desde las 13:00 es mala | Cierre temprano |

Esta tabla es un punto de partida **y no una predicción**: lo dice la pantalla en una línea chica. Johannes la va a ajustar, así que no la repartas por el código. Las franjas de ±30 minutos de datos macro se agregan en otra tarea; aquí no.

## Restricciones

- No cambies reglas de riesgo (ver CLAUDE.md), cálculos, validaciones ni la forma de los datos guardados.
- No agregues llamadas nuevas a `claude.use(...)`. El tablero lee el estado que la app ya tiene.
- Mantén las cinco pestañas y que "Capturas" siga funcionando, incluido "Ya estoy dentro". Son cambios visuales: no toques su lógica.
- Si cambias ids o clases que las pruebas usan, actualiza las pruebas conservando lo que verifican. No las borres ni las debilites.
- Sin scroll horizontal en ninguna pestaña, ni en claro ni en oscuro, a 360, 390, 768 y 1280 px.
- El panel debe seguir funcionando en "modo local" fuera de Claude.

## Criterios de terminado

1. Pasan las 358 pruebas actuales (`npm test`), más las nuevas.
2. Pruebas nuevas para:
   - `ventanaSesion`: una fila por franja, bordes exactos (9:30, 10:00, 11:30, 15:00, 16:00), sábado y domingo, un feriado, un día de cierre temprano y un cambio de horario de verano.
   - La función que arma la curva de resultados: sin cierres, con 2, con 3 o más, con pérdidas y ganancias mezcladas.
   - El tablero con datos simulados: sin posiciones, con una abierta con precio vigente, con precio de más de 15 minutos, y con el presupuesto agotado.
   - Contraste de colores en claro y en oscuro.
   - Selector de tema: cambia, se conserva al recargar y no rompe cuando `localStorage` no está disponible.
   - Sin scroll horizontal en las cinco pestañas, dos temas y cuatro anchos.
3. Genera capturas con Playwright de Hoy, Capturas, Operar, Abiertas y Diario en claro y oscuro a 390 px, y de Hoy a 1280 px. Guárdalas en la carpeta `revision-visual/` y súbelas a la rama. Mira tú mismo cada captura antes de dar la tarea por terminada, y corrige lo que se vea mal.
4. Entrega `panel-trading.html` en una rama nueva `tarea-2-tablero`, con:
   - un resumen de 5 líneas;
   - cuántas pruebas pasan;
   - lo que Johannes debe comprobar a mano en el panel real (por ejemplo, cómo se ve en su celular y que sus datos guardados siguen apareciendo);
   - cualquier refactor o mejora que veas y no hiciste.
