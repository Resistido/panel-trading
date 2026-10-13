# Instrucciones para cualquier sesión en este repositorio

Proyecto: Panel de Trading, una app web de una sola página (`panel.html`). Dueño: Johannes.

## Idioma y estilo

- Escribe en español claro y directo, tanto las respuestas como la documentación.
- Distingue lo verificado de lo supuesto. No inventes datos, precios ni capacidades de plataformas.
- Si un pedido choca con una regla de abajo, dilo y no lo implementes.

## Reglas de riesgo no negociables (nunca debilitarlas en el código)

1. El stop inicial (SL1) nunca se aleja de la entrada. Solo puede moverse a favor.
2. El SL2 se usa después de TP1 y también solo se mueve a favor.
3. Los presupuestos diario y semanal suman las pérdidas realizadas y el riesgo abierto. Una ganancia nunca compensa una pérdida para liberar presupuesto.
4. Cada objetivo (TP) debe cumplir el beneficio/riesgo mínimo configurado. Hoy es 1,5.
5. Antes de registrar una operación se exige el precio real del broker.
6. No se entra a menos de 30 minutos de un dato de alto impacto. No se operan acciones en after-hours vía CFD.
7. El "nivel de seguridad" mide cuánto cumple el setup los criterios, no la probabilidad de ganar, y la pantalla debe decirlo.
8. Nunca sugerir promediar a la baja ni ampliar el stop de una posición perdedora. (Regla recomendada por Claude; Johannes puede borrarla si no la comparte.)

## Forma de trabajar

- Separa el núcleo de los adaptadores. El núcleo son los cálculos, las reglas y la lectura de señales, escritos como funciones puras que no tocan la página. Los adaptadores son lo que depende de la plataforma: guardar datos, leer capturas con IA y la interfaz.
- Todo cambio en el núcleo va con pruebas automáticas en Node, sin dependencias externas si se puede. Corre las pruebas antes de entregar.
- `panel.html` se publica como artefacto de Claude. Por eso solo puede cargar scripts de cdnjs.cloudflare.com, cdn.jsdelivr.net/npm, unpkg.com, cdn.tailwindcss.com y code.jquery.com, y no puede pedir datos a otros dominios salvo por conectores. Respeta esas restricciones en ese archivo.
- La página usa `claude.use(...)` para su base de datos, el usuario, las descargas y la lectura de imágenes. No rompas el "modo local", que calcula sin guardar cuando la página se abre fuera de Claude.
- No borres funciones existentes sin avisarlo en el resumen.
- Al terminar, resume en 5 líneas qué cambió y qué falta.
