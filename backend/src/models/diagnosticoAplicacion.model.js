const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Modelo DiagnosticoAplicacion (IAD-Primaria).
 * Una fila por cada aplicación del instrumento por parte de un estudiante.
 * Cuando está 'completado' almacena el resultado calculado (puntaje total,
 * nivel y desglose por dimensión + fortaleza/oportunidad) que consume el docente.
 * El cálculo siempre se realiza y guarda en el backend, nunca en el frontend.
 */
const DiagnosticoAplicacion = sequelize.define('DiagnosticoAplicacion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  estudiante_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  // 'en_progreso' | 'completado'
  estado: {
    type: DataTypes.STRING(12),
    allowNull: false,
    defaultValue: 'en_progreso',
  },
  // Puntaje total 0..30 (se llena al completar las 10 situaciones).
  puntaje_total: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // 'Bajo' | 'Medio' | 'Alto'
  nivel: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },
  // JSON: { dimensiones: [...], fortaleza, oportunidad }
  desglose: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  // Fecha en que se completó la aplicación.
  aplicada_en: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: 'diagnostico_aplicaciones',
});

module.exports = DiagnosticoAplicacion;