const { Op } = require('sequelize');
const ActividadIntento = require('../models/actividadIntento.model');
const EstudianteSesion = require('../models/estudianteSesion.model');
const MedallaObtenida = require('../models/medallaObtenida.model');
const DocenteActividadAuditoria = require('../models/docenteActividadAuditoria.model');

/**
 * TelemetriaService
 * -----------------
 * Único punto de escritura de la telemetría del dashboard del docente.
 *
 * Por qué existe: `progreso_estudiante` guarda solo el MEJOR resultado por
 * estudiante x actividad, y en cada reintento sobrescribe `fecha` y `respuestas`.
 * Con esa única fuente era imposible calcular acierto en primer intento,
 * abandono, tiempo de resolución o participación semanal. Aquí se registra un
 * renglón por cada intento, lo que además hace que `evaluaciones.intentos_realizados`
 * deje de ser un contador opaco.
 *
 * Decisión sobre el tiempo: el frontend NUNCA envía el campo `tiempo`
 * (`respuestas.controller.js` lo reenvía dead-code, siempre `undefined`). Medir la
 * duración en el servidor, entre `iniciar` y `cerrar`, evita depender del reloj
 * del cliente y es más fiable justo en la conexión mala que reporta el piloto.
 * Si el cliente sí envía `tiempo`, se prefiere ese valor.
 */

const ABANDONO_MINUTOS = 10;
const SESION_INACTIVA_MINUTOS = 5;

class TelemetriaService {
  static get ABANDONO_MINUTOS() { return ABANDONO_MINUTOS; }
  static get SESION_INACTIVA_MINUTOS() { return SESION_INACTIVA_MINUTOS; }

  // ---------------------------------------------------------------------------
  // Intentos
  // ---------------------------------------------------------------------------

  /**
   * Abre un intento. Si el estudiante ya tenía un intento abierto de la misma
   * actividad, ese intento previo se marca como abandono: entrar de nuevo a la
   * misma actividad sin cerrarla ES un abandono, y así se detecta en el momento
   * en lugar de depender del barrido periódico.
   *
   * @returns {Promise<number>} id del intento abierto (queda como `intento_id`
   *   para que el cliente lo envíe al resolver).
   */
  static async iniciarIntento({ estudianteId, docenteId, tipo, actividadId, modulo = null }) {
    const ahora = new Date();

    const abierto = await ActividadIntento.findOne({
      where: { estudiante_id: estudianteId, tipo, actividad_id: actividadId, completado: false },
      order: [['id', 'DESC']],
    });

    if (abierto) {
      const duracion = TelemetriaService._segundosDesde(abierto.iniciado_en, ahora);
      await abierto.update({ abandono: true, completado: false, cerrado_en: ahora, duracion_seg: duracion });
    }

    const numeroIntento = await ActividadIntento.max('numero_intento', {
      where: { estudiante_id: estudianteId, tipo, actividad_id: actividadId },
    });

    const intento = await ActividadIntento.create({
      estudiante_id: estudianteId,
      docente_id: docenteId,
      tipo,
      actividad_id: actividadId,
      modulo,
      numero_intento: (numeroIntento || 0) + 1,
      iniciado_en: ahora,
      completado: false,
      abandono: false,
      // Solo tiene sentido en el primer intento: en reintentos el valor ya está
      // registrado en su propia fila.
      acierto_primer_intento: null,
    });

    return intento.id;
  }

