const DashboardService = require('../services/dashboard.service');

/**
 * El docente a veces quiere ver la clase entera y no solo el podio, así que el
 * tope son 200 filas en lugar de 5. El valor por defecto sigue siendo 5 para no
 * romper a quien ya consume el endpoint. Como la respuesta incluye
 * `total_estudiantes`, el frontend puede avisar si la lista vino truncada.
 */
const MAX_FILAS_RANKING = 200;
const RANKING_POR_DEFECTO = 5;
const CONCEPTOS_POR_DEFECTO = 5;
const MAX_CONCEPTOS = 20;
const TEMAS_POR_DEFECTO = 6;
const MAX_TEMAS = 12;
const RANKING_COMPLETO_POR_DEFECTO = 200;
const MAX_RANKING_COMPLETO = 500;
const MAPA_ACTIVIDADES_POR_DEFECTO = 12;
const MAX_MAPA_ACTIVIDADES = 20;

/**
 * Columnas por las que se puede ordenar el ranking completo.
 *
 * Se acota a una lista blanca en vez de usar el `dataKey` que llega del
 * navegador: el nombre de la columna viaja a la interfaz y desde ahí vuelve
 * como `?orden=`, así que sin esta comprobación un `?orden=` invented se
 * acabaría interpolado en un `ORDER BY`.
 */
const ORDENES_RANKING = new Set(['pct', 'xp']);

/**
 * Endpoints del panel analítico del docente.
 *
 * Todos leen el `docente_id` del JWT. El `grupoId` de la URL es solo un filtro
 * opcional y se valida contra los grupos de ese docente antes de usarse, para
 * que un `grupoId` ajeno devuelva 404 en vez de filtrar datos de otro.
 */
class DashboardController {
  /** Normaliza `?semanas=` a un entero acotado. */
  static _semanas(req) {
    const n = Number.parseInt(req.query.semanas, 10);
    if (!Number.isInteger(n) || n < 1) return 8;
    return Math.min(n, 26);
  }

  /** Valida el grupo o corta la petición con 404. */
  static async _grupo(req) {
    const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;
    if (!grupoId || !Number.isInteger(grupoId)) return { grupoId: null, error: null };
    const ok = await DashboardService.grupoEsDelDocente(req.user.id, grupoId);
    return ok ? { grupoId, error: null } : { grupoId: null, error: 'Grupo no encontrado.' };
  }

  /**
   * `_intento()` de `?param=` dentro de un rango, con valor por defecto.
   *
   * Los top N llegan desde la interfaz y no son críticos para la seguridad, pero
   * se acotan igual en el borde del servidor: es el mismo número que va
   * interpolado en el `LIMIT` del SQL, así que no puede quedar sin validar.
   */
  static _entero(req, param, porDefecto, max) {
    const n = Number.parseInt(req.query[param], 10);
    if (!Number.isInteger(n) || n < 1) return porDefecto;
    return Math.min(n, max);
  }

