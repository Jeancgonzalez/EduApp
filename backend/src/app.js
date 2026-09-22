const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const apiRoutes = require('./routes');

const app = express();

// --- MIDDLEWARES GLOBALES ---
app.use(cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- ARCHIVOS ESTÁTICOS ---
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// --- RUTAS ---
app.use('/api', apiRoutes);

// --- FRONTEND REACT (BUILD DE PRODUCCIÓN) ---
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));

  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      return res.sendFile(path.join(frontendDist, 'index.html'));
    }
    next();
  });
}

// --- MANEJO DE ERRORES BÁSICO ---
// Si alguna ruta falla o lanza un throw, caerá aquí
app.use((err, req, res, next) => {
  console.error('[Error no manejado]:', err.stack);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Error interno del servidor',
  });
});

module.exports = app;