  /**
   * Cierra un intento con su resultado.
   *
   * Si `intentoId` no corresponde a un intento abierto (cliente antiguo que no
   * llama a `iniciar`, o reintento tras un cierre fallido), se registra el
   * intento directamente para que nunca se pierda telemetría.
   */
  static async cerrarIntento({
    intentoId,
    estudianteId,
    docenteId,
    tipo,
    actividadId,
    modulo = null,
    puntajeObtenido = null,
    puntajeMaximo = null,
    aciertos = null,
    preguntasTotal = null,
    duracionSeg = null,
    completado = true,
  }) {
    const ahora = new Date();

    let intento = null;
    if (intentoId) {
      intento = await ActividadIntento.findOne({
        where: { id: intentoId, estudiante_id: estudianteId, completado: false },
      });
    }

    if (!intento) {
      // Camino de compatibilidad: se registra el intento ya cerrado.
      const numeroIntento = await ActividadIntento.max('numero_intento', {
        where: { estudiante_id: estudianteId, tipo, actividad_id: actividadId },
      });
      intento = await ActividadIntento.create({
        estudiante_id: estudianteId,
        docente_id: docenteId,
        tipo,
        actividad_id: actividadId,
        modulo,
        numero_intento: (numeroIntento || 0) + 1,
        iniciado_en: ahora,
      });
    }

    // Se prefiere el tiempo declarado por el cliente; si no viene, se mide aquí.
    const duracion = Number.isFinite(duracionSeg) && duracionSeg > 0
      ? Math.min(65535, Math.round(duracionSeg))
      : TelemetriaService._segundosDesde(intento.iniciado_en, ahora);

    const aciertoPrimerIntento = intento.numero_intento === 1
      ? (completado ? (puntajeMaximo ? puntajeObtenido >= puntajeMaximo : true) : false)
      : null;

    await intento.update({
      puntaje_obtenido: puntajeObtenido,
      puntaje_maximo: puntajeMaximo,
      aciertos,
      preguntas_total: preguntasTotal,
      duracion_seg: duracion,
      acierto_primer_intento: aciertoPrimerIntento,
      completado,
      abandono: !completado,
      cerrado_en: ahora,
    });

    return intento;
  }

  /**
   * Registra un intento ya cerrado en un solo paso, sin apertura previa.
   * Se usa en contenidos (no hay "resolver": el contenido se marca como visto).
   */
  static async registrarIntentoDirecto({
    estudianteId,
    docenteId,
    tipo,
    actividadId,
    modulo = null,
    puntajeObtenido = null,
    puntajeMaximo = null,
    duracionSeg = null,
    iniciadoEn = null,
  }) {
    const inicio = iniciadoEn || new Date();
    const numeroIntento = await ActividadIntento.max('numero_intento', {
      where: { estudiante_id: estudianteId, tipo, actividad_id: actividadId },
    });

    return ActividadIntento.create({
      estudiante_id: estudianteId,
      docente_id: docenteId,
      tipo,
      actividad_id: actividadId,
      modulo,
      numero_intento: (numeroIntento || 0) + 1,
      puntaje_obtenido: puntajeObtenido,
      puntaje_maximo: puntajeMaximo,
      duracion_seg: Number.isFinite(duracionSeg) && duracionSeg > 0
        ? Math.min(65535, Math.round(duracionSeg))
        : 0,
      iniciado_en: inicio,
      cerrado_en: new Date(),
      completado: true,
      abandono: false,
      acierto_primer_intento: true,
    });
  }

  /**
   * Barrido de intentos abiertos que nunca se cerraron (el estudiante cerró la
   * pestaña, se quedó sin señal o cerró sesión a la fuerza).
   * @returns {Promise<number>} cantidad de intentos marcados como abandono.
   */
  static async marcarAbandonosPendientes() {
    const limite = new Date(Date.now() - ABANDONO_MINUTOS * 60 * 1000);
    const [afectados] = await ActividadIntento.update(
      { abandono: true, cerrado_en: new Date() },
      { where: { completado: false, iniciado_en: { [Op.lt]: limite } } }
    );
    return afectados || 0;
  }

  // ---------------------------------------------------------------------------
  // Sesiones
  // ---------------------------------------------------------------------------

  static async abrirSesion({ estudianteId, docenteId, grupoId = null, userAgent = null }) {
    // No se apilan sesiones: si el estudiante ya tiene una activa, se renueva.
    const activa = await EstudianteSesion.findOne({
      where: { estudiante_id: estudianteId, activa: true },
      order: [['id', 'DESC']],
    });

    if (activa) {
      await activa.update({ ultimo_heartbeat: new Date() });
      return activa.id;
    }

    const sesion = await EstudianteSesion.create({
      estudiante_id: estudianteId,
      docente_id: docenteId,
      grupo_id: grupoId,
      user_agent: userAgent ? String(userAgent).slice(0, 255) : null,
      iniciado_en: new Date(),
      ultimo_heartbeat: new Date(),
      activa: true,
    });
    return sesion.id;
  }