  static async resumen(req, res) {
    try {
      const { grupoId, error } = await DashboardController._grupo(req);
      if (error) return res.status(404).json({ success: false, message: error });

      const data = await DashboardService.resumen(req.user.id, {
        grupoId,
        semanas: DashboardController._semanas(req),
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[dashboard] Error en resumen:', error);
      return res.status(500).json({ success: false, message: 'No se pudo cargar el resumen.' });
    }
  }

  static async tendencia(req, res) {
    try {
      const { grupoId, error } = await DashboardController._grupo(req);
      if (error) return res.status(404).json({ success: false, message: error });

      const data = await DashboardService.tendencia(req.user.id, {
        grupoId,
        semanas: DashboardController._semanas(req),
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[dashboard] Error en tendencia:', error);
      return res.status(500).json({ success: false, message: 'No se pudo cargar la tendencia.' });
    }
  }

  static async progresoPorTema(req, res) {
    try {
      const { grupoId, error } = await DashboardController._grupo(req);
      if (error) return res.status(404).json({ success: false, message: error });

      const data = await DashboardService.progresoPorTema(req.user.id, {
        grupoId,
        semanas: DashboardController._semanas(req),
        maxTemas: DashboardController._entero(req, 'temas', TEMAS_POR_DEFECTO, MAX_TEMAS),
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[dashboard] Error en progresoPorTema:', error);
      return res
        .status(500)
        .json({ success: false, message: 'No se pudo cargar el progreso por tema.' });
    }
  }

  static async ranking(req, res) {
    try {
      const { grupoId, error } = await DashboardController._grupo(req);
      if (error) return res.status(404).json({ success: false, message: error });

      const data = await DashboardService.ranking(req.user.id, {
        grupoId,
        limite: DashboardController._entero(req, 'limite', RANKING_POR_DEFECTO, MAX_FILAS_RANKING),
        semanas: DashboardController._semanas(req),
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[dashboard] Error en ranking:', error);
      return res.status(500).json({ success: false, message: 'No se pudo cargar el ranking.' });
    }
  }

  static async conceptosError(req, res) {
    try {
      const { grupoId, error } = await DashboardController._grupo(req);
      if (error) return res.status(404).json({ success: false, message: error });

      const data = await DashboardService.conceptosError(req.user.id, {
        grupoId,
        top: DashboardController._entero(req, 'top', CONCEPTOS_POR_DEFECTO, MAX_CONCEPTOS),
        semanas: DashboardController._semanas(req),
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[dashboard] Error en conceptosError:', error);
      return res
        .status(500)
        .json({ success: false, message: 'No se pudo cargar los conceptos con error.' });
    }
  }

  /* ------------------------------------------------------------------ *
   *  Vista de Grupo
   * ------------------------------------------------------------------ */

  static async distribucionNiveles(req, res) {
    try {
      const { grupoId, error } = await DashboardController._grupo(req);
      if (error) return res.status(404).json({ success: false, message: error });

      const data = await DashboardService.distribucionNiveles(req.user.id, {
        grupoId,
        semanas: DashboardController._semanas(req),
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[dashboard] Error en distribucionNiveles:', error);
      return res
        .status(500)
        .json({ success: false, message: 'No se pudo cargar la distribución por nivel.' });
    }
  }

  static async rankingCompleto(req, res) {
    try {
      const { grupoId, error } = await DashboardController._grupo(req);
      if (error) return res.status(404).json({ success: false, message: error });

      const orden = ORDENES_RANKING.has(req.query.orden) ? req.query.orden : 'pct';
      const data = await DashboardService.rankingCompleto(req.user.id, {
        grupoId,
        limite: DashboardController._entero(req, 'limite', RANKING_COMPLETO_POR_DEFECTO, MAX_RANKING_COMPLETO),
        semanas: DashboardController._semanas(req),
        orden,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[dashboard] Error en rankingCompleto:', error);
      return res.status(500).json({ success: false, message: 'No se pudo cargar el ranking completo.' });
    }
  }

  static async mapaCalor(req, res) {
    try {
      const { grupoId, error } = await DashboardController._grupo(req);
      if (error) return res.status(404).json({ success: false, message: error });

      const data = await DashboardService.mapaCalor(req.user.id, {
        grupoId,
        semanas: DashboardController._semanas(req),
        limite: DashboardController._entero(req, 'actividades', MAPA_ACTIVIDADES_POR_DEFECTO, MAX_MAPA_ACTIVIDADES),
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[dashboard] Error en mapaCalor:', error);
      return res.status(500).json({ success: false, message: 'No se pudo cargar el mapa de calor.' });
    }
  }

  static async participacionSemanal(req, res) {
    try {
      const { grupoId, error } = await DashboardController._grupo(req);
      if (error) return res.status(404).json({ success: false, message: error });

      const data = await DashboardService.participacionSemanal(req.user.id, {
        grupoId,
        semanas: DashboardController._semanas(req),
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[dashboard] Error en participacionSemanal:', error);
      return res
        .status(500)
        .json({ success: false, message: 'No se pudo cargar la participación semanal.' });
    }
  }

  /**
   * Comparación entre grupos.
   *
   * No valida `grupoId` a propósito: comparar grupos con uno de ellos filtrado no
   * tiene respuesta. La barra global esconde este bloque cuando hay un grupo
   * seleccionado, así que si alguien llega aquí con `?grupoId=`, lo que gana es
   * la comparación completa, no un error.
   */
  static async comparacionGrupos(req, res) {
    try {
      const data = await DashboardService.comparacionGrupos(req.user.id, {
        semanas: DashboardController._semanas(req),
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[dashboard] Error en comparacionGrupos:', error);
      return res
        .status(500)
        .json({ success: false, message: 'No se pudo comparar los grupos.' });
    }
  }
/**
   * Gamificación: insignias más/menos obtenidas, histograma de XP y relación
   * entre constancia e insignias.
   *
   * No acepta más parámetros que `grupoId` y `semanas`, a diferencia de
   * `ranking` o `mapaCalor`: esta sección no tiene paginación ni top-N
   * configurable, y un parámetro que se ignorase en silencio sería peor que no
   * ofrecerlo.
   */
  static async gamificacion(req, res) {
    try {
      const { grupoId, error } = await DashboardController._grupo(req);
      if (error) return res.status(404).json({ success: false, message: error });

      const data = await DashboardService.gamificacion(req.user.id, {
        grupoId,
        semanas: DashboardController._semanas(req),
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[dashboard] Error en gamificacion:', error);
      return res
        .status(500)
        .json({ success: false, message: 'No se pudo cargar la gamificación.' });
    }
  }

  /**
   * Contenidos y Actividades: KPIs de uso, estado global y detalle por actividad.
   *
   * Igual que `gamificacion`, solo acepta `grupoId` y `semanas`: el inventario
   * y la tabla no se paginan ni se recortan, ya que el docente tiene que poder
   * ver TODAS sus actividades y no un top-N que se le quedaría corto.
   */
  static async contenidos(req, res) {
    try {
      const { grupoId, error } = await DashboardController._grupo(req);
      if (error) return res.status(404).json({ success: false, message: error });

      const data = await DashboardService.contenidos(req.user.id, {
        grupoId,
        semanas: DashboardController._semanas(req),
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[dashboard] Error en contenidos:', error);
      return res
        .status(500)
        .json({ success: false, message: 'No se pudieron cargar los contenidos.' });
    }
  }
}

module.exports = DashboardController;