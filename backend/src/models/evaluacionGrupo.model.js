const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Asociación evaluación -> grupos (muchos-a-muchos).
 * Una evaluación puede dirigirse a varios grupos del mismo docente.
 * Si no hay filas en esta tabla, la evaluación es visible para todos los
 * estudiantes del docente (misma semántica que grupo_id = NULL antes).
 */
const EvaluationGroup = sequelize.define('EvaluationGroup', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  evaluacion_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  grupo_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  timestamps: false,
  tableName: 'evaluacion_grupos',
  indexes: [
    { unique: true, fields: ['evaluacion_id', 'grupo_id'] },
    { fields: ['grupo_id'] }
  ]
});

module.exports = EvaluationGroup;
