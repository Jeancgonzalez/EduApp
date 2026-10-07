const User = require('../models/User');
const Content = require('../models/content.model');
const Game = require('../models/game.model');
const Evaluation = require('../models/evaluation.model');
const StudentProgress = require('../models/studentProgress.model');
const Group = require('../models/grupo.model');
const StudentService = require('./student.service');
const DashboardService = require('./dashboard.service');
const { sendProgressReportEmail } = require('./mailer.service');
const { nivelDeDesempeno } = require('./dashboard.definiciones');

const escapar = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Nombres legibles de las secciones, en el orden del catálogo de reportes. */
const ETIQUETAS_SECCIONES = {
  resumen: 'Resumen general',
  grupo: 'Vista de grupo',
  estudiantes: 'Progreso por estudiante',
  temas: 'Progreso por curso',
};

class ReportService {
  /**
   * Genera un reporte de progreso por módulo para el estudiante, reutilizando la
   * lógica de progreso existente de EduApp (mismo tope por actividad, mejores puntajes,
   * y porcentaje por módulo calculado con _getModuleProgress).
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

    const detailed = await StudentService.getDetailedProgress(estudianteId, docenteId);

    const [allContents, allGames, allEvaluations] = await Promise.all([
      Content.findAll({ where: { publicado: true, docente_id: docenteId }, raw: true }),
      Game.findAll({ where: { publicado: true, docente_id: docenteId }, raw: true }),
      Evaluation.findAll({ where: { publicado: true, docente_id: docenteId }, raw: true }),
    ]);

    const modules = new Map();
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

    const progressByModule = new Map(detailed.progressByModule.map(p => [p.modulo, p]));

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

    const modulesHtml = [];
    let completadas = 0;
    let totalItems = 0;
    let mgaSum = 0;
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

    return {
      studentName: student.name,
      email: student.email,
      emailVerified: student.emailVerified,
      modulesHtml,
      overallProgress,
      completadas,
      actividadesPendientes,
      totalItems,
      raw: { student, detailed },
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
        console.log(`[Reporte] OK Reporte enviado a ${student.email} (${student.name})`);
      } catch (err) {
        fallidos++;
        fallas.push({ email: student.email, error: err.message });
        console.error(`[Reporte] FALLO el reporte a ${student.email}:`, err.message);
      }
    }

    console.log(`[Reporte] Envío masivo finalizado: ${enviados} enviados, ${fallidos} fallidos de ${students.length} totales`);
    return { total: students.length, enviados, fallidos, fallas };
  }

  /* ------------------------------------------------------------------ *
   *  Reporte analítico programado (PDF / CSV)
   * ------------------------------------------------------------------ */

  static _formatear(valor) {
    if (valor === null || valor === undefined || valor === '') return '—';
    if (typeof valor === 'object') {
      console.error('[Reportes] Celda con objeto inesperado; se muestra "—":', JSON.stringify(valor));
      return '—';
    }
    if ((typeof valor === 'number' && Number.isNaN(valor)) || valor === 'NaN' || valor === 'undefined') {
      console.error('[Reportes] Celda con valor no numérico; se muestra "—":', String(valor));
      return '—';
    }
    return String(valor);
  }

  static _celda(valor) {
    return this._formatear(valor);
  }

  static _pct(valor) {
    if (valor === null || valor === undefined || valor === '') return '—';
    if (typeof valor === 'object' || (typeof valor === 'number' && Number.isNaN(valor))) {
      console.error('[Reportes] Porcentaje con objeto o NaN; se muestra "—":', JSON.stringify(valor));
      return '—';
    }
    return `${valor}%`;
  }

  /** Pluraliza una etiqueta según el conteo: `_plural(1, 'estudiante')` → 'estudiante'. */
  static _plural(cantidad, singular) {
    const n = Number(cantidad);
    return `${n} ${n === 1 ? singular : `${singular}s`}`;
  }

  /**
   * Alias visible en el reporte. La plataforma no tiene un alias independiente:
   * muestra `users.name` (dashboard.definiciones.js). Por privacidad el reporte
   * abrevia a primer nombre + inicial ("Andrés M.") salvo que el docente active
   * la opción "Incluir nombres".
   */
  static _aliasVisible(nombre, incluirNombres) {
    const limpio =
      typeof nombre === 'string' && nombre.trim()
        ? nombre.trim()
        : nombre != null && typeof nombre !== 'object'
          ? String(nombre).trim()
          : '';
    const base = limpio || 'Estudiante sin alias';
    if (incluirNombres) return base;
    const partes = base.split(/\s+/).filter(Boolean);
    if (partes.length === 1) return partes[0];
    return `${partes[0]} ${(partes[1][0] || '').toLocaleUpperCase('es')}.`;
  }

  /** Nota de privacidad según la opción "Incluir nombres". */
  static _notaPrivada(incluirNombres) {
    return incluirNombres
      ? 'Se muestran los nombres completos por la opción "Incluir nombres" activada; el reporte nunca lleva correos.'
      : 'Solo alias (nombre abreviado); el reporte nunca lleva correos ni nombre completo.';
  }

  /** Nombre del docente sin el "Docente" inicial redundante ("Docente Demo Gra" → "Demo Gra"). */
  static _nombreDocente(nombre) {
    return String(nombre || '—')
      .replace(/^Docente\s+/i, '')
      .trim() || '—';
  }

