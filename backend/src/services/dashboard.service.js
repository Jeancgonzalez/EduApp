const { sequelize } = require('../config/database');
const {
  umbrales,
  nivelDeDesempeno,
  aliasDe,
  dificultadDe,
  DIFICULTADES,
  ABANDONO_ALTO_PCT,
  ABANDONO_MIN_INTENTOS,
  ACIERTO_BAJO_PCT,
  MOTIVOS_RIESGO,
  RIESGO_PCT_MAX,
  RIESGO_DIAS_SIN_INGRESAR,
  VENTANA_ACTIVOS_HORAS,
} = require('./dashboard.definiciones');
const MedalsService = require('./medals.service');

/** Aliases máximos que devuelve `estudiantes_riesgo.aliases`. */
const MAX_ALIASES_RIESGO = 50;
/** Cuántos temas caben en la gráfica sin volverse ilegible. */
const MAX_TEMAS_POR_DEFECTO = 6;
const MAX_TEMAS_TOPE = 12;
/** Columnas del mapa de calor (actividades) y su tope. */
const MAPA_ACTIVIDADES_POR_DEFECTO = 12;
const MAPA_ACTIVIDADES_TOPE = 20;
/** Filas del mapa de calor (estudiantes). */
const MAPA_ESTUDIANTES_TOPE = 100;

const MS_DIA = 864e5;

/**
 * Estados de una celda del mapa de calor.
 *
 * Se devuelven en la respuesta (`estados`) para que la leyenda de la interfaz
 * se construya con esto y no con un texto repetido en el JSX: si mañana "con
 * errores" pasa a significar "falló dos veces", se cambia aquí y la leyenda no
 * puede quedar diciendo la cosa vieja.
 *
 * El orden va de mejor a peor porque es el orden en que se leen los colores.
 */
const ESTADOS_MAPA = [
  { clave: 'completado', etiqueta: 'Completado' },
  { clave: 'en_progreso', etiqueta: 'En progreso' },
  { clave: 'con_errores', etiqueta: 'Con errores' },
  { clave: 'pendiente', etiqueta: 'Pendiente' },
];
const CLAVES_ESTADO = new Set(ESTADOS_MAPA.map((e) => e.clave));

/**
 * Rareza de una insignia, deducida de cuántos estudiantes del alcance la tienen.
 *
 * No hay columna de rareza en `medallas_obtenidas` y no se inventa una: lo que
 * ya dice la tabla es exactamente lo que la leyenda necesita, "x de N
 * estudiantes". Una insignia que tiene el 80% del grupo no puede rotularse rara
 * por mucho que su condición sea exigente, porque lo que importa es la
 * difusión real.
 *
 * Los cortes van sobre el porcentaje de estudiantes del alcance, no sobre el
 * número de alumnos: con 6 estudiantes "2 de 6" es un tercio del grupo y con 60
 * es el 3%. El mismo porcentaje tiene que ser la misma rareza en los dos casos.
 */
const RAREZAS = [
  { clave: 'comun', etiqueta: 'Común', minimo: 50 },
  { clave: 'poco_comun', etiqueta: 'Poco común', minimo: 15 },
  { clave: 'rara', etiqueta: 'Rara', minimo: 0 },
];
const CLAVES_RAREZA = new Set(RAREZAS.map((r) => r.clave));

/** Buckets de XP para el histograma. Los cortes cierran en 500, el nivel del estudiante. */
const RANGOS_XP = [
  { clave: 'x0', etiqueta: '0', minimo: 0, maximo: 0 },
  { clave: 'x1', etiqueta: '1 - 99', minimo: 1, maximo: 99 },
  { clave: 'x2', etiqueta: '100 - 249', minimo: 100, maximo: 249 },
  { clave: 'x3', etiqueta: '250 - 499', minimo: 250, maximo: 499 },
  { clave: 'x4', etiqueta: '500 - 999', minimo: 500, maximo: 999 },
  { clave: 'x5', etiqueta: '1.000 o más', minimo: 1000, maximo: Infinity },
];

/**
 * Grupo de insignias de un estudiante, para colorear la dispersión de
 * continuidad. Cortes grossos a propósito: con grupos de uno o dos estudiantes
 * cada punto sería un color distinto y la leyenda no diría nada.
 */
const GRUPOS_INSIGNIAS = [
  { clave: 'g0', etiqueta: 'Sin insignias', minimo: 0, maximo: 0 },
  { clave: 'g1', etiqueta: '1 - 2', minimo: 1, maximo: 2 },
  { clave: 'g2', etiqueta: '3 - 5', minimo: 3, maximo: 5 },
  { clave: 'g3', etiqueta: '6 o más', minimo: 6, maximo: Infinity },
];
const CLAVES_GRUPO_INSIGNIAS = new Set(GRUPOS_INSIGNIAS.map((g) => g.clave));

/**
 * Agregaciones del panel analítico del docente.
 *
 * Tres reglas gobiernan todo el archivo:
 *
 * 1. **Aislamiento.** `docenteId` SIEMPRE viene del JWT, nunca de un parámetro.
 *    Y los estudiantes se acotan por `users.docente_id`, así que un docente no
 *    puede leer datos de otro ni contar estudiantes ajenos aunque manipule el
 *    `grupoId` de la URL.
 *
 * 2. **Duración solo donde mide algo.** Los intentos de contenido y juego se abren
 *    y cierran casi al instante (el contenido se registra en `/acceder` y el juego
 *    se responde al terminarlo), así que buena parte de su `duracion_seg` ronda
 *    0. Por eso el resto de este servicio no publica tiempo de actividad, y la
 *    única excepción es la sección de Contenidos, que lee la duración como
 *    mediana de los intentos con `duracion_seg > 0` y reporta cuántos intentos
 *    aportaron ese dato, para que jamás se venda como "el tiempo promedio real".
 *
 * 3. **Definiciones en un solo sitio.** El nivel de desempeño y el criterio de
 *    "en riesgo" NO se escriben aquí: salen de `dashboard.definiciones.js`, que
 *    además es lo único que los devuelve en `umbrales`, para que la interfaz
 *    rotule el criterio con el número real en vez de repetir un literal que
 *    puede quedar viejo.
 */