  static async registrarHeartbeat({ estudianteId, docenteId }) {
    const ahora = new Date();
    const sesion = await EstudianteSesion.findOne({
      where: { estudiante_id: estudianteId, activa: true },
      order: [['id', 'DESC']],
    });

    if (!sesion) {
      // El heartbeat también sirve para abrir la sesión: cubre recargas de
      // página y students que never llamaron a /sesion.
      const id = await TelemetriaService.abrirSesion({ estudianteId, docenteId });
      return { sesionId: id, duracion_seg: 0, nueva: true };
    }

    const duracion = TelemetriaService._segundosDesde(sesion.iniciado_en, ahora);
    await sesion.update({ ultimo_heartbeat: ahora, duracion_seg: duracion });
    return { sesionId: sesion.id, duracion_seg: duracion, nueva: false };
  }

  static async cerrarSesion({ estudianteId }) {
    const ahora = new Date();
    const sesiones = await EstudianteSesion.findAll({ where: { estudiante_id: estudianteId, activa: true } });
    for (const s of sesiones) {
      await s.update({
        activa: false,
        cerrada_en: ahora,
        duracion_seg: TelemetriaService._segundosDesde(s.iniciado_en, ahora),
        ultimo_heartbeat: ahora,
      });
    }
    return sesiones.length;
  }

  /**
   * Cierra sesiones cuyo heartbeat envejeció (el cliente desapareció sin
   * avisar). Sin esto, `duracion_seg` de esas sesiones nunca se cerraría.
   */
  static async cerrarSesionesInactivas() {
    const limite = new Date(Date.now() - SESION_INACTIVA_MINUTOS * 60 * 1000);
    const [afectadas] = await EstudianteSesion.update(
      { activa: false, cerrada_en: new Date() },
      { where: { activa: true, ultimo_heartbeat: { [Op.lt]: limite } } }
    );
    return afectadas || 0;
  }

  // ---------------------------------------------------------------------------
  // Medallas
  // ---------------------------------------------------------------------------

  /**
   * Persiste las insignias recién conseguidas. `medals.service.js` las calcula
   * en cada lectura y no guardaba nada, así que no existía fecha de obtención.
   * `INSERT IGNORE` sobre el UNIQUE (estudiante_id, medalla_id) hace que la
   * primera fecha ganada sea la que queda.
   *
   * @param {Array<{id:string,categoria:string}>} medallas
   * @returns {Promise<number>} cuántas se insertaron nuevas.
   */
  static async registrarMedallas({ estudianteId, docenteId, medallas }) {
    const nuevas = (medallas || []).filter(m => m && m.id);
    if (nuevas.length === 0) return 0;
    return MedallaObtenida.bulkCreate(
      nuevas.map(m => ({
        estudiante_id: estudianteId,
        docente_id: docenteId,
        medalla_id: m.id,
        categoria: m.categoria || null,
      })),
      { ignoreDuplicates: true }
    ).then(r => r.length || 0);
  }

  // ---------------------------------------------------------------------------
  // Auditoría docente
  // ---------------------------------------------------------------------------

  /**
   * `contenidos` y `juegos` están declarados con `timestamps: false`, así que no
   * hay forma de saber cuántas veces se editaron. Esta tabla cubre el indicador
   * "actividades creadas/editadas".
   *
   * Nunca lanza: una falla de auditoría no debe tumbar la creación de un recurso.
   */
  static async registrarAuditoria({ docenteId, tipo, recursoId = null, accion, modulo = null, titulo = null }) {
    try {
      await DocenteActividadAuditoria.create({
        docente_id: docenteId,
        tipo,
        recurso_id: recursoId,
        accion,
        modulo: modulo ? String(modulo).slice(0, 120) : null,
        titulo: titulo ? String(titulo).slice(0, 255) : null,
      });
    } catch (error) {
      console.warn('[telemetría] No se pudo registrar la auditoría:', error.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  static _segundosDesde(fecha, hasta) {
    if (!fecha) return 0;
    const ms = new Date(hasta).getTime() - new Date(fecha).getTime();
    if (!Number.isFinite(ms) || ms < 0) return 0;
    return Math.min(65535, Math.round(ms / 1000));
  }
}

module.exports = TelemetriaService;