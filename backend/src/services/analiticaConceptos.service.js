const { sequelize } = require('../config/database');
const DashboardService = require('./dashboard.service');
const { aliasDe } = require('./dashboard.definiciones');

/**
 * Analítica de conceptos con mayor error, con detalle por intento.
 *
 * Decisiones de diseño:
 *  - El "concepto" diagnosticado es la ACTIVIDAD que ya lista la gráfica
 *    "Conceptos con mayor error" del Resumen General. Esa gráfica sale de
 *    `DashboardService.conceptosError`, así que el resumen se delega a esa
 *    misma función: las cifras coinciden siempre (requisito de aceptación).
 *  - El detalle (opción elegida, palabras no encontradas, pistas falladas,
 *    relaciones erróneas, intentos del memotest) sale de las tablas de detalle
 *    por intento. Los intentos anteriores a esa captura se reportan como
 *    "sin detalle" y NUNCA se estiman.
 *  - Solo se exponen alias (`u.name`), nunca correos.
 *  - El acceso se limita a actividades del propio docente.
 */

/** Menos de N respuestas por elemento => "Pocos datos". Configurable. */
const MIN_RESPUESTAS = Math.max(1, Number(process.env.ANALITICA_MIN_RESPUESTAS) || 5);

/** Topes defensivos del heatmap estudiantes x elementos. */
const MAX_ESTUDIANTES_MATRIZ = 60;
const MAX_ELEMENTOS_MATRIZ = 30;

/** TTL del cache en memoria de consultas pesadas. */
const CACHE_TTL_MS = Number(process.env.ANALITICA_CACHE_MS) || 30000;

const cacheStore = new Map();

/** Cache en memoria con TTL. Clave -> valor. */
const conCache = (clave, fn, ttlMs = CACHE_TTL_MS) => {
  const ahora = Date.now();
  const hit = cacheStore.get(clave);
  if (hit && ahora - hit.t < ttlMs) return Promise.resolve(hit.v);
  return Promise.resolve(fn()).then((valor) => {
    cacheStore.set(clave, { v: valor, t: Date.now() });
    return valor;
  });
};

/** Limpia el cache (usado por las pruebas). */
const limpiarCache = () => cacheStore.clear();

const normalizarOpcion = (valor) => {
  if (valor == null) return null;
  const letra = String(valor).trim().toLowerCase();
  return /^[a-z]$/.test(letra) ? letra : null;
};

const truncar = (texto, max = 90) => {
  if (texto == null) return '';
  const t = String(texto);
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const pct = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);

class AnaliticaConceptosService {
  /**
   * Resumen de conceptos (actividades) con mayor error. Delega en
   * `conceptosError` para respetar las cifras del Resumen General y agrega
   * estudiantes afectados y cobertura de detalle.
   */
  static async resumen(docenteId, opciones = {}) {
    const { grupoId = null, semanas = 8, top = 5, tipo = null, actividadId = null } = opciones;
    const clave = `resumen:${docenteId}:${grupoId}:${semanas}:${top}:${tipo}:${actividadId}`;

    return conCache(clave, async () => {
      const base = await DashboardService.conceptosError(docenteId, { grupoId, semanas, top: 20 });
      let items = Array.isArray(base.top) ? base.top : [];
      if (tipo) items = items.filter((c) => c.tipo === tipo);
      if (actividadId) items = items.filter((c) => Number(c.actividad_id) === Number(actividadId));
      const limite = Math.max(1, Math.min(Number(top) || 5, 20));
      items = items.slice(0, limite);

      const ids = await DashboardService._estudiantesDocente(docenteId, grupoId);
      const { desde } = DashboardService._ventanas(semanas);

      const conceptos = [];
      for (const item of items) {
        const estudiantes = ids.length
          ? await this._estudiantesAfectados(docenteId, ids, desde, item)
          : 0;
        const cobertura = ids.length
          ? await this._cobertura(docenteId, ids, desde, item)
          : { intentos: item.intentos, con_detalle: 0, sin_detalle: item.intentos };

        conceptos.push({
          id: item.actividad_id,
          actividad_id: item.actividad_id,
          tipo: item.tipo,
          tipo_juego: item.tipo_juego || null,
          concepto: item.nombre,
          nombre: item.nombre,
          errores: item.errores,
          intentos: item.intentos,
          pct_error: item.pct_error,
          estudiantes_afectados: estudiantes,
          cobertura,
        });
      }

      return {
        conceptos,
        minimo_respuestas: MIN_RESPUESTAS,
        actualizado_en: new Date().toISOString(),
      };
    });
  }

