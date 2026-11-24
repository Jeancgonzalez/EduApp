const express = require('express');
const router = express.Router();
const AnaliticaController = require('../controllers/analitica.controller');
const { verifyToken, isTeacher } = require('../middlewares/authMiddleware');

/**
 * Analítica de conceptos con mayor error.
 *
 * `verifyToken` + `isTeacher` cubren la autenticación; el aislamiento real lo
 * aplica el servicio: el `docente_id` sale del token y cada concepto se valida
 * contra las actividades de ese docente. Un `:id` o `grupoId` ajeno devuelve 404
 * en lugar de exponer datos de otro docente.
 *
 * `:id` es el id de la ACTIVIDAD (coincide con la gráfica "Conceptos con mayor
 * error") y `?tipo=` distingue contenido, juego o evaluación.
 */
router.get('/conceptos/resumen', verifyToken, isTeacher, AnaliticaController.resumen);
router.get('/conceptos/:id/preguntas', verifyToken, isTeacher, AnaliticaController.preguntas);
router.get('/conceptos/:id/confusiones', verifyToken, isTeacher, AnaliticaController.confusiones);
router.get('/conceptos/:id/estudiantes', verifyToken, isTeacher, AnaliticaController.estudiantes);

module.exports = router;
