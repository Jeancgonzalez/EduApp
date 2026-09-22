const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    let subdir = '';
    if (file.mimetype.startsWith('image/')) subdir = 'images';
    else if (file.mimetype.startsWith('video/')) subdir = 'videos';
    else if (
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) subdir = 'documents';

    const dir = path.join(uploadDir, subdir);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const sanitized = file.originalname.replace(/[<>:"/\\|?*]/g, '_');
    cb(null, sanitized);
  }
});

const MIME_TYPES = {
  'video/mp4': ['.mp4'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
};

const ALLOWED_MIMES = Object.keys(MIME_TYPES);
const ALLOWED_EXTENSIONS = Object.values(MIME_TYPES).flat();

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIMES.includes(file.mimetype) && ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}. Extensiones aceptadas: ${ALLOWED_EXTENSIONS.join(', ')}`));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }
});

module.exports = { upload, ALLOWED_MIMES, ALLOWED_EXTENSIONS };
