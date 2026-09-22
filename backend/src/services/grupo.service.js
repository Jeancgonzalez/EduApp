const Group = require('../models/grupo.model');
const GroupStudent = require('../models/grupoEstudiante.model');
const User = require('../models/User');
const Content = require('../models/content.model');
const Game = require('../models/game.model');
const Evaluation = require('../models/evaluation.model');
const { Op } = require('sequelize');
const { sendGroupAssignedEmail } = require('./mailer.service');

// =========================
// CRUD de Grupos
// =========================

async function listarGrupos(docenteId) {
  const grupos = await Group.findAll({
    where: { docente_id: docenteId },
    order: [['materia', 'ASC'], ['nombre', 'ASC']],
  });

  const result = [];
  for (const g of grupos) {
    const miembros = await GroupStudent.findAll({
      where: { grupo_id: g.id },
      attributes: ['estudiante_id'],
      raw: true,
    });
    result.push({
      id: g.id,
      materia: g.materia,
      nombre: g.nombre,
      creado_at: g.creado_at,
      estudiante_ids: miembros.map(m => m.estudiante_id),
      totalEstudiantes: miembros.length,
    });
  }
  return result;
}

async function obtenerGrupo(docenteId, grupoId) {
  const grupo = await Group.findOne({ where: { id: grupoId, docente_id: docenteId } });
  if (!grupo) return null;

  const miembros = await GroupStudent.findAll({
    where: { grupo_id: grupo.id },
    attributes: ['estudiante_id'],
    raw: true,
  });

  return {
    id: grupo.id,
    materia: grupo.materia,
    nombre: grupo.nombre,
    creado_at: grupo.creado_at,
    estudiante_ids: miembros.map(m => m.estudiante_id),
    totalEstudiantes: miembros.length,
  };
}

async function crearGrupo(docenteId, materia, nombre) {
  const grupo = await Group.create({ docente_id: docenteId, materia, nombre });
  return { id: grupo.id, materia: grupo.materia, nombre: grupo.nombre, estudiante_ids: [] };
}

async function actualizarGrupo(docenteId, grupoId, materia, nombre) {
  const grupo = await Group.findOne({ where: { id: grupoId, docente_id: docenteId } });
  if (!grupo) return null;
  grupo.materia = materia;
  grupo.nombre = nombre;
  await grupo.save();
  return { id: grupo.id, materia: grupo.materia, nombre: grupo.nombre };
}

async function eliminarGrupo(docenteId, grupoId) {
  const grupo = await Group.findOne({ where: { id: grupoId, docente_id: docenteId } });
  if (!grupo) return false;

  // Quitar grupo_id de recursos asociados (poner en NULL = todos los estudiantes)
  await Promise.all([
    Content.update({ grupo_id: null }, { where: { grupo_id: grupoId, docente_id: docenteId } }),
    Game.update({ grupo_id: null }, { where: { grupo_id: grupoId, docente_id: docenteId } }),
    Evaluation.update({ grupo_id: null }, { where: { grupo_id: grupoId, docente_id: docenteId } }),
  ]);

  await GroupStudent.destroy({ where: { grupo_id: grupoId } });
  await grupo.destroy();
  return true;
}

// =========================
// Asignación de Estudiantes
// =========================

async function asignarEstudiantes(docenteId, grupoId, estudianteIds) {
  const grupo = await Group.findOne({ where: { id: grupoId, docente_id: docenteId } });
  if (!grupo) return null;

  // Validar que todos los IDs pertenezcan al docente
  const estudiantesValidos = await User.findAll({
    where: { id: { [Op.in]: estudianteIds }, docente_id: docenteId, role: 'student' },
    attributes: ['id', 'name', 'email'],
    raw: true,
  });
  const idsValidos = new Set(estudiantesValidos.map(e => e.id));

  // Reemplazar asignaciones
  await GroupStudent.destroy({ where: { grupo_id: grupoId } });
  if (estudianteIds.length > 0) {
    const registros = estudianteIds
      .filter(id => idsValidos.has(id))
      .map(id => ({ grupo_id: grupoId, estudiante_id: id }));
    if (registros.length > 0) {
      await GroupStudent.bulkCreate(registros);
    }
  }

  // Notificar por correo a los estudiantes recién asignados
  const asignados = estudiantesValidos.filter(e => idsValidos.has(e.id));
  for (const estudiante of asignados) {
    try {
      console.log(`[GrupoService] Enviando email de asignación a ${estudiante.email} (${estudiante.name})...`);
      await sendGroupAssignedEmail(estudiante.name, estudiante.email, grupo.nombre, grupo.materia);
      console.log(`[GrupoService] ✅ Email de asignación enviado a ${estudiante.email}`);
    } catch (mailErr) {
      console.error(`[GrupoService] ❌ Error enviando email de asignación a ${estudiante.email}:`, mailErr.message);
    }
  }

  return { grupo_id: grupoId, estudiante_ids: estudianteIds.filter(id => idsValidos.has(id)) };
}

