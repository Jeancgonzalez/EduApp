const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Evaluation = sequelize.define('Evaluation', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  titulo: { type: DataTypes.STRING, allowNull: false },
  descripcion: { type: DataTypes.TEXT, allowNull: true },
  modulo: { type: DataTypes.STRING, allowNull: false },
  modulo_content_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  docente_id: { type: DataTypes.INTEGER, allowNull: false },
  grupo_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Grupo al que está dirigida la evaluación. NULL = visible para todos los estudiantes del docente'
  },
  tiempoLimitado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  tiempoMinutos: { type: DataTypes.INTEGER, allowNull: true },
  publicado: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Si es true, la evaluación no puede editarse ni eliminarse'
  },
  requiere_contenido_apoyo: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  contenido_apoyo_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  max_intentos: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 1 }
  }
}, {
  timestamps: true,
  tableName: 'evaluaciones'
});

module.exports = Evaluation;
