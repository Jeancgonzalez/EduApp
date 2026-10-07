const { Op, fn, col, literal } = require('sequelize');
const User = require('../models/User');
const StudentProgress = require('../models/studentProgress.model');
const Game = require('../models/game.model');
const Evaluation = require('../models/evaluation.model');
const Content = require('../models/content.model');
const Progress = require('../models/progress.model');
const DiagnosticoAplicacion = require('../models/diagnosticoAplicacion.model');
const EstudianteSesion = require('../models/estudianteSesion.model');
const ReportService = require('../services/report.service');
const GroupService = require('../services/grupo.service');
const GrupoService = GroupService;
const NotaService = require('../services/nota.service');
const DashboardService = require('../services/dashboard.service');
const ReportScheduleService = require('../services/reportSchedule.service');
const {
  nivelDeNota,
  notaDesdeAcierto,
  riesgoDe,
  aliasDe,
  umbrales,
} = require('../services/dashboard.definiciones');

/** Semanas por defecto de la barra global de analítica. */
const SEMANAS_POR_DEFECTO = 8;
/** Tope de semanas que acepta `?semanas=`; evita ventanas de años. */
const SEMANAS_TOPE = 26;
/** Meses de la serie de XP que se usan como referencia del grupo. */
const MESES_XP_REFERENCIA = 12;

/**
 * Lee `?semanas=` y lo acota al rango que ofrece la barra global.
 * Un valor inútil (0, -3, `abc`, 900) cae al período por defecto en vez de
 * dejar la vista sin datos o consultando años de historial.
 */
function normalizarSemanas(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 1) return SEMANAS_POR_DEFECTO;
  return Math.min(SEMANAS_TOPE, Math.round(n));
}

/**
 * Intenta extraer un porcentaje por módulo desde el `desglose` del diagnóstico.
 * El desglose es JSON y su forma puede variar según cómo se sembró el instrumento.
 * Probamos varias estructuras comunes y devolvemos {} si no hay match.
 */
function extraerPctInicialPorModulo(desglose) {
  if (!desglose) return {};
  let d = desglose;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch { return {}; }
  }
  if (!d || typeof d !== 'object') return {};

  const out = {};

  // Forma 1: { por_modulo: { Hardware: { pct: 30 }, ... } }
  if (d.por_modulo && typeof d.por_modulo === 'object') {
    for (const [mod, v] of Object.entries(d.por_modulo)) {
      const pct = Number(v?.pct ?? v?.porcentaje ?? v?.score);
      if (Number.isFinite(pct)) out[mod] = Math.round(pct);
    }
    if (Object.keys(out).length) return out;
  }

  // Forma 2: { modulos: [{ nombre: 'Hardware', pct: 30 }, ...] }
  if (Array.isArray(d.modulos)) {
    for (const m of d.modulos) {
      const mod = m?.nombre || m?.modulo || m?.name;
      const pct = Number(m?.pct ?? m?.porcentaje ?? m?.score);
      if (mod && Number.isFinite(pct)) out[mod] = Math.round(pct);
    }
    if (Object.keys(out).length) return out;
  }

  // Forma 3: { 'Hardware': { correctas: 3, total: 10 }, ... }
  for (const [mod, v] of Object.entries(d)) {
    if (v && typeof v === 'object') {
      const correctas = Number(v.correctas ?? v.correct ?? v.hits);
      const total = Number(v.total ?? v.count ?? v.items);
      if (Number.isFinite(correctas) && Number.isFinite(total) && total > 0) {
        out[mod] = Math.round((correctas / total) * 100);
      }
    }
  }
  return out;
}

