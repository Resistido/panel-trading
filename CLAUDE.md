# Instrucciones para cualquier sesión en este repositorio

Proyecto: **Centinela**, el panel de trading de Johannes: una app de una sola página (`panel-trading.html`, el archivo conserva ese nombre) que vive como artefacto de Claude. Versión actual: 3.4 (identidad visual Centinela sobre el tablero de Hoy, el modo oscuro y el modo "Ya estoy dentro"). Johannes opera CFD manualmente en Quantfury; el panel nunca ejecuta órdenes.

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

## Restricciones técnicas

- El archivo se publica como artefacto de Claude. Solo puede cargar scripts de cdnjs.cloudflare.com, cdn.jsdelivr.net/npm, unpkg.com, cdn.tailwindcss.com y code.jquery.com, y no puede pedir datos a otros dominios.
- Usa `claude.use('db')`, `'user'`, `'downloads'` y `'sample'` (lectura de imágenes con IA). No cambies esas llamadas ni la forma de los datos guardados: los datos reales de Johannes viven en esa base.
- Si la página se abre fuera de Claude entra en "modo local" (calcula sin guardar). No lo rompas.
- Mantén las cinco pestañas (Hoy, Capturas, Operar, Abiertas, Diario) y que no haya scroll horizontal a 390 px de ancho.
- Esta sesión no puede publicar el artefacto. Entrega el archivo en una rama; Johannes lo publica después.

## Portabilidad (el panel puede migrar después a otra plataforma)

- Toda la lógica de reglas, cálculo, validación y lectura de señales debe ser funciones puras, sin tocar el DOM ni `claude.*`, y estar cubierta por pruebas. Es lo que se conserva en una migración.
- No agregues llamadas nuevas a `claude.use(...)`, `TRADES`, `SENALES` ni `SAMPLE` repartidas por el código. Usa las funciones existentes (`guardarTrade`, `actualizar`, `actualizarSenal`, `SAMPLE.json`, `ofrecerArchivo`) o crea una función con nombre claro que concentre la llamada.
- Si una función nueva necesita la plataforma (guardar, IA, descargar), anótala en un comentario `/* PLATAFORMA: ... */` para poder listarlas todas con un grep.
- No hagas refactors de portabilidad que no estén en la tarea. Si ves uno necesario, propónlo en el resumen final.

## Pruebas

- Instalación: `npm install` y luego `npx playwright install chromium`.
- Correr todo: `npm test`. Hoy pasan 570 pruebas: 219 originales, 33 de niveles, 106 de "Ya estoy dentro" (`test-gestion.js`), 143 del tablero, la ventana de sesión, el tema y el contraste (`test-tablero.js`) y 69 de la identidad Centinela (`test-centinela.js`: nombre, tokens y contraste, barra del día, signos y flechas, semáforo, desborde).
- Capturas para revisión visual: `npm run capturas` (guarda en `revision-visual/`).
- Todo cambio va con pruebas nuevas, y las existentes deben seguir pasando.
- Nunca borres, debilites ni saltes una prueba existente para que pase. Si un cambio legítimo (por ejemplo un id de elemento que cambia en el rediseño) obliga a actualizar una prueba, actualízala conservando lo que verifica y dilo en el resumen final.
- No subas al repositorio los archivos que generan las pruebas (test-page.html, test-niveles-page.html, resultado-*.json, shot-*.png): agrégalos a un `.gitignore`.

## Al terminar

Resume en 5 líneas qué cambió, cuántas pruebas pasan y qué tiene que comprobar Johannes a mano en el panel real (por ejemplo, la lectura de capturas con imágenes de verdad).
