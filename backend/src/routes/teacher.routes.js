const express = require('express');
const router = express.Router();

const TeacherController = require('../controllers/teacher.controller');
const { verifyToken, isTeacher } = require('../middlewares/authMiddleware');

/**
 * Todas las rutas de este router están protegidas:
 *  - verifyToken: valida el JWT y agrega req.user
 *  - isTeacher:  verifica que el usuario tenga rol 'teacher'
 *
 * Si tu authMiddleware no exporta `isTeacher`, cámbialo por el nombre
 * real (por ejemplo: `isDocente`, `requireRole('teacher')`, etc.).
 */
router.use(verifyToken);
router.use(isTeacher);

/* ------------------------------ Health ---------------------------- */
// Útil para verificar que el router está montado correctamente.
router.get('/ping', (req, res) => {
  res.json({ success: true, message: 'teacher router OK' });
});

/* ----------------------- Estadísticas / listados ------------------ *
 * IMPORTANTE: las rutas con segmento fijo ("/students/stats",
 * "/students/module-progress", "/students/progreso-individual") van ANTES
 * que "/students/:id/...". Si no, ":id" capturaría esos nombres.
 */
router.get('/students/stats',            TeacherController.getStudentStats);
router.get('/students/module-progress',  TeacherController.getStudentsModuleProgress);
// Listado del Progreso Individual. Acepta el mismo `?grupoId=` y `?semanas=`
// que la barra global del panel analítico.
router.get('/students/progreso-individual', TeacherController.getProgresoIndividual);
router.get('/students',                  TeacherController.getStudents);

/* --------------------------- Dashboard ---------------------------- */
router.get('/dashboard',                 TeacherController.getDashboard);
router.get('/grupos', TeacherController.getGroups);
router.get('/available-modules',         TeacherController.getAvailableModules);
router.get('/grade-distribution',        TeacherController.getGradeDistribution);
router.get('/performance-evolution',     TeacherController.getPerformanceEvolution);

/* --------------------- Detalle por estudiante --------------------- */
router.get('/students/:id/detail',       TeacherController.getStudentDetail);

/* ---------------------------- Reportes programados ---------------------------- */
router.post('/students/:id/send-report',    TeacherController.sendStudentReport);
router.post('/students/send-bulk-reports',  TeacherController.sendBulkStudentReports);
router.get('/report-schedules/catalog',     TeacherController.getReportCatalog);
router.get('/report-schedules',             TeacherController.getReportSchedules);
router.post('/report-schedules',            TeacherController.createReportSchedule);
router.put('/report-schedules/:id',         TeacherController.updateReportSchedule);
router.delete('/report-schedules/:id',      TeacherController.deleteReportSchedule);
router.post('/report-schedules/:id/enviar', TeacherController.sendReportNow);

/* ---------------------------- Historial ---------------------------- */
router.get('/report-runs',                  TeacherController.getReportRuns);
router.get('/report-runs/:id/descargar',    TeacherController.downloadReportRun);

/* ---------------------------- Notificaciones ---------------------------- */
router.get('/notifications',               TeacherController.getNotifications);
router.get('/notifications/count',         TeacherController.getNotificationCount);
router.post('/notifications/leer-todas',    TeacherController.markNotificationsRead);
router.post('/notifications/:id/leer',      TeacherController.markNotificationsRead);

module.exports = router;