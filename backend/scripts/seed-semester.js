const {
  sequelize,
  QueryTypes,
  MODULES,
  BANDS,
  SIM_PREFIX,
  MATERIA,
  makeRng,
  clamp,
  addDays,
  startOfDay,
  atTime,
  startOfWeek,
  isoDate,
  assertLocalTarget,
  ensureDocente,
  getStudents,
  insertRows,
  marcar,
} = require('./lib/seed-common');

const ProgressService = require('../src/services/progress.service');
const MedalsService = require('../src/services/medals.service');

const SEMANAS = 26;
const BAND_BY_STUDENT = {
  4606: 'Alto',
  4607: 'Superior',
  4608: 'Básico',
  4609: 'Alto',
  4610: 'Superior',
  4611: 'Básico',
  4612: 'Alto',
  4613: 'Bajo',
  4614: 'Superior',
  4615: 'Alto',
  4616: 'Básico',
  4617: 'Bajo',
  4618: 'Superior',
  4619: 'Alto',
  4620: 'Básico',
  4621: 'Bajo',
  4622: 'Alto',
  4623: 'Básico',
};

const DIAG_TARGETS = {
  Superior: { pre: [24, 27], post: [28, 30] },
  Alto: { pre: [19, 22], post: [24, 27] },
  Básico: { pre: [12, 16], post: [18, 22] },
  Bajo: { pre: [6, 10], post: [12, 16] },
};

const DIAG_ORDER = ['herramientas', 'informacion', 'seguridad'];

const marcadores = (ids) => ids.map(() => '?').join(',');
const itemKey = (item) => `${item.tipo}:${item.id}`;

const normalizarTipo = (tipo) => (tipo === 'contenido' ? 'contenido' : tipo);

const elegirOpcion = (pregunta, puntos) => {
  const opciones = Array.isArray(pregunta.opciones) ? pregunta.opciones : [];
  const exacta = opciones.find((o) => Number(o.puntos) === puntos);
  if (exacta) return exacta;
  const menores = opciones.filter((o) => Number(o.puntos) <= puntos).sort((a, b) => Number(b.puntos) - Number(a.puntos));
  return menores[0] || opciones[0] || { letra: 'A', puntos: 0 };
};

const puntosDisponibles = (pregunta) => {
  const opciones = Array.isArray(pregunta)
    ? pregunta
    : Array.isArray(pregunta.opciones) ? pregunta.opciones : [];
  return [...new Set(opciones.map((o) => Number(o.puntos) || 0))].sort((a, b) => a - b);
};

const sumasPosibles = (listas) => {
  let sumas = new Set([0]);
  for (const valores of listas) {
    const siguientes = new Set();
    for (const suma of sumas) {
      for (const valor of valores) siguientes.add(suma + valor);
    }
    sumas = siguientes;
  }
  return sumas;
};

const combinacionExacta = (listas, objetivo) => {
  let estados = new Map([[0, []]]);
  for (const valores of listas) {
    const siguientes = new Map();
    for (const [suma, elegidos] of estados) {
      for (const valor of valores) {
        const total = suma + valor;
        if (total > objetivo || siguientes.has(total)) continue;
        siguientes.set(total, [...elegidos, valor]);
      }
    }
    estados = siguientes;
  }
  return estados.get(objetivo) || null;
};

const planificarDimensiones = (dimensiones, objetivo) => {
  let exacto = null;
  let cercano = null;
  const camino = [];

  const recorrer = (indice, suma) => {
    if (indice === dimensiones.length) {
      const costo = camino.reduce(
        (s, valor, i) => s + Math.abs(valor - dimensiones[i].ideal),
        0
      );
      const plan = [...camino];
      if (suma === objetivo) {
        if (!exacto || costo < exacto.costo) exacto = { valores: plan, costo, exacto: true };
      } else if (!cercano || Math.abs(suma - objetivo) < cercano.distancia
        || (Math.abs(suma - objetivo) === cercano.distancia && costo < cercano.costo)) {
        cercano = { valores: plan, costo, distancia: Math.abs(suma - objetivo), exacto: false };
      }
      return;
    }
    for (const valor of dimensiones[indice].posibles) {
      camino.push(valor);
      recorrer(indice + 1, suma + valor);
      camino.pop();
    }
  };

  recorrer(0, 0);
  return exacto || cercano;
};

const opcionIncorrecta = (pregunta, rng) => {
  const letras = ['A', 'B', 'C', 'D'].filter((l) => l !== String(pregunta.respuesta_correcta).toUpperCase());
  return rng.pick(letras);
};

const detalleEvaluacion = (evaluacion, puntaje, completado, rng) => {
  const preguntas = evaluacion.preguntas;
  if (!completado) {
    const respondidas = rng.int(1, Math.max(1, preguntas.length - 2));
    return preguntas.map((p, i) => {
      if (i >= respondidas) {
        return {
          pregunta_id: p.id,
          opcion_elegida: null,
          respuesta_enviada: null,
          es_correcta: 0,
          respondida: 0,
          tiempo_seg: rng.int(4, 15),
        };
      }
      const correcta = rng.chance(0.35);
      const letra = correcta ? p.respuesta_correcta : opcionIncorrecta(p, rng);
      return {
        pregunta_id: p.id,
        opcion_elegida: String(letra).toLowerCase(),
        respuesta_enviada: String(letra).toUpperCase(),
        es_correcta: correcta ? 1 : 0,
        respondida: 1,
        tiempo_seg: rng.int(6, 30),
      };
    });
  }

  const aciertos = clamp(Math.round(puntaje / 20), 0, preguntas.length);
  const fallan = new Set(rng.shuffle(preguntas.map((_, i) => i)).slice(0, preguntas.length - aciertos));
  return preguntas.map((p, i) => {
    const correcta = !fallan.has(i);
    const letra = correcta ? p.respuesta_correcta : opcionIncorrecta(p, rng);
    return {
      pregunta_id: p.id,
      opcion_elegida: String(letra).toLowerCase(),
      respuesta_enviada: String(letra).toUpperCase(),
      es_correcta: correcta ? 1 : 0,
      respondida: 1,
      tiempo_seg: rng.int(7, 34),
    };
  });
};

