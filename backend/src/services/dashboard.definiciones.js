/**
 * Definiciones únicas del panel analítico.
 *
 * Antes estas reglas vivían duplicadas dentro de `dashboard.service.js`
 * (`_escala` con cuatro nombres) y el criterio de "en riesgo" estaba repetido
 * como texto en la interfaz: "Promedio < 60 o ≥5 días sin ingresar". Eso hacía
 * que cambiar un umbral obligara a tocar el backend Y el texto de la tarjeta, y
 * era la forma más fácil de que el rótulo dejara de describir lo que el SQL
 * realmente hace.
 *
 * Aquí viven las dos definiciones, una sola vez:
 *
 *  - **Nivel de desempeño**: Bajo / Básico / Alto / Superior, derivado del
 *    porcentaje de logro. Sin nota no se inventa una: se devuelve `null` y la
 *    interfaz muestra "Sin datos". Poner "Bajo" haría creer al docente que sus
 *    estudiantes rinden mal cuando en realidad no hay nada evaluado todavía.
 *
 *  - **En riesgo**: nivel Bajo, o N días sin ingresar. Es un estado, no una
 *    calificación, así que no se mixtura con el nivel.
 *
 * Todos los umbrales son configurables por variable de entorno y se devuelven en
 * la respuesta (`umbrales`) para que la interfaz rotule el criterio con el
 * número real en lugar de repetir un literal que puede quedar viejo.
 *
 * Variables que lo controlan (todas opcionales; un valor no numérico o fuera de
 * rango cae al valor por defecto, así que un `.env` mal escrito no deja el panel
 * sin datos):
 *
 *   DASHBOARD_NIVEL_SUPERIOR   mínimo para Superior      (90)
 *   DASHBOARD_NIVEL_ALTO       mínimo para Alto          (70)
 *   DASHBOARD_NIVEL_BASICO     mínimo para Básico        (50)
 *   DASHBOARD_RIESGO_PCT_MAX   % por debajo del cual se considera Bajo (50)
 *   DASHBOARD_RIESGO_DIAS      días sin ingresar para entrar en riesgo (5)
 *   DASHBOARD_ACTIVOS_HORAS    ventana de "usuarios activos", en horas (24)
 *
 *  Y, para la sección de Contenidos y Actividades (invertidos: más acierto es
 *  más fácil):
 *
 *   DASHBOARD_DIF_FACIL        mínimo de acierto para "Fácil"        (70)
 *   DASHBOARD_DIF_MEDIA        mínimo de acierto para "Media"        (50)
 *   DASHBOARD_DIF_DIFICIL      mínimo de acierto para "Difícil"      (30)
 *                              por debajo de 30 se rotula "Muy difícil"
 *   DASHBOARD_ABANDONO_ALTO    % de abandono desde el que se alerta   (20)
 *   DASHBOARD_ABANDONO_MIN     intentos mínimos para que esa alerta   (5)
 *                              no salte con muestras de 1 de 1
 *   DASHBOARD_ACIERTO_BAJO     % de acierto por debajo del cual se    (50)
 *                              alerta rendimiento bajo en la tabla
 *
 * Los cortes de nivel tienen que quedar ordenados entre sí; si no, el que venga
 * fuera de rango se descarta y gana el valor por defecto.
 *
 * ---------------------------------------------------------------------------
 * Escala de calificación (1.0 - 5.0)
 * ---------------------------------------------------------------------------
 *
 * El Resumen General y la Vista de Grupo trabajan sobre el PORCENTAJE de acierto,
 * porque es lo que sale de `actividad_intentos`. La calificación numérica del
 * Progreso Individual es otra magnitud: la nota de la escala del colegio. Son dos
 * medidas distintas, así que tienen dos juegos de cortes, pero los dos juegos
 * viven en este archivo para que no queden definiciones duplicadas por vista.
 *
 * Con la escala por defecto (1.0 - 5.0):
 *
 *   Bajo      1.0 - 2.9
 *   Básico    3.0 - 3.9
 *   Alto      4.0 - 4.5
 *   Superior  4.6 - 5.0
 *
 *   DASHBOARD_NOTA_SUPERIOR  nota mínima para Superior (4.6)
 *   DASHBOARD_NOTA_ALTO      nota mínima para Alto     (4.0)
 *   DASHBOARD_NOTA_BASICO    nota mínima para Básico   (3.0)
 *
 * Y los pesos del promedio ponderado de acierto, que solo se aplican cuando el
 * estudiante AÚN no tiene nota registrada (si existe nota, manda la nota):
 *
 *   nota = 1.0 + 4.0 * (promedio ponderado de % de acierto / 100)
 *
 *   DASHBOARD_PESO_JUEGO       peso del % de acierto de los juegos      (1)
 *   DASHBOARD_PESO_EVALUACION  peso del % de acierto de las evaluaciones (1)
 *   DASHBOARD_PESO_CONTENIDO   peso del % de acierto de los contenidos  (1)
 *
 * Confirmar la escala con la del colegio antes de usar estos valores por defecto
 * en calificación real: se ajustan por `.env` sin tocar código.
 */

