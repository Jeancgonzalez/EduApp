const Content = require('../models/content.model');
const Game = require('../models/game.model');
const Evaluation = require('../models/evaluation.model');
const StudentProgress = require('../models/studentProgress.model');
const GrupoService = require('./grupo.service');
const { Op } = require('sequelize');

class StudentService {
  /**
   * Convierte un porcentaje de logro (0-100) en estrellas (1 a 3).
   * 0-69 => 1 estrella, 70-89 => 2 estrellas, 90-100 => 3 estrellas.
   */
  static estrellasDePorcentaje(pct) {
    if (pct === null || pct === undefined || Number.isNaN(pct)) return 0;
    if (pct >= 90) return 3;
    if (pct >= 70) return 2;
    return 1;
  }

  /**
   * Verifica si el estudiante completó el contenido publicado del módulo.
   * Si el módulo no posee contenido publicado, no existe requisito previo (true).
   */
  static async esContenidoModuloCompletado(estudianteId, modulo, docenteId) {
    const condiciones = await GrupoService.recursoWhereEstudiante(estudianteId, 'contenido');
    const publishedContents = await Content.findAll({
      where: { modulo, publicado: true, docente_id: docenteId, [Op.or]: condiciones },
      attributes: ['id'],
      raw: true
    });
    if (publishedContents.length === 0) return true;

    const completedRecords = await StudentProgress.findAll({
      where: {
        estudiante_id: estudianteId,
        contenido_id: { [Op.in]: publishedContents.map(c => c.id) },
        completado: true
      },
      attributes: ['contenido_id'],
      raw: true
    });
    const completedIds = new Set(completedRecords.map(r => r.contenido_id));
    return publishedContents.every(c => completedIds.has(c.id));
  }

  static async getDashboardData(estudianteId, docenteId) {
    // Una sola consulta de grupos alimenta las condiciones de los 3 tipos de recurso.
    const vis = await GrupoService.condicionesVisibilidad(estudianteId);
    const condC = vis.contenido;
    const condJ = vis.juego;
    const condE = vis.evaluacion;
    const totalContents = await Content.count({ where: { publicado: true, docente_id: docenteId, [Op.or]: condC } });
    const totalGames = await Game.count({ where: { publicado: true, docente_id: docenteId, [Op.or]: condJ } });
    const totalEvaluations = await Evaluation.count({ where: { publicado: true, docente_id: docenteId, [Op.or]: condE } });

    const progressRecords = await StudentProgress.findAll({
      where: { estudiante_id: estudianteId, completado: true },
      raw: true
    });

    const bestPerActivity = StudentService._deduplicateProgress(progressRecords);

    const cvRecords = bestPerActivity.filter(r => r.contenido_id);
    const contentIds = cvRecords.map(r => r.contenido_id);
    const contentsViewed = contentIds.length > 0
      ? await Content.count({ where: { id: contentIds, publicado: true, docente_id: docenteId, [Op.or]: condC } })
      : 0;

    const gcRecords = bestPerActivity.filter(r => r.juego_id);
    const gameIds = gcRecords.map(r => r.juego_id);
    const gamesCompleted = gameIds.length > 0
      ? await Game.count({ where: { id: gameIds, publicado: true, docente_id: docenteId, [Op.or]: condJ } })
      : 0;

    const ecRecords = bestPerActivity.filter(r => r.evaluacion_id);
    const evalIds = ecRecords.map(r => r.evaluacion_id);
    const evaluationsCompleted = evalIds.length > 0
      ? await Evaluation.count({ where: { id: evalIds, publicado: true, docente_id: docenteId, [Op.or]: condE } })
      : 0;

    const moduleProgress = await StudentService._getModuleProgress(estudianteId, bestPerActivity, docenteId, vis);
    const moduleEntries = Object.entries(moduleProgress);
    const overallProgress = moduleEntries.length > 0
      ? Math.round(moduleEntries.reduce((sum, [, m]) => sum + m.percentage, 0) / moduleEntries.length)
      : 0;
    const completedModules = moduleEntries
      .filter(([, m]) => m.percentage >= 100)
      .map(([mod]) => mod);

    const recentActivity = await StudentProgress.findAll({
      where: { estudiante_id: estudianteId },
      order: [['fecha', 'DESC']],
      limit: 5
    });

    return {
      totalContents,
      contentsViewed,
      totalGames,
      gamesCompleted,
      totalEvaluations,
      evaluationsCompleted,
      completedModules,
      overallProgress,
      recentActivity
    };
  }

