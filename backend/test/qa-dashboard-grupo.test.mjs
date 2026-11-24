import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { api, makeDocenteVerificado, registerStudentByTeacher, unique } from './_qa/helpers.mjs';

/**
 * QA de la Vista de Grupo del panel del docente.
 *
 * Cubre los cuatro endpoints nuevos y, sobre todo, los dos errores que esta vista
 * hizo visibles y que son fáciles de reintroducir:
 *
 *  1. **Los contadores por nivel.** La distribución se armaba con un `Map`
 *     inicializado con una propiedad mal escrita, así que `cuenta` quedaba con
 *     una sola clave y todos los niveles salían en 0 con `con_datos` correcto.
 *     Aquí los conteos se afirman de forma exacta, no solo que sumen.
 *
 *  2. **El alias del estudiante que no tiene nota.** `_calificaciones()` parte
 *     de `actividad_intentos`, así que sin un respaldo de `users.name` el
 *     estudiante sin actividad se degradaba a `SIN_ALIAS`, que es justo el
 *     que el docente necesita ver en el ranking.
 *
 * Los puntajes son concretos para poder afirmar números exactos: con datos
 * aleatorios el test solo podría decir "no se rompe", que es lo que no alcanza
 * para detectar un promedio mal calculado o un `JOIN` mal puesto.
 *
 * La base se carga como CommonJS, igual que la aplicación, y las filas se leen
 * siempre con `filas[0]`.
 */

const require = createRequire(import.meta.url);
const { sequelize } = require('../src/config/database.js');

const NIVELES = ['Superior', 'Alto', 'Básico', 'Bajo'];

const diasAtras = (n) => new Date(Date.now() - n * 864e5);

const creados = {
  docentes: [],
  estudiantes: [],
  grupos: [],
  contenidos: [],
  juegos: [],
  evaluaciones: [],
};

let TOKEN = '';
let TOKEN_B = '';

const seleccionar = async (sql, replacements) => {
  const filas = await sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
  return Array.isArray(filas) ? filas : [];
};

const idDeUsuario = async (email) => {
  const filas = await seleccionar('SELECT id FROM users WHERE email = :email', { email });
  return filas[0].id;
};

const crearEstudiante = async (tokenDocente, nombre) => {
  const email = unique('qa_vg_est@EduApp.com');
  const res = await registerStudentByTeacher(tokenDocente, {
    name: nombre,
    email,
    password: 'pass1234',
    iadObligatorio: false,
  });
  if (res.status !== 201) {
    throw new Error(`No se pudo registrar al estudiante ${nombre}: HTTP ${res.status}`);
  }
  const id = await idDeUsuario(email);
  return { id, alias: nombre, email };
};

const crearGrupo = async (docenteId, nombre) => {
  await sequelize.query(
    `INSERT INTO grupos (docente_id, materia, nombre, creado_at) VALUES (:d, 'Algebra', :n, NOW())`,
    { replacements: { d: docenteId, n: nombre } }
  );
  const filas = await seleccionar('SELECT id FROM grupos WHERE docente_id = :d AND nombre = :n ORDER BY id DESC', {
    d: docenteId,
    n: nombre,
  });
  const grupo = { id: filas[0].id, docenteId, nombre };
  creados.grupos.push(grupo);
  return grupo;
};

const insertarIntentos = async (intentos) => {
  const columnas = [
    'estudiante_id', 'docente_id', 'tipo', 'actividad_id', 'modulo', 'numero_intento',
    'puntaje_obtenido', 'puntaje_maximo', 'iniciado_en', 'completado', 'abandono',
    'cerrado_en', 'creado_en',
  ];
  const tuplas = intentos.map(() => `(${columnas.map(() => '?').join(',')})`);
  const valores = intentos.flatMap((i) => [
    i.estudiante_id, i.docente_id, i.tipo, i.actividad_id, i.modulo, 1,
    i.puntaje_obtenido, i.puntaje_maximo, i.iniciado_en, i.completado ? 1 : 0, 0,
    i.iniciado_en, i.iniciado_en,
  ]);
  await sequelize.query(
    `INSERT INTO actividad_intentos (${columnas.join(', ')}) VALUES ${tuplas.join(', ')}`,
    { replacements: valores }
  );
};

