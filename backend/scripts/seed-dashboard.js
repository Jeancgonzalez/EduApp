/**
 * Seed de demostración para el dashboard docente.
 *
 * Crea un docente con dos grupos, 18 estudiantes y OCHO SEMANAS de telemetría
 * real (intentos de contenido/juego/evaluación, sesiones y medallas). Es lo que
 * permite ver el dashboard con datos: sin esto el docente real solo tiene el
 * esquema y los KPI salen en cero.
 *
 *   node scripts/seed-dashboard.js            # crea si no existe
 *   node scripts/seed-dashboard.js --reset    # borra lo previo del demo y recrea
 *
 * Todo lo que crea lleva el correo con el prefijo `docengra.demo`, así el
 * `--reset` puede borrarlo sin tocar datos reales.
 */

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { sequelize } = require('../src/config/database');

const DOCENTE_EMAIL = 'DocenGra@hotmail.com';
const PASSWORD = '12345678';
const PREFIJO_DEMO = 'docengra.demo';
const MATERIA = 'Informática';
const NOMBRES_GRUPOS = ['Grupo A - Mañana', 'Grupo B - Tarde'];
const SEMANAS = 8;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/**
 * PRNG determinista (mulberry32). Se usa en vez de `Math.random()` para que dos
 * ejecuciones del seed produzcan EXACTAMENTE el mismo dataset: si el seed es
 * aleatorio, cualquier bug del dashboard deja de ser reproducible y es
 * imposible compararlo entre corridas.
 */
function mulberry32(semilla) {
  let a = semilla >>> 0;
  return function aleatorio() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20261003);
const entre = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const elegir = (lista) => lista[Math.floor(rnd() * lista.length)];
const limitar = (n, min, max) => Math.max(min, Math.min(max, n));

/**
 * Elige una actividad respetando su `peso`. Los juegos y evaluaciones de peso
 * alto reciben más intentos; las de peso 1 quedan con pocos datos a propósito
 * (así el panel tiene un caso de "Pocos datos").
 */
const elegirPonderado = (lista) => {
  const total = lista.reduce((acc, x) => acc + (x.peso || 1), 0);
  let r = rnd() * total;
  for (const x of lista) {
    r -= x.peso || 1;
    if (r <= 0) return x;
  }
  return lista[lista.length - 1];
};

const NOMBRES = [
  'Ana Sofía', 'Mateo', 'Valentina', 'Santiago', 'Isabella', 'Sebastián',
  'Camila', 'Nicolás', 'Mariana', 'David', 'Daniela', 'Andrés', 'Lucía', 'Tomás',
  'Sara', 'Julián', 'Manuela', 'Cristian',
];
const APELLIDOS = [
  'Álvarez', 'Bedoya', 'Cordero', 'Díaz', 'Espinal', 'Franco', 'Gallego', 'Henao',
  'Izquierdo', 'Jaramillo', 'Londoño', 'Muñoz', 'Naranjo', 'Ochoa', 'Pineda',
  'Quintero', 'Rodríguez', 'Serna',
];

