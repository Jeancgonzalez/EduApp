-- ----------------------------------------------------------------------------
--(activity_intentos.grupo_id) — FASE 2b del dashboard del docente
--
-- `associations.js` declara `ActividadIntento.belongsTo(Group, { foreignKey:
-- 'grupo_id' })`, y Sequelize añade esa clave foránea a la lista de atributos
-- del modelo. Como la columna no existía en `actividad_intentos`, TODA lectura
-- de la tabla fallaba con "Unknown column 'grupo_id' in 'field list'":
--
--   - POST /api/student/actividad/:tipo/:id/iniciar devolvía 500
--   - `TeletriaService.cerrarIntento` fallaba en su `findOne`, de modo que
--     resolver un juego o una evaluación nunca cerraba el intento abierto
--
-- Las demás tablas de telemetría (`estudiante_sesion`, `feedback_docentes`,
-- `report_schedules`, `report_runs`) ya llevan `grupo_id`; aquí faltaba.
--
-- Se deja NULLABLE y sin clave foránea, igual que en `estudiante_sesion`: un
-- estudiante puede pertenecer a varios grupos, así que la atribución por grupo se
-- resuelve en el dashboard cruzando `grupo_estudiantes`, no al escribir el
-- intento. La columna existe para que la asociación sea utilizable.
-- ----------------------------------------------------------------------------
ALTER TABLE `actividad_intentos` ADD COLUMN `grupo_id` INT NULL AFTER `docente_id`;

CREATE INDEX `idx_intentos_docente_grupo_fecha` ON `actividad_intentos` (`docente_id`, `grupo_id`, `iniciado_en`);