  static _leyendaUmbrales(umbrales) {
    if (!umbrales) return '';
    const niveles = (umbrales.niveles || [])
      .slice()
      .sort((a, b) => b.minimo - a.minimo)
      .map((n) => `${n.nivel} desde ${n.minimo}%`)
      .join(', ');
    const riesgo = umbrales.riesgo
      ? `En riesgo: por debajo de ${umbrales.riesgo.pct_max}% o ${umbrales.riesgo.dias_sin_ingresar} días sin ingresar.`
      : '';
    return [niveles, riesgo].filter(Boolean).join('. ');
  }

  /**
   * Normaliza la lista de "estudiantes en riesgo" y devuelve filas listas para
   * la tabla del PDF/CSV. Tolera las formas que pueda traer el DashboardService
   * y las de los runs viejos (array de objetos, un objeto único, e incluso la
   * forma legacy en que la celda venía con `alias` = objeto completo).
   *
   * Orden por gravedad: primero el % más bajo (con dato), y a empate el que más
   * días lleva sin ingresar. Se recorta a `max` filas y se avisa cuántas
   * quedaron fuera.
   *
   * @returns {{filas: Array, total: number, truncado: boolean}}
   */
  static _filasRiesgo(aliases, { max = 15, umbralesU = null } = {}) {
    const crudos = Array.isArray(aliases)
      ? aliases
      : aliases
        ? [aliases]
        : [];

    const riesgoU = (umbralesU && umbralesU.riesgo) || null;

    const filas = crudos
      .map((item) => {
        if (item == null) return null;
        // Legacy: el objeto completo venía dentro del campo `alias`.
        const crudo =
          typeof item === 'object' && item.alias && typeof item.alias === 'object'
            ? item.alias
            : item;
        if (crudo == null || typeof crudo !== 'object') return null;

        const nombre =
          crudo.alias ??
          crudo.alias_estudiante ??
          crudo.nombre ??
          crudo.name ??
          crudo.estudiante ??
          null;
        if (nombre && typeof nombre === 'object') return null;

        const pctCrudo =
          crudo.pct ?? crudo.progreso ?? crudo.progreso_pct ?? crudo.porcentaje ?? null;
        const pct = pctCrudo == null ? null : Math.round(Number(pctCrudo));

        const diasCrudo =
          crudo.dias_sin_ingresar ?? crudo.dias ?? crudo.dias_sin_conectar ?? null;
        const dias = diasCrudo == null ? null : Number(diasCrudo);

        let motivo = crudo.motivo_texto ?? crudo.motivo ?? null;
        if (!motivo && riesgoU && (pct != null || dias != null)) {
          const bajo = pct != null && pct < Number(riesgoU.pct_max);
          const inactivo = dias != null && dias >= Number(riesgoU.dias_sin_ingresar);
          motivo = bajo && inactivo
            ? 'Bajo nivel de desempeño y sin ingresar'
            : inactivo
              ? 'Sin ingresar'
              : bajo
                ? 'Bajo nivel de desempeño'
                : null;
        }

        return {
          alias: typeof nombre === 'string' ? nombre.trim() : this._formatear(nombre),
          nivel: crudo.nivel ?? crudo.nivel_desempeno ?? crudo.nivel_desempeño ?? nivelDeDesempeno(pct) ?? '—',
          pct,
          dias,
          motivo: motivo || '—',
        };
      })
      .filter(Boolean);

    filas.sort((a, b) => {
      if ((a.pct == null) !== (b.pct == null)) return a.pct == null ? 1 : -1;
      if (a.pct != null && b.pct != null && a.pct !== b.pct) return a.pct - b.pct;
      return (b.dias ?? -1) - (a.dias ?? -1);
    });

    const recorte = Math.max(1, Number(max) || 1);
    const truncado = filas.length > recorte;
    return { filas: filas.slice(0, recorte), total: filas.length, truncado };
  }

  /**
   * "Sanea" un snapshot guardado por versiones viejas del módulo para que la
   * descarga de un run antiguo salga con el mismo formato que uno nuevo:
   *  - KPIs con separador `·` (U+00B7, glifo vacío en pdfkit) → ` | `.
   *  - Tabla `riesgo` con 1 sola columna y celdas-objeto → se reconstruye con
   *    las 5 columnas estándar (Alias, Nivel, Progreso, Días, Motivo).
   *  - Tabla `grupos` de 1 sola fila (comparación colapsada por filtro) → se elimina.
   *  - `secciones_etiquetas`, `notas` e `incluir_nombres` ausentes → por defecto.
   */
  static _sanearSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    const limpio = JSON.parse(JSON.stringify(snapshot));

    const rePunto = /\s*\u00b7\s*/g;
    const UNIDADES_LEGACY = {
      Participación: 'pp',
      'Progreso medio': 'pp',
      'Estudiantes en riesgo': 'estudiantes',
      'XP promedio': 'XP',
      Activos: 'pp',
    };
    const pluralizarNota = (texto) =>
      String(texto).replace(/(\d+)\s+estudiante\(s\)/g, (_, n) => this._plural(n, 'estudiante'));

    for (const k of limpio.kpis || []) {
      if (!k) continue;
      if (typeof k.detalle === 'string') {
        k.detalle = k.detalle.replace(rePunto, ' | ').trim();
        const unidad = UNIDADES_LEGACY[k.etiqueta];
        if (unidad && unidad !== 'pp') {
          k.detalle = k.detalle.replace(' pp vs.', ` ${unidad} vs.`);
        }
      }
      if (typeof k.valor === 'string') k.valor = k.valor.replace(rePunto, ' | ');
    }

