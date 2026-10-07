require('dotenv').config(); // Cargamos variables de entorno al iniciar
const app = require('./app');
const { testConnection } = require('./config/database');

// Registro de la hora de inicio para diagnósticos.
const startTime = Date.now();

// Manejadores globales de errores: impiden que el backend se "apague" sin dejar rastro
// y dejan visible la causa exacta en la consola.
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [unhandledRejection] Promesa rechazada no manejada:', reason);
  if (reason && reason.stack) console.error(reason.stack);
  // No salimos del proceso: la petición en curso ya devolvió su error y el servidor sigue vivo.
});

process.on('uncaughtException', (error) => {
  console.error('⚠️ [uncaughtException] Error no capturado:', error);
  if (error && error.stack) console.error(error.stack);
  // Después de un uncaughtException el estado del proceso es indefinido.
  // Forzamos salida con código 1 para que un supervisor (PM2, Docker, etc.) lo reinicie.
  setTimeout(() => process.exit(1), 2000);
});

// Visibilidad: registrar SIEMPRE por qué muere el proceso.
process.on('exit', (code) => {
  const uptime = Math.round((Date.now() - startTime) / 1000);
  console.error(`[Proceso] Saliendo con código ${code} después de ${uptime}s de uptime.`);
});

// Señales del sistema / terminal: apagado graceful.
const gracefulShutdown = (signal) => {
  console.log(`\n[Proceso] Señal ${signal} recibida. Cerrando servidor gracefully...`);
if (global._server) {
      // El cron sigue vivo después de cerrar el HTTP: sin esta parada seguiría
      // consultando la base mientras el proceso se desconecta.
      try {
        require('./services/reportSchedule.service').detenerScheduler();
      } catch { /* ignorar */ }
      global._server.close(() => {
      console.log('[Proceso] Servidor HTTP cerrado.');
      const { sequelize } = require('./config/database');
      sequelize.close().then(() => {
        console.log('[Proceso] Conexiones de DB cerradas. Saliendo.');
        process.exit(0);
      }).catch(() => process.exit(0));
    });
    // Forzar salida después de 5s si el graceful shutdown no completa.
    setTimeout(() => {
      console.error('[Proceso] Graceful shutdown no completó en 5s. Forzando salida.');
      process.exit(1);
    }, 5000);
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Tomamos el puerto desde las variables de entorno o usamos el 3000 por defecto
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // 1. Verificamos la conexión a la base de datos MySQL
    await testConnection();
    
    // Migraciones SQL versionadas y reversibles (backend/migrations/*.sql).
    // Se ejecutan ANTES de sequelize.sync() para que el SQL sea la fuente de
    // verdad del esquema: sync() solo crea las tablas que falten, así que
    // cualquier tabla declarada aquí se conserva tal cual (con sus índices y FKs).
    try {
      const MigrationService = require('./services/migration.service');
      await MigrationService.aplicarPendientes();
    } catch (migrateError) {
      console.error('❌ Error aplicando migraciones:', migrateError);
      throw migrateError;
    }

    // Sincronizar los modelos con la base de datos (Crea las tablas si no existen)
    const { sequelize } = require('./config/database');
    // Cargar asociaciones entre modelos
    require('./models/associations');

    // Eliminar duplicados en progreso_estudiante antes de crear índices únicos
    try {
      const { Op } = require('sequelize');
      const StudentProgress = require('./models/studentProgress.model');
      for (const col of ['contenido_id', 'juego_id', 'evaluacion_id']) {
        const all = await StudentProgress.findAll({
          where: { [col]: { [Op.ne]: null } },
          attributes: ['id', 'estudiante_id', col, 'puntaje'],
          order: [[col, 'ASC'], ['puntaje', 'DESC']],
          raw: true
        });
        const seen = new Set();
        const toDelete = [];
        for (const row of all) {
          const key = `${row.estudiante_id}_${row[col]}`;
          if (seen.has(key)) toDelete.push(row.id);
          else seen.add(key);
        }
        if (toDelete.length > 0) {
          await StudentProgress.destroy({ where: { id: toDelete } });
          console.log(`🧹 Eliminados ${toDelete.length} duplicados en progreso_estudiante.${col}`);
        }
      }
    } catch (dedupError) {
      console.warn('⚠️ No se pudo limpiar duplicados (tabla aún no existe):', dedupError.message);
    }

    await sequelize.sync();
    console.log('📦 Tablas sincronizadas con la base de datos.');

    // Semilla del instrumento IAD-Primaria (se carga solo la primera vez).
    try {
      const DiagnosticoService = require('./services/diagnostico.service');
      const sembrado = await DiagnosticoService.seedPreguntasSiVacio();
      if (sembrado) {
        console.log('🌱 Semilla IAD-Primaria insertada (10 situaciones).');
      }
    } catch (seedError) {
      console.warn('⚠️ No se pudo sembrar el instrumento IAD-Primaria:', seedError.message);
    }

    // Agregar columna modulo_content_id si no existe (migración manual)
    try {
      const { QueryTypes } = require('sequelize');
      const checkColumn = await sequelize.query(
        "SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'evaluaciones' AND COLUMN_NAME = 'modulo_content_id'",
        { type: QueryTypes.SELECT }
      );
      if (checkColumn[0].cnt === 0) {
        await sequelize.query('ALTER TABLE evaluaciones ADD COLUMN modulo_content_id INT NULL AFTER modulo');
        console.log('➕ Columna modulo_content_id agregada a evaluaciones.');
      }
    } catch (migrateError) {
      console.warn('⚠️ No se pudo verificar/agregar la columna modulo_content_id:', migrateError.message);
    }

    // Agregar columna max_intentos si no existe (NULL = intentos ilimitados)
    try {
      const { QueryTypes } = require('sequelize');
      const checkMax = await sequelize.query(
        "SELECT COUNT(*) as cnt, MAX(IS_NULLABLE = 'NO') as not_null FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'evaluaciones' AND COLUMN_NAME = 'max_intentos'",
        { type: QueryTypes.SELECT }
      );
      if (checkMax[0].cnt === 0) {
        await sequelize.query('ALTER TABLE evaluaciones ADD COLUMN max_intentos INT NULL');
        console.log('➕ Columna max_intentos agregada a evaluaciones.');
      } else if (checkMax[0].not_null === 1) {
        await sequelize.query('ALTER TABLE evaluaciones MODIFY COLUMN max_intentos INT NULL');
        console.log('➕ Columna max_intentos modificada para permitir intentos ilimitados (NULL).');
      }
    } catch (migrateError) {
      console.warn('⚠️ No se pudo verificar/ajustar la columna max_intentos:', migrateError.message);
    }

    // Agregar columna modulo_content_id a juegos si no existe (relación por ID con el contenido)
    try {
      const { QueryTypes } = require('sequelize');
      const checkJuegoCol = await sequelize.query(
        "SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'juegos' AND COLUMN_NAME = 'modulo_content_id'",
        { type: QueryTypes.SELECT }
      );
      if (checkJuegoCol[0].cnt === 0) {
        await sequelize.query('ALTER TABLE juegos ADD COLUMN modulo_content_id INT NULL AFTER modulo');
        console.log('➕ Columna modulo_content_id agregada a juegos.');
      }
    } catch (migrateError) {
      console.warn('⚠️ No se pudo verificar/agregar la columna modulo_content_id a juegos:', migrateError.message);
    }

    // Agregar columna retroalimentacion si no existe
    try {
      const { QueryTypes } = require('sequelize');
      const checkRetro = await sequelize.query(
        "SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'preguntas' AND COLUMN_NAME = 'retroalimentacion'",
        { type: QueryTypes.SELECT }
      );
      if (checkRetro[0].cnt === 0) {
        await sequelize.query('ALTER TABLE preguntas ADD COLUMN retroalimentacion TEXT NULL');
        console.log('➕ Columna retroalimentacion agregada a preguntas.');
      }
    } catch (migrateError) {
      console.warn('⚠️ No se pudo verificar/agregar la columna retroalimentacion:', migrateError.message);
    }

    // Agregar columnas a progreso_estudiante si no existen
    try {
      const { QueryTypes } = require('sequelize');
      const checkInt = await sequelize.query(
        "SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'progreso_estudiante' AND COLUMN_NAME = 'intentos_realizados'",
        { type: QueryTypes.SELECT }
      );
      if (checkInt[0].cnt === 0) {
        await sequelize.query('ALTER TABLE progreso_estudiante ADD COLUMN intentos_realizados INT DEFAULT 0');
        console.log('➕ Columna intentos_realizados agregada a progreso_estudiante.');
      }
    } catch (migrateError) {
      console.warn('⚠️ No se pudo verificar/agregar la columna intentos_realizados:', migrateError.message);
    }

    try {
      const { QueryTypes } = require('sequelize');
      const checkFb = await sequelize.query(
        "SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'progreso_estudiante' AND COLUMN_NAME = 'feedback_visto'",
        { type: QueryTypes.SELECT }
      );
      if (checkFb[0].cnt === 0) {
        await sequelize.query('ALTER TABLE progreso_estudiante ADD COLUMN feedback_visto BOOLEAN DEFAULT FALSE');
        console.log('➕ Columna feedback_visto agregada a progreso_estudiante.');
      }
    } catch (migrateError) {
      console.warn('⚠️ No se pudo verificar/agregar la columna feedback_visto:', migrateError.message);
    }

    try {
      const { QueryTypes } = require('sequelize');
      const checkResp = await sequelize.query(
        "SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'progreso_estudiante' AND COLUMN_NAME = 'respuestas'",
        { type: QueryTypes.SELECT }
      );
      if (checkResp[0].cnt === 0) {
        await sequelize.query('ALTER TABLE progreso_estudiante ADD COLUMN respuestas TEXT NULL');
        console.log('➕ Columna respuestas agregada a progreso_estudiante.');
      }
    } catch (migrateError) {
      console.warn('⚠️ No se pudo verificar/agregar la columna respuestas:', migrateError.message);
    }

    // Agregar columnas de verificación de correo a users si no existen (migración manual)
    try {
      const { QueryTypes } = require('sequelize');
      const checkVerified = await sequelize.query(
        "SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'emailVerified'",
        { type: QueryTypes.SELECT }
      );
      if (checkVerified[0].cnt === 0) {
        await sequelize.query("ALTER TABLE users ADD COLUMN emailVerified BOOLEAN DEFAULT FALSE NOT NULL");
        console.log('➕ Columna emailVerified agregada a users.');
      }
    } catch (migrateError) {
      console.warn('⚠️ No se pudo verificar/agregar la columna emailVerified:', migrateError.message);
    }

    try {
      const { QueryTypes } = require('sequelize');
      const checkCodeHash = await sequelize.query(
        "SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'emailVerificationCodeHash'",
        { type: QueryTypes.SELECT }
      );
      if (checkCodeHash[0].cnt === 0) {
        await sequelize.query('ALTER TABLE users ADD COLUMN emailVerificationCodeHash VARCHAR(255) NULL');
        console.log('➕ Columna emailVerificationCodeHash agregada a users.');
      }
    } catch (migrateError) {
      console.warn('⚠️ No se pudo verificar/agregar la columna emailVerificationCodeHash:', migrateError.message);
    }

    try {
      const { QueryTypes } = require('sequelize');
      const checkExpires = await sequelize.query(
        "SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'emailVerificationExpires'",
        { type: QueryTypes.SELECT }
      );
      if (checkExpires[0].cnt === 0) {
        await sequelize.query('ALTER TABLE users ADD COLUMN emailVerificationExpires DATETIME NULL');
        console.log('➕ Columna emailVerificationExpires agregada a users.');
      }
    } catch (migrateError) {
      console.warn('⚠️ No se pudo verificar/agregar la columna emailVerificationExpires:', migrateError.message);
    }

    // Agregar columnas de recuperación de contraseña a users si no existen (migración manual)
    try {
      const { QueryTypes } = require('sequelize');
      const checkResetHash = await sequelize.query(
        "SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'passwordResetCodeHash'",
        { type: QueryTypes.SELECT }
      );
      if (checkResetHash[0].cnt === 0) {
        await sequelize.query('ALTER TABLE users ADD COLUMN passwordResetCodeHash VARCHAR(255) NULL');
        console.log('➕ Columna passwordResetCodeHash agregada a users.');
      }
    } catch (migrateError) {
      console.warn('⚠️ No se pudo verificar/agregar la columna passwordResetCodeHash:', migrateError.message);
    }

    try {
      const { QueryTypes } = require('sequelize');
      const checkResetExpires = await sequelize.query(
        "SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'passwordResetExpires'",
        { type: QueryTypes.SELECT }
      );
      if (checkResetExpires[0].cnt === 0) {
        await sequelize.query('ALTER TABLE users ADD COLUMN passwordResetExpires DATETIME NULL');
        console.log('➕ Columna passwordResetExpires agregada a users.');
      }
    } catch (migrateError) {
      console.warn('⚠️ No se pudo verificar/agregar la columna passwordResetExpires:', migrateError.message);
    }

    // Agregar iad_obligatorio a users si no existe. DEFAULT TRUE: los
    // estudiantes ya registrados quedan con la Misión Digital obligatoria
    // (el docente la desactiva explícitamente al registrar o editar).
    try {
      const { QueryTypes } = require('sequelize');
      const checkIad = await sequelize.query(
        "SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'iad_obligatorio'",
        { type: QueryTypes.SELECT }
      );
      if (checkIad[0].cnt === 0) {
        await sequelize.query("ALTER TABLE users ADD COLUMN iad_obligatorio BOOLEAN NOT NULL DEFAULT TRUE");
        console.log('➕ Columna iad_obligatorio agregada a users (estudiantes existentes quedan con misión obligatoria).');
      }
    } catch (migrateError) {
      console.warn('⚠️ No se pudo verificar/agregar la columna iad_obligatorio:', migrateError.message);
    }

    // --- Asignación de recursos a VARIOS grupos (pivotes) ----------------------
    // Los recursos ya no guardan un único grupo_id: ahora cada uno puede dirigirse
    // a varios grupos del docente mediante tablas pivote. "Sin grupos" = visible
    // para todos los estudiantes del docente (equivalente al antiguo grupo_id NULL).
    const PIVOTES_GRUPOS = [
      { tabla: 'contenido_grupos', recursoTabla: 'contenidos', col: 'contenido_id' },
      { tabla: 'juego_grupos', recursoTabla: 'juegos', col: 'juego_id' },
      { tabla: 'evaluacion_grupos', recursoTabla: 'evaluaciones', col: 'evaluacion_id' },
    ];

    for (const p of PIVOTES_GRUPOS) {
      try {
        const { QueryTypes } = require('sequelize');
        const existe = await sequelize.query(
          "SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t",
          { replacements: { t: p.tabla }, type: QueryTypes.SELECT }
        );
        if (existe[0].cnt === 0) {
          // Se crea a mano (y no con sync) para poder declarar las FKs y el UNIQUE.
          await sequelize.query(
            `CREATE TABLE \`${p.tabla}\` (
              id INT NOT NULL AUTO_INCREMENT,
              \`${p.col}\` INT NOT NULL,
              grupo_id INT NOT NULL,
              PRIMARY KEY (id),
              UNIQUE KEY \`${p.tabla}_${p.col}_grupo_id\` (\`${p.col}\`, grupo_id),
              KEY \`${p.tabla}_grupo_id\` (grupo_id),
              CONSTRAINT \`fk_${p.tabla}_grupo\` FOREIGN KEY (grupo_id)
                REFERENCES \`grupos\` (id) ON DELETE CASCADE ON UPDATE CASCADE,
              CONSTRAINT \`fk_${p.tabla}_recurso\` FOREIGN KEY (\`${p.col}\`)
                REFERENCES \`${p.recursoTabla}\` (id) ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
          );
          console.log(`➕ Tabla pivote ${p.tabla} creada.`);
        }

        // Backfill: mover el antiguo grupo_id a la pivote (solo si aún queda algo).
        const colVieja = await sequelize.query(
          "SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = 'grupo_id'",
          { replacements: { t: p.recursoTabla }, type: QueryTypes.SELECT }
        );
        if (colVieja[0].cnt > 0) {
          const conGrupo = await sequelize.query(
            `SELECT COUNT(*) as cnt FROM \`${p.recursoTabla}\` WHERE grupo_id IS NOT NULL`,
            { type: QueryTypes.SELECT }
          );
          if (conGrupo[0].cnt > 0) {
            await sequelize.query(
              `INSERT IGNORE INTO \`${p.tabla}\` (\`${p.col}\`, grupo_id)
               SELECT id, grupo_id FROM \`${p.recursoTabla}\`
               WHERE grupo_id IS NOT NULL
                 AND grupo_id IN (SELECT id FROM \`grupos\`)`
            );
            console.log(`🔁 ${conGrupo[0].cnt} recurso(s) migrados de grupo_id a ${p.tabla}.`);
          }
          await sequelize.query(`ALTER TABLE \`${p.recursoTabla}\` DROP COLUMN grupo_id`);
          console.log(`🗑️ Columna grupo_id eliminada de ${p.recursoTabla}.`);
        }
      } catch (pivotError) {
        console.warn(`⚠️ No se pudo verificar la tabla pivote ${p.tabla}:`, pivotError.message);
      }
    }

    // 2. Si la conexión a DB fue exitosa, levantamos el servidor Express
    const server = app.listen(PORT, () => {
      console.log(`🚀 Servidor backend de EduApp corriendo en http://localhost:${PORT}`);
      console.log(`✅ Prueba la API en: http://localhost:${PORT}/api/health`);
    });

    // Guardar referencia global para graceful shutdown.
    global._server = server;

    // Planificador de reportes programados: revisa cada hora las programaciones
    // vencidas. El teacher.controller también las ejecuta al iniciar sesión,
    // que es la red de seguridad cuando el proceso estuvo apagado.
    try {
      require('./services/reportSchedule.service').iniciarScheduler();
    } catch (schedulerError) {
      console.warn('⚠️ No se pudo iniciar el planificador de reportes:', schedulerError.message);
    }

    // Manejar errores a nivel de servidor HTTP (EADDRINUSE, ECONNRESET, etc.)
    server.on('error', (err) => {
      console.error('[Servidor] Error en el servidor HTTP:', err.message);
      if (err.code === 'EADDRINUSE') {
        console.error(`[Servidor] El puerto ${PORT} ya está en uso. Cerrando.`);
      }
    });
  } catch (error) {
    console.error('❌ Error crítico al iniciar el servidor:', error);
    process.exit(1); // Detiene la ejecución si hay un error grave
  }
};

startServer();
