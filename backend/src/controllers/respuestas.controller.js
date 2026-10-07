const EvaluationService = require('../services/evaluation.service');
const GameService = require('../services/game.service');
const StudentService = require('../services/student.service');
const ProgressService = require('../services/progress.service');
const GrupoService = require('../services/grupo.service');
const TelemetriaService = require('../services/telemetria.service');
const Game = require('../models/game.model');
const Evaluation = require('../models/evaluation.model');
const Content = require('../models/content.model');
const StudentProgress = require('../models/studentProgress.model');

class RespuestasController {
  /**
   * Cierra el intento de telemetría abierto por `iniciarActividad`.
   *
   * Nunca propaga el error: la calificación ya se persisted y el estudiante ya
   * vio su nota. Perder una métrica es aceptable; devolver un error 500 después
   * de calificar no lo es.
   */
  static async _cerrarIntento(req, datos) {
    try {
      await TelemetriaService.cerrarIntento({
        intentoId: req.body?.intento_id || null,
        estudianteId: req.user.id,
        docenteId: req.user.docente_id,
        ...datos,
      });
    } catch (error) {
      console.warn('[telemetría] No se pudo cerrar el intento:', error.message);
    }
  }

  static async iniciarActividad(req, res) {
    try {
      const { tipo, id } = req.params;
      const estudianteId = req.user.id;
      const docenteId = req.user.docente_id;
      const actividadId = Number(id);

      const modeloPorTipo = { contenido: Content, juego: Game, evaluacion: Evaluation };
      const modelo = modeloPorTipo[tipo];
      if (!modelo || !Number.isInteger(actividadId) || actividadId <= 0) {
        return res.status(400).json({ success: false, message: 'Tipo o identificador de actividad inválido.' });
      }

      // Se resuelve el recurso con el MISMO aislamiento que usa el resolver, para
      // que este endpoint no sirva de oráculo de existencia de actividades ajenas.
      const recurso = await modelo.findOne({
        where: { id: actividadId, docente_id: docenteId },
        attributes: ['id', 'modulo'],
      });
      if (!recurso) {
        return res.status(404).json({ success: false, message: 'Actividad no encontrada o no disponible para ti.' });
      }

      const acceso = await GrupoService.estudianteAccedeRecurso(estudianteId, recurso, tipo);
      if (!acceso) {
        return res.status(404).json({ success: false, message: 'Actividad no encontrada o no disponible para ti.' });
      }

      const intentoId = await TelemetriaService.iniciarIntento({
        estudianteId,
        docenteId,
        tipo,
        actividadId,
        modulo: recurso.modulo || null,
      });

      res.status(200).json({ success: true, data: { intento_id: intentoId } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async responderEvaluacion(req, res) {
    try {
      const estudianteId = req.user.id;
      const { id } = req.params;
      const { respuestas, tiempo } = req.body;

      if (!respuestas || !Array.isArray(respuestas)) {
        return res.status(400).json({
          success: false,
          message: 'Debe enviar un arreglo de respuestas válido.'
        });
      }

      const evaluacion = await Evaluation.findOne({ where: { id, docente_id: req.user.docente_id } });
      if (!evaluacion) {
        return res.status(404).json({ success: false, message: 'Evaluación no encontrada o no disponible para tu docente.' });
      }

      const acceso = await GrupoService.estudianteAccedeRecurso(estudianteId, evaluacion, 'evaluacion');
      if (!acceso) {
        return res.status(404).json({ success: false, message: 'Evaluación no encontrada o no disponible para ti.' });
      }

      const contenidoCompletado = await StudentService.esContenidoModuloCompletado(estudianteId, evaluacion.modulo, req.user.docente_id);
      if (!contenidoCompletado) {
        return res.status(403).json({
          success: false,
          message: '🔒 Completa el contenido para desbloquear esta actividad.'
        });
      }

      const esIlimitado = evaluacion.max_intentos === null || evaluacion.max_intentos === undefined;
      if (!esIlimitado) {
        const progreso = await StudentProgress.findOne({
          where: { estudiante_id: estudianteId, evaluacion_id: id }
        });
        const intentosRealizados = progreso ? (progreso.intentos_realizados || 0) : 0;
        const feedbackVisto = progreso ? progreso.feedback_visto : false;
        if (feedbackVisto || intentosRealizados >= evaluacion.max_intentos) {
          return res.status(400).json({
            success: false,
            message: 'Has agotado tus intentos disponibles para esta evaluación.'
          });
        }
      }

      const resultado = await EvaluationService.responderEvaluacion(id, respuestas);

      await StudentService.registerEvaluationResult(estudianteId, id, resultado.puntaje, respuestas);

      // Telemetría: un renglón por intento. Aciertos y total vienen del detalle
      // que ya calculaba EvaluationService; la duración se mide en el servidor.
      await RespuestasController._cerrarIntento(req, {
        tipo: 'evaluacion',
        actividadId: Number(id),
        modulo: evaluacion.modulo || null,
        puntajeObtenido: resultado.puntaje,
        puntajeMaximo: 100,
        aciertos: resultado.respuestas_correctas,
        preguntasTotal: resultado.total_preguntas,
        duracionSeg: typeof tiempo === 'number' ? tiempo : null,
      });

      if (evaluacion.modulo) {
        await ProgressService.recalcularProgreso(estudianteId, evaluacion.modulo, null, req.user.docente_id);
      }

      res.status(200).json({
        success: true,
        message: `Evaluación calificada. Obtuviste ${resultado.puntaje}/100`,
        data: { ...resultado, tiempo }
      });
    } catch (error) {
      if (error.message.includes('no encontrada')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async responderJuego(req, res) {
    try {
      const estudianteId = req.user.id;
      const { id } = req.params;
      const datosIntento = req.body;

      if (!datosIntento || Object.keys(datosIntento).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Debe enviar los datos del intento.'
        });
      }

      const juego = await Game.findOne({ where: { id, docente_id: req.user.docente_id } });
      if (!juego) {
        return res.status(404).json({ success: false, message: 'Juego no encontrado o no disponible para tu docente.' });
      }

      const accesoJuego = await GrupoService.estudianteAccedeRecurso(estudianteId, juego, 'juego');
      if (!accesoJuego) {
        return res.status(404).json({ success: false, message: 'Juego no encontrado o no disponible para ti.' });
      }

      const contenidoCompletado = await StudentService.esContenidoModuloCompletado(estudianteId, juego.modulo, req.user.docente_id);
      if (!contenidoCompletado) {
        return res.status(403).json({
          success: false,
          message: '🔒 Completa el contenido para desbloquear esta actividad.'
        });
      }

      const resultado = await GameService.responderJuego(id, datosIntento);

      await StudentService.registerGameResult(estudianteId, id, resultado.puntaje_obtenido);

      // Telemetría: los juegos no tienen preguntas, así que `aciertos` se deja nulo
      // y el acierto se evalúa contra el puntaje máximo del propio juego.
      await RespuestasController._cerrarIntento(req, {
        tipo: 'juego',
        actividadId: Number(id),
        modulo: juego.modulo || null,
        puntajeObtenido: resultado.puntaje_obtenido,
        puntajeMaximo: resultado.puntaje_maximo,
        aciertos: null,
        preguntasTotal: null,
        duracionSeg: typeof datosIntento.tiempo === 'number' ? datosIntento.tiempo : null,
      });

      if (juego.modulo) {
        await ProgressService.recalcularProgreso(estudianteId, juego.modulo, null, req.user.docente_id);
      }

      res.status(200).json({
        success: true,
        message: `Juego completado. Puntaje: ${resultado.puntaje_obtenido}/${resultado.puntaje_maximo}`,
        data: resultado
      });
    } catch (error) {
      if (error.message.includes('no encontrado')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = RespuestasController;