    const tablaRiesgo = (limpio.tablas || []).find((t) => t && t.clave === 'riesgo');
    if (tablaRiesgo) {
      const antiguo = !(tablaRiesgo.columnas || []).some((c) => c.clave === 'motivo');
      if (antiguo) {
        const cantPrevia = Array.isArray(tablaRiesgo.filas) ? tablaRiesgo.filas.length : 0;
        const { filas } = this._filasRiesgo(tablaRiesgo.filas, {
          max: 15,
          umbralesU: limpio.umbrales,
        });
        const restantes = Math.max(0, cantPrevia - filas.length);
        tablaRiesgo.columnas = [
          { clave: 'alias', etiqueta: 'Alias' },
          { clave: 'nivel', etiqueta: 'Nivel' },
          { clave: 'pct', etiqueta: 'Progreso', alinear: 'derecha' },
          { clave: 'dias', etiqueta: 'Días sin ingresar', alinear: 'derecha' },
          { clave: 'motivo', etiqueta: 'Motivo' },
        ];
        tablaRiesgo.filas = filas.map((f) => ({
          alias: this._aliasVisible(f.alias, limpio.incluir_nombres),
          nivel: this._formatear(f.nivel),
          pct: f.pct == null ? '—' : `${f.pct}%`,
          dias: f.dias == null ? '—' : `${f.dias} d`,
          motivo: this._formatear(f.motivo),
        }));
        tablaRiesgo.nota =
          restantes > 0
            ? `Se listan los ${filas.length} casos de mayor riesgo y ${restantes} estudiante${restantes === 1 ? '' : 's'} más quedan en riesgo.`
            : null;
      }
    }

    limpio.tablas = (limpio.tablas || []).filter(
      (t) => !(t && t.clave === 'grupos' && (!t.filas || t.filas.length < 2))
    );
    for (const t of limpio.tablas || []) {
      if (t && t.clave === 'temas') {
        t.titulo = 'Progreso por curso';
        const col = (t.columnas || []).find((c) => c.clave === 'nombre');
        if (col) col.etiqueta = 'Curso';
      }
      if (t && t.clave === 'estudiantes') {
        for (const f of t.filas || []) {
          if (f) f.alias = this._aliasVisible(f.alias, limpio.incluir_nombres);
        }
        t.nota = this._notaPrivada(limpio.incluir_nombres);
      }
      if (t && t.nota) t.nota = pluralizarNota(t.nota);
    }

