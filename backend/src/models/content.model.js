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
  fecha_creacion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  // `contenidos` estaba declarado con timestamps:false, así que no había forma de
  // saber cuándo se creó ni cuántas veces se editó. Estos dos campos cierran el
  // indicador "actividades creadas/editadas" (agregado por migración 001).
  created_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  updated_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null }
}, {
  timestamps: false,
  tableName: 'contenidos'
});

module.exports = Content;
