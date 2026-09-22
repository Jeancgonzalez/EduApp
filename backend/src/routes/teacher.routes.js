const express = require('express');
const router = express.Router();
const TeacherController = require('../controllers/teacher.controller');
const GrupoController = require('../controllers/grupo.controller');
const { verifyToken, isTeacher } = require('../middlewares/authMiddleware');

router.use(verifyToken);
router.use(isTeacher);

router.get('/dashboard', TeacherController.getDashboard);
router.get('/students/stats', TeacherController.getStudentStats);
router.get('/students', TeacherController.getStudents);
router.get('/students/performance-evolution', TeacherController.getPerformanceEvolution);
router.get('/students/grade-distribution', TeacherController.getGradeDistribution);
router.get('/modules', TeacherController.getAvailableModules);
router.get('/students/module-progress', TeacherController.getStudentsModuleProgress);
router.post('/students/:id/send-report', TeacherController.sendStudentReport);
router.post('/students/send-reports', TeacherController.sendBulkStudentReports);

// Gestión de grupos
router.get('/grupos', GrupoController.obtenerGrupos);
router.post('/grupos', GrupoController.crearGrupo);
router.get('/grupos/:id', GrupoController.listarEstudiantesGrupo);
router.put('/grupos/:id', GrupoController.actualizarGrupo);
router.delete('/grupos/:id', GrupoController.eliminarGrupo);
router.put('/grupos/:id/estudiantes', GrupoController.asignarEstudiantes);

module.exports = router;
