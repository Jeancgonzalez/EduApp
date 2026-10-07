-- Reversión de 003_dashboard_intentos_grupo.
--
-- Sin `IF EXISTS`: MariaDB 10.4 no lo acepta en `DROP COLUMN` y abortaría la
-- migración, dejando la base en un estado intermedio.
ALTER TABLE `actividad_intentos` DROP INDEX `idx_intentos_docente_grupo_fecha`;

ALTER TABLE `actividad_intentos` DROP COLUMN `grupo_id`;