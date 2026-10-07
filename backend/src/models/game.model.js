const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Game = sequelize.define('Game', {
  id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },

  titulo: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },

  tipo: { 
    type: DataTypes.STRING(100),
     allowNull: false
     },

  modulo: {
     type: DataTypes.STRING(100), 
     allowNull: false 
    },

  modulo_content_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID del contenido publicado al que está relacionado el juego'
  },

  descripcion: { 
    type: DataTypes.TEXT, 
    allowNull: true 
  },

  configuracion: {
    type: DataTypes.JSON, 
    allowNull: true 
  },

  docente_id: { 
    type: DataTypes.INTEGER, 
    allowNull: false 
  },

  puntaje_max: { 
    type: DataTypes.INTEGER, 
    allowNull: false, 
    defaultValue: 100 
  },

  publicado: {
     type: DataTypes.BOOLEAN, 
     defaultValue: false, 
     comment: 'Si es true, el juego no puede editarse ni eliminarse'
     },

  created_at: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  },
  // `juegos` está declarado con timestamps:false, así que no había forma de saber
  // cuántas veces se editó. Agregado por migración 001.
  updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  }
  
}, {
  timestamps: false,
  tableName: 'juegos'
});

module.exports = Game;

