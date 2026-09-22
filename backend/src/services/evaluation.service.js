const Evaluation = require('../models/evaluation.model');
const Content = require('../models/content.model');
const Question = require('../models/question.model');
const Group = require('../models/grupo.model');
const NotificationService = require('./notification.service');
const { sequelize } = require('../config/database');

const DEBUG = process.env.DEBUG_LOG === '1';

class EvaluationService {
  /**
   * Normaliza el campo max_intentos: vacío/undefined/null => null (intentos ilimitados).
   */
  static _normalizarMaxIntentos(data) {
    if (data && Object.prototype.hasOwnProperty.call(data, 'max_intentos')) {
      const raw = data.max_intentos;
      if (raw === '' || raw === null || raw === undefined) {
        data.max_intentos = null;
      } else {
        const num = Number(raw);
        data.max_intentos = Number.isFinite(num) ? num : null;
      }
    }
    return data;
  }

  /**
   * Crea una nueva evaluación junto con sus preguntas.
   
   * @param {Object} data - Datos (ej: { titulo: '...', preguntas: [{enunciado: '...', opciones: {A: '...'}}] })
   */
static async crearEvaluacion(data) {
    if (data.publicado) {
      if (!data.modulo_content_id) {
        const moduloExists = await Content.findOne({ where: { modulo: data.modulo, docente_id: data.docente_id, publicado: true } });
        if (!moduloExists) {
          throw new Error(`No es posible publicar la evaluación porque el contenido del módulo "${data.modulo}" aún no está publicado.`);
        }
      } else {
        const contentExists = await Content.findByPk(data.modulo_content_id);
        if (!contentExists) {
          throw new Error('No es posible publicar la evaluación porque el contenido del módulo seleccionado fue eliminado.');
        }
        if (!contentExists.publicado) {
          throw new Error(`No es posible publicar la evaluación porque el contenido del módulo "${contentExists.modulo}" aún no está publicado.`);
        }
      }
    }

    if (data.requiere_contenido_apoyo) {
      const contenidoApoyo = await Content.findByPk(data.contenido_apoyo_id);
      if (!contenidoApoyo) {
        throw new Error('No es posible crear la evaluación porque el módulo seleccionado no posee contenidos de apoyo disponibles.');
      }
      if (data.publicado && !contenidoApoyo.publicado) {
        throw new Error(`No es posible publicar la evaluación porque el contenido de apoyo "${contenidoApoyo.titulo}" del módulo "${contenidoApoyo.modulo}" no está publicado.`);
      }
    }

    const t = await sequelize.transaction();
    try {
      const { preguntas, ...evaluacionData } = data;

      EvaluationService._normalizarMaxIntentos(evaluacionData);

      if (DEBUG) {
        console.log('📋 Datos recibidos:', JSON.stringify(data, null, 2));
        console.log('❓ Preguntas recibidas:', preguntas);
      }
      
      // Creamos la evaluación primero
      const nuevaEvaluacion = await Evaluation.create(evaluacionData, { transaction: t });
      
      // Si hay preguntas, las creamos
      if (preguntas && preguntas.length > 0) {
        const preguntasFormateadas = preguntas.map((pregunta, index) => {
          if (DEBUG) console.log(`📝 Pregunta ${index}:`, JSON.stringify(pregunta, null, 2));
          
          return {
            evaluacion_id: nuevaEvaluacion.id,
            pregunta: pregunta.enunciado || '',
            opcion_a: pregunta.opciones?.A || '',
            opcion_b: pregunta.opciones?.B || '',
            opcion_c: pregunta.opciones?.C || '',
            opcion_d: pregunta.opciones?.D || '',
            respuesta_correcta: pregunta.respuestaCorrecta?.toLowerCase() || '',
            retroalimentacion: pregunta.retroalimentacion || null
          };
        });
        
        if (DEBUG) console.log('✅ Preguntas formateadas:', JSON.stringify(preguntasFormateadas, null, 2));
        
        await Question.bulkCreate(preguntasFormateadas, { transaction: t });
      }
      
      await t.commit();

      if (data.publicado) {
        await NotificationService.notifyNewEvaluation(nuevaEvaluacion.docente_id, nuevaEvaluacion.titulo, nuevaEvaluacion.modulo, data.grupo_id || null).catch(e => {
          console.error('[Notificación] Error global en notifyNewEvaluation (crearEvaluacion):', e.message);
          console.error(e);
        });
      }

      return nuevaEvaluacion;
    } catch (error) {
      await t.rollback();
      console.error('❌ Error en crearEvaluacion:', error);
      throw new Error(`Error al crear la evaluación: ${error.message}`);
    }
  }

