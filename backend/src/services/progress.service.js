const Progress = require('../models/progress.model');
const Content = require('../models/content.model');
const Game = require('../models/game.model');
const Evaluation = require('../models/evaluation.model');
const StudentProgress = require('../models/studentProgress.model');
const User = require('../models/User');
const GrupoService = require('./grupo.service');
const { Op } = require('sequelize');

class ProgressService {
  static calcularNivel(puntajeTotal) {
    const puntosPorNivel = 500;
    const nivel = Math.floor(puntajeTotal / puntosPorNivel) + 1;
    return nivel;
  }

  static async obtenerProgresoPorUsuario(usuarioId) {
    try {
      const progresos = await Progress.findAll({
        where: { usuario_id: usuarioId }
      });
      return progresos;
    } catch (error) {
      throw new Error(`Error al obtener el progreso del usuario: ${error.message}`);
    }
  }

  static async recalcularProgreso(estudianteId, modulo, transaction, docenteId) {
    const vis = await GrupoService.condicionesVisibilidad(estudianteId);
    const whereExtra = docenteId ? { docente_id: docenteId } : {};
    const [contents, games, evaluations] = await Promise.all([
      Content.findAll({ where: { modulo, publicado: true, ...whereExtra, [Op.or]: vis.contenido }, attributes: ['id'], raw: true, transaction }),
      Game.findAll({ where: { modulo, publicado: true, ...whereExtra, [Op.or]: vis.juego }, attributes: ['id'], raw: true, transaction }),
      Evaluation.findAll({ where: { modulo, publicado: true, ...whereExtra, [Op.or]: vis.evaluacion }, attributes: ['id'], raw: true, transaction })
    ]);

    const contentIds = contents.map(c => `content_${c.id}`);
    const gameIds = games.map(g => `game_${g.id}`);
    const evaluationIds = evaluations.map(e => `eval_${e.id}`);
    const totalItems = contentIds.length + gameIds.length + evaluationIds.length;

    const progressRecords = await StudentProgress.findAll({
      where: { estudiante_id: estudianteId, completado: true },
      raw: true,
      transaction
    });

    const bestPerActivity = new Map();
    for (const r of progressRecords) {
      let key = null;
      if (r.contenido_id) key = `content_${r.contenido_id}`;
      else if (r.juego_id) key = `game_${r.juego_id}`;
      else if (r.evaluacion_id) key = `eval_${r.evaluacion_id}`;
      if (!key) continue;
      const existing = bestPerActivity.get(key);
      if (!existing || r.puntaje > existing.puntaje) {
        bestPerActivity.set(key, r);
      }
    }

    const allValidKeys = new Set([...contentIds, ...gameIds, ...evaluationIds]);
    let completedCount = 0;
    let totalScore = 0;
    const scores = [];
    for (const [key, record] of bestPerActivity) {
      if (allValidKeys.has(key)) {
        completedCount++;
        if (!key.startsWith('content_')) {
          totalScore += record.puntaje;
          scores.push(record.puntaje);
        }
      }
    }

    const avg = scores.length > 0 ? Math.round(totalScore / scores.length) : 0;

    const [progress] = await Progress.findOrCreate({
      where: { usuario_id: estudianteId, modulo },
      defaults: { puntaje_total: 0, nivel: 1, porcentaje_avance: 0.00 },
      transaction
    });

    const nivel = avg >= 90 ? 3 : avg >= 70 ? 2 : 1;
    const porcentaje = totalItems > 0 ? Math.min(100, Math.round((completedCount / totalItems) * 100)) : 0;

    await progress.update({
      puntaje_total: totalScore,
      nivel,
      porcentaje_avance: porcentaje,
      ultima_actividad: new Date()
    }, { transaction });
  }

  static async actualizarProgreso(usuarioId, modulo, puntosGanados, incrementoAvance = 0) {
    try {
      let progreso = await Progress.findOne({
        where: { usuario_id: usuarioId, modulo }
      });

      if (!progreso) {
        progreso = await Progress.create({
          usuario_id: usuarioId,
          modulo: modulo,
          puntaje_total: puntosGanados,
          nivel: this.calcularNivel(puntosGanados),
          porcentaje_avance: incrementoAvance
        });
      } else {
        const nuevoPuntaje = progreso.puntaje_total + puntosGanados;
        let nuevoAvance = parseFloat(progreso.porcentaje_avance) + incrementoAvance;
        if (nuevoAvance > 100) {
          nuevoAvance = 100;
        }
        await progreso.update({
          puntaje_total: nuevoPuntaje,
          nivel: this.calcularNivel(nuevoPuntaje),
          porcentaje_avance: nuevoAvance,
          ultima_actividad: new Date()
        });
      }

      return progreso;
    } catch (error) {
      throw new Error(`Error al actualizar el progreso: ${error.message}`);
    }
  }

  static async recalcularProgresoParaEstudiante(estudianteId) {
    const student = await User.findByPk(estudianteId, { attributes: ['docente_id'], raw: true });
    const docenteId = student ? student.docente_id : null;
    const whereExtra = docenteId ? { docente_id: docenteId } : {};
    const vis = await GrupoService.condicionesVisibilidad(estudianteId);

    const modulosSet = new Set();
    const [contents, games, evaluations] = await Promise.all([
      Content.findAll({ where: { publicado: true, ...whereExtra, [Op.or]: vis.contenido }, attributes: ['modulo'], raw: true }),
      Game.findAll({ where: { publicado: true, ...whereExtra, [Op.or]: vis.juego }, attributes: ['modulo'], raw: true }),
      Evaluation.findAll({ where: { publicado: true, ...whereExtra, [Op.or]: vis.evaluacion }, attributes: ['modulo'], raw: true })
    ]);
    for (const c of contents) if (c.modulo) modulosSet.add(c.modulo);
    for (const g of games) if (g.modulo) modulosSet.add(g.modulo);
    for (const e of evaluations) if (e.modulo) modulosSet.add(e.modulo);

    for (const modulo of modulosSet) {
      await this.recalcularProgreso(estudianteId, modulo, null, docenteId);
    }
  }
}

module.exports = ProgressService;
