const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Resultado por elemento de un intento de juego.
 *
 * Los juegos (sopa de letras, crucigrama, adivinanza, relacionar, memotest) no
 * tienen una tabla de preguntas, así que el detalle se guarda de forma flexible:
 * `elemento_clave` identifica el elemento dentro de `juegos.configuracion`,
 * `elemento_tipo` describe qué es (palabra, pista, adivinanza, relación, memoria)
 * y `concepto` es la etiqueta inferida a partir del propio elemento.
 *
 * Se escribe un renglón por cada elemento evaluado en el intento y se vincula
 * con `actividad_intentos.id`. Nunca se fabrican elementos: si el juego no
 * envió el detalle, no hay filas y el panel lo reporta como "sin detalle".
 */
const JuegoIntentoElemento = sequelize.define('JuegoIntentoElemento', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  intento_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  elemento_clave: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Clave/índice para ubicar el elemento en la configuración',
  },
  elemento_tipo: {
    type: DataTypes.STRING(40),
    allowNull: true,
    comment: 'palabra, pista, adivinanza, relacion, memoria...',
  },
  esperado: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  respuesta_dada: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  es_correcta: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  respondido: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  concepto: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Concepto inferido del elemento (real, sin inventar)',
  },
}, {
  timestamps: true,
  createdAt: 'creado_en',
  updatedAt: false,
  tableName: 'juego_intento_elementos',
  indexes: [
    { name: 'idx_jie_intento', fields: ['intento_id'] },
    { name: 'idx_jie_clave', fields: ['intento_id', 'elemento_clave'] },
  ],
});

module.exports = JuegoIntentoElemento;
