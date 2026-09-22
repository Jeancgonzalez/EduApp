const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Modelo DiagnosticoPregunta (IAD-Primaria).
 * Banco del instrumento de alfabetización digital. Se guarda como DATOS (no
 * hardcodeado en el frontend) para poder ajustarlo en el futuro sin tocar código.
 * Cada "pregunta" es una situación de la vida cotidiana con sus opciones y los
 * puntos que otorga cada una (0/1/3).
 */
const DiagnosticoPregunta = sequelize.define('DiagnosticoPregunta', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  // Clave de la dimensión: 'herramientas' | 'informacion' | 'seguridad'
  dimension: {
    type: DataTypes.STRING(30),
    allowNull: false,
  },
  // Nombre legible de la dimensión (para mostrar en el desglose al docente).
  dimension_nombre: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  // Posición (1..10). Permite ordenar las 10 situaciones.
  orden: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  // Texto verbatim de la situación (semilla del instrumento).
  situacion: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  // JSON: [{ letra: 'A', texto: '...', puntos: 0 }, ...]
  opciones: {
    type: DataTypes.JSON,
    allowNull: false,
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  timestamps: true,
  tableName: 'diagnostico_preguntas',
});

module.exports = DiagnosticoPregunta;