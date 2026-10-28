# Contrato para agentes de Centinela (v3.8)

Este archivo es el que se usa para crear los agentes. Un agente es una **tarea programada de Claude** que vive fuera de Centinela y escribe en la base de datos del artefacto. Centinela **no ejecuta agentes**: muestra lo que hicieron, revisa cada operación con reglas fijas (nunca con IA) y deja que Johannes los pause.

**Todo es simulado.** Cada agente tiene una cuenta de dinero virtual. No hay dinero real, no hay órdenes en Quantfury ni en ningún broker. Un agente nunca ejecuta, sugiere ejecutar ni escribe operaciones reales.

## 1. Reglas de oro

1. **Antes de cada corrida, lee `pausado` y tu pérdida acumulada** (sección 3). Si estás en pausa o llegaste a la pérdida acumulada máxima, **no hagas nada**: no escribas en ningún documento, ni siquiera tu bitácora ni `ultimaCorrida`. Termina la corrida.
2. **Vuelve a leer `pausado` justo antes de escribir una operación.** Johannes puede pausarte en medio de una corrida (es el apagado de emergencia).
3. **No inventes datos.** Si no tienes un precio, una hora o un nivel que se lea de una fuente real, no operes: deja un evento `error` en tu bitácora.
4. **Escribe solo lo que te corresponde** (sección 2). Nunca toques lo de Johannes, lo de otro agente ni los ajustes.
5. **Escribe con versión.** Con la herramienta de datos del artefacto (`ArtifactData`): lee el documento (`get`), y escríbelo con `update` pasando el `if_version` que leíste. Si falla porque cambió, vuelve a leerlo y rehaz el cambio. Usa `set` **solo para crear** un documento que no existe.

## 2. Qué puedes y qué no puedes escribir

| Puedes escribir | Cómo |
|---|---|
| Tu documento en `agentes/<tu-id>` | Todos sus campos **excepto `pausado` y `pausadoTs`** (los escribe solo Centinela, cuando Johannes te pausa o te reanuda). Créalo con `set` sin esos campos; después, siempre `update`. |
| Tu bitácora: `bitacora/<tu-id>-<AAAA-MM-DD>` | Un documento por día (de Bolivia) con la lista `eventos`. Nunca escribas eventos con `origen: "Johannes"`. |
| Tus operaciones en `trades` | Solo con `cuenta: "agente"`, `practica: true` y `agente: "<tu-id>"`. Solo las tuyas. |
| Señales en `senales` | Solo con `fuente: "Agente"` y `estado: "nueva"`. Son propuestas para Johannes: él decide. |

**Nunca puedes escribir:**

- `config/main` (las reglas de Johannes) ni `config/agente` (los límites de tu cuenta). Si cambian fuera de Centinela, la app muestra un aviso rojo.
- Operaciones reales: nada en `trades` sin `cuenta: "agente"` y `practica: true`, ni cambiar o borrar una operación de Johannes.
- Los campos `pausado` y `pausadoTs` de cualquier agente, ni el documento o la bitácora de otro agente.
- Nada más: ni `resumenes`, ni `revisiones`, ni `eventos` (el calendario macro lo carga Johannes a mano).

## 3. Antes de cada corrida (obligatorio)

1. Lee `agentes/<tu-id>`. Si `pausado` es `true` → **termina sin escribir nada**.
2. Lee `config/agente`. Si no existe, usa los valores de partida: capital `100`, riesgoOp `2`, perdidaDia `6`, perdidaMax `20`, maxAbiertas `3`, rrMin `1.5`.
3. Lee tus operaciones: `trades` con `agente == "<tu-id>"` y `cuenta == "agente"`.
4. Calcula tu **pérdida acumulada**: `capital − saldo`, con `saldo = capital + resultados − costos`.
   - Resultados: `pnl` de tus operaciones cerradas (y los `pnl` de sus salidas parciales si aún están abiertas).
   - Costos: `costos.comision + costos.deslizamiento` de cada operación.
   - Centinela no cuenta las operaciones que quedaron fuera de límites. Por prudencia: si una tuya no cumplía los límites (sección 6), **no sumes su ganancia** pero **sí su pérdida**.
5. Si la pérdida acumulada es igual o mayor que `perdidaMax` → **termina sin escribir nada**. El experimento está detenido (la tarjeta lo dice: "Experimento detenido por pérdida máxima").

## 4. Tu documento: `agentes/<tu-id>`

(Los ejemplos usan el miércoles 14-oct-2026: `1791989700000` son las 10:55 de Bolivia, `1791991500000` las 11:25.)

El id es corto, en minúsculas y sin espacios (letras, números y `-`), por ejemplo `vigia`. Es el mismo que va en tus operaciones y en el id de tu bitácora.

```json
{
  "nombre": "Vigía",
  "rol": "Busca entradas en semiconductores",
  "avatar": "vigia",
  "estado": "investigando",
  "texto": "Revisando NVDA y AMD en 15 minutos",
  "ultimaCorrida": 1791989700000,
  "proximaCorrida": 1791991500000
}
```