// Actividades reales en lenguaje de quinto de primaria sobre hardware y Windows.
// El panel de conceptos necesita detalle por respuesta, así que cada juego trae
// su configuración (con el elemento "difícil" marcado) y cada evaluación sus
// preguntas con la respuesta correcta y la opción que más se equivocan.
const MODULOS = [
  {
    nombre: `${MATERIA} 101`,
    contenidos: [
      ['El computador y sus partes', 'texto'],
      ['Hardware y software', 'texto'],
      ['Windows: el escritorio y las ventanas', 'texto'],
      ['Seguridad digital', 'texto'],
    ],
    juegos: [
      {
        titulo: 'Crucigrama de Hardware',
        tipo: 'crucigrama',
        peso: 4,
        config: {
          pistas: [
            { palabra: 'MOUSE', numero: 1, fila: 0, col: 0, orientacion: 'H', pista: 'Sirve para mover el puntero en la pantalla.', dificil: true, magnet: 'TECLADO' },
            { palabra: 'TECLADO', numero: 2, fila: 2, col: 0, orientacion: 'H', pista: 'Tiene muchas teclas para escribir.' },
            { palabra: 'PANTALLA', numero: 3, fila: 4, col: 0, orientacion: 'H', pista: 'Muestra las imágenes y los textos.' },
            { palabra: 'IMPRESORA', numero: 4, fila: 6, col: 0, orientacion: 'H', pista: 'Imprime en papel lo que ves en el computador.' },
            { palabra: 'PARLANTE', numero: 5, fila: 8, col: 0, orientacion: 'H', pista: 'Deja salir la música y los sonidos.' },
          ],
        },
      },
      {
        titulo: 'Memoria de Partes',
        tipo: 'memoria',
        config: {
          pares: [
            { elemento1: 'Teclado', elemento2: 'Escribir' },
            { elemento1: 'Mouse', elemento2: 'Mover el puntero' },
            { elemento1: 'Pantalla', elemento2: 'Mostrar imágenes' },
            { elemento1: 'Impresora', elemento2: 'Imprimir' },
            { elemento1: 'Parlantes', elemento2: 'Reproducir sonido' },
            { elemento1: 'Cámara web', elemento2: 'Grabar video' },
          ],
        },
      },
      {
        titulo: 'Sopa de Windows',
        tipo: 'sopa_de_letras',
        peso: 4,
        config: {
          palabras: [
            { palabra: 'VENTANA', pista: 'Recuadro donde se abre un programa.' },
            { palabra: 'CARPETA', pista: 'Sirve para guardar archivos.' },
            { palabra: 'ESCRITORIO', pista: 'Lo primero que ves al encender.' },
            { palabra: 'ARCHIVO', pista: 'Un documento, una foto o un video.' },
            { palabra: 'ANTIVIRUS', pista: 'Cuida el computador de los virus.', dificil: true },
            { palabra: 'INTERNET', pista: 'Red que conecta millones de computadores.' },
          ],
          tablero: [],
        },
      },
    ],
    evaluaciones: [
      {
        titulo: 'Evaluación: El computador',
        peso: 4,
        preguntas: [
          { pregunta: '¿Cuál de estos sirve para escribir en el computador?', a: 'El monitor', b: 'El teclado', c: 'Los parlantes', d: 'El mouse', correcta: 'B', subtema: 'Hardware: dispositivos' },
          { pregunta: '¿Qué parte muestra las imágenes y el texto?', a: 'La pantalla', b: 'El teclado', c: 'El gabinete', d: 'El cable', correcta: 'A', subtema: 'Hardware: dispositivos' },
          { pregunta: '¿Cuál es un dispositivo de salida?', a: 'El mouse', b: 'El teclado', c: 'Los parlantes', d: 'El escáner', correcta: 'C', subtema: 'Hardware: dispositivos' },
          { pregunta: '¿Qué es el hardware?', a: 'Los programas', b: 'Las partes físicas del computador', c: 'Los juegos', d: 'Las páginas de Internet', correcta: 'B', magnet: 'A', dificil: true, subtema: 'Hardware y software' },
          { pregunta: '¿Qué programa usamos para dibujar?', a: 'Paint', b: 'El monitor', c: 'El mouse', d: 'La carpeta', correcta: 'A', subtema: 'Software' },
        ],
      },
      {
        titulo: 'Evaluación: Windows',
        preguntas: [
          { pregunta: '¿Dónde guardas tus archivos para no perderlos?', a: 'En la papelera', b: 'En una carpeta', c: 'En el teclado', d: 'En la pantalla', correcta: 'B', subtema: 'Windows: archivos' },
          { pregunta: '¿Qué es el escritorio de Windows?', a: 'La parte física', b: 'La primera pantalla que ves al encender', c: 'Un programa de dibujo', d: 'Una carpeta con Internet', correcta: 'B', subtema: 'Windows: escritorio' },
          { pregunta: 'Si borras un archivo por error, ¿dónde lo buscas?', a: 'En la papelera de reciclaje', b: 'En el escritorio', c: 'En Mis documentos', d: 'En Internet', correcta: 'A', magnet: 'B', dificil: true, subtema: 'Windows: archivos' },
          { pregunta: '¿Cómo se llama el botón para ver el menú de inicio?', a: 'El botón Inicio', b: 'El botón rojo', c: 'El mouse', d: 'La flecha', correcta: 'A', subtema: 'Windows: escritorio' },
          { pregunta: '¿Qué tecla borra lo que escribes hacia la izquierda?', a: 'Enter', b: 'Retroceso', c: 'Shift', d: 'Espacio', correcta: 'B', subtema: 'Software' },
        ],
      },
    ],
  },
  {
    nombre: `${MATERIA} 201`,
    contenidos: [
      ['El escritorio de Windows', 'texto'],
      ['Archivos y carpetas', 'texto'],
    ],
    juegos: [
      {
        titulo: 'Relaciona Hardware',
        tipo: 'relacionar',
        config: {
          pares: [
            { columnaA: 'Teclado', columnaB: 'Escribir palabras' },
            { columnaA: 'Mouse', columnaB: 'Señalar y hacer clic' },
            { columnaA: 'Impresora', columnaB: 'Imprimir en papel' },
            { columnaA: 'Parlantes', columnaB: 'Escuchar sonidos' },
            { columnaA: 'Escáner', columnaB: 'Pasar un papel al computador', dificil: true, magnet: 'Imprimir en papel' },
          ],
        },
      },
      {
        titulo: 'Adivinanza de Windows',
        tipo: 'adivinanza',
        config: {
          adivinanza: 'Tengo muchas teclas, estoy sobre la mesa y me usas para escribir. ¿Qué soy?',
          pista: 'Tiene letras y números.',
          opcionA: 'El teclado',
          opcionB: 'El mouse',
          opcionC: 'La pantalla',
          respuestaCorrecta: 'El teclado',
          magnet: 'El mouse',
        },
      },
    ],
    evaluaciones: [
      {
        titulo: 'Evaluación: Seguridad digital',
        peso: 4,
        preguntas: [
          { pregunta: '¿Cuál es una buena contraseña?', a: '123456', b: 'Tu nombre', c: 'Una mezcla de letras, números y símbolos', d: 'Tu fecha de nacimiento', correcta: 'C', magnet: 'D', dificil: true, subtema: 'Seguridad: contraseñas' },
          { pregunta: '¿Qué haces si un desconocido te pide tus datos por Internet?', a: 'Se los das', b: 'Avisas a un adulto', c: 'Lo agregas como amigo', d: 'Le escribes en secreto', correcta: 'B', subtema: 'Seguridad: datos' },
          { pregunta: '¿Qué significa navegar seguro?', a: 'Correr por el computador', b: 'Visitar páginas confiables', c: 'Apagar el computador', d: 'Desconectar el mouse', correcta: 'B', subtema: 'Seguridad en Internet' },
          { pregunta: '¿Qué debes hacer al terminar de usar una página con tu cuenta?', a: 'Cerrar sesión', b: 'Dejarla abierta', c: 'Apagar la pantalla', d: 'Borrar el mouse', correcta: 'A', subtema: 'Seguridad en Internet' },
          { pregunta: '¿Qué es un virus informático?', a: 'Un programa que daña o roba información', b: 'Un dolor de cabeza', c: 'Un tipo de mouse', d: 'Una carpeta', correcta: 'A', subtema: 'Seguridad: virus' },
        ],
      },
    ],
  },
];

