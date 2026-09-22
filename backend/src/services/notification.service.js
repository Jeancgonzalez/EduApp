const User = require('../models/User');
const GroupStudent = require('../models/grupoEstudiante.model');
const { Op } = require('sequelize');
const {
  sendNewContentEmail,
  sendNewEvaluationEmail,
  sendNewGameEmail,
} = require('./mailer.service');

class NotificationService {
  /**
   * Estudiantes vinculados al docente que reciben notificaciones.
   * Si se indica grupoId, solo los estudiantes de ese grupo.
   * Se conserva la validación de correo verificado (emailVerified: true).
   */
  static async _getStudents(docenteId, grupoId = null) {
    let where = {
      role: 'student',
      docente_id: docenteId,
      email: { [Op.ne]: null },
    };

    if (grupoId) {
      const filas = await GroupStudent.findAll({
        where: { grupo_id: grupoId },
        attributes: ['estudiante_id'],
        raw: true,
      });
      const ids = filas.map(f => f.estudiante_id);
      if (ids.length === 0) return [];
      where.id = { [Op.in]: ids };
    }

    const students = await User.findAll({
      where,
      attributes: ['id', 'name', 'email'],
      raw: true,
    });
    console.log(`[Notificación] Estudiantes vinculados encontrados para docente ${docenteId}${grupoId ? ` (grupo ${grupoId})` : ''}: ${students.length}`);
    if (students.length > 0) {
      console.log(`[Notificación] Correos: ${students.map(s => s.email).join(', ')}`);
    }
    return students;
  }

  static async notifyNewContent(docenteId, tituloContenido, modulo, grupoId = null) {
    console.log(`[Notificación] Iniciando notificación de NUEVO CONTENIDO "${tituloContenido}" (módulo: ${modulo}) para docente ${docenteId}`);
    const students = await this._getStudents(docenteId, grupoId);
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

  static async notifyNewEvaluation(docenteId, tituloEvaluacion, modulo, grupoId = null) {
    console.log(`[Notificación] Iniciando notificación de NUEVA EVALUACIÓN "${tituloEvaluacion}" (módulo: ${modulo}) para docente ${docenteId}`);
    const students = await this._getStudents(docenteId, grupoId);
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

  static async notifyNewGame(docenteId, tituloJuego, modulo, grupoId = null) {
    console.log(`[Notificación] Iniciando notificación de NUEVO JUEGO "${tituloJuego}" (módulo: ${modulo}) para docente ${docenteId}`);
    const students = await this._getStudents(docenteId, grupoId);
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
}

module.exports = NotificationService;
