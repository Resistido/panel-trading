# Instrucciones para cualquier sesión en este repositorio

Proyecto: **Centinela**, el panel de trading de Johannes: una app de una sola página (`panel-trading.html`, el archivo conserva ese nombre) que vive como artefacto de Claude. Versión actual: 3.7 (Diario en tres partes: Operaciones, Estadísticas y Revisión; estadísticas con explicación de cada término; "¿Quién acierta más?" por fuente; revisiones semanales guardadas y listadas. Sobre las señales y la práctica de 3.6, las protecciones de 3.5, la identidad Centinela de 3.4, el tablero de Hoy, el modo oscuro y el modo "Ya estoy dentro"). Johannes opera CFD manualmente en Quantfury; el panel nunca ejecuta órdenes.

## Identidad visual (Centinela)

- Nombre visible: "Centinela" (cabecera `/CENTINELA`, `<title>`, pie). No vuelvas a escribir "Panel de Trading" en textos visibles; solo queda como dato `panel` del respaldo JSON.
- Colores solo como variables en `:root` (claro) y sus equivalentes oscuros; nada de colores sueltos. Rellenos con texto encima: `--brand-fill`/`--brand-ink`, `--gain-fill`/`--gain-ink`, `--warn-fill`/`--warn-ink`, `--btn-bg`/`--btn-ink`.
- Tipografías: Chakra Petch (títulos y texto), JetBrains Mono (cifras) y Atkinson Hyperlegible solo en párrafos largos (`.prose`). Solo Google Fonts.
- Ganancias y pérdidas nunca solo por color: el signo va en el texto y la flecha ▲/▼ con la clase `res` (usá `resultadoHtml`).

## Idioma y estilo

- Escribe en español claro y directo. Los textos de la app usan el mismo tono que ya tienen (voseo: "tocá", "elegí").
- Distingue lo verificado de lo supuesto. No inventes precios, datos ni capacidades.
- Si un pedido choca con una regla de abajo, dilo y no lo implementes.

## Reglas de riesgo no negociables

1. El SL1 nunca se aleja de la entrada; solo puede moverse a favor.
2. El SL2 se usa después de TP1 y también solo se mueve a favor.
3. Los presupuestos diario y semanal suman pérdidas realizadas y riesgo abierto. Una ganancia nunca compensa una pérdida.
4. Cada TP cumple el beneficio/riesgo mínimo configurado (hoy 1,5).
5. Antes de registrar se exige el precio real de Quantfury.
6. No se entra a menos de 30 minutos de un dato de alto impacto; no se operan acciones en after-hours vía CFD.
7. El puntaje de seguridad mide cumplimiento de criterios, no probabilidad de ganar, y la pantalla lo dice.
8. Nunca sugerir promediar a la baja ni ampliar el stop de una posición perdedora.
9. Niveles de riesgo: Cauteloso $10, Moderado $18, Estándar $27, Alta convicción $36. Un nivel desconocido nunca se supone: se carga el más bajo y se avisa.
10. Las operaciones de práctica nunca cuentan en presupuestos ni resultados reales: ni en el semáforo, las operaciones del día, el margen, la pausa tras rachas, la curva de la semana, el Diario real ni el estado que se copia para ChatGPT. Se filtran en `estadoDe` (con `soloReales`) y en cada lugar que lee operaciones.

## Protecciones (v3.5): avisan y frenan, nunca inventan datos

- Calendario macro manual (tarjeta "Datos macro" en Hoy, hora de Bolivia UTC−4 fija). Con un dato a menos de 30 min (antes o después) la casilla macro de la calculadora (pestaña Señales) no se puede marcar y el botón de registrar queda deshabilitado con el motivo. Si el calendario de hoy está vacío, el panel dice "No cargaste datos macro" y nunca "no hay datos macro".
- Pausa tras rachas: `PAUSA_RACHA = { perdidasSeguidas: 2, minutos: 30 }` y `AVISO_MITAD = 0.5`, constantes en un solo lugar (no en `cfg`). La pausa deshabilita registrar; el aviso de la mitad es solo texto.
- Aviso de fin de semana el último día hábil de Wall Street (hora de NY). Nunca bloquea y no da montos ni dice si el broker cobra swap.
- Ninguna protección cambia el semáforo ni los presupuestos. "Ya entré igual" siempre sigue disponible y anota la protección como regla rota.