/**
 * Devuelve un instante dentro del día `diasAtras`, entre las 08:00 y las
 * 18:00 hora de Bogotá.
 *
 * No se generan eventos en domingo a propósito: la base guarda las fechas en
 * UTC (la sesión de MySQL está en `+00:00`) mientras que el dashboard calcula
 * las semanas en hora local. Un evento del domingo por la tarde cruzaría el
 * lunes UTC y aparecería en la semana equivocada del gráfico.
 */
function instanteEn(diasAtras) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diasAtras);
  d.setHours(entre(8, 18), entre(0, 59), entre(0, 59), 0);
  if (d.getDay() === 0) d.setDate(d.getDate() - 1); // nunca domingo
  return d;
}

/** Las ocho semanas: `diasAtras` de la más antigua (56) a la actual (0). */
function semanas() {
  const lista = [];
  for (let i = SEMANAS - 1; i >= 0; i -= 1) lista.push(i * 7 + entre(0, 5));
  return lista;
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

/**
 * Ejecuta un INSERT y devuelve su `insertId`.
 *
 * La forma de la respuesta de `sequelize.query(..., QueryTypes.INSERT)` no es
 * estable en esta versión: según la tabla devuelve el `OkPacket` (con
 * `.insertId`) o el par `[insertId, affectedRows]`. Se aceptan las dos y se
 * falla ruidosamente si no hay `insertId`, porque un `undefined` silencioso
 * seguiría adelante y reventaría más tarde una clave foránea, mucho más lejos
 * de la causa real.
 */
function extraerInsertId(r) {
  const cand = Array.isArray(r) ? r[0] : r;
  if (cand == null) return null;
  if (typeof cand === 'number') return cand;
  if (typeof cand === 'object' && cand.insertId != null) return cand.insertId;
  return null;
}

async function insertar(sql, valores) {
  const r = await sequelize.query(sql, {
    replacements: valores,
    type: sequelize.QueryTypes.INSERT,
  });
  const id = extraerInsertId(r);
  if (id == null) throw new Error(`INSERT sin insertId: ${sql.slice(0, 70)}...`);
  return { insertId: id };
}

/**
 * Inserta varias filas en una sola sentencia. `placeholders()` genera los
 * `?` de cada fila: se hace INSERT por lote porque el seed genera del orden de
 * ~1.000 filas de telemetría y fila por fila tarda muchísimo más.
 */
async function insertarLote(tabla, columnas, filas, tamanoLote = 800) {
  if (filas.length === 0) return null;
  let primerId = null;
  for (let inicio = 0; inicio < filas.length; inicio += tamanoLote) {
    const trozo = filas.slice(inicio, inicio + tamanoLote);
    const tuplas = trozo.map(() => `(${columnas.map(() => '?').join(',')})`).join(',');
    const r = await sequelize.query(
      `INSERT INTO \`${tabla}\` (${columnas.map((c) => `\`${c}\``).join(',')}) VALUES ${tuplas}`,
      { replacements: trozo.flat(), type: sequelize.QueryTypes.INSERT }
    );
    // Solo interesa el id de la primera fila: MySQL asigna ids consecutivos, así
    // que la fila i del arreglo `filas` queda con `primerId + i`.
    if (primerId == null) primerId = extraerInsertId(r);
  }
  return primerId;
}

async function borrarDemo(docenteId) {
  const est = await sequelize.query(
    "SELECT id FROM users WHERE docente_id = ? AND email LIKE ?",
    { replacements: [docenteId, `${PREFIJO_DEMO}%`], type: sequelize.QueryTypes.SELECT }
  );
  const ids = est.map((e) => e.id);
  if (ids.length) {
    const lista = ids.join(',');
    for (const t of ['medallas_obtenidas', 'estudiante_sesion', 'actividad_intentos', 'grupo_estudiantes', 'progreso_estudiante']) {
      await sequelize.query(`DELETE FROM \`${t}\` WHERE estudiante_id IN (${lista})`);
    }
    await sequelize.query(`DELETE FROM users WHERE id IN (${lista})`);
  }
  await sequelize.query('DELETE FROMContenido_grupo WHERE docente_id = ?', { replacements: [docenteId] }).catch(() => {});
  await sequelize.query('DELETE FROM evaluacion_grupo WHERE docente_id = ?', { replacements: [docenteId] }).catch(() => {});
  await sequelize.query('DELETE FROM juego_grupo WHERE docente_id = ?', { replacements: [docenteId] }).catch(() => {});
  // Solo los grupos del demo: la cuenta del docente podría tener grupos reales.
  await sequelize.query(
    'DELETE FROM grupos WHERE docente_id = ? AND nombre IN (?, ?)',
    { replacements: [docenteId, ...NOMBRES_GRUPOS] }
  );
  await sequelize.query("DELETE FROM contenidos WHERE docente_id = ? AND modulo LIKE 'Informática%'", { replacements: [docenteId] });
  await sequelize.query("DELETE FROM juegos WHERE docente_id = ? AND modulo LIKE 'Informática%'", { replacements: [docenteId] });
  await sequelize.query("DELETE FROM evaluaciones WHERE docente_id = ? AND modulo LIKE 'Informática%'", { replacements: [docenteId] });
  return ids.length;
}