  /**
   * Distribución de respuestas por pregunta (evaluaciones) o por elemento
   * (juegos), ordenada por cantidad de errores.
   *
   * @param {number} docenteId
   * @param {{tipo:string, actividadId:number}} concepto
   */
  static async preguntas(docenteId, concepto, opciones = {}) {
    const actividad = await this._actividadDelDocente(docenteId, concepto);
    if (!actividad) return null;

    const { grupoId = null, semanas = 8, soloErrores = false } = opciones;
    const clave = `preg:${docenteId}:${actividad.tipo}:${actividad.actividad_id}:${grupoId}:${semanas}:${soloErrores}`;

    return conCache(clave, async () => {
      const ids = await DashboardService._estudiantesDocente(docenteId, grupoId);
      const { desde } = DashboardService._ventanas(semanas);

      const base = {
        concepto: {
          id: actividad.actividad_id,
          tipo: actividad.tipo,
          concepto: actividad.titulo,
        },
        minimo_respuestas: MIN_RESPUESTAS,
        periodo: DashboardService._periodo(semanas, desde),
      };

      // Para evaluaciones se devuelve la definición completa de preguntas aunque
      // todavía no haya respuestas. Para juegos, sin estudiantes no hay elementos.
      if (ids.length === 0 && actividad.tipo !== 'evaluacion') {
        return { ...base, items: [], total_respuestas: 0, sin_detalle: true };
      }

      const items = actividad.tipo === 'evaluacion'
        ? await this._preguntasEvaluacion(docenteId, ids, desde, actividad.actividad_id)
        : await this._elementosJuego(docenteId, ids, desde, actividad.actividad_id, actividad.juego);

      const total = items.reduce((acc, it) => acc + it.total, 0);
      const filtrados = soloErrores ? items.filter((it) => it.errores > 0) : items;

      return {
        ...base,
        items: filtrados,
        total_respuestas: total,
        sin_detalle: total === 0,
      };
    });
  }

  /**
   * Mapa de confusión (respuesta esperada x respuesta elegida). Solo tiene
   * sentido para relacionar y adivinanza; el resto devuelve `soportado:false`.
   */
  static async confusiones(docenteId, concepto, opciones = {}) {
    const actividad = await this._actividadDelDocente(docenteId, concepto);
    if (!actividad) return null;

    const { grupoId = null, semanas = 8 } = opciones;
    const clave = `conf:${docenteId}:${actividad.tipo}:${actividad.actividad_id}:${grupoId}:${semanas}`;

    return conCache(clave, async () => {
      const base = {
        concepto: {
          id: actividad.actividad_id,
          tipo: actividad.tipo,
          concepto: actividad.titulo,
        },
      };

      const tipoElemento = actividad.tipo === 'juego' && actividad.juego
        ? AnaliticaConceptosService._tipoElementoConfusion(actividad.juego.tipo)
        : null;

      if (!tipoElemento) {
        return {
          ...base,
          soportado: false,
          motivo: actividad.tipo === 'evaluacion'
            ? 'Para evaluaciones usa la distribución por pregunta.'
            : 'Este tipo de juego no produce un mapa de confusión.',
        };
      }

      const ids = await DashboardService._estudiantesDocente(docenteId, grupoId);
      if (ids.length === 0) {
        return { ...base, soportado: true, filas: [], columnas: [], celdas: [], max: 0 };
      }

      const { desde } = DashboardService._ventanas(semanas);
      const marcadores = DashboardService._marcadores(ids);
      const filas = await sequelize.query(
        `SELECT d.concepto AS origen, d.esperado AS esperado, d.respuesta_dada AS elegido,
                COUNT(*) AS n
           FROM juego_intento_elementos d
           JOIN actividad_intentos i ON i.id = d.intento_id
          WHERE i.docente_id = ?
            AND i.iniciado_en >= ?
            AND i.tipo = 'juego'
            AND i.actividad_id = ?
            AND d.elemento_tipo = ?
            AND i.estudiante_id IN (${marcadores})
          GROUP BY d.concepto, d.esperado, d.respuesta_dada`,
        {
          replacements: [docenteId, desde, actividad.actividad_id, tipoElemento, ...ids],
          type: sequelize.QueryTypes.SELECT,
        }
      );

      return AnaliticaConceptosService._matrizConfusion(filas, base.concepto);
    });
  }

