const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Respuesta por pregunta de un intento de evaluación.
 *
 * `progreso_estudiante` guarda solo el MEJOR resultado por estudiante x
 * evaluación y sobrescribe `respuestas` en cada reintento, así que no sirve
 * para analizar qué opción eligió el alumno en un intento concreto. Aquí se
 * persiste un renglón por pregunta y por intento (de `actividad_intentos`).
 *
 * Los intentos anteriores a esta tabla no tienen detalle y deben mostrarse como
 * "sin detalle disponible": este modelo nunca inventa filas.
 */
const EvaluacionIntentoRespuesta = sequelize.define('EvaluacionIntentoRespuesta', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  intento_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  pregunta_id: {
    // `preguntas.id` es INT con signo (Sequelize DataTypes.INTEGER): la FK debe
    // coincidir exactamente o MySQL rechaza la tabla.
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  opcion_elegida: {
    type: DataTypes.STRING(1),
    allowNull: true,
    comment: 'Letra normalizada (a,b,c,d) o null si no respondió',
  },
  respuesta_enviada: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Respuesta tal como la envió el estudiante',
  },
  es_correcta: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  respondida: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  tiempo_seg: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
  },
}, {
  timestamps: true,
  createdAt: 'creado_en',
  updatedAt: false,
  tableName: 'evaluacion_intento_respuestas',
  indexes: [
    { name: 'uq_eir_intento_pregunta', unique: true, fields: ['intento_id', 'pregunta_id'] },
    { name: 'idx_eir_intento', fields: ['intento_id'] },
    { name: 'idx_eir_pregunta', fields: ['pregunta_id'] },
  ],
});

module.exports = EvaluacionIntentoRespuesta;