/** Lee un número del entorno y lo acota; si no es válido, usa el valor por defecto. */
const numero = (valor, porDefecto, min, max) => {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < min || n > max) return porDefecto;
  return n;
};

// Ordenados de mayor a menor exigencia: el primero cuyo `minimo` supera el
// porcentaje es el nivel. Cada umbral tiene que quedar por encima del siguiente,
// por eso `max` es el umbral contiguo y no 100.
const NIVEL_SUPERIOR = numero(process.env.DASHBOARD_NIVEL_SUPERIOR, 90, 1, 100);
const NIVEL_ALTO = numero(process.env.DASHBOARD_NIVEL_ALTO, 70, 1, NIVEL_SUPERIOR);
const NIVEL_BASICO = numero(process.env.DASHBOARD_NIVEL_BASICO, 50, 1, NIVEL_ALTO);

// "En riesgo" usa el mismo corte que "Bajo" por defecto. Si se separan, es a
// propósito (por ejemplo para no penalizar al que solo dejó de entrar), pero
// entonces hay que decirlo en la etiqueta de la tarjeta.
const RIESGO_PCT_MAX = numero(process.env.DASHBOARD_RIESGO_PCT_MAX, NIVEL_BASICO, 0, 100);
const RIESGO_DIAS_SIN_INGRESAR = numero(process.env.DASHBOARD_RIESGO_DIAS, 5, 1, 365);

/** Horas de la ventana de "usuarios activos". */
const VENTANA_ACTIVOS_HORAS = numero(process.env.DASHBOARD_ACTIVOS_HORAS, 24, 1, 168);

/* -------------------------------------------------------------------------- *
 *  Escala de calificación 1.0 - 5.0
 *
 *  Mismo criterio que arriba (el primero cuyo `minimo` supera la nota es el
 *  nivel) pero sobre la nota del colegio en vez del porcentaje de acierto.
 * -------------------------------------------------------------------------- */

const NOTA_MAX = 5.0;
const NOTA_MIN = 1.0;

const NOTA_SUPERIOR = numero(process.env.DASHBOARD_NOTA_SUPERIOR, 4.6, NOTA_MIN, NOTA_MAX);
const NOTA_ALTO = numero(process.env.DASHBOARD_NOTA_ALTO, 4.0, NOTA_MIN, NOTA_SUPERIOR);
const NOTA_BASICO = numero(process.env.DASHBOARD_NOTA_BASICO, 3.0, NOTA_MIN, NOTA_ALTO);

/**
 * Pesos del promedio ponderado de acierto por tipo de actividad.
 *
 * Solo entran en juego cuando el estudiante todavía no tiene nota registrada.
 * Un peso en 0 saca el tipo de la fórmula sin tener que cambiar código; si los
 * tres pesos quedan en 0 no hay promedio ponderado posible y se fuerza el simple.
 */
const PESOS_ACTIVIDAD = {
  juego: numero(process.env.DASHBOARD_PESO_JUEGO, 1, 0, 100),
  evaluacion: numero(process.env.DASHBOARD_PESO_EVALUACION, 1, 0, 100),
  contenido: numero(process.env.DASHBOARD_PESO_CONTENIDO, 1, 0, 100),
};

/* -------------------------------------------------------------------------- *
 *  Dificultad de una actividad (Contenidos y Actividades)
 *
 *  La dificultad se deduce del % de acierto de los intentos, con los cortes
 *  invertidos (más acierto = más fácil):
 *
 *    Fácil       acierto >= DIF_FACIL
 *    Media       DIF_MEDIA <= acierto < DIF_FACIL
 *    Difícil     DIF_DIFICIL <= acierto < DIF_MEDIA
 *    Muy difícil acierto < DIF_DIFICIL
 *
 *  El % de acierto se toma de `aciertos / preguntas_total` cuando esa columna
 *  existe (evaluaciones) y, si no, de `puntaje_obtenido / puntaje_maximo`
 *  (juegos). Los contenidos no tienen ni preguntas ni puntaje
 *  (`puntaje_maximo = 0` en el 100% de la tabla), así que su dificultad es
 *  "Sin dato": rotularla inventaría un acierto que no se registró.
 * -------------------------------------------------------------------------- */
const DIF_FACIL = numero(process.env.DASHBOARD_DIF_FACIL, 70, 1, 100);
const DIF_MEDIA = numero(process.env.DASHBOARD_DIF_MEDIA, 50, 1, DIF_FACIL);
const DIF_DIFICIL = numero(process.env.DASHBOARD_DIF_DIFICIL, 30, 1, DIF_MEDIA);

