const DiagnosticoPregunta = require('../models/diagnosticoPregunta.model');
const DiagnosticoAplicacion = require('../models/diagnosticoAplicacion.model');
const DiagnosticoRespuesta = require('../models/diagnosticoRespuesta.model');

/**
 * Servicio del Índice de Alfabetización Digital para Primaria (IAD-Primaria).
 * Encapsula toda la lógica del instrumento: seed, estado, progreso parcial,
 * cierre y cálculo de resultado (puntaje total, nivel y desglose por dimensión).
 * Todo el cálculo ocurre aquí (backend), nunca en el frontend.
 */

// Orden canónico de las dimensiones para el desglose.
const DIMENSION_ORDER = ['herramientas', 'informacion', 'seguridad'];

// Niveles del instrumento según el puntaje total (máximo 30).
const NIVELES = [
  { min: 0, max: 14, nivel: 'Bajo' },
  { min: 15, max: 22, nivel: 'Medio' },
  { min: 23, max: 30, nivel: 'Alto' },
];

// Semilla del instrumento. Se inserta una sola vez si la tabla está vacía.
// Texto verbatim de las 10 situaciones con sus opciones y puntajes (0/1/3).
const PREGUNTAS_SEMILLA = [
  {
    dimension: 'herramientas',
    dimension_nombre: 'Uso y manejo de herramientas digitales',
    orden: 1,
    situacion: 'Si tu profesora te pide hacer una tarea en el computador y necesitas escribir un texto, ¿qué harías primero?',
    opciones: [
      { letra: 'A', texto: 'Esperaría a que alguien lo haga por mí', puntos: 0 },
      { letra: 'B', texto: 'Buscaría el programa que sirve para escribir y comenzaría', puntos: 3 },
      { letra: 'C', texto: 'Le pediría a un compañero que me diga exactamente qué hacer', puntos: 1 },
    ],
  },
  {
    dimension: 'herramientas',
    dimension_nombre: 'Uso y manejo de herramientas digitales',
    orden: 2,
    situacion: 'Estás haciendo una presentación y quieres agregar una imagen que tienes guardada en el computador. ¿Qué harías?',
    opciones: [
      { letra: 'A', texto: 'Buscaría dónde están guardadas mis imágenes y la insertaría en la presentación', puntos: 3 },
      { letra: 'B', texto: 'Le pediría a otra persona que lo hiciera', puntos: 0 },
      { letra: 'C', texto: 'Tomaría una foto de la pantalla', puntos: 1 },
    ],
  },
  {
    dimension: 'herramientas',
    dimension_nombre: 'Uso y manejo de herramientas digitales',
    orden: 3,
    situacion: 'Una aplicación que estás utilizando deja de funcionar. ¿Qué haces?',
    opciones: [
      { letra: 'A', texto: 'Intento cerrarla y volverla a abrir o busco una solución', puntos: 3 },
      { letra: 'B', texto: 'Dejo de hacer la actividad', puntos: 0 },
      { letra: 'C', texto: 'Borro cosas del computador hasta que funcione', puntos: 0 },
    ],
  },
  {
    dimension: 'informacion',
    dimension_nombre: 'Información y aprendizaje digital',
    orden: 4,
    situacion: 'Tienes que hacer una tarea sobre los animales de Colombia. Buscas en internet y aparecen muchas páginas. ¿Cuál escogerías?',
    opciones: [
      { letra: 'A', texto: 'La primera que aparece', puntos: 0 },
      { letra: 'B', texto: 'La que tenga más dibujos', puntos: 0 },
      { letra: 'C', texto: 'Una página de una institución, escuela, universidad u organización reconocida', puntos: 3 },
    ],
  },
  {
    dimension: 'informacion',
    dimension_nombre: 'Información y aprendizaje digital',
    orden: 5,
    situacion: "Encuentras una noticia en internet que dice: '¡Los científicos descubrieron un animal que puede hacerse invisible!'. ¿Qué harías antes de creerla?",
    opciones: [
      { letra: 'A', texto: 'La compartiría con mis amigos porque parece increíble', puntos: 0 },
      { letra: 'B', texto: 'Buscaría si otros sitios confiables también hablan de eso', puntos: 3 },
      { letra: 'C', texto: 'La creería porque está publicada en internet', puntos: 0 },
    ],
  },
  {
    dimension: 'informacion',
    dimension_nombre: 'Información y aprendizaje digital',
    orden: 6,
    situacion: 'Tu profesora te pide investigar qué es el cambio climático. Encuentras un texto muy largo que no entiendes. ¿Qué podrías hacer?',
    opciones: [
      { letra: 'A', texto: 'Copiaría todo el texto y lo entregaría', puntos: 0 },
      { letra: 'B', texto: 'Buscaría otra explicación que pueda entender y compararía la información', puntos: 3 },
      { letra: 'C', texto: 'Cerraría la página porque es muy difícil', puntos: 0 },
    ],
  },
  {
    dimension: 'informacion',
    dimension_nombre: 'Información y aprendizaje digital',
    orden: 7,
    situacion: 'Estás haciendo una tarea y encuentras en internet una respuesta que quieres utilizar. ¿Qué sería lo mejor?',
    opciones: [
      { letra: 'A', texto: 'Copiarla exactamente y decir que la escribí yo', puntos: 0 },
      { letra: 'B', texto: 'Leerla, entenderla y explicarla con mis propias palabras', puntos: 3 },
      { letra: 'C', texto: 'Copiar solamente la primera parte', puntos: 1 },
    ],
  },
  {
    dimension: 'seguridad',
    dimension_nombre: 'Seguridad, comunicación y creación',
    orden: 8,
    situacion: 'Alguien que no conoces te escribe por internet y te pregunta dónde vives y en qué colegio estudias. ¿Qué haces?',
    opciones: [
      { letra: 'A', texto: 'Le respondo porque parece una persona amable', puntos: 0 },
      { letra: 'B', texto: 'No comparto esa información y se lo cuento a un adulto de confianza', puntos: 3 },
      { letra: 'C', texto: 'Le digo solamente el nombre de mi colegio', puntos: 1 },
    ],
  },
  {
    dimension: 'seguridad',
    dimension_nombre: 'Seguridad, comunicación y creación',
    orden: 9,
    situacion: 'Un compañero publica una foto tuya sin preguntarte y otros niños empiezan a burlarse. ¿Qué harías?',
    opciones: [
      { letra: 'A', texto: 'Publicaría una foto de él para vengarme', puntos: 0 },
      { letra: 'B', texto: 'Le pediría que la retire y buscaría ayuda de un adulto si continúa', puntos: 3 },
      { letra: 'C', texto: 'No haría nada aunque me moleste', puntos: 1 },
    ],
  },
  {
    dimension: 'seguridad',
    dimension_nombre: 'Seguridad, comunicación y creación',
    orden: 10,
    situacion: 'Tu profesora te pide crear un afiche digital para explicar cómo cuidar el agua. ¿Cuál de estas opciones demuestra un buen uso de la herramienta?',
    opciones: [
      { letra: 'A', texto: 'Copiar un afiche que encontré en internet y ponerle mi nombre', puntos: 0 },
      { letra: 'B', texto: 'Crear mi propio afiche utilizando imágenes y textos adecuados y mencionar de dónde tomé las imágenes cuando sea necesario', puntos: 3 },
      { letra: 'C', texto: 'Poner muchas imágenes y colores aunque no tengan relación con el tema', puntos: 1 },
    ],
  },
];

