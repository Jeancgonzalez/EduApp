const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Asociación estudiante -> grupo.
 * Permite que un estudiante pertenezca a los grupos que su docente le asigne.
 */
const GroupStudent = sequelize.define('GroupStudent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  grupo_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  estudiante_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  timestamps: false,
  tableName: 'grupo_estudiantes',
  indexes: [
    { unique: true, fields: ['grupo_id', 'estudiante_id'] },
    { fields: ['estudiante_id'] }
  ]
});

module.exports = GroupStudent;