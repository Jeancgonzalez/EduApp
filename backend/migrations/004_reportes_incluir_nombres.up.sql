-- ============================================================================
-- 004_reportes_incluir_nombres.up.sql
-- Opción por programación "incluir nombres" para reportes de grupo.
--
-- Por privacidad, los reportes muestran el alias (nombre abreviado: "Andrés M.")
-- salvo que el docente active "Incluir nombres" (incluir_nombres = 1) para ver
-- el nombre completo, igual que lo ve en el dashboard.
--
-- Idempotente: la columna solo se agrega si no existe, como en 001.
-- ============================================================================
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_schedules' AND COLUMN_NAME = 'incluir_nombres');
SET @s := IF(@c = 0, 'ALTER TABLE `report_schedules` ADD COLUMN `incluir_nombres` TINYINT(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;