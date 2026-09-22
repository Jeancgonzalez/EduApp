const Content = require('../models/content.model');
const Evaluation = require('../models/evaluation.model');
const Game = require('../models/game.model');
const StudentProgress = require('../models/studentProgress.model');
const Group = require('../models/grupo.model');
const ProgressService = require('./progress.service');
const NotificationService = require('./notification.service');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

class ContentService {
  static async crearContenido(data) {
    try {
      const nuevoContenido = await Content.create(data);
      if (data.publicado) {
        await NotificationService.notifyNewContent(data.docente_id, nuevoContenido.titulo, nuevoContenido.modulo, data.grupo_id || null).catch(e => {
          console.error('[Notificación] Error global en notifyNewContent (crearContenido):', e.message);
          console.error(e);
        });
      }
      return nuevoContenido;
    } catch (error) {
      throw new Error(`Error al crear el contenido: ${error.message}`);
    }
  }

  static async obtenerContenidos(filtros = {}) {
    try {
      return await Content.findAll({
        where: filtros,
        include: [{ model: Group, as: 'grupo', attributes: ['id', 'materia', 'nombre'] }]
      });
    } catch (error) {
      throw new Error(`Error al obtener los contenidos: ${error.message}`);
    }
  }

  static async obtenerContenidoPorId(id) {
    try {
      const contenido = await Content.findByPk(id);
      if (!contenido) throw new Error('Contenido no encontrado');
      return contenido;
    } catch (error) {
      throw new Error(`Error al obtener el contenido: ${error.message}`);
    }
  }

  static async actualizarContenido(id, data, docenteId = null) {
    try {
      const where = { id };
      if (docenteId) where.docente_id = docenteId;
      const contenido = await Content.findOne({ where });
      if (!contenido) throw new Error('Contenido no encontrado');
      if (contenido.publicado) {
        const isOnlyPublishChange = Object.keys(data).length === 1 && data.publicado !== undefined;
        if (isOnlyPublishChange) {
          const wasPublished = contenido.publicado;
          await contenido.update({ publicado: data.publicado });
          if (wasPublished && !data.publicado) {
            await Evaluation.update(
              { publicado: false },
              { where: { contenido_apoyo_id: id, publicado: true } }
            );

            const relacionWhere = { publicado: true };
            if (contenido.modulo) {
              relacionWhere[Op.or] = [
                { modulo_content_id: id },
                { modulo: contenido.modulo }
              ];
            } else {
              relacionWhere.modulo_content_id = id;
            }

            const juegosRelacionados = await Game.findAll({ where: relacionWhere, attributes: ['id', 'modulo'], raw: true });
            const evaluacionesRelacionadas = await Evaluation.findAll({ where: relacionWhere, attributes: ['id', 'modulo'], raw: true });

            await Game.update({ publicado: false }, { where: relacionWhere });
            await Evaluation.update({ publicado: false }, { where: relacionWhere });

            const modulosAfectados = new Set();
            if (contenido.modulo) modulosAfectados.add(contenido.modulo);
            for (const g of juegosRelacionados) if (g.modulo) modulosAfectados.add(g.modulo);
            for (const e of evaluacionesRelacionadas) if (e.modulo) modulosAfectados.add(e.modulo);

            const juegoIds = juegosRelacionados.map(g => g.id);
            const evaluacionIds = evaluacionesRelacionadas.map(e => e.id);
            const orCondiciones = [];
            if (juegoIds.length > 0) orCondiciones.push({ juego_id: { [Op.in]: juegoIds } });
            if (evaluacionIds.length > 0) orCondiciones.push({ evaluacion_id: { [Op.in]: evaluacionIds } });

            if (orCondiciones.length > 0) {
              const affectedStudents = await StudentProgress.findAll({
                where: { [Op.or]: orCondiciones },
                attributes: ['estudiante_id'],
                group: ['estudiante_id'],
                raw: true
              });
              for (const s of affectedStudents) {
                for (const mod of modulosAfectados) {
                  await ProgressService.recalcularProgreso(s.estudiante_id, mod, null, contenido.docente_id);
                }
              }
            }

            if (contenido.modulo) {
              const affectedContentStudents = await StudentProgress.findAll({
                where: { contenido_id: id },
                attributes: ['estudiante_id'],
                group: ['estudiante_id'],
                raw: true
              });
              for (const s of affectedContentStudents) {
                await ProgressService.recalcularProgreso(s.estudiante_id, contenido.modulo, null, contenido.docente_id);
              }
            }
          }
          return contenido;
        }
        throw new Error('publicado: No se puede modificar este contenido porque ya está publicado.');
      }
      const estabaPublicado = contenido.publicado;
      await contenido.update(data);
      if (data.publicado === true && !estabaPublicado) {
        await NotificationService.notifyNewContent(contenido.docente_id, contenido.titulo, contenido.modulo, contenido.grupo_id || null).catch(e => {
          console.error('[Notificación] Error global en notifyNewContent (actualizarContenido):', e.message);
          console.error(e);
        });
      }
      return contenido;
    } catch (error) {
      throw new Error(`Error al actualizar el contenido: ${error.message}`);
    }
  }

  static async eliminarContenido(id, docenteId = null) {
    try {
      const where = { id };
      if (docenteId) where.docente_id = docenteId;
      const contenido = await Content.findOne({ where });
      if (!contenido) throw new Error('Contenido no encontrado');
      if (contenido.publicado) {
        throw new Error('publicado: No se puede eliminar este contenido porque ya está publicado.');
      }

      await Evaluation.update(
        { publicado: false, contenido_apoyo_id: null },
        { where: { contenido_apoyo_id: id } }
      );

      const modulo = contenido.modulo;
      const affectedStudents = await StudentProgress.findAll({
        where: { contenido_id: id },
        attributes: ['estudiante_id'],
        group: ['estudiante_id'],
        raw: true
      });

      await StudentProgress.destroy({ where: { contenido_id: id } });
      await contenido.destroy();

      if (modulo && affectedStudents.length > 0) {
        for (const s of affectedStudents) {
          await ProgressService.recalcularProgreso(s.estudiante_id, modulo, null, contenido.docente_id);
        }
      }

      return true;
    } catch (error) {
      throw new Error(`Error al eliminar el contenido: ${error.message}`);
    }
  }
}
module.exports = ContentService;
