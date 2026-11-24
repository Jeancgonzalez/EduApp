const EvaluacionIntentoRespuesta = require('../models/evaluacionIntentoRespuesta.model');
const JuegoIntentoElemento = require('../models/juegoIntentoElemento.model');

const DEBUG = process.env.DEBUG_LOG === '1';

/** Límite defensivo de filas por intento: evita cargas gigantes en un solo juego. */
const MAX_ELEMENTOS_POR_INTENTO = 200;

/** Normaliza una letra de opción (a,b,c,d) o null. */
const normalizarOpcion = (valor) => {
  if (valor == null) return null;
  const letra = String(valor).trim().toLowerCase();
  return /^[a-z]$/.test(letra) ? letra : null;
};

/** Recorta texto libre para las columnas varchar del detalle. */
const recortar = (valor, max) => {
  if (valor == null) return null;
  const texto = String(valor);
  return texto.length > max ? texto.slice(0, max) : texto;
};

/**
 * Persiste el detalle por intento de evaluaciones y juegos.
 *
 * Reglas:
 *  - Solo se escribe lo que llegó real desde el frontend o lo que se puede
 *    reconstruir con la configuración del juego. Nunca se inventan elementos.
 *  - Si no hay `intentoId` (telemetría caída) no se guarda nada: el intento
 *    quedará como "sin detalle", jamás como aciertos falsos.
 *  - Los errores de captura no rompen la calificación: se registran y se sigue.
 */
class DetalleIntentoService {
  /**
   * Guarda una fila por pregunta de un intento de evaluación.
   *
   * @param {number} intentoId - id de `actividad_intentos`
   * @param {Array<{pregunta_id:number, respondida:boolean, respuesta_enviada:string|null, es_correcta:boolean}>} detalle
   */
  static async registrarEvaluacion(intentoId, detalle) {
    if (!intentoId || !Array.isArray(detalle) || detalle.length === 0) return 0;

    const filas = detalle.slice(0, MAX_ELEMENTOS_POR_INTENTO).map((fila) => ({
      intento_id: intentoId,
      pregunta_id: fila.pregunta_id,
      opcion_elegida: normalizarOpcion(fila.respuesta_enviada),
      respuesta_enviada: recortar(fila.respuesta_enviada, 255),
      es_correcta: Boolean(fila.es_correcta),
      respondida: fila.respondida !== false,
    }));

    try {
      await EvaluacionIntentoRespuesta.bulkCreate(filas, {
        ignoreDuplicates: true,
      });
      return filas.length;
    } catch (error) {
      console.warn('[detalle] No se pudo guardar el detalle de la evaluación:', error.message);
      if (DEBUG) console.error(error);
      return 0;
    }
  }

  /**
   * Guarda el detalle por elemento de un intento de juego.
   *
   * @param {number} intentoId
   * @param {object} juego - modelo `juegos` (con `tipo` y `configuracion`)
   * @param {object} datosIntento - body que envió el frontend al responder
   */
  static async registrarJuego(intentoId, juego, datosIntento = {}) {
    if (!intentoId || !juego) return 0;

    const elementos = DetalleIntentoService._elementosDeJuego(juego, datosIntento);
    if (elementos.length === 0) return 0;

    const filas = elementos.slice(0, MAX_ELEMENTOS_POR_INTENTO).map((el) => ({
      intento_id: intentoId,
      elemento_clave: recortar(el.elemento_clave, 100) || 'elemento',
      elemento_tipo: recortar(el.elemento_tipo, 40),
      esperado: el.esperado == null ? null : String(el.esperado),
      respuesta_dada: el.respuesta_dada == null ? null : String(el.respuesta_dada),
      es_correcta: Boolean(el.es_correcta),
      respondido: el.respondido !== false,
      concepto: recortar(el.concepto, 255),
    }));

    try {
      await JuegoIntentoElemento.bulkCreate(filas);
      return filas.length;
    } catch (error) {
      console.warn('[detalle] No se pudo guardar el detalle del juego:', error.message);
      if (DEBUG) console.error(error);
      return 0;
    }
  }

  /**
   * Traduce el payload del juego + su configuración a una lista homogénea de
   * elementos evaluados. Cada tipo de juego expone detalle distinto y aquí se
   * normaliza sin inventar nada:
   *
   *  - sopa_de_letras: palabras encontradas vs. esperadas.
   *  - crucigrama: letra reconstruida por pista (correcta, incorrecta o en blanco).
   *  - adivinanza: opción elegida vs. correcta.
   *  - relacionar: relación A→B hecha vs. esperada.
   *  - memoria: número de intentos (no hay detalle por pareja en el payload).
   */
  static _elementosDeJuego(juego, datosIntento) {
    const config = juego.configuracion && typeof juego.configuracion === 'string'
      ? DetalleIntentoService._parseConfig(juego.configuracion)
      : (juego.configuracion || {});

    switch (juego.tipo) {
      case 'sopa_de_letras':
        return DetalleIntentoService._elementosSopa(config, datosIntento);
      case 'crucigrama':
        return DetalleIntentoService._elementosCrucigrama(config, datosIntento);
      case 'adivinanza':
        return DetalleIntentoService._elementosAdivinanza(config, datosIntento);
      case 'relacionar':
        return DetalleIntentoService._elementosRelacionar(config, datosIntento);
      case 'memoria':
        return DetalleIntentoService._elementosMemoria(config, datosIntento);
      default:
        return [];
    }
  }

