const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Sesión de trabajo del estudiante.
 *
 * Base de los indicadores que antes no existían: tiempo activo, usuarios activos
 * (DAU) y retención a 7 días. El frontend envía un heartbeat; una sesión con
 * heartbeat envejecido se considera cerrada (`activa = 0`) sin necesidad de que
 * el cliente la cierre explícitamente.
 */
const EstudianteSesion = sequelize.define('EstudianteSesion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  estudiante_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  docente_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  grupo_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  iniciado_en: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  ultimo_heartbeat: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  duracion_seg: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
  },
  activa: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  user_agent: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  cerrada_en: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: false,
  tableName: 'estudiante_sesion',
});

module.exports = EstudianteSesion;