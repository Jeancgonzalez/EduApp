-- ============================================================================
-- 004_reportes_incluir_nombres.down.sql
-- Quita la opción "incluir nombres" de las programaciones de reportes.
-- ============================================================================
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_schedules' AND COLUMN_NAME = 'incluir_nombres');
SET @s := IF(@c = 1, 'ALTER TABLE `report_schedules` DROP COLUMN `incluir_nombres`', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;