// ---------------------------------------------------------------------------
// Detalle por respuesta (alimenta el panel de conceptos)
// ---------------------------------------------------------------------------

/**
 * PRNG separado EXCLUSIVO para el detalle. No se toca el PRNG principal (`rnd`)
 * para que los intentos, sesiones y medallas sigan siendo exactamente los
 * mismos que antes de añadir el detalle: lo único que cambia es que ahora cada
 * intento guarda también lo que el estudiante respondió.
 */
const rndDetalle = mulberry32(20260111);
const elegirDetalle = (lista) => lista[Math.floor(rndDetalle() * lista.length)];

/**
 * Índices de los elementos que el estudiante falló, sesgando el fallo hacia el
 * elemento marcado como "difícil" para que exista un patrón de error dominante.
 */
function indicesFallados(n, correctas, dificilIdx) {
  const aFallar = Math.max(0, Math.min(n, n - correctas));
  const orden = [...Array(n).keys()].map((i) => ({
    i,
    k: (i === dificilIdx ? -0.6 : 0) + rndDetalle(),
  }));
  orden.sort((a, b) => a.k - b.k);
  return new Set(orden.slice(0, aFallar).map((o) => o.i));
}

/** Respuesta incorrecta de una evaluación, sesgada hacia la opción "magnet". */
function opcionIncorrecta(q) {
  const otras = q.opciones.filter((o) => o !== q.correcta);
  if (q.magnet && otras.includes(q.magnet) && rndDetalle() < 0.55) return q.magnet;
  return elegirDetalle(otras);
}

/** Filas de `evaluacion_intento_respuestas` de un intento. */
function detalleEvaluacion(evalInfo, abandona, aciertos) {
  const pregs = evalInfo.preguntas;
  if (!abandona) {
    const correctas = Math.max(0, Math.min(pregs.length, aciertos == null ? 0 : aciertos));
    const dificilIdx = Math.max(0, pregs.findIndex((p) => p.dificil));
    const fallan = indicesFallados(pregs.length, correctas, dificilIdx);
    return pregs.map((q, i) => {
      const ok = !fallan.has(i);
      const letra = ok ? q.correcta : opcionIncorrecta(q);
      return {
        pregunta_id: q.id,
        opcion_elegida: letra.toLowerCase(),
        respuesta_enviada: letra,
        es_correcta: ok ? 1 : 0,
        respondida: 1,
        tiempo_seg: 8 + Math.floor(rndDetalle() * 28),
      };
    });
  }
  // Abandonó: respondió solo algunas preguntas (el resto queda en blanco).
  const respondidas = 1 + Math.floor(rndDetalle() * 3);
  const filas = [];
  for (let i = 0; i < respondidas; i += 1) {
    const q = pregs[i];
    const ok = rndDetalle() < 0.4;
    const letra = ok ? q.correcta : opcionIncorrecta(q);
    filas.push({
      pregunta_id: q.id,
      opcion_elegida: letra.toLowerCase(),
      respuesta_enviada: letra,
      es_correcta: ok ? 1 : 0,
      respondida: 1,
      tiempo_seg: 6 + Math.floor(rndDetalle() * 20),
    });
  }
  return filas;
}

/**
 * Filas de `juego_intento_elementos` de un intento, coherentes con el tipo real
 * del juego y con lo ya simulado (abandonó o terminó, con tal nota).
 */
