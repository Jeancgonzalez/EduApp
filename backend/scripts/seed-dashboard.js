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

const MODULOS = [
  {
    nombre: `${MATERIA} 101`,
    contenidos: [
      ['Introducción a la computadora', 'texto'],
      ['Hardware y software', 'texto'],
      ['Redes e internet', 'texto'],
      ['Seguridad digital', 'texto'],
    ],
    juegos: ['Crucigrama de Hardware', 'Memoria de Redes'],
    evaluaciones: ['Evaluación Unidad 1', 'Evaluación Unidad 2'],
  },
  {
    nombre: `${MATERIA} 201`,
    contenidos: [
      ['Bases de datos relacionales', 'texto'],
      ['Consultas SQL básicas', 'texto'],
    ],
    juegos: ['Desafío de Consultas'],
    evaluaciones: ['Evaluación Bases de Datos'],
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
async function insertarLote(tabla, columnas, filas) {
  if (filas.length === 0) return;
  const tuplas = filas.map(() => `(${columnas.map(() => '?').join(',')})`).join(',');
  await sequelize.query(
    `INSERT INTO \`${tabla}\` (${columnas.map((c) => `\`${c}\``).join(',')}) VALUES ${tuplas}`,
    { replacements: filas.flat() }
  );
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
    for (const titulo of mod.juegos) {
      const r = await insertar(
        `INSERT INTO juegos (titulo, tipo, modulo, descripcion, configuracion, docente_id, puntaje_max, publicado, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 100, 1, NOW(), NOW())`,
        [titulo, 'crucigrama', mod.nombre, 'Juego de demostración', '{}', docenteId]
      );
      juegos.push({ id: r.insertId, modulo: mod.nombre, max: 100 });
    }
    for (const titulo of mod.evaluaciones) {
      const r = await insertar(
        `INSERT INTO evaluaciones (titulo, descripcion, modulo, docente_id, tiempoLimitado, publicado, requiere_contenido_apoyo, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 0, 1, 0, NOW(), NOW())`,
        [titulo, 'Evaluación de demostración', mod.nombre, docenteId]
      );
      const evalId = r.insertId;
      for (let p = 1; p <= 5; p += 1) {
        await insertar(
          `INSERT INTO preguntas (evaluacion_id, pregunta, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, retroalimentacion, createdAt, updatedAt)
           VALUES (?, ?, 'A', 'B', 'C', 'D', 'A', 'Retroalimentación', NOW(), NOW())`,
          [evalId, `Pregunta ${p} de ${titulo}`]
        );
      }
      evaluaciones.push({ id: evalId, modulo: mod.nombre, max: 100, preguntas: 5 });
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
        const abandona = rnd() < 0.07;
        const dur = abandona ? entre(20, 90) : entre(240, 780);
        const ini = new Date(cuando.getTime() + k * 13 * 60000);
        intentos.push([
          est.id, docenteId, est.grupo.id, 'contenido', c.id, c.modulo, 1,
          null, null, null, null, null, dur, ini, abandona ? 0 : 1, abandona ? 1 : 0,
          abandona ? null : new Date(ini.getTime() + dur * 1000),
        ]);
        if (!abandona) {
          anotarProgreso(`${est.id}|c|${c.id}`,
            [est.id, c.id, null, null, 1, 0, new Date(ini.getTime() + dur * 1000), 1, 1, null]);
        }
      }

      // Juegos y evaluaciones: sí llevan nota (puntaje_maximo = 100), que es lo
      // que alimenta el ranking y el KPI de promedio.
      for (const [lista, tipo] of [[juegos, 'juego'], [evaluaciones, 'evaluacion']]) {
        if (rnd() > 0.72 * est.dedicacion + 0.15) continue;
        const act = elegir(lista);
        const abandona = rnd() < 0.12;
        const dur = abandona ? entre(45, 180) : entre(150, 900);
        const ini = new Date(cuando.getTime() + 20 * 60000);
        // Nota: la habilidad manda, con algo de ruido. Solo los mejores sacan
        // 100 y no siempre: deben ser la excepción, no la norma del top.
        let nota = Math.round(est.habilidad * 100 + entre(-9, 9));
        if (!abandona && est.habilidad > 0.97 && rnd() < 0.15) nota = act.max;
        nota = limitar(nota, 0, act.max);
        const aciertos = tipo === 'evaluacion' && !abandona
          ? Math.round((nota / act.max) * act.preguntas)
          : null;
        intentos.push([
          est.id, docenteId, est.grupo.id, tipo, act.id, act.modulo, 1,
          abandona ? null : nota, act.max, aciertos, aciertos == null ? null : act.preguntas,
          null, dur, ini, abandona ? 0 : 1, abandona ? 1 : 0,
          abandona ? null : new Date(ini.getTime() + dur * 1000),
        ]);
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

  await insertarLote('actividad_intentos',
    ['estudiante_id', 'docente_id', 'grupo_id', 'tipo', 'actividad_id', 'modulo', 'numero_intento',
     'puntaje_obtenido', 'puntaje_maximo', 'aciertos', 'preguntas_total', 'acierto_primer_intento',
     'duracion_seg', 'iniciado_en', 'completado', 'abandono', 'cerrado_en'], intentos);
  await insertarLote('estudiante_sesion',
    ['estudiante_id', 'docente_id', 'grupo_id', 'iniciado_en', 'ultimo_heartbeat', 'duracion_seg', 'activa', 'user_agent', 'cerrada_en'],
    sesiones);
  await insertarLote('medallas_obtenidas',
    ['estudiante_id', 'docente_id', 'medalla_id', 'categoria', 'obtenido_en'], medallas);
  await insertarLote('progreso_estudiante',
    ['estudiante_id', 'contenido_id', 'juego_id', 'evaluacion_id', 'completado', 'puntaje', 'fecha', 'intentos_realizados', 'feedback_visto', 'respuestas'],
    [...progreso.values()]);

  console.log(`Telemetría: ${intentos.length} intentos, ${sesiones.length} sesiones, ${medallas.length} medallas, ${progreso.size} progresos`);

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