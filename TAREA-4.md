# Tarea 4: Señales (bandeja), modo práctica y pestañas nuevas

Una sola tarea. **No cambies reglas de riesgo, cálculos de tamaño ni presupuestos** (salvo excluir las operaciones de práctica, que es parte de la tarea). Si ves algo útil que no está aquí, anótalo en el resumen final y no lo hagas.

## Punto de partida

- Johannes fusiona la Tarea 3 (v3.5) en `main` antes de lanzar esta. Comprueba que `main` la tiene: `grep -c "proximidadMacro" panel-trading.html` debe dar más de 0 y `npm test` debe pasar completo. Si es así, crea tu rama desde `main`: `git checkout -b tarea-4-senales origin/main`. Si no, parte de `origin/tarea-3-protecciones` y dilo en el resumen.
- Lee `CLAUDE.md` entero. Al terminar actualízalo (versión 3.6, nombres de pestañas, conteo de pruebas, la regla nueva de práctica).
- **Diseño de referencia:** `diseno-senales.png` y `diseno-buscar.png` en la raíz del repositorio (dibujos con datos de ejemplo). Míralos antes de empezar. Respeta la estructura, los textos y los estados; el sistema visual es el de Centinela que ya existe (variables CSS, claro y oscuro).

## 1. Pestañas

- Siguen siendo cinco. Cambian solo los **nombres visibles y los iconos**: Hoy · **Buscar** (antes Capturas) · **Señales** (antes Operar) · Abiertas · Diario. Icono de Buscar: lupa; de Señales: bandeja (ver diseño).
- **No cambies los identificadores internos** (`data-tab`, ids de paneles) para no romper pruebas ni la pestaña recordada. Actualiza solo lo que el usuario ve, y las pruebas que comprueban esos textos.
- Buscar conserva todo lo de Capturas ("Busco entrada" y "Ya estoy dentro"). La búsqueda con Claude llega en una tarea posterior: no pongas nada de eso todavía.

## 2. Bandeja de señales (arriba de la pestaña Señales)

**Entrada de señales**
- Reemplaza el cuadro actual "Pegá la señal de ChatGPT" por el bloque **Agregar señales** del diseño: un cuadro de texto, un selector "¿De dónde viene?" (ChatGPT, Claude, Propia, Otra; por defecto ChatGPT) y dos botones: **Leer señales** y **Subir captura**.
- **Leer señales** usa `parseSenales` (ya lee varias señales a la vez). Cada señal leída se guarda con `guardarSenal` en la colección `senales` con estado nuevo `'nueva'` y el campo nuevo `fuente`. Si se pega dos veces la misma señal (mismo día, activo, dirección, entrada y SL1), no se duplica: se avisa.
- **Subir captura** (la captura del mensaje que trae la señal, no un gráfico): una llamada `SAMPLE.json` que **transcribe** lo que se lee y no inventa nada. Campos que no se ven: `null`, y la tarjeta muestra "Faltan datos: …". Concentra la llamada en una función con nombre claro y comentario `/* PLATAFORMA */`.

**Tarjeta de cada señal** (como en el diseño)
- Activo, dirección, fuente y origen ("ChatGPT · Radar"), hora y antigüedad, tipo (límite o market), entrada, SL1, TP1 y TP2, beneficio/riesgo del TP1 y del TP2, nivel y unidades calculadas.
- **Estado** con icono y palabra, nunca solo color, calculado por una función pura nueva `estadoSenal(senal, estado, cfg, ts, extras)` construida sobre `calcular` (sin precio actual):
  - **Rojo — "No se puede operar ahora"**: condiciones del momento. Topes alcanzados, sin presupuesto, máximo de operaciones del día, sin margen, dato macro cerca (`proximidadMacro`), pausa activa (`estadoPausa`) o Wall Street cerrado (el mismo criterio que usa el semáforo de Hoy). Dice el motivo y, si se sabe, hasta cuándo.
  - **Ámbar — "Revisala antes de operar"**: problemas de la señal. Beneficio/riesgo por debajo del mínimo, niveles incoherentes, número ambiguo, nivel no reconocido o faltan datos.
  - **Verde — "Cumple tus reglas"**: ningún bloqueo. El bloqueo "precio de Quantfury no verificado" no cuenta para el color: en su lugar, toda tarjeta muestra la línea "Mirá el precio en Quantfury antes de entrar", y si la señal tiene más de 15 minutos, "Señal de hace X min: …".
  - Si hay rojo y ámbar a la vez, se muestra el rojo y debajo los motivos ámbar.