    if (typeof limpio.incluir_nombres === 'undefined') limpio.incluir_nombres = false;
    if (!limpio.notas) limpio.notas = [this._notaPrivada(limpio.incluir_nombres)];
    limpio.notas = limpio.notas.map(pluralizarNota);
    if (!limpio.secciones_etiquetas) {
      limpio.secciones_etiquetas = (limpio.secciones || []).map(
        (s) => ETIQUETAS_SECCIONES[s] || s
      );
    }
    return limpio;
  }

  static async construirSnapshotAnalitico({
    docenteId,
    grupoId = null,
    secciones = [],
    semanas = 8,
    periodo = null,
    titulo = 'Reporte de Analítica',
    incluirNombres = false,
  }) {
    const pedidas = new Set(secciones);
    const opciones = { grupoId: grupoId || null, semanas };

    const necesitaRanking = pedidas.has('estudiantes') || pedidas.has('grupo');

    const [docente, grupo, resumen, niveles, comparacion, porTema, alumnos] = await Promise.all([
      User.findByPk(docenteId, { attributes: ['id', 'name'], raw: true }),
      grupoId
        ? Group.findOne({
            where: { id: grupoId, docente_id: docenteId },
            attributes: ['id', 'nombre', 'materia'],
            raw: true,
          })
        : null,
      pedidas.has('resumen') ? DashboardService.resumen(docenteId, opciones) : null,
      pedidas.has('grupo') ? DashboardService.distribucionNiveles(docenteId, opciones) : null,
      pedidas.has('grupo') ? DashboardService.comparacionGrupos(docenteId, { semanas }) : null,
      pedidas.has('temas')
        ? DashboardService.progresoPorTema(docenteId, { ...opciones, maxTemas: 12 })
        : null,
      necesitaRanking
        ? DashboardService.rankingCompleto(docenteId, { ...opciones, limite: 200 })
        : null,
    ]);

    const umbrales = (resumen && resumen.umbrales) || null;
    const tablas = [];
    const notas = [];

    /* ---- Progreso medio sobre UNA sola base: el % por estudiante.
     * El Resumen General promedia sobre intentos y la Vista de Grupo promedia el
     * % por estudiante; por eso 51% y 56% no coincidían. El reporte usa siempre
     * la base por estudiante (la misma de la Comparación, la tabla y la
     * distribución), y la variación se calcula con la misma base en la ventana
     * anterior. */
    const mediaPct = (filas) => {
      const valores = (filas || []).filter((f) => f.pct != null).map((f) => Number(f.pct));
      return valores.length
        ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length)
        : null;
    };
    const progresoMedio = alumnos ? mediaPct(alumnos.filas) : null;

    let progresoMedioAnterior = null;
    if (alumnos && resumen) {
      try {
        const ids = await DashboardService._estudiantesDocente(docenteId, grupoId || null);
        const { desdeAnterior } = DashboardService._ventanas(semanas);
        const calAnterior = await DashboardService._calificaciones(docenteId, ids, desdeAnterior);
        const valoresAnterior = calAnterior
          .filter((c) => c.promedio != null)
          .map((c) => Math.round(Number(c.promedio)));
        progresoMedioAnterior = valoresAnterior.length
          ? Math.round(valoresAnterior.reduce((s, v) => s + v, 0) / valoresAnterior.length)
          : null;
      } catch (error) {
        console.error('[Reportes] No se pudo calcular el progreso medio del período anterior:', error.message);
      }
    }

    /* ---------------- KPIs del Resumen general ---------------- */
    const kpis = [];
    if (resumen) {
      const a = resumen.actual;
      const v = resumen.anterior;
      const delta = (actual, anterior, unidad = 'pp') => {
        if (actual == null || anterior == null) return 'sin datos del período anterior';
        const d = Number(actual) - Number(anterior);
        if (d === 0) return 'igual que el período anterior';
        const sufijo = unidad === 'pp'
          ? ' pp vs. período anterior'
          : ` ${unidad} vs. período anterior`;
        return `${d > 0 ? '+' : '-'}${Math.abs(d)}${sufijo}`;
      };

      const nivelProgreso = progresoMedio != null
        ? nivelDeDesempeno(progresoMedio)
        : a.progreso.nivel;

      kpis.push(
        {
          etiqueta: 'Participación',
          valor: this._pct(a.participacion.pct),
          detalle: `${a.participacion.estudiantes_activos} de ${a.participacion.estudiantes} estudiantes | ${delta(a.participacion.pct, v.participacion.pct, 'pp')}`,
        },
        {
          etiqueta: 'Progreso medio',
          valor: this._pct(progresoMedio),
          detalle: `${nivelProgreso || 'Sin datos'} | ${delta(progresoMedio, progresoMedioAnterior, 'pp')}`,
        },
        {
          etiqueta: 'Estudiantes en riesgo',
          valor: this._celda(a.riesgo.total),
          detalle: delta(a.riesgo.total, v.riesgo.total, 'estudiantes'),
        },
        {
          etiqueta: 'XP promedio',
          valor: this._celda(a.xp.promedio),
          detalle: `${this._plural(a.xp.estudiantes, 'estudiante')} con XP | ${delta(a.xp.promedio, v.xp.promedio, 'XP')}`,
        },
        {
          etiqueta: `Activos (${a.activos.horas} h)`,
          valor: this._pct(a.activos.pct),
          detalle: `${this._plural(a.activos.total, 'estudiante')} | ${delta(a.activos.pct, v.activos.pct, 'pp')}`,
        }
      );

      notas.push('Progreso medio: promedio del % de logro por estudiante en el período (misma base que la Comparación y la tabla por estudiante).');
      notas.push(`En riesgo: por debajo de ${umbrales.riesgo.pct_max}% de logro o ${this._plural(umbrales.riesgo.dias_sin_ingresar, 'día')} sin ingresar.`);
      notas.push(`Activos (${a.activos.horas} h): estudiantes con actividad registrada en las últimas ${a.activos.horas} h; puede ser 0 aunque la participación del período sea alta.`);
      notas.push(this._notaPrivada(incluirNombres));

      const { filas: filasRiesgo, truncado: riesgoTruncado } = this._filasRiesgo(
        a.riesgo.aliases,
        { max: 15, umbralesU: umbrales }
      );
      if (filasRiesgo.length > 0) {
        const restantes = Math.max(0, Number(a.riesgo.total) - filasRiesgo.length);
        tablas.push({
          clave: 'riesgo',
          titulo: 'Estudiantes en riesgo',
          columnas: [
            { clave: 'alias', etiqueta: 'Alias' },
            { clave: 'nivel', etiqueta: 'Nivel' },
            { clave: 'pct', etiqueta: 'Progreso', alinear: 'derecha' },
            { clave: 'dias', etiqueta: 'Días sin ingresar', alinear: 'derecha' },
            { clave: 'motivo', etiqueta: 'Motivo' },
          ],
          filas: filasRiesgo.map((f) => ({
            alias: this._aliasVisible(f.alias, incluirNombres),
            nivel: this._formatear(f.nivel),
            pct: f.pct == null ? '—' : `${f.pct}%`,
            dias: f.dias == null ? '—' : `${f.dias} d`,
            motivo: this._formatear(f.motivo),
          })),
          nota: restantes > 0
            ? `Se listan los ${filasRiesgo.length} casos de mayor riesgo y ${restantes} estudiante${restantes === 1 ? '' : 's'} más quedan en riesgo${riesgoTruncado ? ' (lista parcial)' : ''}.`
            : null,
        });
      }
    }

    /* ---------------- Vista de grupo ---------------- */
    if (niveles) {
      tablas.push({
        clave: 'niveles',
        titulo: 'Distribución por nivel de desempeño',
        columnas: [
          { clave: 'nivel', etiqueta: 'Nivel' },
          { clave: 'minimo', etiqueta: 'Desde', alinear: 'derecha' },
          { clave: 'estudiantes', etiqueta: 'Estudiantes', alinear: 'derecha' },
          { clave: 'pct', etiqueta: '% del grupo', alinear: 'derecha' },
        ],
        filas: niveles.niveles.map((n) => ({
          nivel: n.nivel,
          minimo: `${n.minimo}%`,
          estudiantes: n.estudiantes,
          pct: this._pct(n.pct),
        })),
        nota: `Sobre ${this._plural(niveles.con_datos, 'estudiante')} con nota. ${this._plural(niveles.sin_datos, 'estudiante')} sin nota no entran en los porcentajes.`,
      });
    }

    if (comparacion && comparacion.grupos && comparacion.grupos.length > 1) {
      tablas.push({
        clave: 'grupos',
        titulo: 'Comparación entre grupos',
        columnas: [
          { clave: 'nombre', etiqueta: 'Grupo' },
          { clave: 'materia', etiqueta: 'Materia' },
          { clave: 'estudiantes', etiqueta: 'Estudiantes', alinear: 'derecha' },
          { clave: 'progreso', etiqueta: 'Progreso', alinear: 'derecha' },
          { clave: 'participacion', etiqueta: 'Participación', alinear: 'derecha' },
          { clave: 'riesgo', etiqueta: 'En riesgo', alinear: 'derecha' },
        ],
        filas: comparacion.grupos.map((g) => ({
          nombre: g.nombre,
          materia: g.materia || '—',
          estudiantes: g.estudiantes,
          progreso: this._pct(g.progreso_pct),
          participacion: this._pct(g.participacion_pct),
          riesgo: this._pct(g.riesgo_pct),
        })),
        nota: null,
      });
    }

    /* ---------------- Progreso por estudiante ---------------- */
    if (alumnos) {
      tablas.push({
        clave: 'estudiantes',
        titulo: 'Progreso por estudiante',
        columnas: [
          { clave: 'alias', etiqueta: 'Alias' },
          { clave: 'nivel', etiqueta: 'Nivel' },
          { clave: 'pct', etiqueta: 'Progreso', alinear: 'derecha' },
          { clave: 'xp', etiqueta: 'XP', alinear: 'derecha' },
          { clave: 'intentos', etiqueta: 'Intentos', alinear: 'derecha' },
          { clave: 'completados', etiqueta: 'Completados', alinear: 'derecha' },
        ],
        filas: alumnos.filas.map((f) => ({
          alias: this._aliasVisible(f.alias, incluirNombres),
          nivel: this._formatear(f.nivel || 'Sin datos'),
          pct: this._pct(f.pct),
          xp: this._celda(f.xp),
          intentos: this._celda(f.intentos),
          completados: this._celda(f.completados),
        })),
        nota: alumnos.truncado
          ? `Se muestran ${this._plural(alumnos.filas.length, 'estudiante')} del alcance. ${this._notaPrivada(incluirNombres)}`
          : `${this._plural(alumnos.con_datos, 'estudiante')} con nota y ${this._plural(alumnos.sin_datos, 'estudiante')} sin datos. ${this._notaPrivada(incluirNombres)}`,
      });
    }

    /* ---------------- Progreso por tema ---------------- */
    if (porTema && porTema.temas && porTema.temas.length > 0) {
      const filas = porTema.temas.map((t) => {
        const valores = porTema.serie.map((p) => p[t.clave]).filter((v) => v != null);
        return {
          nombre: t.nombre,
          semanas: valores.length,
          promedio: valores.length
            ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length)
            : null,
          mejor: valores.length ? Math.max(...valores) : null,
        };
      });
      tablas.push({
        clave: 'temas',
        titulo: 'Progreso por curso',
        columnas: [
          { clave: 'nombre', etiqueta: 'Curso' },
          { clave: 'semanas', etiqueta: 'Semanas con actividad', alinear: 'derecha' },
          { clave: 'promedio', etiqueta: 'Promedio', alinear: 'derecha' },
          { clave: 'mejor', etiqueta: 'Mejor semana', alinear: 'derecha' },
        ],
        filas: filas.map((f) => ({
          ...f,
          promedio: this._pct(f.promedio),
          mejor: this._pct(f.mejor),
        })),
        nota: porTema.temas_ocultos
          ? `Se listan los ${filas.length} cursos con más actividad; ${porTema.temas_ocultos} quedaron fuera.`
          : null,
      });
    }

    return {
      titulo,
      generado_en: new Date().toISOString(),
      docente: docente ? { id: docente.id, nombre: docente.name } : null,
      alcance: {
        grupo_id: grupo ? grupo.id : null,
        grupo_nombre: grupo ? grupo.nombre : null,
        grupo_materia: grupo ? grupo.materia : null,
        estudiantes: alumnos
          ? alumnos.alcance.estudiantes
          : resumen
            ? resumen.alcance.estudiantes
            : null,
        grupos: resumen ? resumen.alcance.grupos : comparacion ? comparacion.alcance.grupos : null,
      },
      periodo: {
        semanas,
        desde: periodo ? periodo.desde : null,
        hasta: periodo ? periodo.hasta : null,
      },
      secciones: [...secciones],
      secciones_etiquetas: (secciones || []).map((s) => ETIQUETAS_SECCIONES[s] || s),
      incluir_nombres: Boolean(incluirNombres),
      umbrales,
      leyenda_umbrales: this._leyendaUmbrales(umbrales),
      kpis,
      tablas,
      notas,
    };
  }

  static nombreArchivo(snapshot, formato) {
    const partes = ['reporte'];
    const grupo = snapshot && snapshot.alcance ? snapshot.alcance.grupo_nombre : null;
    if (grupo) partes.push(grupo);
    if (snapshot && snapshot.periodo && snapshot.periodo.hasta) {
      partes.push(snapshot.periodo.hasta);
    }
    const base = partes
      .join('_')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
    return `${base || 'reporte'}.${formato}`;
  }

  static renderCsv(snapshot) {
    const sep = (valor) => {
      const texto = ReportService._formatear(valor);
      const crudo =
        texto === '—' && (valor === null || valor === undefined || valor === '')
          ? ''
          : texto;
      return /[";,\r\n]/.test(crudo) ? `"${crudo.replace(/"/g, '""')}"` : crudo;
    };
    const linea = (valores) => valores.map(sep).join(';');
    const lineas = [];
    const fechaCorta = (valor) => {
      if (!valor) return '—';
      const d = new Date(valor);
      if (Number.isNaN(d.getTime())) return String(valor);
      return d
        .toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
        .replace(/\.$/, '');
    };

    lineas.push(sep(snapshot.titulo || 'Reporte'));
    lineas.push(linea(['Docente', ReportService._nombreDocente(snapshot.docente && snapshot.docente.nombre)]));
    lineas.push(
      linea([
        'Alcance',
        snapshot.alcance && snapshot.alcance.grupo_nombre
          ? [snapshot.alcance.grupo_nombre, snapshot.alcance.grupo_materia || null]
              .filter(Boolean)
              .join(' | ')
          : 'Todos los grupos',
      ])
    );
    lineas.push(
      linea([
        'Período',
        snapshot.periodo
          ? `${fechaCorta(snapshot.periodo.desde)} – ${fechaCorta(
              snapshot.periodo.hasta
            )} | ${ReportService._plural(snapshot.periodo.semanas, 'semana')}`
          : '—',
      ])
    );
    const secciones =
      snapshot.secciones_etiquetas && snapshot.secciones_etiquetas.length
        ? snapshot.secciones_etiquetas.join(' | ')
        : (snapshot.secciones || []).join(' | ');
    lineas.push(linea(['Secciones', secciones || '—']));
    lineas.push(linea(['Generado', new Date(snapshot.generado_en).toLocaleString('es-CO')]));
    if (snapshot.leyenda_umbrales) {
      lineas.push(linea(['Criterios', snapshot.leyenda_umbrales]));
    }

    if (snapshot.kpis && snapshot.kpis.length > 0) {
      lineas.push('');
      lineas.push(sep('INDICADORES'));
      lineas.push(linea(['Indicador', 'Valor', 'Detalle']));
      for (const k of snapshot.kpis) {
        lineas.push(linea([k.etiqueta, k.valor, k.detalle || '']));
      }
    }

    for (const tabla of snapshot.tablas || []) {
      lineas.push('');
      lineas.push(sep(String(tabla.titulo || '').toUpperCase()));
      lineas.push(linea(tabla.columnas.map((c) => c.etiqueta)));
      for (const fila of tabla.filas) {
        lineas.push(linea(tabla.columnas.map((c) => fila[c.clave])));
      }
      if (tabla.nota) lineas.push(linea(['Nota', tabla.nota]));
    }

    if (snapshot.notas && snapshot.notas.length > 0) {
      lineas.push('');
      lineas.push(sep('NOTAS DEL REPORTE'));
      for (const nota of snapshot.notas) {
        lineas.push(linea([nota]));
      }
    }

    return Buffer.from(`\uFEFF${lineas.join('\r\n')}\r\n`, 'utf8');
  }

  /**
   * PDF del snapshot. Devuelve una promesa con el Buffer completo porque la
   * respuesta HTTP necesita el tamaño para el Content-Length.
   *
   * Reglas de diseño:
   *  - Nada de `·` (U+00B7): pdfkit con Helvetica lo imprime como glifo vacío.
   *    Se usa ` | ` como separador y `—` (em dash, sí está en WinAnsi).
   *  - Clave y valor se dibujan con coordenadas explícitas, nunca con
   *    `continued: true` + cambio de fuente a media línea, que era lo que
   *    dejaba el buffer corrupto y volcaba el mapa de caracteres en la
   *    página siguiente.
   */
  static renderPdf(snapshot) {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({
      size: 'A4',
      margin: 46,
      bufferPages: true,
      info: {
        Title: snapshot.titulo || 'Reporte de Analítica',
        Author: (snapshot.docente && snapshot.docente.nombre) || 'EduGame',
        Subject: 'Reporte de analítica de grupo',
      },
    });
    const trozos = [];
    doc.on('data', (c) => trozos.push(c));

    const M = 46;
    const ANCHO = doc.page.width - M * 2;
    const ALTO = doc.page.height;
    const PIE_Y = ALTO - 34;
    const LIMITE = ALTO - 60;

    const C = {
      tinta: '#0f172a',
      texto: '#334155',
      gris: '#64748b',
      linea: '#e2e8f0',
      azul: '#4f46e5',
      azulSuave: '#eef2ff',
      azulTinta: '#312e81',
      fondo: '#f8fafc',
    };

    const setF = (estilo) => {
      const mapa = {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italica: 'Helvetica-Oblique',
      };
      doc.font(mapa[estilo] || 'Helvetica');
      return doc;
    };

    const fechaCorta = (valor) => {
      if (!valor) return '—';
      const d = new Date(valor);
      if (Number.isNaN(d.getTime())) return String(valor);
      return d
        .toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
        .replace(/\.$/, '');
    };

    const ETIQUETAS_SECCION = ETIQUETAS_SECCIONES;

    const tituloSeccion = (texto) => {
      if (doc.y + 46 > LIMITE) doc.addPage();
      const y = doc.y + 10;
      setF('bold').fontSize(11).fillColor(C.azul);
      doc.text(texto, M, y, { width: ANCHO, lineBreak: false });
      const yLinea = y + 16;
      doc
        .moveTo(M, yLinea)
        .lineTo(M + ANCHO, yLinea)
        .lineWidth(0.8)
        .strokeColor(C.azulSuave)
        .stroke();
      doc.y = yLinea + 8;
    };

    const dibujarCabeceras = () => {
      const rango = doc.bufferedPageRange();
      const titulo = snapshot.titulo || 'Reporte de Analítica';
      const alcance =
        snapshot.alcance && snapshot.alcance.grupo_nombre
          ? `Grupo ${snapshot.alcance.grupo_nombre}`
          : 'Todos los grupos';
      for (let i = rango.start + 1; i < rango.start + rango.count; i += 1) {
        doc.switchToPage(i);
        setF('normal').fontSize(7.5).fillColor(C.gris);
        doc.text(titulo, M, 28, { width: ANCHO / 2, align: 'left', lineBreak: false });
        doc.text(alcance, M + ANCHO / 2, 28, {
          width: ANCHO / 2,
          align: 'right',
          lineBreak: false,
        });
        doc
          .moveTo(M, 40)
          .lineTo(M + ANCHO, 40)
          .lineWidth(0.5)
          .strokeColor(C.linea)
          .stroke();
      }
    };

    const dibujarPies = () => {
      const rango = doc.bufferedPageRange();
      const generado = new Date(snapshot.generado_en).toLocaleString('es-CO');
      for (let i = rango.start; i < rango.start + rango.count; i += 1) {
        doc.switchToPage(i);
        doc
          .moveTo(M, PIE_Y - 10)
          .lineTo(M + ANCHO, PIE_Y - 10)
          .lineWidth(0.5)
          .strokeColor(C.linea)
          .stroke();
        setF('normal').fontSize(7.5).fillColor(C.gris);
        doc.text(`Generado ${generado}`, M, PIE_Y, {
          width: ANCHO / 2,
          align: 'left',
          lineBreak: false,
        });
        doc.text(`Página ${i - rango.start + 1} de ${rango.count}`, M + ANCHO / 2, PIE_Y, {
          width: ANCHO / 2,
          align: 'right',
          lineBreak: false,
        });
      }
    };

    const bloqueMeta = () => {
      const meta = [
        ['Docente', this._nombreDocente(snapshot.docente && snapshot.docente.nombre)],
        [
          'Alcance',
          snapshot.alcance && snapshot.alcance.grupo_nombre
            ? [snapshot.alcance.grupo_nombre, snapshot.alcance.grupo_materia || null]
                .filter(Boolean)
                .join(' | ')
            : 'Todos los grupos',
        ],
        [
          'Período',
          snapshot.periodo
            ? `${fechaCorta(snapshot.periodo.desde)} – ${fechaCorta(
                snapshot.periodo.hasta
              )} | ${this._plural(snapshot.periodo.semanas, 'semana')}`
            : '—',
        ],
        [
          'Datos',
          [
            snapshot.alcance && snapshot.alcance.estudiantes != null
              ? this._plural(snapshot.alcance.estudiantes, 'estudiante')
              : null,
            snapshot.alcance && snapshot.alcance.grupos != null
              ? this._plural(snapshot.alcance.grupos, 'grupo')
              : null,
          ]
            .filter(Boolean)
            .join(' | ') || '—',
        ],
        [
          'Secciones',
          (snapshot.secciones_etiquetas && snapshot.secciones_etiquetas.length
            ? snapshot.secciones_etiquetas
            : (snapshot.secciones || []).map((s) => ETIQUETAS_SECCION[s] || s)
          ).join(' | ') || '—',
        ],
        ['Generado', new Date(snapshot.generado_en).toLocaleString('es-CO')],
      ];

      const anchoClave = 68;
      const alto = 15;
      for (const [clave, valor] of meta) {
        if (doc.y + alto > LIMITE) doc.addPage();
        const y = doc.y;
        setF('bold').fontSize(7.5).fillColor(C.gris);
        doc.text(clave, M, y + 2, { width: anchoClave, lineBreak: false });
        setF('normal').fontSize(9).fillColor(C.tinta);
        doc.text(ReportService._formatear(valor), M + anchoClave, y + 1, {
          width: ANCHO - anchoClave,
          lineBreak: false,
          ellipsis: true,
        });
        doc.y = y + alto;
      }

      if (snapshot.leyenda_umbrales) {
        doc.moveDown(0.3);
        setF('italica').fontSize(8).fillColor(C.gris);
        doc.text(snapshot.leyenda_umbrales, M, doc.y, { width: ANCHO });
      }
    };

    const bloqueKpis = () => {
      if (!snapshot.kpis || snapshot.kpis.length === 0) return;
      const porFila = 3;
      const gap = 8;
      const ancho = (ANCHO - gap * (porFila - 1)) / porFila;
      const alto = 60;

      snapshot.kpis.forEach((k, i) => {
        const col = i % porFila;
        if (col === 0 && doc.y + alto > LIMITE) doc.addPage();
        const x = M + col * (ancho + gap);
        const y = doc.y;

        doc.roundedRect(x, y, ancho, alto, 6).fillAndStroke(C.fondo, C.linea);

        setF('normal').fontSize(7).fillColor(C.gris);
        doc.text(String(k.etiqueta || '').toUpperCase(), x + 12, y + 9, {
          width: ancho - 20,
          lineBreak: false,
          ellipsis: true,
        });

        setF('bold').fontSize(16).fillColor(C.tinta);
        doc.text(String(k.valor == null ? '—' : k.valor), x + 12, y + 22, {
          width: ancho - 20,
          lineBreak: false,
          ellipsis: true,
        });

        if (k.detalle) {
          setF('normal').fontSize(7).fillColor(C.gris);
          doc.text(String(k.detalle), x + 12, y + 45, {
            width: ancho - 20,
            height: 10,
            lineBreak: false,
            ellipsis: true,
          });
        }

        if (col === porFila - 1 || i === snapshot.kpis.length - 1) {
          doc.y = y + alto + gap;
        }
      });
      doc.moveDown(0.2);
    };

    const bloqueTabla = (tabla) => {
      if (!tabla.columnas || tabla.columnas.length === 0) return;

      const pesos = tabla.columnas.map((c, idx) => {
        const largoCab = String(c.etiqueta || '').length;
        const largoMax = (tabla.filas || []).reduce(
          (m, f) => Math.max(m, String(f[c.clave] == null ? '' : f[c.clave]).length),
          0
        );
        const base = Math.max(largoCab, largoMax, 4);
        const tope = idx === 0 || idx === tabla.columnas.length - 1 ? 30 : 18;
        return Math.min(base, tope);
      });
      const totalPesos = pesos.reduce((s, p) => s + p, 0) || 1;
      const escala = ANCHO / totalPesos;
      const anchos = pesos.map((p) => Math.max(38, p * escala));
      const suma = anchos.reduce((s, a) => s + a, 0);
      const factor = ANCHO / suma;
      const anchosFin = anchos.map((a) => a * factor);

      const ALTO_FILA = 17;
      const ALTO_CAB = 19;

      const cabecera = () => {
        if (doc.y + ALTO_CAB + 20 > LIMITE) doc.addPage();
        const y = doc.y;
        doc.rect(M, y, ANCHO, ALTO_CAB).fill(C.azulSuave);
        let x = M;
        setF('bold').fontSize(8).fillColor(C.azulTinta);
        tabla.columnas.forEach((c, i) => {
          doc.text(String(c.etiqueta || ''), x + 6, y + 5, {
            width: anchosFin[i] - 12,
            align: c.alinear === 'derecha' ? 'right' : 'left',
            lineBreak: false,
            ellipsis: true,
          });
          x += anchosFin[i];
        });
        doc.y = y + ALTO_CAB;
      };

      cabecera();

      if (!tabla.filas || tabla.filas.length === 0) {
        setF('italica').fontSize(8.5).fillColor(C.gris);
        doc.text('Sin datos en el período.', M + 6, doc.y + 5);
        doc.y += 20;
      } else {
        tabla.filas.forEach((fila, idx) => {
          if (doc.y + ALTO_FILA > LIMITE) {
            doc.addPage();
            cabecera();
          }
          const y = doc.y;
          if (idx % 2 === 1) doc.rect(M, y, ANCHO, ALTO_FILA).fill(C.fondo);
          let x = M;
          setF('normal').fontSize(8.5).fillColor(C.tinta);
          tabla.columnas.forEach((c, i) => {
            doc.text(ReportService._formatear(fila[c.clave]), x + 6, y + 5, {
              width: anchosFin[i] - 12,
              align: c.alinear === 'derecha' ? 'right' : 'left',
              lineBreak: false,
              ellipsis: true,
            });
            x += anchosFin[i];
          });
          doc
            .moveTo(M, y + ALTO_FILA)
            .lineTo(M + ANCHO, y + ALTO_FILA)
            .lineWidth(0.4)
            .strokeColor(C.linea)
            .stroke();
          doc.y = y + ALTO_FILA;
        });
      }

      if (tabla.nota) {
        doc.moveDown(0.3);
        setF('italica').fontSize(7.5).fillColor(C.gris);
        doc.text(String(tabla.nota), M, doc.y, { width: ANCHO });
      }
    };

    /* ================== CONSTRUCCIÓN ================== */

    doc.rect(0, 0, doc.page.width, 4).fill(C.azul);
    doc.y = 62;

    setF('bold').fontSize(22).fillColor(C.tinta);
    doc.text(snapshot.titulo || 'Reporte de Analítica', M, doc.y, { width: ANCHO });
    doc.moveDown(0.15);
    setF('normal').fontSize(10).fillColor(C.gris);
    doc.text('Analítica de grupo | EduGame', M, doc.y, { width: ANCHO });
    doc.moveDown(1);

    bloqueMeta();

    if (snapshot.kpis && snapshot.kpis.length > 0) {
      tituloSeccion('Indicadores del período');
      bloqueKpis();
    }

    (snapshot.tablas || []).forEach((tabla) => {
      tituloSeccion(tabla.titulo);
      bloqueTabla(tabla);
    });

    if (snapshot.notas && snapshot.notas.length > 0) {
      tituloSeccion('Notas del reporte');
      setF('normal').fontSize(8).fillColor(C.texto);
      snapshot.notas.forEach((nota) => {
        if (doc.y + 22 > LIMITE) {
          doc.addPage();
          setF('normal').fontSize(8).fillColor(C.texto);
        }
        const y = doc.y;
        doc.circle(M + 2.5, y + 5, 1.4).fill(C.azul);
        doc.text(ReportService._formatear(nota), M + 12, y, { width: ANCHO - 12 });
        doc.moveDown(0.45);
      });
    }

    dibujarCabeceras();
    dibujarPies();
    doc.end();

    return new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(trozos)));
      doc.on('error', reject);
    });
  }
}

module.exports = ReportService;