  /**
   * Mapa de calor estudiantes x elementos. Estado por celda:
   * `acierto`, `error` o `sin_responder`.
   */
  static async estudiantes(docenteId, concepto, opciones = {}) {
    const actividad = await this._actividadDelDocente(docenteId, concepto);
    if (!actividad) return null;

    const { grupoId = null, semanas = 8 } = opciones;
    const clave = `est:${docenteId}:${actividad.tipo}:${actividad.actividad_id}:${grupoId}:${semanas}`;

    return conCache(clave, async () => {
      const base = {
        concepto: {
          id: actividad.actividad_id,
          tipo: actividad.tipo,
          concepto: actividad.titulo,
        },
        estados: ['acierto', 'error', 'sin_responder'],
      };

      const ids = await DashboardService._estudiantesDocente(docenteId, grupoId);
      if (ids.length === 0) {
        return { ...base, elementos: [], filas: [], truncado: false };
      }

      const { desde } = DashboardService._ventanas(semanas);
      const marcadores = DashboardService._marcadores(ids);
      const esEval = actividad.tipo === 'evaluacion';
      const tabla = esEval ? 'evaluacion_intento_respuestas' : 'juego_intento_elementos';
      const colElemento = esEval ? 'd.pregunta_id' : 'd.elemento_clave';
      const joinPregunta = esEval ? 'JOIN preguntas p ON p.id = d.pregunta_id' : '';
      const etiquetaExpr = esEval ? 'MAX(p.pregunta)' : 'MAX(d.concepto)';
      // La columna de "respondido" se llama `respondida` en evaluaciones y
      // `respondido` en juegos; elegimos la correcta según el tipo de actividad.
      const colRespondido = esEval ? 'd.respondida' : 'd.respondido';

      const filas = await sequelize.query(
        `SELECT i.estudiante_id,
                MAX(u.name) AS alias,
                ${colElemento} AS elemento_clave,
                ${etiquetaExpr} AS etiqueta,
                MAX(d.es_correcta) AS hubo_acierto,
                SUM(CASE WHEN ${colRespondido} = 1 THEN 1 ELSE 0 END) AS respondidas
           FROM ${tabla} d
           JOIN actividad_intentos i ON i.id = d.intento_id
           ${joinPregunta}
           LEFT JOIN users u ON u.id = i.estudiante_id
          WHERE i.docente_id = ?
            AND i.iniciado_en >= ?
            AND i.tipo = ?
            AND i.actividad_id = ?
            AND i.estudiante_id IN (${marcadores})
          GROUP BY i.estudiante_id, ${colElemento}`,
        {
          replacements: [docenteId, desde, actividad.tipo, actividad.actividad_id, ...ids],
          type: sequelize.QueryTypes.SELECT,
        }
      );

      // En evaluaciones las columnas son TODAS las preguntas de la definición,
      // en orden P1..Pn, para que casen con la sección "Preguntas de la evaluación".
      let columnasDef = null;
      if (esEval) {
        const def = await AnaliticaConceptosService._definicionEvaluacion(actividad.actividad_id);
        columnasDef = def.map((q) => ({
          clave: q.clave,
          numero: q.numero,
          etiqueta: q.etiquetaMatriz,
        }));
      }

      return AnaliticaConceptosService._armarMatriz(filas, columnasDef);
    });
  }

  /* ------------------------------------------------------------------ *
   *  Detalle de evaluaciones y juegos
   * ------------------------------------------------------------------ */