## Señales y práctica (v3.6)

- Pestañas: Hoy · Buscar (antes Capturas: "Busco entrada" y "Ya estoy dentro") · Señales (antes Operar: bandeja arriba y la calculadora debajo) · Abiertas · Diario. Los identificadores internos no cambiaron: `data-tab` y paneles `analizar` y `operar`.
- Bandeja: "Leer señales" usa `parseSenales` y guarda cada señal con `guardarSenal` (estado `'nueva'`, campo `fuente`: ChatGPT, Claude, Propia u Otra). La misma señal (mismo día de Nueva York, activo, dirección, entrada y SL1) no se duplica: se avisa. "Subir captura" transcribe la captura de un mensaje con `transcribirCapturaSenal`; lo que no se ve queda en `null` y la tarjeta dice "Faltan datos".
- `estadoSenal` (sobre `calcular`, sin precio actual): rojo "No se puede operar ahora" (condiciones del momento: topes, presupuesto, operaciones del día, margen, dato macro, pausa, Wall Street cerrado), ámbar "Revisala antes de operar" (problemas de la señal) y verde "Cumple tus reglas". "Precio de Quantfury no verificado" no cuenta para el color: toda tarjeta pide mirar el precio. Siempre icono y palabra.
- Operar (en ámbar "Ajustar niveles") carga la señal en la calculadora, que sigue exigiendo el precio de Quantfury; en rojo queda deshabilitado con el motivo. Practicar crea una operación con `practica: true` y las unidades de `calcular`, sin precio de Quantfury (en rojo se puede practicar). Descartar marca `'descartada'` con un motivo opcional.
- Estados de una señal: `'nueva'` y `'vista'` (en Nuevas si son de hoy en Nueva York), `'operada'`, `'practicada'` y `'descartada'`. Las viejas sin decidir siguen en Comprobar señales. Los datos viejos sin `fuente` se leen como "Sin dato" y no se reescriben.

## Diario en tres partes (v3.7)

- Arriba del Diario, el selector Operaciones | Estadísticas | Revisión (`name="d-parte"`, contenedores `#d-operaciones`, `#d-estadisticas` y `#d-revision`; la parte elegida va en rojo de marca, como la pestaña activa). Debajo siguen Real | Práctica y el período (Esta semana, Este mes, Todo), que valen para las tres partes.
- Operaciones: un resumen corto (operaciones y resultado, con mejor y peor), Comprobar señales, la lista, CSV, respaldo y Reglas y ajustes.
- Estadísticas: con menos de `MIN_CONCLUSION` (20) cerradas, aviso ámbar "Pocos datos" con el texto de `avisoPocas`. Seis tarjetas (dos columnas en el celular), cada término con su explicación en una línea: promedio por operación en R, ganadas (las de cero van aparte), factor de beneficio (sin pérdidas dice "Sin pérdidas todavía", nunca infinito), caída máxima en R (en orden de cierre), racha actual con la mejor y la peor (una en cero no suma ni corta, igual que la pausa) y total del período en R y en dólares. Después: "¿Quién acierta más?" (por fuente y ChatGPT por origen), "Por ventana de sesión" (BUENA, REGULAR, MALA según la hora de entrada, barras divergentes desde el cero con signo y flecha), "Fuera de tu plan" (reglas rotas o fuera del plan, cada una una vez, y el promedio sin ellas) y "Más detalle" con las tablas de `VER_POR` (las de antes más Fuente y Ventana de sesión). Sin operaciones, un mensaje en vez de ceros.
- Práctica: las mismas estadísticas solo con las de práctica; nunca se mezclan con las reales. La revisión con Claude es solo de lo real: en Práctica, la parte Revisión lo explica y no ofrece pedirla.
- Revisión: "Pedir revisión de esta semana / de este mes / de todo el diario" manda a Claude los datos de siempre más las métricas, la tabla por fuente y la de ventanas (`datosRevisionDe`), con la regla de menos de 20 ("primeras señales"). Se guarda con `guardarRevision` en la misma forma de siempre (`{ ts, periodo, semana, texto }`). La última se muestra arriba y las anteriores abajo, por semana, la más nueva primero, cada una desplegable (se recuerda cuáles abriste). Se leen las últimas 52.