  /**
   * Actualiza una evaluación existente y sus preguntas si se envían.
   */
  static async actualizarEvaluacion(id, data, docenteId = null) {
    const t = await sequelize.transaction();
    try {
      const { preguntas, ...evaluacionData } = data;
      EvaluationService._normalizarMaxIntentos(evaluacionData);
      const where = { id };
      if (docenteId) where.docente_id = docenteId;
      const evaluacion = await Evaluation.findOne({ where, transaction: t });

      if (!evaluacion) {
        throw new Error('Evaluación no encontrada');
      }
      // Si la evaluación ya está publicada, solo permitimos "despublicarla" (cambiar publicado a false)
      // No permitimos editar otros campos mientras esté publicada.
      if (evaluacion.publicado) {
        const isOnlyPublishChange = Object.keys(data).length === 1 && data.publicado !== undefined;

        if (isOnlyPublishChange) {
          await evaluacion.update({ publicado: data.publicado }, { transaction: t });
          await t.commit();
          return evaluacion;
        }
        throw new Error('No se puede modificar una evaluación que ya está publicada.');
      }

      const requiereCA = evaluacionData.requiere_contenido_apoyo !== undefined
        ? evaluacionData.requiere_contenido_apoyo
        : evaluacion.requiere_contenido_apoyo;
      const contenidoApoyoId = evaluacionData.contenido_apoyo_id !== undefined
        ? evaluacionData.contenido_apoyo_id
        : evaluacion.contenido_apoyo_id;

      if (evaluacionData.publicado) {
        const contentIdActual = evaluacionData.modulo_content_id !== undefined ? evaluacionData.modulo_content_id : evaluacion.modulo_content_id;
        if (contentIdActual) {
          const contentExists = await Content.findByPk(contentIdActual);
          if (!contentExists) {
            throw new Error('No es posible publicar la evaluación porque el contenido del módulo seleccionado fue eliminado.');
          }
          if (!contentExists.publicado) {
            throw new Error(`No es posible publicar la evaluación porque el contenido del módulo "${contentExists.modulo}" aún no está publicado.`);
          }
        } else {
          const moduloActual = evaluacionData.modulo !== undefined ? evaluacionData.modulo : evaluacion.modulo;
          const moduloExists = await Content.findOne({ where: { modulo: moduloActual, docente_id: evaluacion.docente_id, publicado: true } });
          if (!moduloExists) {
            throw new Error(`No es posible publicar la evaluación porque el contenido del módulo "${moduloActual}" aún no está publicado.`);
          }
        }

        if (requiereCA && contenidoApoyoId) {
          const contenidoApoyo = await Content.findByPk(contenidoApoyoId);
          if (!contenidoApoyo) {
            throw new Error('No es posible publicar la evaluación porque el módulo relacionado al contenido de apoyo ya no existe.');
          }
          if (!contenidoApoyo.publicado) {
            throw new Error(`No es posible publicar la evaluación porque el contenido de apoyo "${contenidoApoyo.titulo}" del módulo "${contenidoApoyo.modulo}" no está publicado.`);
          }
        }
      }

      await evaluacion.update(evaluacionData, { transaction: t });

      if (preguntas && Array.isArray(preguntas)) {
        await Question.destroy({ where: { evaluacion_id: id }, transaction: t });

        const preguntasFormateadas = preguntas.map((pregunta) => ({
          evaluacion_id: evaluacion.id,
          pregunta: pregunta.enunciado || '',
          opcion_a: pregunta.opciones?.A || '',
          opcion_b: pregunta.opciones?.B || '',
          opcion_c: pregunta.opciones?.C || '',
          opcion_d: pregunta.opciones?.D || '',
          respuesta_correcta: pregunta.respuestaCorrecta?.toLowerCase() || '',
          retroalimentacion: pregunta.retroalimentacion || null
        }));
        if (preguntasFormateadas.length > 0) {
          await Question.bulkCreate(preguntasFormateadas, { transaction: t });
        }
      }

      await t.commit();

      // Notificar solo cuando la evaluación pasó de despublicada a publicada.
      if (evaluacion.publicado) {
        await NotificationService.notifyNewEvaluation(evaluacion.docente_id, evaluacion.titulo, evaluacion.modulo, evaluacion.grupo_id || null).catch(e => {
          console.error('[Notificación] Error global en notifyNewEvaluation (actualizarEvaluacion):', e.message);
          console.error(e);
        });
      }

      return await Evaluation.findByPk(id, {
        include: [{
          model: Question,
          as: 'preguntas'
        }]
      });
    } catch (error) {
      await t.rollback();
      throw new Error(`Error al actualizar la evaluación: ${error.message}`);
    }
  }

