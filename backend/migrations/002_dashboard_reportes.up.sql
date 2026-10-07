-- ============================================================================
-- 002_dashboard_reportes.up.sql
-- Reportes programados: definición de la programación, historial de
-- ejecuciones y soporte de exportación.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- report_schedules
-- Programación de reportes por docente. frecuencia_meses ∈ {1,2,3}.
-- La comprobación de vencimiento (proxima_ejecucion) la hace el planificador
-- interno del backend y, además, la verificación al iniciar sesión del docente
-- como red de seguridad si el proceso estuvo apagado.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `report_schedules` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `docente_id`          INT NOT NULL,
  `grupo_id`            INT NULL,
  `nombre`              VARCHAR(120) NOT NULL,
  `frecuencia_meses`    TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `fecha_inicio`        DATE NOT NULL,
  `proxima_ejecucion`   DATETIME NOT NULL,
  `formato`             ENUM('pdf','csv','html') NOT NULL DEFAULT 'pdf',
  `secciones`           TEXT NOT NULL COMMENT 'JSON array con las secciones incluidas',
  `canal`               ENUM('app','email') NOT NULL DEFAULT 'app',
  `activo`              TINYINT(1) NOT NULL DEFAULT 1,
  `ultima_ejecucion`    DATETIME NULL,
  `creado_en`           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_schedules_docente` (`docente_id`, `activo`),
  KEY `idx_schedules_pendientes` (`activo`, `proxima_ejecucion`),
  CONSTRAINT `ck_schedules_frecuencia` CHECK (`frecuencia_meses` BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- report_runs
-- Historial de cada ejecución: manual ("enviar ahora") o programada.
-- `payload` guarda el snapshot de métricas que componía el reporte, de modo que
-- un reporte histórico siga siendo consultable aunque los datos luego cambien.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `report_runs` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `schedule_id`     INT NULL,
  `docente_id`      INT NOT NULL,
  `grupo_id`        INT NULL,
  `disparador`      ENUM('programado','manual','login') NOT NULL DEFAULT 'programado',
  `estado`          ENUM('pendiente','generado','enviado','error') NOT NULL DEFAULT 'pendiente',
  `periodo_desde`   DATE NULL,
  `periodo_hasta`   DATE NULL,
  `formato`         VARCHAR(10) NULL,
  `secciones`       TEXT NULL COMMENT 'JSON array con las secciones incluidas',
  `payload`         TEXT NULL COMMENT 'Snapshot JSON de las métricas agregadas',
  `canal`           ENUM('app','email') NOT NULL DEFAULT 'app',
  `correo_enviado`  TINYINT(1) NOT NULL DEFAULT 0,
  `error_mensaje`   VARCHAR(500) NULL,
  `creado_en`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `generado_en`     DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_runs_docente_fecha` (`docente_id`, `creado_en`),
  KEY `idx_runs_schedule_fecha` (`schedule_id`, `creado_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;