const EvaluationService = require('../services/evaluation.service');
const GameService = require('../services/game.service');
const StudentService = require('../services/student.service');
const ProgressService = require('../services/progress.service');
const GrupoService = require('../services/grupo.service');
const Game = require('../models/game.model');
const Evaluation = require('../models/evaluation.model');
const StudentProgress = require('../models/studentProgress.model');

class RespuestasController {
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

      const acceso = await GrupoService.estudianteAccedeRecurso(estudianteId, evaluacion);
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

      const accesoJuego = await GrupoService.estudianteAccedeRecurso(estudianteId, juego);
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