/** Umbral de "abandono alto" y la muestra mínima para no alertar con 1 de 1. */
const ABANDONO_ALTO_PCT = numero(process.env.DASHBOARD_ABANDONO_ALTO, 20, 1, 100);
const ABANDONO_MIN_INTENTOS = numero(process.env.DASHBOARD_ABANDONO_MIN_INTENTOS, 5, 1, 1000);

/**
 * Umbral de "acierto bajo": el signo ⚠ de la tabla por actividad pasa a
 * identificar las actividades cuyo % de acierto queda por debajo de este corte.
 * Comparte el mismo espíritu de `ABANDONO_*` (configurable por entorno y
 * rotulado desde el backend), pero no exige muestra mínima: un intento que
 * rindió mal ya es una señal para el docente.
 */
const ACIERTO_BAJO_PCT = numero(process.env.DASHBOARD_ACIERTO_BAJO, 50, 1, 100);

/** Escala completa, ordenada de más a menos fácil. */
const DIFICULTADES = [
  { clave: 'facil', etiqueta: 'Fácil', minimo: DIF_FACIL },
  { clave: 'media', etiqueta: 'Media', minimo: DIF_MEDIA },
  { clave: 'dificil', etiqueta: 'Difícil', minimo: DIF_DIFICIL },
  { clave: 'muy_dificil', etiqueta: 'Muy difícil', minimo: 0 },
];

/**
 * Dificultad de una actividad a partir de su % de acierto.
 *
 * @param {number|null} porcentaje
 * @returns {{clave: string, etiqueta: string}|null} null cuando no hay acierto.
 */
const dificultadDe = (porcentaje) => {
  if (porcentaje == null || Number.isNaN(Number(porcentaje))) return null;
  const pct = Number(porcentaje);
  const nivel = DIFICULTADES.find((d) => pct >= d.minimo);
  return nivel ? { clave: nivel.clave, etiqueta: nivel.etiqueta } : null;
};

/** Alias de un estudiante: `users.name` es el nombre que el docente ve en la app. */
const SIN_ALIAS = 'Estudiante sin alias';

/**
 * Umbrales vigentes, resueltos en cada llamada y no en la carga del módulo, para
 * que un cambio de `.env` no quede congelado en un valor ya leído. */
const umbrales = () => ({
  niveles: [
    { nivel: 'Superior', minimo: NIVEL_SUPERIOR },
    { nivel: 'Alto', minimo: NIVEL_ALTO },
    { nivel: 'Básico', minimo: NIVEL_BASICO },
    { nivel: 'Bajo', minimo: 0 },
  ],
  riesgo: { pct_max: RIESGO_PCT_MAX, dias_sin_ingresar: RIESGO_DIAS_SIN_INGRESAR },
  activos_horas: VENTANA_ACTIVOS_HORAS,
  // Segunda escala, la de la nota numérica del colegio.
  nota: {
    min: NOTA_MIN,
    max: NOTA_MAX,
    basico: NOTA_BASICO,
    alto: NOTA_ALTO,
    superior: NOTA_SUPERIOR,
  },
  pesos_actividad: { ...PESOS_ACTIVIDAD },
  // Escala de dificultad de la sección de contenidos (invertida: más acierto
  // es más fácil) y el umbral de "abandono alto" de la tabla por actividad.
  dificultad: { cortes: DIFICULTADES },
  abandono: { alto: ABANDONO_ALTO_PCT, minimo_intentos: ABANDONO_MIN_INTENTOS },
  // Umbral de "acierto bajo" que el ⚠ de la tabla rota en la interfaz.
  acierto: { bajo: ACIERTO_BAJO_PCT },
});

/**
 * Nivel de desempeño a partir del porcentaje de logro (0-100).
 *
 * @param {number|null} porcentaje
 * @returns {'Superior'|'Alto'|'Básico'|'Bajo'|null}
 */
const nivelDeDesempeno = (porcentaje) => {
  if (porcentaje == null || Number.isNaN(Number(porcentaje))) return null;
  const pct = Number(porcentaje);
  if (pct >= NIVEL_SUPERIOR) return 'Superior';
  if (pct >= NIVEL_ALTO) return 'Alto';
  if (pct >= NIVEL_BASICO) return 'Básico';
  return 'Bajo';
};

/**
 * Nivel de desempeño a partir de la calificación numérica (escala 1.0 - 5.0).
 *
 * Mismo nombre de niveles que `nivelDeDesempeno` para que el chip de color, la
 * leyenda y el filtro de la interfaz sirvan para las dos medidas, pero el corte
 * es el de la nota y no el del porcentaje.
 *
 * Sin nota no se inventa una: se devuelve `null` y la interfaz muestra "Sin
 * datos". Poner "Bajo" haría creer al docente que el estudiante rinde mal cuando
 * en realidad todavía no hay nada evaluado.
 *
 * @param {number|null} nota
 * @returns {'Superior'|'Alto'|'Básico'|'Bajo'|null}
 */
