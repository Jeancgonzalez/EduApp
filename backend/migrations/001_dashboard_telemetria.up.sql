-- ============================================================================
-- 001_dashboard_telemetria.up.sql
-- Telemetría para el dashboard del docente: log append-only de intentos,
-- sesiones de estudiante, medallas persistidas, auditoría docente,
-- retroalimentación docente→estudiante y notificaciones in-app.
--
-- Idempotente: todo usa IF NOT EXISTS para poder ejecutarse tanto sobre una
-- base creada por sequelize.sync() como sobre una base ya existente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- actividad_intentos
-- Tabla central de analítica. A diferencia de progreso_estudiante (que guarda
-- solo el MEJOR resultado por estudiante x actividad y sobrescribe `fecha` y
-- `respuestas` en cada reintento), aquí se registra CADA intento.
-- Habilita: acierto en primer intento, abandono, tiempo de resolución,
-- participación semanal, mapa de calor y series temporales consistentes.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `actividad_intentos` (
  `id`                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `estudiante_id`          INT NOT NULL,
  `docente_id`             INT NOT NULL,
  `tipo`                   ENUM('contenido','juego','evaluacion') NOT NULL,
  `actividad_id`           INT NOT NULL,
  `modulo`                 VARCHAR(120) NULL,
  `numero_intento`         SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `puntaje_obtenido`       INT NULL,
  `puntaje_maximo`         INT NULL,
  `aciertos`               SMALLINT UNSIGNED NULL,
  `preguntas_total`        SMALLINT UNSIGNED NULL,
  `acierto_primer_intento` TINYINT(1) NULL,
  `duracion_seg`           SMALLINT UNSIGNED NULL,
  `iniciado_en`            DATETIME NOT NULL,
  `completado`             TINYINT(1) NOT NULL DEFAULT 0,
  `abandono`               TINYINT(1) NOT NULL DEFAULT 0,
  `creado_en`              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cerrado_en`             DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_intentos_docente_fecha` (`docente_id`, `iniciado_en`),
  KEY `idx_intentos_estudiante_fecha` (`estudiante_id`, `iniciado_en`),
  KEY `idx_intentos_docente_actividad` (`docente_id`, `tipo`, `actividad_id`),
  KEY `idx_intentos_estudiante_actividad` (`estudiante_id`, `tipo`, `actividad_id`, `numero_intento`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- estudiante_sesion
-- Habilita tiempo activo, DAU y retención a 7 días. El heartbeat llega del
-- frontend; `activa` se apaga sola cuando el heartbeat envejece.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `estudiante_sesion` (
  `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `estudiante_id`     INT NOT NULL,
  `docente_id`        INT NOT NULL,
  `grupo_id`          INT NULL,
  `iniciado_en`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ultimo_heartbeat`  DATETIME NULL,
  `duracion_seg`      INT UNSIGNED NOT NULL DEFAULT 0,
  `activa`            TINYINT(1) NOT NULL DEFAULT 1,
  `user_agent`        VARCHAR(255) NULL,
  `cerrada_en`        DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sesiones_docente_fecha` (`docente_id`, `iniciado_en`),
  KEY `idx_sesiones_estudiante_fecha` (`estudiante_id`, `iniciado_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- medallas_obtenidas
-- Las 48 insignias de medals.service.js se calculaban en cada lectura y no se
-- guardaban nunca. Aquí se registra la primera vez que se obtiene cada una:
-- habilita "insignias más/menos obtenidas" y la fecha de obtención por alumno.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `medallas_obtenidas` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `estudiante_id` INT NOT NULL,
  `docente_id`    INT NOT NULL,
  `medalla_id`    VARCHAR(64) NOT NULL,
  `categoria`     VARCHAR(40) NULL,
  `obtenido_en`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_medalla_estudiante` (`estudiante_id`, `medalla_id`),
  KEY `idx_medallas_docente` (`docente_id`, `medalla_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- docente_actividad_auditoria
-- contenidos y juegos se definen con timestamps:false, por lo que hoy no se
-- sabe cuándo se crearon ni cuántas veces se editaron. Esta tabla cubre el
-- indicador "actividades creadas/editadas" para los tres tipos de recurso.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `docente_actividad_auditoria` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `docente_id`  INT NOT NULL,
  `tipo`        ENUM('contenido','juego','evaluacion','grupo') NOT NULL,
  `recurso_id`  INT NULL,
  `accion`      ENUM('crear','editar','eliminar','publicar','despublicar') NOT NULL,
  `modulo`      VARCHAR(120) NULL,
  `titulo`      VARCHAR(255) NULL,
  `creado_en`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_auditoria_docente_fecha` (`docente_id`, `creado_en`),
  KEY `idx_auditoria_docente_tipo_fecha` (`docente_id`, `tipo`, `creado_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- feedback_docente
-- No existía ningún canal de retroalimentación docente→estudiante.
-- (preguntas.retroalimentacion es texto autor escrito al crear la pregunta,
-- no feedback emitido a un alumno concreto.)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `feedback_docente` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `docente_id`     INT NOT NULL,
  `estudiante_id`  INT NOT NULL,
  `grupo_id`       INT NULL,
  `ambito`         ENUM('general','actividad') NOT NULL DEFAULT 'general',
  `actividad_tipo` ENUM('contenido','juego','evaluacion') NULL,
  `actividad_id`   INT NULL,
  `mensaje`        TEXT NOT NULL,
  `emitido_en`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `leido`          TINYINT(1) NOT NULL DEFAULT 0,
  `leido_en`       DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_feedback_docente_fecha` (`docente_id`, `emitido_en`),
  KEY `idx_feedback_estudiante_fecha` (`estudiante_id`, `emitido_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- notifications (campana con contador dentro de la app)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `docente_id` INT NOT NULL,
  `tipo`       VARCHAR(40) NOT NULL DEFAULT 'info',
  `titulo`     VARCHAR(180) NOT NULL,
  `mensaje`    TEXT NULL,
  `data`       TEXT NULL,
  `leido`      TINYINT(1) NOT NULL DEFAULT 0,
  `leido_en`   DATETIME NULL,
  `creado_en`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notificaciones_docente` (`docente_id`, `leido`, `creado_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Columnas nuevas sobre tablas existentes.
-- Cada bloque solo actúa si la columna no existe, de modo que la migración es
-- reentrante. Los scripts .down.sql deshacen exactamente estos cambios.
-- ----------------------------------------------------------------------------

-- Último acceso: base de la retención a 7 días y del DAU.
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'last_login_at');
SET @s := IF(@c = 0, 'ALTER TABLE `users` ADD COLUMN `last_login_at` DATETIME NULL DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- contenidos y juegos no tenían createdAt/updatedAt (timestamps: false).
-- `juegos` ya traía `created_at` de forma aislada, así que cada columna se
-- comprueba por separado en lugar de en un único ALTER combinado.
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contenidos' AND COLUMN_NAME = 'created_at');
SET @s := IF(@c = 0, 'ALTER TABLE `contenidos` ADD COLUMN `created_at` DATETIME NULL DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contenidos' AND COLUMN_NAME = 'updated_at');
SET @s := IF(@c = 0, 'ALTER TABLE `contenidos` ADD COLUMN `updated_at` DATETIME NULL DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'juegos' AND COLUMN_NAME = 'created_at');
SET @s := IF(@c = 0, 'ALTER TABLE `juegos` ADD COLUMN `created_at` DATETIME NULL DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'juegos' AND COLUMN_NAME = 'updated_at');
SET @s := IF(@c = 0, 'ALTER TABLE `juegos` ADD COLUMN `updated_at` DATETIME NULL DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- subtema por pregunta: fuente del radar por subtema.
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'preguntas' AND COLUMN_NAME = 'subtema');
SET @s := IF(@c = 0, 'ALTER TABLE `preguntas` ADD COLUMN `subtema` VARCHAR(120) NULL DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- El diagnóstico IAD pasa a admitir post-test sin crear una tabla nueva.
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'diagnostico_aplicaciones' AND COLUMN_NAME = 'tipo');
SET @s := IF(@c = 0, 'ALTER TABLE `diagnostico_aplicaciones` ADD COLUMN `tipo` ENUM(''pre'',''post'') NOT NULL DEFAULT ''pre''', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;