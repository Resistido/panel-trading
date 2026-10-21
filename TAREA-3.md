# Tarea 3: pruebas automáticas en GitHub + protecciones (calendario macro, aviso de fin de semana, pausa tras rachas) + borrar señales

Una sola tarea. Añade avisos y bloqueos que **ayudan a cumplir las reglas que Johannes ya tiene**. **No cambies reglas de riesgo existentes, cálculos de presupuesto, validaciones, ni el aspecto general (identidad Centinela).** Si ves algo útil que no está aquí, anótalo en el resumen final y no lo hagas.

## Punto de partida

- Johannes fusiona la v3.4 en `main` antes de lanzar esta tarea. Comprueba que `main` ya la tiene: `grep -c "Centinela" panel-trading.html` debe dar más de 0 y `npm test` debe pasar 570 pruebas. Si es así, crea tu rama desde `main`: `git checkout -b tarea-3-protecciones origin/main`. Si `main` no tiene Centinela, parte de `origin/tarea-2b-centinela` y dilo en el resumen.
- Lee `CLAUDE.md` entero: sus reglas siguen vigentes. Al terminar actualízalo (versión 3.5, conteo de pruebas, nuevas funciones puras, y una línea que diga que GitHub corre las pruebas solo).

## 0. Pruebas automáticas en GitHub (primero)

- Crea `.github/workflows/pruebas.yml`: en cada `push` a cualquier rama y en cada pull request, en `ubuntu-latest`, con Node LTS, ejecuta `npm install`, `npx playwright install --with-deps chromium` y `npm test`. Guarda `revision-visual/` como artefacto descargable de la ejecución si existe.
- Fija las versiones de las acciones (`actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`). No uses secretos: el repositorio es público y no los necesita.
- Haz este commit primero y súbelo, para que la ejecución de GitHub pruebe también tus commits siguientes. En el resumen, di si la ejecución de GitHub pasó (o que no pudiste verla).

## Principio

Las protecciones **avisan y frenan, nunca inventan datos**. No hay precios ni calendario en vivo: todo lo que el panel sabe del calendario lo escribió Johannes. Si el calendario está vacío, el panel lo dice ("No cargaste datos macro: revisalos vos") y **nunca** afirma que "no hay datos macro".

## 1. Calendario macro manual

- Nueva tarjeta en **Hoy** ("Datos macro") con la lista de los próximos eventos y un formulario mínimo: fecha, hora **en Bolivia** (UTC-4 fijo, sin horario de verano), nombre (ej. "CPI", "Fed") y botón Añadir. Cada evento tiene botón Quitar (con confirmación). Los eventos pasados hace más de 2 horas no se muestran.
- Función pura `proximidadMacro(eventos, ts)` → `{ estado: 'libre' | 'cerca' | 'sin_datos', evento, desde, hasta }`. "Cerca" = faltan menos de 30 min **o** salió hace menos de 30 min (ventana ±30 min, como dice la regla 6 de CLAUDE.md). `sin_datos` si la lista está vacía o no tiene ningún evento de hoy.
- Efecto en **Operar**: si el estado es `cerca`, la casilla "No hay un dato macro de alto impacto…" no se puede marcar y el botón de registrar queda deshabilitado con el motivo: "Dato macro 'CPI' a las HH:MM (Bolivia): esperá hasta HH:MM". El botón "Ya entré igual" **sigue funcionando** (registrar una operación que ya ocurrió debe ser posible). Si el estado es `sin_datos`, la casilla se marca a mano como hoy, pero se muestra una nota: "Tu calendario de hoy está vacío".
- Efecto en **Hoy**: si es `cerca`, aviso destacado con icono y palabra bajo el semáforo (ámbar; no cambia el semáforo de presupuesto). Si es `libre`, el próximo evento aparece como una línea ("Próximo dato: CPI en 2 h 10 min").
- Almacenamiento: colección nueva `eventos` en la base (misma forma que las demás: un documento por evento con `id`, `ts` en milisegundos, `nombre`). Concentra toda la lectura/escritura en funciones con nombre claro y comenta `/* PLATAFORMA: ... */`. No toques las colecciones existentes. En modo local sigue funcionando en memoria.

## 2. Aviso de fin de semana

