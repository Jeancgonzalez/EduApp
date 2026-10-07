const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Primera vez que cada estudiante obtiene una insignia.
 *
 * `medals.service.js` calcula ~48 insignias en cada lectura y no persiste nada,
 * así que no existía fecha de obtención. Con este registro el indicador
 * "insignias más/menos obtenidas" pasa de calcularse recorriendo a todos los
 * alumnos en cada request a un simple GROUP BY.
 */
const MedallaObtenida = sequelize.define('MedallaObtenida', {
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
  medalla_id: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  categoria: {
    type: DataTypes.STRING(40),
    allowNull: true,
  },
  obtenido_en: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: false,
  tableName: 'medallas_obtenidas',
  indexes: [
    { unique: true, fields: ['estudiante_id', 'medalla_id'] },
    { fields: ['docente_id', 'medalla_id'] },
  ],
});

module.exports = MedallaObtenida;