function detalleDeJuego(juego, abandona, nota) {
  const config = juego.config;

  if (juego.tipo === 'crucigrama') {
    const pistas = config.pistas;
    const dificilIdx = Math.max(0, pistas.findIndex((p) => p.dificil));
    const correctas = abandona
      ? Math.max(1, Math.floor(rndDetalle() * pistas.length))
      : Math.round((nota / 100) * pistas.length);
    const fallan = indicesFallados(pistas.length, correctas, dificilIdx);
    return pistas.map((p, i) => {
      const ok = !fallan.has(i);
      const mala = p.magnet || elegirDetalle(pistas.map((x) => x.palabra).filter((w) => w !== p.palabra));
      const dada = ok ? p.palabra : (rndDetalle() < 0.75 ? mala : null);
      return {
        elemento_clave: `pista_${p.numero}`,
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
    const palabras = config.palabras;
    const dificilIdx = Math.max(0, palabras.findIndex((p) => p.dificil));
    const correctas = abandona
      ? Math.max(1, Math.floor(rndDetalle() * palabras.length))
      : Math.round((nota / 100) * palabras.length);
    const fallan = indicesFallados(palabras.length, correctas, dificilIdx);
    return palabras.map((p, i) => {
      const esperado = String(p.palabra).toUpperCase().replace(/\s/g, '');
      const ok = !fallan.has(i);
      return {
        elemento_clave: `palabra_${i}`,
        elemento_tipo: 'palabra',
        esperado,
        respuesta_dada: ok ? esperado : null,
        es_correcta: ok ? 1 : 0,
        // En la sopa, "no encontrarla" es un error (el estudiante sí buscó).
        respondido: 1,
        concepto: p.palabra,
      };
    });
  }

  if (juego.tipo === 'memoria') {
    const nPares = config.pares.length;
    const intentos = abandona
      ? nPares + 2 + Math.floor(rndDetalle() * 6)
      : nPares + Math.max(0, Math.round((100 - nota) / 8));
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

  if (juego.tipo === 'relacionar') {
    const pares = config.pares;
    const dificilIdx = Math.max(0, pares.findIndex((p) => p.dificil));
    const correctas = abandona
      ? Math.max(1, Math.floor(rndDetalle() * pares.length))
      : Math.round((nota / 100) * pares.length);
    const fallan = indicesFallados(pares.length, correctas, dificilIdx);
    return pares.map((p, i) => {
      const ok = !fallan.has(i);
      const mala = p.magnet || elegirDetalle(pares.filter((_, j) => j !== i).map((x) => x.columnaB));
      const dada = ok ? p.columnaB : (rndDetalle() < 0.75 ? mala : null);
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

  if (juego.tipo === 'adivinanza') {
    const correcta = config.respuestaCorrecta;
    const ok = !abandona && Math.round(nota / 100) >= 1;
    const mala = config.magnet || elegirDetalle([config.opcionB, config.opcionC].filter(Boolean));
    return [{
      elemento_clave: 'adivinanza',
      elemento_tipo: 'adivinanza',
      esperado: correcta,
      respuesta_dada: ok ? correcta : mala,
      es_correcta: ok ? 1 : 0,
      respondido: 1,
      concepto: config.adivinanza,
    }];
  }

  return [];
}

// ---------------------------------------------------------------------------

async function main() {
  const reset = process.argv.includes('--reset');
  await sequelize.authenticate();

  const hash = await bcrypt.hash(PASSWORD, 10);

  let docente = (await sequelize.query(
    'SELECT id FROM users WHERE email = ?',
    { replacements: [DOCENTE_EMAIL], type: sequelize.QueryTypes.SELECT }
  ))[0];

  if (docente && reset) {
    // `--reset` limpia lo que el seed creó, pero CONSERVA la cuenta del docente:
    // borrarla obligaría a reinsertar el mismo correo y el `UNIQUE` de
    // `users.email` revienta. Solo se vacían los datos demo que cuelgan de él.
    console.log(`--reset: limpiando datos demo del docente ${docente.id}`);
    await borrarDemo(docente.id);
  }

  if (docente) {
    const n = await sequelize.query(
      "SELECT COUNT(*) total FROM users WHERE docente_id = ? AND email LIKE ?",
      { replacements: [docente.id, `${PREFIJO_DEMO}%`], type: sequelize.QueryTypes.SELECT }
    );
    if (n.total > 0) {
      console.log(`El docente ${DOCENTE_EMAIL} ya tiene ${n.total} estudiantes demo.`);
      console.log('Usa --reset para regenerarlos desde cero.');
      await sequelize.close();
      return;
    }
    console.log(`Docente ${DOCENTE_EMAIL} ya existe (id ${docente.id}); se le añaden estudiantes.`);
  } else {
    docente = (await insertar(
      `INSERT INTO users (name, email, password, role, createdAt, updatedAt, emailVerified, iad_obligatorio, last_login_at)
       VALUES (?, ?, ?, 'teacher', NOW(), NOW(), 1, 0, NOW())`,
      ['Docente Demo Gra', DOCENTE_EMAIL, hash]
    ));
    console.log(`Docente creado: ${DOCENTE_EMAIL} / ${PASSWORD} (id ${docente.insertId})`);
  }
  const docenteId = docente.insertId || docente.id;

  // --- Grupos -------------------------------------------------------------
  const grupos = [];
  for (const [i, nombre] of NOMBRES_GRUPOS.entries()) {
    const g = await insertar(
      'INSERT INTO grupos (docente_id, materia, nombre, creado_at) VALUES (?, ?, ?, NOW())',
      [docenteId, MATERIA, nombre]
    );
    grupos.push({ id: g.insertId, nombre });
  }

  // --- Actividades del docente -------------------------------------------
  const contenidos = [];
  const juegos = [];
  const evaluaciones = [];
  for (const mod of MODULOS) {
    for (const [titulo, tipo] of mod.contenidos) {
      const r = await insertar(
        `INSERT INTO contenidos (titulo, descripcion, tipo, contenido, modulo, docente_id, publicado, fecha_creacion, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW(), NOW())`,
        [titulo, `Contenido de demostración: ${titulo}`, tipo, 'Texto de demostración.', mod.nombre, docenteId]
      );
      contenidos.push({ id: r.insertId, modulo: mod.nombre });
    }
    for (const juego of mod.juegos) {
      const r = await insertar(
        `INSERT INTO juegos (titulo, tipo, modulo, descripcion, configuracion, docente_id, puntaje_max, publicado, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 100, 1, NOW(), NOW())`,
        [juego.titulo, juego.tipo, mod.nombre, 'Juego de demostración', JSON.stringify(juego.config), docenteId]
      );
      juegos.push({ id: r.insertId, modulo: mod.nombre, max: 100, tipo: juego.tipo, config: juego.config, peso: juego.peso || 1 });
    }
    for (const evaluacion of mod.evaluaciones) {
      const r = await insertar(
        `INSERT INTO evaluaciones (titulo, descripcion, modulo, docente_id, tiempoLimitado, publicado, requiere_contenido_apoyo, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 0, 1, 0, NOW(), NOW())`,
        [evaluacion.titulo, 'Evaluación de demostración', mod.nombre, docenteId]
      );
      const evalId = r.insertId;
      const preguntas = [];
      for (const p of evaluacion.preguntas) {
        const rp = await insertar(
          `INSERT INTO preguntas (evaluacion_id, pregunta, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, retroalimentacion, subtema, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Revisa el tema en clase.', ?, NOW(), NOW())`,
          [evalId, p.pregunta, p.a, p.b, p.c, p.d, p.correcta, p.subtema || null]
        );
        preguntas.push({
          id: rp.insertId,
          correcta: String(p.correcta).toUpperCase(),
          opciones: ['A', 'B', 'C', 'D'],
          magnet: p.magnet ? String(p.magnet).toUpperCase() : null,
          dificil: Boolean(p.dificil),
        });
      }
      evaluaciones.push({ id: evalId, modulo: mod.nombre, max: 100, preguntas, peso: evaluacion.peso || 1 });
    }
  }
  console.log(`Actividades: ${contenidos.length} contenidos, ${juegos.length} juegos, ${evaluaciones.length} evaluaciones`);

  // --- Estudiantes --------------------------------------------------------
  const estudiantes = [];
  for (let i = 0; i < NOMBRES.length; i += 1) {
    const grupo = grupos[i % grupos.length];
    const r = await insertar(
      `INSERT INTO users (name, email, password, role, docente_id, createdAt, updatedAt, emailVerified, iad_obligatorio, last_login_at)
       VALUES (?, ?, ?, 'student', ?, NOW(), NOW(), 1, 0, NOW())`,
      [`${NOMBRES[i]} ${APELLIDOS[i]}`, `${PREFIJO_DEMO}${String(i + 1).padStart(2, '0')}@eduapp.test`, hash, docenteId]
    );
    const id = r.insertId;
    await insertar('INSERT INTO grupo_estudiantes (grupo_id, estudiante_id) VALUES (?, ?)', [grupo.id, id]);
    estudiantes.push({
      id,
      grupo,
      nombre: `${NOMBRES[i]} ${APELLIDOS[i]}`,
      // `habilidad` define el techo de sus notas; `dedicacion` cuántas
      // actividades hace. Son independientes a propósito: hay quien rinde bien
      // sin hacer casi nada y quien se esfuerza mucho y le va mal.
      // `habilidad` reparte con exponente > 1 para que la mayoría quede en la parte
      // baja y la cola alta sea escasa: con una rampa lineal el top 5 salía
      // amontonado (100/100/99/99/98) y no parecía un ranking real.
      habilidad: limitar(0.30 + Math.pow(rnd(), 1.7) * 0.68, 0.25, 0.99),
      dedicacion: limitar(0.45 + ((i * 7) % 11) * 0.05, 0.35, 1),
      // Five estudiantes dejan de conectar: sin esto el gráfico crece siempre
      // y no se ven caídas, que es justo lo que el docente necesita detectar.
      abandono: i % 4 === 1,
    });
  }
  console.log(`Estudiantes: ${estudiantes.length} en ${grupos.length} grupos`);

  // --- Telemetría ---------------------------------------------------------
  const intentos = [];
  const sesiones = [];
  const medallas = [];
  // Detalle por respuesta: cada entrada guarda el índice del intento dentro de
  // `intentos` (para resolver su id real) y sus filas de detalle.
  const detalleEval = [];
  const detalleJuego = [];
  // `progreso_estudiante` es UNIQUE por (estudiante, actividad): la app hace
  // upsert en cada intento, así que una fila por intento reventaría con
  // "Duplicate entry". Se consolida en un mapa y al final se inserta una sola
  // vez por par estudiante/actividad, quedándose con la mejor nota y la última
  // fecha, que es lo que deja la aplicación.
  const progreso = new Map();

  /**
   * Registra un avance. El mapa se indexa por la actividad, así que las columnas
   * de identificador de ambas filas ya coinciden: solo hace falta quedarse con
   * la mejor nota, la fecha más reciente y sumar los intentos, que es lo mismo
   * que termina guardando la app tras varios intentos.
   */
  function anotarProgreso(clave, fila) {
    const previa = progreso.get(clave);
    if (!previa) { progreso.set(clave, fila); return; }
    progreso.set(clave, [
      fila[0], fila[1], fila[2], fila[3],
      1,
      Math.max(previa[5], fila[5]),
      previa[6] > fila[6] ? previa[6] : fila[6],
      previa[7] + 1,
      previa[8] || fila[8],
      previa[9] || fila[9],
    ]);
  }

  for (const est of estudiantes) {
    for (let s = 0; s < SEMANAS; s += 1) {
      const diasAtras = s * 7 + entre(0, 5);

      // Los estudiantes que abandonaron dejan de aparecer en las últimas 3 semanas.
      if (est.abandono && s >= SEMANAS - 3) continue;
      if (rnd() > est.dedicacion) continue;

      const cuando = instanteEn(diasAtras);

      // Sesiones: 1 a 4 por semana, proportionales a la dedicación.
      const nSesiones = limitar(Math.round(1 + rnd() * 3 * est.dedicacion), 1, 4);
      for (let k = 0; k < nSesiones; k += 1) {
        const dur = entre(6, 34) * 60 + entre(0, 59);
        const ini = new Date(cuando.getTime() + k * 11 * 60000);
        sesiones.push([
          est.id, docenteId, est.grupo.id, ini, ini, dur, 0,
          'Mozilla/5.0 (demo)', new Date(ini.getTime() + dur * 1000),
        ]);
      }

      // Contenidos: 1 a 3 por semana. No llevan nota (así los guarda la app),
      // por eso `puntaje_maximo` va en NULL y no contamina el ranking.
      const nCont = limitar(Math.round(1 + rnd() * 3 * est.dedicacion), 1, 3);
      for (let k = 0; k < nCont; k += 1) {
        const c = elegir(contenidos);
        // Se conserva el consumo del PRNG (para no alterar el resto de la
        // telemetría), pero los contenidos ya NO se abandonan: no tienen detalle
        // por respuesta, así que no deben aparecer en "Conceptos con mayor error".
        rnd();
        const abandona = false;
        const dur = entre(240, 780);
        const ini = new Date(cuando.getTime() + k * 13 * 60000);
        intentos.push([
          est.id, docenteId, est.grupo.id, 'contenido', c.id, c.modulo, 1,
          null, null, null, null, null, dur, ini, 1, 0,
          new Date(ini.getTime() + dur * 1000),
        ]);
        anotarProgreso(`${est.id}|c|${c.id}`,
          [est.id, c.id, null, null, 1, 0, new Date(ini.getTime() + dur * 1000), 1, 1, null]);
      }

      // Juegos y evaluaciones: sí llevan nota (puntaje_maximo = 100), que es lo
      // que alimenta el ranking y el KPI de promedio.
      for (const [lista, tipo] of [[juegos, 'juego'], [evaluaciones, 'evaluacion']]) {
        if (rnd() > 0.85 * est.dedicacion + 0.35) continue;
        const act = elegirPonderado(lista);
        const abandona = rnd() < 0.2;
        const dur = abandona ? entre(45, 180) : entre(150, 900);
        const ini = new Date(cuando.getTime() + 20 * 60000);
        // Nota: la habilidad manda, con algo de ruido. Solo los mejores sacan
        // 100 y no siempre: deben ser la excepción, no la norma del top.
        let nota = Math.round(est.habilidad * 100 + entre(-9, 9));
        if (!abandona && est.habilidad > 0.97 && rnd() < 0.15) nota = act.max;
        nota = limitar(nota, 0, act.max);
        const esEval = tipo === 'evaluacion';
        const aciertos = esEval && !abandona
          ? Math.round((nota / act.max) * act.preguntas.length)
          : null;
        const idx = intentos.length;
        intentos.push([
          est.id, docenteId, est.grupo.id, tipo, act.id, act.modulo, 1,
          abandona ? null : nota, act.max, aciertos, aciertos == null ? null : act.preguntas.length,
          null, dur, ini, abandona ? 0 : 1, abandona ? 1 : 0,
          abandona ? null : new Date(ini.getTime() + dur * 1000),
        ]);
        if (esEval) {
          detalleEval.push({ idx, filas: detalleEvaluacion(act, abandona, aciertos) });
        } else {
          detalleJuego.push({ idx, filas: detalleDeJuego(act, abandona, nota) });
        }
        if (!abandona) {
          anotarProgreso(`${est.id}|${tipo}|${act.id}`,
            [est.id, null, tipo === 'juego' ? act.id : null, tipo === 'evaluacion' ? act.id : null,
              1, nota, new Date(ini.getTime() + dur * 1000), 1, 1, null]);
        }
      }
    }

    // Medallas: los más dedicados y los que mejor rinden.
    if (est.dedicacion > 0.8 || est.habilidad > 0.9) {
      const catalogo = [
        ['primer_paso', 'contenidos'], ['explorador', 'contenidos'], ['lector_aplicado', 'contenidos'],
        ['maestro_juegos', 'juegos'], ['gamer_pro', 'juegos'],
        ['evaluador_experto', 'evaluaciones'], ['examinador_frecuente', 'evaluaciones'],
      ];
      for (const m of catalogo.slice(0, est.dedicacion > 0.9 ? catalogo.length : 3)) {
        medallas.push([est.id, docenteId, m[0], m[1], instanteEn(entre(3, 55))]);
      }
    }
    }

  const primerIntentoId = await insertarLote('actividad_intentos',
    ['estudiante_id', 'docente_id', 'grupo_id', 'tipo', 'actividad_id', 'modulo', 'numero_intento',
     'puntaje_obtenido', 'puntaje_maximo', 'aciertos', 'preguntas_total', 'acierto_primer_intento',
     'duracion_seg', 'iniciado_en', 'completado', 'abandono', 'cerrado_en'], intentos);

  // Detalle por respuesta: `primerIntentoId + idx` reconstruye el id del intento
  // (MySQL asigna ids consecutivos al INSERT por lote).
  const filasDetalleEval = [];
  for (const { idx, filas } of detalleEval) {
    for (const f of filas) {
      filasDetalleEval.push([
        primerIntentoId + idx, f.pregunta_id, f.opcion_elegida, f.respuesta_enviada,
        f.es_correcta, f.respondida, f.tiempo_seg,
      ]);
    }
  }
  const filasDetalleJuego = [];
  for (const { idx, filas } of detalleJuego) {
    for (const f of filas) {
      filasDetalleJuego.push([
        primerIntentoId + idx, f.elemento_clave, f.elemento_tipo, f.esperado,
        f.respuesta_dada, f.es_correcta, f.respondido, f.concepto,
      ]);
    }
  }
  await insertarLote('evaluacion_intento_respuestas',
    ['intento_id', 'pregunta_id', 'opcion_elegida', 'respuesta_enviada', 'es_correcta', 'respondida', 'tiempo_seg'],
    filasDetalleEval);
  await insertarLote('juego_intento_elementos',
    ['intento_id', 'elemento_clave', 'elemento_tipo', 'esperado', 'respuesta_dada', 'es_correcta', 'respondido', 'concepto'],
    filasDetalleJuego);

  await insertarLote('estudiante_sesion',
    ['estudiante_id', 'docente_id', 'grupo_id', 'iniciado_en', 'ultimo_heartbeat', 'duracion_seg', 'activa', 'user_agent', 'cerrada_en'],
    sesiones);
  await insertarLote('medallas_obtenidas',
    ['estudiante_id', 'docente_id', 'medalla_id', 'categoria', 'obtenido_en'], medallas);
  await insertarLote('progreso_estudiante',
    ['estudiante_id', 'contenido_id', 'juego_id', 'evaluacion_id', 'completado', 'puntaje', 'fecha', 'intentos_realizados', 'feedback_visto', 'respuestas'],
    [...progreso.values()]);

  console.log(`Telemetría: ${intentos.length} intentos, ${sesiones.length} sesiones, ${medallas.length} medallas, ${progreso.size} progresos`);
  console.log(`Detalle por respuesta: ${filasDetalleEval.length} respuestas de evaluación, ${filasDetalleJuego.length} elementos de juego`);

  // --- Resumen por semana, tal como lo verá el docente --------------------
  const res = await sequelize.query(
    `SELECT tipo, COUNT(*) n, SUM(completado) ok, SUM(abandono) ab, AVG(duracion_seg) seg
     FROM actividad_intentos WHERE docente_id = ? GROUP BY tipo`,
    { replacements: [docenteId], type: sequelize.QueryTypes.SELECT }
  );
  console.table(res);

  const min = await sequelize.query(
    'SELECT MIN(iniciado_en) desde, MAX(iniciado_en) hasta FROM actividad_intentos WHERE docente_id = ?',
    { replacements: [docenteId], type: sequelize.QueryTypes.SELECT }
  );
  console.log(`Rango de datos: ${min[0].desde} → ${min[0].hasta}`);
  console.log('\nListo. Entra con:');
  console.log(`  docente : ${DOCENTE_EMAIL} / ${PASSWORD}`);
  console.log('  alumnos : ' + `${PREFIJO_DEMO}01@eduapp.test` + ` … ${PREFIJO_DEMO}18@eduapp.test` + ` / ${PASSWORD}`);
}

main()
  .then(async () => {
    // Si se pasó --cleanup, borra los datos demo creado en esta corrida
    if (process.argv.includes('--cleanup')) {
      console.log('🧹 Limpieza automática de datos de prueba...');
      await borrarDemo(docenteId);
      console.log('Datos de prueba eliminados.');
    }
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('ERROR:', e.message);
    // Sequelize envuelve varios fallos de MySQL en un `Validation error` sin
    // detalle: sin el error padre el mensaje real se pierde.
    if (e.errors && e.errors.length) console.error('detalle:', JSON.stringify(e.errors, null, 1));
    if (e.parent && e.parent.message) console.error('mysql:', e.parent.message);
    if (e.stack) console.error(e.stack.split('\n').slice(1, 6).join('\n'));
    await sequelize.close();
    process.exit(1);
  });