- Función pura `avisoFinDeSemana(ts)` → `null` o `{ texto }`. Se activa el **último día hábil de la semana** de Wall Street según la hora de Nueva York (normalmente viernes; jueves si el viernes es feriado), solo durante ese día. Fin de semana, feriado u otro día: `null`. Usa los feriados que el panel ya conoce.
- Texto sugerido (ajústalo al tono de la app): "Último día de la semana: si dejás una posición abierta el fin de semana, el lunes puede abrir con un salto de precio (gap) que ejecute tu stop peor de lo previsto. Si tu broker cobra swap, también lo pagarías." **No inventes montos, tasas ni si Quantfury cobra swap**; el panel no lo sabe.
- Dónde se muestra: en **Hoy** (línea bajo la ventana de sesión), en **Operar** (nota sobre el botón de registrar) y en cada posición de **Abiertas**. Nunca bloquea nada.

## 3. Pausa tras rachas

Números propuestos (déjalos como constantes con nombre en un solo lugar, no en `cfg`, para no tocar la forma de los datos guardados; Johannes puede cambiarlos después):

- `PAUSA_RACHA = { perdidasSeguidas: 2, minutos: 30 }`: tras 2 operaciones cerradas seguidas con pérdida, pausa de 30 minutos contados desde el cierre de la segunda.
- `AVISO_MITAD = 0.5`: aviso cuando las pérdidas realizadas del día llegan al 50 % del presupuesto diario.
- Función pura `estadoPausa(trades, cfg, ts)` → `{ pausa: boolean, hasta, restanteMin, motivo }` y `avisoMitad(estado, cfg)`. "Seguidas" se mide por orden de cierre; una ganancia reinicia la racha; una operación en cero (R=0) no cuenta como pérdida ni reinicia la racha. Solo operaciones cerradas del día de hoy.
- Efecto: durante la pausa, **Hoy** muestra un aviso ámbar con cuenta atrás ("Pausa: 22 min"), y **Operar** deshabilita el botón de registrar con ese motivo (de nuevo, "Ya entré igual" sigue disponible). **No cambia el semáforo de presupuesto ni las reglas de presupuesto.** El aviso de la mitad es solo texto en Hoy.
- Todo en lenguaje llano y sin culpa: el objetivo es parar y respirar, no regañar.
- Muestra estas reglas nuevas en la lista de "Reglas y ajustes" (solo lectura).

## 4. Borrar una señal desde Comprobar señales

Hoy el panel no puede borrar señales. Añade a cada señal de la lista un botón "Eliminar" con confirmación en dos pasos (primer toque: "¿Seguro?"; segundo: borra). Una función con nombre claro concentra la llamada a la base (`/* PLATAFORMA */`). No afecta operaciones del diario. Tras borrar, se actualizan la lista y las estadísticas.

## Criterios de terminado

1. `npm test` pasa completo: las 570 pruebas actuales más las nuevas. **No borres ni debilites ninguna prueba.** Si un cambio legítimo obliga a actualizar una, conserva lo que verifica y dilo en el resumen.
2. Pruebas nuevas (archivo `test-proteccion.js`, añadido a `npm test`) para: `proximidadMacro` (±30 min en los bordes, sin datos, varios eventos, día distinto); `avisoFinDeSemana` (viernes normal, jueves con viernes feriado, viernes feriado, sábado, lunes); `estadoPausa` (2 pérdidas seguidas, ganancia en medio, R=0, ayer no cuenta, fin de la pausa a los 30 min) y `avisoMitad`; el bloqueo de registrar con "Ya entré igual" disponible; el borrado de señal con doble confirmación; ningún scroll horizontal a 360, 390, 768 y 1280 px en claro y oscuro; contraste de los nuevos avisos.
3. Capturas con Playwright de **Hoy en estado normal, con dato macro cerca, con pausa activa y con aviso de fin de semana**, y de **Operar bloqueada**, en oscuro y claro a 390 px, en `revision-visual/`. Míralas y corrige lo que se vea mal.
4. Sin cambios en reglas de riesgo, cálculos, formas de datos existentes ni llamadas a `claude.use` ya presentes. El modo local sigue funcionando.
5. Entrega `panel-trading.html` en la rama **`tarea-3-protecciones`** con un resumen de 5 líneas, cuántas pruebas pasan, qué debe comprobar Johannes a mano (por ejemplo: añadir un evento de prueba en 10 minutos y ver el bloqueo) y las ideas que viste y no hiciste.