class DiagnosticoService {
  /**
   * Inserta la semilla del instrumento la primera vez que arranca el backend.
   * No modifica nada si ya existen preguntas (permite ajustar datos a futuro).
   */
  static async seedPreguntasSiVacio() {
    const total = await DiagnosticoPregunta.count();
    if (total > 0) return false;
    await DiagnosticoPregunta.bulkCreate(PREGUNTAS_SEMILLA);
    return true;
  }

  /**
   * Normaliza la columna JSON `opciones`. Con MySQL y consultas `raw`, el driver
   * devuelve el JSON como string, así que hay que parsearlo antes de iterar.
   */
  static _opciones(pregunta) {
    const raw = pregunta && pregunta.opciones;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  /**
   * Quita los puntajes de las opciones antes de enviarlas al estudiante,
   * evitando que el frontend conozca (o manipule) los valores.
   */
  static _sanitizarPregunta(pregunta) {
    return {
      id: pregunta.id,
      orden: pregunta.orden,
      dimension: pregunta.dimension,
      dimension_nombre: pregunta.dimension_nombre,
      situacion: pregunta.situacion,
      opciones: this._opciones(pregunta).map(o => ({ letra: o.letra, texto: o.texto })),
    };
  }

  /**
   * Devuelve las preguntas activas (orden 1..10) que aún no tienen respuesta
   * para la aplicación indicada. Base para reanudar en el punto exacto.
   */
  static async _obtenerPreguntasPendientes(aplicacionId) {
    const [preguntas, respondidas] = await Promise.all([
      DiagnosticoPregunta.findAll({ where: { activo: true }, order: [['orden', 'ASC']], raw: true }),
      DiagnosticoRespuesta.findAll({ where: { aplicacion_id: aplicacionId }, attributes: ['pregunta_id'], raw: true }),
    ]);
    const respondidasIds = new Set(respondidas.map(r => r.pregunta_id));
    return preguntas.filter(p => !respondidasIds.has(p.id));
  }

  /**
   * Estado actual del diagnóstico para un estudiante (lo usa el frontend al
   * abrir la Misión Digital): pendiente, en_progreso (con la siguiente
   * situación) o completado (sin resultado a la vista del alumno).
   */
  static async obtenerEstado(estudianteId) {
    const aplicacion = await DiagnosticoAplicacion.findOne({
      where: { estudiante_id: estudianteId },
      order: [['id', 'DESC']],
    });
    if (!aplicacion) {
      return { estado: 'pendiente', completado: false };
    }
    if (aplicacion.estado === 'completado') {
      // El resultado NO se expone al estudiante: el instrumento sirve para
      // categorizar al estudiante para el docente, no para calificar al alumno.
      return {
        estado: 'completado',
        completado: true,
      };
    }
    const pendientes = await this._obtenerPreguntasPendientes(aplicacion.id);
    // Caso límite: aplicación quedó abierta pero ya respondió las 10 situaciones
    // (p. ej. el cierre falló tras la última respuesta). En vez de devolver una
    // misión sin siguiente pregunta (pantalla en blanco), cerramos y marcamos
    // completada.
    if (pendientes.length === 0) {
      await this.cerrarAplicacion(aplicacion.id);
      return { estado: 'completado', completado: true };
    }
    const totalPreguntas = await DiagnosticoPregunta.count({ where: { activo: true } });
    return {
      estado: 'en_progreso',
      completado: false,
      aplicacion_id: aplicacion.id,
      respondidas: totalPreguntas - pendientes.length,
      total: totalPreguntas,
      pregunta: this._sanitizarPregunta(pendientes[0]),
    };
  }

  /**
   * Inicia (o reanuda) la Misión Digital. Si el estudiante ya completó el
   * diagnóstico, no se vuelve a aplicar: solo confirma que está completado.
   */
  static async iniciar(estudianteId) {
    let aplicacion = await DiagnosticoAplicacion.findOne({
      where: { estudiante_id: estudianteId },
      order: [['id', 'DESC']],
    });
    if (aplicacion && aplicacion.estado === 'completado') {
      return { estado: 'completado', completado: true };
    }
    if (!aplicacion) {
      aplicacion = await DiagnosticoAplicacion.create({
        estudiante_id: estudianteId,
        estado: 'en_progreso',
        aplicada_en: new Date(),
      });
    }
    const pendientes = await this._obtenerPreguntasPendientes(aplicacion.id);
    const totalPreguntas = await DiagnosticoPregunta.count({ where: { activo: true } });
    if (pendientes.length === 0) {
      // Todas respondidas pero la aplicación quedó abierta (corte previo): cerramos.
      await this.cerrarAplicacion(aplicacion.id);
      return { estado: 'completado', completado: true };
    }
    return {
      estado: 'en_progreso',
      completado: false,
      aplicacion_id: aplicacion.id,
      respondidas: totalPreguntas - pendientes.length,
      total: totalPreguntas,
      pregunta: this._sanitizarPregunta(pendientes[0]),
    };
  }

  /**
   * Registra la elección de una situación. Guarda la respuesta al instante
   * (progreso parcial) y devuelve la siguiente situación o, si ya se
   * respondieron las 10, cierra la aplicación y confirma la finalización
   * (nunca el resultado, reservado para el docente).
   */
  static async responder(estudianteId, preguntaId, letra) {
    const aplicacion = await DiagnosticoAplicacion.findOne({
      where: { estudiante_id: estudianteId, estado: 'en_progreso' },
      order: [['id', 'DESC']],
    });
    if (!aplicacion) {
      throw new Error('No hay una Misión Digital en curso. Iníciala primero.');
    }

    const pregunta = await DiagnosticoPregunta.findOne({
      where: { id: preguntaId, activo: true },
    });
    if (!pregunta) {
      throw new Error('Situación no encontrada.');
    }

    const opciones = this._opciones(pregunta);
    const opcion = opciones.find(o => String(o.letra).toUpperCase() === String(letra).toUpperCase());
    if (!opcion) {
      throw new Error('Opción no válida.');
    }

    // findOrCreate + actualización: reanudar no duplica respuestas (UNIQUE) y
    // permite corregir una elección si vuelve atrás.
    const [respuesta] = await DiagnosticoRespuesta.findOrCreate({
      where: { aplicacion_id: aplicacion.id, pregunta_id: pregunta.id },
      defaults: { letra: opcion.letra, puntaje: opcion.puntos },
    });
    if (respuesta.letra !== opcion.letra || respuesta.puntaje !== opcion.puntos) {
      respuesta.letra = opcion.letra;
      respuesta.puntaje = opcion.puntos;
      await respuesta.save();
    }

    const pendientes = await this._obtenerPreguntasPendientes(aplicacion.id);
    const totalPreguntas = await DiagnosticoPregunta.count({ where: { activo: true } });

    if (pendientes.length === 0) {
      await this.cerrarAplicacion(aplicacion.id);
      return { estado: 'completado', completado: true, respondidas: totalPreguntas, total: totalPreguntas };
    }

    return {
      estado: 'en_progreso',
      completado: false,
      aplicacion_id: aplicacion.id,
      respondidas: totalPreguntas - pendientes.length,
      total: totalPreguntas,
      pregunta: this._sanitizarPregunta(pendientes[0]),
    };
  }

  /**
   * Cierra una aplicación: calcula puntaje total, nivel y desglose por
   * dimensión, y guarda fortaleza/oportunidad según el mayor/menor porcentaje.
   */
  static async cerrarAplicacion(aplicacionId) {
    const aplicacion = await DiagnosticoAplicacion.findByPk(aplicacionId);
    if (!aplicacion) throw new Error('Aplicación no encontrada.');

    const [preguntas, respuestas] = await Promise.all([
      DiagnosticoPregunta.findAll({ where: { activo: true }, order: [['orden', 'ASC']], raw: true }),
      DiagnosticoRespuesta.findAll({ where: { aplicacion_id: aplicacion.id }, raw: true }),
    ]);
    const respPorPregunta = new Map(respuestas.map(r => [r.pregunta_id, r]));

    // Suma por dimensión. El máximo por dimensión se deriva de las opciones
    // (3/dimensión → 9/12/9 sobre 30), lo que reproduce los pesos 30/40/30.
    const porDimension = new Map();
    for (const p of preguntas) {
      if (!porDimension.has(p.dimension)) {
        porDimension.set(p.dimension, {
          key: p.dimension,
          nombre: p.dimension_nombre,
          obtenido: 0,
          maximo: 0,
        });
      }
      const dim = porDimension.get(p.dimension);
      const opciones = this._opciones(p);
      const maxOpcion = opciones.reduce((max, o) => Math.max(max, Number(o.puntos) || 0), 0);
      dim.maximo += maxOpcion;
      const r = respPorPregunta.get(p.id);
      if (r) dim.obtenido += Number(r.puntaje) || 0;
    }

    const dimensiones = DIMENSION_ORDER
      .map(k => porDimension.get(k))
      .filter(Boolean)
      .map(d => ({
        ...d,
        porcentaje: d.maximo > 0 ? Math.round((d.obtenido / d.maximo) * 100) : 0,
      }));

    const puntajeTotal = dimensiones.reduce((sum, d) => sum + d.obtenido, 0);
    const nivel = (NIVELES.find(n => puntajeTotal >= n.min && puntajeTotal <= n.max) || NIVELES[0]).nivel;

    // Ordena por porcentaje para señalar fortaleza (mayor) y oportunidad (menor).
    const ordenadas = [...dimensiones].sort((a, b) => b.porcentaje - a.porcentaje);
    const fortaleza = ordenadas[0] ? { nombre: ordenadas[0].nombre, porcentaje: ordenadas[0].porcentaje } : null;
    const oportunidad = ordenadas[ordenadas.length - 1] ? {
      nombre: ordenadas[ordenadas.length - 1].nombre,
      porcentaje: ordenadas[ordenadas.length - 1].porcentaje,
    } : null;

    const desglose = { dimensiones, fortaleza, oportunidad };

    aplicacion.estado = 'completado';
    aplicacion.puntaje_total = puntajeTotal;
    aplicacion.nivel = nivel;
    aplicacion.desglose = desglose;
    aplicacion.aplicada_en = new Date();
    await aplicacion.save();

    return {
      estado: 'completado',
      completado: true,
      resultado: {
        aplicacion_id: aplicacion.id,
        puntaje_total: puntajeTotal,
        nivel,
        desglose,
        aplicada_en: aplicacion.aplicada_en,
      },
    };
  }
}

module.exports = DiagnosticoService;