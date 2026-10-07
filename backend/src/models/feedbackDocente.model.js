const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Retroalimentación del docente hacia un estudiante concreto.
 *
 * Antes no existía este canal: `preguntas.retroalimentacion` es texto autor
 * escrito al crear la pregunta, no feedback emitido a un alumno. Aquí queda
 * registro de lo emitido, con estado de lectura para el estudiante.
 */
const FeedbackDocente = sequelize.define('FeedbackDocente', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  docente_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  estudiante_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  grupo_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  ambito: {
    type: DataTypes.ENUM('general', 'actividad'),
    allowNull: false,
    defaultValue: 'general',
  },
  actividad_tipo: {
    type: DataTypes.ENUM('contenido', 'juego', 'evaluacion'),
    allowNull: true,
  },
  actividad_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  mensaje: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  emitido_en: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  leido: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  leido_en: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: false,
  tableName: 'feedback_docente',
});

module.exports = FeedbackDocente;