const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Auditoría de creación/edición de recursos del docente.
 *
 * `contenidos` y `juegos` están definidos con `timestamps: false`, así que hoy
 * no se sabe cuándo se crearon ni cuántas veces se editaron (solo `evaluaciones`
 * tiene createdAt/updatedAt). Esta tabla cubre el indicador "actividades
 * creadas/editadas" para los tres tipos de recurso.
 */
const DocenteActividadAuditoria = sequelize.define('DocenteActividadAuditoria', {
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
    type: DataTypes.ENUM('contenido', 'juego', 'evaluacion', 'grupo'),
    allowNull: false,
  },
  recurso_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  accion: {
    type: DataTypes.ENUM('crear', 'editar', 'eliminar', 'publicar', 'despublicar'),
    allowNull: false,
  },
  modulo: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  titulo: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  creado_en: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: false,
  tableName: 'docente_actividad_auditoria',
});

module.exports = DocenteActividadAuditoria;