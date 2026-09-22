const User = require('../models/User');
const Content = require('../models/content.model');
const Game = require('../models/game.model');
const Evaluation = require('../models/evaluation.model');
const StudentProgress = require('../models/studentProgress.model');
const StudentService = require('./student.service');
const { sendProgressReportEmail } = require('./mailer.service');

const escapar = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class ReportService {
  /**
   * Genera un reporte de progreso por módulo para el estudiante, reutilizando la
   * lógica de progreso existente de EduApp (mismo tope por actividad, mejores puntajes,
   * y porcentaje por módulo calculado con _getModuleProgress).
   *
   * @param {number} estudianteId - ID real del estudiante (desde el token/BD, no del frontend).
   * @param {number} docenteId - ID real del docente autenticado.
   */
  static async buildReport(estudianteId, docenteId) {
    const student = await User.findOne({
      where: { id: estudianteId, role: 'student', docente_id: docenteId },
      attributes: ['id', 'name', 'email', 'emailVerified'],
      raw: true,
    });
    if (!student) {
      throw new Error('El estudiante no existe o no pertenece a este docente.');
    }

    // 1. Progreso detallado ya calculado con la lógica existente (incluye por módulo).
    const detailed = await StudentService.getDetailedProgress(estudianteId, docenteId);

    // 2. Datos actuales publicados por el docente (solo actividades vigentes).
    const [allContents, allGames, allEvaluations] = await Promise.all([
      Content.findAll({ where: { publicado: true, docente_id: docenteId }, raw: true }),
      Game.findAll({ where: { publicado: true, docente_id: docenteId }, raw: true }),
      Evaluation.findAll({ where: { publicado: true, docente_id: docenteId }, raw: true }),
    ]);

    const contentById = new Map(allContents.map(c => [c.id, c]));
    const gameById = new Map(allGames.map(g => [g.id, g]));
    const evalById = new Map(allEvaluations.map(e => [e.id, e]));

    // Agrupar por módulo.
    const modules = new Map(); // modulo -> { contents: [], games: [], evals: [], progress }
    for (const c of allContents) {
      if (!c.modulo) continue;
      if (!modules.has(c.modulo)) modules.set(c.modulo, { contents: [], games: [], evals: [] });
      modules.get(c.modulo).contents.push(c);
    }
    for (const g of allGames) {
      if (!g.modulo) continue;
      if (!modules.has(g.modulo)) modules.set(g.modulo, { contents: [], games: [], evals: [] });
      modules.get(g.modulo).games.push(g);
    }
    for (const e of allEvaluations) {
      if (!e.modulo) continue;
      if (!modules.has(e.modulo)) modules.set(e.modulo, { contents: [], games: [], evals: [] });
      modules.get(e.modulo).evals.push(e);
    }

    // Progreso calculado por módulo (porcentaje exacto de EduApp).
    const progressByModule = new Map(detailed.progressByModule.map(p => [p.modulo, p]));

    // Registros completados (mayor puntaje por actividad).
    const records = await StudentProgress.findAll({
      where: { estudiante_id: estudianteId, completado: true },
      raw: true,
    });
    const best = StudentService._deduplicateProgress(records);

    const byContent = new Map();
    const byGame = new Map();
    const byEval = new Map();
    for (const r of best) {
      if (r.contenido_id) byContent.set(r.contenido_id, r);
      else if (r.juego_id) byGame.set(r.juego_id, r);
      else if (r.evaluacion_id) byEval.set(r.evaluacion_id, r);
    }

    // Construir el conjunto de módulos del reporte (solo módulos con actividades publicadas vigentes).
    const modulesHtml = [];
    let completadas = 0;
    let totalItems = 0;
    let mgaSum = 0; // suma de porcentajes por módulo
    let mgaCount = 0;

    for (const [modulo, data] of modules) {
      const modTotal = data.contents.length + data.games.length + data.evals.length;
      totalItems += modTotal;

      const contentsRows = [];
      for (const c of data.contents) {
        const rec = byContent.get(c.id);
        const estado = rec ? 'Completado' : 'Pendiente';
        if (rec) completadas++;
        contentsRows.push(`
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 12px; color:#111827;">${rec ? '&#10003;' : '&#9679;'} ${escapar(c.titulo)}</td>
            <td style="padding:8px 12px; text-align:right; color:${rec ? '#16a34a' : '#9ca3af'};">${estado}</td>
          </tr>`);
      }

      const gamesRows = [];
      for (const g of data.games) {
        const rec = byGame.get(g.id);
        if (rec) completadas++;
        const puntaje = rec ? Math.round((rec.puntaje / (g.puntaje_max || 100)) * 100) : null;
        const pct = rec ? `${puntaje}/100` : 'Pendiente';
        gamesRows.push(`
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 12px; color:#111827;">${rec ? '&#10003;' : '&#9679;'} ${escapar(g.titulo)}</td>
            <td style="padding:8px 12px; text-align:right; color:${rec ? '#16a34a' : '#9ca3af'};">${pct}</td>
          </tr>`);
      }

      const evalsRows = [];
      for (const e of data.evals) {
        const rec = byEval.get(e.id);
        if (rec) completadas++;
        const pct = rec ? `${rec.puntaje}/100` : 'Pendiente';
        evalsRows.push(`
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 12px; color:#111827;">${rec ? '&#10003;' : '&#9679;'} ${escapar(e.titulo)}</td>
            <td style="padding:8px 12px; text-align:right; color:${rec ? '#16a34a' : '#9ca3af'};">${pct}</td>
          </tr>`);
      }

      const prog = progressByModule.get(modulo);
      const porcentajeModulo = prog ? prog.porcentaje_avance : 0;
      mgaSum += porcentajeModulo;
      mgaCount++;

      const section = (title, rows) =>
        rows.length > 0
          ? `<h4 style="margin:16px 0 8px; color:#2563eb; text-transform:uppercase; font-size:13px;">${title}</h4>
             <table style="width:100%; border-collapse:collapse; font-size:14px;">${rows.join('')}</table>`
          : '';

      modulesHtml.push(`
        <div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:16px;">
          <h3 style="margin:0 0 4px; color:#111827;">${escapar(modulo)}</h3>
          ${section('Contenidos', contentsRows)}
          ${section('Evaluaciones', evalsRows)}
          ${section('Juegos', gamesRows)}
          <div style="background:#eff6ff; border-radius:6px; padding:8px 12px; margin-top:12px;">
            <p style="margin:0; color:#2563eb; font-weight:700;">Progreso del módulo: ${porcentajeModulo}%</p>
          </div>
        </div>`);
    }

    const overallProgress = mgaCount > 0 ? Math.round(mgaSum / mgaCount) : 0;
    const actividadesPendientes = totalItems - completadas;

    const modulesSection = modulesHtml.length > 0
      ? modulesHtml.join('')
      : '<p style="color:#9ca3af;">Este estudiante aún no tiene actividades publicadas por el docente.</p>';

    return {
      studentName: student.name,
      email: student.email,
      emailVerified: student.emailVerified,
      modulesHtml,
      overallProgress,
      completadas,
      actividadesPendientes,
      totalItems,
      raw: {
        student,
        detailed,
      },
    };
  }

  static async sendReport(estudianteId, docenteId) {
    const t0 = Date.now();
    const report = await ReportService.buildReport(estudianteId, docenteId);
    const tBuild = Date.now() - t0;
    console.log(`[Reporte] buildReport en ${tBuild}ms para estudiante ${estudianteId} (${report.studentName})`);

    if (!report.email) {
      throw new Error('El estudiante no tiene un correo electrónico registrado para recibir el reporte.');
    }

    const fecha = new Date().toLocaleDateString('es-ES', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const modulesHtml = report.modulesHtml.join('');

    const t1 = Date.now();
    await sendProgressReportEmail(
      report.studentName,
      report.email,
      fecha,
      modulesHtml,
      report.overallProgress
    );
    const tMail = Date.now() - t1;
    console.log(`[Reporte] Envío de email en ${tMail}ms. TOTAL del reporte: ${Date.now() - t0}ms.`);

    return {
      email: report.email,
      studentName: report.studentName,
      overallProgress: report.overallProgress,
    };
  }

  /**
   * Envía el reporte de progreso a todos los estudiantes con correo verificado
   * vinculados al docente. Los estudiantes sin correo verificado se omiten sin
   * detener el proceso. Devuelve el conteo de éxitos/fallos/omitidos.
   *
   * @param {number} docenteId - ID del docente autenticado.
   */
  static async sendBulkReports(docenteId) {
    const students = await User.findAll({
      where: { role: 'student', docente_id: docenteId, emailVerified: true },
      attributes: ['id', 'name', 'email'],
      raw: true,
    });
    console.log(`[Reporte] Envío masivo iniciado: ${students.length} estudiantes con correo verificado para docente ${docenteId}`);

    let enviados = 0;
    let fallidos = 0;
    const fallas = [];

    for (const student of students) {
      try {
        await ReportService.sendReport(student.id, docenteId);
        enviados++;
        console.log(`[Reporte] ✅ Reporte enviado a ${student.email} (${student.name})`);
      } catch (err) {
        fallidos++;
        fallas.push({ email: student.email, error: err.message });
        console.error(`[Reporte] ❌ Fallo el reporte a ${student.email}:`, err.message);
      }
    }

    console.log(`[Reporte] Envío masivo finalizado: ${enviados} enviados, ${fallidos} fallidos de ${students.length} totales`);
    return {
      total: students.length,
      enviados,
      fallidos,
      fallas,
    };
  }
}

module.exports = ReportService;
