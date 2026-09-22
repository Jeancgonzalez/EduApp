const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ContentController = require('../controllers/content.controller');
const { verifyToken, isTeacher } = require('../middlewares/authMiddleware');
const { upload } = require('../middlewares/upload');

const editorStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '../../uploads', 'editor-images');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `editor-${uniqueSuffix}${ext}`);
  },
});

const editorUpload = multer({
  storage: editorStorage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Solo se permiten imágenes'));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Rutas públicas (con auth, pero no exclusivo de docente)
router.get('/modulos', verifyToken, ContentController.obtenerModulos);

// Middleware JWT global para estas rutas (todos deben estar autenticados)
router.use(verifyToken);

// Rutas de lectura (disponibles para estudiantes y docentes)
router.get('/', ContentController.obtenerContenidos);
router.get('/por-modulo/:modulo', isTeacher, ContentController.obtenerContenidosPorModulo);
router.get('/:id', ContentController.obtenerContenidoPorId);

// Subida de imágenes para el editor de texto enriquecido
router.post('/upload/editor-image', isTeacher, (req, res, next) => {
  editorUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No se envió ninguna imagen' });
    const uploadsDir = path.join(__dirname, '../../uploads');
    const relativePath = path.relative(uploadsDir, req.file.path);
    const url = '/uploads/' + relativePath.replace(/\\/g, '/');
    res.json({ success: true, url });
  });
});

// Rutas de escritura y eliminación (protegidas solo para docentes)
router.post('/', isTeacher, upload.single('archivo'), ContentController.crearContenido);
router.put('/:id', isTeacher, upload.single('archivo'), ContentController.actualizarContenido);
router.delete('/:id', isTeacher, ContentController.eliminarContenido);

module.exports = router;
