const Content = require('../models/content.model');
const Game = require('../models/game.model');
const Evaluation = require('../models/evaluation.model');
const StudentProgress = require('../models/studentProgress.model');
const StudentService = require('./student.service');

const MEDALLAS = [
  // ---------- Contenidos ----------
  { id: 'primer_paso', nombre: 'Primer paso', categoria: 'contenidos', icono: 'track_changes', descripcion: 'Completa tu primera actividad.', condicion: 'Completa cualquier actividad (contenido, juego o evaluación) por primera vez.', explicacion: 'Completaste tu primera actividad en la plataforma.' },
  { id: 'explorador', nombre: 'Explorador', categoria: 'contenidos', icono: 'explore', descripcion: 'Revisa 5 contenidos de aprendizaje.', condicion: 'Revisa 5 contenidos publicados.', explicacion: 'Revisaste 5 contenidos de aprendizaje.' },
  { id: 'lector_aplicado', nombre: 'Lector aplicado', categoria: 'contenidos', icono: 'menu_book', descripcion: 'Revisa 10 contenidos de aprendizaje.', condicion: 'Revisa 10 contenidos publicados.', explicacion: 'Revisaste 10 contenidos de aprendizaje.' },
  { id: 'curioso_incansable', nombre: 'Curioso incansable', categoria: 'contenidos', icono: 'search', descripcion: 'Revisa 15 contenidos de aprendizaje.', condicion: 'Revisa 15 contenidos publicados.', explicacion: 'Revisaste 15 contenidos de aprendizaje.' },
  { id: 'lector_dedicado', nombre: 'Lector dedicado', categoria: 'contenidos', icono: 'collections_bookmark', descripcion: 'Revisa 20 contenidos de aprendizaje.', condicion: 'Revisa 20 contenidos publicados.', explicacion: 'Revisaste 20 contenidos de aprendizaje.' },

  // ---------- Juegos ----------
  { id: 'maestro_juegos', nombre: 'Maestro de los juegos', categoria: 'juegos', icono: 'sports_esports', descripcion: 'Completa 5 juegos educativos.', condicion: 'Completa 5 juegos publicados.', explicacion: 'Completaste 5 juegos educativos.' },
  { id: 'maestro_ludico', nombre: 'Maestro lúdico', categoria: 'juegos', icono: 'toys', descripcion: 'Completa 10 juegos educativos.', condicion: 'Completa 10 juegos publicados.', explicacion: 'Completaste 10 juegos educativos.' },
  { id: 'gamer_pro', nombre: 'Gamer Pro', categoria: 'juegos', icono: 'videogame_asset', descripcion: 'Completa 15 juegos educativos.', condicion: 'Completa 15 juegos publicados.', explicacion: 'Completaste 15 juegos educativos.' },
  { id: 'puntaje_perfecto_juego', nombre: 'Puntaje perfecto en juegos', categoria: 'juegos', icono: 'emoji_events', descripcion: 'Alcanza el 100% de logro en un juego.', condicion: 'Consigue el puntaje máximo (100%) en al menos un juego.', explicacion: 'Alcanzaste el 100% de logro en un juego.' },

  // ---------- Evaluaciones ----------
  { id: 'evaluador_experto', nombre: 'Evaluador experto', categoria: 'evaluaciones', icono: 'assignment_turned_in', descripcion: 'Completa 5 evaluaciones.', condicion: 'Completa 5 evaluaciones publicadas.', explicacion: 'Completaste 5 evaluaciones.' },
  { id: 'examinador_frecuente', nombre: 'Examinador frecuente', categoria: 'evaluaciones', icono: 'quiz', descripcion: 'Completa 10 evaluaciones.', condicion: 'Completa 10 evaluaciones publicadas.', explicacion: 'Completaste 10 evaluaciones.' },
  { id: 'evaluador_dedicado', nombre: 'Evaluador dedicado', categoria: 'evaluaciones', icono: 'fact_check', descripcion: 'Completa 15 evaluaciones.', condicion: 'Completa 15 evaluaciones publicadas.', explicacion: 'Completaste 15 evaluaciones.' },
  { id: 'puntaje_perfecto_evaluacion', nombre: 'Puntaje perfecto en evaluaciones', categoria: 'evaluaciones', icono: 'verified', descripcion: 'Obtén 100 de puntaje en una evaluación.', condicion: 'Obtén un puntaje perfecto (100/100) en una evaluación.', explicacion: 'Obtuviste 100/100 en una evaluación.' },

  // ---------- Puntos ----------
  { id: 'recolector_puntos', nombre: 'Recolector de puntos', categoria: 'puntos', icono: 'savings', descripcion: 'Alcanza 250 puntos en total.', condicion: 'Acumula 250 puntos en juegos y evaluaciones.', explicacion: 'Acumulaste 250 puntos en total.' },
  { id: 'superestudiante', nombre: 'Superestudiante', categoria: 'puntos', icono: 'rocket_launch', descripcion: 'Alcanza 500 puntos en total.', condicion: 'Acumula 500 puntos en juegos y evaluaciones.', explicacion: 'Acumulaste 500 puntos en total.' },
  { id: 'acumulador_puntos', nombre: 'Acumulador de puntos', categoria: 'puntos', icono: 'attach_money', descripcion: 'Alcanza 1000 puntos en total.', condicion: 'Acumula 1000 puntos en juegos y evaluaciones.', explicacion: 'Acumulaste 1000 puntos en total.' },
  { id: 'millonario_puntos', nombre: 'Millonario de puntos', categoria: 'puntos', icono: 'monetization_on', descripcion: 'Alcanza 2000 puntos en total.', condicion: 'Acumula 2000 puntos en juegos y evaluaciones.', explicacion: 'Acumulaste 2000 puntos en total.' },
  { id: 'leyenda', nombre: 'Leyenda', categoria: 'puntos', icono: 'workspace_premium', descripcion: 'Alcanza 1500 puntos en total.', condicion: 'Acumula 1500 puntos en juegos y evaluaciones.', explicacion: 'Acumulaste 1500 puntos en total.' },

  // ---------- Progreso ----------
  { id: 'ritmo_escalera', nombre: 'Ritmo de escalera', categoria: 'progreso', icono: 'stairs', descripcion: 'Alcanza un 25% de avance promedio.', condicion: 'Logra un avance promedio del 25% en tus módulos.', explicacion: 'Alcanzaste un 25% de avance promedio en tus módulos.' },
  { id: 'avance_medio', nombre: 'Avance medio', categoria: 'progreso', icono: 'trending_up', descripcion: 'Alcanza un 50% de avance promedio.', condicion: 'Logra un avance promedio del 50% en tus módulos.', explicacion: 'Alcanzaste un 50% de avance promedio en tus módulos.' },
  { id: 'casi_maestro', nombre: 'Casi maestro', categoria: 'progreso', icono: 'near_me', descripcion: 'Alcanza un 90% de avance promedio.', condicion: 'Logra un avance promedio del 90% en tus módulos.', explicacion: 'Alcanzaste un 90% de avance promedio en tus módulos.' },

  // ---------- Módulos ----------
  { id: 'explorador_modulos', nombre: 'Explorador de módulos', categoria: 'modulos', icono: 'category', descripcion: 'Inicia 3 módulos de aprendizaje.', condicion: 'Completa al menos una actividad en 3 módulos.', explicacion: 'Iniciaste 3 módulos de aprendizaje.' },
  { id: 'iniciador_modulos', nombre: 'Iniciador de módulos', categoria: 'modulos', icono: 'dashboard', descripcion: 'Inicia 5 módulos de aprendizaje.', condicion: 'Completa al menos una actividad en 5 módulos.', explicacion: 'Iniciaste 5 módulos de aprendizaje.' },
  { id: 'explorador_total', nombre: 'Explorador total', categoria: 'modulos', icono: 'map', descripcion: 'Inicia 10 módulos de aprendizaje.', condicion: 'Completa al menos una actividad en 10 módulos.', explicacion: 'Iniciaste 10 módulos de aprendizaje.' },
  { id: 'gran_comienzo', nombre: 'Gran comienzo', categoria: 'modulos', icono: 'start', descripcion: 'Completa un módulo al 100%.', condicion: 'Completa todas las actividades de un módulo (100%).', explicacion: 'Completaste un módulo al 100%.' },
  { id: 'dominio_modulo', nombre: 'Dominio del módulo', categoria: 'modulos', icono: 'gps_fixed', descripcion: 'Domina un módulo completando todas sus actividades.', condicion: 'Completa todas las actividades de un módulo al 100%.', explicacion: 'Dominaste un módulo completando todas sus actividades.' },
  { id: 'completador_modulos', nombre: 'Completador de módulos', categoria: 'modulos', icono: 'layers', descripcion: 'Completa 3 módulos al 100%.', condicion: 'Completa 3 módulos al 100%.', explicacion: 'Completaste 3 módulos al 100%.' },
  { id: 'rey_conocimiento', nombre: 'Rey del conocimiento', categoria: 'modulos', icono: 'emoji_events', descripcion: 'Completa 5 módulos al 100%.', condicion: 'Completa 5 módulos al 100%.', explicacion: 'Completaste 5 módulos al 100%.' },

  // ---------- Rendimiento ----------
  { id: 'estrella_conocimiento', nombre: 'Estrella del conocimiento', categoria: 'rendimiento', icono: 'auto_awesome', descripcion: 'Obtén un puntaje de 90 o más en una actividad.', condicion: 'Obtén un puntaje de 90 o más en una actividad.', explicacion: 'Obtuviste un puntaje de 90 o más en una actividad.' },
  { id: 'cerebro_brillante', nombre: 'Cerebro brillante', categoria: 'rendimiento', icono: 'psychology', descripcion: 'Obtén un puntaje de 90 o más en 3 actividades.', condicion: 'Obtén un puntaje de 90 o más en 3 actividades.', explicacion: 'Obtuviste un puntaje de 90 o más en 3 actividades.' },
  { id: 'mente_rapida', nombre: 'Mente rápida', categoria: 'rendimiento', icono: 'bolt', descripcion: 'Obtén un puntaje de 85 o más en 5 actividades.', condicion: 'Obtén un puntaje de 85 o más en 5 actividades.', explicacion: 'Obtuviste un puntaje de 85 o más en 5 actividades.' },
  { id: 'campeon', nombre: 'Campeón', categoria: 'rendimiento', icono: 'emoji_events', descripcion: 'Obtén un puntaje de 90 o más en 5 actividades.', condicion: 'Obtén un puntaje de 90 o más en 5 actividades.', explicacion: 'Obtuviste un puntaje de 90 o más en 5 actividades.' },
  { id: 'experto', nombre: 'Experto', categoria: 'rendimiento', icono: 'military_tech', descripcion: 'Obtén un puntaje de 90 o más en 10 actividades.', condicion: 'Obtén un puntaje de 90 o más en 10 actividades.', explicacion: 'Obtuviste un puntaje de 90 o más en 10 actividades.' },
  { id: 'rendimiento_alto', nombre: 'Rendimiento alto', categoria: 'rendimiento', icono: 'insights', descripcion: 'Obtén un puntaje de 80 o más en 3 actividades.', condicion: 'Obtén un puntaje de 80 o más en 3 actividades.', explicacion: 'Obtuviste un puntaje de 80 o más en 3 actividades.' },
  { id: 'perfeccionista', nombre: 'Perfeccionista', categoria: 'rendimiento', icono: 'workspace_premium', descripcion: 'Obtén un puntaje perfecto (100) en una actividad.', condicion: 'Obtén un puntaje perfecto (100/100) en una actividad.', explicacion: 'Obtuviste un puntaje perfecto (100/100) en una actividad.' },
  { id: 'estrella_rendimiento', nombre: 'Estrella de rendimiento', categoria: 'rendimiento', icono: 'star', descripcion: 'Consigue 3 estrellas en una actividad.', condicion: 'Consigue 3 estrellas en al menos una actividad.', explicacion: 'Conseguiste 3 estrellas en una actividad.' },
  { id: 'triple_estrella', nombre: 'Triple estrella', categoria: 'rendimiento', icono: 'star', descripcion: 'Consigue 3 estrellas en 5 actividades.', condicion: 'Consigue 3 estrellas en 5 actividades.', explicacion: 'Conseguiste 3 estrellas en 5 actividades.' },

  // ---------- Constancia ----------
  { id: 'racha_inicial', nombre: 'Racha inicial', categoria: 'constancia', icono: 'local_fire_department', descripcion: 'Completa 3 actividades en el mismo día.', condicion: 'Completa 3 actividades en un mismo día.', explicacion: 'Completaste 3 actividades en un mismo día.' },
  { id: 'constancia', nombre: 'Constancia', categoria: 'constancia', icono: 'calendar_month', descripcion: 'Realiza actividades en 5 días diferentes.', condicion: 'Realiza actividades en 5 días diferentes.', explicacion: 'Realizaste actividades en 5 días diferentes.' },
  { id: 'aprendiz_constante', nombre: 'Aprendiz constante', categoria: 'constancia', icono: 'event_repeat', descripcion: 'Realiza actividades en 10 días diferentes.', condicion: 'Realiza actividades en 10 días diferentes.', explicacion: 'Realizaste actividades en 10 días diferentes.' },
  { id: 'racha_tres_dias', nombre: 'Racha de 3 días', categoria: 'constancia', icono: 'whatshot', descripcion: 'Realiza actividades 3 días consecutivos.', condicion: 'Realiza actividades durante 3 días consecutivos.', explicacion: 'Realizaste actividades durante 3 días consecutivos.' },
  { id: 'racha_siete_dias', nombre: 'Racha de 7 días', categoria: 'constancia', icono: 'bolt', descripcion: 'Realiza actividades 7 días consecutivos.', condicion: 'Realiza actividades durante 7 días consecutivos.', explicacion: 'Realizaste actividades durante 7 días consecutivos.' },

  // ---------- Superación ----------
  { id: 'sin_rendirse', nombre: 'Sin rendirse', categoria: 'superacion', icono: 'loop', descripcion: 'Completa una evaluación con más de un intento.', condicion: 'Completa una evaluación habiendo requerido más de un intento.', explicacion: 'Completaste una evaluación con más de un intento.' },
  { id: 'desafio_superado', nombre: 'Desafío superado', categoria: 'superacion', icono: 'timeline', descripcion: 'Completa 3 evaluaciones con más de un intento.', condicion: 'Completa 3 evaluaciones habiendo requerido más de un intento en cada una.', explicacion: 'Completaste 3 evaluaciones con más de un intento.' },
  { id: 'superando_limites', nombre: 'Superando límites', categoria: 'superacion', icono: 'trending_up', descripcion: 'Acumula 5 reintentos en tus evaluaciones.', condicion: 'Acumula 5 intentos extra (reintentos) entre todas tus evaluaciones.', explicacion: 'Acumulaste 5 reintentos entre tus evaluaciones.' },
  { id: 'buscador_de_mejora', nombre: 'Buscador de mejora', categoria: 'superacion', icono: 'upgrade', descripcion: 'Acumula 10 reintentos en tus evaluaciones.', condicion: 'Acumula 10 intentos extra (reintentos) entre todas tus evaluaciones.', explicacion: 'Acumulaste 10 reintentos entre tus evaluaciones.' },

  // ---------- Uso de plataforma ----------
  { id: 'coleccionista', nombre: 'Coleccionista', categoria: 'uso_plataforma', icono: 'collections', descripcion: 'Consigue 5 medallas.', condicion: 'Consigue 5 medallas en total.', explicacion: 'Conseguiste 5 medallas en total.' },
  { id: 'gran_aprendiz', nombre: 'Gran aprendiz', categoria: 'uso_plataforma', icono: 'school', descripcion: 'Completa 15 actividades.', condicion: 'Completa 15 actividades de cualquier tipo.', explicacion: 'Completaste 15 actividades.' },
  { id: 'lo_logre', nombre: '¡Lo logré!', categoria: 'uso_plataforma', icono: 'celebration', descripcion: 'Completa 20 actividades.', condicion: 'Completa 20 actividades de cualquier tipo.', explicacion: 'Completaste 20 actividades.' },
  { id: 'multitalento', nombre: 'Multitalento', categoria: 'uso_plataforma', icono: 'widgets', descripcion: 'Usa los tres tipos de actividad.', condicion: 'Completa al menos un contenido, un juego y una evaluación.', explicacion: 'Completaste un contenido, un juego y una evaluación.' }
];

