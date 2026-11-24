const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { sequelize } = require('../../src/config/database');
const { QueryTypes } = require('sequelize');

const DOCENTE_EMAIL = 'DocenGra@hotmail.com';
const STUDENT_EMAIL_PREFIX = 'docengra.demo';
const STUDENT_EMAIL_DOMAIN = '@eduapp.test';
const SIM_PREFIX = '[SIM]';
const MATERIA = 'Informática';

const MODULES = [
  {
    key: 'M1',
    nombre: 'Grado 5 · Unidad 1: El computador y sus partes',
    contenidos: [712009],
    juegos: [712008, 712009],
    evaluaciones: [712008],
  },
  {
    key: 'M2',
    nombre: 'Grado 5 · Unidad 2: El escritorio de Windows',
    contenidos: [712011],
    juegos: [],
    evaluaciones: [712009],
  },
  {
    key: 'M3',
    nombre: 'Grado 5 · Unidad 3: Hardware y software',
    contenidos: [712010],
    juegos: [712011],
    evaluaciones: [],
  },
  {
    key: 'M4',
    nombre: 'Grado 5 · Unidad 4: Archivos y carpetas',
    contenidos: [712014],
    juegos: [712010],
    evaluaciones: [],
  },
  {
    key: 'M5',
    nombre: 'Grado 5 · Unidad 5: Seguridad digital',
    contenidos: [712012],
    juegos: [],
    evaluaciones: [712010],
  },
];

const UNPUBLISH = {
  contenidos: [712013],
  juegos: [712012],
  evaluaciones: [],
};

const DESCRIPTIONS = {
  'contenido:712009': 'Recorre las partes físicas del computador y para qué sirve cada una.',
  'contenido:712011': 'Aprende a reconocer el escritorio, las ventanas y los elementos básicos de Windows.',
  'contenido:712010': 'Distingue el hardware del software con ejemplos de la vida diaria.',
  'contenido:712014': 'Organiza archivos y carpetas para encontrar la información sin perderla.',
  'contenido:712012': 'Practica hábitos seguros con contraseñas, datos personales y navegación en Internet.',
  'juego:712008': 'Crucigrama para repasar las partes del computador y sus funciones.',
  'juego:712009': 'Memotest para relacionar cada dispositivo con la acción que realiza.',
  'juego:712011': 'Relaciona cada dispositivo de hardware con su uso principal.',
  'juego:712010': 'Sopa de letras con conceptos básicos de Windows y archivos.',
  'evaluacion:712008': 'Evaluación de la unidad 1: partes del computador, hardware y software.',
  'evaluacion:712009': 'Evaluación de la unidad 2: escritorio, ventanas y archivos de Windows.',
  'evaluacion:712010': 'Evaluación de la unidad 5: contraseñas, datos personales y seguridad en Internet.',
};

const BANDS = {
  Superior: {
    note: 4.9,
    game: [96, 100],
    eval: 100,
    firstNameEval: 80,
    abandon: 0.04,
    dedication: [0.9, 1],
  },
  Alto: {
    note: 4.2,
    game: [84, 89],
    eval: 80,
    firstNameEval: 60,
    abandon: 0.07,
    dedication: [0.78, 0.94],
  },
  Básico: {
    note: 3.2,
    game: [63, 70],
    eval: 60,
    firstNameEval: 40,
    abandon: 0.11,
    dedication: [0.62, 0.84],
  },
  Bajo: {
    note: 2.2,
    game: [38, 47],
    eval: 40,
    firstNameEval: 20,
    abandon: 0.18,
    dedication: [0.45, 0.64],
  },
};

