const cron = require('node-cron');
const { Op } = require('sequelize');

const DashboardService = require('./dashboard.service');
const ReportService = require('./report.service');
const NotificationService = require('./notification.service');
const {
  ReportSchedule,
  ReportRun,
  Notification,
  Group,
} = require('../models/associations');

/**
 * Catálogo de secciones que se pueden incluir en un reporte.
 *
 * Las claves NO son las de los módulos del juego: son las cuatro groupings de
 * datos que Analítica ya sabe calcular. Si una sección no existe aquí, no se
 * puede generar, porque la tabla de historial guardaría una sección que nunca
 * llega a imprimirse.
 */
const SECCIONES = [
  { clave: 'resumen', etiqueta: 'Resumen general' },
  { clave: 'grupo', etiqueta: 'Vista de grupo' },
  { clave: 'estudiantes', etiqueta: 'Progreso por estudiante' },
  { clave: 'temas', etiqueta: 'Progreso por tema' },
];

const CLAVES_SECCION = new Set(SECCIONES.map((s) => s.clave));
const FORMATOS = new Set(['pdf', 'csv']);
const FRECUENCIAS = [1, 2, 3];

/**
 * Hora local a la que se considera vencida una programación.
 *
 * 09:00 y no la medianoche: el planificador revisa cada hora y un reporte que
 * aparece de madrugada lo primero que hace el docente es asumir que está mal.
 */
const HORA_EJECUCION = 9;

const MS_DIA = 24 * 60 * 60 * 1000;

/** Error de validación con código HTTP, para que el controller no adivine. */
class ReportScheduleError extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.name = 'ReportScheduleError';
    this.status = status;
  }
}

class ReportScheduleService {
  /* ------------------------------------------------------------------ *
   *  Fechas
   * ------------------------------------------------------------------ */

  /**
   * Desplaza `meses` conservando el día, con recorte al último día del mes destino.
   *
   * Sin el recorte, un reporte que nace el 31 de enero quedaría con fecha 31 de
   * febrero: MySQL la rebobina al 28 o al 1 de marzo según el modo, y la
   * programación se va corriendo sola cada mes sin que nadie la toque.
   */
  static _meses(fecha, meses, dia = fecha.getDate()) {
    const destino = new Date(
      fecha.getFullYear(),
      fecha.getMonth() + meses,
      1,
      fecha.getHours(),
      fecha.getMinutes(),
      0,
      0
    );
    const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
    destino.setDate(Math.min(dia, ultimoDia));
    return destino;
  }

  static _sumarMeses(fecha, meses) {
    return this._meses(fecha, meses);
  }

  /** Normaliza `YYYY-MM-DD` a las HORA_EJECUCION de ese día, en hora local. */
  static _fechaInicio(fecha) {
    if (fecha instanceof Date) return new Date(fecha);
    const partes = String(fecha).slice(0, 10).split('-').map(Number);
    if (partes.length !== 3 || partes.some((n) => !Number.isInteger(n))) {
      throw new ReportScheduleError('La fecha de inicio no es válida.');
    }
    const [anio, mes, dia] = partes;
    const d = new Date(anio, mes - 1, dia, HORA_EJECUCION, 0, 0, 0);
    if (Number.isNaN(d.getTime())) throw new ReportScheduleError('La fecha de inicio no es válida.');
    return d;
  }

  /**
   * Próxima ejecución de una programación.
   *
   * Se avanza de un periodo en un periodo comparando la fecha real de cada
   * uno, en vez de estimar cuántos meses han pasado: los meses no duran 30
   * días y con el día del corte el cálculo se saltaba un envío. Una
   * programación mensual que nacía el día 31 ya estaba vencida el 30, y la
   * estimación daba el 31 siguiente como si todavía faltara.
   */
  static calcularProximaEjecucion(fechaInicio, frecuenciaMeses, referencia = new Date()) {
    const base = this._fechaInicio(fechaInicio);
    if (base > referencia) return base;

    // Se acota la frecuencia aunque venga de la base: un 0 o un negativo aquí
    // convertirían el avance en un bucle infinito.
    const frecuencia = Math.max(1, Math.min(FRECUENCIAS[FRECUENCIAS.length - 1], Number(frecuenciaMeses) || 1));

    let periodos = 1;
    let candidato = this._sumarMeses(base, periodos * frecuencia);
    while (candidato <= referencia) {
      periodos += 1;
      candidato = this._sumarMeses(base, periodos * frecuencia);
    }
    return candidato;
  }

