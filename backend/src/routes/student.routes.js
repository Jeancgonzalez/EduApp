const express = require('express');
const router = express.Router();
const StudentController = require('../controllers/student.controller');
const RespuestasController = require('../controllers/respuestas.controller');
const DiagnosticoController = require('../controllers/diagnostico.controller');
const User = require('../models/User');
const DiagnosticoAplicacion = require('../models/diagnosticoAplicacion.model');
const { verifyToken, isStudent } = require('../middlewares/authMiddleware');

/**
 * Bloqueo del aplicativo para estudiantes con Misión Digital obligatoria.
 * Se aplica a TODO lo de /student excepto los endpoints del propio diagnóstico
 * (que deben quedar accesibles para completarla). Regla del docente en el registro.
 */
const requerirMisionCompletada = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: ['iad_obligatorio'], raw: true });
    if (user && Boolean(user.iad_obligatorio)) {
      const completada = await DiagnosticoAplicacion.findOne({
        where: { estudiante_id: req.user.id, estado: 'completado' },
        attributes: ['id'],
      });
      if (!completada) {
        return res.status(403).json({
          success: false,
          message: 'Debes completar la Misión Digital antes de usar el aplicativo.',
        });
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};

router.use(verifyToken);
router.use(isStudent);

// IAD-Primaria: el estudiante SIEMPRE puede consultar/iniciar/responder la misión.
router.get('/diagnostico', DiagnosticoController.getStatus);
router.post('/diagnostico/iniciar', DiagnosticoController.iniciar);
router.post('/diagnostico/responder', DiagnosticoController.responder);

// Resto del aplicativo: bloqueado por el middleware si la misión es obligatoria
// y el estudiante aún no la completó.
router.use(requerirMisionCompletada);

router.get('/dashboard', StudentController.getDashboard);
router.get('/contenidos/publicados', StudentController.getContenidosPublicados);
router.post('/contenidos/:id/acceder', StudentController.accederContenido);
router.get('/juegos/publicados', StudentController.getJuegosPublicados);
router.post('/juegos/:id/responder', RespuestasController.responderJuego);
router.get('/evaluaciones/publicadas', StudentController.getEvaluacionesPublicadas);
router.get('/evaluaciones/:id/contenido-apoyo', StudentController.obtenerContenidoApoyoEvaluacion);
router.post('/evaluaciones/:id/contenido-apoyo/visto', StudentController.verContenidoApoyoEvaluacion);
router.post('/evaluaciones/:id/responder', RespuestasController.responderEvaluacion);
router.get('/evaluaciones/:id/estado', StudentController.obtenerEstadoEvaluacion);
router.post('/evaluaciones/:id/retroalimentacion', StudentController.verRetroalimentacionEvaluacion);
router.get('/progreso', StudentController.getProgresoDetallado);
router.get('/gamificacion', StudentController.getGamificacion);
router.get('/completados', StudentController.getCompletados);

module.exports = router;
