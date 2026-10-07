const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Programación de reportes automáticos del docente.
 *
 * `frecuencia_meses` ∈ {1, 2, 3}. `proxima_ejecucion` es lo que consulta el
 * planificador interno del backend y, como red de seguridad, la verificación al
 * iniciar sesión del docente (por si el proceso estuvo apagado).
 */
const ReportSchedule = sequelize.define('ReportSchedule', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  docente_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  grupo_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'NULL = todos los grupos del docente',
  },
  nombre: {
    type: DataTypes.STRING(120),
    allowNull: false,
  },
  frecuencia_meses: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: { min: 1, max: 3 },
  },
  fecha_inicio: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  proxima_ejecucion: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  formato: {
    type: DataTypes.ENUM('pdf', 'csv', 'html'),
    allowNull: false,
    defaultValue: 'pdf',
  },
  secciones: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'JSON array con las secciones incluidas',
  },
  canal: {
    type: DataTypes.ENUM('app', 'email'),
    allowNull: false,
    defaultValue: 'app',
  },
  activo: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  incluir_nombres: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '1 = mostrar nombre completo, 0 = solo alias abreviado',
  },
  ultima_ejecucion: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  creado_en: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  actualizado_en: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: false,
  tableName: 'report_schedules',
});

module.exports = ReportSchedule;