class MedalsService {
  static async obtenerGamificacion(estudianteId, docenteId) {
    const [contents, games, evaluations] = await Promise.all([
      Content.findAll({ where: { publicado: true, docente_id: docenteId }, raw: true }),
      Game.findAll({ where: { publicado: true, docente_id: docenteId }, raw: true }),
      Evaluation.findAll({ where: { publicado: true, docente_id: docenteId }, raw: true })
    ]);

    const gameById = new Map(games.map(g => [g.id, g]));
    const records = await StudentProgress.findAll({
      where: { estudiante_id: estudianteId, completado: true },
      raw: true
    });

    const bestPerActivity = StudentService._deduplicateProgress(records);

    let contenidosCompletados = 0;
    let juegosCompletados = 0;
    let evaluacionesCompletadas = 0;
    let totalPuntos = 0;
    let mejorPct = 0;
    let count80 = 0;
    let count85 = 0;
    let count90 = 0;
    let count100 = 0;
    let count3Estrellas = 0;
    let juegosPuntajeMaximo = 0;
    let evaluacionesPuntajeMaximo = 0;
    let evaluacionesConReintentos = 0;
    let totalReintentos = 0;
    const diasActividad = new Set();

    for (const r of bestPerActivity) {
      if (r.fecha) diasActividad.add(new Date(r.fecha).toISOString().slice(0, 10));

      let pct = null;
      if (r.contenido_id) {
        contenidosCompletados++;
        continue;
      } else if (r.juego_id) {
        juegosCompletados++;
        const juego = gameById.get(r.juego_id);
        pct = juego && juego.puntaje_max ? Math.round((r.puntaje / juego.puntaje_max) * 100) : null;
        if (pct !== null && pct >= 100) juegosPuntajeMaximo++;
      } else if (r.evaluacion_id) {
        evaluacionesCompletadas++;
        pct = r.puntaje;
        if (r.intentos_realizados && r.intentos_realizados > 1) {
          evaluacionesConReintentos++;
          totalReintentos += (r.intentos_realizados - 1);
        }
        if (pct !== null && pct >= 100) evaluacionesPuntajeMaximo++;
      }
      if (pct === null || pct === undefined) continue;

      totalPuntos += r.puntaje;
      if (pct > mejorPct) mejorPct = pct;
      if (pct >= 80) count80++;
      if (pct >= 85) count85++;
      if (pct >= 90) count90++;
      if (pct >= 100) count100++;
      const estrellas = StudentService.estrellasDePorcentaje(pct);
      if (estrellas >= 3) count3Estrellas++;
    }

    const actividadesCompletadas = contenidosCompletados + juegosCompletados + evaluacionesCompletadas;

    const moduleProgress = await StudentService._getModuleProgress(estudianteId, bestPerActivity, docenteId);
    const modulos = Object.values(moduleProgress);
    const modulosCompletados = modulos.filter(m => m.percentage >= 100).length;
    const modulosIniciados = modulos.filter(m => m.completed > 0).length;
    const avancePromedio = modulos.length > 0
      ? Math.round(modulos.reduce((sum, m) => sum + m.percentage, 0) / modulos.length)
      : 0;

    const nivel = Math.floor(totalPuntos / 500) + 1;
    const puntosParaSiguienteNivel = 500 - (totalPuntos % 500);

    const rachaDias = MedalsService._maxRachaDias([...diasActividad]);

    const condiciones = {
      primer_paso: actividadesCompletadas >= 1,
      explorador: contenidosCompletados >= 5,
      lector_aplicado: contenidosCompletados >= 10,
      curioso_incansable: contenidosCompletados >= 15,
      lector_dedicado: contenidosCompletados >= 20,
      maestro_juegos: juegosCompletados >= 5,
      maestro_ludico: juegosCompletados >= 10,
      gamer_pro: juegosCompletados >= 15,
      puntaje_perfecto_juego: juegosPuntajeMaximo >= 1,
      evaluador_experto: evaluacionesCompletadas >= 5,
      examinador_frecuente: evaluacionesCompletadas >= 10,
      evaluador_dedicado: evaluacionesCompletadas >= 15,
      puntaje_perfecto_evaluacion: evaluacionesPuntajeMaximo >= 1,
      recolector_puntos: totalPuntos >= 250,
      superestudiante: totalPuntos >= 500,
      acumulador_puntos: totalPuntos >= 1000,
      millonario_puntos: totalPuntos >= 2000,
      leyenda: totalPuntos >= 1500,
      ritmo_escalera: avancePromedio >= 25,
      avance_medio: avancePromedio >= 50,
      casi_maestro: avancePromedio >= 90,
      explorador_modulos: modulosIniciados >= 3,
      iniciador_modulos: modulosIniciados >= 5,
      explorador_total: modulosIniciados >= 10,
      gran_comienzo: modulosCompletados >= 1,
      dominio_modulo: modulosCompletados >= 1,
      completador_modulos: modulosCompletados >= 3,
      rey_conocimiento: modulosCompletados >= 5,
      estrella_conocimiento: mejorPct >= 90,
      cerebro_brillante: count90 >= 3,
      mente_rapida: count85 >= 5,
      campeon: count90 >= 5,
      experto: count90 >= 10,
      rendimiento_alto: count80 >= 3,
      perfeccionista: count100 >= 1,
      estrella_rendimiento: count3Estrellas >= 1,
      triple_estrella: count3Estrellas >= 5,
      racha_inicial: MedalsService._maxActividadesPorDia(records) >= 3,
      constancia: diasActividad.size >= 5,
      aprendiz_constante: diasActividad.size >= 10,
      racha_tres_dias: rachaDias >= 3,
      racha_siete_dias: rachaDias >= 7,
      sin_rendirse: evaluacionesConReintentos >= 1,
      desafio_superado: evaluacionesConReintentos >= 3,
      superando_limites: totalReintentos >= 5,
      buscador_de_mejora: totalReintentos >= 10,
      coleccionista: false,
      gran_aprendiz: actividadesCompletadas >= 15,
      lo_logre: actividadesCompletadas >= 20,
      multitalento: contenidosCompletados >= 1 && juegosCompletados >= 1 && evaluacionesCompletadas >= 1
    };

    const medallas = MEDALLAS.map(m => ({
      ...m,
      obtenida: !!condiciones[m.id]
    }));
    const medallasObtenidas = medallas.filter(m => m.obtenida).length;

    medallas.forEach(m => {
      if (m.id === 'coleccionista') m.obtenida = medallasObtenidas >= 5;
    });

    return {
      puntos_total: totalPuntos,
      nivel,
      puntos_para_siguiente_nivel: puntosParaSiguienteNivel,
      estrellas_totales: MedalsService._totalEstrellas(bestPerActivity, gameById),
      medallas,
      medallas_obtenidas: medallas.filter(m => m.obtenida).length,
      medallas_totales: MEDALLAS.length,
      contenidos_completados: contenidosCompletados,
      juegos_completados: juegosCompletados,
      evaluaciones_completadas: evaluacionesCompletadas,
      actividades_completadas: actividadesCompletadas,
      modulos_completados: modulosCompletados,
      modulos_iniciados: modulosIniciados,
      avance_promedio: avancePromedio
    };
  }