// =========================
// Helpers para filtros de visibilidad
// =========================

/**
 * Retorna un array [condición, condición] para usar en Op.or
 * que hace que un recurso sea visible para el estudiante según su grupo:
 *   - Si el recurso no tiene grupo_id (NULL): visible para todos
 *   - Si el recurso tiene grupo_id: visible solo si el estudiante pertenece a ese grupo
 */
async function recursoWhereEstudiante(estudianteId) {
  const filas = await GroupStudent.findAll({
    where: { estudiante_id: estudianteId },
    attributes: ['grupo_id'],
    raw: true,
  });
  const grupoIds = filas.map(f => f.grupo_id);
  return [
    { grupo_id: null },
    { grupo_id: { [Op.in]: grupoIds } },
  ];
}

/**
 * Versión síncrona: dado un array de grupoIds conocidos, retorna las condiciones
 */
function recursoWherePorGrupoIds(grupoIds) {
  if (!grupoIds || grupoIds.length === 0) {
    return [{ grupo_id: null }];
  }
  return [
    { grupo_id: null },
    { grupo_id: { [Op.in]: grupoIds } },
  ];
}

/**
 * Obtiene los IDs de grupos a los que pertenece un estudiante
 */
async function getEstudianteGrupoIds(estudianteId) {
  const filas = await GroupStudent.findAll({
    where: { estudiante_id: estudianteId },
    attributes: ['grupo_id'],
    raw: true,
  });
  return filas.map(f => f.grupo_id);
}

/**
 * Verifica si un estudiante tiene acceso a un recurso concreto de un docente
 */
async function estudianteAccedeRecurso(estudianteId, recurso) {
  if (!recurso.grupo_id) return true; // Sin grupo: visible para todos
  const grupoIds = await getEstudianteGrupoIds(estudianteId);
  return grupoIds.includes(recurso.grupo_id);
}

/**
 * Retorna todos los grupos con miembros para un docente (para incluir en respuestas)
 */
async function gruposConMiembros(docenteId) {
  const grupos = await Group.findAll({
    where: { docente_id: docenteId },
    order: [['materia', 'ASC'], ['nombre', 'ASC']],
  });

  const resultado = [];
  for (const g of grupos) {
    const miembros = await GroupStudent.findAll({
      where: { grupo_id: g.id },
      include: [{ model: User, as: 'estudiante', attributes: ['id', 'name', 'email'] }],
    });
    resultado.push({
      id: g.id,
      materia: g.materia,
      nombre: g.nombre,
      estudiantes: miembros.map(m => m.estudiante ? {
        id: m.estudiante.id,
        nombre: m.estudiante.name,
        email: m.estudiante.email,
      } : null).filter(Boolean),
    });
  }
  return resultado;
}

/**
 * Retorna los grupos asociados a un estudiante específico (para el frontend)
 */
async function gruposDeEstudiante(estudianteId) {
  const filas = await GroupStudent.findAll({
    where: { estudiante_id: estudianteId },
    include: [{ model: Group, as: 'grupo', attributes: ['id', 'materia', 'nombre', 'docente_id'] }],
    raw: true,
    nest: true,
  });
  return filas.map(f => f.grupo).filter(Boolean);
}

module.exports = {
  listarGrupos,
  obtenerGrupo,
  crearGrupo,
  actualizarGrupo,
  eliminarGrupo,
  asignarEstudiantes,
  recursoWhereEstudiante,
  recursoWherePorGrupoIds,
  getEstudianteGrupoIds,
  estudianteAccedeRecurso,
  gruposConMiembros,
  gruposDeEstudiante,
};