const fallidos = (n, correctas, dificilIdx, rng) => {
  const aFallar = clamp(n - correctas, 0, n);
  const orden = [...Array(n).keys()].map((i) => ({
    i,
    k: (i === dificilIdx ? -0.7 : 0) + rng.rnd(),
  }));
  orden.sort((a, b) => a.k - b.k);
  return new Set(orden.slice(0, aFallar).map((o) => o.i));
};

const detalleJuego = (item, puntaje, completado, rng) => {
  const juego = item.juego;
  const config = juego.configuracion || {};
  const nota = completado ? puntaje : 0;

  if (juego.tipo === 'crucigrama') {
    const pistas = config.pistas || [];
    const dificilIdx = Math.max(0, pistas.findIndex((p) => p.dificil));
    const correctas = completado ? Math.round((nota / 100) * pistas.length) : rng.int(1, Math.max(1, pistas.length - 1));
    const fallan = fallidos(pistas.length, correctas, dificilIdx, rng);
    return pistas.map((p, i) => {
      const ok = !fallan.has(i);
      const mala = p.magnet || rng.pick(pistas.map((x) => x.palabra).filter((w) => w !== p.palabra));
      const dada = ok ? p.palabra : rng.chance(0.75) ? mala : null;
      return {
        elemento_clave: `pista_${p.numero ?? i + 1}`,
        elemento_tipo: 'pista',
        esperado: p.palabra,
        respuesta_dada: dada,
        es_correcta: ok ? 1 : 0,
        respondido: dada == null ? 0 : 1,
        concepto: p.pista,
      };
    });
  }

  if (juego.tipo === 'sopa_de_letras') {
    const palabras = config.palabras || [];
    const dificilIdx = Math.max(0, palabras.findIndex((p) => p.dificil));
    const correctas = completado ? Math.round((nota / 100) * palabras.length) : rng.int(1, Math.max(1, palabras.length - 1));
    const fallan = fallidos(palabras.length, correctas, dificilIdx, rng);
    return palabras.map((p, i) => {
      const ok = !fallan.has(i);
      return {
        elemento_clave: `palabra_${i}`,
        elemento_tipo: 'palabra',
        esperado: String(p.palabra).toUpperCase().replace(/\s/g, ''),
        respuesta_dada: ok ? String(p.palabra).toUpperCase().replace(/\s/g, '') : null,
        es_correcta: ok ? 1 : 0,
        respondido: 1,
        concepto: p.palabra,
      };
    });
  }

  if (juego.tipo === 'relacionar') {
    const pares = config.pares || [];
    const dificilIdx = Math.max(0, pares.findIndex((p) => p.dificil));
    const correctas = completado ? Math.round((nota / 100) * pares.length) : rng.int(1, Math.max(1, pares.length - 1));
    const fallan = fallidos(pares.length, correctas, dificilIdx, rng);
    return pares.map((p, i) => {
      const ok = !fallan.has(i);
      const mala = p.magnet || rng.pick(pares.filter((_, j) => j !== i).map((x) => x.columnaB));
      const dada = ok ? p.columnaB : rng.chance(0.75) ? mala : null;
      return {
        elemento_clave: `par_${i}`,
        elemento_tipo: 'relacion',
        esperado: p.columnaB,
        respuesta_dada: dada,
        es_correcta: ok ? 1 : 0,
        respondido: dada == null ? 0 : 1,
        concepto: p.columnaA,
      };
    });
  }

  if (juego.tipo === 'memoria') {
    const nPares = (config.pares || []).length;
    const intentos = completado
      ? nPares + Math.max(0, Math.round((100 - nota) / 8))
      : nPares + rng.int(2, 8);
    return [{
      elemento_clave: 'memoria',
      elemento_tipo: 'memoria',
      esperado: String(nPares),
      respuesta_dada: String(intentos),
      es_correcta: intentos <= nPares ? 1 : 0,
      respondido: 1,
      concepto: 'Memotest',
    }];
  }

  if (juego.tipo === 'adivinanza') {
    const correcta = config.respuestaCorrecta || '';
    const ok = completado && nota >= 60;
    return [{
      elemento_clave: 'adivinanza',
      elemento_tipo: 'adivinanza',
      esperado: correcta,
      respuesta_dada: ok ? correcta : config.magnet || null,
      es_correcta: ok ? 1 : 0,
      respondido: 1,
      concepto: config.adivinanza || 'Adivinanza',
    }];
  }

  return [];
};