| Campo | Qué es |
|---|---|
| `nombre` | Hasta 40 caracteres. |
| `rol` | Una línea: de qué te ocupas (hasta 80). |
| `avatar` | Una de estas claves: `vigia`, `buho`, `lince`, `faro`, `cubo`. Otra clave muestra solo tu inicial. |
| `estado` | Uno de: `investigando`, `analizando`, `esperando`, `registrando`, `riesgo`, `pausado`, `error`, `inactivo`. Otro valor se muestra como "Estado sin dato". |
| `texto` | Una frase: qué estás haciendo ahora (hasta 200). |
| `ultimaCorrida` | Milisegundos (UTC) de la corrida que termina. |
| `proximaCorrida` | Milisegundos de tu próxima corrida programada. **Siempre ponla**: si la última corrida queda más vieja que el doble de lo esperado (de `ultimaCorrida` a `proximaCorrida`), la tarjeta muestra "Sin noticias desde HH:MM". |
| `pausado`, `pausadoTs` | **Solo Centinela.** `pausado: true` = Johannes te pausó. No los escribas nunca (tampoco al crear el documento: si falta, no estás en pausa). |

Al terminar cada corrida (si no estabas en pausa ni detenido), haz `update` con `estado`, `texto`, `ultimaCorrida` y `proximaCorrida`.

## 5. Tu bitácora: `bitacora/<tu-id>-<AAAA-MM-DD>`

Un documento por día de **Bolivia (UTC−4 todo el año)**. Así no se agota el límite de documentos de la base (25.000 en todo el artefacto).

```json
{
  "agente": "vigia",
  "dia": "2026-10-14",
  "ts": 1791989700000,
  "eventos": [
    { "ts": 1791984600000, "tipo": "investiga", "texto": "Arranca la corrida: reviso 12 semiconductores." },
    { "ts": 1791985080000, "tipo": "analiza", "texto": "F en 15 minutos: rebote en el soporte de 11,50." },
    { "ts": 1791985200000, "tipo": "registra", "texto": "Abro F compra: 3 acciones a 12,00, stop 11,50 (riesgo $1,50).", "datos": { "trade": "ag-vigia-1791985200000" } },
    { "ts": 1791989700000, "tipo": "resumen", "texto": "Corrida terminada: 1 abierta, saldo $100,65.", "costo": 0.04 }
  ]
}
```

- `agente`, `dia` y `ts` (milisegundos del último evento) son obligatorios: Centinela lee los días más recientes ordenando por `dia`.
- Cada evento: `ts` (milisegundos), `tipo`, `texto` (una o dos frases, hasta 300 caracteres), `datos` (opcional, un objeto chico) y `costo` (opcional, en dólares, lo que costó la corrida o el paso).
- `tipo`: `investiga`, `analiza`, `propone`, `registra`, `riesgo`, `pausa`, `error` o `resumen`. Los eventos `pausa` con `origen: "Johannes"` los escribe solo Centinela.
- **Tope: 200 eventos por día.** Si el día ya tiene 200, saca el más viejo antes de agregar. Los eventos van en orden de hora (el más viejo primero).
- Para agregar: `get` del documento del día; si existe, `update` de `eventos` (la lista completa con el nuevo al final) y `ts`, con `if_version`; si no existe, `set` del documento completo.
- Centinela muestra la bitácora de hoy y de ayer, la más nueva arriba. Desde tu tarjeta, Johannes puede preguntarle a Claude por ti ("Preguntale al agente"): la respuesta sale solo de tu documento, tu bitácora de hoy y ayer y tu cuenta, así que escribe eventos claros (qué viste, qué decidiste y por qué).

## 6. Tus operaciones: `trades/<id>`

Id sugerido: `ag-<tu-id>-<ts>`. Misma forma que las de Johannes, más `cuenta`, `practica`, `agente` y `costos`.

```json
{
  "cuenta": "agente",
  "practica": true,
  "agente": "vigia",
  "fuente": "Agente",
  "origen": "Agente",
  "activo": "F",
  "dir": "compra",
  "tipo": "limite",
  "ts": 1791985200000,
  "entrada": 12.0,
  "sl1": 11.5,
  "stopActual": 11.5,
  "tp1": 12.9,
  "tp2": 13.5,
  "unidades": 3,
  "unidadesAbiertas": 3,
  "riesgoInicial": 1.5,
  "nivel": 2,
  "estado": "abierta",
  "parciales": [],
  "costos": { "comision": 0.1, "deslizamiento": 0 }
}
```

Al cerrarla, `update` con `estado: "cerrada"`, `unidadesAbiertas: 0`, `cierre`, `pnl` (resultado total en dólares, salidas parciales incluidas) y `r` (resultado / riesgo inicial; si falta, Centinela lo calcula así):

```json
{
  "estado": "cerrada",
  "unidadesAbiertas": 0,
  "cierre": { "ts": 1791987900000, "precio": 12.9, "unidades": 3, "pnl": 2.7, "motivo": "TP1" },
  "pnl": 2.7,
  "r": 1.8
}
```

