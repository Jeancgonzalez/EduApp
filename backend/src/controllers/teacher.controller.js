const { Op, fn, col, literal } = require('sequelize');
const User = require('../models/User');
const StudentProgress = require('../models/studentProgress.model');
const Game = require('../models/game.model');
const Evaluation = require('../models/evaluation.model');
const Content = require('../models/content.model');
const Progress = require('../models/progress.model');
const DiagnosticoAplicacion = require('../models/diagnosticoAplicacion.model');
const ReportService = require('../services/report.service');
const GroupService = require('../services/grupo.service');
const GrupoService = GroupService;
const NotaService = require('../services/nota.service');

class TeacherController {
  static async getStudentStats(req, res) {
    try {
      const data = await TeacherController._obtenerDatosProgresoModulos(req.user.id);

      if (data.length === 0) {
        return res.json({
          success: true,
          data: {
            totalEstudiantes: 0,
            promedioGeneral: 0,
            destacados: 0,
            requierenApoyo: 0
          }
        });
      }

      // Estadísticas basadas en la nota 1.0-5.0 (mismos umbrales que el gráfico):
      // destacados = nota >= 4.5 (Excelente), requierenApoyo = nota < 3.0 (Bajo).
      const notas = data.map(d => Number(d.nota)).filter(n => Number.isFinite(n));
      const promedioGeneral = notas.length > 0
        ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10
        : 0;
      const destacados = notas.filter(n => n >= 4.5).length;
      const requierenApoyo = notas.filter(n => n < 3.0).length;

      res.json({
        success: true,
        data: {
          totalEstudiantes: data.length,
          promedioGeneral,
          destacados,
          requierenApoyo
        }
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

          if (esJuegoValido) {
            acc.scores.push(p.puntaje);
            acc.juegos.add(p.juego_id);
          }
          if (esEvalValida) {
            acc.scores.push(p.puntaje);
            acc.evaluaciones.add(p.evaluacion_id);
          }
          if (esContenidoValido) {
            acc.scores.push(p.puntaje);
            acc.contenidos.add(p.contenido_id);
          }
        }
      });

      const totalAvailable = Math.max(1, validGameIds.size + validEvalIds.size + validContentIds.size);

      // Obtener grupos por estudiante
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

      if (studentIds.length === 0) {
        return res.json({ success: true, data: [] });
      }

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
      data.forEach(d => {
        counts[NotaService.clasificarNota(d.nota)] += 1;
      });

      res.json({
        success: true,
        data: { ...counts, total: data.length }
      });
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

      res.json({
        success: true,
        data: { totalStudents, totalGames, totalEvaluations }
      });
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
   * Progreso por módulo de todos los estudiantes del docente, con:
   *  - puntaje_total (puntos obtenidos, best-score) y puntaje_max (máximo posible
   *    de los recursos puntuables visibles para el estudiante por grupo).
   *  - nota 1.0-5.0 por módulo y global, calculada con NotaService.
   * Fuente única usada por getStudentsModuleProgress y getStudentStats para que
   * el gráfico, las tarjetas y las estadísticas compartan el mismo cálculo.
   */
  static async _obtenerDatosProgresoModulos(docenteId) {
    const students = await User.findAll({
      where: { role: 'student', docente_id: docenteId },
      attributes: ['id', 'name', 'email', 'iad_obligatorio'],
      raw: true
    });

    const studentIds = students.map(s => s.id);
    if (studentIds.length === 0) {
      return [];
    }

    // IAD-Primaria: última aplicación completada por estudiante
    const aplicaciones = await DiagnosticoAplicacion.findAll({
      where: {
        estudiante_id: studentIds,
        estado: 'completado',
      },
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
      Content.findAll({ where: { publicado: true, docente_id: docenteId }, attributes: ['id', 'modulo', 'grupo_id'], raw: true }),
      Game.findAll({ where: { publicado: true, docente_id: docenteId }, attributes: ['id', 'modulo', 'grupo_id', 'puntaje_max'], raw: true }),
      Evaluation.findAll({ where: { publicado: true, docente_id: docenteId }, attributes: ['id', 'modulo', 'grupo_id'], raw: true })
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
        modulo = contentToModule[sp.contenido_id].modulo;
        type = 'contents';
      } else if (sp.juego_id && gameToModule[sp.juego_id]) {
        modulo = gameToModule[sp.juego_id].modulo;
        type = 'games';
      } else if (sp.evaluacion_id && evalToModule[sp.evaluacion_id]) {
        modulo = evalToModule[sp.evaluacion_id].modulo;
        type = 'evals';
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

    // Obtener grupos por estudiante
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

    const data = students.map(student => {
      const studentProgress = progressByStudent[student.id] || {};
      const studentCompletions = studentModuleCompletions[student.id] || {};
      const estudianteGrupos = gruposPorEstudiante[student.id] || [];
      const estudianteGrupoIds = new Set(estudianteGrupos.map(g => g.id));

      const modules = moduleNames.map(mod => {
        const prog = studentProgress[mod] || {};
        const comp = studentCompletions[mod] || { contents: new Set(), games: new Set(), evals: new Set() };

        // Totales por estudiante: solo recursos visibles para este estudiante (grupo_id null o en sus grupos)
        const totContents = allContents.filter(c => c.modulo === mod && (c.grupo_id === null || estudianteGrupoIds.has(c.grupo_id)));
        const totGames = allGames.filter(g => g.modulo === mod && (g.grupo_id === null || estudianteGrupoIds.has(g.grupo_id)));
        const totEvals = allEvaluations.filter(e => e.modulo === mod && (e.grupo_id === null || estudianteGrupoIds.has(e.grupo_id)));

        const contentsCount = totContents.length;
        const gamesCount = totGames.length;
        const evalsCount = totEvals.length;
        const completedCount = comp.contents.size + comp.games.size + comp.evals.size;
        const totalItems = contentsCount + gamesCount + evalsCount;
        const porcentaje_avance = totalItems > 0 ? Math.min(100, Math.round((completedCount / totalItems) * 100)) : 0;

        // Puntos máximos posibles del módulo (recursos puntuables visibles) + nota 1.0-5.0
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

      // Nota global: agregando obtenido/máximo de todos los módulos visibles.
      const totales = modules.reduce((acc, m) => {
        acc.obtenido += m.puntaje_total;
        acc.maximo += m.puntaje_max;
        return acc;
      }, { obtenido: 0, maximo: 0 });
      const notaGlobal = NotaService.calcularNota(totales.obtenido, totales.maximo);

      return {
        id: student.id,
        name: student.name,
        email: student.email,
        iad_obligatorio: student.iad_obligatorio,
        grupos: estudianteGrupos,
        diagnostico: diagnosticoPorEstudiante.get(student.id) || null,
        puntaje_max: totales.maximo,
        nota: notaGlobal,
        categoria: NotaService.clasificarNota(notaGlobal),
        modules
      };
    });

    return data;
  }

  /**
   * Envía el reporte de progreso al correo del estudiante.
   * La relación docente-estudiante se valida en el backend contra los IDs reales
   * (no se confía en el ID enviado por el frontend).
   */
  static async sendStudentReport(req, res) {
    try {
      const { id } = req.params;
      const estudianteId = Number(id);
      if (!Number.isInteger(estudianteId)) {
        return res.status(400).json({ success: false, message: 'ID de estudiante inválido.' });
      }

      const result = await ReportService.sendReport(estudianteId, req.user.id);

      res.status(200).json({
        success: true,
        message: `El reporte fue enviado correctamente al correo del estudiante (${result.email}).`,
        data: result,
      });
    } catch (error) {
      console.error('[Reporte] Error al enviar el reporte:', error.message);
      console.error(error);
      if (error.message.includes('no pertenece') || error.message.includes('no existe')) {
        return res.status(404).json({ success: false, message: error.message });
      }
      res.status(400).json({
        success: false,
        message: error.message || 'No fue posible enviar el reporte. Inténtalo nuevamente.',
      });
    }
  }

  /**
   * Envía el reporte de progreso a TODOS los estudiantes con correo verificado
   * vinculados al docente autenticado.
   */
  static async sendBulkStudentReports(req, res) {
    try {
      const result = await ReportService.sendBulkReports(req.user.id);

      res.status(200).json({
        success: true,
        message: `Se enviaron ${result.enviados} de ${result.total} reportes correctamente.`,
        data: result,
      });
    } catch (error) {
      console.error('[Reporte] Error en el envío masivo de reportes:', error.message);
      console.error(error);
      res.status(400).json({
        success: false,
        message: error.message || 'No fue posible enviar los reportes. Inténtalo nuevamente.',
      });
    }
  }
}

module.exports = TeacherController;
