const Content = require('./content.model');
const Game = require('./game.model');
const Evaluation = require('./evaluation.model');
const StudentProgress = require('./studentProgress.model');
const User = require('./User');
const Group = require('./grupo.model');
const GroupStudent = require('./grupoEstudiante.model');
const DiagnosticoAplicacion = require('./diagnosticoAplicacion.model');
const DiagnosticoPregunta = require('./diagnosticoPregunta.model');
const DiagnosticoRespuesta = require('./diagnosticoRespuesta.model');

StudentProgress.belongsTo(Content, { foreignKey: 'contenido_id', as: 'contenido' });
StudentProgress.belongsTo(Game, { foreignKey: 'juego_id', as: 'juego' });
StudentProgress.belongsTo(Evaluation, { foreignKey: 'evaluacion_id', as: 'evaluacion' });

Content.belongsTo(Group, { foreignKey: 'grupo_id', as: 'grupo' });
Game.belongsTo(Group, { foreignKey: 'grupo_id', as: 'grupo' });
Evaluation.belongsTo(Group, { foreignKey: 'grupo_id', as: 'grupo' });

Evaluation.belongsTo(Content, { foreignKey: 'contenido_apoyo_id', as: 'contenidoApoyo' });
Content.hasMany(Evaluation, { foreignKey: 'contenido_apoyo_id', as: 'evaluacionesApoyo' });

User.belongsTo(User, { foreignKey: 'docente_id', as: 'docente' });
User.hasMany(User, { foreignKey: 'docente_id', as: 'estudiantes' });

Group.belongsTo(User, { foreignKey: 'docente_id', as: 'docente' });
User.hasMany(Group, { foreignKey: 'docente_id', as: 'grupos' });

GroupStudent.belongsTo(Group, { foreignKey: 'grupo_id', as: 'grupo' });
Group.hasMany(GroupStudent, { foreignKey: 'grupo_id', as: 'miembros' });

GroupStudent.belongsTo(User, { foreignKey: 'estudiante_id', as: 'estudiante' });
User.hasMany(GroupStudent, { foreignKey: 'estudiante_id', as: 'gruposAsociados' });

// IAD-Primaria: una aplicación pertenece a un estudiante y tiene varias respuestas.
DiagnosticoAplicacion.belongsTo(User, { foreignKey: 'estudiante_id', as: 'estudiante' });
User.hasMany(DiagnosticoAplicacion, { foreignKey: 'estudiante_id', as: 'diagnosticos' });

DiagnosticoRespuesta.belongsTo(DiagnosticoAplicacion, { foreignKey: 'aplicacion_id', as: 'aplicacion' });
DiagnosticoAplicacion.hasMany(DiagnosticoRespuesta, { foreignKey: 'aplicacion_id', as: 'respuestas' });

DiagnosticoRespuesta.belongsTo(DiagnosticoPregunta, { foreignKey: 'pregunta_id', as: 'pregunta' });

module.exports = { StudentProgress, Content, Game, Evaluation, User, Group, GroupStudent, DiagnosticoAplicacion, DiagnosticoPregunta, DiagnosticoRespuesta };