  /**
   * Obtiene la lista de evaluaciones.
   * @param {Object} filtros - Filtros opcionales (ej: { modulo: 'Matemáticas' })
   */
  static async obtenerEvaluaciones(filtros = {}) {
    try {
      const evaluaciones = await Evaluation.findAll({
        where: filtros,
        include: [{ model: Group, as: 'grupo', attributes: ['id', 'materia', 'nombre'] }]
      });
      return evaluaciones;
    } catch (error) {
      throw new Error(`Error al obtener evaluaciones: ${error.message}`);
    }
  }

  /**
   * Obtiene una evaluación por su ID y carga todas sus preguntas asociadas.
   */
  static async obtenerEvaluacionPorId(id, extraWhere = {}) {
    try {
      const evaluacion = await Evaluation.findOne({
        where: { id, ...extraWhere },
        include: [{
          model: Question,
          as: 'preguntas'
        }]
      });
      
      if (!evaluacion) {
        throw new Error('Evaluación no encontrada');
      }
      return evaluacion;
    } catch (error) {
      throw new Error(`Error al obtener la evaluación: ${error.message}`);
    }
  }

  static async eliminarEvaluacion(id, docenteId = null) {
    try {
      const where = { id };
      if (docenteId) where.docente_id = docenteId;
      const evaluacion = await Evaluation.findOne({ where });
      if (!evaluacion) {
        throw new Error('Evaluación no encontrada');
      }
      if (evaluacion.publicado) {
        throw new Error('publicado: No se puede eliminar esta evaluación porque ya está publicada.');
      }
      await evaluacion.destroy();
      return evaluacion;
    } catch (error) {
      throw new Error(`Error al eliminar la evaluación: ${error.message}`);
    }
  }

  /**
   * Recibe las respuestas enviadas por un estudiante, las valida contra la BD y calcula un puntaje.
   * @param {number} evaluacionId - ID de la evaluación
   * @param {Array} respuestasUsuario - [{ pregunta_id: 1, respuesta: 'a' }, { pregunta_id: 2, respuesta: 'c' }]
   * @returns {Object} Resultado con puntaje final y detalle de cada pregunta.
   */
  static async responderEvaluacion(evaluacionId, respuestasUsuario) {
    try {
      const evaluacion = await Evaluation.findByPk(evaluacionId, {
        include: [{
          model: Question,
          as: 'preguntas'
        }]
      });

      if (!evaluacion) {
        throw new Error('Evaluación no encontrada');
      }

      const preguntasBD = evaluacion.preguntas;
      let cantidadCorrectas = 0;
      const totalPreguntas = preguntasBD.length;

      const detalle = preguntasBD.map(preguntaBD => {
        const respuestaEnviada = respuestasUsuario.find(r => r.pregunta_id === preguntaBD.id);
        const fueRespondida = !!respuestaEnviada;

        let esCorrecta = false;
        if (fueRespondida) {
          esCorrecta = respuestaEnviada.respuesta.toLowerCase() === preguntaBD.respuesta_correcta.toLowerCase();
          if (esCorrecta) {
            cantidadCorrectas++;
          }
        }

        return {
          pregunta_id: preguntaBD.id,
          respondida: fueRespondida,
          respuesta_enviada: fueRespondida ? respuestaEnviada.respuesta : null,
          es_correcta: esCorrecta,
          respuesta_correcta: preguntaBD.respuesta_correcta
        };
      });

      const puntajeFinal = totalPreguntas > 0 ? Math.round((cantidadCorrectas / totalPreguntas) * 100) : 0;

      return {
        evaluacion_id: evaluacion.id,
        total_preguntas: totalPreguntas,
        respuestas_correctas: cantidadCorrectas,
        puntaje: puntajeFinal,
        detalle: detalle
      };
    } catch (error) {
      throw new Error(`Error al procesar respuestas de la evaluación: ${error.message}`);
    }
  }
}

module.exports = EvaluationService;