  /**
   * Fecha en `YYYY-MM-DD` leída en hora LOCAL.
   *
   * `toISOString()` convierte a UTC y en husos por delante de UTC se come un día:
   * una fecha local del 4 de octubre salía impresa como 3 de octubre. El
   * período del reporte se lee tal cual, así que se arma a mano.
   */
  static _isoFecha(fecha) {
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${fecha.getFullYear()}-${mes}-${dia}`;
  }

  /**
   * Ventana de datos del reporte.
   *
   * El período reportado son los meses de la frecuencia hacia atrás. Va anclado
   * a la fecha de la ejecución y no a un "últimos 30 días" literal, para que un
   * reporte mensual siga siendo comparable con el siguiente aunque la ejecución
   * se retrase unos días por el cron o por el apagado del servidor.
   */
  static _periodo(frecuenciaMeses, referencia = new Date()) {
    const desde = this._meses(referencia, -frecuenciaMeses, referencia.getDate());
    return {
      semanas: Math.max(1, Math.round(frecuenciaMeses * 4.345)),
      desde: this._isoFecha(desde),
      hasta: this._isoFecha(referencia),
    };
  }

  /**
   * Ventana cuando manda el filtro global de semanas y no la frecuencia.
   *
   * "Enviar ahora" con 4 semanas consultaba los datos de 4 semanas (eso lo
   * decide `DashboardService`), pero si se reutilizaba `_periodo` el reporte
   * se rotulaba como un mes entero: las cifras y el período del documento
   * tienen que decir exactamente lo mismo.
   */
  static _periodoSemanas(semanas, referencia = new Date()) {
    const n = Math.max(1, Number(semanas) || 1);
    const desde = new Date(referencia.getTime() - n * 7 * MS_DIA);
    return {
      semanas: n,
      desde: this._isoFecha(desde),
      hasta: this._isoFecha(referencia),
    };
  }

  /* ------------------------------------------------------------------ *
   *  Validación y normalización
   * ------------------------------------------------------------------ */

  static _normalizarSecciones(lista) {
    const pedido = Array.isArray(lista) ? lista : [];
    const validas = new Set(
      pedido.map((s) => String(s).trim()).filter((s) => CLAVES_SECCION.has(s))
    );
    // Se devuelven en el orden del catálogo: la configuración guardada en el
    // mismo orden en todas las pantallas hace el historial legible.
    const ordenadas = SECCIONES.map((s) => s.clave).filter((c) => validas.has(c));
    if (ordenadas.length === 0) {
      throw new ReportScheduleError('Selecciona al menos una sección para el reporte.');
    }
    return ordenadas;
  }

  /**
   * Valida el cuerpo de la configuración y devuelve los valores ya normalizados.
   * Un solo punto de entrada para crear y actualizar: si validaran por separado,
   * el formulario acabaría aceptando algo que el historial no puede generar.
   */
  static async _validar(docenteId, body) {
    const nombre = String(body.nombre || '').trim();
    if (!nombre) throw new ReportScheduleError('El nombre del reporte es obligatorio.');
    if (nombre.length > 120) throw new ReportScheduleError('El nombre no puede superar 120 caracteres.');

    const frecuenciaMeses = Number(body.frecuenciaMeses ?? body.frecuencia_meses ?? body.frecuencia);
    if (!FRECUENCIAS.includes(frecuenciaMeses)) {
      throw new ReportScheduleError('La frecuencia debe ser 1, 2 o 3 meses.');
    }

    const fechaInicio = String(body.fechaInicio || body.fecha_inicio || '').slice(0, 10);
    if (!fechaInicio) throw new ReportScheduleError('Indica la fecha de inicio.');

    const formato = String(body.formato || 'pdf').toLowerCase();
    if (!FORMATOS.has(formato)) {
      throw new ReportScheduleError('El formato debe ser PDF o CSV.');
    }

    let grupoId = body.grupoId ?? body.grupo_id ?? null;
    if (grupoId === '' || grupoId === undefined) grupoId = null;
    if (grupoId !== null) {
      grupoId = Number(grupoId);
      if (!Number.isInteger(grupoId) || grupoId <= 0) {
        throw new ReportScheduleError('El grupo seleccionado no es válido.');
      }
      if (!(await DashboardService.grupoEsDelDocente(docenteId, grupoId))) {
        throw new ReportScheduleError('El grupo no pertenece a este docente.', 404);
      }
    }

    return {
      nombre,
      frecuenciaMeses,
      fechaInicio,
      formato,
      secciones: this._normalizarSecciones(body.secciones),
      grupoId,
      activo: body.activo === undefined ? true : Boolean(body.activo),
      incluirNombres: body.incluirNombres === undefined
        ? Boolean(body.incluir_nombres)
        : Boolean(body.incluirNombres),
    };
  }

  /* ------------------------------------------------------------------ *
   *  CRUD
   * ------------------------------------------------------------------ */

  /** Lista las programaciones del docente con el nombre del grupo resuelto. */
  static async listar(docenteId) {
    const rows = await ReportSchedule.findAll({
      where: { docente_id: docenteId },
      include: [{ model: Group, as: 'grupo', attributes: ['id', 'nombre'] }],
      order: [['activo', 'DESC'], ['proxima_ejecucion', 'ASC']],
    });

    return rows.map((row) => this._serializar(row));
  }

  /** Lectura con validación de pertenencia: un schedule ajeno responde 404. */
  static async obtener(docenteId, id) {
    const fila = await ReportSchedule.findOne({
      where: { id: Number(id), docente_id: docenteId },
      include: [{ model: Group, as: 'grupo', attributes: ['id', 'nombre'] }],
    });
    if (!fila) throw new ReportScheduleError('Ese reporte programado no existe.', 404);
    return fila;
  }

  static async crear(docenteId, body) {
    const datos = await this._validar(docenteId, body);
    const fila = await ReportSchedule.create({
      docente_id: docenteId,
      grupo_id: datos.grupoId,
      nombre: datos.nombre,
      frecuencia_meses: datos.frecuenciaMeses,
      fecha_inicio: datos.fechaInicio,
      proxima_ejecucion: this.calcularProximaEjecucion(datos.fechaInicio, datos.frecuenciaMeses),
      formato: datos.formato,
      secciones: JSON.stringify(datos.secciones),
      canal: 'app',
      activo: datos.activo,
      incluir_nombres: datos.incluirNombres,
    });
    return this._serializar(fila);
  }

  /**
   * Actualiza la configuración. Al cambiar frecuencia o fecha de inicio se
   * recalcula la próxima ejecución; si solo cambia el formato, el calendario
   * intacto, porque reprogramar un reporte solo por pasarlo a CSV le
   * perdería el envío que ya tenía previsto.
   */
  static async actualizar(docenteId, id, body) {
    const fila = await this.obtener(docenteId, id);
    const datos = await this._validar(docenteId, body);

    const cambiaCalendario =
      datos.frecuenciaMeses !== fila.frecuencia_meses
      || datos.fechaInicio !== String(fila.fecha_inicio).slice(0, 10);

    fila.nombre = datos.nombre;
    fila.grupo_id = datos.grupoId;
    fila.frecuencia_meses = datos.frecuenciaMeses;
    fila.fecha_inicio = datos.fechaInicio;
    fila.formato = datos.formato;
    fila.secciones = JSON.stringify(datos.secciones);
    fila.activo = datos.activo;
    fila.incluir_nombres = datos.incluirNombres;
    if (cambiaCalendario) {
      fila.proxima_ejecucion = this.calcularProximaEjecucion(
        datos.fechaInicio,
        datos.frecuenciaMeses
      );
    }
    await fila.save();

    const guardado = await this.obtener(docenteId, id);
    return this._serializar(guardado);
  }

  static async eliminar(docenteId, id) {
    const fila = await this.obtener(docenteId, id);
    await fila.destroy();
    return true;
  }

  /* ------------------------------------------------------------------ *
   *  Ejecución
   * ------------------------------------------------------------------ */

  /**
   * Genera una ejecución y la deja en el historial.
   *
   * El snapshot se guarda antes de responder porque es lo que hace que la
   * descarga funcione más tarde: las notas de hoy no son las de la próxima
   * semana, y un historial que recalculara al descargar mostraría cifras que
   * nunca se entregaron.
   */
  static async ejecutar(docenteId, fila, { disparador = 'programado', semanas = null } = {}) {
    const frecuenciaMeses = Number(fila.frecuencia_meses) || 1;
    const periodo = semanas
      ? this._periodoSemanas(semanas)
      : this._periodo(frecuenciaMeses);

    let secciones = [];
    try {
      secciones = JSON.parse(fila.secciones || '[]');
    } catch {
      secciones = [];
    }
    if (secciones.length === 0) {
      throw new ReportScheduleError('La programación no tiene secciones seleccionadas.', 400);
    }

    const snapshot = await ReportService.construirSnapshotAnalitico({
      docenteId,
      grupoId: fila.grupo_id || null,
      secciones,
      semanas: periodo.semanas,
      periodo,
      incluirNombres: Boolean(fila.incluir_nombres),
    });

    const run = await ReportRun.create({
      schedule_id: fila.id,
      docente_id: docenteId,
      grupo_id: fila.grupo_id || null,
      disparador,
      estado: 'generado',
      periodo_desde: periodo.desde,
      periodo_hasta: periodo.hasta,
      formato: fila.formato,
      secciones: JSON.stringify(secciones),
      payload: JSON.stringify(snapshot),
      canal: 'app',
      generado_en: new Date(),
    });

    return { run, snapshot };
  }

  /**
   * Procesa una programación vencida.
   *
   * Todo dentro de una transacción con la fila bloqueada: el cron y la
   * verificación de inicio de sesión pueden coincidir en el mismo segundo, y
   * sin el bloqueo ambos leerían la misma `proxima_ejecucion` y generarían el
   * reporte dos veces.
   */
  static async procesarVencida(scheduleId, disparador = 'programado') {
    const { sequelize } = require('../config/database');

    return sequelize.transaction(async (t) => {
      const fila = await ReportSchedule.findByPk(scheduleId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!fila || !fila.activo) return null;

      const ahora = new Date();
      if (new Date(fila.proxima_ejecucion) > ahora) return null;

      // Se adelanta el calendario ANTES de generar: si la generación falla, el
      // reporte queda registrado como error y la programación no se queda
      // apuntando a un pasado que reintentará en bucle cada hora.
      const siguiente = this.calcularProximaEjecucion(
        fila.fecha_inicio,
        Number(fila.frecuencia_meses) || 1,
        ahora
      );
      await fila.update(
        { proxima_ejecucion: siguiente, ultima_ejecucion: ahora },
        { transaction: t }
      );

      try {
        const { run, snapshot } = await this.ejecutar(fila.docente_id, fila, { disparador });
        await NotificationService.notificarReporte({
          docenteId: fila.docente_id,
          titulo: `Reporte listo: ${fila.nombre}`,
          mensaje: `Se generó el reporte en ${String(run.formato).toUpperCase()} y ya puedes descargarlo desde Reportes.`,
          data: {
            run_id: run.id,
            schedule_id: fila.id,
            secciones: snapshot.secciones,
            formato: run.formato,
          },
        });
        return { run, snapshot };
      } catch (error) {
        console.error('[Reportes] Falló la ejecución programada', scheduleId, error);
        const fallido = await ReportRun.create(
          {
            schedule_id: fila.id,
            docente_id: fila.docente_id,
            grupo_id: fila.grupo_id || null,
            disparador,
            estado: 'error',
            periodo_desde: this._periodo(fila.frecuencia_meses).desde,
            periodo_hasta: this._periodo(fila.frecuencia_meses).hasta,
            formato: fila.formato,
            secciones: fila.secciones,
            canal: 'app',
            error_mensaje: String(error.message || error).slice(0, 500),
          },
          { transaction: t }
        );
        await NotificationService.notificarReporte({
          docenteId: fila.docente_id,
          titulo: `No se pudo generar: ${fila.nombre}`,
          mensaje: 'Revisa las secciones del reporte en Reportes e intentarlo de nuevo.',
          data: { run_id: fallido.id, schedule_id: fila.id, error: true },
        });
        return { run: fallido, snapshot: null, error };
      }
    });
  }

  /**
   * Red de seguridad del login: si el proceso estuvo apagado el día del envío,
   * el docente no se queda esperando un reporte que no va a llegar.
   */
  static async procesarVencidasDelDocente(docenteId) {
    const vencidas = await ReportSchedule.findAll({
      where: {
        docente_id: docenteId,
        activo: true,
        proxima_ejecucion: { [Op.lte]: new Date() },
      },
      attributes: ['id'],
    });
    for (const fila of vencidas) {
      try {
        await this.procesarVencida(fila.id, 'login');
      } catch (error) {
        console.error('[Reportes] Error procesando vencida del docente', docenteId, error);
      }
    }
    return vencidas.length;
  }

  /** "Enviar ahora": genera la ejecución sin tocar el calendario. */
  static async enviarAhora(docenteId, scheduleId, { semanas = null } = {}) {
    const fila = await this.obtener(docenteId, scheduleId);

    let secciones = [];
    try {
      secciones = JSON.parse(fila.secciones || '[]');
    } catch {
      secciones = [];
    }
    if (secciones.length === 0) {
      throw new ReportScheduleError('La programación no tiene secciones seleccionadas.', 400);
    }

    const periodo = semanas
      ? this._periodoSemanas(semanas)
      : this._periodo(fila.frecuencia_meses);

    let snapshot;
    try {
      snapshot = await ReportService.construirSnapshotAnalitico({
        docenteId,
        grupoId: fila.grupo_id || null,
        secciones,
        semanas: periodo.semanas,
        periodo,
        incluirNombres: Boolean(fila.incluir_nombres),
      });
    } catch (error) {
      await ReportRun.create({
        schedule_id: fila.id,
        docente_id: docenteId,
        grupo_id: fila.grupo_id || null,
        disparador: 'manual',
        estado: 'error',
        periodo_desde: periodo.desde,
        periodo_hasta: periodo.hasta,
        formato: fila.formato,
        secciones: JSON.stringify(secciones),
        canal: 'app',
        error_mensaje: String(error.message || error).slice(0, 500),
      });
      throw error;
    }

    const run = await ReportRun.create({
      schedule_id: fila.id,
      docente_id: docenteId,
      grupo_id: fila.grupo_id || null,
      disparador: 'manual',
      estado: 'generado',
      periodo_desde: periodo.desde,
      periodo_hasta: periodo.hasta,
      formato: fila.formato,
      secciones: JSON.stringify(secciones),
      payload: JSON.stringify(snapshot),
      canal: 'app',
      generado_en: new Date(),
    });

    await fila.update({ ultima_ejecucion: new Date() });
    await NotificationService.notificarReporte({
      docenteId,
      titulo: `Reporte listo: ${fila.nombre}`,
      mensaje: `Envío manual generado en ${String(run.formato).toUpperCase()}.`,
      data: { run_id: run.id, schedule_id: fila.id, formato: run.formato },
    });

    return { run, snapshot };
  }

  /* ------------------------------------------------------------------ *
   *  Historial y descarga
   * ------------------------------------------------------------------ */

  /** Historial del docente: primero lo más reciente, con nombre de grupo. */
  static async listarEjecuciones(docenteId, { limite = 50 } = {}) {
    const rows = await ReportRun.findAll({
      where: { docente_id: docenteId },
      include: [
        { model: Group, as: 'grupo', attributes: ['id', 'nombre'] },
        { model: ReportSchedule, as: 'schedule', attributes: ['id', 'nombre'] },
      ],
      order: [['creado_en', 'DESC']],
      limit: Math.max(1, Math.min(Number(limite) || 50, 200)),
    });

    return rows.map((row) => {
      const base = {
        id: row.id,
        schedule_id: row.schedule_id,
        schedule_nombre: row.schedule ? row.schedule.nombre : null,
        grupo_id: row.grupo_id,
        grupo_nombre: row.grupo ? row.grupo.nombre : null,
        disparador: row.disparador,
        estado: row.estado,
        periodo_desde: row.periodo_desde,
        periodo_hasta: row.periodo_hasta,
        formato: row.formato,
        secciones: this._parseJson(row.secciones),
        canal: row.canal,
        error_mensaje: row.error_mensaje,
        generado_en: row.generado_en,
        creado_en: row.creado_en,
        // Solo una ejecución con payload tiene algo que devolver. Un 'error' no
        // descarga: el botón sin archivo es la verdad, no un enlace roto.
        descargable: Boolean(row.payload) && row.estado !== 'error',
      };
      return base;
    });
  }

  static async obtenerEjecucion(docenteId, runId) {
    const fila = await ReportRun.findOne({
      where: { id: Number(runId), docente_id: docenteId },
    });
    if (!fila) throw new ReportScheduleError('Ese reporte no existe en tu historial.', 404);
    return fila;
  }

  /**
   * Descarga en PDF o CSV a partir del snapshot guardado.
   * Nunca se regenera desde la base: el archivo es el que se generó entonces.
   */
  static async descargar(docenteId, runId, formatoPedido = null) {
    const fila = await this.obtenerEjecucion(docenteId, runId);
    if (!fila.payload) {
      throw new ReportScheduleError('Este reporte no se generó, no hay nada que descargar.', 409);
    }

    const formato = String(formatoPedido || fila.formato || 'pdf').toLowerCase();
    if (!FORMATOS.has(formato)) {
      throw new ReportScheduleError('El formato debe ser PDF o CSV.');
    }

    const snapshotBruto = this._parseJson(fila.payload);
    if (!snapshotBruto || typeof snapshotBruto !== 'object') {
      throw new ReportScheduleError('El contenido del reporte está dañado.', 500);
    }

    // Los runs antiguos guardaron el snapshot con el formato viejo (celdas-objeto,
    // separador "·", comparación de 1 fila). Se repara antes de renderizar.
    const snapshot = ReportService._sanearSnapshot(snapshotBruto);

    const nombreBase = ReportService.nombreArchivo(snapshot, formato);
    if (formato === 'csv') {
      return { nombre: nombreBase, buffer: ReportService.renderCsv(snapshot), mime: 'text/csv; charset=utf-8' };
    }
    return { nombre: nombreBase, buffer: await ReportService.renderPdf(snapshot), mime: 'application/pdf' };
  }

  /* ------------------------------------------------------------------ *
   *  Notificaciones
   * ------------------------------------------------------------------ */

  static async listarNotificaciones(docenteId, { limite = 30, soloReportes = false } = {}) {
    const where = { docente_id: docenteId };
    if (soloReportes) where.tipo = 'reporte';

    const rows = await Notification.findAll({
      where,
      order: [['creado_en', 'DESC']],
      limit: Math.max(1, Math.min(Number(limite) || 30, 100)),
    });

    return rows.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      titulo: n.titulo,
      mensaje: n.mensaje,
      data: this._parseJson(n.data),
      leido: Boolean(n.leido),
      creado_en: n.creado_en,
    }));
  }

  static async contarNotificaciones(docenteId) {
    const [total, noLeidas] = await Promise.all([
      Notification.count({ where: { docente_id: docenteId } }),
      Notification.count({ where: { docente_id: docenteId, leido: false } }),
    ]);
    return { total, no_leidas: noLeidas };
  }

  /** Marca como leídas. Sin `id`, todas: es lo que pasa al abrir el desplegable. */
  static async marcarNotificacionesLeidas(docenteId, id = null) {
    const where = { docente_id: docenteId, leido: false };
    if (id !== null && id !== undefined) where.id = Number(id);
    const [afectadas] = await Notification.update(
      { leido: true, leido_en: new Date() },
      { where }
    );
    return afectadas;
  }

  /* ------------------------------------------------------------------ *
   *  Planificador
   * ------------------------------------------------------------------ */

  /**
   * Barrido de vencimientos de todos los docentes.
   * Cada programación se procesa en su propia transacción, así que un reporte
   * roto no deja sin ejecutar los demás.
   */
  static async procesarVencidasGlobales() {
    const vencidas = await ReportSchedule.findAll({
      where: { activo: true, proxima_ejecucion: { [Op.lte]: new Date() } },
      attributes: ['id'],
    });

    let generadas = 0;
    for (const fila of vencidas) {
      try {
        const resultado = await this.procesarVencida(fila.id, 'programado');
        if (resultado && resultado.snapshot) generadas += 1;
      } catch (error) {
        console.error('[Reportes] Error en barrido programado', fila.id, error);
      }
    }
    if (generadas > 0) {
      console.log(`[Reportes] Barrido programado: ${generadas} reporte(s) generado(s).`);
    }
    return generadas;
  }

  /** Tarea de node-cron activa, para no duplicarla si se reinicia el arranque. */
  static _tarea = null;

  /** Arranca el cron horario. Idempotente: llamarlo dos veces no duplica tareas. */
  static iniciarScheduler() {
    if (this._tarea) return this._tarea;
    if (!cron.validate('0 * * * *')) {
      console.warn('[Reportes] Expresión de cron no válida; el planificador queda apagado.');
      return null;
    }
    this._tarea = cron.schedule('0 * * * *', () => {
      this.procesarVencidasGlobales().catch((error) =>
        console.error('[Reportes] Falló el barrido programado:', error)
      );
    });
    console.log('⏰ Planificador de reportes activo (cada hora).');
    return this._tarea;
  }

  static detenerScheduler() {
    if (this._tarea && typeof this._tarea.stop === 'function') this._tarea.stop();
    this._tarea = null;
  }

  /* ------------------------------------------------------------------ *
   *  Utilidades
   * ------------------------------------------------------------------ */

  static _parseJson(texto) {
    if (!texto) return null;
    if (typeof texto === 'object') return texto;
    try {
      return JSON.parse(texto);
    } catch {
      return null;
    }
  }

  /** Formato plano para el frontend: sin JSON de texto y con el grupo resuelto. */
  static _serializar(fila) {
    const activo = Boolean(fila.activo);
    return {
      id: fila.id,
      nombre: fila.nombre,
      frecuencia_meses: fila.frecuencia_meses,
      fecha_inicio: fila.fecha_inicio,
      proxima_ejecucion: activo ? fila.proxima_ejecucion : null,
      ultima_ejecucion: fila.ultima_ejecucion,
      formato: fila.formato,
      secciones: this._parseJson(fila.secciones) || [],
      grupo_id: fila.grupo_id || null,
      grupo_nombre: fila.grupo ? fila.grupo.nombre : null,
      canal: fila.canal,
      activo,
      incluir_nombres: Boolean(fila.incluir_nombres),
    };
  }

  /** Catálogo y frecuencias que la vista necesita para no duplicar la lista. */
  static catalogo() {
    return { secciones: SECCIONES, frecuencias: FRECUENCIAS, formatos: [...FORMATOS] };
  }
}

module.exports = ReportScheduleService;
module.exports.SECCIONES = SECCIONES;
module.exports.ReportScheduleError = ReportScheduleError;