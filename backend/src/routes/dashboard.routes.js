const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/dashboard.controller');
const { verifyToken, isTeacher } = require('../middlewares/authMiddleware');

// Panel analítico del docente (Fase 3 del dashboard).
//
// `verifyToken` + `isTeacher` cubren la autenticación, pero el aislamiento real
// lo aplica el servicio: `docente_id` sale del token y los estudiantes se acotan
// por los grupos de ese docente. Un docente que manipule el `grupoId` de la URL
// no ve datos ajenos, solo un 404.
router.get('/resumen', verifyToken, isTeacher, DashboardController.resumen);
router.get('/tendencia', verifyToken, isTeacher, DashboardController.tendencia);
router.get('/progreso-por-tema', verifyToken, isTeacher, DashboardController.progresoPorTema);
router.get('/ranking', verifyToken, isTeacher, DashboardController.ranking);
router.get('/conceptos-error', verifyToken, isTeacher, DashboardController.conceptosError);

// Vista de Grupo. Cada bloque se pide por separado porque no dependen entre sí:
// si uno falla, el resto del panel se sigue viendo en vez de dejar la página en
// blanco. Todos aceptan el mismo `?grupoId=` y `?semanas=` que la barra global.
router.get('/distribucion-niveles', verifyToken, isTeacher, DashboardController.distribucionNiveles);
router.get('/ranking-completo', verifyToken, isTeacher, DashboardController.rankingCompleto);
router.get('/mapa-calor', verifyToken, isTeacher, DashboardController.mapaCalor);
router.get('/participacion-semanal', verifyToken, isTeacher, DashboardController.participacionSemanal);
router.get('/comparacion-grupos', verifyToken, isTeacher, DashboardController.comparacionGrupos);

// Gamificación. Un solo endpoint con los tres bloques (insignias, XP y
// constancia) porque los tres se leen siempre juntos: separarlos en tres
// llamadas sería pedir tres veces la misma lista de estudiantes.
router.get('/gamificacion', verifyToken, isTeacher, DashboardController.gamificacion);

// Contenidos y Actividades. Un solo endpoint con KPIs, dona y detalle porque
// todo se lee de la misma ventana de intentos: el inventario del docente, el
// agregado por actividad y las duraciones se resuelven en paralelo.
router.get('/contenidos', verifyToken, isTeacher, DashboardController.contenidos);

module.exports = router;