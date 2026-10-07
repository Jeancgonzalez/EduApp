const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Historial de ejecuciones de reportes.
 *
 * Cubre tanto las programadas como el botón "enviar ahora" y la ejecución de
 * respaldo al iniciar sesión. `payload` guarda el snapshot de métricas que
 * componía el reporte, de modo que un reporte histórico siga siendo consultable
 * aunque los datosunderlying cambien después.
 */
const ReportRun = sequelize.define('ReportRun', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  schedule_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  docente_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  grupo_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  disparador: {
    type: DataTypes.ENUM('programado', 'manual', 'login'),
    allowNull: false,
    defaultValue: 'programado',
  },
  estado: {
    type: DataTypes.ENUM('pendiente', 'generado', 'enviado', 'error'),
    allowNull: false,
    defaultValue: 'pendiente',
  },
  periodo_desde: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  periodo_hasta: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  formato: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },
  secciones: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  payload: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Snapshot JSON de las métricas agregadas',
  },
  canal: {
    type: DataTypes.ENUM('app', 'email'),
    allowNull: false,
    defaultValue: 'app',
  },
  correo_enviado: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  error_mensaje: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  creado_en: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  generado_en: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: false,
  tableName: 'report_runs',
});

module.exports = ReportRun;