class TeacherController {
  static async getGroups(req, res) {
    try {
      const { Group, GroupStudent } = require('../models/associations');
      const docenteId = req.user.id;

      const [grupos, estudiantes] = await Promise.all([
        Group.findAll({ where: { docente_id: docenteId }, raw: true }),
        User.findAll({
          where: { role: 'student', docente_id: docenteId },
          attributes: ['id', 'name', 'email'],
          raw: true,
        }),
      ]);

      const grupoIds = grupos.map((g) => g.id);
      const asignaciones = grupoIds.length
        ? await GroupStudent.findAll({
            where: { grupo_id: { [Op.in]: grupoIds } },
            attributes: ['grupo_id', 'estudiante_id'],
            raw: true,
          })
        : [];

      const countMap = {};
      const miembrosPorGrupo = {};
      for (const a of asignaciones) {
        countMap[a.grupo_id] = (countMap[a.grupo_id] || 0) + 1;
        if (!miembrosPorGrupo[a.grupo_id]) miembrosPorGrupo[a.grupo_id] = [];
        miembrosPorGrupo[a.grupo_id].push(Number(a.estudiante_id));
      }

      const data = {
        grupos: grupos.map((g) => ({
          id: g.id,
          nombre: g.nombre,
          materia: g.materia,
          totalEstudiantes: countMap[g.id] || 0,
          estudiante_ids: miembrosPorGrupo[g.id] || [],
        })),
        estudiantes: estudiantes.map((s) => ({ id: s.id, name: s.name, email: s.email })),
      };

      res.json({ success: true, data });
    } catch (error) {
      console.error('[Teacher] Error al listar grupos:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getStudentStats(req, res) {
    try {
      const data = await TeacherController._obtenerDatosProgresoModulos(req.user.id);

      if (data.length === 0) {
        return res.json({
          success: true,
          data: { totalEstudiantes: 0, promedioGeneral: 0, destacados: 0, requierenApoyo: 0 }
        });
      }

      const notas = data.map(d => Number(d.nota)).filter(n => Number.isFinite(n));
      const promedioGeneral = notas.length > 0
        ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10
        : 0;
      const destacados = notas.filter(n => n >= 4.5).length;
      const requierenApoyo = notas.filter(n => n < 3.0).length;

      res.json({
        success: true,
        data: { totalEstudiantes: data.length, promedioGeneral, destacados, requierenApoyo }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getStudents(req, res) {
    try {
      const students = await User.findAll({
        where: { role: 'student', docente_id: req.user.id },
        attributes: ['id', 'name', 'email'],
        raw: true
      });

      const studentIds = students.map(s => s.id);

      if (studentIds.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const [publishedGames, publishedEvals, publishedContent] = await Promise.all([
        Game.findAll({ where: { publicado: true, docente_id: req.user.id }, attributes: ['id', 'modulo'], raw: true }),
        Evaluation.findAll({ where: { publicado: true, docente_id: req.user.id }, attributes: ['id', 'modulo'], raw: true }),
        Content.findAll({ where: { publicado: true, docente_id: req.user.id }, attributes: ['id', 'modulo'], raw: true })
      ]);

      const validGameIds = new Set(publishedGames.map(g => g.id));
      const validEvalIds = new Set(publishedEvals.map(e => e.id));
      const validContentIds = new Set(publishedContent.map(c => c.id));

      const allModules = new Set();
      publishedGames.forEach(g => allModules.add(g.modulo));
      publishedEvals.forEach(e => allModules.add(e.modulo));
      publishedContent.forEach(c => allModules.add(c.modulo));
      const moduleNames = [...allModules].filter(Boolean);

      const progressRecords = await StudentProgress.findAll({
        where: { estudiante_id: { [Op.in]: studentIds } },
        include: [
          { model: Game, as: 'juego', required: false, attributes: ['id', 'titulo', 'modulo'] },
          { model: Evaluation, as: 'evaluacion', required: false, attributes: ['id', 'titulo', 'modulo'] },
          { model: Content, as: 'contenido', required: false, attributes: ['id', 'titulo', 'modulo'] }
        ],
        order: [['fecha', 'DESC']],
        raw: true,
        nest: true
      });

      const progressByStudent = {};
      progressRecords.forEach(p => {
        if (!progressByStudent[p.estudiante_id]) {
          progressByStudent[p.estudiante_id] = {
            juegos: new Set(),
            evaluaciones: new Set(),
            contenidos: new Set(),
            scores: [],
            records: []
          };
        }
        const acc = progressByStudent[p.estudiante_id];
        acc.records.push(p);

        if (p.completado) {
          const esJuegoValido = p.juego_id && p.juego && validGameIds.has(p.juego_id);
          const esEvalValida = p.evaluacion_id && p.evaluacion && validEvalIds.has(p.evaluacion_id);
          const esContenidoValido = p.contenido_id && p.contenido && validContentIds.has(p.contenido_id);

          if (esJuegoValido) { acc.scores.push(p.puntaje); acc.juegos.add(p.juego_id); }
          if (esEvalValida)   { acc.scores.push(p.puntaje); acc.evaluaciones.add(p.evaluacion_id); }
          if (esContenidoValido) { acc.scores.push(p.puntaje); acc.contenidos.add(p.contenido_id); }
        }
      });

      const totalAvailable = Math.max(1, validGameIds.size + validEvalIds.size + validContentIds.size);

      const gruposPorEstudiante = {};
      if (studentIds.length > 0) {
        const { GroupStudent, Group } = require('../models/associations');
        const todosGrupos = await Group.findAll({ where: { docente_id: req.user.id }, raw: true });
        const mapGrupoId = {};
        todosGrupos.forEach(g => { mapGrupoId[g.id] = g; });
        const asignaciones = await GroupStudent.findAll({ where: { estudiante_id: { [Op.in]: studentIds } }, raw: true });
        for (const a of asignaciones) {
          if (!gruposPorEstudiante[a.estudiante_id]) gruposPorEstudiante[a.estudiante_id] = [];
          const grp = mapGrupoId[a.grupo_id];
          if (grp) gruposPorEstudiante[a.estudiante_id].push({ id: grp.id, materia: grp.materia, nombre: grp.nombre });
        }
      }

      const studentList = students.map(student => {
        const acc = progressByStudent[student.id] || {
          juegos: new Set(), evaluaciones: new Set(), contenidos: new Set(), scores: [], records: []
        };
        const scores = acc.scores;
        const average = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        const latest = acc.records.length > 0 ? acc.records[0] : null;

        const completedCount = acc.juegos.size + acc.evaluaciones.size + acc.contenidos.size;
        const porcentajeAvance = Math.min(100, Math.round((completedCount / totalAvailable) * 100));

        let lastActivity = null;
        if (latest) {
          if (latest.juego_id && latest.juego) {
            lastActivity = `${latest.juego.modulo} - ${latest.juego.titulo}`;
          } else if (latest.evaluacion_id && latest.evaluacion) {
            lastActivity = `${latest.evaluacion.modulo} - ${latest.evaluacion.titulo}`;
          } else if (latest.contenido_id && latest.contenido) {
            lastActivity = `${latest.contenido.modulo} - ${latest.contenido.titulo}`;
          }
        }

        return {
          id: student.id,
          name: student.name,
          email: student.email,
          puntajeTotal: scores.reduce((a, b) => a + b, 0),
          promedio: average,
          juegosCompletados: acc.juegos.size,
          evaluacionesRealizadas: acc.evaluaciones.size,
          contenidosVistos: acc.contenidos.size,
          porcentajeAvance,
          ultimaActividad: lastActivity,
          fechaUltimaActividad: latest ? latest.fecha : null,
          grupos: gruposPorEstudiante[student.id] || []
        };
      });

      const search = req.query.search ? req.query.search.toLowerCase() : '';
      const modulo = req.query.modulo || '';

      let filtered = studentList;
      if (search) {
        filtered = filtered.filter(s => s.name.toLowerCase().includes(search) || s.email.toLowerCase().includes(search));
      }
      if (modulo) {
        filtered = filtered.filter(s => s.ultimaActividad && s.ultimaActividad.toLowerCase().includes(modulo.toLowerCase()));
      }

      res.json({ success: true, data: filtered, modules: moduleNames });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getPerformanceEvolution(req, res) {
    try {
      const studentIds = (await User.findAll({
        where: { role: 'student', docente_id: req.user.id },
        attributes: ['id'],
        raw: true
      })).map(s => s.id);

      if (studentIds.length === 0) return res.json({ success: true, data: [] });

      const [publishedGames, publishedEvals, publishedContent] = await Promise.all([
        Game.findAll({ where: { publicado: true, docente_id: req.user.id }, attributes: ['id'], raw: true }),
        Evaluation.findAll({ where: { publicado: true, docente_id: req.user.id }, attributes: ['id'], raw: true }),
        Content.findAll({ where: { publicado: true, docente_id: req.user.id }, attributes: ['id'], raw: true })
      ]);
      const validGameIds = new Set(publishedGames.map(g => g.id));
      const validEvalIds = new Set(publishedEvals.map(e => e.id));
      const validContentIds = new Set(publishedContent.map(c => c.id));

      const records = await StudentProgress.findAll({
        where: { estudiante_id: { [Op.in]: studentIds }, completado: true, puntaje: { [Op.gt]: 0 } },
        attributes: ['juego_id', 'evaluacion_id', 'contenido_id', 'puntaje', 'fecha'],
        raw: true
      });

      const validRecords = records.filter(p => {
        const esJuegoValido = p.juego_id && validGameIds.has(p.juego_id);
        const esEvalValida = p.evaluacion_id && validEvalIds.has(p.evaluacion_id);
        const esContenidoValido = p.contenido_id && validContentIds.has(p.contenido_id);
        return esJuegoValido || esEvalValida || esContenidoValido;
      });

      const monthlyData = {};
      validRecords.forEach(r => {
        if (!r.fecha) return;
        const date = new Date(r.fecha);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[key]) monthlyData[key] = { sum: 0, count: 0 };
        monthlyData[key].sum += r.puntaje;
        monthlyData[key].count++;
      });

      const months = Object.keys(monthlyData).sort();
      const evolution = months.map(m => ({
        mes: m,
        promedio: Math.round(monthlyData[m].sum / monthlyData[m].count)
      }));

      res.json({ success: true, data: evolution });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getGradeDistribution(req, res) {
    try {
      const data = await TeacherController._obtenerDatosProgresoModulos(req.user.id);
      const counts = { excelente: 0, bueno: 0, regular: 0, bajo: 0 };
      data.forEach(d => { counts[NotaService.clasificarNota(d.nota)] += 1; });
      res.json({ success: true, data: { ...counts, total: data.length } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getDashboard(req, res) {
    try {
      const docenteId = req.user.id;
      const [totalStudents, totalGames, totalEvaluations] = await Promise.all([
        User.count({ where: { role: 'student', docente_id: docenteId } }),
        Game.count({ where: { publicado: true, docente_id: docenteId } }),
        Evaluation.count({ where: { publicado: true, docente_id: docenteId } })
      ]);
      res.json({ success: true, data: { totalStudents, totalGames, totalEvaluations } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAvailableModules(req, res) {
    try {
      const games = await Game.findAll({
        where: { publicado: true, docente_id: req.user.id },
        attributes: ['modulo'],
        group: ['modulo'],
        raw: true
      });
      const evaluations = await Evaluation.findAll({
        where: { publicado: true, docente_id: req.user.id },
        attributes: ['modulo'],
        group: ['modulo'],
        raw: true
      });
      const moduleSet = new Set();
      games.forEach(g => moduleSet.add(g.modulo));
      evaluations.forEach(e => moduleSet.add(e.modulo));
      res.json({ success: true, data: Array.from(moduleSet).sort() });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getStudentsModuleProgress(req, res) {
    try {
      const data = await TeacherController._obtenerDatosProgresoModulos(req.user.id);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Listado del Progreso Individual: una fila por estudiante del docente con la
   * calificación numérica, su nivel, el XP del período, la última conexión y el
   * estado de riesgo.
   *
   * Respeta el filtro global de la barra superior (`?grupoId=` y `?semanas=`).
   * No trae promedios ni gráficas de grupo: eso vive en la Vista de Grupo y en el
   * Resumen General, y repetirlo aquí sería mostrar dos veces lo mismo.
   *
   * El orden y el resto de filtros los aplica la interfaz sobre estas filas, que
   * son las mismas que se ven en pantalla; así el enlace con filtros se puede
   * compartir sin que el backend tenga que conocer cada combinación.
   */
  static async getProgresoIndividual(req, res) {
    try {
      const docenteId = req.user.id;
      const semanas = normalizarSemanas(req.query.semanas);
      const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;

      if (grupoId && !(await DashboardService.grupoEsDelDocente(docenteId, grupoId))) {
        return res.status(404).json({
          success: false,
          message: 'El grupo seleccionado no existe o no te pertenece.',
        });
      }

      const datos = await TeacherController._obtenerDatosProgresoModulos(docenteId, {
        grupoId,
        semanas,
        conRiesgo: true,
      });

      const temas = new Set();
      for (const f of datos) for (const t of f.temas || []) temas.add(t);

      const filas = datos.map((f) => ({
        id: f.id,
        alias: aliasDe(f.name),
        nota: f.nota,
        nota_fuente: f.nota_fuente,
        nivel: f.nivel,
        xp: f.xp,
        pct_aciertos: f.pct_aciertos,
        intentos: f.intentos,
        ultima_conexion: f.ultima_conexion,
        dias_sin_ingresar: f.dias_sin_ingresar,
        en_riesgo: f.en_riesgo,
        motivo_riesgo: f.motivo_riesgo,
        motivo_riesgo_texto: f.motivo_riesgo_texto,
        grupos: (f.grupos || []).map((g) => g.nombre),
        temas: f.temas || [],
      }));

      res.json({
        success: true,
        data: filas,
        meta: {
          temas: [...temas].sort(),
          umbrales: umbrales(),
          semanas,
          grupo_id: grupoId,
          alcance: { estudiantes: filas.length },
        },
      });
    } catch (error) {
      console.error('[Teacher] Error al listar el progreso individual:', error);
      res.status(500).json({
        success: false,
        message: 'No se pudo cargar el listado de estudiantes.',
      });
    }
  }

  /**
   * Datos de progreso por módulo de cada estudiante del docente.
   *
   * Es la fuente de la calificación numérica de todo el Progreso Individual: la
   * misma función alimenta el listado y el detalle, así que una nota no puede
   * verse de una forma en la tabla y de otra en la ficha.
   *
   * Opciones:
   *   - `grupoId`     acota el resultado a los estudiantes de ese grupo (que
   *                   además tiene que ser del docente: si no, se ignora).
   *   - `semanas`     largo de la ventana de actividad para el XP y el % de
   *                   acierto. Solo se usa cuando `conRiesgo` está activo.
   *   - `conRiesgo`   agrega XP del período, % de acierto por tipo y última
   *                   conexión. Son tres consultas extra, así que solo se pagan
   *                   cuando la vista los necesita (el listado), no en las
   *                   consultas de notas ni en el resumen de otra página.
   */
  static async _obtenerDatosProgresoModulos(
    docenteId,
    { grupoId = null, semanas = null, conRiesgo = false } = {}
  ) {
    const students = await User.findAll({
      where: { role: 'student', docente_id: docenteId },
      attributes: ['id', 'name', 'email', 'iad_obligatorio'],
      raw: true
    });

    const studentIds = students.map(s => s.id);
    if (studentIds.length === 0) return [];

    const aplicaciones = await DiagnosticoAplicacion.findAll({
      where: { estudiante_id: studentIds, estado: 'completado' },
      order: [['id', 'DESC']],
      raw: true,
    });
    const diagnosticoPorEstudiante = new Map();
    for (const a of aplicaciones) {
      if (!diagnosticoPorEstudiante.has(a.estudiante_id)) {
        const parsed = a;
        if (typeof parsed.desglose === 'string') {
          try { parsed.desglose = JSON.parse(parsed.desglose); } catch (e) { parsed.desglose = null; }
        }
        diagnosticoPorEstudiante.set(a.estudiante_id, {
          puntaje_total: parsed.puntaje_total,
          nivel: parsed.nivel,
          desglose: parsed.desglose,
          aplicada_en: parsed.aplicada_en,
        });
      }
    }

    const [allContents, allGames, allEvaluations] = await Promise.all([
      Content.findAll({ where: { publicado: true, docente_id: docenteId }, attributes: ['id', 'modulo'], raw: true }),
      Game.findAll({ where: { publicado: true, docente_id: docenteId }, attributes: ['id', 'modulo', 'puntaje_max'], raw: true }),
      Evaluation.findAll({ where: { publicado: true, docente_id: docenteId }, attributes: ['id', 'modulo'], raw: true })
    ]);

    const [mapaGruposC, mapaGruposJ, mapaGruposE] = await Promise.all([
      GrupoService.mapaGruposPorRecurso('contenido', allContents.map(c => c.id)),
      GrupoService.mapaGruposPorRecurso('juego', allGames.map(g => g.id)),
      GrupoService.mapaGruposPorRecurso('evaluacion', allEvaluations.map(e => e.id)),
    ]);

    const contentToModule = {};
    const gameToModule = {};
    const evalToModule = {};
    for (const c of allContents) { if (c.modulo) contentToModule[c.id] = c; }
    for (const g of allGames) { if (g.modulo) gameToModule[g.id] = g; }
    for (const e of allEvaluations) { if (e.modulo) evalToModule[e.id] = e; }

    const moduleNamesSet = new Set();
    allContents.forEach(c => { if (c.modulo) moduleNamesSet.add(c.modulo); });
    allGames.forEach(g => { if (g.modulo) moduleNamesSet.add(g.modulo); });
    allEvaluations.forEach(e => { if (e.modulo) moduleNamesSet.add(e.modulo); });
    const moduleNames = [...moduleNamesSet].sort();

    const progressRecords = await Progress.findAll({
      where: { usuario_id: { [Op.in]: studentIds } },
      raw: true
    });
    const progressByStudent = {};
    for (const pr of progressRecords) {
      if (!progressByStudent[pr.usuario_id]) progressByStudent[pr.usuario_id] = {};
      progressByStudent[pr.usuario_id][pr.modulo] = pr;
    }

    const spRecords = await StudentProgress.findAll({
      where: { estudiante_id: { [Op.in]: studentIds }, completado: true },
      attributes: ['estudiante_id', 'contenido_id', 'juego_id', 'evaluacion_id'],
      raw: true
    });

    const studentModuleCompletions = {};
    for (const sp of spRecords) {
      let modulo = null;
      let type = null;
      if (sp.contenido_id && contentToModule[sp.contenido_id]) {
        modulo = contentToModule[sp.contenido_id].modulo; type = 'contents';
      } else if (sp.juego_id && gameToModule[sp.juego_id]) {
        modulo = gameToModule[sp.juego_id].modulo; type = 'games';
      } else if (sp.evaluacion_id && evalToModule[sp.evaluacion_id]) {
        modulo = evalToModule[sp.evaluacion_id].modulo; type = 'evals';
      }
      if (!modulo || !type) continue;

      if (!studentModuleCompletions[sp.estudiante_id]) studentModuleCompletions[sp.estudiante_id] = {};
      if (!studentModuleCompletions[sp.estudiante_id][modulo]) {
        studentModuleCompletions[sp.estudiante_id][modulo] = { contents: new Set(), games: new Set(), evals: new Set() };
      }
      if (type === 'contents') studentModuleCompletions[sp.estudiante_id][modulo].contents.add(sp.contenido_id);
      else if (type === 'games') studentModuleCompletions[sp.estudiante_id][modulo].games.add(sp.juego_id);
      else if (type === 'evals') studentModuleCompletions[sp.estudiante_id][modulo].evals.add(sp.evaluacion_id);
    }

    const gruposPorEstudiante = {};
    const { GroupStudent, Group } = require('../models/associations');
    const todosGrupos = await Group.findAll({ where: { docente_id: docenteId }, raw: true });
    const mapGrupoId = {};
    todosGrupos.forEach(g => { mapGrupoId[g.id] = g; });
    const asignaciones = await GroupStudent.findAll({ where: { estudiante_id: { [Op.in]: studentIds } }, raw: true });
    for (const a of asignaciones) {
      if (!gruposPorEstudiante[a.estudiante_id]) gruposPorEstudiante[a.estudiante_id] = [];
      const grp = mapGrupoId[a.grupo_id];
      if (grp) gruposPorEstudiante[a.estudiante_id].push({ id: grp.id, materia: grp.materia, nombre: grp.nombre });
    }

    // Filtro global de grupo: solo entran los estudiantes matriculados en él.
    // Un `grupoId` que no es del docente no se aplica (nadie lo ve en el
    // historial) en vez de devolver la lista completa del docente.
    const grupoValido = grupoId && mapGrupoId[Number(grupoId)] ? Number(grupoId) : null;
    const estudiantes =
      grupoValido == null
        ? students
        : students.filter(s => (gruposPorEstudiante[s.id] || []).some(g => g.id === grupoValido));

    // Métricas del período y de conexión: solo las pide el listado.
    let metricas = null;
    if (conRiesgo && estudiantes.length > 0) {
      const ids = estudiantes.map(s => s.id);
      const desde = new Date(Date.now() - normalizarSemanas(semanas) * 7 * 864e5);
      const [xps, aciertos, conexiones] = await Promise.all([
        DashboardService._xpPorEstudiante(docenteId, ids, desde),
        DashboardService._aciertoPorTipo(docenteId, ids, desde),
        DashboardService.ultimasConexiones(docenteId, ids),
      ]);
      metricas = { desde, xps, aciertos, conexiones };
    }

    const data = estudiantes.map(student => {
      const studentProgress = progressByStudent[student.id] || {};
      const studentCompletions = studentModuleCompletions[student.id] || {};
      const estudianteGrupos = gruposPorEstudiante[student.id] || [];
      const estudianteGrupoIds = new Set(estudianteGrupos.map(g => g.id));

      const modules = moduleNames.map(mod => {
        const prog = studentProgress[mod] || {};
        const comp = studentCompletions[mod] || { contents: new Set(), games: new Set(), evals: new Set() };

        const totContents = allContents.filter(c => c.modulo === mod && GrupoService.esVisibleParaGrupos(mapaGruposC, c.id, estudianteGrupoIds));
        const totGames = allGames.filter(g => g.modulo === mod && GrupoService.esVisibleParaGrupos(mapaGruposJ, g.id, estudianteGrupoIds));
        const totEvals = allEvaluations.filter(e => e.modulo === mod && GrupoService.esVisibleParaGrupos(mapaGruposE, e.id, estudianteGrupoIds));

        const contentsCount = totContents.length;
        const gamesCount = totGames.length;
        const evalsCount = totEvals.length;
        const completedCount = comp.contents.size + comp.games.size + comp.evals.size;
        const totalItems = contentsCount + gamesCount + evalsCount;
        const porcentaje_avance = totalItems > 0 ? Math.min(100, Math.round((completedCount / totalItems) * 100)) : 0;

        const puntajeTotal = prog.puntaje_total ?? 0;
        const puntajeMax = NotaService.maximaPuntuacion(totGames, totEvals);
        const nota = NotaService.calcularNota(puntajeTotal, puntajeMax);

        return {
          modulo: mod,
          porcentaje_avance,
          puntaje_total: puntajeTotal,
          puntaje_max: puntajeMax,
          nota,
          categoria: NotaService.clasificarNota(nota),
          nivel: prog.nivel ?? 1,
          contents: { completed: comp.contents.size, total: contentsCount },
          games: { completed: comp.games.size, total: gamesCount },
          evals: { completed: comp.evals.size, total: evalsCount }
        };
      });

      const totales = modules.reduce((acc, m) => {
        acc.obtenido += m.puntaje_total;
        acc.maximo += m.puntaje_max;
        return acc;
      }, { obtenido: 0, maximo: 0 });

      // Calificación numérica. Primero la nota que ya existe (la misma que
      // devuelve "Consultar Notas": puntos sobre el máximo de lo asignado al
      // estudiante). Solo si no hay nada puntuable todavía se cae al respaldo
      // del % de acierto, para que un estudiante con actividad reciente no
      // aparezca sin nota.
      const notaExistente = NotaService.calcularNota(totales.obtenido, totales.maximo);
      const acierto = metricas ? metricas.aciertos.get(student.id) : null;
      const pctPorTipo = acierto
        ? Object.fromEntries(
            Object.entries(acierto).map(([tipo, v]) => [tipo, v.pct])
          )
        : {};
      const notaDesdePct = conRiesgo ? notaDesdeAcierto({ pct_por_tipo: pctPorTipo }) : null;
      const nota = notaExistente != null ? notaExistente : notaDesdePct;

      const conexion = metricas ? metricas.conexiones.get(student.id) : null;
      const nivel = nivelDeNota(nota);
      const diasSinIngresar = conexion ? conexion.dias : null;
      const riesgo = conRiesgo
        ? riesgoDe({ nivel, diasSinIngresar })
        : { en_riesgo: false, motivo: null, motivo_texto: null };

      const fila = {
        id: student.id,
        name: student.name,
        email: student.email,
        iad_obligatorio: student.iad_obligatorio,
        grupos: estudianteGrupos,
        diagnostico: diagnosticoPorEstudiante.get(student.id) || null,
        puntaje_total: totales.obtenido,
        puntaje_max: totales.maximo,
        nota,
        // De dónde sale la nota, para que la interfaz no la presente como si
        // siempre fuera la misma fuente.
        nota_fuente: notaExistente != null ? 'registrada' : notaDesdePct != null ? 'acierto' : null,
        categoria: NotaService.clasificarNota(nota),
        nivel,
        modules
      };

      if (conRiesgo) {
        fila.xp = metricas.xps.get(student.id) || 0;
        fila.pct_aciertos = pctPorTipo.juego ?? pctPorTipo.evaluacion ?? null;
        fila.intentos = Object.values(acierto || {}).reduce((s, v) => s + (v.intentos || 0), 0);
        fila.ultima_conexion = conexion ? conexion.ultima : null;
        fila.dias_sin_ingresar = diasSinIngresar;
        fila.en_riesgo = riesgo.en_riesgo;
        fila.motivo_riesgo = riesgo.motivo;
        fila.motivo_riesgo_texto = riesgo.motivo_texto;
        // Temas en los que el estudiante tiene avance: alimenta el filtro por
        // tema del listado sin que la interfaz tenga que conocer los módulos.
        fila.temas = modules.map(m => m.modulo).filter(Boolean);
      }

      return fila;
    });

    return data;
  }

  static async sendStudentReport(req, res) {
    try {
      const { id } = req.params;
      const estudianteId = Number(id);
      if (!Number.isInteger(estudianteId)) {
        return res.status(400).json({ success: false, message: 'ID de estudiante inválido.' });
      }
      const result = await ReportService.sendReport(estudianteId, req.user.id);
      await NotificationService.sendReportNotification(req.user.id, estudianteId, null, result.format || 'pdf', [], 'manual');
      res.status(200).json({
        success: true,
        message: `El reporte fue enviado correctamente al correo del estudiante (${result.email}).`,
        data: result,
      });
    } catch (error) {
      console.error('[Reporte] Error al enviar el reporte:', error.message);
      if (error.message.includes('no pertenece') || error.message.includes('no existe')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      res.status(400).json({
        success: false,
        message: error.message || 'No fue posible enviar el reporte. Inténtalo nuevamente.',
      });
    }
  }

  static async sendBulkStudentReports(req, res) {
    try {
      const result = await ReportService.sendBulkReports(req.user.id);
      const estudiantes = await User.findAll({
        where: { role: 'student', docente_id: req.user.id, emailVerified: true },
        attributes: ['id'],
        raw: true,
      });
      for (const s of estudiantes) {
        await NotificationService.sendReportNotification(req.user.id, s.id, null, 'pdf', [], 'masivo');
      }
      res.status(200).json({
        success: true,
        message: `Se enviaron ${result.enviados} de ${result.total} reportes correctamente.`,
        data: result,
      });
    } catch (error) {
      console.error('[Reporte] Error en el envío masivo de reportes:', error.message);
      res.status(400).json({
        success: false,
        message: error.message || 'No fue posible enviar los reportes. Inténtalo nuevamente.',
      });
    }
  }

  static async getStudentDetail(req, res) {
    try {
      const studentId = Number(req.params.id);
      if (!Number.isInteger(studentId)) {
        return res.status(400).json({ success: false, message: 'ID de estudiante inválido.' });
      }
      const docenteId = req.user.id;

      // Filtro global de grupo: acota el universo contra el que se calcula el
      // promedio. Si el docente está viendo un grupo concreto, el "promedio del
      // grupo" del radar y de la línea de referencia tienen que ser ese grupo y
      // no todos sus grupos mezclados.
      const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;
      if (grupoId && !(await DashboardService.grupoEsDelDocente(docenteId, grupoId))) {
        return res.status(404).json({
          success: false,
          message: 'El grupo seleccionado no existe o no te pertenece.',
        });
      }

      const student = await User.findOne({
        where: { id: studentId, role: 'student', docente_id: docenteId },
        attributes: ['id', 'name', 'email', 'iad_obligatorio'],
        raw: true,
      });

      if (!student) {
        return res.status(404).json({ success: false, message: 'Estudiante no encontrado.' });
      }

      const alias = aliasDe(student.name);

      const progressData = await TeacherController._obtenerDatosProgresoModulos(docenteId, { grupoId });
      const studentProgress = progressData.find(s => s.id === studentId);

      // Con un grupo seleccionado el estudiante puede quedarse fuera si no está
      // matriculado: se responde 404 en vez de devolver una ficha con medias de
      // un grupo del que no forma parte.
      if (!studentProgress) {
        return res.status(404).json({
          success: false,
          message: 'Este estudiante no pertenece al grupo seleccionado.',
        });
      }

      // Sin nota no se inventa una: se devuelve `null` y la interfaz muestra
      // "Sin datos" en vez de un 1.0 que parece un suspenso real.
      const notaGlobal = studentProgress?.nota ?? null;
      // El nivel sale de la MISMA definición que usa el listado, para que el chip
      // de la tabla y el de la ficha nunca se contradigan.
      const nivelGlobal = nivelDeNota(notaGlobal);
      const xpTotal = studentProgress?.puntaje_total ?? 0;

      const miNota = Number(studentProgress?.nota ?? 0);
      const posicion = progressData.filter(p => Number(p.nota || 0) > miNota).length + 1;

      const medalsService = require('../services/medals.service');
      const gamificacion = await medalsService.obtenerGamificacion(studentId, docenteId);
      const medallas = gamificacion.medallas || [];

      const moduloNames = [...new Set(
        progressData.flatMap(p => (p.modules || []).map(m => m.modulo))
      )].filter(Boolean);

      const radarData = moduloNames.map(modulo => {
        const studentMod = studentProgress?.modules?.find(m => m.modulo === modulo);
        const studentPct = studentMod ? Number(studentMod.porcentaje_avance) : 0;

        const pctsGrupo = progressData
          .map(p => (p.modules || []).find(m => m.modulo === modulo))
          .filter(Boolean)
          .map(m => Number(m.porcentaje_avance))
          .filter(Number.isFinite);

        const groupAvg = pctsGrupo.length > 0
          ? pctsGrupo.reduce((a, b) => a + b, 0) / pctsGrupo.length
          : 0;

        const diff = studentPct - groupAvg;
        let fuerza = 0;
        let debilidad = 0;
        if (diff > 10) fuerza = 1;
        else if (diff > 0) fuerza = 0.5;
        else if (diff < -10) debilidad = 1;
        else if (diff < 0) debilidad = 0.5;

        return {
          modulo,
          estudiante: studentPct,
          promedio_grupo: Math.round(groupAvg * 10) / 10,
          fuerza,
          debilidad,
        };
      });

      // ---------- Evolución XP ----------
      const evoRows = await StudentProgress.findAll({
        where: { estudiante_id: studentId, puntaje: { [Op.gt]: 0 } },
        attributes: [
          [fn('DATE_FORMAT', col('fecha'), '%Y-%m'), 'mes'],
          [fn('SUM', col('puntaje')), 'total_puntaje'],
          [fn('COUNT', col('id')), 'intentos'],
        ],
        group: [literal("DATE_FORMAT(fecha, '%Y-%m')")],
        order: [[literal("DATE_FORMAT(fecha, '%Y-%m')"), 'ASC']],
        limit: MESES_XP_REFERENCIA,
        raw: true,
      });

      const evolution = evoRows.map(r => ({
        mes: r.mes,
        puntaje: Number(r.total_puntaje) || 0,
        intentos: Number(r.intentos) || 0,
      }));

      // Referencia del grupo para la misma serie, en el mismo grano mensual.
      // Se calcula sobre los mismos estudiantes que la vista está comparando
      // (los del grupo seleccionado, o los del docente si no hay filtro), no
      // sobre un promedio histórico genérico.
      const xpGrupoMes = await DashboardService.xpMensualPromedio(
        docenteId,
        progressData.map(p => p.id),
        { meses: MESES_XP_REFERENCIA }
      );
      evolution.forEach(e => {
        e.promedio_grupo = xpGrupoMes.get(e.mes) ?? null;
      });

      // ---------- Progreso por tema (con pct_inicial si está) ----------
      const pctInicialPorModulo = extraerPctInicialPorModulo(studentProgress?.diagnostico?.desglose);
      const progresoPorTema = (studentProgress?.modules || []).map(m => ({
        modulo: m.modulo,
        pct_inicial: pctInicialPorModulo[m.modulo] ?? 0,
        pct_actual: Math.round(Number(m.porcentaje_avance) || 0),
      }));

      // ---------- Primer intento ----------
      let primerIntentoPct = 0;
      try {
        const rows = await StudentProgress.findAll({
          where: { estudiante_id: studentId, completado: true },
          attributes: ['intentos_realizados'],
          raw: true,
        });
        if (rows.length > 0) {
          const primerIntento = rows.filter(r => (r.intentos_realizados ?? 0) <= 1).length;
          primerIntentoPct = Math.round((primerIntento / rows.length) * 100);
        }
      } catch (e) {
        primerIntentoPct = 0;
      }

      // ---------- Sesiones agregadas ----------
      let sesionesTotal = 0;
      let tiempoActivoSeg = 0;
      try {
        const agg = await EstudianteSesion.findOne({
          where: { estudiante_id: studentId, docente_id: docenteId },
          attributes: [
            [fn('COUNT', col('id')), 'total'],
            [fn('SUM', col('duracion_seg')), 'tiempo'],
          ],
          raw: true,
        });
        sesionesTotal = Number(agg?.total) || 0;
        tiempoActivoSeg = Number(agg?.tiempo) || 0;
      } catch (e) { /* sin sesiones */ }

      const sesiones = await EstudianteSesion.findAll({
        where: { estudiante_id: studentId, docente_id: docenteId },
        attributes: ['iniciado_en', 'duracion_seg', 'activa'],
        order: [['iniciado_en', 'DESC']],
        limit: 5,
        raw: true,
      });

      const sesionesFormateadas = sesiones.map(s => ({
        fecha: s.iniciado_en ? new Date(s.iniciado_en).toLocaleDateString() : 'N/A',
        duracion: s.duracion_seg || 0,
        activa: !!s.activa,
      }));

      // ---------- Diagnóstico IAD ----------
      const diagnostico = await DiagnosticoAplicacion.findOne({
        where: { estudiante_id: studentId },
        order: [['id', 'DESC']],
        raw: true,
      });

      let desglose = diagnostico?.desglose ?? null;
      if (typeof desglose === 'string') {
        try { desglose = JSON.parse(desglose); } catch { desglose = null; }
      }

      res.json({
        success: true,
        data: {
          alias,
          nota: notaGlobal == null ? null : Number(Number(notaGlobal).toFixed(1)),
          nivel: nivelGlobal,
          posicion,
          xp: xpTotal,
          iad_obligatorio: student.iad_obligatorio,
          // Métricas para la tarjeta hero
          primer_intento_pct: primerIntentoPct,
          sesiones_total: sesionesTotal,
          tiempo_activo_seg: tiempoActivoSeg,
          // Resto
          badges: medallas
            .filter(m => m.obtenida)
            .map(m => ({ id: m.id, nombre: m.nombre, categoria: m.categoria, obtenida: m.obtenida })),
          badgesPending: medallas.filter(m => !m.obtenida).length,
          radar: radarData,
          evolution,
          progreso_por_tema: progresoPorTema,
          sesiones: sesionesFormateadas,
          diagnostico: diagnostico ? {
            nivel: diagnostico.nivel,
            puntaje_total: diagnostico.puntaje_total,
            desglose,
          } : null,
        },
      });
    } catch (error) {
      console.error('[Teacher] Error al obtener detalle del estudiante:', error);
      res.status(500).json({ success: false, message: 'No se pudo cargar el detalle del estudiante.' });
    }
  }

/* ---------------------- Reportes programados y notificaciones ---------------------- */

  /**
   * Responde un error de la programmedora de reportes con su código HTTP.
   * Los errores de validación llevan `status` propio: sin él, un "selecciona una
   * sección" saldría como 500 y el formulario no podría distinguirlo de una
   * caída real del servidor.
   */
  static _errorReportes(res, error) {
    const status = error && error.name === 'ReportScheduleError' ? error.status || 400 : 500;
    if (status === 500) console.error('[Teacher] Error en reportes:', error);
    return res
      .status(status)
      .json({ success: false, message: error.message || 'No se pudo completar la operación.' });
  }

  /** Filtro global de período que llega desde la barra de Analítica. */
  static _periodoGlobal(req) {
    const semanas = Number(req.query.semanas || req.body?.semanas);
    return Number.isInteger(semanas) && semanas > 0 && semanas <= 52 ? semanas : null;
  }

  static async getReportCatalog(req, res) {
    res.json({ success: true, data: ReportScheduleService.catalogo() });
  }

  static async getReportSchedules(req, res) {
    try {
      res.json({ success: true, data: await ReportScheduleService.listar(req.user.id) });
    } catch (error) {
      TeacherController._errorReportes(res, error);
    }
  }

  static async createReportSchedule(req, res) {
    try {
      res.status(201).json({ success: true, data: await ReportScheduleService.crear(req.user.id, req.body) });
    } catch (error) {
      TeacherController._errorReportes(res, error);
    }
  }

  static async updateReportSchedule(req, res) {
    try {
      const data = await ReportScheduleService.actualizar(req.user.id, req.params.id, req.body);
      res.json({ success: true, data });
    } catch (error) {
      TeacherController._errorReportes(res, error);
    }
  }

  static async deleteReportSchedule(req, res) {
    try {
      await ReportScheduleService.eliminar(req.user.id, req.params.id);
      res.json({ success: true, message: 'Reporte programado eliminado.' });
    } catch (error) {
      TeacherController._errorReportes(res, error);
    }
  }

  /** "Enviar ahora": genera la ejecución y deja la notificación en la campana. */
  static async sendReportNow(req, res) {
    try {
      const semanas = TeacherController._periodoGlobal(req);
      const { run } = await ReportScheduleService.enviarAhora(req.user.id, req.params.id, { semanas });
      res.status(201).json({
        success: true,
        data: { id: run.id, estado: run.estado, formato: run.formato, descargable: true },
      });
    } catch (error) {
      TeacherController._errorReportes(res, error);
    }
  }

  static async getReportRuns(req, res) {
    try {
      const limite = Number(req.query.limite);
      const data = await ReportScheduleService.listarEjecuciones(req.user.id, {
        limite: Number.isInteger(limite) && limite > 0 ? limite : 50,
      });
      res.json({ success: true, data });
    } catch (error) {
      TeacherController._errorReportes(res, error);
    }
  }

  /**
   * Descarga el archivo desde el snapshot guardado.
   *
   * Va como binario y no como JSON porque el archivo se arma bajo demanda: no
   * hay nada en disco que linkear. El token viaja en la cabecera, así que el
   * botón lo pide con axios y arma un Blob en el navegador.
   */
  static async downloadReportRun(req, res) {
    try {
      const formato = String(req.query.formato || '').toLowerCase();
      const { nombre, buffer, mime } = await ReportScheduleService.descargar(
        req.user.id,
        req.params.id,
        formato || null
      );
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
      res.send(buffer);
    } catch (error) {
      TeacherController._errorReportes(res, error);
    }
  }

  static async getNotifications(req, res) {
    try {
      const soloReportes = req.query.tipo === 'reporte';
      const limite = Number(req.query.limite);
      const [data, conteo] = await Promise.all([
        ReportScheduleService.listarNotificaciones(req.user.id, {
          limite: Number.isInteger(limite) && limite > 0 ? limite : 30,
          soloReportes,
        }),
        ReportScheduleService.contarNotificaciones(req.user.id),
      ]);
      res.json({ success: true, data, conteo });
    } catch (error) {
      TeacherController._errorReportes(res, error);
    }
  }

  static async getNotificationCount(req, res) {
    try {
      res.json({ success: true, data: await ReportScheduleService.contarNotificaciones(req.user.id) });
    } catch (error) {
      TeacherController._errorReportes(res, error);
    }
  }

  static async markNotificationsRead(req, res) {
    try {
      // Sin `:id` es "leer todas"; con `:id` marca una sola. La misma ruta
      // atende las dos porque el frontend llama a `/leer-todas` y a `/:id/leer`.
      const afectadas = await ReportScheduleService.marcarNotificacionesLeidas(
        req.user.id,
        req.params.id
      );
      res.json({ success: true, data: { afectadas } });
    } catch (error) {
      TeacherController._errorReportes(res, error);
    }
  }
}

module.exports = TeacherController;
