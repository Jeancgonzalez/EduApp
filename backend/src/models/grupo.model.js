const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Grupo de estudiantes administrado por un docente, asociado a una materia.
 * Relación: DOCENTE -> GRUPO -> ESTUDIANTES (vía grupo_estudiantes).
 */
const Group = sequelize.define('Group', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  docente_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  materia: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  nombre: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  creado_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: false,
  tableName: 'grupos',
  indexes: [
    { unique: true, fields: ['docente_id', 'materia', 'nombre'] }
  ]
});

module.exports = Group;