  /**
   * Definición COMPLETA de las preguntas de una evaluación (en orden, con su
   * número P1..Pn). Es la fuente de verdad para la sección "Preguntas de la
   * evaluación": se muestran aunque nadie haya respondido todavía.
   */
  static async _definicionEvaluacion(actividadId) {
    const filas = await sequelize.query(
      `SELECT id, pregunta, opcion_a, opcion_b, opcion_c, opcion_d,
              respuesta_correcta, subtema
         FROM preguntas
        WHERE evaluacion_id = ?
        ORDER BY id`,
      {
        replacements: [actividadId],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    return filas.map((f, i) => ({
      clave: String(f.id),
      numero: i + 1,
      enunciado: f.pregunta || '',
      etiqueta: truncar(f.pregunta, 90),
      etiquetaMatriz: truncar(f.pregunta, 40) || `P${i + 1}`,
      subtema: f.subtema || null,
      correcta: normalizarOpcion(f.respuesta_correcta),
      opciones: {
        a: { texto: f.opcion_a, cantidad: 0 },
        b: { texto: f.opcion_b, cantidad: 0 },
        c: { texto: f.opcion_c, cantidad: 0 },
        d: { texto: f.opcion_d, cantidad: 0 },
      },
      // Las preguntas no tienen columna de imagen en el modelo actual; se deja
      // el campo por si el editor la agrega más adelante.
      imagen: null,
      total: 0,
      correctas: 0,
      sin_responder: 0,
    }));
  }

  static async _preguntasEvaluacion(docenteId, ids, desde, actividadId) {
    const definicion = await AnaliticaConceptosService._definicionEvaluacion(actividadId);
    if (definicion.length === 0) return [];

    const porClave = new Map(definicion.map((q) => [q.clave, q]));

    if (ids.length > 0) {
      const marcadores = DashboardService._marcadores(ids);
      const filas = await sequelize.query(
        `SELECT d.pregunta_id,
                d.opcion_elegida,
                d.respondida,
                COUNT(*) AS n
           FROM evaluacion_intento_respuestas d
           JOIN actividad_intentos i ON i.id = d.intento_id
          WHERE i.docente_id = ?
            AND i.iniciado_en >= ?
            AND i.tipo = 'evaluacion'
            AND i.actividad_id = ?
            AND i.estudiante_id IN (${marcadores})
          GROUP BY d.pregunta_id, d.opcion_elegida, d.respondida`,
        {
          replacements: [docenteId, desde, actividadId, ...ids],
          type: sequelize.QueryTypes.SELECT,
        }
      );

      for (const f of filas) {
        const q = porClave.get(String(Number(f.pregunta_id)));
        if (!q) continue;
        const n = Number(f.n);
        q.total += n;
        const letra = normalizarOpcion(f.opcion_elegida);
        if (Number(f.respondida) === 0 || letra == null) {
          q.sin_responder += n;
        } else if (letra === q.correcta) {
          q.correctas += n;
        } else if (q.opciones[letra]) {
          q.opciones[letra].cantidad += n;
        }
      }
    }

    // Se devuelven TODAS las preguntas en el orden de la definición (P1..Pn),
    // para que casen con las columnas y la numeración de la tabla.
    return definicion.map((q) => {
      const otras = Object.entries(q.opciones)
        .filter(([letra]) => letra !== q.correcta)
        .map(([letra, val]) => ({
          letra,
          texto: val.texto,
          cantidad: val.cantidad,
          pct: pct(val.cantidad, q.total),
        }))
        .sort((a, b) => b.cantidad - a.cantidad);

      const errores = q.total - q.correctas - q.sin_responder;

      return {
        clave: q.clave,
        numero: q.numero,
        tipo: 'evaluacion',
        enunciado: q.enunciado,
        etiqueta: q.etiqueta,
        subtema: q.subtema,
        imagen: q.imagen,
        correcta: q.correcta,
        opciones: q.opciones,
        total: q.total,
        correctas: q.correctas,
        errores,
        sin_responder: q.sin_responder,
        pct_error: pct(errores, q.total),
        otras_incorrectas: otras,
        error_dominante: otras[0] || null,
        pocos_datos: q.total < MIN_RESPUESTAS,
      };
    });
  }

  static async _elementosJuego(docenteId, ids, desde, actividadId, juego) {
    const marcadores = DashboardService._marcadores(ids);
    const filas = await sequelize.query(
      `SELECT d.elemento_clave, d.elemento_tipo, d.concepto,
              d.esperado, d.respuesta_dada, d.es_correcta, d.respondido,
              COUNT(*) AS n
         FROM juego_intento_elementos d
         JOIN actividad_intentos i ON i.id = d.intento_id
        WHERE i.docente_id = ?
          AND i.iniciado_en >= ?
          AND i.tipo = 'juego'
          AND i.actividad_id = ?
          AND i.estudiante_id IN (${marcadores})
        GROUP BY d.elemento_clave, d.elemento_tipo, d.concepto,
                 d.esperado, d.respuesta_dada, d.es_correcta, d.respondido`,
      {
        replacements: [docenteId, desde, actividadId, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const tipoJuego = juego ? juego.tipo : null;
    const opciones = {
      tipo: tipoJuego,
      vacio: tipoJuego === 'sopa_de_letras' ? 'No encontrada' : '(vacío)',
    };

    // El memotest no envía detalle por pareja: se resume como un único
    // elemento con la distribución de cantidad de intentos.
    if (tipoJuego === 'memoria') {
      return AnaliticaConceptosService._resumenMemoria(filas);
    }

    return AnaliticaConceptosService._agregarItems(filas, opciones);
  }

  /**
   * Normaliza filas de `juego_intento_elementos` (sopa, crucigrama, adivinanza,
   * relacionar) a una lista de elementos con conteos de acierto/error.
   */
  static _agregarItems(filas, { tipo, vacio }) {
    const mapa = new Map();
    for (const f of filas) {
      const clave = String(f.elemento_clave);
      if (!mapa.has(clave)) {
        mapa.set(clave, {
          clave,
          tipo,
          etiqueta: truncar(f.concepto || f.esperado, 90),
          enunciado: '',
          total: 0,
          correctas: 0,
          sin_responder: 0,
          otrasMap: new Map(),
        });
      }
      const it = mapa.get(clave);
      const n = Number(f.n);
      it.total += n;
      if (Number(f.es_correcta) === 1) {
        it.correctas += n;
      } else if (Number(f.respondido) === 0) {
        it.sin_responder += n;
      } else {
        const texto = f.respuesta_dada == null ? vacio : String(f.respuesta_dada);
        it.otrasMap.set(texto, (it.otrasMap.get(texto) || 0) + n);
      }
      if (!it.enunciado && f.esperado && f.esperado !== f.concepto) {
        it.enunciado = `Respuesta esperada: ${f.esperado}`;
      }
    }

    return [...mapa.values()]
      .map((it) => AnaliticaConceptosService._cerrarItem(it))
      .sort((a, b) => b.errores - a.errores || b.total - a.total);
  }

  static _resumenMemoria(filas) {
    let total = 0;
    let correctas = 0;
    const intentos = new Map();
    // En el memotest `respuesta_dada` es la cantidad de intentos de la partida.
    // Se promedia sobre partidas con dato numérico; nunca se inventa un valor
    // para las que no lo registraron.
    let sumaIntentos = 0;
    let partidasConDato = 0;
    let intentosMin = null;
    let intentosMax = null;

    for (const f of filas) {
      const n = Number(f.n);
      total += n;
      if (Number(f.es_correcta) === 1) correctas += n;
      const texto = f.respuesta_dada == null ? 'sin dato' : String(f.respuesta_dada);
      intentos.set(texto, (intentos.get(texto) || 0) + n);

      const cantidad = Number(texto);
      if (Number.isFinite(cantidad) && cantidad > 0) {
        sumaIntentos += cantidad * n;
        partidasConDato += n;
        intentosMin = intentosMin == null ? cantidad : Math.min(intentosMin, cantidad);
        intentosMax = intentosMax == null ? cantidad : Math.max(intentosMax, cantidad);
      }
    }

    const distribucion = [...intentos.entries()]
      .map(([texto, cantidad]) => ({
        texto: /^\d+$/.test(texto)
          ? `${texto} intento${texto === '1' ? '' : 's'}`
          : texto,
        cantidad,
        pct: pct(cantidad, total),
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const promedio = partidasConDato ? Math.round((sumaIntentos / partidasConDato) * 10) / 10 : null;

    return [{
      clave: 'memoria',
      tipo: 'memoria',
      etiqueta: 'Memotest',
      enunciado: 'Cantidad de intentos para encontrar todos los pares',
      total,
      correctas,
      errores: total - correctas,
      sin_responder: 0,
      pct_error: pct(total - correctas, total),
      // Métrica legible para el panel: la dificultad del memotest no es una
      // "palabra fallada", sino cuántos intentos necesitó cada partida.
      promedio_intentos: promedio,
      partidas_con_dato: partidasConDato,
      intentos_min: intentosMin,
      intentos_max: intentosMax,
      error_dominante: distribucion[0] || null,
      otras_incorrectas: distribucion,
      distribucion_intentos: distribucion,
      pocos_datos: total < MIN_RESPUESTAS,
    }];
  }

  static _cerrarItem(it) {
    const errores = it.total - it.correctas - it.sin_responder;
    const otras = [...it.otrasMap.entries()]
      .map(([texto, cantidad]) => ({ texto, cantidad, pct: pct(cantidad, it.total) }))
      .sort((a, b) => b.cantidad - a.cantidad);
    return {
      clave: it.clave,
      tipo: it.tipo,
      etiqueta: it.etiqueta || it.clave,
      enunciado: it.enunciado || it.etiqueta || it.clave,
      total: it.total,
      correctas: it.correctas,
      errores,
      sin_responder: it.sin_responder,
      pct_error: pct(errores, it.total),
      error_dominante: otras[0] || null,
      otras_incorrectas: otras,
      pocos_datos: it.total < MIN_RESPUESTAS,
    };
  }

  static _ordenarPorError(items) {
    return [...items].sort((a, b) => b.errores - a.errores || b.total - a.total);
  }

  /* ------------------------------------------------------------------ *
   *  Matrices
   * ------------------------------------------------------------------ */

  static _matrizConfusion(filas, concepto) {
    const celdas = filas.map((f) => ({
      origen: f.origen != null ? String(f.origen) : null,
      esperado: f.esperado != null ? String(f.esperado) : '(sin dato)',
      elegido: f.elegido != null ? String(f.elegido) : '(sin respuesta)',
      cantidad: Number(f.n),
    }));

    const filasM = [...new Set(celdas.map((c) => c.esperado))];
    const columnas = [...new Set(celdas.map((c) => c.elegido))];
    const max = celdas.reduce((m, c) => Math.max(m, c.cantidad), 0);

    return {
      concepto,
      soportado: true,
      filas: filasM,
      columnas,
      celdas,
      max,
      leyenda: 'Más oscuro = más estudiantes eligieron esa opción para ese elemento.',
    };
  }

  static _armarMatriz(filas, columnasDef = null) {
    const porEstudiante = new Map();
    const metaElemento = new Map();

    for (const f of filas) {
      const est = Number(f.estudiante_id);
      const clave = String(f.elemento_clave);

      if (!porEstudiante.has(est)) {
        porEstudiante.set(est, { alias: aliasDe(f.alias), estados: {} });
      }
      let estado;
      if (Number(f.hubo_acierto) === 1) estado = 'acierto';
      else if (Number(f.respondidas) > 0) estado = 'error';
      else estado = 'sin_responder';

      const estudiante = porEstudiante.get(est);
      // Un elemento con varios intentos conserva el peor estado para señalar el
      // punto crítico (error > sin_responder > acierto).
      const actual = estudiante.estados[clave];
      if (
        actual == null ||
        AnaliticaConceptosService._pesoEstado(estado) < AnaliticaConceptosService._pesoEstado(actual)
      ) {
        estudiante.estados[clave] = estado;
      }

      if (!metaElemento.has(clave)) {
        metaElemento.set(clave, { clave, etiqueta: truncar(f.etiqueta, 40) || clave, errores: 0 });
      }
    }

    for (const [clave, meta] of metaElemento) {
      meta.errores = [...porEstudiante.values()].filter((e) => e.estados[clave] === 'error').length;
    }

    let elementos;
    let truncadoElementos;
    if (columnasDef && columnasDef.length) {
      // Evaluaciones: se muestran todas las preguntas de la definición en su
      // orden natural, con el número P1..Pn y los errores que tengan.
      const erroresPorClave = new Map(
        [...metaElemento.values()].map((m) => [m.clave, m.errores])
      );
      elementos = columnasDef.slice(0, MAX_ELEMENTOS_MATRIZ).map((c) => ({
        clave: c.clave,
        numero: c.numero,
        etiqueta: c.etiqueta || c.clave,
        errores: erroresPorClave.get(c.clave) || 0,
      }));
      truncadoElementos = columnasDef.length > MAX_ELEMENTOS_MATRIZ;
    } else {
      elementos = [...metaElemento.values()]
        .sort((a, b) => b.errores - a.errores)
        .slice(0, MAX_ELEMENTOS_MATRIZ);
      truncadoElementos = metaElemento.size > MAX_ELEMENTOS_MATRIZ;
    }
    const clavesVisibles = new Set(elementos.map((e) => e.clave));

    const estudiantes = [...porEstudiante.values()]
      .map((e) => {
        const estados = Object.fromEntries(
          Object.entries(e.estados).filter(([clave]) => clavesVisibles.has(clave))
        );
        return {
          alias: e.alias,
          errores: Object.values(estados).filter((s) => s === 'error').length,
          estados,
        };
      })
      .sort((a, b) => b.errores - a.errores || a.alias.localeCompare(b.alias))
      .slice(0, MAX_ESTUDIANTES_MATRIZ);

    return {
      elementos,
      filas: estudiantes,
      truncado: porEstudiante.size > MAX_ESTUDIANTES_MATRIZ || truncadoElementos,
    };
  }

  static _pesoEstado(estado) {
    if (estado === 'error') return 0;
    if (estado === 'sin_responder') return 1;
    return 2; // acierto
  }

  static _tipoElementoConfusion(tipoJuego) {
    if (tipoJuego === 'relacionar') return 'relacion';
    if (tipoJuego === 'adivinanza') return 'adivinanza';
    return null;
  }

  /* ------------------------------------------------------------------ *
   *  Consultas auxiliares
   * ------------------------------------------------------------------ */

  static async _estudiantesAfectados(docenteId, ids, desde, item) {
    const marcadores = DashboardService._marcadores(ids);
    const [fila] = await sequelize.query(
      `SELECT COUNT(DISTINCT i.estudiante_id) AS n
         FROM actividad_intentos i
        WHERE i.docente_id = ?
          AND i.iniciado_en >= ?
          AND i.tipo = ?
          AND i.actividad_id = ?
          AND i.completado = 0
          AND i.estudiante_id IN (${marcadores})`,
      {
        replacements: [docenteId, desde, item.tipo, item.actividad_id, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );
    return Number((fila && fila.n) || 0);
  }

  static async _cobertura(docenteId, ids, desde, item) {
    const marcadores = DashboardService._marcadores(ids);
    const tabla = item.tipo === 'evaluacion'
      ? 'evaluacion_intento_respuestas'
      : 'juego_intento_elementos';

    const [fila] = await sequelize.query(
      `SELECT COUNT(DISTINCT i.id) AS con_detalle
         FROM ${tabla} d
         JOIN actividad_intentos i ON i.id = d.intento_id
        WHERE i.docente_id = ?
          AND i.iniciado_en >= ?
          AND i.tipo = ?
          AND i.actividad_id = ?
          AND i.estudiante_id IN (${marcadores})`,
      {
        replacements: [docenteId, desde, item.tipo, item.actividad_id, ...ids],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const conDetalle = Number((fila && fila.con_detalle) || 0);
    return {
      intentos: item.intentos,
      con_detalle: conDetalle,
      sin_detalle: Math.max(0, item.intentos - conDetalle),
    };
  }

  /**
   * Resuelve la actividad y valida que pertenezca al docente.
   * @returns {Promise<null|{tipo, actividad_id, titulo, modulo, juego}>}
   */
  static async _actividadDelDocente(docenteId, concepto) {
    if (!concepto || !concepto.tipo || !concepto.actividadId) return null;

    if (concepto.tipo === 'juego') {
      const [juego] = await sequelize.query(
        `SELECT id, titulo, tipo, modulo FROM juegos WHERE id = ? AND docente_id = ? AND publicado = 1`,
        { replacements: [concepto.actividadId, docenteId], type: sequelize.QueryTypes.SELECT }
      );
      if (!juego) return null;
      return {
        tipo: 'juego',
        actividad_id: Number(juego.id),
        titulo: juego.titulo,
        modulo: juego.modulo || null,
        juego,
      };
    }

    const tabla = concepto.tipo === 'evaluacion' ? 'evaluaciones' : 'contenidos';
    const [actividad] = await sequelize.query(
      `SELECT id, titulo, modulo FROM ${tabla} WHERE id = ? AND docente_id = ? AND publicado = 1`,
      { replacements: [concepto.actividadId, docenteId], type: sequelize.QueryTypes.SELECT }
    );
    if (!actividad) return null;
    return {
      tipo: concepto.tipo,
      actividad_id: Number(actividad.id),
      titulo: actividad.titulo,
      modulo: actividad.modulo || null,
      juego: null,
    };
  }

}

module.exports = AnaliticaConceptosService;
module.exports.limpiarCache = limpiarCache;
