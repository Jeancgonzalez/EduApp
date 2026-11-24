const AnaliticaConceptosService = require('../services/analiticaConceptos.service');
const DashboardService = require('../services/dashboard.service');

const TIPOS_VALIDOS = new Set(['contenido', 'juego', 'evaluacion']);
const CONCEPTOS_POR_DEFECTO = 5;
const MAX_CONCEPTOS = 20;

/**
 * Endpoints del panel de diagnóstico por concepto.
 *
 * Todos leen el `docente_id` del JWT (`req.user.id`). El `grupoId` de la URL se
 * valida contra los grupos del docente antes de usarse, y el `:id` del concepto
 * se valida contra las actividades de ese docente en el servicio: un id ajeno
 * devuelve 404, nunca datos de otro.
 */
class AnaliticaController {
  static _semanas(req) {
    const n = Number.parseInt(req.query.semanas, 10);
    if (!Number.isInteger(n) || n < 1) return 8;
    return Math.min(n, 26);
  }

  /** Valida grupo + período. Devuelve `{ grupoId, semanas }` o `{ error }`. */
  static async _contexto(req) {
    const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;
    if (grupoId && !Number.isInteger(grupoId)) {
      return { error: 'Grupo no encontrado.' };
    }
    if (grupoId) {
      const ok = await DashboardService.grupoEsDelDocente(req.user.id, grupoId);
      if (!ok) return { error: 'Grupo no encontrado.' };
    }
    return { grupoId, semanas: AnaliticaController._semanas(req) };
  }

  /** Normaliza el concepto de la URL: `:id` + `?tipo=`. */
  static _concepto(req) {
    const tipo = String(req.query.tipo || '').toLowerCase();
    const actividadId = Number.parseInt(req.params.id, 10);
    if (!TIPOS_VALIDOS.has(tipo)) return null;
    if (!Number.isInteger(actividadId) || actividadId <= 0) return null;
    return { tipo, actividadId };
  }

  /** GET /analitica/conceptos/resumen */
  static async resumen(req, res) {
    try {
      const { grupoId, semanas, error } = await AnaliticaController._contexto(req);
      if (error) return res.status(404).json({ success: false, message: error });

      const tipo = String(req.query.tipo || '').toLowerCase();
      const actividadId = Number.parseInt(req.query.actividadId, 10);

      const data = await AnaliticaConceptosService.resumen(req.user.id, {
        grupoId,
        semanas,
        top: AnaliticaController._top(req),
        tipo: TIPOS_VALIDOS.has(tipo) ? tipo : null,
        actividadId: Number.isInteger(actividadId) ? actividadId : null,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[analitica] Error en resumen de conceptos:', error);
      return res
        .status(500)
        .json({ success: false, message: 'No se pudo cargar el resumen de conceptos.' });
    }
  }

  /** GET /analitica/conceptos/:id/preguntas?tipo= */
  static async preguntas(req, res) {
    const soloErrores = req.query.soloErrores === '1' || req.query.soloErrores === 'true';
    return AnaliticaController._detalle(req, res, 'preguntas', { soloErrores });
  }

  /** GET /analitica/conceptos/:id/confusiones?tipo= */
  static async confusiones(req, res) {
    return AnaliticaController._detalle(req, res, 'confusiones');
  }

  /** GET /analitica/conceptos/:id/estudiantes?tipo= */
  static async estudiantes(req, res) {
    return AnaliticaController._detalle(req, res, 'estudiantes');
  }

  /**
   * Envoltorio común de los endpoints de detalle: valida contexto y concepto,
   * delega en el servicio y distingue 400 (petición malformada) de 404 (concepto
   * ajeno o inexistente).
   */
  static async _detalle(req, res, metodo, extra = {}) {
    const { grupoId, semanas, error } = await AnaliticaController._contexto(req);
    if (error) return res.status(404).json({ success: false, message: error });

    const concepto = AnaliticaController._concepto(req);
    if (!concepto) {
      return res.status(400).json({ success: false, message: 'Concepto inválido.' });
    }

    try {
      const data = await AnaliticaConceptosService[metodo](req.user.id, concepto, {
        grupoId,
        semanas,
        ...extra,
      });
      if (data == null) {
        return res.status(404).json({ success: false, message: 'Concepto no encontrado.' });
      }
      return res.status(200).json({ success: true, data });
    } catch (err) {
      console.error(`[analitica] Error en detalle (${req.path}):`, err);
      return res
        .status(500)
        .json({ success: false, message: 'No se pudo cargar el detalle del concepto.' });
    }
  }

  static _top(req) {
    const n = Number.parseInt(req.query.top, 10);
    if (!Number.isInteger(n) || n < 1) return CONCEPTOS_POR_DEFECTO;
    return Math.min(n, MAX_CONCEPTOS);
  }
}

module.exports = AnaliticaController;