  static _parseConfig(texto) {
    try { return JSON.parse(texto); } catch (e) { return {}; }
  }

  static _elementosSopa(config, datosIntento) {
    const palabras = Array.isArray(config.palabras) ? config.palabras : [];
    const encontradas = new Set(
      (Array.isArray(datosIntento.palabras_encontradas) ? datosIntento.palabras_encontradas : [])
        .map((p) => String(p).toUpperCase().replace(/\s/g, ''))
    );

    return palabras
      .filter((p) => p && p.palabra)
      .map((p, i) => {
        const esperado = String(p.palabra).toUpperCase().replace(/\s/g, '');
        const encontrada = encontradas.has(esperado);
        return {
          elemento_clave: `palabra_${i}`,
          elemento_tipo: 'palabra',
          esperado,
          respuesta_dada: encontrada ? esperado : null,
          es_correcta: encontrada,
          // No encontrar la palabra es un ERROR, no una pregunta en blanco:
          // el estudiante sí respondió (buscó) pero no la halló.
          respondido: true,
          concepto: p.palabra,
        };
      });
  }

  static _elementosCrucigrama(config, datosIntento) {
    const userGrid = datosIntento.respuestas && typeof datosIntento.respuestas === 'object'
      ? datosIntento.respuestas
      : {};
    const pistas = Array.isArray(config.pistas) && config.pistas.length > 0
      ? config.pistas
      : (Array.isArray(config.palabras) ? config.palabras : []);

    return pistas
      .filter((p) => p && p.palabra && p.fila != null && p.col != null)
      .map((p, i) => {
        const esperado = String(p.palabra).toUpperCase().replace(/\s/g, '');
        const dr = p.orientacion === 'V' ? 1 : 0;
        const dc = p.orientacion === 'H' ? 1 : 0;
        let dada = '';
        for (let k = 0; k < esperado.length; k++) {
          const r = Number(p.fila) + dr * k;
          const c = Number(p.col) + dc * k;
          dada += (userGrid[`${r}-${c}`] || '');
        }
        dada = dada.toUpperCase();
        const enBlanco = dada.replace(/\s/g, '').length === 0;
        const esCorrecta = dada === esperado;
        return {
          elemento_clave: `pista_${p.numero != null ? p.numero : i}`,
          elemento_tipo: 'pista',
          esperado,
          respuesta_dada: enBlanco ? null : dada,
          es_correcta: esCorrecta,
          respondido: !enBlanco,
          concepto: p.pista || p.palabra,
        };
      });
  }

  static _elementosAdivinanza(config, datosIntento) {
    const correcta = config.respuestaCorrecta || null;
    const dada = datosIntento.respuesta || null;
    return [{
      elemento_clave: 'adivinanza',
      elemento_tipo: 'adivinanza',
      esperado: correcta,
      respuesta_dada: dada,
      es_correcta: Boolean(dada) && dada === correcta,
      respondido: Boolean(dada),
      concepto: config.adivinanza || config.pregunta || 'Adivinanza',
    }];
  }

  static _elementosRelacionar(config, datosIntento) {
    const pares = Array.isArray(config.pares) ? config.pares : [];
    const respuestas = datosIntento.respuestas && typeof datosIntento.respuestas === 'object'
      ? datosIntento.respuestas
      : {};

    return pares
      .filter((p) => p && p.columnaA)
      .map((p, i) => {
        const esperado = p.columnaB;
        const dada = respuestas[`r_${i}`] || null;
        return {
          elemento_clave: `par_${i}`,
          elemento_tipo: 'relacion',
          esperado,
          respuesta_dada: dada,
          es_correcta: Boolean(dada) && dada === esperado,
          respondido: Boolean(dada),
          concepto: p.columnaA,
        };
      });
  }

  static _elementosMemoria(config, datosIntento) {
    const pares = Array.isArray(config.pares) ? config.pares : [];
    const intentos = Number.isFinite(Number(datosIntento.intentos)) ? Number(datosIntento.intentos) : null;
    return [{
      elemento_clave: 'memoria',
      elemento_tipo: 'memoria',
      // "esperado" = intentos óptimos (uno por pareja) para comparar dificultad.
      esperado: String(pares.length),
      respuesta_dada: intentos == null ? null : String(intentos),
      es_correcta: intentos != null && intentos <= pares.length,
      respondido: intentos != null,
      concepto: 'Memotest',
    }];
  }
}

module.exports = DetalleIntentoService;
