const User = require('../models/User');
const GroupStudent = require('../models/grupoEstudiante.model');
const Notification = require('../models/notification.model');
const { Op } = require('sequelize');
const {
  sendNewContentEmail,
  sendNewEvaluationEmail,
  sendNewGameEmail,
  sendProgressReportEmail,
} = require('./mailer.service');

class NotificationService {
  /**
   * Estudiantes vinculados al docente que reciben notificaciones.
   * Si se indican grupoIds, solo los estudiantes de esos grupos (unión, sin duplicados).
   * Si se omite o va vacío, se notifica a todos los estudiantes del docente.
   * Se conserva la validación de correo verificado (emailVerified: true).
   */
  static async _getStudents(docenteId, grupoIds = null) {
    const where = {
      role: 'student',
      docente_id: docenteId,
      email: { [Op.ne]: null },
    };

    const ids = (Array.isArray(grupoIds) ? grupoIds : grupoIds ? [grupoIds] : [])
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0);

    const detalle = ids.length ? ` (grupos: ${[...new Set(ids)].join(', ')})` : ' (todos los grupos)';

    if (ids.length > 0) {
      const filas = await GroupStudent.findAll({
        where: { grupo_id: { [Op.in]: [...new Set(ids)] } },
        attributes: ['estudiante_id'],
        raw: true,
      });
      // Un Set evita duplicar al estudiante que pertenece a varios grupos a la vez.
      const studentIds = [...new Set(filas.map((f) => f.estudiante_id))];
      if (studentIds.length === 0) return [];
      where.id = { [Op.in]: studentIds };
    }

    const students = await User.findAll({
      where,
      attributes: ['id', 'name', 'email'],
      raw: true,
    });
    console.log(`[Notificación] Estudiantes vinculados encontrados para docente ${docenteId}${detalle}: ${students.length}`);
    if (students.length > 0) {
      console.log(`[Notificación] Correos: ${students.map(s => s.email).join(', ')}`);
    }
    return students;
  }

  static async notifyNewContent(docenteId, tituloContenido, modulo, grupoIds = null) {
    console.log(`[Notificación] Iniciando notificación de NUEVO CONTENIDO "${tituloContenido}" (módulo: ${modulo}) para docente ${docenteId}`);
    const students = await this._getStudents(docenteId, grupoIds);
    if (students.length === 0) {
      console.log('[Notificación] No hay estudiantes vinculados. No se envían correos.');
      return [];
    }

    const results = [];
    for (const s of students) {
      try {
        console.log(`[Notificación] Enviando email de nuevo contenido a ${s.email} (${s.name})...`);
        const res = await sendNewContentEmail(s.name, s.email, tituloContenido, modulo);
        console.log(`[Notificación] ✅ Email enviado exitosamente a ${s.email}`);
        results.push({ estudiante_id: s.id, exito: true, ...res });
      } catch (err) {
        console.error(`[Notificación] ❌ Error enviando email de contenido a ${s.email}:`, err.message);
        console.error(err);
        results.push({ estudiante_id: s.id, exito: false, error: err.message });
      }
    }

    const exitosos = results.filter(r => r.exito).length;
    const fallidos = results.filter(r => !r.exito).length;
    console.log(`[Notificación] Resumen notificación de contenido: ${exitosos} exitosos, ${fallidos} fallidos de ${students.length} totales`);
    return results;
  }

  static async notifyNewEvaluation(docenteId, tituloEvaluacion, modulo, grupoIds = null) {
    console.log(`[Notificación] Iniciando notificación de NUEVA EVALUACIÓN "${tituloEvaluacion}" (módulo: ${modulo}) para docente ${docenteId}`);
    const students = await this._getStudents(docenteId, grupoIds);
    if (students.length === 0) {
      console.log('[Notificación] No hay estudiantes vinculados. No se envían correos.');
      return [];
    }

    const results = [];
    for (const s of students) {
      try {
        console.log(`[Notificación] Enviando email de nueva evaluación a ${s.email} (${s.name})...`);
        const res = await sendNewEvaluationEmail(s.name, s.email, tituloEvaluacion, modulo);
        console.log(`[Notificación] ✅ Email enviado exitosamente a ${s.email}`);
        results.push({ estudiante_id: s.id, exito: true, ...res });
      } catch (err) {
        console.error(`[Notificación] ❌ Error enviando email de evaluación a ${s.email}:`, err.message);
        console.error(err);
        results.push({ estudiante_id: s.id, exito: false, error: err.message });
      }
    }

    const exitosos = results.filter(r => r.exito).length;
    const fallidos = results.filter(r => !r.exito).length;
    console.log(`[Notificación] Resumen notificación de evaluación: ${exitosos} exitosos, ${fallidos} fallidos de ${students.length} totales`);
    return results;
  }

  static async notifyNewGame(docenteId, tituloJuego, modulo, grupoIds = null) {
    console.log(`[Notificación] Iniciando notificación de NUEVO JUEGO "${tituloJuego}" (módulo: ${modulo}) para docente ${docenteId}`);
    const students = await this._getStudents(docenteId, grupoIds);
    if (students.length === 0) {
      console.log('[Notificación] No hay estudiantes vinculados. No se envían correos.');
      return [];
    }

    const results = [];
    for (const s of students) {
      try {
        console.log(`[Notificación] Enviando email de nuevo juego a ${s.email} (${s.name})...`);
        const res = await sendNewGameEmail(s.name, s.email, tituloJuego, modulo);
        console.log(`[Notificación] ✅ Email enviado exitosamente a ${s.email}`);
        results.push({ estudiante_id: s.id, exito: true, ...res });
      } catch (err) {
        console.error(`[Notificación] ❌ Error enviando email de juego a ${s.email}:`, err.message);
        console.error(err);
        results.push({ estudiante_id: s.id, exito: false, error: err.message });
      }
    }

    const exitosos = results.filter(r => r.exito).length;
    const fallidos = results.filter(r => !r.exito).length;
    console.log(`[Notificación] Resumen notificación de juego: ${exitosos} exitosos, ${fallidos} fallidos de ${students.length} totales`);
    return results;
  }

  /**
   * Notificación interna del docente (lo que ve en la campana).
   *
   * `data` lleva el `run_id` para que el clic lleve directo al reporte, así que
   * aquí solo se guarda: el archivo se genera bajo demanda y no se adjunta.
   */
  static async notificarReporte({ docenteId, titulo, mensaje, data = {} }) {
    const fila = await Notification.create({
      docente_id: docenteId,
      tipo: 'reporte',
      titulo,
      mensaje: mensaje || null,
      data: JSON.stringify(data),
      leido: false,
    });
    console.log(`[Notificación] Guardada notificación de reporte para docente ${docenteId}`);
    return fila;
  }

  /**
   * Entrada que usa el reporte individual por estudiante. Delega en
   * `notificarReporte` para que las dos rutas escriban el mismo tipo de
   * notificación en vez de dos formatos distintos que la campana no sabría leer.
   */
  static async sendReportNotification(docenteId, estudianteId, scheduleId, format, sections, trigger) {
    return this.notificarReporte({
      docenteId,
      titulo: 'Reporte de progreso',
      mensaje: 'Se ha generado y enviado un reporte de progreso para un estudiante',
      data: {
        run_id: null,
        schedule_id: scheduleId ?? null,
        estudiante_id: estudianteId ?? null,
        format,
        sections,
        trigger,
      },
    });
  }
}

module.exports = NotificationService;
