const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Log append-only de intentos del estudiante.
 *
 * Existe porque `progreso_estudiante` solo conserva el MEJOR resultado por
 * estudiante x actividad: en cada reintento sobrescribe `fecha` y `respuestas`
 * y descarta los intentos anteriores. Aquí queda un registro por intento, lo que
 * habilita acierto en primer intento, abandono, tiempo de resolución,
 * participación semanal, mapa de calor y series temporales comparables.
 *
 * `iniciado_en` / `duracion_seg` / `acierto_primer_intento` cubren indicadores
 * que antes eran imposibles: el campo `tiempo` ya llegaba del frontend pero
 * `respuestas.controller.js` lo reenviaba en la respuesta sin persistirlo.
 */
const ActividadIntento = sequelize.define('ActividadIntento', {
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
    // Nullable a propósito: un estudiante puede estar en varios grupos, así que
    // el desglose por grupo se resuelve cruzando `grupo_estudiantes` al leer. La
    // columna hace falta porque `associations.js` declara el `belongsTo(Group)`.
    comment: 'Grupo de atribución; NULL cuando no se puede resolver sin ambigüedad',
  },
  tipo: {
    type: DataTypes.ENUM('contenido', 'juego', 'evaluacion'),
    allowNull: false,
  },
  actividad_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  modulo: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  numero_intento: {
    type: DataTypes.SMALLINT.UNSIGNED,
    allowNull: false,
    defaultValue: 1,
  },
  puntaje_obtenido: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  puntaje_maximo: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  aciertos: {
    type: DataTypes.SMALLINT.UNSIGNED,
    allowNull: true,
  },
  preguntas_total: {
    type: DataTypes.SMALLINT.UNSIGNED,
    allowNull: true,
  },
  acierto_primer_intento: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    comment: 'Solo para el número de intento 1; null en reintentos',
  },
  duracion_seg: {
    type: DataTypes.SMALLINT.UNSIGNED,
    allowNull: true,
    comment: 'Segundos de resolución reportados por el cliente',
  },
  iniciado_en: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  completado: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  abandono: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  cerrado_en: {
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
  tableName: 'actividad_intentos',
});

module.exports = ActividadIntento;