## Restricciones técnicas

- El archivo se publica como artefacto de Claude. Solo puede cargar scripts de cdnjs.cloudflare.com, cdn.jsdelivr.net/npm, unpkg.com, cdn.tailwindcss.com y code.jquery.com, y no puede pedir datos a otros dominios.
- Usa `claude.use('db')`, `'user'`, `'downloads'` y `'sample'` (lectura de imágenes con IA). No cambies esas llamadas ni la forma de los datos guardados: los datos reales de Johannes viven en esa base.
- Colecciones: `trades`, `config/main`, `senales`, `resumenes`, `revisiones` y, desde v3.5, `eventos` (un documento por dato macro: `ts` en milisegundos y `nombre`; el id es el del documento).
- Campos nuevos de v3.6 (todos opcionales; lo viejo sigue leyéndose igual): en `trades`, `fuente` y `practica` (solo cuenta si es exactamente `true`); en `senales`, `fuente`, `nivelDudoso`, `nivelTxt`, `amb` y `txt` (el texto de los números ambiguos), `orden` (posición dentro de un mismo pegado), `descarte` (`{ ts, motivo }`) y los estados `'nueva'`, `'practicada'` y `'descartada'`. El CSV del diario suma la columna `practica` al final.
- Si la página se abre fuera de Claude entra en "modo local" (calcula sin guardar). No lo rompas.
- Mantén las cinco pestañas (Hoy, Buscar, Señales, Abiertas, Diario) y que no haya scroll horizontal a 390 px de ancho.
- Esta sesión no puede publicar el artefacto. Entrega el archivo en una rama; Johannes lo publica después.

## Portabilidad (el panel puede migrar después a otra plataforma)

- Toda la lógica de reglas, cálculo, validación y lectura de señales debe ser funciones puras, sin tocar el DOM ni `claude.*`, y estar cubierta por pruebas. Es lo que se conserva en una migración.
- Funciones puras de las protecciones (v3.5): `proximidadMacro`, `textoMacro`, `instanteBolivia`, `nuevoEvento`, `eventosVisibles`, `avisoFinDeSemana`, `estadoPausa`, `avisoMitad` y `bloqueosProteccion`. Las que tocan la plataforma: `escucharEventos`, `guardarEvento`, `quitarEvento` y `borrarSenal` (marcadas `/* PLATAFORMA */`).
- Funciones puras de señales y práctica (v3.6): `estadoSenal`, `claveSenal`, `senalRepetida`, `docSenal`, `senalComoOpcion`, `faltanDatos`, `inpDeSenal`, `filtrarSenales`, `practicaDeSenal`, `promptCapturaSenal`, `normalizarCapturaSenal`, `esPractica` y `soloReales`. Las que tocan la plataforma: `guardarSenal` y `transcribirCapturaSenal` (pasa por `pedirJsonConCapturas`).
- Funciones puras de estadísticas y revisión (v3.7): `estadisticas` (extendida: factor, caída, rachas, fuera del plan), `agrupar` (extendida: perdidas y en cero) con `VER_POR` (más `fuente` y `ventana`), `signoResultado`, `enOrdenDeCierre`, `avisoPocas`, `filaDe`, `quienAcierta`, `porVentana`, `nivelVentanaDe`, `revisionesPorSemana`, `datosRevisionDe` y `promptRevision`. `datosRevision(per)` solo junta los datos del período y llama a `datosRevisionDe`. Ojo: `VER_POR.nivel` lee `S.cfg.niveles` (venía así).
- No agregues llamadas nuevas a `claude.use(...)`, `TRADES`, `SENALES` ni `SAMPLE` repartidas por el código. Usa las funciones existentes (`guardarTrade`, `actualizar`, `actualizarSenal`, `SAMPLE.json`, `ofrecerArchivo`) o crea una función con nombre claro que concentre la llamada.
- Si una función nueva necesita la plataforma (guardar, IA, descargar), anótala en un comentario `/* PLATAFORMA: ... */` para poder listarlas todas con un grep.
- No hagas refactors de portabilidad que no estén en la tarea. Si ves uno necesario, propónlo en el resumen final.

