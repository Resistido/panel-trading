# Encargo: diseñar la v4 del Panel de Trading

Fecha: 13 de octubre de 2026. Modelo sugerido: Fable 5.1.
**Esta sesión es solo de diseño: no modifiques `panel.html` ni escribas código.**

## Qué tienes que entregar

Un archivo `SPEC.md` en la raíz del repositorio, en español, con la estructura de la última sección. Súbelo a una rama nueva. Las reglas de `CLAUDE.md` son obligatorias también en el diseño.

## Contexto

`panel.html` es la v3, una app de una sola página publicada como artefacto de Claude, de unas 1.940 líneas. Tiene cinco pestañas:

- **Hoy:** veredicto del día y presupuestos de riesgo.
- **Capturas:** Claude lee capturas del gráfico, propone entrada, stop y objetivos, y da un puntaje de seguridad.
- **Operar:** calculadora y registro de la operación, a partir de una señal pegada o de datos a mano.
- **Abiertas:** seguimiento de las posiciones abiertas.
- **Diario:** estadísticas, revisión con Claude, comprobación de señales y exportación.

Usa capacidades del entorno de Claude (`claude.use`): base de datos, usuario, descargas y `sample` para leer imágenes. Fuera de Claude funciona en "modo local", que calcula pero no guarda ni lee capturas.

El dueño opera CFD de acciones de EE. UU., cripto y materias primas en Quantfury, con apalancamiento. Recibe señales de tareas programadas de ChatGPT y las pega en la pestaña Operar.

## Lo que quiere el dueño (resumido)

- Pasar de panel a la aplicación de trading más completa posible.
- Escribir un ticker y que la app proponga entrada, SL y TP si todavía no entró.
- Si ya entró, que lo ayude a gestionar la posición.
- Conectarse con el gráfico de TradingView, si se puede.
- Que no sea solo para él: que otras personas puedan usarla.
- Poder replicarla en ChatGPT Sites.

## Fallas conocidas

1. Capturas no distingue "busco entrada" de "ya estoy dentro". Con una operación ya abierta, igual propone una entrada nueva.
2. (Johannes: agrega aquí otras fallas, cada una con qué hiciste, qué esperabas y qué pasó.)

## Hechos verificados al 13-oct-2026

Úsalos y no los contradigas sin evidencia.

- **Artefactos de Claude:** solo cargan scripts de cdnjs, jsDelivr (/npm/), unpkg, el CDN de Tailwind y el de jQuery. Las peticiones de red solo llegan al propio origen. Los datos externos entran solo por conectores de la cuenta de quien abre la página.
- **Widgets de TradingView:** son iframes con los datos incluidos, que se insertan pegando un script de TradingView.
- **Lightweight Charts:** es de código abierto (Apache 2.0) y no trae datos ni indicadores.
- **Advanced Charts:** su licencia gratuita es solo para empresas en proyectos web públicos, no para uso personal.
- **Webhooks de TradingView:** las alertas por webhook requieren un plan pago y un servidor que las reciba.
- **API de TradingView:** no se encontró una forma oficial de leer los gráficos o dibujos de un usuario.
- **ChatGPT Sites:** está en beta pública para Plus y Pro. Crea webs y apps livianas con formularios, inicio de sesión y almacenamiento, con límites de uso. La ayuda oficial no aclara si un Site puede ejecutar código propio o llamar a modelos de IA.
- **Uso del plan de ChatGPT en apps externas:** la opción de que una app use el plan de ChatGPT del visitante es solo para socios aprobados.
- **Competencia:** existen diarios de trading consolidados, por ejemplo Edgewonk, TraderSync y Tradervue.

## Estructura de SPEC.md

1. **Resumen en 10 líneas:** qué es la v4 y qué no es.
2. **Dos productos separados:** (a) la v4 para el dueño y (b) una versión para terceros. Para cada uno, indica usuarios, problema que resuelve y alcance mínimo.
3. **Flujos principales, paso a paso:**
   - **Busco entrada:** parte del ticker. Si no hay capturas, la app dice cuáles tomar: diario de 6 a 9 meses, 4H de 4 a 6 semanas y 15 minutos de las últimas 2 o 3 sesiones.
   - **Ya estoy dentro:** con la entrada, las unidades, el stop actual y el precio actual, la app propone mantener, mover el stop a favor, tomar un parcial o salir. Nunca amplía el stop.
   - Pegar una señal, registrarla, cerrarla y que pase al diario.
4. **Arquitectura:** un núcleo portable de funciones puras más adaptadores por plataforma (artefacto de Claude, ChatGPT Site, web propia). Indica qué va en cada capa.
5. **Comparación de plataformas:** una tabla con qué se puede, qué no, costos y riesgos de cada una. Da una recomendación con su motivo y marca lo que sea supuesto.
6. **Datos de mercado:** de dónde saldrían los precios y las velas en cada plataforma, y qué costos y licencias implica darlos a terceros.
7. **TradingView:** las opciones realistas y tu recomendación.
8. **Riesgos de la versión para terceros:** regulatorios (recomendaciones de inversión), daño a principiantes que operan con apalancamiento, costo de IA por usuario, seguridad y privacidad. Incluye qué habría que validar antes de construirla.
9. **Plan de pruebas del núcleo.**
10. **Hoja de ruta por fases:** cada fase con su entregable, su criterio de "terminado" y el esfuerzo estimado. La fase 1 debe ser pequeña y servir en una semana.
11. **Preguntas abiertas para el dueño,** máximo 7.

Extensión máxima de unas 8 páginas. Prioriza decisiones claras sobre listas largas de funciones.
