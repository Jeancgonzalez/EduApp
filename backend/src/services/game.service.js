const Game = require('../models/game.model');
const Content = require('../models/content.model');
const StudentProgress = require('../models/studentProgress.model');
const Group = require('../models/grupo.model');
const ProgressService = require('./progress.service');
const NotificationService = require('./notification.service');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

class GameService {
  static async verificarContenidoModuloPublicado(modulo, docenteId, contentId = null) {
    if (contentId) {
      const contenido = await Content.findByPk(contentId);
      if (!contenido || !contenido.publicado) {
        throw new Error('No puedes publicar este juego porque el contenido relacionado no está publicado. Publica primero el contenido para poder publicar el juego.');
      }
      return true;
    }
    if (!modulo) return true;
    const contenidoPublicado = await Content.findOne({
      where: { modulo, docente_id: docenteId, publicado: true },
      attributes: ['id']
    });
    if (contenidoPublicado) return true;

    const existeContenidoModulo = await Content.findOne({
      where: { modulo, docente_id: docenteId },
      attributes: ['id']
    });
    if (existeContenidoModulo) {
      throw new Error('No puedes publicar este juego porque el contenido relacionado no está publicado. Publica primero el contenido para poder publicar el juego.');
    }
    return true;
  }

  static async crearJuego(data) {
    try {
      if (data.publicado) {
        await this.verificarContenidoModuloPublicado(data.modulo, data.docente_id, data.modulo_content_id);
      }
      const nuevoJuego = await Game.create(data);
      if (data.publicado) {
        await NotificationService.notifyNewGame(nuevoJuego.docente_id, nuevoJuego.titulo, nuevoJuego.modulo, data.grupo_id || null).catch(e => {
          console.error('[Notificación] Error global en notifyNewGame (crearJuego):', e.message);
          console.error(e);
        });
      }
      return nuevoJuego;
    } catch (error) {
      throw new Error(`Error al crear el juego: ${error.message}`);
    }
  }

  static parseConfig(juego) {
    if (juego && juego.configuracion && typeof juego.configuracion === 'string') {
      try { juego.configuracion = JSON.parse(juego.configuracion); } catch (e) {}
    }
    return juego;
  }

  static async obtenerJuegos(filtros = {}) {
    try {
      const juegos = await Game.findAll({
        where: filtros,
        include: [{ model: Group, as: 'grupo', attributes: ['id', 'materia', 'nombre'] }]
      });
      return juegos.map(j => this.parseConfig(j));
    } catch (error) {
      throw new Error(`Error al obtener los juegos: ${error.message}`);
    }
  }

  static async obtenerJuegoPorId(id, user = null) {
    try {
      const where = { id };
      if (user && (user.role === 'teacher' || user.role === 'docente')) {
        where.docente_id = user.id;
      } else if (user && (user.role === 'student' || user.role === 'estudiante')) {
        where.docente_id = user.docente_id;
      }
      const juego = await Game.findOne({ where });
      if (!juego) throw new Error('Juego no encontrado');
      return this.parseConfig(juego);
    } catch (error) {
      throw new Error(`Error al obtener el juego: ${error.message}`);
    }
  }

  static async actualizarJuego(id, data, docenteId = null) {
    try {
      const where = { id };
      if (docenteId) where.docente_id = docenteId;
      const juego = await Game.findOne({ where });
      if (!juego) throw new Error('Juego no encontrado');

      const isOnlyPublishChange = Object.keys(data).length === 1 && data.publicado !== undefined;

      if (isOnlyPublishChange) {
        if (data.publicado === true) {
          await this.verificarContenidoModuloPublicado(juego.modulo, juego.docente_id, juego.modulo_content_id);
        }
        const wasPublished = juego.publicado;
        await juego.update({ publicado: data.publicado });
        if (!wasPublished && data.publicado) {
          await NotificationService.notifyNewGame(juego.docente_id, juego.titulo, juego.modulo, juego.grupo_id || null).catch(e => {
            console.error('[Notificación] Error global en notifyNewGame (actualizarJuego-publish):', e.message);
            console.error(e);
          });
        }
        if (wasPublished && !data.publicado && juego.modulo) {
          const affectedStudents = await StudentProgress.findAll({
            where: { juego_id: id },
            attributes: ['estudiante_id'],
            group: ['estudiante_id'],
            raw: true
          });
          for (const s of affectedStudents) {
            await ProgressService.recalcularProgreso(s.estudiante_id, juego.modulo, null, juego.docente_id);
          }
        }
        return juego;
      }

      if (juego.publicado) {
        throw new Error('No se puede modificar este juego porque ya está publicado.');
      }

      if (data.publicado === true) {
        await this.verificarContenidoModuloPublicado(
          data.modulo !== undefined ? data.modulo : juego.modulo,
          juego.docente_id,
          data.modulo_content_id !== undefined ? data.modulo_content_id : juego.modulo_content_id
        );
      }

      await juego.update(data);
      if (data.publicado === true) {
        await NotificationService.notifyNewGame(juego.docente_id, juego.titulo, juego.modulo, juego.grupo_id || null).catch(e => {
          console.error('[Notificación] Error global en notifyNewGame (actualizarJuego-update):', e.message);
          console.error(e);
        });
      }
      return juego;
    } catch (error) {
      throw new Error(`Error al actualizar el juego: ${error.message}`);
    }
  }

  static async eliminarJuego(id, docenteId = null) {
    const t = await sequelize.transaction();
    try {
      const where = { id };
      if (docenteId) where.docente_id = docenteId;
      const juego = await Game.findOne({ where, transaction: t });
      if (!juego) throw new Error('Juego no encontrado');
      if (juego.publicado) {
        throw new Error('publicado: No se puede eliminar este juego porque ya está publicado.');
      }

      const modulo = juego.modulo;

      const affectedStudents = await StudentProgress.findAll({
        where: { juego_id: id },
        attributes: ['estudiante_id'],
        group: ['estudiante_id'],
        raw: true,
        transaction: t
      });

      await StudentProgress.destroy({
        where: { juego_id: id },
        transaction: t
      });

      await juego.destroy({ transaction: t });

      if (modulo && affectedStudents.length > 0) {
        const estudianteIds = affectedStudents.map(s => s.estudiante_id);
        for (const estudianteId of estudianteIds) {
          await ProgressService.recalcularProgreso(estudianteId, modulo, t, juego.docente_id);
        }
      }

      await t.commit();

      return { modulo, affectedCount: affectedStudents.length };
    } catch (error) {
      await t.rollback();
      throw new Error(`Error al eliminar el juego: ${error.message}`);
    }
  }

  static async responderJuego(juegoId, datosIntento) {
    try {
      const juego = await Game.findByPk(juegoId);
      if (!juego) throw new Error('Juego no encontrado');

      let puntajeFinal = 0;
      if (datosIntento.puntaje_obtenido !== undefined) {
        puntajeFinal = Number(datosIntento.puntaje_obtenido);
        if (puntajeFinal > juego.puntaje_max) puntajeFinal = juego.puntaje_max;
      }

      return {
        juego_id: juego.id,
        titulo: juego.titulo,
        tipo: juego.tipo,
        puntaje_maximo: juego.puntaje_max,
        puntaje_obtenido: puntajeFinal,
        porcentaje_logro: Math.round((puntajeFinal / juego.puntaje_max) * 100),
        detalles: datosIntento
      };
    } catch (error) {
      throw new Error(`Error al procesar el resultado del juego: ${error.message}`);
    }
  }
}

module.exports = GameService;
