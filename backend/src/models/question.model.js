const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Evaluation = require('./evaluation.model');

const Question = sequelize.define('Question', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  evaluacion_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Evaluation,
      key: 'id'
    }
  },
  pregunta: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  opcion_a: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  opcion_b: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  opcion_c: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  opcion_d: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  respuesta_correcta: {
    type: DataTypes.STRING(1),
    allowNull: false,
    comment: 'Almacena la letra de la opción correcta (ej: a)'
  },
  retroalimentacion: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true, // Agrega createdAt y updatedAt
  tableName: 'preguntas'
});

// Establecemos las relaciones entre Evaluación y Preguntas
Evaluation.hasMany(Question, { foreignKey: 'evaluacion_id', as: 'preguntas' });
Question.belongsTo(Evaluation, { foreignKey: 'evaluacion_id', as: 'evaluacion' });

module.exports = Question;
