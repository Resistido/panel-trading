# Tarea 2b: nueva identidad visual "Centinela" (cambio de piel de todo el panel)

Una sola tarea. Es un cambio de aspecto y de nombre. **No cambies reglas de riesgo, cálculos, validaciones, formas de datos guardados ni llamadas a `claude.use(...)`.** Si ves algo útil que no está aquí, anótalo en el resumen final y no lo hagas.

## Punto de partida (importante)

- El código más reciente está en la rama **`tarea-2-tablero`** (v3.3, 501 pruebas). Haz `git fetch origin tarea-2-tablero` y crea tu rama desde ahí: `git checkout -b tarea-2b-centinela origin/tarea-2-tablero`. No partas de `main` si `main` no tiene el tablero de Hoy.
- `CLAUDE.md` puede decir 358 pruebas: hoy son **501** (219 + 33 + 106 + 143). Las reglas de `CLAUDE.md` siguen vigentes. Actualiza ese archivo al terminar (nombre, versión 3.4, conteo de pruebas).

## Qué pidió Johannes

El panel actual es prolijo pero "sin chiste". Quiere una identidad con carácter: **fondo carbón cálido, rojo de marca, tipografía técnica**, y un nombre nuevo: **Centinela** (reemplaza "Panel de Trading" en todo lo que se ve: cabecera, `<title>`, textos, pie). El archivo sigue llamándose `panel-trading.html`.

## Sistema visual

Todos los valores van como variables CSS en `:root` (claro) y sus equivalentes oscuros, nada de colores sueltos por el código. Los hex de abajo son el punto de partida del modo **oscuro**; si alguno no pasa contraste (texto 4,5:1, controles 3:1), ajústalo lo mínimo y anótalo.

| Papel | Oscuro |
|---|---|
| Fondo | `#0C0A0A` |
| Tarjeta | `#171212` |
| Línea / borde | `#2E2424` |
| Texto | `#F3EEEE` |
| Texto secundario | `#A89C9C` |
| Marca, como texto o línea | `#FF5A4E` |
| Marca, como relleno (texto blanco encima) | `#D7261B` |
| Ganancia | `#8FE3B0` |
| Pérdida | `#FF9AA2` |
| Advertencia (relleno con texto oscuro) | `#FFB020` |
| Barras de presupuesto: relleno / pista | `#F3EEEE` / `#2E2424` |

- **Modo claro:** debe existir y verse hermano del oscuro (mismo diseño, fondo claro cálido, rojo de marca `#C0261B` o similar que pase contraste, ganancia y pérdida bien distinguibles del rojo de marca). El selector Automático / Claro / Oscuro se mantiene.
- **Tipografía:** *Chakra Petch* (500, 600, 700) para títulos, etiquetas y texto; *JetBrains Mono* (400, 600, 700) para todas las cifras. Solo Google Fonts por `<link>` (único origen permitido). Si en las capturas Chakra Petch resulta difícil de leer en párrafos largos (Resumen de mercado, Revisión con Claude), usa *Atkinson Hyperlegible* solo para esos bloques.
- **Marca:** `CENTINELA` en mayúsculas con espaciado, y una barra inclinada `/` en el rojo de marca. Sin emojis; iconos como SVG de trazo.

## Cómo se aplica

1. **Todas las pestañas**, no solo Hoy: Hoy, Capturas (incluido "Ya estoy dentro" y su bloque de acción), Operar, Abiertas, Diario, Ajustes, formularios, tablas, avisos y botones. Ninguna pestaña puede quedar con el aspecto anterior.
2. **Hoy (tablero)**, mantén la estructura de v3.3 y aplícale esto:
   - **Semáforo** como bloque sólido y grande, siempre con icono y palabra: verde (menta `#8FE3B0` con texto oscuro), ámbar (`#FFB020` con texto oscuro) y rojo ("NO OPERES": relleno `#D7261B`, texto blanco, icono de alto). Nunca solo color.
   - **Ventana de sesión:** etiqueta `VENTANA ACTUAL` y una píldora BUENA / REGULAR / MALA (menta / ámbar / rojo de marca, siempre con la palabra). Debajo, una **barra segmentada del día** generada desde la constante `VENTANAS`, con los tramos coloreados por nivel y una marca fina en la hora actual. Esa barra es una función pura (por ejemplo `segmentosVentana(ts)`) con pruebas.
   - **Presupuestos:** tarjetas con cifra grande en la fuente de datos y barra blanca. Si la lógica ya marca ámbar o rojo (cercanía o superación del tope), la barra toma `#FFB020` o `#FF5A4E`.
   - **Abiertas:** una fila por posición; el resultado en R lleva signo y flecha (▲ / ▼).
   - **Resultados de la semana:** cifra grande y curva; línea clara, puntos de ganancia y pérdida con los colores del sistema.
   - **Barra de pestañas:** la activa va con relleno `#D7261B` y texto blanco; todas con etiqueta visible.
   - **Botones:** el principal es claro con texto oscuro; el secundario con borde; el destructivo en rojo.
3. **Ganancias y pérdidas nunca se distinguen solo por color:** todo importe y todo R llevan signo (+ / −) y, donde cabe, ▲ / ▼. Vale para Hoy, Abiertas, Diario y Capturas.

## Arreglos pendientes de la revisión de v3.3 (incluidos aquí)

1. En "Ventana actual", el motivo salta de línea dejando un guion suelto: acomódalo para que no ocurra a 390 px.
2. En Capturas, el selector de dirección corta el texto "Que decida Claude" a 390 px: que se lea completo.
3. En Hoy hay dos cifras de la semana que parecen contradecirse (la del semáforo suma el parcial de TP1 de una posición todavía abierta; la curva cuenta solo cerradas). Aclara las etiquetas ("Realizado en la semana, con parciales" frente a "Operaciones cerradas") sin cambiar ningún cálculo.

## Criterios de terminado

1. `npm test` pasa completo: las 501 pruebas actuales más las nuevas. **No borres ni debilites ninguna prueba.** Si un cambio legítimo (un id, un texto del título) obliga a actualizar una, actualízala conservando lo que verifica y dilo en el resumen.
2. Pruebas nuevas para:
   - el nombre: el `<title>` y la cabecera dicen "Centinela" y no queda "Panel de Trading" en ningún texto visible;
   - los tokens: los pares de variables de claro y oscuro pasan contraste (texto 4,5:1, controles 3:1) con los valores nuevos;
   - `segmentosVentana`: tramos, marca de la hora actual, día feriado, fin de semana y cierre temprano;
   - signo y flecha en importes y R de Hoy, Abiertas y Diario;
   - el semáforo en sus tres estados, siempre con icono y palabra;
   - ninguna pestaña con scroll horizontal, en claro y oscuro, a 360, 390, 768 y 1280 px.
3. Capturas con Playwright de las **cinco pestañas en oscuro y en claro a 390 px**, y de Hoy a 1280 px, en `revision-visual/` (reemplaza las anteriores). Mira cada una y corrige lo que se vea mal antes de dar la tarea por terminada.
4. Sin cambios en la forma de los datos guardados, en reglas ni en llamadas a `claude.use`. El modo local sigue funcionando.
5. Entrega `panel-trading.html` en la rama **`tarea-2b-centinela`**, con un resumen de 5 líneas, cuántas pruebas pasan, lo que Johannes debe comprobar a mano en su panel real y las ideas que viste y no hiciste.
