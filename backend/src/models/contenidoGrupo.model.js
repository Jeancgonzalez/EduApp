const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Asociación contenido -> grupos (muchos-a-muchos).
 * Un contenido puede dirigirse a varios grupos del mismo docente.
 * Si no hay filas en esta tabla, el contenido es visible para todos los
 * estudiantes del docente (misma semántica que grupo_id = NULL antes).
 */
const ContentGroup = sequelize.define('ContentGroup', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  contenido_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  grupo_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  timestamps: false,
  tableName: 'contenido_grupos',
  indexes: [
    { unique: true, fields: ['contenido_id', 'grupo_id'] },
    { fields: ['grupo_id'] }
  ]
});

module.exports = ContentGroup;
