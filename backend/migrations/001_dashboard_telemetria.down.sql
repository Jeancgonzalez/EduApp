-- ============================================================================
-- 001_dashboard_telemetria.down.sql
-- Reversión exacta de 001_dashboard_telemetria.up.sql.
--
-- Las tablas se eliminan por completo y las columnas añadidas se retiran.
-- Los datos previos (progreso_estudiante, contenidos, etc.) NO se tocan, salvo
-- las columnas nuevas que desaparecen junto con sus datos (lo esperado).
--
-- Nota de compatibilidad: `DROP COLUMN IF EXISTS` solo existe a partir de
-- MySQL 8.0.29, así que aquí se usa el mismo patrón information_schema +
-- PREPARE que el script up. Funciona en MySQL 5.7+.
-- ============================================================================

-- Tablas nuevas (orden inverso al de creación por dependencias).
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `feedback_docente`;
DROP TABLE IF EXISTS `docente_actividad_auditoria`;
DROP TABLE IF EXISTS `medallas_obtenidas`;
DROP TABLE IF EXISTS `estudiante_sesion`;
DROP TABLE IF EXISTS `actividad_intentos`;

-- Columnas añadidas sobre tablas existentes.
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'diagnostico_aplicaciones' AND COLUMN_NAME = 'tipo');
SET @s := IF(@c = 0, 'DO 0', 'ALTER TABLE `diagnostico_aplicaciones` DROP COLUMN `tipo`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'preguntas' AND COLUMN_NAME = 'subtema');
SET @s := IF(@c = 0, 'DO 0', 'ALTER TABLE `preguntas` DROP COLUMN `subtema`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- `juegos.created_at` ya existía antes de esta migración (viene del modelo con
-- timestamps:false), así que el script up nunca lo añadió y aquí tampoco se quita.
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'juegos' AND COLUMN_NAME = 'updated_at');
SET @s := IF(@c = 0, 'DO 0', 'ALTER TABLE `juegos` DROP COLUMN `updated_at`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contenidos' AND COLUMN_NAME = 'updated_at');
SET @s := IF(@c = 0, 'DO 0', 'ALTER TABLE `contenidos` DROP COLUMN `updated_at`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contenidos' AND COLUMN_NAME = 'created_at');
SET @s := IF(@c = 0, 'DO 0', 'ALTER TABLE `contenidos` DROP COLUMN `created_at`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'last_login_at');
SET @s := IF(@c = 0, 'DO 0', 'ALTER TABLE `users` DROP COLUMN `last_login_at`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;