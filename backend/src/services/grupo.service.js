const Group = require('../models/grupo.model');
const GroupStudent = require('../models/grupoEstudiante.model');
const User = require('../models/User');
const ContentGroup = require('../models/contenidoGrupo.model');
const GameGroup = require('../models/juegoGrupo.model');
const EvaluationGroup = require('../models/evaluacionGrupo.model');
const { Op, literal, where } = require('sequelize');
const { sendGroupAssignedEmail } = require('./mailer.service');

/**
 * Configuración de la relación muchos-a-muchos recurso -> grupos.
 * `tabla` es el nombre real (o el alias usado en un include) que referencia la
 * fila del recurso dentro de la consulta; `pivote`/`col` son la tabla puente y
 * su columna de recurso.
 */
const RECURSOS_GRUPOS = {
  contenido: { tabla: 'contenidos', pivote: 'contenido_grupos', col: 'contenido_id', modelo: ContentGroup },
  juego: { tabla: 'juegos', pivote: 'juego_grupos', col: 'juego_id', modelo: GameGroup },
  evaluacion: { tabla: 'evaluaciones', pivote: 'evaluacion_grupos', col: 'evaluacion_id', modelo: EvaluationGroup },
};

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

  // Desvincular el grupo de los recursos que lo tenían asignado.
  // Si un recurso se queda sin grupos, pasa a ser visible para todos
  // (misma semántica que antes poníamos grupo_id = NULL).
  await Promise.all([
    ContentGroup.destroy({ where: { grupo_id: grupoId } }),
    GameGroup.destroy({ where: { grupo_id: grupoId } }),
    EvaluationGroup.destroy({ where: { grupo_id: grupoId } }),
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
 * Construye la condición de visibilidad de un tipo de recurso.
 *
 * Semántica: un recurso es visible si NO tiene grupos asignados (visible para
 * todos) o si comparte al menos un grupo con el estudiante.
 *
 * Se implementa como "excluir los prohibidos": la subquery devuelve los IDs de
 * los recursos que SÍ tienen grupos pero ninguno es del estudiante. Se restan
 * con `id NOT IN (...)`.
 *
 * Ventaja: la subquery NO menciona la tabla del recurso, así que funciona igual
 * en `findAll`, `count`, `aggregate` o dentro de un `include` con alias, sin
 * depender de cómo Sequelize nombre o aliase la tabla.
 *
 * Se devuelve un array (de un elemento) para conservar el contrato
 * `where[Op.or] = condiciones` de los call sites existentes.
 *
 * @param {string} tipo      'contenido' | 'juego' | 'evaluacion'
 * @param {number[]} grupoIds grupos del estudiante (solo enteros: evita inyección)
 */
function condicionesVisibilidadPorTipo(tipo, grupoIds) {
  const cfg = RECURSOS_GRUPOS[tipo];
  if (!cfg) throw new Error(`Tipo de recurso desconocido para grupos: ${tipo}`);
  const ids = (Array.isArray(grupoIds) ? grupoIds : [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);
  // Solo enteros validados entran al SQL. Sin grupos => -1 (imposible) => solo ve lo público.
  const listaIds = ids.length ? ids.join(',') : '-1';

  // Los paréntesis van dentro del literal: Sequelize no los añade al envolver
  // la subquery con Op.in / Op.notIn y MySQL lo rechaza.
  const sinGrupos = literal(
    `(SELECT DISTINCT \`${cfg.col}\` FROM \`${cfg.pivote}\`)`
  );
  const conGruposDelEstudiante = literal(
    `(SELECT DISTINCT \`cg\`.\`${cfg.col}\` FROM \`${cfg.pivote}\` \`cg\` ` +
    `INNER JOIN \`grupo_estudiantes\` \`ge\` ON \`ge\`.\`grupo_id\` = \`cg\`.\`grupo_id\` ` +
    `WHERE \`ge\`.\`grupo_id\` IN (${listaIds}))`
  );

  return [
    where(literal('`id`'), Op.notIn, sinGrupos),
    where(literal('`id`'), Op.in, conGruposDelEstudiante),
  ];
}

/**
 * Obtiene una sola vez los grupos del estudiante y devuelve las condiciones de
 * visibilidad ya construidas para los TRES tipos de recurso.
 * Úsalo cuando una misma función filtra contenidos, juegos y evaluaciones.
 *
 * @returns {Promise<{contenido: object[], juego: object[], evaluacion: object[]}>}
 */
async function condicionesVisibilidad(estudianteId) {
  const grupoIds = await getEstudianteGrupoIds(estudianteId);
  return {
    contenido: condicionesVisibilidadPorTipo('contenido', grupoIds),
    juego: condicionesVisibilidadPorTipo('juego', grupoIds),
    evaluacion: condicionesVisibilidadPorTipo('evaluacion', grupoIds),
  };
}

/**
 * Retorna las condiciones de visibilidad de un tipo de recurso para un estudiante.
 *
 * @param {number} estudianteId
 * @param {string} tipo    'contenido' | 'juego' | 'evaluacion'
 */
async function recursoWhereEstudiante(estudianteId, tipo) {
  const grupoIds = await getEstudianteGrupoIds(estudianteId);
  return condicionesVisibilidadPorTipo(tipo, grupoIds);
}

/**
 * Versión síncrona: dado un array de grupoIds ya conocidos, retorna las condiciones.
 */
function recursoWherePorGrupoIds(grupoIds, tipo) {
  return condicionesVisibilidadPorTipo(tipo, grupoIds);
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
 * Verifica si un estudiante tiene acceso a un recurso concreto.
 * Sin grupos asignados = visible para todos (compatibilidad con el comportamiento previo).
 *
 * @param {number} estudianteId
 * @param {object} recurso   instancia del modelo (necesita .id)
 * @param {string} tipo      'contenido' | 'juego' | 'evaluacion'
 */
async function estudianteAccedeRecurso(estudianteId, recurso, tipo) {
  const cfg = RECURSOS_GRUPOS[tipo];
  if (!cfg || !recurso || !recurso.id) return false; // tipo desconocido = denegar
  const vinculos = await cfg.modelo.findAll({
    where: { [cfg.col]: recurso.id },
    attributes: ['grupo_id'],
    raw: true,
  });
  if (vinculos.length === 0) return true; // sin grupos: visible para todos
  const misGrupos = new Set(await getEstudianteGrupoIds(estudianteId));
  return vinculos.some((v) => misGrupos.has(v.grupo_id));
}

/**
 * Valida que una lista de grupoIds pertenezca al docente.
 * Lanza error si algún ID no es suyo (evita asignar recursos a grupos ajenos).
 * @returns {Promise<number[]>} IDs válidos y deduplicados
 */
async function validarGruposDelDocente(docenteId, grupoIds) {
  const normalizados = (Array.isArray(grupoIds) ? grupoIds : [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);
  const unicos = [...new Set(normalizados)];
  if (unicos.length === 0) return [];

  const encontrados = await Group.findAll({
    where: { id: { [Op.in]: unicos }, docente_id: docenteId },
    attributes: ['id'],
    raw: true,
  });
  const validos = encontrados.map((g) => g.id);
  const invalidos = unicos.filter((id) => !validos.includes(id));
  if (invalidos.length > 0) {
    const error = new Error('Uno o más grupos no existen o no te pertenecen.');
    error.status = 400;
    error.codigo = 'GRUPOS_INVALIDOS';
    throw error;
  }
  return validos;
}

/**
 * Reemplaza por completo los grupos de un recurso (patrón "sincronizar").
 * Un array vacío deja el recurso sin grupos => visible para todos.
 */
async function sincronizarGruposRecurso(tipo, recursoId, grupoIds, transaction) {
  const cfg = RECURSOS_GRUPOS[tipo];
  if (!cfg) throw new Error(`Tipo de recurso desconocido para grupos: ${tipo}`);
  const opciones = transaction ? { transaction } : {};
  await cfg.modelo.destroy({ where: { [cfg.col]: recursoId }, ...opciones });
  const ids = [...new Set((Array.isArray(grupoIds) ? grupoIds : [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return [];
  const filas = ids.map((grupo_id) => ({ [cfg.col]: recursoId, grupo_id }));
  await cfg.modelo.bulkCreate(filas, { ignoreDuplicates: true, ...opciones });
  return ids;
}

/**
 * Devuelve los grupos asignados a un recurso como objetos {id, materia, nombre}.
 */
async function obtenerGruposDeRecurso(tipo, recursoId) {
  const cfg = RECURSOS_GRUPOS[tipo];
  if (!cfg) return [];
  const vinculos = await cfg.modelo.findAll({
    where: { [cfg.col]: recursoId },
    attributes: ['grupo_id'],
    raw: true,
  });
  if (vinculos.length === 0) return [];
  const grupos = await Group.findAll({
    where: { id: { [Op.in]: vinculos.map((v) => v.grupo_id) } },
    attributes: ['id', 'materia', 'nombre'],
    raw: true,
    order: [['materia', 'ASC'], ['nombre', 'ASC']],
  });
  return grupos;
}

/**
 * Devuelve un mapa { [recursoId]: [grupoIds] } con los grupos asignados a varios
 * recursos de una vez. Útil para reportes que filtran en memoria.
 */
async function mapaGruposPorRecurso(tipo, recursoIds) {
  const cfg = RECURSOS_GRUPOS[tipo];
  const mapa = {};
  if (!cfg || !Array.isArray(recursoIds) || recursoIds.length === 0) return mapa;
  const filas = await cfg.modelo.findAll({
    where: { [cfg.col]: { [Op.in]: recursoIds } },
    attributes: [cfg.col, 'grupo_id'],
    raw: true,
  });
  for (const f of filas) {
    const clave = f[cfg.col];
    if (!mapa[clave]) mapa[clave] = [];
    mapa[clave].push(f.grupo_id);
  }
  return mapa;
}

/**
 * ¿Es visible este recurso para un estudiante que pertenece a `grupoIds` (Set)?
 * Sin grupos asignados => visible para todos.
 */
function esVisibleParaGrupos(mapaGrupos, recursoId, grupoIds) {
  const asignados = mapaGrupos ? mapaGrupos[recursoId] : null;
  if (!asignados || asignados.length === 0) return true;
  if (!grupoIds) return false;
  return asignados.some((id) => grupoIds.has(id));
}

/**
 * Normaliza la entrada `grupo_ids` del body (JSON o CSV) a un array de enteros.
 * Acepta undefined/null -> [].
 */
function parseGrupoIds(valor) {
  if (valor === undefined || valor === null || valor === '') return [];
  let lista = valor;
  if (typeof valor === 'string') {
    const txt = valor.trim();
    if (!txt) return [];
    try {
      const parsed = JSON.parse(txt);
      lista = Array.isArray(parsed) ? parsed : txt.split(',');
    } catch {
      lista = txt.split(',');
    }
  }
  if (!Array.isArray(lista)) lista = [lista];
  return [...new Set(
    lista.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
  )];
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
  condicionesVisibilidad,
  condicionesVisibilidadPorTipo,
  getEstudianteGrupoIds,
  estudianteAccedeRecurso,
  validarGruposDelDocente,
  sincronizarGruposRecurso,
  obtenerGruposDeRecurso,
  mapaGruposPorRecurso,
  esVisibleParaGrupos,
  parseGrupoIds,
  gruposConMiembros,
  gruposDeEstudiante,
  RECURSOS_GRUPOS,
};