- **Botones**:
  - **Operar** (en ámbar dice **Ajustar niveles**) carga la señal en la calculadora existente con `cargarSenal`. La calculadora sigue exigiendo el precio real de Quantfury.
  - **Practicar** crea una operación de práctica (punto 3).
  - **Descartar** la marca `'descartada'`, con un motivo opcional de un toque (No me convence, Llegué tarde, Rompe reglas, Otro).
  - En rojo, Operar queda deshabilitado con el motivo ("Operar a las 14:30" cuando se sabe la hora).
- **Filtros**: Nuevas (estado `'nueva'` o `'vista'` del día de hoy en Nueva York) · Practicando · Descartadas. Las señales viejas sin decidir no aparecen en Nuevas, pero siguen en Comprobar señales. Tampoco aparecen en Nuevas los análisis de capturas que recomendaron no operar (sin entrada ni SL1).
- **Compatibilidad**: las señales guardadas con estado `'vista'` u `'operada'` siguen funcionando, y el comprobador de señales no cambia. `'practicada'` y `'descartada'` son estados nuevos.

## 3. Modo práctica

- **Practicar** crea una operación con el campo nuevo `practica: true`, con las unidades que calcula `calcular` a la entrada de la señal. No exige precio de Quantfury.
- **Regla nueva no negociable:** una operación de práctica **nunca** cuenta en presupuestos, semáforo, operaciones del día, margen, pausa tras rachas, curva de la semana, resultados reales del Diario ni en el estado que se copia para ChatGPT. Hazlo en `estadoDe` y en cada lugar que lea operaciones, con pruebas explícitas para cada uno.
- En **Abiertas**, las de práctica llevan el chip **PRÁCTICA** y se gestionan y cierran igual que las reales (el precio de cierre lo escribe Johannes).
- En **Diario**, un selector **Real | Práctica** (por defecto Real) separa las listas y los números. Las estadísticas completas llegan en la tarea siguiente: aquí basta con que los totales actuales respeten el selector.
- Añade a `CLAUDE.md` la regla: "Las operaciones de práctica nunca cuentan en presupuestos ni resultados reales".

## 4. Fuente de cada señal y operación

- Campo nuevo `fuente` (`'ChatGPT'`, `'Claude'`, `'Propia'`, `'Otra'`) en señales y operaciones, copiado de la señal al operar o practicar. Las señales del lector de capturas de gráficos llevan `'Claude'`. Los datos viejos sin `fuente` se leen como "Sin dato" (no los modifiques).
- Sirve para que la tarea siguiente compare qué fuente acierta más. Aquí solo se guarda y se muestra en las tarjetas.

## Criterios de terminado

1. `npm test` pasa completo: todas las pruebas actuales más las nuevas. **No borres ni debilites ninguna prueba.** Si un texto de pestaña obliga a actualizar una, conserva lo que verifica y dilo.
2. Pruebas nuevas (`test-senales.js`, añadido a `npm test`):
   - `estadoSenal` en verde, ámbar y rojo, con cada motivo de la lista y siempre con icono y palabra;
   - lectura de varias señales y no duplicar;
   - captura del mensaje con `SAMPLE.json` simulado: campos faltantes quedan en `null` y la tarjeta lo dice;
   - práctica excluida de presupuestos, semáforo, operaciones del día, margen, pausa, curva, Diario real y estado para ChatGPT;
   - compatibilidad con señales `'vista'` y `'operada'`;
   - cinco pestañas con los nombres nuevos;
   - sin scroll horizontal a 360, 390, 768 y 1280 px, en claro y en oscuro.
3. Capturas con Playwright en `revision-visual/`, en oscuro y claro a 390 px: Señales con tres tarjetas (verde, ámbar y rojo), Abiertas con una operación de práctica y Diario en Práctica. Compáralas con `diseno-senales.png` y corrige lo que se aleje sin motivo.
4. Sin cambios en reglas, cálculos de tamaño ni llamadas a `claude.use` ya presentes. El modo local sigue funcionando.
5. Entrega `panel-trading.html` en la rama **`tarea-4-senales`**, con un resumen de 5 líneas, cuántas pruebas pasan (y si las pruebas de GitHub pasaron), qué debe comprobar Johannes a mano (pegar una señal real de ChatGPT, subir la captura de un mensaje, practicar una y ver que no toca el presupuesto) y las ideas que viste y no hiciste.