  static _deduplicateProgress(records) {
    const map = new Map();
    for (const r of records) {
      let key = null;
      if (r.contenido_id) key = `content_${r.contenido_id}`;
      else if (r.juego_id) key = `game_${r.juego_id}`;
      else if (r.evaluacion_id) key = `eval_${r.evaluacion_id}`;
      if (!key) continue;
      const existing = map.get(key);
      if (!existing || r.puntaje > existing.puntaje) {
        map.set(key, r);
      }
    }
    return [...map.values()];
  }

  /**
   * @param {object} [vis] Set de condiciones ya calculado con
   *   GrupoService.condicionesVisibilidad(estudianteId). Si se omite, se calcula.
   */
  static async _getModuleProgress(estudianteId, bestPerActivity, docenteId, vis = null) {
    const v = vis || await GrupoService.condicionesVisibilidad(estudianteId);
    const allContents = await Content.findAll({ where: { publicado: true, docente_id: docenteId, [Op.or]: v.contenido }, raw: true });
    const allGames = await Game.findAll({ where: { publicado: true, docente_id: docenteId, [Op.or]: v.juego }, raw: true });
    const allEvaluations = await Evaluation.findAll({ where: { publicado: true, docente_id: docenteId, [Op.or]: v.evaluacion }, raw: true });

    const modules = {};
    for (const c of allContents) {
      if (!c.modulo) continue;
      if (!modules[c.modulo]) modules[c.modulo] = { items: new Set(), completed: new Set() };
      modules[c.modulo].items.add(`content_${c.id}`);
    }
    for (const g of allGames) {
      if (!g.modulo) continue;
      if (!modules[g.modulo]) modules[g.modulo] = { items: new Set(), completed: new Set() };
      modules[g.modulo].items.add(`game_${g.id}`);
    }
    for (const e of allEvaluations) {
      if (!e.modulo) continue;
      if (!modules[e.modulo]) modules[e.modulo] = { items: new Set(), completed: new Set() };
      modules[e.modulo].items.add(`eval_${e.id}`);
    }

    for (const r of bestPerActivity) {
      let key = null;
      if (r.contenido_id) key = `content_${r.contenido_id}`;
      else if (r.juego_id) key = `game_${r.juego_id}`;
      else if (r.evaluacion_id) key = `eval_${r.evaluacion_id}`;
      if (!key) continue;
      for (const modData of Object.values(modules)) {
        if (modData.items.has(key)) {
          modData.completed.add(key);
          break;
        }
      }
    }

    const result = {};
    for (const [mod, data] of Object.entries(modules)) {
      const total = data.items.size;
      const completed = data.completed.size;
      result[mod] = {
        total,
        completed,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0
      };
    }
    return result;
  }

  static async registerContentView(estudianteId, contenidoId) {
    const [record, created] = await StudentProgress.findOrCreate({
      where: { estudiante_id: estudianteId, contenido_id: contenidoId },
      defaults: {
        estudiante_id: estudianteId,
        contenido_id: contenidoId,
        completado: true,
        puntaje: 0,
        fecha: new Date()
      }
    });
    if (!created) {
      await record.update({ completado: true, puntaje: 0, fecha: new Date() });
    }
    return record;
  }

  static async registerGameResult(estudianteId, juegoId, puntaje) {
    const [record, created] = await StudentProgress.findOrCreate({
      where: { estudiante_id: estudianteId, juego_id: juegoId },
      defaults: {
        estudiante_id: estudianteId,
        juego_id: juegoId,
        completado: true,
        puntaje,
        fecha: new Date()
      }
    });
    if (!created && puntaje > record.puntaje) {
      await record.update({ completado: true, puntaje, fecha: new Date() });
    }
    return { ...record.toJSON(), wasExisting: !created };
  }

  static async registerEvaluationResult(estudianteId, evaluacionId, puntaje, respuestas = null) {
    const [record, created] = await StudentProgress.findOrCreate({
      where: { estudiante_id: estudianteId, evaluacion_id: evaluacionId },
      defaults: {
        estudiante_id: estudianteId,
        evaluacion_id: evaluacionId,
        completado: true,
        puntaje,
        intentos_realizados: 1,
        respuestas: respuestas ? JSON.stringify(respuestas) : null,
        fecha: new Date()
      }
    });
    if (!created) {
      const updateFields = {
        completado: true,
        intentos_realizados: (record.intentos_realizados || 0) + 1,
        respuestas: respuestas ? JSON.stringify(respuestas) : record.respuestas,
        fecha: new Date()
      };
      if (puntaje > record.puntaje) {
        updateFields.puntaje = puntaje;
      }
      await record.update(updateFields);
    }
    return { ...record.toJSON(), wasExisting: !created };
  }

