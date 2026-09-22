const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const StudentProgress = sequelize.define('StudentProgress', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  estudiante_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  contenido_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  juego_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  evaluacion_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  completado: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  puntaje: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  fecha: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  intentos_realizados: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  feedback_visto: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  respuestas: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON con las respuestas del estudiante'
  }
}, {
  timestamps: false,
  tableName: 'progreso_estudiante',
  indexes: [
    { unique: true, fields: ['estudiante_id', 'contenido_id'] },
    { unique: true, fields: ['estudiante_id', 'juego_id'] },
    { unique: true, fields: ['estudiante_id', 'evaluacion_id'] }
  ]
});

module.exports = StudentProgress;
