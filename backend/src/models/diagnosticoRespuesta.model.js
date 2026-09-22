const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Modelo DiagnosticoRespuesta (IAD-Primaria).
 * Respuesta seleccionada por pregunta para una aplicación del diagnóstico.
 * Se guarda al instante cada elección, lo que permite abandonar a la mitad y
 * reanudar luego en la siguiente situación sin perder el avance.
 * UNIQUE (aplicacion_id, pregunta_id) evita duplicar respuestas al reanudar.
 */
const DiagnosticoRespuesta = sequelize.define('DiagnosticoRespuesta', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  aplicacion_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'diagnostico_aplicaciones', key: 'id' },
  },
  pregunta_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'diagnostico_preguntas', key: 'id' },
  },
  letra: {
    type: DataTypes.STRING(1),
    allowNull: false,
  },
  puntaje: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  timestamps: true,
  tableName: 'diagnostico_respuestas',
  indexes: [
    { unique: true, fields: ['aplicacion_id', 'pregunta_id'] },
  ],
});

module.exports = DiagnosticoRespuesta;