const construirCatalogo = async (docenteId) => {
  const nombres = MODULES.map((m) => m.nombre);
  const marco = nombres.map(() => '?').join(',');

  const [contenidos, juegos, evaluaciones] = await Promise.all([
    sequelize.query(
      `SELECT id, titulo, modulo FROM contenidos WHERE docente_id = ? AND publicado = 1 AND modulo IN (${marco})`,
      { replacements: [docenteId, ...nombres], type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT id, titulo, modulo, tipo, puntaje_max, configuracion FROM juegos WHERE docente_id = ? AND publicado = 1 AND modulo IN (${marco})`,
      { replacements: [docenteId, ...nombres], type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT id, titulo, modulo FROM evaluaciones WHERE docente_id = ? AND publicado = 1 AND modulo IN (${marco})`,
      { replacements: [docenteId, ...nombres], type: QueryTypes.SELECT }
    ),
  ]);

  const evalIds = evaluaciones.map((e) => Number(e.id));
  const preguntas = evalIds.length
    ? await sequelize.query(
        `SELECT id, evaluacion_id, pregunta, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, subtema
           FROM preguntas WHERE evaluacion_id IN (${marcadores(evalIds)}) ORDER BY id`,
        { replacements: evalIds, type: QueryTypes.SELECT }
      )
    : [];

  const preguntasPorEval = new Map();
  for (const p of preguntas) {
    if (!preguntasPorEval.has(Number(p.evaluacion_id))) preguntasPorEval.set(Number(p.evaluacion_id), []);
    preguntasPorEval.get(Number(p.evaluacion_id)).push(p);
  }

  const contenidoPorId = new Map(contenidos.map((c) => [Number(c.id), c]));
  const juegoPorId = new Map(juegos.map((g) => [Number(g.id), g]));
  const evaluacionPorId = new Map(evaluaciones.map((e) => [Number(e.id), e]));

  const modulos = MODULES.map((modulo) => {
    const items = [];

    for (const id of modulo.contenidos) {
      const c = contenidoPorId.get(Number(id));
      if (!c) throw new Error(`Falta contenido ${id} en ${modulo.nombre}`);
      items.push({ tipo: 'contenido', id: Number(id), titulo: c.titulo, modulo: modulo.nombre, max: null });
    }

    for (const id of modulo.juegos) {
      const g = juegoPorId.get(Number(id));
      if (!g) throw new Error(`Falta juego ${id} en ${modulo.nombre}`);
      let configuracion = {};
      try { configuracion = JSON.parse(g.configuracion || '{}'); } catch { configuracion = {}; }
      items.push({
        tipo: 'juego',
        id: Number(id),
        titulo: g.titulo,
        modulo: modulo.nombre,
        max: Number(g.puntaje_max) || 100,
        juego: { ...g, configuracion },
      });
    }

    for (const id of modulo.evaluaciones) {
      const e = evaluacionPorId.get(Number(id));
      if (!e) throw new Error(`Falta evaluación ${id} en ${modulo.nombre}`);
      const propias = preguntasPorEval.get(Number(id)) || [];
      if (!propias.length) throw new Error(`La evaluación ${id} no tiene preguntas.`);
      items.push({
        tipo: 'evaluacion',
        id: Number(id),
        titulo: e.titulo,
        modulo: modulo.nombre,
        max: 100,
        preguntas: propias,
      });
    }

    return { ...modulo, items };
  });

  const items = modulos.flatMap((m) => m.items);
  const porClave = new Map(items.map((i) => [itemKey(i), i]));
  return { modulos, items, porClave };
};

const rangoModulo = (semana) => {
  if (semana <= 3) return ['M1'];
  if (semana <= 7) return ['M2'];
  if (semana <= 11) return ['M3'];
  if (semana <= 15) return ['M4'];
  if (semana <= 21) return ['M5'];
  return ['M1', 'M2', 'M3', 'M4', 'M5'];
};

const elegirItem = ({ sem, pendientes, modulosPorClave, rng }) => {
  const keys = rangoModulo(sem);
  const preferidos = [...pendientes].filter((clave) => {
    const item = modulosPorClave.item(clave);
    const modulo = MODULES.find((m) => m.nombre === item?.modulo);
    return modulo && keys.includes(modulo.key);
  });

  if (preferidos.length) return modulosPorClave.item(rng.pick(preferidos));

  const pool = keys.flatMap((k) => modulosPorClave.modulo(k)?.items || []);
  return rng.pick(pool.length ? pool : modulosPorClave.all());
};

const construirSnapshot = ({ docente, mes, desde, hasta, intentos, estudiantes, resumen }) => {
  const secciones = ['resumen', 'grupo', 'estudiantes', 'temas'];
  const alias = (nombre) => {
    const partes = String(nombre).trim().split(/\s+/);
    return `${partes[0] || 'Estudiante'} ${(partes[1] || '').slice(0, 1)}.`.trim();
  };

  const filas = estudiantes.map((e) => {
    const propios = intentos.filter((i) => i.estudiante_id === e.id);
    const puntuados = propios.filter((i) => i.puntaje_maximo > 0 && i.puntaje_obtenido != null);
    const pct = puntuados.length
      ? Math.round(puntuados.reduce((s, i) => s + (100 * i.puntaje_obtenido) / i.puntaje_maximo, 0) / puntuados.length)
      : null;
    const xp = puntuados.reduce((s, i) => s + Number(i.puntaje_obtenido || 0), 0);
    const nivel = pct == null ? 'Sin datos' : pct >= 90 ? 'Superior' : pct >= 70 ? 'Alto' : pct >= 50 ? 'Básico' : 'Bajo';
    return {
      alias: alias(e.name),
      nivel,
      pct: pct == null ? '—' : `${pct}%`,
      xp,
      intentos: propios.length,
      completados: propios.filter((i) => Number(i.completado) === 1).length,
    };
  });

  return {
    titulo: `Reporte mensual de progreso | ${mes}`,
    generado_en: hasta.toISOString(),
    docente: { id: docente.id, nombre: docente.name },
    alcance: {
      grupo_id: null,
      grupo_nombre: null,
      grupo_materia: MATERIA,
      estudiantes: estudiantes.length,
      grupos: resumen.grupos,
    },
    periodo: { semanas: 4, desde: isoDate(desde), hasta: isoDate(new Date(hasta.getTime() - 86400000)) },
    secciones,
    secciones_etiquetas: ['Resumen general', 'Vista de grupo', 'Estudiantes', 'Progreso por tema'],
    incluir_nombres: false,
    kpis: [
      { etiqueta: 'Progreso medio', valor: resumen.pct == null ? '—' : `${resumen.pct}%`, detalle: `${resumen.intentos} intentos` },
      { etiqueta: 'Participación', valor: `${resumen.participacion}%`, detalle: `${resumen.activos} de ${estudiantes.length} estudiantes` },
      { etiqueta: 'Estudiantes en riesgo', valor: String(resumen.riesgo), detalle: 'Bajo rendimiento o inactividad' },
      { etiqueta: 'XP promedio', valor: String(resumen.xp), detalle: 'Puntos acumulados en el mes' },
    ],
    tablas: [
      {
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
        filas,
        nota: 'Se muestran alias para proteger la identidad de los estudiantes.',
      },
    ],
    notas: [
      'Reporte generado a partir de datos simulados de 26 semanas.',
      'Las cifras corresponden al mes indicado y no se recalculan al descargar.',
    ],
  };
};

async function main() {
  assertLocalTarget();

  const ahora = new Date();
  const docente = await ensureDocente();
  const estudiantesBase = await getStudents(docente.id);
  const estudiantes = [];
  const vistos = new Set();
  for (const e of estudiantesBase) {
    if (vistos.has(e.id)) continue;
    vistos.add(e.id);
    estudiantes.push(e);
  }

  if (estudiantes.length !== 18) {
    throw new Error(`Se esperaban 18 estudiantes docengra.demo y llegaron ${estudiantes.length}.`);
  }

  const previos = await sequelize.query(
    `SELECT COUNT(*) n FROM actividad_intentos WHERE docente_id = ? AND estudiante_id IN (${marcadores(estudiantes.map((e) => e.id))})`,
    { replacements: [docente.id, ...estudiantes.map((e) => e.id)], type: QueryTypes.SELECT }
  );
  if (Number(previos[0].n) > 0) {
    throw new Error('Ya hay telemetría para estos estudiantes. Ejecuta seed:reset-students -- --confirm antes de simular.');
  }

  const grupos = await sequelize.query(
    'SELECT id, nombre FROM grupos WHERE docente_id = ? ORDER BY id',
    { replacements: [docente.id], type: QueryTypes.SELECT }
  );
  const grupoPorId = new Map(grupos.map((g) => [Number(g.id), g]));

  const catalogo = await construirCatalogo(docente.id);
  const maxPuntuable = catalogo.items
    .filter((i) => i.tipo !== 'contenido')
    .reduce((s, i) => s + (i.tipo === 'evaluacion' ? 100 : i.max || 100), 0);

  if (catalogo.modulos.length !== MODULES.length || maxPuntuable !== 700) {
    throw new Error(`Catálogo inesperado: ${catalogo.modulos.length} módulos y ${maxPuntuable} puntos máximos. Corre seed:catalog primero.`);
  }

  const modulosPorClave = {
    modulo: (key) => catalogo.modulos.find((m) => m.key === key),
    item: (clave) => catalogo.porClave.get(clave),
    all: () => catalogo.items,
  };

  const currentMonday = startOfWeek(ahora);
  const inactivos = new Map([
    [4621, addDays(ahora, -12)],
    [4623, addDays(ahora, -7)],
  ]);

  const pendientes = new Map();
  const intentosPorItem = new Map();
  const progreso = new Map();
  const ultimaSesion = new Map();

  for (const est of estudiantes) {
    pendientes.set(est.id, new Set(catalogo.items.map(itemKey)));
  }

  const intentos = [];
  const detalleEval = [];
  const detallesJuego = [];
  const sesiones = [];

  const perfiles = new Map();
  for (const est of estudiantes) {
    const rng = makeRng(286400 + est.id);
    const banda = BAND_BY_STUDENT[est.id] || 'Básico';
    const config = BANDS[banda];
    const dedicacion = config.dedication[0] + rng.rnd() * (config.dedication[1] - config.dedication[0]);
    const offset = rng.int(-3, 3);
    perfiles.set(est.id, { banda, config, dedicacion, offset, rng });
  }

  for (let sem = 0; sem < SEMANAS; sem += 1) {
    const monday = addDays(currentMonday, -(SEMANAS - 1 - sem) * 7);
    const offsets = sem === 0 ? [1, 2, 3, 4] : [0, 1, 2, 3, 4];
    const dias = offsets.map((d) => addDays(monday, d)).filter((d) => d <= ahora);
    const esRepaso = sem >= SEMANAS - 4;

    for (const est of estudiantes) {
      const perfil = perfiles.get(est.id);
      const corte = inactivos.get(est.id);
      const disponibles = dias.filter((d) => !corte || d <= corte);
      if (!disponibles.length) continue;

      if (!esRepaso) {
        const probabilidadSemana = clamp(perfil.dedicacion + 0.06, 0.5, 0.98);
        if (!perfil.rng.chance(probabilidadSemana)) continue;
      }

      const baseDias = perfil.dedicacion >= 0.85 ? 4 : perfil.dedicacion >= 0.7 ? 3 : 2;
      const maxDias = esRepaso ? 4 : baseDias;
      const elegidos = perfil.rng.shuffle(disponibles).slice(0, Math.min(maxDias, disponibles.length));

      for (const dia of elegidos) {
        const nActs = esRepaso
          ? (pendientes.get(est.id).size > 0 ? 3 : perfil.rng.chance(0.4) ? 2 : 1)
          : perfil.rng.chance(0.58) ? 2 : 1;
        const inicioSesion = atTime(dia, perfil.rng.int(8, 11), perfil.rng.int(0, 59));
        const esHoy = startOfDay(dia).getTime() === startOfDay(ahora).getTime();
        if (esHoy) {
          const tope = new Date(ahora.getTime() - 60 * 60 * 1000);
          if (inicioSesion > tope) inicioSesion.setTime(tope.getTime());
        }
        if (inicioSesion > ahora) continue;

        let cursor = new Date(inicioSesion);
        let duracionSesion = 0;

        for (let act = 0; act < nActs; act += 1) {
          const item = elegirItem({
            sem,
            pendientes: pendientes.get(est.id),
            modulosPorClave,
            rng: perfil.rng,
          });
          if (!item) continue;

          const clave = `${est.id}:${itemKey(item)}`;
          const conteo = intentosPorItem.get(clave) || { n: 0, completado: false };
          const numeroIntento = conteo.n + 1;
          const yaCompletado = conteo.completado;
          const esContenido = item.tipo === 'contenido';

          let abandona = !esContenido && !yaCompletado
            ? perfil.rng.chance(perfil.config.abandon * 0.45)
            : !esContenido && perfil.rng.chance(perfil.config.abandon);
          if (!yaCompletado && esContenido) abandona = false;

          let puntaje = null;
          if (!esContenido && !abandona) {
            if (item.tipo === 'evaluacion') {
              const base = perfil.config.eval;
              const primerIntento = numeroIntento === 1 && !yaCompletado && perfil.rng.chance(0.6);
              puntaje = primerIntento ? perfil.config.firstNameEval : base;
            } else {
              const base = perfil.rng.int(perfil.config.game[0], perfil.config.game[1]) + perfil.offset;
              const primerIntento = numeroIntento === 1 && !yaCompletado && perfil.rng.chance(0.55);
              puntaje = clamp(
                primerIntento ? base - perfil.rng.int(2, 4) : base,
                perfil.config.game[0],
                perfil.config.game[1]
              );
            }
          }

          if (!esContenido && puntaje != null && item.tipo === 'evaluacion') {
            puntaje = clamp(Math.round(puntaje / 20) * 20, 0, 100);
          }

          const duracion = esContenido
            ? perfil.rng.int(240, 780)
            : abandona
              ? perfil.rng.int(35, 170)
              : perfil.rng.int(140, 780);

          const iniciado = new Date(cursor.getTime());
          const cerrado = abandona || esContenido
            ? new Date(iniciado.getTime() + duracion * 1000)
            : new Date(iniciado.getTime() + duracion * 1000);

          const row = [
            est.id,
            docente.id,
            est.grupo_id ? Number(est.grupo_id) : null,
            normalizarTipo(item.tipo),
            item.id,
            item.modulo,
            numeroIntento,
            puntaje,
            esContenido ? null : item.max,
            !esContenido && item.tipo === 'evaluacion' && puntaje != null ? Math.round(puntaje / 20) : null,
            !esContenido && item.tipo === 'evaluacion' ? item.preguntas.length : null,
            numeroIntento === 1 && !esContenido ? (puntaje != null && puntaje >= 80 ? 1 : 0) : null,
            duracion,
            iniciado,
            esContenido || !abandona ? 1 : 0,
            esContenido ? 0 : abandona ? 1 : 0,
            esContenido || !abandona ? cerrado : null,
          ];

          const idx = intentos.length;
          intentos.push(row);

          if (!esContenido && item.tipo === 'evaluacion') {
            detalleEval.push({ idx, filas: detalleEvaluacion(item, puntaje, !abandona, perfil.rng) });
          } else if (!esContenido) {
            detallesJuego.push({ idx, filas: detalleJuego(item, puntaje, !abandona, perfil.rng) });
          }

          const previo = progreso.get(clave);
          const completado = esContenido || !abandona;
          if (completado) {
            pendientes.get(est.id).delete(itemKey(item));
            const puntajeFinal = esContenido ? 0 : puntaje;
            progreso.set(clave, {
              estudiante_id: est.id,
              tipo: item.tipo,
              actividad_id: item.id,
              puntaje: previo ? Math.max(previo.puntaje, puntajeFinal) : puntajeFinal,
              fecha: iniciado,
              intentos: numeroIntento,
              completado: true,
              feedback_visto: perfil.rng.chance(0.7) ? 1 : 0,
            });
          } else if (previo) {
            previo.intentos = numeroIntento;
          }

          if (!intentosPorItem.has(clave)) intentosPorItem.set(clave, { n: 0, completado: false });
          const registro = intentosPorItem.get(clave);
          registro.n += 1;
          if (completado) registro.completado = true;

          cursor = new Date(cursor.getTime() + duracion * 1000 + perfil.rng.int(60, 240) * 1000);
          duracionSesion += duracion + perfil.rng.int(60, 240);
        }

        const fin = new Date(Math.min(
          cursor.getTime(),
          ahora.getTime()
        ));
        if (fin <= inicioSesion) continue;

        const ultimo = ultimaSesion.get(est.id);
        if (!ultimo || fin > ultimo) ultimaSesion.set(est.id, fin);

        sesiones.push([
          est.id,
          docente.id,
          est.grupo_id ? Number(est.grupo_id) : null,
          inicioSesion,
          fin,
          Math.max(1, Math.round((fin.getTime() - inicioSesion.getTime()) / 1000)),
          0,
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36',
          fin,
        ]);
      }
    }
  }

  const incompletos = [];
  for (const [estudianteId, faltantes] of pendientes) {
    if (faltantes.size) incompletos.push(`${estudianteId} (${[...faltantes].join(', ')})`);
  }
  if (incompletos.length) {
    throw new Error(`Quedaron actividades sin completar: ${incompletos.join('; ')}`);
  }

  const columnasIntento = [
    'estudiante_id', 'docente_id', 'grupo_id', 'tipo', 'actividad_id', 'modulo', 'numero_intento',
    'puntaje_obtenido', 'puntaje_maximo', 'aciertos', 'preguntas_total', 'acierto_primer_intento',
    'duracion_seg', 'iniciado_en', 'completado', 'abandono', 'cerrado_en',
  ];

  const idsIntentos = [];
  for (let i = 0; i < intentos.length; i += 400) {
    const grupo = intentos.slice(i, i + 400);
    const filaSql = `(${columnasIntento.map(() => '?').join(',')})`;
    const sql = `INSERT INTO actividad_intentos (${columnasIntento.map((c) => `\`${c}\``).join(',')}) VALUES ${grupo.map(() => filaSql).join(',')}`;
    const [primerId] = await sequelize.query(sql, {
      replacements: grupo.flat(),
      type: QueryTypes.INSERT,
    });
    for (let j = 0; j < grupo.length; j += 1) idsIntentos[i + j] = Number(primerId) + j;
  }

  const filasEval = [];
  for (const detalle of detalleEval) {
    const intentoId = idsIntentos[detalle.idx];
    for (const f of detalle.filas) {
      filasEval.push([
        intentoId, f.pregunta_id, f.opcion_elegida, f.respuesta_enviada,
        f.es_correcta, f.respondida, f.tiempo_seg,
      ]);
    }
  }

  const filasJuego = [];
  for (const detalle of detallesJuego) {
    const intentoId = idsIntentos[detalle.idx];
    for (const f of detalle.filas) {
      filasJuego.push([
        intentoId, f.elemento_clave, f.elemento_tipo, f.esperado,
        f.respuesta_dada, f.es_correcta, f.respondido, f.concepto,
      ]);
    }
  }

  if (filasEval.length) {
    await insertRows(
      'evaluacion_intento_respuestas',
      ['intento_id', 'pregunta_id', 'opcion_elegida', 'respuesta_enviada', 'es_correcta', 'respondida', 'tiempo_seg'],
      filasEval
    );
  }

  if (filasJuego.length) {
    await insertRows(
      'juego_intento_elementos',
      ['intento_id', 'elemento_clave', 'elemento_tipo', 'esperado', 'respuesta_dada', 'es_correcta', 'respondido', 'concepto'],
      filasJuego
    );
  }

  await insertRows(
    'estudiante_sesion',
    ['estudiante_id', 'docente_id', 'grupo_id', 'iniciado_en', 'ultimo_heartbeat', 'duracion_seg', 'activa', 'user_agent', 'cerrada_en'],
    sesiones
  );

  const filasProgreso = [];
  for (const p of progreso.values()) {
    filasProgreso.push([
      p.estudiante_id,
      p.tipo === 'contenido' ? p.actividad_id : null,
      p.tipo === 'juego' ? p.actividad_id : null,
      p.tipo === 'evaluacion' ? p.actividad_id : null,
      1,
      p.puntaje,
      p.fecha,
      p.intentos,
      p.feedback_visto,
      null,
    ]);
  }

  await insertRows(
    'progreso_estudiante',
    ['estudiante_id', 'contenido_id', 'juego_id', 'evaluacion_id', 'completado', 'puntaje', 'fecha', 'intentos_realizados', 'feedback_visto', 'respuestas'],
    filasProgreso
  );

  for (const est of estudiantes) {
    await ProgressService.recalcularProgresoParaEstudiante(est.id);
  }

  const idsEstudiantes = estudiantes.map((e) => e.id);
  await sequelize.query(
    `UPDATE progreso p
       JOIN (
         SELECT estudiante_id, modulo, MAX(iniciado_en) AS ultima
           FROM actividad_intentos
          WHERE docente_id = ? AND estudiante_id IN (${marcadores(idsEstudiantes)})
          GROUP BY estudiante_id, modulo
       ) x ON x.estudiante_id = p.usuario_id AND x.modulo = p.modulo
        SET p.ultima_actividad = x.ultima`,
    { replacements: [docente.id, ...idsEstudiantes] }
  );

  for (const est of estudiantes) {
    if (!ultimaSesion.has(est.id)) continue;
    await sequelize.query('UPDATE users SET last_login_at = ? WHERE id = ?', {
      replacements: [ultimaSesion.get(est.id), est.id],
    });
  }

  const catalogoMedallas = MedalsService.catalogo();
  const medallas = [];
  for (const est of estudiantes) {
    const gamificacion = await MedalsService.obtenerGamificacion(est.id, docente.id);
    const propios = intentos.filter((i) => i[0] === est.id);
    const fechas = propios.map((i) => new Date(i[13]).getTime()).filter(Number.isFinite);
    const desde = fechas.length ? Math.min(...fechas) : ahora.getTime();
    const hasta = fechas.length ? Math.max(...fechas) : ahora.getTime();
    const rng = makeRng(990000 + est.id);
    for (const medalla of gamificacion.medallas) {
      if (!medalla.obtenida) continue;
      const fecha = new Date(desde + rng.rnd() * Math.max(1, hasta - desde));
      medallas.push([
        est.id,
        docente.id,
        medalla.id,
        catalogoMedallas.get(medalla.id)?.categoria || medalla.categoria || 'general',
        fecha,
      ]);
    }
  }

  if (medallas.length) {
    await insertRows(
      'medallas_obtenidas',
      ['estudiante_id', 'docente_id', 'medalla_id', 'categoria', 'obtenido_en'],
      medallas,
      { ignore: true }
    );
  }

  const preguntasDiag = await sequelize.query(
    'SELECT id, dimension, dimension_nombre, orden, opciones FROM diagnostico_preguntas WHERE activo = 1 ORDER BY orden',
    { type: QueryTypes.SELECT }
  );
  const totalesDiag = sumasPosibles(
    preguntasDiag.map((p) => puntosDisponibles(JSON.parse(p.opciones || '[]')))
  );

  const aplicaciones = [];
  const respuestasDiag = [];
  const preFecha = atTime(addDays(currentMonday, -(SEMANAS - 1) * 7 + 1), 8, 0);
  const postFecha = atTime(addDays(currentMonday, -7), 10, 0);

  for (const est of estudiantes) {
    const perfil = perfiles.get(est.id);
    const rng = makeRng(770000 + est.id);
    const rangos = DIAG_TARGETS[perfil.banda] || DIAG_TARGETS.Básico;

    for (const tipo of ['pre', 'post']) {
      const [min, max] = rangos[tipo];
      let objetivo = rng.int(min, max);
      if (!totalesDiag.has(objetivo)) {
        const alcanzables = [...totalesDiag]
          .filter((n) => n >= min && n <= max)
          .sort((a, b) => Math.abs(a - objetivo) - Math.abs(b - objetivo));
        if (alcanzables.length) objetivo = alcanzables[0];
      }
      const porDimension = DIAG_ORDER.map((key) => {
        const propias = preguntasDiag.filter((p) => p.dimension === key);
        const valores = propias.map((p) => puntosDisponibles(JSON.parse(p.opciones || '[]')));
        const maximo = valores.reduce((s, opciones) => s + Math.max(...opciones), 0);
        return {
          key,
          propias,
          valores,
          maximo,
          posibles: [...sumasPosibles(valores)].sort((a, b) => a - b),
          ideal: (objetivo * maximo) / 30,
        };
      });

      const plan = planificarDimensiones(porDimension, objetivo);
      if (!plan || !plan.exacto) {
        throw new Error(`No hay combinación exacta de ${objetivo} puntos para el diagnóstico de ${est.id}.`);
      }

      const puntosPorPregunta = new Map();
      porDimension.forEach((dim, i) => {
        const combinacion = combinacionExacta(dim.valores, plan.valores[i]);
        if (!combinacion) {
          throw new Error(`No se pudo repartir ${plan.valores[i]} puntos en ${dim.key} para ${est.id}.`);
        }
        dim.objetivo = plan.valores[i];
        dim.propias.forEach((p, j) => puntosPorPregunta.set(p.id, combinacion[j]));
      });

      const dimensiones = [];
      const respuestas = [];
      for (const dim of porDimension) {
        let obtenido = 0;
        for (const p of dim.propias) {
          const opciones = JSON.parse(p.opciones || '[]');
          const puntos = puntosPorPregunta.get(p.id) || 0;
          const opcion = elegirOpcion({ opciones }, puntos);
          obtenido += Number(opcion.puntos) || 0;
          respuestas.push([null, p.id, String(opcion.letra).toUpperCase(), Number(opcion.puntos) || 0]);
        }
        dimensiones.push({
          key: dim.key,
          nombre: dim.propias[0]?.dimension_nombre || dim.key,
          obtenido,
          maximo: dim.maximo,
          porcentaje: dim.maximo ? Math.round((obtenido / dim.maximo) * 100) : 0,
        });
      }

      const puntajeTotal = dimensiones.reduce((s, d) => s + d.obtenido, 0);
      const nivel = puntajeTotal >= 23 ? 'Alto' : puntajeTotal >= 15 ? 'Medio' : 'Bajo';
      const ordenadas = [...dimensiones].sort((a, b) => b.porcentaje - a.porcentaje);
      const pctInicial = clamp(Math.round((puntajeTotal / 30) * 100) - 10, 15, 85);
      const porModulo = {};
      for (const modulo of catalogo.modulos) porModulo[modulo.nombre] = { pct: pctInicial };

      const desglose = {
        dimensiones,
        fortaleza: ordenadas[0] ? { nombre: ordenadas[0].nombre, porcentaje: ordenadas[0].porcentaje } : null,
        oportunidad: ordenadas.length ? {
          nombre: ordenadas[ordenadas.length - 1].nombre,
          porcentaje: ordenadas[ordenadas.length - 1].porcentaje,
        } : null,
        por_modulo: porModulo,
      };

      const fecha = tipo === 'pre' ? preFecha : postFecha;
      aplicaciones.push({
        estudiante_id: est.id,
        estado: 'completado',
        puntaje_total: puntajeTotal,
        nivel,
        desglose: JSON.stringify(desglose),
        aplicada_en: fecha,
        createdAt: fecha,
        updatedAt: fecha,
        tipo,
        respuestas,
      });
    }
  }

  const columnasApp = ['estudiante_id', 'estado', 'puntaje_total', 'nivel', 'desglose', 'aplicada_en', 'createdAt', 'updatedAt', 'tipo'];
  const idsApps = [];
  for (let i = 0; i < aplicaciones.length; i += 200) {
    const grupo = aplicaciones.slice(i, i + 200);
    const filaSql = `(${columnasApp.map(() => '?').join(',')})`;
    const sql = `INSERT INTO diagnostico_aplicaciones (${columnasApp.map((c) => `\`${c}\``).join(',')}) VALUES ${grupo.map(() => filaSql).join(',')}`;
    const [primerId] = await sequelize.query(sql, {
      replacements: grupo.flatMap((a) => columnasApp.map((c) => a[c])),
      type: QueryTypes.INSERT,
    });
    for (let j = 0; j < grupo.length; j += 1) idsApps[i + j] = Number(primerId) + j;
  }

  aplicaciones.forEach((app, i) => {
    for (const r of app.respuestas) {
      respuestasDiag.push([idsApps[i], ...r.slice(1), app.aplicada_en, app.aplicada_en]);
    }
  });

  if (respuestasDiag.length) {
    await insertRows(
      'diagnostico_respuestas',
      ['aplicacion_id', 'pregunta_id', 'letra', 'puntaje', 'createdAt', 'updatedAt'],
      respuestasDiag
    );
  }

  const inicioSchedule = new Date(ahora.getFullYear(), ahora.getMonth() - 2, 1);
  const proxima = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1, 9, 0, 0, 0);
  const secciones = JSON.stringify(['resumen', 'grupo', 'estudiantes', 'temas']);
  const [scheduleId] = await sequelize.query(
    `INSERT INTO report_schedules
       (docente_id, grupo_id, nombre, frecuencia_meses, fecha_inicio, proxima_ejecucion, formato, secciones, canal, activo, ultima_ejecucion, incluir_nombres)
     VALUES (?, NULL, ?, 1, ?, ?, 'pdf', ?, 'app', 1, ?, 0)`,
    {
      replacements: [
        docente.id,
        `${SIM_PREFIX} Reporte mensual de progreso`,
        isoDate(inicioSchedule),
        proxima,
        secciones,
        ahora,
      ],
      type: QueryTypes.INSERT,
    }
  );

  const runs = [];
  for (let atras = 2; atras >= 0; atras -= 1) {
    const desde = new Date(ahora.getFullYear(), ahora.getMonth() - atras, 1);
    const hastaMes = new Date(ahora.getFullYear(), ahora.getMonth() - atras + 1, 1);
    const hasta = new Date(Math.min(hastaMes.getTime(), ahora.getTime()));
    const mes = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}`;
    const propios = intentos.filter((i) => {
      const f = new Date(i[13]).getTime();
      return f >= desde.getTime() && f < hasta.getTime();
    });
    const puntuados = propios.filter((i) => i[8] > 0 && i[7] != null);
    const pct = puntuados.length
      ? Math.round(puntuados.reduce((s, i) => s + (100 * i[7]) / i[8], 0) / puntuados.length)
      : null;
    const activos = new Set(propios.map((i) => i[0])).size;
    const xp = puntuados.reduce((s, i) => s + Number(i[7] || 0), 0);
    const riesgo = estudiantes.filter((e) => (BAND_BY_STUDENT[e.id] || 'Básico') === 'Bajo').length;

    const snapshot = construirSnapshot({
      docente,
      mes,
      desde,
      hasta,
      intentos: propios.map((i) => ({
        estudiante_id: i[0],
        puntaje_obtenido: i[7],
        puntaje_maximo: i[8],
        completado: i[14],
      })),
      estudiantes,
      resumen: {
        grupos: grupos.length,
        intentos: propios.length,
        activos,
        participacion: Math.round((activos / estudiantes.length) * 100),
        pct,
        xp: Math.round(xp / Math.max(1, activos)),
        riesgo,
      },
    });

    runs.push({
      schedule_id: scheduleId,
      docente_id: docente.id,
      grupo_id: null,
      disparador: 'programado',
      estado: 'generado',
      periodo_desde: isoDate(desde),
      periodo_hasta: isoDate(new Date(hasta.getTime() - 86400000)),
      formato: 'pdf',
      secciones,
      payload: JSON.stringify(snapshot),
      canal: 'app',
      correo_enviado: 0,
      generado_en: hasta,
      creado_en: hasta,
    });
  }

  await insertRows(
    'report_runs',
    ['schedule_id', 'docente_id', 'grupo_id', 'disparador', 'estado', 'periodo_desde', 'periodo_hasta', 'formato', 'secciones', 'payload', 'canal', 'correo_enviado', 'generado_en', 'creado_en'],
    runs.map((r) => [
      r.schedule_id, r.docente_id, r.grupo_id, r.disparador, r.estado, r.periodo_desde,
      r.periodo_hasta, r.formato, r.secciones, r.payload, r.canal, r.correo_enviado,
      r.generado_en, r.creado_en,
    ])
  );

  const runIds = await sequelize.query(
    'SELECT id, generado_en FROM report_runs WHERE schedule_id = ? ORDER BY id',
    { replacements: [scheduleId], type: QueryTypes.SELECT }
  );

  const notificaciones = runIds.map((r, i) => [
    docente.id,
    'reporte',
    `${SIM_PREFIX} Reporte listo: Reporte mensual de progreso`,
    'El reporte mensual está disponible en la sección Reportes.',
    JSON.stringify({ run_id: r.id, schedule_id: scheduleId, secciones: ['resumen', 'grupo', 'estudiantes', 'temas'], formato: 'pdf' }),
    i === runIds.length - 1 ? 0 : 1,
    i === runIds.length - 1 ? null : r.generado_en,
    r.generado_en,
  ]);

  if (notificaciones.length) {
    await insertRows(
      'notifications',
      ['docente_id', 'tipo', 'titulo', 'mensaje', 'data', 'leido', 'leido_en', 'creado_en'],
      notificaciones
    );
  }

  const totales = await sequelize.query(
    `SELECT COUNT(*) intentos, SUM(completado) completados, SUM(abandono) abandonos,
            COUNT(DISTINCT estudiante_id) estudiantes
       FROM actividad_intentos WHERE docente_id = ?`,
    { replacements: [docente.id], type: QueryTypes.SELECT }
  );

  const progresos = await sequelize.query(
    'SELECT COUNT(*) n FROM progreso WHERE usuario_id IN (' + marcadores(idsEstudiantes) + ')',
    { replacements: idsEstudiantes, type: QueryTypes.SELECT }
  );

  marcar('Simulación de 26 semanas');
  console.table({
    intentos: Number(totales[0].intentos),
    completados: Number(totales[0].completados),
    abandonos: Number(totales[0].abandonos),
    estudiantes: Number(totales[0].estudiantes),
    sesiones: sesiones.length,
    progreso_estudiante: filasProgreso.length,
    progreso: Number(progresos[0].n),
    medallas: medallas.length,
    diagnosticos: aplicaciones.length,
    respuestas_diagnostico: respuestasDiag.length,
    reportes: runs.length,
  });

  const notas = estudiantes.map((e) => {
    const propios = [...progreso.entries()].filter(([clave]) => clave.startsWith(`${e.id}:`)).map(([, p]) => p);
    const obtenido = propios.reduce((s, p) => s + Number(p.puntaje || 0), 0);
    const nota = Math.round(clamp((obtenido / maxPuntuable) * 5, 1, 5) * 10) / 10;
    const ultima = ultimaSesion.get(e.id) || null;
    const dias = ultima ? Math.floor((ahora.getTime() - ultima.getTime()) / 86400000) : null;
    return {
      id: e.id,
      nombre: e.name,
      grupo: grupoPorId.get(Number(e.grupo_id))?.nombre || '—',
      banda: BAND_BY_STUDENT[e.id] || 'Básico',
      nota,
      nivel: nota >= 4.6 ? 'Superior' : nota >= 4 ? 'Alto' : nota >= 3 ? 'Básico' : 'Bajo',
      dias_sin_ingresar: dias,
    };
  });

  console.table(notas);

  const riesgo = notas.filter((n) => n.nivel === 'Bajo' || (n.dias_sin_ingresar != null && n.dias_sin_ingresar >= 5));
  console.log(`\nEn riesgo: ${riesgo.length} (${riesgo.map((r) => r.nombre).join(', ') || 'ninguno'}).`);
  console.log('Simulación completada.');
}

main()
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\nERROR:', error.message);
    if (error.parent?.message) console.error('mysql:', error.parent.message);
    if (error.errors?.length) console.error(JSON.stringify(error.errors, null, 1));
    await sequelize.close();
    process.exit(1);
  });