/** Publica un contenido, un juego y una evaluación, más un contenido sin publicar. */
const crearActividades = async (docenteId) => {
  await sequelize.query(
    `INSERT INTO contenidos (id, titulo, descripcion, tipo, contenido, modulo, docente_id, publicado, created_at, updated_at)
     VALUES (:id, 'Apuntes de algebra', 'Apuntes', 'pdf', 'contenido', 'Algebra', :d, 1, NOW(), NOW()),
            (:id2, 'Oculto para QA', 'No debe salir', 'pdf', 'contenido', 'Algebra', :d, 0, NOW(), NOW())`,
    { replacements: { id: 700001, id2: 700004, d: docenteId } }
  );
  creados.contenidos.push(700001, 700004);

  await sequelize.query(
    `INSERT INTO juegos (id, titulo, tipo, modulo, descripcion, docente_id, puntaje_max, publicado, created_at, updated_at)
     VALUES (:id, 'Desafio de numeros', 'aritmetica', 'Algebra', 'Juego', :d, 100, 1, NOW(), NOW()),
            (:id2, 'Zumba interactiva', 'logica', 'Algebra', 'Juego 2', :d, 100, 1, NOW(), NOW())`,
    { replacements: { id: 700002, id2: 700005, d: docenteId } }
  );
  creados.juegos.push(700002, 700005);

  await sequelize.query(
    `INSERT INTO evaluaciones (id, titulo, descripcion, modulo, docente_id, tiempoLimitado, publicado, requiere_contenido_apoyo, createdAt, updatedAt)
     VALUES (:id, 'Evaluacion inicial', 'Evaluacion', 'Algebra', :d, 0, 1, 0, NOW(), NOW())`,
    { replacements: { id: 700003, d: docenteId } }
  );
  creados.evaluaciones.push(700003);
};

/**
 * Un día hacia atrás cae en el mismo cubo semanal ISO que "hoy", así que todos
 * los intentos terminan en la última semana de la serie.
 */
const AYER = diasAtras(1);