  static _maxActividadesPorDia(records) {
    const porDia = new Map();
    for (const r of records) {
      if (!r.fecha) continue;
      const dia = new Date(r.fecha).toISOString().slice(0, 10);
      const key = r.contenido_id ? `content_${r.contenido_id}` : r.juego_id ? `game_${r.juego_id}` : `eval_${r.evaluacion_id}`;
      if (!key) continue;
      if (!porDia.has(dia)) porDia.set(dia, new Set());
      porDia.get(dia).add(key);
    }
    let max = 0;
    for (const set of porDia.values()) {
      if (set.size > max) max = set.size;
    }
    return max;
  }

  static _maxRachaDias(dias) {
    if (dias.length === 0) return 0;
    const ordenados = [...new Set(dias)].sort();
    let rachaActual = 1;
    let maxRacha = 1;
    for (let i = 1; i < ordenados.length; i++) {
      const diff = (new Date(ordenados[i]) - new Date(ordenados[i - 1])) / 86400000;
      if (diff === 1) {
        rachaActual++;
        if (rachaActual > maxRacha) maxRacha = rachaActual;
      } else {
        rachaActual = 1;
      }
    }
    return maxRacha;
  }

  static _totalEstrellas(bestPerActivity, gameById) {
    let total = 0;
    for (const r of bestPerActivity) {
      if (r.contenido_id) continue;
      let pct = null;
      if (r.juego_id) {
        const juego = gameById.get(r.juego_id);
        pct = juego && juego.puntaje_max ? Math.round((r.puntaje / juego.puntaje_max) * 100) : null;
      } else if (r.evaluacion_id) {
        pct = r.puntaje;
      }
      total += StudentService.estrellasDePorcentaje(pct);
    }
    return total;
  }
}

module.exports = MedalsService;