const nivelDeNota = (nota) => {
  if (nota == null || nota === '') return null;
  const n = Number(nota);
  if (!Number.isFinite(n)) return null;
  if (n >= NOTA_SUPERIOR) return 'Superior';
  if (n >= NOTA_ALTO) return 'Alto';
  if (n >= NOTA_BASICO) return 'Básico';
  return 'Bajo';
};

/**
 * Calificación numérica a partir del % de acierto de actividades evaluativas.
 *
 * Es el respaldo para el estudiante que aún no tiene nota registrada:
 *
 *     nota = 1.0 + 4.0 * (promedio ponderado de % de acierto / 100)
 *
 * El promedio es ponderado por tipo de actividad (`PESOS_ACTIVIDAD`). Si todos
 * los pesos son 0 no hay promedio ponderado posible y se usa el simple.
 *
 * @param {{pct_por_tipo: Object<string, number|null>}} entrada
 * @returns {number|null} nota redondeada a 1 decimal, o null si no hay acierto.
 */
const notaDesdeAcierto = ({ pct_por_tipo } = {}) => {
  const porTipo = pct_por_tipo || {};
  let suma = 0;
  let peso = 0;

  for (const tipo of Object.keys(PESOS_ACTIVIDAD)) {
    const pct = Number(porTipo[tipo]);
    if (!Number.isFinite(pct)) continue;
    suma += pct * PESOS_ACTIVIDAD[tipo];
    peso += PESOS_ACTIVIDAD[tipo];
  }

  const promedio = peso > 0 ? suma / peso : null;
  if (promedio == null) return null;

  const nota = NOTA_MIN + (NOTA_MAX - NOTA_MIN) * (promedio / 100);
  return Math.round(Math.min(NOTA_MAX, Math.max(NOTA_MIN, nota)) * 10) / 10;
};

/**
 * Motivos por los que un estudiante entra en "en riesgo". Se expansionan en la
 * interfaz para que el docente vea POR QUÉ está en la lista, no solo el número.
 */
const MOTIVOS_RIESGO = {
  bajo: 'Bajo nivel de desempeño',
  inactivo: 'Sin ingresar',
  ambos: 'Bajo nivel de desempeño y sin ingresar',
};

/**
 * Estado de riesgo a partir del nivel de desempeño y los días sin ingresar.
 *
 * "En riesgo" = nivel Bajo **o** `RIESGO_DIAS_SIN_INGRESAR` días sin ingresar.
 * Lo que no aparece en la lista es que un estudiante recién creado que nunca ha
 * entrado no cuenta como inactivo: sin sesión registrada no hay inactivity que
 * medir, así que `diasSinIngresar` llega `null` y solo lo puede marcar el nivel.
 *
 * @param {{nivel?: string|null, diasSinIngresar?: number|null}} entrada
 * @returns {{en_riesgo: boolean, motivo: 'bajo'|'inactivo'|'ambos'|null,
 *            motivo_texto: string|null}}
 */
const riesgoDe = ({ nivel = null, diasSinIngresar = null } = {}) => {
  const bajo = nivel === 'Bajo';
  const dias = Number(diasSinIngresar);
  const inactivo = Number.isFinite(dias) && dias >= RIESGO_DIAS_SIN_INGRESAR;

  if (!bajo && !inactivo) return { en_riesgo: false, motivo: null, motivo_texto: null };

  const motivo = bajo && inactivo ? 'ambos' : inactivo ? 'inactivo' : 'bajo';
  return { en_riesgo: true, motivo, motivo_texto: MOTIVOS_RIESGO[motivo] };
};

/** Atajo seguro para usar `u.name` como alias. */
const aliasDe = (nombre) => (nombre && String(nombre).trim()) || SIN_ALIAS;

module.exports = {
  umbrales,
  nivelDeDesempeno,
  nivelDeNota,
  notaDesdeAcierto,
  riesgoDe,
  dificultadDe,
  DIFICULTADES,
  ABANDONO_ALTO_PCT,
  ABANDONO_MIN_INTENTOS,
  ACIERTO_BAJO_PCT,
  aliasDe,
  SIN_ALIAS,
  MOTIVOS_RIESGO,
  NIVEL_SUPERIOR,
  NIVEL_ALTO,
  NIVEL_BASICO,
  NOTA_MIN,
  NOTA_MAX,
  NOTA_BASICO,
  NOTA_ALTO,
  NOTA_SUPERIOR,
  PESOS_ACTIVIDAD,
  RIESGO_PCT_MAX,
  RIESGO_DIAS_SIN_INGRESAR,
  VENTANA_ACTIVOS_HORAS,
};