class DashboardService {
  /**
   * Estudiantes que el docente puede ver, ya filtrados por su `docente_id`.
   *
   * La base es `users.docente_id`, el mismo criterio que ya usa
   * `teacher.controller.js` para listar estudiantes: al registrar una cuenta el
   * `docente_id` queda asignado y el estudiante existe aunque nunca se le haya
   * metido en un grupo. Usar `grupo_estudiantes` como base devolvería 0
   * estudiantes en el caso normal.
   *
   * `grupoId` solo actúa como filtro adicional.
   *
   * @returns {Promise<number[]>} array de `id` de estudiante (vacío si no tiene)
   */
  static async _estudiantesDocente(docenteId, grupoId = null) {
    const filas = await sequelize.query(
      `SELECT u.id AS estudiante_id
         FROM users u
        WHERE u.role = 'student'
          AND u.docente_id = :docenteId
          AND (:grupoId IS NULL OR EXISTS (
                SELECT 1 FROM grupo_estudiantes ge
                 WHERE ge.estudiante_id = u.id AND ge.grupo_id = :grupoId))`,
      {
        replacements: { docenteId, grupoId: grupoId ? Number(grupoId) : null },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    return filas.map((r) => r.estudiante_id);
  }

  /**
   * Verifica que el grupo pertenece al docente antes de usarlo como filtro.
   * El controlador responde 404 si el grupo es de otro.
   */
  static async grupoEsDelDocente(docenteId, grupoId) {
    if (!grupoId) return true;
    const filas = await sequelize.query(
      'SELECT id FROM grupos WHERE id = :id AND docente_id = :docenteId',
      {
        replacements: { id: Number(grupoId), docenteId },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    return filas.length > 0;
  }

  /** Junta los ids en la lista de `?` que Sequelize espera. */
  static _marcadores(ids) {
    return ids.map(() => '?').join(',');
  }

  /**
   * Ventanas de comparación del resumen.
   *
   * El período actual es una ventana móvil de `semanas` semanas. El anterior es
   * la ventana inmediatamente previa, de la misma longitud: si no se acota con
   * `hastaAnterior`, se solapa con el actual y todas las variaciones salen mal.
   */
  static _ventanas(semanas) {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - semanas * 7 * MS_DIA);
    const desdeAnterior = new Date(desde.getTime() - semanas * 7 * MS_DIA);
    return { hasta, desde, desdeAnterior, hastaAnterior: desde };
  }

  /** Bloque `{ semanas, desde, hasta }` con fechas ISO. */
  static _periodo(semanas, desde, hasta = null) {
    return {
      semanas,
      desde: desde.toISOString().slice(0, 10),
      hasta: (hasta || new Date()).toISOString().slice(0, 10),
    };
  }

  /* ------------------------------------------------------------------ *
   *  Agregados de una ventana temporal
   * ------------------------------------------------------------------ */

  /**
   * Participación, progreso y XP de la ventana `[desde, hasta)`.
   *
   * Se resuelven en dos consultas porque el XP necesita el "mejor puntaje por
   * actividad" y ese grano no existe en la fila agregada.
   *
   * @param {number} docenteId
   * @param {number[]} ids - estudiantes del docente (ya filtrados)
   * @param {Date} desde - inclusivo
   * @param {Date} [hasta] - exclusivo; si se omite, la ventana llega hasta ahora
   */
  static async _agregadosVentana(docenteId, ids, desde, hasta = null) {
    if (ids.length === 0) {
      return { intentos: 0, estudiantes_activos: 0, pct_progreso: null, xp_promedio: null };
    }

    const marcadores = this._marcadores(ids);
    // `hasta` es opcional y un `iniciado_en < NULL` en SQL no filtra nada
    // (comparar con NULL da NULL, no falso), así que la condición se arma sola.
    const tope = hasta ? ' AND i.iniciado_en < ?' : '';
    const args = [docenteId, desde, ...(hasta ? [hasta] : []), ...ids];

    const [base] = await sequelize.query(
      `SELECT COUNT(*) AS intentos,
              COUNT(DISTINCT i.estudiante_id) AS estudiantes_activos,
              AVG(CASE WHEN i.puntaje_maximo IS NOT NULL AND i.puntaje_maximo > 0
                       THEN 100.0 * i.puntaje_obtenido / i.puntaje_maximo END) AS pct_progreso
         FROM actividad_intentos i
        WHERE i.docente_id = ?
          AND i.iniciado_en >= ?${tope}
          AND i.estudiante_id IN (${marcadores})`,
      { replacements: args, type: sequelize.QueryTypes.SELECT }
    );

    // XP con el mismo criterio que la gamificación del estudiante: mejor
    // puntaje de cada actividad, y solo de las que llevan nota. Se promedia
    // entre los estudiantes que tienen al menos una actividad calificada, para
    // no contar como cero a quien aún no ha empezado.
    const [xp] = await sequelize.query(
      `SELECT COALESCE(AVG(total), 0) AS promedio, COUNT(*) AS estudiantes
         FROM (
           SELECT SUM(mejor) AS total
             FROM (
               SELECT i.estudiante_id, i.tipo, i.actividad_id,
                      MAX(i.puntaje_obtenido) AS mejor
                 FROM actividad_intentos i
                WHERE i.docente_id = ?
                  AND i.iniciado_en >= ?${tope}
                  AND i.puntaje_maximo IS NOT NULL
                  AND i.puntaje_maximo > 0
                  AND i.estudiante_id IN (${marcadores})
                GROUP BY i.estudiante_id, i.tipo, i.actividad_id
             ) mejor_por_actividad
            GROUP BY mejor_por_actividad.estudiante_id
         ) por_estudiante`,
      { replacements: args, type: sequelize.QueryTypes.SELECT }
    );

    const intentos = Number(base.intentos || 0);

    return {
      intentos,
      estudiantes_activos: Number(base.estudiantes_activos || 0),
      pct_progreso: base.pct_progreso == null ? null : Number(base.pct_progreso),
      xp_promedio: Number(xp.estudiantes || 0) ? Number(xp.promedio) : null,
      xp_estudiantes: Number(xp.estudiantes || 0),
    };
  }

  /**
   * Estudiantes activos en las últimas `horas`, y en la ventana de `horas`
   * inmediatamente anterior, para la variación del KPI.
   *
   * Se cuenta actividad real y no solo `last_login_at`: se registra un intento o
   * un heartbeat mientras el estudiante navega, y eso es lo que "activo" quiere
   * decir aquí. `estudiante_sesion.ultimo_heartbeat` puede venir NULL en
   * sesiones viejas, así que se cae a `iniciado_en`.
   *
   * El corte se calcula con `NOW()` en SQL y no con fechas de JS a propósito:
   * `actividad_intentos.iniciado_en` es `DATE`, así que un corte calculado en
   * JS quedaría anclado a medianoche y "últimas 24 h" abarcaría hasta 48 h
   * reales de actividad.
   *
   * @returns {Promise<{actual: number, anterior: number, pct_actual: number, pct_anterior: number}>}
   */
  static async _activosRecientes(docenteId, ids, horas) {
    if (ids.length === 0) return { actual: 0, anterior: 0, pct_actual: 0, pct_anterior: 0 };

    const ventana = horas * 2;
    const marcadores = this._marcadores(ids);

    const [actual] = await sequelize.query(
      `SELECT COUNT(*) AS total FROM (
         SELECT DISTINCT i.estudiante_id AS activo
           FROM actividad_intentos i
          WHERE i.docente_id = ?
            AND i.iniciado_en >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            AND i.estudiante_id IN (${marcadores})
         UNION
         SELECT DISTINCT s.estudiante_id
           FROM estudiante_sesion s
          WHERE s.docente_id = ?
            AND COALESCE(s.ultimo_heartbeat, s.iniciado_en) >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            AND s.estudiante_id IN (${marcadores})
         UNION
         SELECT DISTINCT u.id
           FROM users u
          WHERE u.docente_id = ?
            AND u.last_login_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            AND u.id IN (${marcadores})
       ) t`,
      {
        replacements: [
          // Un replacement por `?`, en el orden en que aparecen. Los ids van
          // INMEDIATAMENTE después de su propio bloque: si se agrupan al final,
          // los marcadores del primer `IN` reciben el id del docente y las horas,
          // y Sequelize aborta por exceso de replacements.
          docenteId, horas, ...ids,
          docenteId, horas, ...ids,
          docenteId, horas, ...ids,
        ],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const [anterior] = await sequelize.query(
      `SELECT COUNT(*) AS total FROM (
         SELECT DISTINCT i.estudiante_id AS activo
           FROM actividad_intentos i
          WHERE i.docente_id = ?
            AND i.iniciado_en < DATE_SUB(NOW(), INTERVAL ? HOUR)
            AND i.iniciado_en >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            AND i.estudiante_id IN (${marcadores})
         UNION
         SELECT DISTINCT s.estudiante_id
           FROM estudiante_sesion s
          WHERE s.docente_id = ?
            AND COALESCE(s.ultimo_heartbeat, s.iniciado_en) < DATE_SUB(NOW(), INTERVAL ? HOUR)
            AND COALESCE(s.ultimo_heartbeat, s.iniciado_en) >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            AND s.estudiante_id IN (${marcadores})
         UNION
         SELECT DISTINCT u.id
           FROM users u
          WHERE u.docente_id = ?
            AND u.last_login_at < DATE_SUB(NOW(), INTERVAL ? HOUR)
            AND u.last_login_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            AND u.id IN (${marcadores})
       ) t`,
      {
        replacements: [
          docenteId, horas, ventana, ...ids,
          docenteId, horas, ventana, ...ids,
          docenteId, horas, ventana, ...ids,
        ],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const total = ids.length;
    const act = Number(actual.total || 0);
    const ant = Number(anterior.total || 0);

    return {
      actual: act,
      anterior: ant,
      pct_actual: total ? Math.round((act / total) * 100) : 0,
      pct_anterior: total ? Math.round((ant / total) * 100) : 0,
    };
  }

  /**
   * Estudiantes en riesgo con su alias y el motivo.
   *
   * "En riesgo" = nivel Bajo (por debajo de `RIESGO_PCT_MAX`) o más de
   * `RIESGO_DIAS_SIN_INGRESAR` días sin ingresar. Se devuelve la LISTA y no solo
   * el conteo porque el docente necesita saber a quién revisar, y solo el alias:
   * nunca el correo.
   *
   * No marca como "en riesgo" a un estudiante recién creado que nunca ha
   * entrado: infla el KPI y es ruido. Solo cuenta quien ya mostró actividad y
   * aun así está flojo o desapareció.
   *
   * @param {object} [opciones]
   * @param {Date}   [opciones.hasta] - Corta la evidencia a ese instante, para
   *   reconstruir el estado al cierre del período anterior.
   * @returns {Promise<{total: number, truncado: boolean, aliases: Array}>}
   */
  static async _estudiantesRiesgo(docenteId, ids, { hasta = null } = {}) {
    if (ids.length === 0) return { total: 0, truncado: false, aliases: [] };

    const marcadores = this._marcadores(ids);
    // Cada subconsulta tiene su propio alias, así que el tope se arma dos veces:
    // `i` para los intentos y `s` para las sesiones.
    const topeIntentos = hasta ? ' AND i.iniciado_en < ?' : '';
    const topeSesion = hasta ? ' AND s.iniciado_en < ?' : '';
    const args = [
      docenteId, ...(hasta ? [hasta] : []),
      docenteId, ...(hasta ? [hasta] : []),
      ...ids,
    ];

    // Referencia de tiempo de "días sin ingresar". Al reconstruir el período
    // anterior tiene que ser el cierre de esa ventana y no `NOW()`: si se
    // comparara contra hoy, todo estudiante parecería llevar más días sin
    // ingresar de los que llevaba entonces y la variación saldría inflada.
    // `COALESCE(?, NOW())` deja que el mismo SQL sirva para ambos casos.
    const referencia = hasta || null;

    // Se piden MAX+1 para poder avisar que la lista vino truncada. En ese caso
    // `total` es un mínimo conocido, no el conteo real, y la interfaz lo marca
    // con un "+" en vez de inventar la cifra.
    const filas = await sequelize.query(
      `SELECT u.id AS estudiante_id,
              u.name AS nombre,
              p.promedio AS pct,
              s.ultima_sesion,
              DATEDIFF(COALESCE(?, NOW()), s.ultima_sesion) AS dias_sin_ingresar
         FROM users u
         LEFT JOIN (
           SELECT i.estudiante_id,
                  AVG(100.0 * i.puntaje_obtenido / NULLIF(i.puntaje_maximo, 0)) AS promedio
             FROM actividad_intentos i
            WHERE i.docente_id = ?${topeIntentos}
              AND i.puntaje_maximo IS NOT NULL
              AND i.puntaje_maximo > 0
            GROUP BY i.estudiante_id
         ) p ON p.estudiante_id = u.id
         LEFT JOIN (
           SELECT s.estudiante_id, MAX(s.iniciado_en) AS ultima_sesion
             FROM estudiante_sesion s
            WHERE s.docente_id = ?${topeSesion}
            GROUP BY s.estudiante_id
         ) s ON s.estudiante_id = u.id
        WHERE u.id IN (${marcadores})
          AND (
            (p.promedio IS NOT NULL AND p.promedio < ?)
            OR (s.ultima_sesion IS NOT NULL
                AND DATEDIFF(COALESCE(?, NOW()), s.ultima_sesion) >= ?)
          )
        ORDER BY (p.promedio IS NULL), p.promedio ASC,
                 (s.ultima_sesion IS NULL), s.ultima_sesion ASC
        LIMIT ${MAX_ALIASES_RIESGO + 1}`,
      {
        // El orden sigue el del texto SQL: el `?` de la lista SELECT va primero,
        // luego los dos subconsultas con su id de docente y su tope, después los
        // ids de estudiante y por último los del WHERE.
        replacements: [
          referencia,
          ...args,
          RIESGO_PCT_MAX,
          referencia,
          RIESGO_DIAS_SIN_INGRESAR,
        ],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const truncado = filas.length > MAX_ALIASES_RIESGO;

    const aliases = filas.slice(0, MAX_ALIASES_RIESGO).map((f) => {
      const pct = f.pct == null ? null : Number(f.pct);
      const dias = f.dias_sin_ingresar == null ? null : Number(f.dias_sin_ingresar);
      const bajo = pct != null && pct < RIESGO_PCT_MAX;
      const inactivo = dias != null && dias >= RIESGO_DIAS_SIN_INGRESAR;
      const motivo = bajo && inactivo ? 'ambos' : inactivo ? 'inactivo' : 'bajo';

      return {
        estudiante_id: f.estudiante_id,
        alias: aliasDe(f.nombre),
        pct: pct == null ? null : Math.round(pct),
        dias_sin_ingresar: dias,
        motivo,
        motivo_texto: MOTIVOS_RIESGO[motivo],
      };
    });

    return { total: filas.length, truncado, aliases };
  }

  /* ------------------------------------------------------------------ *
   *  Métricas por estudiante (grano de fila)
   *
   *  Estas dos consultas son la base de la Vista de Grupo y del ranking. Se
   *  separan porque viven en granos distintos y no se pueden resolver en una:
   *  la calificación se promedia sobre INTENTOS y el XP suma el MEJOR puntaje
   *  de cada ACTIVIDAD. Un estudiante que reintenta tres veces el mismo juego
   *  tiene una calificación y un XP que no salen de la misma fila.
   * ------------------------------------------------------------------ */

  /**
   * Intentos de cualquier tipo por estudiante en la ventana.
   *
   * `intentos` de `_filasEstudiante` cuenta solo lo calificado, que es lo que
   * sirve para promediar. Para la participacion cuenta haber tocado algo: un
   * estudiante que abrio tres contenidos y no dejo ninguno puntuado si participa,
   * y con el conteo graded saldria como inactivo.
   */
  static async _actividadPorEstudiante(docenteId, ids, desde) {
    if (ids.length === 0) return new Map();

    const filas = await sequelize.query(
      `SELECT i.estudiante_id, COUNT(*) AS intentos
         FROM actividad_intentos i
        WHERE i.docente_id = ?
          AND i.iniciado_en >= ?
          AND i.estudiante_id IN (${this._marcadores(ids)})
        GROUP BY i.estudiante_id`,
      {
        replacements: [docenteId, desde, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    return new Map(filas.map((f) => [Number(f.estudiante_id), Number(f.intentos)]));
  }

  /**
   * `users.name` de todo el alcance, no solo de quien tiene nota.
   *
   * `_calificaciones()` parte de `actividad_intentos`, asi que un estudiante
   * que solo abrio contenido, o que no intento nada, no aparece en ella. Sin
   * este respaldo el ranking y el mapa de calor lo degradarian a `SIN_ALIAS`,
   * que es justo el estudiante que el docente necesita ver.
   */
  static async _nombresEstudiantes(ids) {
    if (ids.length === 0) return new Map();

    const filas = await sequelize.query(
      `SELECT id, name
         FROM users
        WHERE id IN (${this._marcadores(ids)})`,
      { replacements: [...ids], type: sequelize.QueryTypes.SELECT }
    );

    return new Map(filas.map((f) => [Number(f.id), f.name]));
  }

  /**
   * Calificación e intentos por estudiante en la ventana `[desde, ∞)`.
   *
   * El `promedio` es el mismo `AVG` plano sobre intentos que usa
   * `_agregadosVentana` para el KPI de progreso, y a propósito: si el Resumen
   * General clasifica a un estudiante como "Alto" y la Vista de Grupo lo cuenta
   * como "Básico", el docente ve dos veredictos para la misma persona y ninguno
   * de los dos se puede defender. Cualquier cambio en esta fórmula tiene que
   * cambiar también la de `_agregadosVentana`.
   *
   * Solo entra lo que lleva nota (`puntaje_maximo > 0`): los contenidos se
   * registran al abrirlos y no tienen calificación.
   *
   * @returns {Promise<Array<{estudiante_id, nombre, promedio, intentos, completados}>>}
   *   una fila por estudiante CON actividad calificada; los que no tienen no
   *   aparecen, y el que llama se encarga de contarlos aparte.
   */
  static async _calificaciones(docenteId, ids, desde) {
    if (ids.length === 0) return [];

    return sequelize.query(
      `SELECT i.estudiante_id,
              u.name AS nombre,
              AVG(100.0 * i.puntaje_obtenido / NULLIF(i.puntaje_maximo, 0)) AS promedio,
              COUNT(*) AS intentos,
              SUM(CASE WHEN i.completado = 1 THEN 1 ELSE 0 END) AS completados
         FROM actividad_intentos i
         INNER JOIN users u ON u.id = i.estudiante_id
        WHERE i.docente_id = ?
          AND i.iniciado_en >= ?
          AND i.puntaje_maximo IS NOT NULL
          AND i.puntaje_maximo > 0
          AND i.estudiante_id IN (${this._marcadores(ids)})
        GROUP BY i.estudiante_id, u.name`,
      {
        replacements: [docenteId, desde, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );
  }

  /**
   * XP por estudiante en la ventana: mejor puntaje de cada actividad, sumado.
   *
   * Es el mismo criterio que usa la gamificación del estudiante, así que el XP
   * del ranking y el XP promedio del Resumen General quieren decir lo mismo.
   * Se promedia en la interfaz, no aquí: un docente sin XP no debe desplazar la
   * media de quien sí tiene.
   *
   * @returns {Promise<Map<number, number>>} `estudiante_id` -> XP del período
   */
  static async _xpPorEstudiante(docenteId, ids, desde) {
    if (ids.length === 0) return new Map();

    const filas = await sequelize.query(
      `SELECT mejor_por_actividad.estudiante_id, SUM(mejor_por_actividad.mejor) AS xp
         FROM (
           SELECT i.estudiante_id, i.tipo, i.actividad_id,
                  MAX(i.puntaje_obtenido) AS mejor
             FROM actividad_intentos i
            WHERE i.docente_id = ?
              AND i.iniciado_en >= ?
              AND i.puntaje_maximo IS NOT NULL
              AND i.puntaje_maximo > 0
              AND i.estudiante_id IN (${this._marcadores(ids)})
            GROUP BY i.estudiante_id, i.tipo, i.actividad_id
         ) mejor_por_actividad
        GROUP BY mejor_por_actividad.estudiante_id`,
      {
        replacements: [docenteId, desde, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    return new Map(filas.map((f) => [f.estudiante_id, Number(f.xp || 0)]));
  }

  /**
   * Última sesión registrada por estudiante, para el criterio de "en riesgo".
   *
   * `estudiante_sesion.ultimo_heartbeat` puede venir NULL en sesiones viejas, así
   * que se cae a `iniciado_en`: un corazón que nunca llegó no significa que el
   * estudiante no entrara.
   *
   * @returns {Promise<Map<number, Date|null>>}
   */
  static async _ultimasSesiones(docenteId, ids) {
    if (ids.length === 0) return new Map();

    const filas = await sequelize.query(
      `SELECT estudiante_id, MAX(COALESCE(ultimo_heartbeat, iniciado_en)) AS ultima
         FROM estudiante_sesion
        WHERE docente_id = ?
          AND estudiante_id IN (${this._marcadores(ids)})
        GROUP BY estudiante_id`,
      {
        replacements: [docenteId, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    return new Map(filas.map((f) => [f.estudiante_id, f.ultima]));
  }

  /**
   * Última conexión de cada estudiante, con los días transcurridos.
   *
   * Envoltura pública de `_ultimasSesiones` para las vistas que no trabajan con
   * porcentajes sino con notas (el Progreso Individual). Devuelve la fecha tal
   * cual y `dias` en días completos, o `null` cuando el estudiante nunca ha
   * registrado sesión: en ese caso no hay inactividad que medir y no debe
   * contarse como riesgo por inactividad.
   *
   * @param {number} docenteId
   * @param {number[]} ids
   * @returns {Promise<Map<number, {ultima: Date|null, dias: number|null}>>}
   */
  static async ultimasConexiones(docenteId, ids) {
    const ultimas = await this._ultimasSesiones(docenteId, ids);
    const ahora = Date.now();

    const salida = new Map();
    for (const id of ids) {
      const ultima = ultimas.get(id) || null;
      salida.set(id, {
        ultima,
        dias: ultima ? Math.floor((ahora - new Date(ultima).getTime()) / MS_DIA) : null,
      });
    }
    return salida;
  }

  /**
   * % de acierto por tipo de actividad y estudiante dentro de la ventana.
   *
   * Es la entrada de la calificación de respaldo: cuando el estudiante todavía
   * no tiene nota registrada, `notaDesdeAcierto` (definiciones.js) convierte
   * este promedio ponderado en una nota de la escala 1.0 - 5.0. Los pesos por
   * tipo salen de `PESOS_ACTIVIDAD`, así que el reparto juego/evaluación/
   * contenido se ajusta por `.env` sin tocar SQL.
   *
   * Solo entra lo que lleva nota (`puntaje_maximo > 0`): los contenidos no
   * declaran máximo de puntaje y su acierto no sería comparable.
   *
   * @param {number} docenteId
   * @param {number[]} ids
   * @param {Date} desde - inclusivo
   * @returns {Promise<Map<number, {juego: number|null, evaluacion: number|null}>>}
   */
  static async _aciertoPorTipo(docenteId, ids, desde) {
    if (ids.length === 0) return new Map();

    const filas = await sequelize.query(
      `SELECT i.estudiante_id, i.tipo,
              AVG(100.0 * i.puntaje_obtenido / i.puntaje_maximo) AS pct,
              COUNT(*) AS intentos
         FROM actividad_intentos i
        WHERE i.docente_id = ?
          AND i.iniciado_en >= ?
          AND i.puntaje_maximo IS NOT NULL
          AND i.puntaje_maximo > 0
          AND i.estudiante_id IN (${this._marcadores(ids)})
        GROUP BY i.estudiante_id, i.tipo`,
      {
        replacements: [docenteId, desde, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const porId = new Map();
    for (const f of filas) {
      if (!porId.has(f.estudiante_id)) porId.set(f.estudiante_id, {});
      porId.get(f.estudiante_id)[f.tipo] = {
        pct: f.pct == null ? null : Math.round(Number(f.pct) * 10) / 10,
        intentos: Number(f.intentos) || 0,
      };
    }
    return porId;
  }

  /**
   * XP mensual promedio del grupo, en el mismo grano que la serie del estudiante.
   *
   * La serie del detalle está en `progreso_estudiante`, que solo guarda el MEJOR
   * resultado por actividad. Para que la línea de comparación sea honrada se
   * calcula el mismo grano (XP del mes por estudiante) y se promedia entre
   * estudiantes, en lugar de dividir la suma del grupo por el número de
   * estudiantes: así un mes en el que solo trabajó uno no desplaza la referencia
   * del resto.
   *
   * @param {number} docenteId
   * @param {number[]} ids - estudiantes contra los que se compara
   * @param {{meses?: number}} [opciones]
   * @returns {Promise<Map<string, number>>} `'AAAA-MM'` -> XP promedio
   */
  static async xpMensualPromedio(docenteId, ids, { meses = 12 } = {}) {
    if (ids.length === 0) return new Map();

    const filas = await sequelize.query(
      `SELECT mes, AVG(total) AS promedio
         FROM (
           SELECT DATE_FORMAT(fecha, '%Y-%m') AS mes,
                  estudiante_id,
                  SUM(puntaje) AS total
             FROM progreso_estudiante
            WHERE estudiante_id IN (${this._marcadores(ids)})
              AND puntaje > 0
            GROUP BY mes, estudiante_id
         ) por_estudiante
        GROUP BY mes
        ORDER BY mes DESC
        LIMIT ${Number(meses) || 12}`,
      {
        replacements: ids,
        type: sequelize.QueryTypes.SELECT,
      }
    );

    return new Map(
      filas.map((f) => [
        f.mes,
        Math.round(Number(f.promedio || 0) * 10) / 10,
      ])
    );
  }

  /**
   * Une calificaciones y XP por estudiante en filas comparables.
   *
   * Ninguno de los dos conjuntos contiene al otro: hay quien tiene XP y no
   * calificación con nota (no es posible, pero sí quien tiene calificación y se
   * le puede haber perdido el XP si cambió la ventana) y hay quien no tiene
   * ninguna de las dos. Se parte de `ids` para no perder a esos últimos, que son
   * justamente los que el docente necesita ver.
   *
   * @returns {Promise<Array<object>>} una fila por estudiante de `ids`
   */
  static async _filasEstudiante(docenteId, ids, desde) {
    const [calificaciones, xps, nombres] = await Promise.all([
      this._calificaciones(docenteId, ids, desde),
      this._xpPorEstudiante(docenteId, ids, desde),
      this._nombresEstudiantes(ids),
    ]);

    const porId = new Map(calificaciones.map((f) => [f.estudiante_id, f]));

    return ids.map((id) => {
      const cal = porId.get(id);
      const pct = cal && cal.promedio != null ? Math.round(Number(cal.promedio)) : null;
      return {
        estudiante_id: id,
        alias: aliasDe(nombres.get(id)),
        pct,
        nivel: nivelDeDesempeno(pct),
        xp: xps.get(id) || 0,
        intentos: Number((cal && cal.intentos) || 0),
        completados: Number((cal && cal.completados) || 0),
      };
    });
  }

  /** Forma de los KPI cuando el docente no tiene estudiantes: todo a cero/null. */
  static _kpisVacias(conf) {
    return {
      participacion: { pct: 0, estudiantes_activos: 0, estudiantes: 0 },
      progreso: { pct: null, nivel: null },
      riesgo: { total: 0, truncado: false, aliases: [] },
      xp: { promedio: null, estudiantes: 0 },
      activos: { horas: conf.activos_horas, total: 0, pct: 0 },
    };
  }

  /**
   * KPIs de cabecera del Resumen General.
   *
   * Devuelve `actual` y `anterior` con la MISMA forma para que la interfaz
   * calcule la variación sin duplicar la lógica ni depender de rutas anidadas:
   * leer `actual.participacion.pct` funciona, leer `participacion.actual.pct`
   * devolvería `undefined` y la variación sería NaN.
   *
   * @returns {Promise<object>}
   */
  static async resumen(docenteId, { grupoId = null, semanas = 8 } = {}) {
    const ids = await this._estudiantesDocente(docenteId, grupoId);
    const conf = umbrales();
    const { desde, desdeAnterior, hastaAnterior } = this._ventanas(semanas);
    const total = ids.length;

    const vacias = this._kpisVacias(conf);
    const vacio = {
      alcance: { estudiantes: 0, grupos: 0 },
      periodo: this._periodo(semanas, desde),
      periodo_anterior: this._periodo(semanas, desdeAnterior, hastaAnterior),
      umbrales: conf,
      actual: vacias,
      anterior: vacias,
      diagnostico: { intentos: 0 },
    };

    if (total === 0) return vacio;

    const [grupos] = await sequelize.query(
      `SELECT COUNT(*) AS n FROM grupos
        WHERE docente_id = :docenteId AND (:grupoId IS NULL OR id = :grupoId)`,
      {
        replacements: { docenteId, grupoId: grupoId ? Number(grupoId) : null },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // Todo lo que sigue son consultas independientes: en serie la tarjeta
    // tardaría la suma de todas.
    const [actual, anterior, riesgo, riesgoAnterior, activos] = await Promise.all([
      this._agregadosVentana(docenteId, ids, desde, null),
      this._agregadosVentana(docenteId, ids, desdeAnterior, hastaAnterior),
      this._estudiantesRiesgo(docenteId, ids),
      this._estudiantesRiesgo(docenteId, ids, { hasta: hastaAnterior }),
      this._activosRecientes(docenteId, ids, conf.activos_horas),
    ]);

    return {
      alcance: { estudiantes: total, grupos: Number(grupos.n) },
      periodo: this._periodo(semanas, desde),
      periodo_anterior: this._periodo(semanas, desdeAnterior, hastaAnterior),
      umbrales: conf,
      actual: {
        participacion: {
          pct: Math.round((actual.estudiantes_activos / total) * 100),
          estudiantes_activos: actual.estudiantes_activos,
          estudiantes: total,
        },
        progreso: {
          pct: actual.pct_progreso == null ? null : Math.round(actual.pct_progreso),
          nivel: nivelDeDesempeno(actual.pct_progreso),
        },
        riesgo: {
          total: riesgo.total,
          truncado: riesgo.truncado,
          aliases: riesgo.aliases,
        },
        xp: {
          promedio: actual.xp_promedio == null ? null : Math.round(actual.xp_promedio),
          estudiantes: actual.xp_estudiantes,
        },
        activos: {
          horas: conf.activos_horas,
          total: activos.actual,
          pct: activos.pct_actual,
        },
      },
      anterior: {
        participacion: {
          pct: Math.round((anterior.estudiantes_activos / total) * 100),
          estudiantes_activos: anterior.estudiantes_activos,
          estudiantes: total,
        },
        progreso: {
          pct: anterior.pct_progreso == null ? null : Math.round(anterior.pct_progreso),
          nivel: nivelDeDesempeno(anterior.pct_progreso),
        },
        // La lista de aliases del período anterior no se devuelve: la vista solo
        // muestra los de ahora, y el conteo alcanza para la variación.
        riesgo: {
          total: riesgoAnterior.total,
          truncado: riesgoAnterior.truncado,
          aliases: [],
        },
        xp: {
          promedio: anterior.xp_promedio == null ? null : Math.round(anterior.xp_promedio),
          estudiantes: anterior.xp_estudiantes,
        },
        activos: {
          horas: conf.activos_horas,
          total: activos.anterior,
          pct: activos.pct_anterior,
        },
      },
      diagnostico: { intentos: actual.intentos },
    };
  }

  /* ------------------------------------------------------------------ *
   *  Gráfica: progreso por tema
   * ------------------------------------------------------------------ */

  /**
   * Cubos semanales alineados a lunes, del más antiguo al de esta semana.
   *
   * La serie cubre las `semanas` semanas MÁS RECIENTES, incluida la semana en
   * curso. Se ancla al lunes de hoy y se camina hacia atrás, en vez de tomar
   * `hoy - semanas*7` y alinear hacia delante: alinear hacia delante dejaba
   * fuera la semana actual, que es justo donde cae toda la actividad reciente.
   *
   * @returns {Array<{clave: string, etiqueta: string, desde: Date}>}
   */
  static _cubosSemana(semanas) {
    const dowHoy = (new Date().getDay() + 6) % 7; // 0 = lunes
    const lunesActual = new Date(Date.now() - dowHoy * MS_DIA);
    const primero = new Date(lunesActual.getTime() - (semanas - 1) * 7 * MS_DIA);

    const cubos = [];
    for (let i = 0; i < semanas; i += 1) {
      const desde = new Date(primero.getTime() + i * 7 * MS_DIA);
      cubos.push({
        // La clave se calcula sobre su propio lunes: así coincide exactamente
        // con `YEARWEEK(..., 3)` de MariaDB.
        clave: this._claveSemana(desde),
        etiqueta: desde.toISOString().slice(5, 10),
        desde,
      });
    }
    return cubos;
  }

  /**
   * Clave YEARWEEK modo 3 (semana que arranca en lunes) de una fecha, calculada
   * en JS para poder rellenar las semanas vacías de la serie.
   */
  static _claveSemana(fecha) {
    const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
    // El jueves de la semana actual decide el año ISO; se retrocede al lunes.
    const dia = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dia);
    const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const semana = Math.ceil(((d - inicioAnio) / MS_DIA + 1) / 7);
    return `${d.getUTCFullYear()}${String(semana).padStart(2, '0')}`;
  }

  /**
   * Progreso por tema: una serie por tema (módulo) y un punto por semana del
   * período, en porcentaje de logro.
   *
   * "Tema" es el módulo de la actividad (`actividad_intentos.modulo`), que es lo
   * que el docente ya ve organizado en la plataforma. Solo entra lo que lleva
   * nota (juegos y evaluaciones): un contenido no tiene `puntaje_maximo`, y
   * promediarlo como 0 hundiría la línea de un módulo que el estudiante sí está
   * trabajando.
   *
   * Se devuelven los temas con una `clave` estable (`t1`, `t2`...) en vez del
   * nombre crudo: el módulo es texto libre y usarlo de `dataKey` en Recharts es
   * pedir que un nombre con tilde o espacio rompa la gráfica.
   *
   * @returns {Promise<{temas: Array, serie: Array, periodo: object}>}
   */
  static async progresoPorTema(
    docenteId,
    { grupoId = null, semanas = 8, maxTemas = MAX_TEMAS_POR_DEFECTO } = {}
  ) {
    const ids = await this._estudiantesDocente(docenteId, grupoId);
    const limite = Math.max(1, Math.min(Number(maxTemas) || MAX_TEMAS_POR_DEFECTO, MAX_TEMAS_TOPE));
    const cubos = this._cubosSemana(semanas);

    if (ids.length === 0) {
      return {
        temas: [],
        serie: cubos.map((c) => ({ semana: c.etiqueta })),
        periodo: { semanas },
      };
    }

    const filas = await sequelize.query(
      `SELECT i.modulo,
              YEARWEEK(i.iniciado_en, 3) AS semana,
              AVG(100.0 * i.puntaje_obtenido / NULLIF(i.puntaje_maximo, 0)) AS pct,
              COUNT(*) AS intentos
         FROM actividad_intentos i
        WHERE i.docente_id = ?
          AND i.iniciado_en >= ?
          AND i.puntaje_maximo IS NOT NULL
          AND i.puntaje_maximo > 0
          AND i.modulo IS NOT NULL
          AND i.modulo <> ''
          AND i.estudiante_id IN (${this._marcadores(ids)})
        GROUP BY i.modulo, YEARWEEK(i.iniciado_en, 3)`,
      {
        replacements: [docenteId, cubos[0].desde, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (filas.length === 0) {
      return {
        temas: [],
        serie: cubos.map((c) => ({ semana: c.etiqueta })),
        periodo: { semanas },
      };
    }

    const porTema = new Map();
    for (const f of filas) {
      const nombre = String(f.modulo).trim();
      if (!nombre) continue;
      if (!porTema.has(nombre)) porTema.set(nombre, { nombre, intentos: 0, puntos: new Map() });
      const tema = porTema.get(nombre);
      tema.intentos += Number(f.intentos || 0);
      tema.puntos.set(String(f.semana), Number(f.pct));
    }

    // Se eligen los temas con más actividad, no los de mejor nota: un módulo con
    // un solo intento del 100% no es "el tema donde van bien", es ruido con línea
    // propia y un eje reajustado a ese punto.
    //
    // El desempate por nombre hace el orden estable entre consultas: si no, dos
    // módulos con el mismo número de intentos pueden intercambiarse las claves y
    // la leyenda dejaría de corresponder con la consulta anterior.
    const ordenados = [...porTema.values()]
      .sort((a, b) => b.intentos - a.intentos || a.nombre.localeCompare(b.nombre))
      .slice(0, limite);

    const temas = ordenados.map((t, idx) => ({ clave: `t${idx + 1}`, nombre: t.nombre }));

    const serie = cubos.map((c) => {
      const punto = { semana: c.etiqueta };
      ordenados.forEach((t, idx) => {
        const valor = t.puntos.get(c.clave);
        // `null` y no 0 en las semanas sin actividad: Recharts corta la línea
        // donde no hay dato, y un 0 se leería como "les fue mal esa semana",
        // que es una afirmación que los datos no hacen.
        punto[`t${idx + 1}`] = valor == null ? null : Math.round(valor);
      });
      return punto;
    });

    const ocultos = porTema.size - ordenados.length;

    return {
      temas,
      serie,
      periodo: { semanas },
      ...(ocultos > 0 ? { temas_ocultos: ocultos } : {}),
    };
  }

  /* ------------------------------------------------------------------ *
   *  Vistas auxiliares
   * ------------------------------------------------------------------ */

  /**
   * Serie semanal de intentos y estudiantes activos.
   *
   * Rellena las semanas sin actividad con ceros: un hueco en el eje del gráfico
   * se lee como "no hay datos" cuando en realidad significa "nadie visitó esa
   * semana". El eje queda continuo y el docente ve el hueco real.
   */
  static async tendencia(docenteId, { grupoId = null, semanas = 8 } = {}) {
    const ids = await this._estudiantesDocente(docenteId, grupoId);
    const cubos = this._cubosSemana(semanas);

    const filas = ids.length
      ? await sequelize.query(
          `SELECT YEARWEEK(i.iniciado_en, 3) AS semana,
                  COUNT(*) AS intentos,
                  COUNT(DISTINCT i.estudiante_id) AS estudiantes_activos,
                  SUM(CASE WHEN i.completado = 1 THEN 1 ELSE 0 END) AS completados
             FROM actividad_intentos i
            WHERE i.docente_id = ?
              AND i.iniciado_en >= ?
              AND i.estudiante_id IN (${this._marcadores(ids)})
            GROUP BY YEARWEEK(i.iniciado_en, 3)
            ORDER BY semana`,
          {
            replacements: [docenteId, cubos[0].desde, ...ids],
            type: sequelize.QueryTypes.SELECT,
          }
        )
      : [];

    const porSemana = new Map(filas.map((f) => [String(f.semana), f]));

    return {
      serie: cubos.map((c) => {
        const fila = porSemana.get(c.clave);
        return {
          semana: c.etiqueta,
          intentos: fila ? Number(fila.intentos) : 0,
          estudiantes_activos: fila ? Number(fila.estudiantes_activos) : 0,
          completados: fila ? Number(fila.completados) : 0,
        };
      }),
      periodo: { semanas },
    };
  }

  /**
   * Ranking de estudiantes del período: top N y total de estudiantes con nota.
   *
   * Se limita a los tipos que llevan nota (juego y evaluación) para que la
   * posición signifique algo; meter contenidos sin calificar desempata a todos.
   * El desempate es estable (porcentaje → XP → intentos) porque sin él dos
   * estudiantes con la misma nota cambian de lugar en cada recarga y un top 5 que
   * se refresca solo parpadea, que es justo lo que no debe pasar.
   *
   * `total_estudiantes` cuenta solo a quien tiene nota, porque es el universo en
   * el que un top N tiene sentido: un grupo con 30 alumnos donde 4 resolvieron
   * algo no tiene un "top 5 de 30".
   */
  static async ranking(docenteId, { grupoId = null, limite = 5, semanas = 8 } = {}) {
    const sinNada = {
      top: [],
      total_estudiantes: 0,
      actualizado_en: new Date().toISOString(),
    };

    const ids = await this._estudiantesDocente(docenteId, grupoId);
    if (ids.length === 0) return sinNada;

    const { desde } = this._ventanas(semanas);
    const filas = await this._filasEstudiante(docenteId, ids, desde);

    const conNota = filas.filter((f) => f.pct != null);
    const ordenados = this._ordenar(conNota, 'pct');

    return {
      top: ordenados.slice(0, limite).map((f, idx) => ({ ...f, posicion: idx + 1 })),
      total_estudiantes: ordenados.length,
      actualizado_en: new Date().toISOString(),
    };
  }

  /**
   * Orden estable por un campo numérico.
   *
   * El desempate siempre es el mismo (porcentaje → XP → intentos → alias) para
   * cualquier columna: si no, dos estudiantes empatados cambiarían de lugar al
   * cambiar de columna y la tabla daría un salto al pulsar la flecha.
   *
   * Un `pct` null va siempre al final. Ordenarlo como 0 lo mezclaría con los que
   * sacaron cero, que es una afirmación distinta: uno no tiene nota y el otro
   *uspended.
   */
  static _ordenar(filas, campo) {
    return [...filas].sort((a, b) => {
      const va = a[campo];
      const vb = b[campo];
      if (va == null && vb == null) return a.alias.localeCompare(b.alias);
      if (va == null) return 1;
      if (vb == null) return -1;
      return (
        vb - va
        || (b.pct ?? -1) - (a.pct ?? -1)
        || b.xp - a.xp
        || b.intentos - a.intentos
        || a.alias.localeCompare(b.alias)
      );
    });
  }

  /* ------------------------------------------------------------------ *
   *  Vista de Grupo
   *
   *  Lo que aquí se agrupa por nivel, por estudiante y por grupo ya está
   *  calculado en `_filasEstudiante`: cada bloque de abajo es una lectura
   *  distinta de esos mismos números, no un segundo cálculo.
   * ------------------------------------------------------------------ */

  /**
   * Distribución de estudiantes por nivel de desempeño.
   *
   * Devuelve los cuatro niveles SIEMPRE, en el mismo orden y con la misma clave
   * estable (`n1`..`n4`), aunque valgan cero: una leyenda que aparece y desaparece
   * según los datos obliga a releer la gráfica cada vez, y `dataKey` de Recharts
   * tiene que existir en todas las filas o la serie se descuadra.
   *
   * Los porcentajes son sobre los estudiantes CON nota, no sobre el total del
   * grupo. Por eso se devuelve `sin_datos` aparte y el rótulo lo dice: si de 30
   * alumnos solo 10 tienen actividad calificada, un "40% Bajo" calculado sobre 30
   * sería mentira.
   *
   * @returns {Promise<object>}
   */
  static async distribucionNiveles(docenteId, { grupoId = null, semanas = 8 } = {}) {
    const ids = await this._estudiantesDocente(docenteId, grupoId);
    const conf = umbrales();
    const { desde } = this._ventanas(semanas);

    const base = {
      umbrales: conf,
      periodo: this._periodo(semanas, desde),
      alcance: { estudiantes: ids.length },
    };

    // Sin retorno temprano: con el alcance vacio `conDato` queda vacio y los
    // cuatro niveles salen en 0 con `pct: null`, que es la misma forma que ve
    // la interfaz que tiene datos. Los tres helpers cortan antes de tocar la
    // base cuando `ids` esta vacio, asi que no hay consultas de sobra.
    const filas = await this._filasEstudiante(docenteId, ids, desde);
    const conDato = filas.filter((f) => f.pct != null);
    const total = conDato.length;

    // Un objeto plano y no un `Map`: los nombres de nivel son un conjunto
    // cerrado de cuatro que ya viene de `umbrales()`, y `cuenta[nivel] || 0`
    // da 0 sin tener que inicializar las claves de antemano.
    const cuenta = {};
    for (const f of conDato) cuenta[f.nivel] = (cuenta[f.nivel] || 0) + 1;

    // De peor a mejor: en una barra apilada el ojo va de izquierda a derecha y
    // esta es la dirección en que un docente lee "cuántos hay por encima".
    const orden = [...conf.niveles].reverse();
    const niveles = orden.map(({ nivel, minimo }, idx) => ({
      clave: `n${idx + 1}`,
      nivel,
      minimo,
      estudiantes: cuenta[nivel] || 0,
      // Con total 0 no hay porcentaje que defender: se deja en null para que la
      // interfaz muestre "—" en vez de un 0% que parece una medición.
      pct: total ? Math.round(((cuenta[nivel] || 0) / total) * 100) : null,
    }));

    return {
      ...base,
      niveles,
      con_datos: total,
      sin_datos: ids.length - total,
    };
  }

  /**
   * Ranking completo, ordenable por calificación o por XP.
   *
   * A diferencia de `ranking()`, aquí entran TAMBIÉN los estudiantes sin nota, con
   * `pct` y `nivel` en `null`: el top N responde "¿quién va mejor?" y este
   * responde "¿quién no ha hecho nada?", que es una pregunta distinta y para el
   * docente igual de urgente.
   *
   * No devuelve `posicion`: la posición depende del orden que elija la tabla, y
   * un número calculado en el servidor quedaría descolocado al pulsar la flecha.
   * La interfaz numera.
   *
   * @returns {Promise<{filas: Array, total: number, con_datos: number, sin_datos: number}>}
   */
  static async rankingCompleto(
    docenteId,
    { grupoId = null, limite = 200, semanas = 8, orden = 'pct' } = {}
  ) {
    const ids = await this._estudiantesDocente(docenteId, grupoId);
    const { desde } = this._ventanas(semanas);
    const base = {
      periodo: this._periodo(semanas, desde),
      alcance: { estudiantes: ids.length },
    };
    if (ids.length === 0) {
      return { ...base, filas: [], con_datos: 0, sin_datos: 0, truncado: false };
    }

    const filas = await this._filasEstudiante(docenteId, ids, desde);
    const ordenados = this._ordenar(filas, orden);
    const con_datos = filas.filter((f) => f.pct != null).length;
    const recorte = Math.max(1, Math.min(Number(limite) || 200, 500));

    return {
      ...base,
      filas: ordenados.slice(0, recorte),
      con_datos,
      sin_datos: ids.length - con_datos,
      truncado: ordenados.length > recorte,
    };
  }

  /**
   * Mapa de calor estudiantes × actividades.
   *
   * Las columnas son las actividades PUBLICADAS del docente más las que
   * aparecen en los intentos del grupo (por si algo se despublicó después):
   * una matriz de lo que el grupo tiene que hacer, no solo de lo que ya hizo.
   * Las filas son todos los estudiantes del alcance, alias incluido y nunca el
   * correo.
   *
   * Cuando hay muchas actividades se muestran las de más movimiento y se
   * devuelve cuántas quedaron fuera, en vez de recortar en silencio: un mapa
   * que aparenta ser el grupo entero y no lo es hace planning sobre datos que
   * no se están viendo.
   */
  static async mapaCalor(
    docenteId,
    { grupoId = null, semanas = 8, limite = MAPA_ACTIVIDADES_POR_DEFECTO } = {}
  ) {
    const ids = await this._estudiantesDocente(docenteId, grupoId);
    const { desde } = this._ventanas(semanas);
    const base = {
      estados: ESTADOS_MAPA,
      periodo: this._periodo(semanas, desde),
      alcance: { estudiantes: ids.length, actividades: 0 },
    };

    if (ids.length === 0) {
      return { ...base, estudiantes: [], actividades: [], celdas: [], ocultos: { actividades: 0, estudiantes: 0 } };
    }

    const marcadores = this._marcadores(ids);
    const tope = Math.max(1, Math.min(Number(limite) || MAPA_ACTIVIDADES_POR_DEFECTO, MAPA_ACTIVIDADES_TOPE));

    // El mismo `UNION` de Attempt y las tres tablas de actividades del docente.
    // `MAX(u.nombre)` es lo que hace aparecer el titulo real: sin agrupar, MySQL
    // devuelve el `nombre` de la primera fila del `UNION ALL`, y como la rama de
    // intentos lo trae a NULL el encabezado salia como "Contenido #1741". El
    // placeholder de la cabecera cubre la actividad borrada tras el intento.
    const actividades = await sequelize.query(
      `SELECT u.tipo, u.actividad_id, MAX(u.nombre) AS nombre
         FROM (
           SELECT i.tipo, i.actividad_id, NULL AS nombre
             FROM actividad_intentos i
            WHERE i.docente_id = ?
              AND i.iniciado_en >= ?
              AND i.estudiante_id IN (${marcadores})
            GROUP BY i.tipo, i.actividad_id
           UNION ALL
           SELECT 'contenido', c.id, c.titulo
             FROM contenidos c
            WHERE c.docente_id = ? AND c.publicado = 1
           UNION ALL
           SELECT 'juego', j.id, j.titulo
             FROM juegos j
            WHERE j.docente_id = ? AND j.publicado = 1
           UNION ALL
           SELECT 'evaluacion', e.id, e.titulo
             FROM evaluaciones e
            WHERE e.docente_id = ? AND e.publicado = 1
         ) u
        GROUP BY u.tipo, u.actividad_id
        ORDER BY u.tipo, u.actividad_id`,
      {
        replacements: [docenteId, desde, ...ids, docenteId, docenteId, docenteId, docenteId],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (actividades.length === 0) {
      return {
        ...base,
        estudiantes: [],
        actividades: [],
        celdas: [],
        ocultos: { actividades: 0, estudiantes: 0 },
      };
    }

    const filas = await sequelize.query(
      `SELECT i.estudiante_id,
              i.tipo,
              i.actividad_id,
              MAX(i.completado) AS completado,
              SUM(CASE WHEN i.puntaje_maximo IS NOT NULL AND i.puntaje_maximo > 0
                       THEN 1 ELSE 0 END) AS con_nota,
              MAX(100.0 * i.puntaje_obtenido / NULLIF(i.puntaje_maximo, 0)) AS pct
         FROM actividad_intentos i
        WHERE i.docente_id = ?
          AND i.iniciado_en >= ?
          AND i.estudiante_id IN (${marcadores})
        GROUP BY i.estudiante_id, i.tipo, i.actividad_id`,
      {
        replacements: [docenteId, desde, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // Una fila por estudiante, ordenada por alias (se escanea de arriba abajo) y
    // con las columnas de menor a mayor nivel. El `estudiante_id` real viaja en
    // la fila interna porque hace falta para cruzar los intentos.
        // `_filasEstudiante` ya trae alias, pct y nivel de todo el alcance,
    // incluidos los que no tienen nota: se reutiliza en vez de volver a
    // derivarlos de `_calificaciones`, que solo ve a quien fue puntuado.
    const todosEstudiantes = (await this._filasEstudiante(docenteId, ids, desde))
      .sort((a, b) => a.alias.localeCompare(b.alias) || a.estudiante_id - b.estudiante_id);

    // Prioridad de columnas: primero las que la clase más movió, y a igualdad
    // alfabética. El criterio es "más movimiento" y no "más nota" porque una
    // actividad que nadie tocó es justamente la que el docente tiene que ver, y
    // tampoco puede ir siempre al final: en un grupo de 40 se quedaría fuera con
    // el tope. El desempate alfabético mantiene la cabecera estable entre
    // consultas, que es lo que permite que celda→columna siga siendo válido.
    const actividadPorClave = new Map(
      actividades.map((a) => [`${a.tipo}:${a.actividad_id}`, a])
    );
    const movimiento = new Map();
    for (const f of filas) {
      const clave = `${f.tipo}:${f.actividad_id}`;
      movimiento.set(clave, (movimiento.get(clave) || 0) + 1);
    }

    const tipoLabels = { contenido: 'Contenido', juego: 'Juego', evaluacion: 'Evaluación' };
    // El encabezado y el desempate tienen que salir de la MISMA etiqueta: si el
    // orden usara el nombre crudo, la actividad borrada (nombre null) se
    // comparaba como cadena vacia y se colaba de primera, mientras el docente la
    // leia como "Evaluación #700999". Ordenar por lo que se muestra es lo unico
    // que deja la cabecera estable entre consultas.
    const etiquetaDe = (a) => a.nombre || `${tipoLabels[a.tipo] || 'Actividad'} #${a.actividad_id}`;

    const ordenadas = [...actividadPorClave.entries()]
      .sort(
        (a, b) =>
          (movimiento.get(b[0]) || 0) - (movimiento.get(a[0]) || 0)
          || etiquetaDe(a[1]).localeCompare(etiquetaDe(b[1]))
          || a[1].actividad_id - b[1].actividad_id
      )
      .slice(0, tope)
      .map(([clave, a], idx) => ({
        clave: `a${idx + 1}`,
        // El id crudo viaja en la fila: el cruce de celdas busca
        // `estudiante:tipo:actividad_id` y sin el cada celda salia `pendiente`.
        tipo: a.tipo,
        actividad_id: a.actividad_id,
        nombre: etiquetaDe(a),
      }));

    const visibles = todosEstudiantes.slice(0, MAPA_ESTUDIANTES_TOPE);
    const estudiantes = visibles.map((e, idx) => ({
      clave: `e${idx + 1}`,
      alias: e.alias,
      pct: e.pct,
      nivel: e.nivel,
    }));

    // Índice `estudiante:tipo:actividad` de los intentos, para resolver cada
    // celda en O(1). Son miles de combinaciones y una búsqueda lineal por celda
    // sería cuadrática.
    const porIntento = new Map(
      filas.map((f) => [`${f.estudiante_id}:${f.tipo}:${f.actividad_id}`, f])
    );

    // Solo se emiten las celdas con estado. Las vacías son `pendiente` por
    // definición: una matriz de 40 × 12 con 480 celdas "pendiente" en el JSON es
    // peso muerto, y el constructor de la interfaz rellena el hueco. El estado
    // se valida contra `CLAVES_ESTADO` para que un estado nuevo no se cuele en la
    // leyenda sin color.
    const celdas = [];
    for (const [indice, e] of visibles.entries()) {
      for (const a of ordenadas) {
        const f = porIntento.get(`${e.estudiante_id}:${a.tipo}:${a.actividad_id}`);
        const estado = f ? this.estadoDeCelda(f) : 'pendiente';
        if (!CLAVES_ESTADO.has(estado)) continue;
        celdas.push({
          e: estudiantes[indice].clave,
          a: a.clave,
          estado,
          pct: f && f.pct != null ? Math.round(Number(f.pct)) : null,
        });
      }
    }

    return {
      ...base,
      alcance: { estudiantes: estudiantes.length, actividades: ordenadas.length },
      estudiantes,
      actividades: ordenadas,
      celdas,
      ocultos: {
        actividades: actividadPorClave.size - ordenadas.length,
        estudiantes: todosEstudiantes.length - visibles.length,
      },
    };
  }

  /**
   * Participación semanal (activos ÷ matriculados) y brecha de calificaciones.
   *
   * Dos medidas distintas sobre la misma serie semanal:
   *
   *  - **Participación**: cuántos de los matriculados tuvieron al menos un
   *    intento esa semana. El denominador es el alcance completo y NO cambia
   *    semana a semana, que es lo que hace que la línea sea comparable: si el
   *    denominador fuera "los que entraron esa semana" la línea valdría 100%
   *    siempre.
   *
   *  - **Brecha**: desviación estándar de los porcentajes de la semana. Es
   *    cuánto se separan las calificaciones entre sí, no cuánto rinden: un grupo
   *    entero en 90% tiene brecha 0 y es un problema distinto de uno en 50% con
   *    brecha 40. Sale en su propio eje porque no comparte unidad con la
   *    participación.
   *
   * `brecha` es `null` cuando hay menos de dos intentos calificados esa semana:
   * la desviación de un solo dato es 0 y se leería como "todo el grupo rindió
   * igual", que es justo lo contrario de lo que se sabe.
   */
  static async participacionSemanal(docenteId, { grupoId = null, semanas = 8 } = {}) {
    const ids = await this._estudiantesDocente(docenteId, grupoId);
    const cubos = this._cubosSemana(semanas);
    const matriculados = ids.length;
    const { desde } = this._ventanas(semanas);

    const base = {
      periodo: this._periodo(semanas, desde),
      alcance: { estudiantes: matriculados },
    };

    if (matriculados === 0) {
      return {
        ...base,
        serie: cubos.map((c) => ({
          semana: c.etiqueta,
          matriculados: 0,
          activos: 0,
          pct: null,
          brecha: null,
          intentos: 0,
        })),
      };
    }

    const filas = await sequelize.query(
      `SELECT YEARWEEK(i.iniciado_en, 3) AS semana,
              COUNT(DISTINCT i.estudiante_id) AS activos,
              COUNT(*) AS intentos,
              SUM(CASE WHEN i.puntaje_maximo IS NOT NULL AND i.puntaje_maximo > 0
                       THEN 1 ELSE 0 END) AS calificados,
              STDDEV_POP(100.0 * i.puntaje_obtenido / NULLIF(i.puntaje_maximo, 0)) AS brecha
         FROM actividad_intentos i
        WHERE i.docente_id = ?
          AND i.iniciado_en >= ?
          AND i.estudiante_id IN (${this._marcadores(ids)})
        GROUP BY YEARWEEK(i.iniciado_en, 3)`,
      {
        replacements: [docenteId, desde, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const porSemana = new Map(filas.map((f) => [String(f.semana), f]));

    return {
      ...base,
      serie: cubos.map((c) => {
        const f = porSemana.get(c.clave);
        const activos = f ? Number(f.activos) : 0;
        const calificados = f ? Number(f.calificados) : 0;
        return {
          semana: c.etiqueta,
          matriculados,
          activos,
          pct: Math.round((activos / matriculados) * 100),
          // Un solo dato calificado da desviación 0: se devuelve null para que la
          // barra no insinúe homogeneidad donde no se puede medirla.
          brecha: calificados >= 2 ? Math.round(Number(f.brecha) * 10) / 10 : null,
          intentos: f ? Number(f.intentos) : 0,
        };
      }),
    };
  }

  /**
   * Comparación entre grupos del docente.
   *
   * Solo tiene sentido con más de un grupo: por eso el endpoint NO acepta
   * `grupoId`. Si la barra global filtra por un grupo, la vista esconde este
   * bloque en vez de fingir que compara, y lo dice, porque un panel que aparece
   * y desaparece sin explicación hace que el docente lo busque y no lo encuentre.
   *
   * Un estudiante puede estar en varios grupos (`grupo_estudiantes` es
   * muchos-a-muchos), así que los totales por grupo no suman el total del
   * docente. Se devuelve `grupos` y que la interfaz no afirme un "total" que no
   * existe.
   *
   * Las métricas salen de los mismos cálculos que los KPIs, no de una fórmula
   * nueva: mismo `_filasEstudiante`, mismo criterio de riesgo.
   */
  static async comparacionGrupos(docenteId, { semanas = 8 } = {}) {
    const conf = umbrales();
    const { desde } = this._ventanas(semanas);
    const base = {
      umbrales: conf,
      periodo: this._periodo(semanas, desde),
      alcance: { grupos: 0, estudiantes: 0 },
      grupos: [],
    };

    const filas = await sequelize.query(
      `SELECT g.id, g.nombre, g.materia, ge.estudiante_id
         FROM grupos g
         LEFT JOIN grupo_estudiantes ge ON ge.grupo_id = g.id
        WHERE g.docente_id = ?
        ORDER BY g.materia, g.nombre, g.id`,
      { replacements: [docenteId], type: sequelize.QueryTypes.SELECT }
    );

    if (filas.length === 0) return base;

    // Los ids se deduplican: el mismo estudiante puede estar en tres grupos y sus
    // métricas se calculan una sola vez.
    const porGrupo = new Map();
    for (const f of filas) {
      if (!porGrupo.has(f.id)) {
        porGrupo.set(f.id, { id: f.id, nombre: f.nombre, materia: f.materia, ids: new Set() });
      }
      if (f.estudiante_id != null) porGrupo.get(f.id).ids.add(f.estudiante_id);
    }

    const todosIds = [...new Set([...porGrupo.values()].flatMap((g) => [...g.ids]))];
    if (todosIds.length === 0) {
      return { ...base, alcance: { grupos: porGrupo.size, estudiantes: 0 } };
    }

    const [metricas, ultimas, actividad] = await Promise.all([
      this._filasEstudiante(docenteId, todosIds, desde),
      this._ultimasSesiones(docenteId, todosIds),
      this._actividadPorEstudiante(docenteId, todosIds, desde),
    ]);
    const porId = new Map(metricas.map((m) => [m.estudiante_id, m]));

    const referencia = new Date();
    const grupos = [...porGrupo.values()].map((g) => {
      const ids = [...g.ids];
      const filasGrupo = ids.map((id) => porId.get(id)).filter(Boolean);
      const conDato = filasGrupo.filter((f) => f.pct != null);

      const enRiesgo = filasGrupo.filter((f) => {
        const pct = f.pct;
        if (pct != null && pct < RIESGO_PCT_MAX) return true;
        const ultima = ultimas.get(f.estudiante_id);
        if (!ultima) return false;
        const dias = Math.floor((referencia - new Date(ultima)) / MS_DIA);
        return dias >= RIESGO_DIAS_SIN_INGRESAR;
      }).length;

      const activos = ids.filter((id) => (actividad.get(id) || 0) > 0).length;

      return {
        id: g.id,
        nombre: g.nombre,
        materia: g.materia,
        estudiantes: ids.length,
        sin_datos: ids.length - conDato.length,
        progreso_pct: conDato.length
          ? Math.round(conDato.reduce((s, f) => s + f.pct, 0) / conDato.length)
          : null,
        participacion_pct: ids.length ? Math.round((activos / ids.length) * 100) : null,
        riesgo_pct: ids.length ? Math.round((enRiesgo / ids.length) * 100) : null,
        en_riesgo: enRiesgo,
      };
    });

    return {
      ...base,
      alcance: { grupos: grupos.length, estudiantes: todosIds.length },
      grupos,
    };
  }

  /**
   * Estado de una celda del mapa de calor.
   *
   * El orden importa: "en progreso" solo puede caer cuando el estudiante tocó la
   * actividad y no la terminó, así que la ausencia de intento tiene que ganar
   * antes de que cualquier otra regla la pise.
   */
  static estadoDeCelda(f) {
    if (Number(f.completado || 0) === 1) return 'completado';
    if (Number(f.con_nota || 0) > 0) return 'con_errores';
    return 'en_progreso';
  }

  /**
   * Top N conceptos (contenidos/evaluaciones/juegos) con mayor número de errores.
   *
   * Un "error" se cuenta como un intento que no quedó completado (`completado = 0`).
   * El total de intentos se calcula sobre TODAS las filas de la actividad, no
   * solo sobre las fallidas: si solo se contaran las fallidas, `errores` y
   * `intentos` serían siempre iguales y el porcentaje de fallo no se podría
   * calcular en el frontend.
   *
   * Se hace `LEFT JOIN` con las tablas reales para devolver el título de la
   * actividad en lugar de un placeholder tipo "Contenido #1740". Si la actividad
   * fue borrada, el `COALESCE` no encuentra nada y se cae al placeholder.
   *
   * @param {object} obj - { grupoId?: number, top?: number, semanas?: number }
   * @returns {Promise<{top: Array}>}
   */
  static async conceptosError(docenteId, { grupoId = null, top = 5, semanas = 8 } = {}) {
    const ids = await DashboardService._estudiantesDocente(docenteId, grupoId);
    if (ids.length === 0) return { top: [] };

    // Se acota el límite superior: aunque el controller ya lo valida, el
    // service no debe confiar en que siempre se llame desde ahí.
    const limite = Math.max(1, Math.min(Number(top) || 5, 20));
    const { desde } = this._ventanas(semanas);

    const filas = await sequelize.query(
      `SELECT i.actividad_id,
              i.tipo,
              COUNT(*) AS intentos,
              SUM(CASE WHEN i.completado = 0 THEN 1 ELSE 0 END) AS errores,
              -- ↓↓↓ Ajusta tablas/columnas si tu esquema es distinto ↓↓↓
              COALESCE(c.titulo, j.titulo, e.titulo) AS nombre_real
         FROM actividad_intentos i
         LEFT JOIN contenidos   c ON i.tipo = 'contenido'  AND c.id = i.actividad_id
         LEFT JOIN juegos       j ON i.tipo = 'juego'      AND j.id = i.actividad_id
         LEFT JOIN evaluaciones e ON i.tipo = 'evaluacion' AND e.id = i.actividad_id
        WHERE i.docente_id = ?
          AND i.iniciado_en >= ?
          AND i.estudiante_id IN (${DashboardService._marcadores(ids)})
        GROUP BY i.actividad_id, i.tipo, nombre_real
        HAVING errores > 0
        ORDER BY errores DESC, intentos DESC
        LIMIT ${limite}`,
      {
        replacements: [docenteId, desde, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const tipoLabels = { contenido: 'Contenido', juego: 'Juego', evaluacion: 'Evaluación' };

    return {
      top: filas.map((f) => {
        const intentos = Number(f.intentos);
        const errores = Number(f.errores);
        return {
          actividad_id: f.actividad_id,
          tipo: f.tipo,
          // Si el JOIN no encontró el título (actividad borrada), caemos al
          // placeholder para no mostrar "null" en la UI.
          nombre: f.nombre_real || `${tipoLabels[f.tipo] || 'Actividad'} #${f.actividad_id}`,
          errores,
          intentos,
          pct_error: intentos ? Math.round((errores / intentos) * 100) : 0,
        };
      }),
    };
  }

  /* ------------------------------------------------------------------ *
   *  Gamificación
   * ------------------------------------------------------------------ */

  /**
   * Las tres piezas de gamificación del docente: qué insignias se reparten, cómo
   * se reparte el XP y si la constancia trae insignias.
   *
   * Deliberadamente NO incluye ranking, calificaciones ni niveles de
   * desempeño. El ranking y los niveles ya están en la Vista de Grupo y las
   * calificaciones en el Progreso Individual: repetirlos aquí daría al docente
   * tres veredictos distintos sobre el mismo alumno, y además son preguntas de
   * logro, no de motivación. Esta sección responde solo "¿qué insignias está
   * ganando la clase y a qué se debe?".
   *
   * @returns {Promise<object>}
   */
  static async gamificacion(docenteId, { grupoId = null, semanas = 8 } = {}) {
    const ids = await this._estudiantesDocente(docenteId, grupoId);
    const { desde } = this._ventanas(semanas);

    const base = {
      periodo: this._periodo(semanas, desde),
      alcance: { estudiantes: ids.length },
      rarezas: RAREZAS,
      grupos_insignias: GRUPOS_INSIGNIAS,
    };

    // Sin estudiantes no hay nada que contar, y los `IN ()` vacíos de las
    // consultas de abajo son un error de sintaxis en MySQL: se corta antes.
    if (ids.length === 0) {
      return {
        ...base,
        totales: {
          otorgadas: 0,
          disponibles: MedalsService.catalogo().size,
          estudiantes_con_insignias: 0,
          sin_insignias: 0,
        },
        mas_obtenidas: [],
        menos_obtenidas: [],
        xp_rangos: RANGOS_XP.map((r) => ({ ...r, estudiantes: 0 })),
        xp_total: 0,
        xp_promedio: null,
        con_xp: 0,
        sin_xp: 0,
        continuidad: [],
        sin_registro: true,
      };
    }

    const [conteoPorMedalla, conteoPorEstudiante, xp, nombres, diasActividad] = await Promise.all([
      this._conteoMedallas(docenteId, ids),
      this._insigniasPorEstudiante(docenteId, ids),
      this._xpPorEstudiante(docenteId, ids, desde),
      this._nombresEstudiantes(ids),
      this._diasActivosPorEstudiante(docenteId, ids, desde),
    ]);

    /* ---------------- Insignias más y menos obtenidas ---------------- */
    const catalogo = MedalsService.catalogo();
    const total = ids.length;

    const insignias = [...conteoPorMedalla.entries()].map(([medallaId, estudiantes]) => {
      const meta = catalogo.get(medallaId);
      const pct = total ? Math.round((estudiantes / total) * 100) : 0;
      return {
        medalla_id: medallaId,
        // Sin entrada en el catálogo (insignia retirada) se muestra el id, que
        // es feo pero cierto, en vez de un "null" en la lista.
        nombre: meta ? meta.nombre : medallaId,
        categoria: meta ? meta.categoria : null,
        estudiantes,
        de: total,
        pct,
        rareza: this._rarezaDe(pct),
      };
    });

    // Más obtenidas: primero las que más estudiantes tienen; a igual cuenta, la de
    // nombre más corto, para que la lista no se reordene entre recargas.
    const masOrdenadas = [...insignias].sort(
      (a, b) => b.estudiantes - a.estudiantes || a.nombre.localeCompare(b.nombre)
    );
    // Menos obtenidas: primero las que menos tienen, y a igual cuenta la de
    // nombre más largo, para que "la más difícil de conseguir" salga arriba.
    const menosOrdenadas = [...insignias].sort(
      (a, b) => a.estudiantes - b.estudiantes || b.nombre.localeCompare(a.nombre)
    );

    const recorte = (lista, n) => lista.slice(0, n);

    /* ---------------- Histograma de XP por rango ---------------- */
    const xpPorRango = RANGOS_XP.map((r) => ({ clave: r.clave, etiqueta: r.etiqueta, estudiantes: 0 }));
    let xpTotal = 0;
    let conXp = 0;
    for (const id of ids) {
      // Sin fila significa 0 XP y se cuenta en el rango "0": un estudiante que
      // no ha jugado no puede desaparecer del histograma.
      const valor = Number(xp.get(id) || 0);
      const idx = RANGOS_XP.findIndex((r) => valor >= r.minimo && valor <= r.maximo);
      if (idx >= 0) xpPorRango[idx].estudiantes += 1;
      xpTotal += valor;
      if (valor > 0) conXp += 1;
    }

    /* ---------------- Continuidad vs. insignias ---------------- */
    const continuidad = ids.map((id) => {
      // Sin fila de medallas significa 0 insignias: mismo criterio que el XP.
      const quantas = Number(conteoPorEstudiante.get(id) || 0);
      return {
        estudiante_id: id,
        alias: aliasDe(nombres.get(id)),
        dias: Number(diasActividad.get(id) || 0),
        insignias: quantas,
        grupo: this._grupoInsignias(quantas),
      };
    });

    // Ordenado por días: en la dispersión el eje X es la continuidad, y que el
    // orden de las filas coincida con el del eje hace el gráfico legible.
    continuidad.sort((a, b) => a.dias - b.dias || b.insignias - a.insignias);

    const conInsignias = continuidad.filter((c) => c.insignias > 0).length;

    return {
      ...base,
      totales: {
        otorgadas: insignias.length,
        // El catálogo completo, aunque nadie las tenga todavía: es el techo
        // alcanzable y sin él "3 de 50" no se puede interpretar.
        disponibles: catalogo.size,
        estudiantes_con_insignias: conInsignias,
        sin_insignias: total - conInsignias,
      },
      mas_obtenidas: recorte(masOrdenadas, 8),
      menos_obtenidas: recorte(menosOrdenadas, 8),
      xp_rangos: xpPorRango,
      xp_total: xpTotal,
      // Promedio entre los que tienen XP: promediar con los ceros de arriba
      // hundiría la cifra solo por los que todavía no han jugado.
      xp_promedio: conXp ? Math.round(xpTotal / conXp) : null,
      con_xp: conXp,
      sin_xp: total - conXp,
      continuidad,
      // Sin ninguna insignia registrada el resto de los bloques se ve vacío y la
      // interfaz avisa de que la tabla se puebla cuando el alumno entra a su
      // panel de gamificación.
      sin_registro: insignias.length === 0,
    };
  }

  /** Rareza a partir del porcentaje de estudiantes del alcance que tiene la insignia. */
  static _rarezaDe(pct) {
    const encontrada = RAREZAS.find((r) => pct >= r.minimo);
    return encontrada ? encontrada.clave : 'rara';
  }

  /** Bucket de insignias de un estudiante, para el color de la dispersión. */
  static _grupoInsignias(n) {
    const encontrado = GRUPOS_INSIGNIAS.find((g) => n >= g.minimo && n <= g.maximo);
    return encontrado ? encontrado.clave : 'g3';
  }

  /**
   * Cuántos estudiantes del alcance tienen cada insignia.
   *
   * El filtro de grupo no se hace con un JOIN a `grupo_estudiantes` porque `ids`
   * ya viene filtrado por `_estudiantesDocente()`: se reutiliza esa lista en vez
   * de volver a consultar la pertenencia a grupos.
   *
   * @returns {Promise<Map<string, number>>} `medalla_id` -> estudiantes
   */
  static async _conteoMedallas(docenteId, ids) {
    const filas = await sequelize.query(
      `SELECT m.medalla_id, COUNT(DISTINCT m.estudiante_id) AS estudiantes
         FROM medallas_obtenidas m
        WHERE m.docente_id = ?
          AND m.estudiante_id IN (${this._marcadores(ids)})
        GROUP BY m.medalla_id`,
      {
        replacements: [docenteId, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );
    return new Map(filas.map((f) => [f.medalla_id, Number(f.estudiantes)]));
  }

  /** Insignias por estudiante del alcance. */
  static async _insigniasPorEstudiante(docenteId, ids) {
    const filas = await sequelize.query(
      `SELECT m.estudiante_id, COUNT(DISTINCT m.medalla_id) AS insignias
         FROM medallas_obtenidas m
        WHERE m.docente_id = ?
          AND m.estudiante_id IN (${this._marcadores(ids)})
        GROUP BY m.estudiante_id`,
      {
        replacements: [docenteId, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );
    return new Map(filas.map((f) => [Number(f.estudiante_id), Number(f.insignias)]));
  }

  /**
   * Días con actividad por estudiante dentro de la ventana.
   *
   * `COUNT(DISTINCT DATE(iniciado_en))` y no `COUNT(*)`: la constancia se mide
   * en días distintos, no en intentos. Diez intentos el mismo día son un día de
   * uso, no diez.
   *
   * @returns {Promise<Map<number, number>>}
   */
  static async _diasActivosPorEstudiante(docenteId, ids, desde) {
    const filas = await sequelize.query(
      `SELECT i.estudiante_id,
              COUNT(DISTINCT DATE(i.iniciado_en)) AS dias
         FROM actividad_intentos i
        WHERE i.docente_id = ?
          AND i.iniciado_en >= ?
          AND i.estudiante_id IN (${this._marcadores(ids)})
        GROUP BY i.estudiante_id`,
      {
        replacements: [docenteId, desde, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );
    return new Map(filas.map((f) => [Number(f.estudiante_id), Number(f.dias)]));
  }

  /* ------------------------------------------------------------------ *
   *  Contenidos y Actividades
   * ------------------------------------------------------------------ */

  /**
   * KPIs, estado global y detalle por actividad de los contenidos de un docente.
   *
   * A diferencia del resto del panel, aquí la unidad de análisis es la
   * ACTIVIDAD y no el estudiante: qué contenidos tiene el docente, cómo se
   * completan, cuáles se abandonan, cuánto tardan y qué tan difíciles resultan.
   *
   * El inventario (`creadas_por_ti`) no se acota a la ventana: "cuánto creó" es
   * un hecho sobre la biblioteca del docente. Todo lo que viene de
   * `actividad_intentos` (KPIs, dona y columnas de la tabla) sí se acota a la
   * ventana de `semanas` y al `grupoId` del filtro.
   *
   * @returns {Promise<object>}
   */
  static async contenidos(docenteId, { grupoId = null, semanas = 8 } = {}) {
    const ids = await this._estudiantesDocente(docenteId, grupoId);
    const { desde } = this._ventanas(semanas);
    const umbral = umbrales();

    const [inventario, conteo, intentos, duraciones] = await Promise.all([
      this._inventarioContenidos(docenteId),
      this._conteoRecursos(docenteId),
      ids.length ? this._intentosPorContenido(docenteId, ids, desde) : [],
      ids.length ? this._duracionesPorContenido(docenteId, ids, desde) : [],
    ]);

    /* ---------------- Mediana de duración por actividad ---------------- */
    const duracionesPorActividad = new Map();
    for (const d of duraciones) {
      const clave = `${d.tipo}:${Number(d.actividad_id)}`;
      if (!duracionesPorActividad.has(clave)) duracionesPorActividad.set(clave, []);
      duracionesPorActividad.get(clave).push(Number(d.duracion_seg));
    }
    const medianaDe = (valores) => {
      if (!valores || valores.length === 0) return null;
      const orden = [...valores].sort((a, b) => a - b);
      const medio = Math.floor(orden.length / 2);
      return orden.length % 2
        ? orden[medio]
        : Math.round((orden[medio - 1] + orden[medio]) / 2);
    };

    /* ---------------- Detalle por actividad ---------------- */
    const porClave = (tipo, id) => intentos.find(
      (x) => x.tipo === tipo && Number(x.actividad_id) === Number(id)
    ) || null;

    const conDecimal = (n) => Math.round(n * 10) / 10;

    const tabla = inventario.map((r) => {
      const agg = porClave(r.tipo, r.id);
      const intentosN = agg ? Number(agg.intentos) : 0;
      const completadas = agg ? Number(agg.completadas) : 0;
      const abandonadas = agg ? Number(agg.abandonadas) : 0;
      const acierto = agg && agg.acierto_pct != null ? Number(agg.acierto_pct) : null;

      const finalizacion = intentosN ? conDecimal((completadas / intentosN) * 100) : null;
      const abandono = intentosN ? conDecimal((abandonadas / intentosN) * 100) : null;

      return {
        tipo: r.tipo,
        actividad_id: Number(r.id),
        titulo: r.titulo || 'Sin título',
        modulo: r.modulo || null,
        intentos: intentosN,
        completadas,
        abandonadas,
        en_progreso: agg ? Number(agg.en_progreso) : 0,
        finalizacion,
        abandono,
        // 1 de 1 no dispara la alarma: hace falta muestra mínima además del %.
        abandono_alto: abandono != null
          && abandono >= ABANDONO_ALTO_PCT
          && intentosN >= ABANDONO_MIN_INTENTOS,
        // % de acierto en bruto (1 decimal, ya lo redondea el SQL) y el flag
        // que enciende el ⚠ de la tabla. Los contenidos no registran preguntas
        // ni puntaje, así que `acierto` llega `null` y la interfaz rotula "—".
        acierto: acierto != null ? conDecimal(acierto) : null,
        acierto_bajo: acierto != null && acierto < ACIERTO_BAJO_PCT,
        dificultad: dificultadDe(acierto),
        tiempo_medio_seg: medianaDe(duracionesPorActividad.get(`${r.tipo}:${Number(r.id)}`)),
      };
    });

    /* ---------------- KPI y dona sobre el total de intentos ---------------- */
    const totalIntentos = intentos.reduce((s, x) => s + Number(x.intentos), 0);
    const totalCompletadas = intentos.reduce((s, x) => s + Number(x.completadas), 0);
    const totalAbandonadas = intentos.reduce((s, x) => s + Number(x.abandonadas), 0);
    const totalEnProgreso = totalIntentos - totalCompletadas - totalAbandonadas;
    const pctDe = (n) => (totalIntentos ? conDecimal((n / totalIntentos) * 100) : 0);

    // Dificultad dominante: la etiqueta con más intentos de los medidos, con el
    // conteo de actividades como respaldo. Sin ni una actividad con acierto no
    // se inventa dificultad: se devuelve `null` y la interfaz lo rotula.
    const porDificultad = new Map();
    for (const r of tabla) {
      if (!r.dificultad) continue;
      const entrada = porDificultad.get(r.dificultad.clave) || { actividades: 0, intentos: 0 };
      entrada.actividades += 1;
      entrada.intentos += r.intentos;
      porDificultad.set(r.dificultad.clave, entrada);
    }
    const etiquetaDificultad = new Map(DIFICULTADES.map((d) => [d.clave, d.etiqueta]));
    const dominante = [...porDificultad.entries()]
      .map(([clave, v]) => ({
        clave,
        ...v,
        etiqueta: etiquetaDificultad.get(clave) || clave,
      }))
      .sort((a, b) => b.intentos - a.intentos || b.actividades - a.actividades)[0] || null;

    const creadasPorTipo = {};
    let creadasTotal = 0;
    let creadasPublicadas = 0;
    for (const c of conteo) {
      const total = Number(c.total);
      const publicadas = Number(c.publicadas);
      creadasTotal += total;
      creadasPublicadas += publicadas;
      creadasPorTipo[c.tipo] = { total, publicadas };
    }

    return {
      periodo: this._periodo(semanas, desde),
      alcance: { estudiantes: ids.length },
      // Los umbrales viajan para que el rótulo del "i" diga el número real,
      // igual que el resto del panel rota el criterio desde el backend.
      criterios: {
        dificultad: umbral.dificultad,
        abandono: umbral.abandono,
        acierto: umbral.acierto,
        tiempo: { medida: 'mediana', condicion: 'intentos con duracion_seg > 0' },
      },
      creadas_por_ti: {
        total: creadasTotal,
        publicadas: creadasPublicadas,
        borradores: creadasTotal - creadasPublicadas,
        por_tipo: creadasPorTipo,
      },
      kpis: {
        finalizacion_promedio: totalIntentos
          ? conDecimal((totalCompletadas / totalIntentos) * 100)
          : null,
        abandono_promedio: totalIntentos
          ? conDecimal((totalAbandonadas / totalIntentos) * 100)
          : null,
        tiempo_medio_seg: medianaDe(duraciones.map((d) => Number(d.duracion_seg))),
        tiempo_cobertura: { con_duracion: duraciones.length, total: totalIntentos },
        dificultad_dominante: dominante
          ? { ...dominante, sin_dato: tabla.filter((r) => !r.dificultad).length }
          : null,
      },
      dona: {
        total: totalIntentos,
        segmentos: [
          {
            clave: 'completada',
            etiqueta: 'Completadas',
            cantidad: totalCompletadas,
            pct: pctDe(totalCompletadas),
          },
          {
            clave: 'en_progreso',
            etiqueta: 'En progreso',
            cantidad: totalEnProgreso,
            pct: pctDe(totalEnProgreso),
          },
          {
            clave: 'abandonada',
            etiqueta: 'Abandonadas',
            cantidad: totalAbandonadas,
            pct: pctDe(totalAbandonadas),
          },
        ],
      },
      tabla,
    };
  }

  /**
   * Recursos publicados del docente, para las filas de la tabla.
   *
   * Se limita a `publicado = 1` porque es lo que los estudiantes llegan a
   * intentar: una actividad en borrador jamás tendrá métricas, pero sí fila.
   * Las tres tablas viajan en un `UNION ALL` para tener un solo array de filas
   * con la misma forma { tipo, id, titulo, modulo }.
   */
  static async _inventarioContenidos(docenteId) {
    return sequelize.query(
      `SELECT 'contenido' AS tipo, id, titulo, modulo
         FROM contenidos
        WHERE docente_id = ? AND publicado = 1
       UNION ALL
       SELECT 'juego', id, titulo, modulo
         FROM juegos
        WHERE docente_id = ? AND publicado = 1
       UNION ALL
       SELECT 'evaluacion', id, titulo, modulo
         FROM evaluaciones
        WHERE docente_id = ? AND publicado = 1`,
      {
        replacements: [docenteId, docenteId, docenteId],
        type: sequelize.QueryTypes.SELECT,
      }
    );
  }

  /** Cuántos recursos creó el docente, con los publicados aparte. */
  static async _conteoRecursos(docenteId) {
    return sequelize.query(
      `SELECT 'contenido' AS tipo, COUNT(*) AS total, SUM(publicado = 1) AS publicadas
         FROM contenidos WHERE docente_id = ?
       UNION ALL
       SELECT 'juego', COUNT(*), SUM(publicado = 1)
         FROM juegos WHERE docente_id = ?
       UNION ALL
       SELECT 'evaluacion', COUNT(*), SUM(publicado = 1)
         FROM evaluaciones WHERE docente_id = ?`,
      {
        replacements: [docenteId, docenteId, docenteId],
        type: sequelize.QueryTypes.SELECT,
      }
    );
  }

  /**
   * Agregado de intentos por actividad, en la ventana y del alcance.
   *
   * El % de acierto se honra en tres fuentes según la columna que el intento
   * trae: `aciertos / preguntas_total` para las evaluaciones (que sí registran
   * las preguntas), `puntaje_obtenido / puntaje_maximo` para los juegos (que no
   * registran aciertos) y `NULL` para los contenidos — no tienen ni preguntas ni
   * puntaje, así que su dificultad queda "Sin dato" en vez de rotularse con un
   * número inventado.
   */
  static async _intentosPorContenido(docenteId, ids, desde) {
    return sequelize.query(
      `SELECT i.tipo,
              i.actividad_id,
              COUNT(*) AS intentos,
              SUM(i.completado = 1) AS completadas,
              SUM(i.abandono = 1) AS abandonadas,
              SUM(i.completado = 0 AND i.abandono = 0) AS en_progreso,
              ROUND(AVG(CASE
                WHEN i.preguntas_total > 0 THEN 100.0 * i.aciertos / i.preguntas_total
                WHEN i.puntaje_maximo > 0 THEN 100.0 * i.puntaje_obtenido / i.puntaje_maximo
                ELSE NULL
              END), 1) AS acierto_pct
         FROM actividad_intentos i
        WHERE i.docente_id = ?
          AND i.iniciado_en >= ?
          AND i.estudiante_id IN (${this._marcadores(ids)})
        GROUP BY i.tipo, i.actividad_id`,
      {
        replacements: [docenteId, desde, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );
  }

  /**
   * Duraciones > 0 de la ventana y del alcance, para la mediana.
   *
   * Se leen en bruto y la mediana se calcula en JS porque MySQL no trae una
   * mediana de serie. El filtro `> 0` es deliberado: un intento con
   * `duracion_seg = 0` no registró duración, y promediarlo hundiría la cifra.
   */
  static async _duracionesPorContenido(docenteId, ids, desde) {
    return sequelize.query(
      `SELECT i.tipo, i.actividad_id, i.duracion_seg
         FROM actividad_intentos i
        WHERE i.docente_id = ?
          AND i.iniciado_en >= ?
          AND i.duracion_seg > 0
          AND i.estudiante_id IN (${this._marcadores(ids)})`,
      {
        replacements: [docenteId, desde, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );
  }
}

module.exports = DashboardService;