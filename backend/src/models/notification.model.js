const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Notificación interna del docente (campana con contador).
 *
 * `notification.service.js` solo envía correos: no guarda nada, así que el
 * docente no tenía forma de consultar qué se le notificó ni qué ya leyó.
 */
const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  docente_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'info',
  },
  titulo: {
    type: DataTypes.STRING(180),
    allowNull: false,
  },
  mensaje: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  data: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON con datos de navegación (run_id, schedule_id, etc.)',
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
  creado_en: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: false,
  tableName: 'notifications',
});

module.exports = Notification;