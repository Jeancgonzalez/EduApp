-- ============================================================================
-- 005_detalle_intentos.up.sql
-- Detalle por intento para evaluaciones y juegos (solo datos reales)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `evaluacion_intento_respuestas` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `intento_id` INT UNSIGNED NOT NULL,
  `pregunta_id` INT NOT NULL,
  `opcion_elegida` CHAR(1) NULL COMMENT 'Letra normalizada (a,b,c,d) o null',
  `respuesta_enviada` VARCHAR(255) NULL COMMENT 'Respuesta tal como la envio el estudiante',
  `es_correcta` TINYINT(1) NOT NULL DEFAULT 0,
  `respondida` TINYINT(1) NOT NULL DEFAULT 1,
  `tiempo_seg` SMALLINT UNSIGNED NULL,
  `creado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_eir_intento_pregunta` (`intento_id`, `pregunta_id`),
  KEY `idx_eir_intento` (`intento_id`),
  KEY `idx_eir_pregunta` (`pregunta_id`),
  CONSTRAINT `fk_eir_intento` FOREIGN KEY (`intento_id`) REFERENCES `actividad_intentos`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eir_pregunta` FOREIGN KEY (`pregunta_id`) REFERENCES `preguntas`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `juego_intento_elementos` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `intento_id` INT UNSIGNED NOT NULL,
  `elemento_clave` VARCHAR(100) NOT NULL COMMENT 'Clave para ubicar el elemento en la configuracion',
  `elemento_tipo` VARCHAR(40) NULL COMMENT 'palabra, pista, adivinanza, relacion, memoria',
  `esperado` TEXT NULL,
  `respuesta_dada` TEXT NULL,
  `es_correcta` TINYINT(1) NOT NULL DEFAULT 0,
  `respondido` TINYINT(1) NOT NULL DEFAULT 1,
  `concepto` VARCHAR(255) NULL COMMENT 'Concepto inferido del elemento (real, sin inventar)',
  `creado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_jie_intento` (`intento_id`),
  KEY `idx_jie_clave` (`intento_id`, `elemento_clave`),
  CONSTRAINT `fk_jie_intento` FOREIGN KEY (`intento_id`) REFERENCES `actividad_intentos`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