const mulberry32 = (semilla) => {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const makeRng = (semilla) => {
  const rnd = mulberry32(semilla);
  return {
    rnd,
    int: (min, max) => min + Math.floor(rnd() * (max - min + 1)),
    pick: (lista) => lista[Math.floor(rnd() * lista.length)],
    chance: (p) => rnd() < p,
    shuffle: (lista) => {
      const copia = [...lista];
      for (let i = copia.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rnd() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
      }
      return copia;
    },
  };
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const addDays = (fecha, dias) => {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
};

const startOfDay = (fecha) => {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
};

const atTime = (fecha, hora, minuto = 0) => {
  const d = new Date(fecha);
  d.setHours(hora, minuto, 0, 0);
  return d;
};

const startOfWeek = (fecha) => {
  const d = startOfDay(fecha);
  const dia = d.getDay();
  const offset = dia === 0 ? -6 : 1 - dia;
  return addDays(d, offset);
};

const isoDate = (fecha) => new Date(fecha).toISOString().slice(0, 10);

const assertLocalTarget = () => {
  const host = String(process.env.DB_HOST || 'localhost').toLowerCase();
  const db = String(process.env.DB_NAME || '').toLowerCase();
  const permitido = process.env.ALLOW_REMOTE_SEED === '1';
  const local = ['localhost', '127.0.0.1', '::1', ''].includes(host);

  if (!permitido && (!local || db !== 'eduapp')) {
    throw new Error(
      `Destino no permitido: ${host || '(vacío)'}/${db || '(vacío)'}. ` +
      'Este script solo corre contra eduapp local. Usa ALLOW_REMOTE_SEED=1 solo si sabes lo que haces.'
    );
  }

  if (!permitido && process.env.NODE_ENV === 'production') {
    throw new Error('NODE_ENV=production bloqueado para scripts de simulación.');
  }
};

const ensureDocente = async () => {
  const filas = await sequelize.query(
    "SELECT id, name, email FROM users WHERE email = ? AND role = 'teacher' LIMIT 1",
    { replacements: [DOCENTE_EMAIL], type: QueryTypes.SELECT }
  );
  if (!filas.length) {
    throw new Error(`No existe el docente ${DOCENTE_EMAIL}.`);
  }
  return filas[0];
};

const getStudents = async (docenteId) => {
  return sequelize.query(
    `SELECT u.id, u.name, u.email, ge.grupo_id
       FROM users u
       LEFT JOIN grupo_estudiantes ge ON ge.estudiante_id = u.id
      WHERE u.docente_id = ?
        AND u.role = 'student'
        AND u.email LIKE ?
      ORDER BY u.id`,
    {
      replacements: [docenteId, `${STUDENT_EMAIL_PREFIX}%${STUDENT_EMAIL_DOMAIN}`],
      type: QueryTypes.SELECT,
    }
  );
};

const buildInsert = (tabla, columnas, filas, { ignore = false } = {}) => {
  const grupos = [];
  for (let i = 0; i < filas.length; i += 400) {
    grupos.push(filas.slice(i, i + 400));
  }

  const ejecutar = async () => {
    for (const grupo of grupos) {
      if (!grupo.length) continue;
      const filaSql = `(${columnas.map(() => '?').join(',')})`;
      const sql = `INSERT ${ignore ? 'IGNORE ' : ''}INTO \`${tabla}\` (${columnas
        .map((c) => `\`${c}\``)
        .join(',')}) VALUES ${grupo.map(() => filaSql).join(',')}`;
      await sequelize.query(sql, {
        replacements: grupo.flat(),
        type: QueryTypes.INSERT,
      });
    }
  };

  return { grupos, ejecutar };
};

const insertRows = async (tabla, columnas, filas, opciones = {}) => {
  const { ejecutar } = buildInsert(tabla, columnas, filas, opciones);
  await ejecutar();
};

const resolveMysqldump = () => {
  const candidatos = [
    process.env.MYSQLDUMP_PATH,
    'C:\\xampp\\mysql\\bin\\mysqldump.exe',
    'mysqldump',
  ].filter(Boolean);

  for (const candidato of candidatos) {
    if (candidato === 'mysqldump') {
      const r = spawnSync('where', ['mysqldump'], { encoding: 'utf8' });
      if (r.status === 0) return 'mysqldump';
    } else if (fs.existsSync(candidato)) {
      return candidato;
    }
  }
  return null;
};

const backupDatabase = async () => {
  const bin = resolveMysqldump();
  if (!bin) {
    throw new Error('No se encontró mysqldump. Define MYSQLDUMP_PATH en el entorno.');
  }

  const dir = path.resolve(__dirname, '../../backups');
  fs.mkdirSync(dir, { recursive: true });
  const ahora = new Date();
  const marca = [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0'),
  ].join('') + '-' + [
    String(ahora.getHours()).padStart(2, '0'),
    String(ahora.getMinutes()).padStart(2, '0'),
    String(ahora.getSeconds()).padStart(2, '0'),
  ].join('');
  const archivo = path.join(dir, `eduapp-before-reset-${marca}.sql`);

  const args = [
    `--host=${process.env.DB_HOST || 'localhost'}`,
    `--port=${process.env.DB_PORT || 3306}`,
    `--user=${process.env.DB_USER || 'root'}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--default-character-set=utf8mb4',
    process.env.DB_NAME || 'eduapp',
  ];

  const resultado = spawnSync(bin, args, {
    encoding: 'buffer',
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASS || '' },
  });

  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) {
    throw new Error(`mysqldump falló: ${resultado.stderr.toString('utf8').slice(0, 500)}`);
  }

  fs.writeFileSync(archivo, resultado.stdout);
  return archivo;
};

const marcar = (texto) => {
  console.log(`\n=== ${texto} ===`);
};

module.exports = {
  sequelize,
  QueryTypes,
  DOCENTE_EMAIL,
  STUDENT_EMAIL_PREFIX,
  STUDENT_EMAIL_DOMAIN,
  SIM_PREFIX,
  MATERIA,
  MODULES,
  UNPUBLISH,
  DESCRIPTIONS,
  BANDS,
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
  backupDatabase,
  resolveMysqldump,
  marcar,
};