beforeAll(async () => {
  // --- Docente A ------------------------------------------------------------
  const docenteA = await makeDocenteVerificado();
  TOKEN = docenteA.token;
  creados.docentes.push(docenteA.userId);
  await crearActividades(docenteA.userId);

  const ana = await crearEstudiante(docenteA.token, 'Ana Ruiz');
  const bruno = await crearEstudiante(docenteA.token, 'Bruno Diaz');
  const carla = await crearEstudiante(docenteA.token, 'Carla Paz');
  const elena = await crearEstudiante(docenteA.token, 'Elena Soto');
  const diego = await crearEstudiante(docenteA.token, 'Diego Rengifo');
  creados.estudiantes.push(ana, bruno, carla, elena, diego);

  const grupo1 = await crearGrupo(docenteA.userId, 'VG Grupo 1');
  const grupo2 = await crearGrupo(docenteA.userId, 'VG Grupo 2');
  const grupo3 = await crearGrupo(docenteA.userId, 'VG Grupo 3');
  await sequelize.query(
    `INSERT INTO grupo_estudiantes (grupo_id, estudiante_id) VALUES (:g1, :ana), (:g1, :bruno), (:g2, :carla), (:g2, :elena), (:g3, :diego)`,
    { replacements: { g1: grupo1.id, g2: grupo2.id, g3: grupo3.id, ana: ana.id, bruno: bruno.id, carla: carla.id, elena: elena.id, diego: diego.id } }
  );

  // Ana promedia dos intentos (90 y 20) -> 55, Basico. El XP suma el mejor
  // puntaje de CADA actividad, o sea 90 + 20 = 110, y eso la pone primera al
  // ordenar por XP aunque de nota sea tercera: los dos modos quedan distinguibles.
  //   Ana   90% + 20%   -> 55% Basico   | xp 110
  //   Carla 75%          -> 75% Alto     | xp 75
  //   Elena 60%          -> 60% Basico   | xp 60
  //   Bruno 40%          -> 40% Bajo     | xp 40
  //   Diego  sin intentos                 -> sin datos
  await insertarIntentos([
    { estudiante_id: ana.id, docente_id: docenteA.userId, tipo: 'contenido', actividad_id: 700001, modulo: 'Algebra', puntaje_obtenido: 90, puntaje_maximo: 100, iniciado_en: AYER, completado: true },
    { estudiante_id: ana.id, docente_id: docenteA.userId, tipo: 'evaluacion', actividad_id: 700003, modulo: 'Algebra', puntaje_obtenido: 20, puntaje_maximo: 100, iniciado_en: AYER, completado: false },
    { estudiante_id: carla.id, docente_id: docenteA.userId, tipo: 'evaluacion', actividad_id: 700003, modulo: 'Algebra', puntaje_obtenido: 75, puntaje_maximo: 100, iniciado_en: AYER, completado: true },
    { estudiante_id: elena.id, docente_id: docenteA.userId, tipo: 'juego', actividad_id: 700002, modulo: 'Algebra', puntaje_obtenido: 60, puntaje_maximo: 100, iniciado_en: AYER, completado: true },
    { estudiante_id: bruno.id, docente_id: docenteA.userId, tipo: 'evaluacion', actividad_id: 700003, modulo: 'Algebra', puntaje_obtenido: 40, puntaje_maximo: 100, iniciado_en: AYER, completado: false },
    // Actividad borrada: el historial se conserva para el panel analítico,
    // aunque ya no tenga fila en las tablas de recursos.
    { estudiante_id: bruno.id, docente_id: docenteA.userId, tipo: 'evaluacion', actividad_id: 700999, modulo: 'Algebra', puntaje_obtenido: null, puntaje_maximo: null, iniciado_en: AYER, completado: false },
    // Juego sin nota: intento sin calificar y sin completar -> en_progreso.
    { estudiante_id: carla.id, docente_id: docenteA.userId, tipo: 'juego', actividad_id: 700002, modulo: 'Algebra', puntaje_obtenido: null, puntaje_maximo: null, iniciado_en: AYER, completado: false },
    { estudiante_id: elena.id, docente_id: docenteA.userId, tipo: 'juego', actividad_id: 700005, modulo: 'Algebra', puntaje_obtenido: null, puntaje_maximo: null, iniciado_en: AYER, completado: false },
  ]);

  // --- Docente B: para el aislamiento -------------------------------------
  const docenteB = await makeDocenteVerificado();
  TOKEN_B = docenteB.token;
  creados.docentes.push(docenteB.userId);
  const dante = await crearEstudiante(docenteB.token, 'Dante Ajeno');
  creados.estudiantes.push(dante);
  const grupoB = await crearGrupo(docenteB.userId, 'VG Grupo B');
  await sequelize.query('INSERT INTO grupo_estudiantes (grupo_id, estudiante_id) VALUES (:g, :e)', {
    replacements: { g: grupoB.id, e: dante.id },
  });
  await insertarIntentos([
    { estudiante_id: dante.id, docente_id: docenteB.userId, tipo: 'evaluacion', actividad_id: 700003, modulo: 'Algebra', puntaje_obtenido: 100, puntaje_maximo: 100, iniciado_en: AYER, completado: true },
  ]);
}, 180000);

afterAll(async () => {
  const idsDocentes = creados.docentes;
  const idsEstudiantes = creados.estudiantes.map((e) => e.id);
  const idsGrupos = creados.grupos.map((g) => g.id);
  const idsContenidos = creados.contenidos;
  const idsJuegos = creados.juegos;
  const idsEvaluaciones = creados.evaluaciones;

  if (idsDocentes.length) {
    await sequelize.query('DELETE FROM actividad_intentos WHERE docente_id IN (?)', {
      replacements: [idsDocentes],
    });
  }
  if (idsGrupos.length) {
    await sequelize.query('DELETE FROM grupo_estudiantes WHERE grupo_id IN (?)', {
      replacements: [idsGrupos],
    });
    await sequelize.query('DELETE FROM grupos WHERE id IN (?)', { replacements: [idsGrupos] });
  }
  if (idsContenidos.length) {
    await sequelize.query('DELETE FROM contenidos WHERE id IN (?)', { replacements: [idsContenidos] });
  }
  if (idsJuegos.length) {
    await sequelize.query('DELETE FROM juegos WHERE id IN (?)', { replacements: [idsJuegos] });
  }
  if (idsEvaluaciones.length) {
    await sequelize.query('DELETE FROM evaluaciones WHERE id IN (?)', { replacements: [idsEvaluaciones] });
  }
  if (idsEstudiantes.length) {
    await sequelize.query('DELETE FROM diagnostico_aplicaciones WHERE estudiante_id IN (?)', {
      replacements: [idsEstudiantes],
    });
    await sequelize.query('DELETE FROM users WHERE id IN (?)', { replacements: [idsEstudiantes] });
  }
  if (idsDocentes.length) {
    await sequelize.query('DELETE FROM users WHERE id IN (?)', { replacements: [idsDocentes] });
  }

  if (sequelize && typeof sequelize.close === 'function') await sequelize.close();
});

