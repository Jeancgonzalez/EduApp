const express = require('express');
const router = express.Router();

// Ruta de prueba (Health Check)
// Accederemos a ella mediante GET http://localhost:3000/api/health
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: '¡La API de EduApp está funcionando correctamente!'
  });
});

// En el futuro, aquí importaremos y conectaremos más rutas.
const authRoutes = require('./authRoutes');
router.use('/auth', authRoutes);

const contentRoutes = require('./content.routes');
router.use('/contenidos', contentRoutes);

const evaluationRoutes = require('./evaluation.routes');
router.use('/evaluaciones', evaluationRoutes);

const gameRoutes = require('./game.routes');
router.use('/juegos', gameRoutes);

const progressRoutes = require('./progress.routes');
router.use('/progreso', progressRoutes);

const studentRoutes = require('./student.routes');
router.use('/student', studentRoutes);

const teacherRoutes = require('./teacher.routes');
router.use('/teacher', teacherRoutes);

const cuentasRoutes = require('./cuentas.routes');
router.use('/cuentas', cuentasRoutes);

const respuestasController = require('../controllers/respuestas.controller');
const { verifyToken, isStudent } = require('../middlewares/authMiddleware');

router.post('/evaluaciones/:id/responder', verifyToken, isStudent, respuestasController.responderEvaluacion);
router.post('/juegos/:id/responder', verifyToken, isStudent, respuestasController.responderJuego);

module.exports = router;
