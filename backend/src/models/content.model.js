const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Content = sequelize.define('Content', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  titulo: { type: DataTypes.STRING, allowNull: false },
  descripcion: { type: DataTypes.TEXT, allowNull: true },
  tipo: { type: DataTypes.STRING, allowNull: false, comment: 'texto, video, pdf, documento' },
  contenido: { type: DataTypes.TEXT, allowNull: false, comment: 'URL o texto del contenido' },
  modulo: { type: DataTypes.STRING, allowNull: false },
  docente_id: { type: DataTypes.INTEGER, allowNull: false },
  publicado: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Si es true, el contenido no puede editarse ni eliminarse'
  },
  fecha_creacion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  timestamps: false,
  tableName: 'contenidos'
});

module.exports = Content;