const get = (ruta, token = TOKEN) =>
  api.get(ruta).set('Authorization', `Bearer ${token}`);

const dato = (res) => {
  expect(res.status, res.text).toBe(200);
  expect(res.body.success).toBe(true);
  return res.body.data;
};

describe('QA-DASHBOARD-GRUPO · Vista de Grupo', () => {
  describe('autorizacion', () => {
    const rutas = [
      '/api/dashboard/distribucion-niveles',
      '/api/dashboard/ranking-completo',
      '/api/dashboard/participacion-semanal',
      '/api/dashboard/comparacion-grupos',
    ];

    it('exige token en los cuatro endpoints', async () => {
      for (const ruta of rutas) {
        const res = await api.get(ruta);
        expect(res.status, `${ruta} sin token`).toBe(401);
      }
    });

    it('rechaza a quien no es docente', async () => {
      const docente = await makeDocenteVerificado();
      creados.docentes.push(docente.userId);
      const estudiante = await crearEstudiante(docente.token, 'Estudiante VG');
      creados.estudiantes.push(estudiante);
      const sesion = await api.post('/api/auth/login').send({ email: estudiante.email, password: 'pass1234' });

      for (const ruta of rutas) {
        const res = await api
          .get(ruta)
          .set('Authorization', `Bearer ${sesion.body.token || sesion.body.data?.token}`);
        expect(res.status, `${ruta} como estudiante`).toBe(403);
      }
    });
  });

  describe('distribucion-niveles', () => {
    it('cuenta cada nivel con el promedio de todos los intentos con nota', async () => {
      const d = dato(await get('/api/dashboard/distribucion-niveles?semanas=8'));

      expect(d.alcance.estudiantes).toBe(5);
      expect(d.con_datos).toBe(4);
      expect(d.sin_datos).toBe(1);

      const porNombre = new Map(d.niveles.map((n) => [n.nivel, n]));
      expect([...porNombre.keys()].sort()).toEqual([...NIVELES].sort());

      // Ana 55 y Elena 60 son Basico; Carla 75 Alto; Bruno 40 Bajo; Diego sin datos.
      expect(porNombre.get('Bajo').estudiantes).toBe(1);
      expect(porNombre.get('Básico').estudiantes).toBe(2);
      expect(porNombre.get('Alto').estudiantes).toBe(1);
      expect(porNombre.get('Superior').estudiantes).toBe(0);

      expect(porNombre.get('Bajo').pct).toBe(25);
      expect(porNombre.get('Básico').pct).toBe(50);
      expect(porNombre.get('Alto').pct).toBe(25);
      expect(porNombre.get('Superior').pct).toBe(0);
    });

    it('el total de los niveles cuadra con con_datos y los pcts con el 100', async () => {
      const d = dato(await get('/api/dashboard/distribucion-niveles?semanas=8'));
      const suma = d.niveles.reduce((s, n) => s + n.estudiantes, 0);
      expect(suma).toBe(d.con_datos);
      expect(d.niveles.reduce((s, n) => s + n.pct, 0)).toBe(100);
    });

    it('respeta el filtro de grupo', async () => {
      const todos = dato(await get('/api/dashboard/distribucion-niveles?semanas=8'));
      const grupo1 = creados.grupos.find((g) => g.nombre === 'VG Grupo 1');
      const filtrado = dato(
        await get(`/api/dashboard/distribucion-niveles?semanas=8&grupoId=${grupo1.id}`)
      );
      // Solo Ana y Bruno, asi que el alcance baja de 5 a 2.
      expect(filtrado.alcance.estudiantes).toBe(2);
      expect(todos.alcance.estudiantes).toBe(5);
      const porNombre = new Map(filtrado.niveles.map((n) => [n.nivel, n.estudiantes]));
      expect(porNombre.get('Básico')).toBe(1);
      expect(porNombre.get('Bajo')).toBe(1);
      expect(porNombre.get('Alto')).toBe(0);
      expect(porNombre.get('Superior')).toBe(0);
    });
  });

  describe('ranking-completo', () => {
    it('incluye al estudiante sin nota con su alias real y sin correo', async () => {
      const d = dato(await get('/api/dashboard/ranking-completo?semanas=8'));

      expect(d.filas).toHaveLength(5);
      expect(d.con_datos).toBe(4);
      expect(d.sin_datos).toBe(1);
      expect(d.truncado).toBe(false);

      const diego = d.filas.find((f) => f.alias === 'Diego Rengifo');
      expect(diego, 'el estudiante sin intentos debe salir con su alias').toBeDefined();
      expect(diego.pct).toBeNull();
      expect(diego.nivel).toBeNull();
      expect(diego.xp).toBe(0);

      for (const fila of d.filas) {
        expect(fila.alias).not.toBe('SIN_ALIAS');
        expect(JSON.stringify(fila)).not.toMatch(/@/);
        expect(fila).not.toHaveProperty('email');
        expect(fila).not.toHaveProperty('posicion');
        // Sin nota el nivel es null: no hay nada que clasificar todavia.
        expect(fila.nivel === null || NIVELES.includes(fila.nivel)).toBe(true);
      }
    });

    it('ordena por nota o por XP, y los sin nota al final', async () => {
      const porNota = dato(await get('/api/dashboard/ranking-completo?semanas=8&orden=pct'));
      expect(porNota.filas.map((f) => f.alias)).toEqual([
        'Carla Paz', 'Elena Soto', 'Ana Ruiz', 'Bruno Diaz', 'Diego Rengifo',
      ]);
      expect(porNota.filas.map((f) => f.pct)).toEqual([75, 60, 55, 40, null]);

      // Ana promedia 55 pero su XP es 110: al ordenar por XP cambia de la tercera a
      // la primera, que es justo lo que distingue los dos modos.
      const porXp = dato(await get('/api/dashboard/ranking-completo?semanas=8&orden=xp'));
      expect(porXp.filas.map((f) => f.alias)).toEqual([
        'Ana Ruiz', 'Carla Paz', 'Elena Soto', 'Bruno Diaz', 'Diego Rengifo',
      ]);
      expect(porXp.filas.map((f) => f.xp)).toEqual([110, 75, 60, 40, 0]);
    });

    it('un orden desconocido cae en nota, no en un error', async () => {
      const d = dato(await get('/api/dashboard/ranking-completo?semanas=8&orden=inventado'));
      expect(d.filas.map((f) => f.alias)[0]).toBe('Carla Paz');
    });
  });

  describe('participacion-semanal', () => {
    it('devuelve un cubo por semana con denominador constante', async () => {
      const d = dato(await get('/api/dashboard/participacion-semanal?semanas=8'));

      expect(d.serie).toHaveLength(8);
      expect(d.alcance.estudiantes).toBe(5);
      for (const punto of d.serie) {
        expect(punto.matriculados).toBe(5);
        expect(punto.activos).toBeLessThanOrEqual(punto.matriculados);
        expect(punto.pct).toBeGreaterThanOrEqual(0);
        expect(punto.pct).toBeLessThanOrEqual(100);
        expect(punto.brecha === null || punto.brecha >= 0).toBe(true);
      }
    });

    it('cuenta como activo a quien intentó algo, aunque no tenga nota', async () => {
      const d = dato(await get('/api/dashboard/participacion-semanal?semanas=8'));
      const ultimo = d.serie[d.serie.length - 1];

      // Ana, Bruno, Carla y Elena intentaron; Diego no.
      expect(ultimo.activos).toBe(4);
      expect(ultimo.pct).toBe(80);
      expect(ultimo.intentos).toBe(8);
    });

    it('la brecha es null cuando hay menos de dos estudiantes con datos', async () => {
      const grupo3 = creados.grupos.find((g) => g.nombre === 'VG Grupo 3');
      const d = dato(
        await get(`/api/dashboard/participacion-semanal?semanas=8&grupoId=${grupo3.id}`)
      );
      expect(d.alcance.estudiantes).toBe(1);
      for (const punto of d.serie) expect(punto.brecha).toBeNull();
    });
  });

  describe('comparacion-grupos', () => {
    it('devuelve un bloque por grupo con los tres porcentajes', async () => {
      const d = dato(await get('/api/dashboard/comparacion-grupos?semanas=8'));

      expect(d.grupos).toHaveLength(3);
      expect(d.alcance.grupos).toBe(3);
      expect(d.alcance.estudiantes).toBe(5);

      const porNombre = new Map(d.grupos.map((g) => [g.nombre, g]));
      const g1 = porNombre.get('VG Grupo 1');
      expect(g1.estudiantes).toBe(2);
      expect(g1.sin_datos).toBe(0);
      // Ana 55 y Bruno 40 -> 47.5 -> 48
      expect(g1.progreso_pct).toBe(48);
      // Ambos tocaron actividades; ademas Bruno entra por pct < 50.
      expect(g1.participacion_pct).toBe(100);
      expect(g1.en_riesgo).toBe(1);
      expect(g1.riesgo_pct).toBe(50);

      const g2 = porNombre.get('VG Grupo 2');
      expect(g2.estudiantes).toBe(2);
      expect(g2.sin_datos).toBe(0);
      // Carla 75 y Elena 60 -> 67.5 -> 68
      expect(g2.progreso_pct).toBe(68);
      expect(g2.participacion_pct).toBe(100);
      expect(g2.en_riesgo).toBe(0);
      expect(g2.riesgo_pct).toBe(0);

      const g3 = porNombre.get('VG Grupo 3');
      expect(g3.estudiantes).toBe(1);
      expect(g3.sin_datos).toBe(1);
      expect(g3.progreso_pct).toBeNull();
      expect(g3.participacion_pct).toBe(0);
      expect(g3.riesgo_pct).toBe(0);
    });

    it('ignora el filtro de grupo, porque comparar un grupo consigo mismo no tiene respuesta', async () => {
      const grupo1 = creados.grupos.find((g) => g.nombre === 'VG Grupo 1');
      const d = dato(
        await get(`/api/dashboard/comparacion-grupos?semanas=8&grupoId=${grupo1.id}`)
      );
      expect(d.grupos).toHaveLength(3);
    });
  });

  describe('aislamiento entre docentes', () => {
    it('los datos del docente B no aparecen en los endpoints del docente A', async () => {
      const d = dato(await get('/api/dashboard/ranking-completo?semanas=8'));
      const alias = d.filas.map((f) => f.alias);
      expect(alias).not.toContain('Dante Ajeno');

      const dist = dato(await get('/api/dashboard/distribucion-niveles?semanas=8'));
      expect(dist.alcance.estudiantes).toBe(5);

      const comp = dato(await get('/api/dashboard/comparacion-grupos?semanas=8'));
      expect(comp.grupos.map((g) => g.nombre)).not.toContain('VG Grupo B');
    });

    it('un grupo ajeno responde 404, no una lista vacia', async () => {
      const grupoB = creados.grupos.find((g) => g.nombre === 'VG Grupo B');
      const res = await get(`/api/dashboard/distribucion-niveles?grupoId=${grupoB.id}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('el docente B solo ve lo suyo', async () => {
      const d = dato(await get('/api/dashboard/ranking-completo?semanas=8', TOKEN_B));
      expect(d.filas.map((f) => f.alias)).toEqual(['Dante Ajeno']);
      expect(d.filas[0].pct).toBe(100);
    });
  });

  describe('docente sin estudiantes', () => {
    it('los cuatro endpoints responden vacios y sin NaN', async () => {
      const docente = await makeDocenteVerificado();
      creados.docentes.push(docente.userId);
      const token = docente.token;

      const dist = dato(await get('/api/dashboard/distribucion-niveles?semanas=8', token));
      expect(dist.con_datos).toBe(0);
      expect(dist.niveles).toHaveLength(4);
      for (const n of dist.niveles) {
        expect(n.estudiantes).toBe(0);
        expect(n.pct).toBeNull();
      }

      const rk = dato(await get('/api/dashboard/ranking-completo?semanas=8', token));
      expect(rk.filas).toEqual([]);
      expect(rk.truncado).toBe(false);

      const part = dato(await get('/api/dashboard/participacion-semanal?semanas=8', token));
      expect(part.serie).toHaveLength(8);
      for (const punto of part.serie) {
        expect(punto.pct).toBeNull();
        expect(punto.brecha).toBeNull();
      }

      const comp = dato(await get('/api/dashboard/comparacion-grupos?semanas=8', token));
      expect(comp.grupos).toEqual([]);

      const crudo = JSON.stringify([dist, rk, part, comp]);
      expect(crudo).not.toMatch(/NaN|undefined/);
    });
  });
});