- Números con punto decimal; horas en milisegundos (UTC). `dir`: `compra` o `venta`. `tp2` es opcional.
- `stopActual` solo se mueve a favor (nunca se aleja de la entrada). Nunca promedies a la baja ni amplíes un stop.
- Salidas parciales en `parciales`: `{ "ts", "tipo": "TP1" | "Parcial", "precio", "unidades", "pnl" }`.

### El guardián de Centinela

Cada operación se revisa en el instante de su entrada (`ts`), contra tus operaciones anteriores que sí cumplieron. Si no cumple, la tarjeta y el Diario la muestran con un chip rojo **"Fuera de límites: \<motivo\>"**, se suma al contador y **no cuenta en tu saldo ni en tus estadísticas**. Revisa, en este orden:

1. **Forma:** `cuenta: "agente"`, `practica: true`, tu `agente`, `activo`, `dir`, `entrada` y `unidades` mayores que cero, `ts` válido (no más de 5 minutos en el futuro), `estado` `abierta` o `cerrada` (cerrada con `cierre.ts` y `pnl`), y `costos` no negativos.
2. **Pausa:** que no estuvieras en pausa a esa hora.
3. **Experimento detenido:** que la pérdida acumulada no hubiera llegado a `perdidaMax`.
4. **Stop:** que tenga `sl1` del lado correcto (debajo de la entrada en una compra, arriba en una venta) y que `stopActual` no esté más lejos que `sl1`.
5. **Riesgo por operación:** `|entrada − sl1| × unidades ≤ riesgoOp` (hoy $2).
6. **Beneficio/riesgo de cada TP:** `tp1` obligatorio y, como `tp2` si está, a por lo menos `rrMin` veces la distancia al stop (hoy 1,5).
7. **Máximo de abiertas:** menos de `maxAbiertas` (hoy 3) abiertas al entrar.
8. **Pérdida del día:** lo que perdiste hoy (Bolivia) + el riesgo de tus abiertas + el riesgo de esta ≤ `perdidaDia` (hoy $6). Una ganancia no compensa una pérdida.
9. **Pérdida acumulada:** la que llevas + el riesgo de tus abiertas + el riesgo de esta ≤ `perdidaMax` (hoy $20).
10. **Sin apalancamiento:** `entrada × unidades` no puede pasar tu saldo virtual disponible (saldo menos lo que ocupan tus abiertas).

Respeta estos límites tú mismo antes de escribir: una operación fuera de límites es un error del agente, no del guardián.

## 7. Señales: `senales/<id>`

Si propones una entrada para que Johannes la mire, escríbela como señal. Aparece en su bandeja (Señales → Nuevas) con la fuente "Agente". Él decide si la opera, la practica o la descarta; para operarla tiene que escribir el precio real de Quantfury.

```json
{
  "ts": 1791985500000,
  "dia": "2026-10-14",
  "origen": "Agente",
  "fuente": "Agente",
  "activo": "NVDA",
  "dir": "compra",
  "entrada": 182.4,
  "sl1": 180.9,
  "sl2": 182.4,
  "tp1": 184.9,
  "tp2": 186.2,
  "nivel": 27,
  "nivelDudoso": false,
  "nivelTxt": "Estándar",
  "amb": [],
  "txt": {},
  "market": false,
  "noVigente": false,
  "condicional": false,
  "evento": false,
  "texto": "Vigía: compra en el retroceso al soporte de 180,90.",
  "estado": "nueva",
  "orden": 0
}
```

- Id sugerido: `ag-<tu-id>-<ts>`. `dia` es el día de Bolivia.
- `nivel`: uno de los niveles de Johannes, en dólares (están en `config/main.niveles`, que puedes leer; hoy 10, 18, 27 y 36). Si no lo sabes, pon `null` y `nivelDudoso: true`: el panel usa el más bajo y le pide elegir.
- **No repitas una señal:** si ya hay una del mismo día de Nueva York con el mismo activo, dirección, entrada y SL1, no la escribas.
- Solo `estado: "nueva"`. Nunca cambies una señal ya escrita (Johannes la marca vista, operada, practicada o descartada).

## 8. Límites de tu cuenta: `config/agente` (solo lectura)

Los define Johannes en Centinela (Diario → Operaciones → Reglas y ajustes → Cuenta simulada de los agentes). Valores de partida: capital virtual $100, riesgo por operación $2, pérdida máxima del día $6, pérdida acumulada máxima $20, máximo 3 abiertas, beneficio/riesgo mínimo 1,5 y sin apalancamiento. Cada agente tiene su propia cuenta con esos límites.

## 9. Pasos de cada corrida

1. Lo de la sección 3 (pausa y pérdida acumulada). Si alguna está activa, termina sin escribir.
2. Trabaja: investiga, analiza, propone. Deja eventos en tu bitácora.
3. Antes de registrar una operación: vuelve a leer `pausado`, comprueba los límites de la sección 6 y escribe la operación. Deja un evento `registra`.
4. Gestiona tus abiertas: stop solo a favor; cierra en el stop o en los objetivos con precios reales.
5. Al terminar: evento `resumen` en la bitácora y `update` de tu documento (`estado`, `texto`, `ultimaCorrida`, `proximaCorrida`).