  static async getDetailedProgress(estudianteId, docenteId) {
    const vis = await GrupoService.condicionesVisibilidad(estudianteId);
    // Las condiciones no dependen del alias, así que sirven igual en los `include`.
    const condContenido = vis.contenido;
    const condJuego = vis.juego;
    const condEvaluacion = vis.evaluacion;
    const [rawContents, rawGames, rawEvals] = await Promise.all([
      StudentProgress.findAll({
        where: { estudiante_id: estudianteId, contenido_id: { [Op.ne]: null } },
        include: [{ model: Content, as: 'contenido', where: { publicado: true, docente_id: docenteId, [Op.or]: condContenido }, required: true }]
      }),
      StudentProgress.findAll({
        where: { estudiante_id: estudianteId, juego_id: { [Op.ne]: null } },
        include: [{ model: Game, as: 'juego', where: { publicado: true, docente_id: docenteId, [Op.or]: condJuego }, required: true }]
      }),
      StudentProgress.findAll({
        where: { estudiante_id: estudianteId, evaluacion_id: { [Op.ne]: null } },
        include: [{ model: Evaluation, as: 'evaluacion', where: { publicado: true, docente_id: docenteId, [Op.or]: condEvaluacion }, required: true }]
      }),
    ]);
    const contentsViewed = [...rawContents
      .reduce((map, r) => {
        const existing = map.get(r.contenido_id);
        if (!existing || r.puntaje > existing.puntaje) map.set(r.contenido_id, r);
        return map;
      }, new Map()).values()];

    const gamesCompleted = [...rawGames
      .reduce((map, r) => {
        const existing = map.get(r.juego_id);
        if (!existing || r.puntaje > existing.puntaje) map.set(r.juego_id, r);
        return map;
      }, new Map()).values()];

    const evaluationsCompleted = [...rawEvals
      .reduce((map, r) => {
        const existing = map.get(r.evaluacion_id);
        if (!existing || r.puntaje > existing.puntaje) map.set(r.evaluacion_id, r);
        return map;
      }, new Map()).values()];

    const allProgress = await StudentProgress.findAll({
      where: { estudiante_id: estudianteId, completado: true },
      raw: true
    });
    const bestPerActivity = StudentService._deduplicateProgress(allProgress);
    const moduleProgressObj = await StudentService._getModuleProgress(estudianteId, bestPerActivity, docenteId, vis);

    // Map to array format with fields expected by frontend
    const progressByModule = await Promise.all(
      Object.entries(moduleProgressObj).map(async ([mod, data]) => {
        const [contentIds, gameIds, evalIds] = await Promise.all([
          Content.findAll({ where: { modulo: mod, publicado: true, docente_id: docenteId }, attributes: ['id'], raw: true }).then(cs => cs.map(c => c.id)),
          Game.findAll({ where: { modulo: mod, publicado: true, docente_id: docenteId }, attributes: ['id'], raw: true }).then(gs => gs.map(g => g.id)),
          Evaluation.findAll({ where: { modulo: mod, publicado: true, docente_id: docenteId }, attributes: ['id'], raw: true }).then(es => es.map(e => e.id)),
        ]);

        const moduleRecords = bestPerActivity.filter(r => {
          if (r.contenido_id) return contentIds.includes(r.contenido_id);
          if (r.juego_id) return gameIds.includes(r.juego_id);
          if (r.evaluacion_id) return evalIds.includes(r.evaluacion_id);
          return false;
        });

        const puntaje_total = moduleRecords
          .filter(r => r.juego_id || r.evaluacion_id)
          .reduce((sum, r) => sum + r.puntaje, 0);
        const ultima_actividad = moduleRecords.length > 0
          ? moduleRecords.reduce((latest, r) => r.fecha > latest ? r.fecha : latest, moduleRecords[0].fecha)
          : null;

        return {
          modulo: mod,
          puntaje_total,
          nivel: puntaje_total >= 500 ? Math.floor(puntaje_total / 500) + 1 : 1,
          porcentaje_avance: data.percentage,
          ultima_actividad
        };
      })
    );

    return {
      contentsViewed,
      gamesCompleted,
      evaluationsCompleted,
      progressByModule
    };
  }
}

module.exports = StudentService;
