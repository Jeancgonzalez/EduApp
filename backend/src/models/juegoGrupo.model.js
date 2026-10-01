const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Asociación juego -> grupos (muchos-a-muchos).
 * Un juego puede dirigirse a varios grupos del mismo docente.
 * Si no hay filas en esta tabla, el juego es visible para todos los
 * estudiantes del docente (misma semántica que grupo_id = NULL antes).
 */
const GameGroup = sequelize.define('GameGroup', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  juego_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  grupo_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  timestamps: false,
  tableName: 'juego_grupos',
  indexes: [
    { unique: true, fields: ['juego_id', 'grupo_id'] },
    { fields: ['grupo_id'] }
  ]
});

module.exports = GameGroup;