## Pruebas

- Instalación: `npm install` y luego `npx playwright install chromium`.
- Correr todo: `npm test`. Hoy pasan 1030 pruebas: 219 originales, 33 de niveles (con reloj fijo en horario de Wall Street: la señal se carga desde su tarjeta), 106 de "Ya estoy dentro" (`test-gestion.js`), 143 del tablero, la ventana de sesión, el tema y el contraste (`test-tablero.js`), 69 de la identidad Centinela (`test-centinela.js`: nombre, tokens y contraste, barra del día, signos y flechas, semáforo, desborde), 142 de las protecciones (`test-proteccion.js`: calendario macro, fin de semana, pausa, mitad, bloqueo con "Ya entré igual", borrar señales, modo local, desborde y contraste) 193 de señales y práctica (`test-senales.js`: `estadoSenal` en verde, ámbar y rojo con cada motivo, leer y no duplicar, captura del mensaje con `SAMPLE.json` simulado, práctica fuera de todo lo real, compatibilidad, pestañas, modo local, desborde, contraste y portabilidad) y 125 de estadísticas y revisión (`test-estadisticas.js`: métricas con cuentas a mano en cero, todas ganadas, empates, parciales, caída y rachas; tablas por fuente y por ventana; aviso de menos de 20; Real y Práctica separadas; selector de tres partes; revisión guardada y listada; modo local; desborde a 360/390/768/1280 en claro y oscuro; contraste y portabilidad). Los datos de ejemplo de las estadísticas están en `datos-estadisticas.js`, con las cuentas en comentarios.
- Reloj de las pruebas: para adelantar la hora usá `adelantar(pg, '46:00')` de `reloj-pruebas.js`, nunca `pg.clock.fastForward` directo. En Playwright 1.56 el reloj falso tiene una carrera: si el salto coincide con temporizadores de la página (los avisos del simulador después de guardar), la hora puede volver atrás. `adelantar` salta y fija la hora con `setFixedTime`. Para esperar a que la página reciba todos los avisos del simulador después de sembrar datos: `await pg.evaluate(() => new Promise(r => setTimeout(r, 0)))` (el reloj los dispara en orden de creación). Antes de comprobar un estado, esperalo (`waitForFunction`) en vez de dormir un tiempo fijo.
- GitHub corre las pruebas solo: `.github/workflows/pruebas.yml` ejecuta `npm test` en cada push a cualquier rama y en cada pull request, y guarda `revision-visual/` como artefacto. Mirá que esa ejecución esté en verde antes de dar algo por terminado.
- Capturas para revisión visual: `npm run capturas` (guarda en `revision-visual/`; incluye Hoy con dato macro cerca, con pausa y con aviso de fin de semana, la calculadora de Señales bloqueada, Señales con tarjetas verde y ámbar, Señales en rojo, Abiertas con una práctica, Diario en Práctica, Estadísticas con menos y con más de 20 operaciones, Estadísticas en Práctica y Revisión con dos revisiones guardadas).
- Todo cambio va con pruebas nuevas, y las existentes deben seguir pasando.
- Nunca borres, debilites ni saltes una prueba existente para que pase. Si un cambio legítimo (por ejemplo un id de elemento que cambia en el rediseño) obliga a actualizar una prueba, actualízala conservando lo que verifica y dilo en el resumen final.
- No subas al repositorio los archivos que generan las pruebas (test-page.html, test-*-page.html, resultado-*.json, shot-*.png): agrégalos a un `.gitignore`.

## Al terminar

Resume en 5 líneas qué cambió, cuántas pruebas pasan y qué tiene que comprobar Johannes a mano en el panel real (por ejemplo, la lectura de capturas con imágenes de verdad).
