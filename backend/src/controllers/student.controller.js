const StudentService = require('../services/student.service');
const MedalsService = require('../services/medals.service');
const GrupoService = require('../services/grupo.service');
const Content = require('../models/content.model');
const Game = require('../models/game.model');
const Evaluation = require('../models/evaluation.model');
const Question = require('../models/question.model');
const StudentProgress = require('../models/studentProgress.model');
const ProgressService = require('../services/progress.service');
const { Op } = require('sequelize');

class StudentController {
  static async getDashboard(req, res) {
    try {
      const estudianteId = req.user.id;
      const docenteId = req.user.docente_id;
      const data = await StudentService.getDashboardData(estudianteId, docenteId);
      res.status(200).json({ success: true, data: { ...data, studentName: req.user.name } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getContenidosPublicados(req, res) {
    try {
      const condiciones = await GrupoService.recursoWhereEstudiante(req.user.id);
      const contenidos = await Content.findAll({ where: { publicado: true, docente_id: req.user.docente_id, [Op.or]: condiciones } });
      res.status(200).json({ success: true, data: contenidos });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getJuegosPublicados(req, res) {
    try {
      const condiciones = await GrupoService.recursoWhereEstudiante(req.user.id);
      const juegos = await Game.findAll({ where: { publicado: true, docente_id: req.user.docente_id, [Op.or]: condiciones } });
      const progressRecords = await StudentProgress.findAll({
        where: { estudiante_id: req.user.id, juego_id: { [Op.ne]: null } },
        raw: true
      });
      const mejorPorJuego = new Map();
      for (const r of progressRecords) {
        const actual = mejorPorJuego.get(r.juego_id);
        if (!actual || r.puntaje > actual.puntaje) mejorPorJuego.set(r.juego_id, r);
      }
      const data = await Promise.all(juegos.map(async (j) => {
        const record = mejorPorJuego.get(j.id);
        const pct = record && j.puntaje_max ? Math.round((record.puntaje / j.puntaje_max) * 100) : null;
        return {
          ...j.toJSON(),
          bloqueado: !(await StudentService.esContenidoModuloCompletado(req.user.id, j.modulo, req.user.docente_id)),
          completado: !!record,
          mejor_puntaje: record ? record.puntaje : null,
          porcentaje_logro: pct,
          estrellas: StudentService.estrellasDePorcentaje(pct)
        };
      }));
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getEvaluacionesPublicadas(req, res) {
    try {
      const condiciones = await GrupoService.recursoWhereEstudiante(req.user.id);
      const evaluaciones = await Evaluation.findAll({ where: { publicado: true, docente_id: req.user.docente_id, [Op.or]: condiciones } });
      const progressRecords = await StudentProgress.findAll({
        where: { estudiante_id: req.user.id, evaluacion_id: { [Op.ne]: null } },
        raw: true
      });
      const mejorPorEvaluacion = new Map();
      for (const r of progressRecords) {
        const actual = mejorPorEvaluacion.get(r.evaluacion_id);
        if (!actual || r.puntaje > actual.puntaje) mejorPorEvaluacion.set(r.evaluacion_id, r);
      }
      const data = await Promise.all(evaluaciones.map(async (e) => {
        const record = mejorPorEvaluacion.get(e.id);
        const pct = record ? record.puntaje : null;
        return {
          ...e.toJSON(),
          bloqueado: !(await StudentService.esContenidoModuloCompletado(req.user.id, e.modulo, req.user.docente_id)),
          completado: !!record,
          mejor_puntaje: record ? record.puntaje : null,
          porcentaje_logro: pct,
          estrellas: StudentService.estrellasDePorcentaje(pct)
        };
      }));
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async accederContenido(req, res) {
    try {
      const estudianteId = req.user.id;
      const { id } = req.params;

      const condiciones = await GrupoService.recursoWhereEstudiante(estudianteId);
      const contenido = await Content.findOne({ where: { id, docente_id: req.user.docente_id, publicado: true, [Op.or]: condiciones } });
      if (!contenido) {
        return res.status(404).json({ success: false, message: 'Contenido no encontrado o no disponible para ti.' });
      }

      const record = await StudentService.registerContentView(estudianteId, id);

      if (contenido.modulo) {
        await ProgressService.recalcularProgreso(estudianteId, contenido.modulo, null, req.user.docente_id);
      }

      res.status(200).json({ success: true, message: 'Acceso registrado', data: record });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getProgresoDetallado(req, res) {
    try {
      const estudianteId = req.user.id;
      const data = await StudentService.getDetailedProgress(estudianteId, req.user.docente_id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getGamificacion(req, res) {
    try {
      const estudianteId = req.user.id;
      const data = await MedalsService.obtenerGamificacion(estudianteId, req.user.docente_id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getCompletados(req, res) {
    try {
      const estudianteId = req.user.id;
      let records = [];
      try {
        records = await StudentProgress.findAll({
          where: { estudiante_id: estudianteId, completado: true }
        });
      } catch (dbErr) {
        console.warn('[getCompletados] Error consultando progreso_estudiante, retornando vacío:', dbErr.message);
      }
      const contenidos = records.filter(r => r && r.contenido_id).map(r => r.contenido_id);
      const juegos = records.filter(r => r && r.juego_id).map(r => r.juego_id);
      const evaluaciones = records.filter(r => r && r.evaluacion_id).map(r => r.evaluacion_id);
      res.status(200).json({ success: true, data: { contenidos, juegos, evaluaciones } });
    } catch (error) {
      res.status(200).json({ success: true, data: { contenidos: [], juegos: [], evaluaciones: [] } });
    }
  }

  static async obtenerContenidoApoyoEvaluacion(req, res) {
    try {
      const estudianteId = req.user.id;
      const { id } = req.params;

      const evalCondiciones = await GrupoService.recursoWhereEstudiante(estudianteId);
      const evaluacion = await Evaluation.findOne({
        where: { id, publicado: true, docente_id: req.user.docente_id, [Op.or]: evalCondiciones }
      });

      if (!evaluacion || !evaluacion.requiere_contenido_apoyo || !evaluacion.contenido_apoyo_id) {
        return res.status(404).json({ success: false, message: 'Esta evaluación no tiene contenido de apoyo.' });
      }

      const contenidoCondiciones = await GrupoService.recursoWhereEstudiante(estudianteId);
      const contenido = await Content.findOne({
        where: { id: evaluacion.contenido_apoyo_id, publicado: true, docente_id: req.user.docente_id, [Op.or]: contenidoCondiciones }
      });

      if (!contenido) {
        return res.status(404).json({ success: false, message: 'El contenido de apoyo ya no está disponible.' });
      }

      const yaVisto = await StudentProgress.findOne({
        where: { estudiante_id: estudianteId, contenido_id: evaluacion.contenido_apoyo_id, completado: true }
      });

      res.status(200).json({
        success: true,
        data: {
          contenido,
          ya_visto: !!yaVisto
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async verContenidoApoyoEvaluacion(req, res) {
    try {
      const estudianteId = req.user.id;
      const docenteId = req.user.docente_id;
      const { id } = req.params;

      const evalCondiciones = await GrupoService.recursoWhereEstudiante(estudianteId);
      const evaluacion = await Evaluation.findOne({
        where: { id, publicado: true, docente_id: docenteId, [Op.or]: evalCondiciones }
      });

      if (!evaluacion) {
        return res.status(404).json({ success: false, message: 'Evaluación no encontrada.' });
      }

      if (!evaluacion.requiere_contenido_apoyo || !evaluacion.contenido_apoyo_id) {
        return res.status(400).json({ success: false, message: 'Esta evaluación no requiere contenido de apoyo.' });
      }

      const contenidoCondiciones = await GrupoService.recursoWhereEstudiante(estudianteId);
      const contenido = await Content.findOne({
        where: { id: evaluacion.contenido_apoyo_id, publicado: true, docente_id: docenteId, [Op.or]: contenidoCondiciones }
      });

      if (!contenido) {
        return res.status(404).json({ success: false, message: 'El contenido de apoyo ya no está disponible.' });
      }

      const record = await StudentService.registerContentView(estudianteId, contenido.id);

      if (evaluacion.modulo) {
        await ProgressService.recalcularProgreso(estudianteId, evaluacion.modulo, null, req.user.docente_id);
      }

      res.status(200).json({
        success: true,
        message: 'Visualización del contenido de apoyo registrada.',
        data: record
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async obtenerEstadoEvaluacion(req, res) {
    try {
      const estudianteId = req.user.id;
      const { id } = req.params;

      const condiciones = await GrupoService.recursoWhereEstudiante(estudianteId);
      const evaluacion = await Evaluation.findOne({
        where: { id, publicado: true, docente_id: req.user.docente_id, [Op.or]: condiciones }
      });

      if (!evaluacion) {
        return res.status(404).json({ success: false, message: 'Evaluación no encontrada.' });
      }

      const progreso = await StudentProgress.findOne({
        where: { estudiante_id: estudianteId, evaluacion_id: id }
      });

      const intentosRealizados = progreso ? (progreso.intentos_realizados || 0) : 0;
      const maxIntentos = evaluacion.max_intentos;
      const esIlimitado = maxIntentos === null || maxIntentos === undefined;
      const feedbackVisto = progreso ? progreso.feedback_visto : false;
      const puedeReintentar = esIlimitado || (!feedbackVisto && intentosRealizados < maxIntentos);
      const ultimoIntento = !esIlimitado && !feedbackVisto && intentosRealizados >= maxIntentos;

      res.status(200).json({
        success: true,
        data: {
          intentos_realizados: intentosRealizados,
          max_intentos: maxIntentos,
          es_ilimitado: esIlimitado,
          feedback_visto: feedbackVisto,
          puede_reintentar: puedeReintentar,
          ultimo_intento: ultimoIntento,
          puntaje: progreso ? progreso.puntaje : null
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async verRetroalimentacionEvaluacion(req, res) {
    try {
      const estudianteId = req.user.id;
      const { id } = req.params;

      const condiciones = await GrupoService.recursoWhereEstudiante(estudianteId);
      const evaluacion = await Evaluation.findOne({
        where: { id, publicado: true, docente_id: req.user.docente_id, [Op.or]: condiciones },
        include: [{ model: Question, as: 'preguntas' }]
      });

      if (!evaluacion) {
        return res.status(404).json({ success: false, message: 'Evaluación no encontrada.' });
      }

      const progreso = await StudentProgress.findOne({
        where: { estudiante_id: estudianteId, evaluacion_id: id }
      });

      if (!progreso) {
        return res.status(400).json({ success: false, message: 'Debes responder la evaluación antes de ver la retroalimentación.' });
      }

      const esIlimitado = evaluacion.max_intentos === null || evaluacion.max_intentos === undefined;

      let respuestas = [];
      if (progreso.respuestas) {
        try { respuestas = JSON.parse(progreso.respuestas); } catch { respuestas = []; }
      }

      // En evaluaciones con intentos ilimitados, ver la retroalimentación no debe bloquear
      // la posibilidad de volver a realizar la evaluación.
      if (!esIlimitado) {
        await progreso.update({ feedback_visto: true });
      }

      const retroalimentacionPreguntas = evaluacion.preguntas.map(p => {
        const respuestaEstudiante = respuestas.find(r => r.pregunta_id === p.id);
        return {
          pregunta_id: p.id,
          pregunta: p.pregunta,
          opcion_a: p.opcion_a,
          opcion_b: p.opcion_b,
          opcion_c: p.opcion_c,
          opcion_d: p.opcion_d,
          respuesta_correcta: p.respuesta_correcta,
          retroalimentacion: p.retroalimentacion,
          respuesta_estudiante: respuestaEstudiante ? respuestaEstudiante.respuesta : null
        };
      });

      res.status(200).json({
        success: true,
        data: {
          evaluacion_id: evaluacion.id,
          titulo: evaluacion.titulo,
          puntaje: progreso.puntaje,
          total_preguntas: evaluacion.preguntas.length,
          preguntas: retroalimentacionPreguntas
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = StudentController;
