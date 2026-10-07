import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import {
  api,
  login,
  makeDocenteVerificado,
  registerStudentByTeacher,
  unique,
} from './_qa/helpers.mjs';

/**
 * QA del Resumen General del panel del docente.
 *
 * Dos cosas se protegen aquí:
 *
 *  1. **El contrato.** Que `actual` y `anterior` tengan la MISMA forma (si no, la
 *     variación de la interfaz lee `undefined` y sale NaN), que el nivel venga de
 *     los umbrales que el propio endpoint devuelve, y que la lista de riesgo
 *     cumpla el criterio que se publica.
 *
 *  2. **El aislamiento.** Un docente NO puede leer lo de otro. Se crean dos
 *     docentes con datos propios y se contrasta cada endpoint: si el servicio
 *     cruzara `docente_id`, los totales no cuadrarían.
 *
 * Los intentos se insertan con puntajes concretos para poder afirmar números
 * exactos (participación 100%, progreso 70%, XP 93...). Con datos aleatorios el
 * test solo podría decir "no se rompe", que es justo lo que no alcanza para
 * detectar un `JOIN` mal puesto o un promedio mal calculado.
 *
 * Los fixtures usan `makeDocenteVerificado()` en vez de `makeTeacher()` porque no
 * dependen de MailHog: el token, los middleware y la autorización se siguen
 * recorriendo igual por el endpoint de login.
 */

const NIVELES = ['Bajo', 'Básico', 'Alto', 'Superior'];

/** Fecha en el pasado, en días, para simular "hace N días". */
const diasAtras = (n) => new Date(Date.now() - n * 864e5);

// La base se carga como CommonJS, igual que la aplicación. Además las filas se
// leen siempre con `filas[0]`: el destructuring anidado `const [[fila]] = ...`
// sobre el resultado de `sequelize.query` no es fiable aquí, y un fallo así
// dice "object is not iterable", que no apunta al SQL que se quiere revisar.
const require = createRequire(import.meta.url);
const { sequelize } = require('../src/config/database.js');

const creados = { docentes: [], estudiantes: [], grupos: [] };

/** Token del docente A: es el "docente bajo prueba" de toda la suite. */
let TOKEN = '';
/** Token del docente B, que solo sirve para contrastar el aislamiento. */
let TOKEN_B = '';

const seleccionar = async (sql, replacements) => {
  const filas = await sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
  return Array.isArray(filas) ? filas : [];
};

const idDeUsuario = async (email) => {
  const filas = await seleccionar('SELECT id FROM users WHERE email = :email', { email });
  return filas[0].id;
};

/**
 * Registra un estudiante por la API real y devuelve su id.
 *
 * Se usa `/api/cuentas/register` y no una inserción directa porque lo que se
 * quiere comprobar es justamente que ese camino deja `docente_id` asignado: de
 * eso depende `_estudiantesDocente`, la base de todos los KPIs.
 */
const crearEstudiante = async (tokenDocente, nombre) => {
  const email = unique('qa_est@EduApp.com');
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
  const docenteId = (await seleccionar('SELECT docente_id FROM users WHERE id = :id', { id }))[0].docente_id;
  return { id, docenteId, alias: nombre, email };
};

/** Inserta intentos de una sola vez: `bulkCreate` es estático del modelo, no de la instancia. */
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

const crearGrupo = async (docenteId, nombre) => {
  await sequelize.query(
    `INSERT INTO grupos (docente_id, materia, nombre, creado_at) VALUES (:d, 'Matemáticas', :n, NOW())`,
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

beforeAll(async () => {
  // --- Docente A: 3 estudiantes, 2 grupos, intentos de nota conocida --------
  const docenteA = await makeDocenteVerificado();
  TOKEN = docenteA.token;
  creados.docentes.push(docenteA.userId);

  const ana = await crearEstudiante(docenteA.token, 'Ana Ruiz');
  const bruno = await crearEstudiante(docenteA.token, 'Bruno Díaz');
  const carla = await crearEstudiante(docenteA.token, 'Carla Paz');
  creados.estudiantes.push(ana, bruno, carla);

  const grupo1 = await crearGrupo(docenteA.userId, 'Grupo 1');
  const grupo2 = await crearGrupo(docenteA.userId, 'Grupo 2');
  // Ana y Bruno en el grupo 1; Carla sola en el grupo 2.
  for (const [e, g] of [[ana, grupo1], [bruno, grupo1], [carla, grupo2]]) {
    await sequelize.query('INSERT INTO grupo_estudiantes (grupo_id, estudiante_id) VALUES (:g, :e)', {
      replacements: { g: g.id, e: e.id },
    });
  }

  // `pct_progreso` promedia TODOS los intentos con nota; el XP suma el MEJOR por
  // actividad, así que cada intento va en una actividad distinta para que la
  // suma sea calculable a mano.
  //
  // Ana 90% + 50% -> promedio 70 (Alto), XP 90+50 = 140
  // Bruno 40%                -> Bajo, y por tanto en riesgo por desempeño
  // Carla 100%               -> Superior, fuera de riesgo
  await insertarIntentos([
    { estudiante_id: ana.id, docente_id: docenteA.userId, tipo: 'evaluacion', actividad_id: 900001, modulo: 'Álgebra', puntaje_obtenido: 90, puntaje_maximo: 100, iniciado_en: diasAtras(1), completado: true },
    { estudiante_id: ana.id, docente_id: docenteA.userId, tipo: 'evaluacion', actividad_id: 900002, modulo: 'Álgebra', puntaje_obtenido: 50, puntaje_maximo: 100, iniciado_en: diasAtras(2), completado: false },
    { estudiante_id: bruno.id, docente_id: docenteA.userId, tipo: 'evaluacion', actividad_id: 900003, modulo: 'Geometría', puntaje_obtenido: 40, puntaje_maximo: 100, iniciado_en: diasAtras(1), completado: false },
    { estudiante_id: carla.id, docente_id: docenteA.userId, tipo: 'evaluacion', actividad_id: 900004, modulo: 'Geometría', puntaje_obtenido: 100, puntaje_maximo: 100, iniciado_en: diasAtras(1), completado: true },
  ]);

  // --- Docente B: un estudiante, para probar el aislamiento ----------------
  const docenteB = await makeDocenteVerificado();
  TOKEN_B = docenteB.token;
  creados.docentes.push(docenteB.userId);
  const dante = await crearEstudiante(docenteB.token, 'Dante Solo');
  creados.estudiantes.push(dante);
  await crearGrupo(docenteB.userId, 'Grupo B');
  await insertarIntentos([
    { estudiante_id: dante.id, docente_id: docenteB.userId, tipo: 'evaluacion', actividad_id: 900009, modulo: 'Ajeno', puntaje_obtenido: 10, puntaje_maximo: 100, iniciado_en: diasAtras(1), completado: false },
  ]);
}, 120000);

afterAll(async () => {
  const idsDocentes = creados.docentes;
  const idsEstudiantes = creados.estudiantes.map((e) => e.id);
  const idsGrupos = creados.grupos.map((g) => g.id);

  // El orden importa: `grupo_estudiantes`, `diagnostico_aplicaciones` y
  // `users.docente_id` son claves foráneas a `users`. Primero los dependents,
  // después los estudiantes y por último los docentes.
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

describe('QA-DASHBOARD · Resumen General', () => {
  it('exige token y rechaza a quien no es docente', async () => {
    const sinToken = await api.get('/api/dashboard/resumen');
    expect(sinToken.status).toBe(401);

    const docente = await makeDocenteVerificado();
    creados.docentes.push(docente.userId);
    const estudiante = await crearEstudiante(docente.token, 'Estudiante QA');
    creados.estudiantes.push(estudiante);
    const sesion = await login(estudiante.email, 'pass1234');

    const comoEstudiante = await api
      .get('/api/dashboard/resumen')
      .set('Authorization', `Bearer ${sesion.token}`);
    expect(comoEstudiante.status).toBe(403);
  });

  it('el registro de estudiantes les asigna docente_id, de eso dependen los KPIs', async () => {
    // Se comprueba a propósito: `_estudiantesDocente` filtra por `users.docente_id`
    // y, si el registro no lo dejara asignado, todos los KPIs saldrían en cero.
    for (const e of creados.estudiantes.filter((x) => x.docenteId)) {
      expect(e.docenteId, `${e.alias} quedó sin docente_id`).not.toBeNull();
    }
  });

  it('el resumen trae actual, anterior, umbrales y periodo', async () => {
    const res = await api
      .get('/api/dashboard/resumen?semanas=8')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const d = res.body.data;

    for (const bloque of ['actual', 'anterior']) {
      expect(d[bloque], `falta ${bloque}`).toBeDefined();
      expect(d[bloque].participacion).toHaveProperty('pct');
      expect(d[bloque].participacion).toHaveProperty('estudiantes');
      expect(d[bloque].progreso).toHaveProperty('pct');
      expect(d[bloque].progreso).toHaveProperty('nivel');
      expect(d[bloque].riesgo).toHaveProperty('total');
      expect(d[bloque].xp).toHaveProperty('promedio');
      expect(d[bloque].activos).toHaveProperty('total');
    }

    expect(d.periodo.semanas).toBe(8);
    expect(d.periodo_anterior.semanas).toBe(8);
    expect(d.umbrales.niveles).toHaveLength(4);
    expect(d.umbrales.riesgo).toHaveProperty('pct_max');
    expect(d.umbrales.riesgo).toHaveProperty('dias_sin_ingresar');
  });

  it('las dos ventanas no se solapan', async () => {
    const res = await api.get('/api/dashboard/resumen?semanas=8').set('Authorization', `Bearer ${TOKEN}`);
    const { periodo, periodo_anterior: anterior } = res.body.data;
    // Si se solaparan, la variación compararía un período consigo mismo.
    expect(periodo.desde).toBe(anterior.hasta);
    expect(anterior.desde < periodo.desde).toBe(true);
  });

  it('los KPIs cuadran con los intentos sembrados', async () => {
    const res = await api.get('/api/dashboard/resumen?semanas=8').set('Authorization', `Bearer ${TOKEN}`);
    const { actual } = res.body.data;

    expect(actual.participacion.estudiantes).toBe(3);
    expect(actual.participacion.estudiantes_activos).toBe(3);
    expect(actual.participacion.pct).toBe(100);

    // AVG(90, 50, 40, 100) = 70
    expect(actual.progreso.pct).toBe(70);
    expect(actual.progreso.nivel).toBe('Alto');

    // XP = mejor puntaje por actividad, sumado por estudiante y promediado:
    // Ana 90+50 = 140, Bruno 40, Carla 100 -> (140+40+100)/3 = 93
    expect(actual.xp.promedio).toBe(93);
    expect(actual.xp.estudiantes).toBe(3);
  });

  it('el nivel se deriva de los umbrales que devuelve el propio endpoint', async () => {
    const res = await api.get('/api/dashboard/resumen?semanas=8').set('Authorization', `Bearer ${TOKEN}`);
    const { umbrales, actual, anterior } = res.body.data;
    const corte = new Map(umbrales.niveles.map((n) => [n.nivel, n.minimo]));
    const esperado = (pct) =>
      pct >= corte.get('Superior') ? 'Superior'
        : pct >= corte.get('Alto') ? 'Alto'
          : pct >= corte.get('Básico') ? 'Básico'
            : 'Bajo';

    expect(actual.progreso.nivel).toBe(esperado(actual.progreso.pct));
    expect([null, ...NIVELES]).toContain(anterior.progreso.nivel);
  });

  it('la lista de riesgo trae alias y motivo, y cumple el criterio servido', async () => {
    const res = await api.get('/api/dashboard/resumen?semanas=8').set('Authorization', `Bearer ${TOKEN}`);
    const { actual, anterior, umbrales } = res.body.data;
    const { pct_max: pctMax, dias_sin_ingresar: dias } = umbrales.riesgo;

    // Solo Bruno (40%) entra: Ana promedia 70 y Carla 100.
    expect(actual.riesgo.total).toBe(1);
    expect(actual.riesgo.truncado).toBe(false);
    expect(actual.riesgo.aliases).toHaveLength(1);

    const alias = actual.riesgo.aliases[0];
    expect(alias.alias).toBe('Bruno Díaz');
    expect(alias.motivo).toBe('bajo');
    expect(alias.motivo_texto).toBeTruthy();
    expect(alias.pct).toBe(40);

    // Nunca se expone el correo: el docente ve el alias, no la cuenta.
    expect(JSON.stringify(alias)).not.toContain('@');

    // Nadie puede estar en la lista sin cumplir alguno de los dos criterios.
    for (const a of actual.riesgo.aliases) {
      const porDesempeno = a.pct != null && a.pct < pctMax;
      const porInactividad = a.dias_sin_ingresar != null && a.dias_sin_ingresar >= dias;
      expect(porDesempeno || porInactividad).toBe(true);
    }

    // El período anterior no repite la lista: alcanza el conteo para la variación.
    expect(anterior.riesgo.aliases).toEqual([]);
  });

  it('progreso-por-tema devuelve un punto por semana y claves estables', async () => {
    const res = await api
      .get('/api/dashboard/progreso-por-tema?semanas=8')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const { temas, serie, periodo } = res.body.data;

    expect(periodo.semanas).toBe(8);
    expect(serie).toHaveLength(8);
    // Como conjuntos: `sort()` ordena por UTF-16, así que 'Geometría' queda antes
    // que 'Álgebra'. Lo que importa es que estén los dos, no su posición.
    expect([...temas.map((t) => t.nombre)].sort()).toEqual(['Geometría', 'Álgebra'].sort());
    // `dataKey` de Recharts no puede ser el nombre del módulo: es texto libre
    // con tildes y espacios, y rompería la gráfica.
    expect(temas.map((t) => t.clave)).toEqual(['t1', 't2']);

    const claves = new Set(temas.map((t) => t.clave));
    for (const punto of serie) {
      expect(Object.keys(punto).filter((k) => k !== 'semana').sort()).toEqual([...claves].sort());
      for (const clave of claves) {
        // null en las semanas sin actividad, y nunca fuera de 0..100.
        expect(punto[clave] === null || (punto[clave] >= 0 && punto[clave] <= 100)).toBe(true);
      }
    }

    // Los 4 intentos están dentro de la ventana de 8 semanas. `_cubosSemana`
    // alinea al lunes, así que pueden repartirse en la semana en curso y la
    // anterior; en cualquiera de los dos casos el promedio por tema es 70.
    for (const tema of temas) {
      const valores = serie.map((p) => p[tema.clave]).filter((v) => v != null);
      expect(valores.length).toBeGreaterThan(0);
      for (const v of valores) expect(v).toBe(70);
    }
  });

  it('el ranking limita a 5, ordena y numera de forma correlativa', async () => {
    const res = await api.get('/api/dashboard/ranking?semanas=8').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const { top, total_estudiantes: total } = res.body.data;

    expect(total).toBe(3);
    expect(top).toHaveLength(3);
    expect(top.map((t) => t.posicion)).toEqual([1, 2, 3]);
    expect(top.map((t) => t.alias)).toEqual(['Carla Paz', 'Ana Ruiz', 'Bruno Díaz']);
    expect(top.map((t) => t.pct)).toEqual([100, 70, 40]);
    expect(top.map((t) => t.nivel)).toEqual(['Superior', 'Alto', 'Bajo']);
    expect(JSON.stringify(top)).not.toContain('@');

    // `?limite=` manda sobre el 5 por defecto.
    const acotado = await api
      .get('/api/dashboard/ranking?semanas=8&limite=2')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(acotado.body.data.top).toHaveLength(2);
  });

  it('conceptos-error solo trae actividades con error y con porcentaje coherente', async () => {
    const res = await api
      .get('/api/dashboard/conceptos-error?semanas=8')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const { top } = res.body.data;

    // Ana tiene un acierto (900001) y un fallo (900002); Bruno falla (900003);
    // Carla acierta (900004).
    expect(top).toHaveLength(2);
    for (const c of top) {
      expect(c.errores).toBeGreaterThan(0);
      expect(c.errores).toBeLessThanOrEqual(c.intentos);
      expect(c.pct_error).toBe(Math.round((c.errores / c.intentos) * 100));
      expect(c.nombre).toBeTruthy();
      expect(c.nombre).not.toBe('null');
    }
    // Ordenado por errores descendente.
    expect(top[0].errores).toBeGreaterThanOrEqual(top[1].errores);
  });

  it('el filtro por grupo acota a los estudiantes de ese grupo', async () => {
    const grupo1 = creados.grupos[0];
    const res = await api
      .get(`/api/dashboard/resumen?semanas=8&grupoId=${grupo1.id}`)
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const { actual, alcance } = res.body.data;

    expect(alcance.estudiantes).toBe(2);
    expect(actual.participacion.estudiantes).toBe(2);
    // AVG(90, 50, 40) = 60
    expect(actual.progreso.pct).toBe(60);
    // Ana 140 + Bruno 40 -> 90
    expect(actual.xp.promedio).toBe(90);
    // Carla (Grupo 2) no debe aparecer en el ranking del grupo 1.
    const ranking = await api
      .get(`/api/dashboard/ranking?semanas=8&grupoId=${grupo1.id}`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(ranking.body.data.top.map((t) => t.alias).sort()).toEqual(['Ana Ruiz', 'Bruno Díaz']);
  });

  it('un grupo de otro docente responde 404, no datos ajenos', async () => {
    const grupoAjeno = creados.grupos[creados.grupos.length - 1];
    for (const ruta of ['resumen', 'ranking', 'progreso-por-tema', 'conceptos-error']) {
      const res = await api
        .get(`/api/dashboard/${ruta}?grupoId=${grupoAjeno.id}`)
        .set('Authorization', `Bearer ${TOKEN}`);
      expect(res.status, `${ruta} debería dar 404`).toBe(404);
      expect(res.body.success).toBe(false);
    }
  });

  it('un docente no ve los datos de otro', async () => {
    // Se usa el docente B de `beforeAll`, que tiene un estudiante con 10%: si se
    // creara uno nuevo aquí saldría con cero estudiantes y no probaría nada.
    expect(TOKEN_B).toBeTruthy();

    const resumenB = await api
      .get('/api/dashboard/resumen?semanas=8')
      .set('Authorization', `Bearer ${TOKEN_B}`);
    expect(resumenB.status).toBe(200);
    expect(resumenB.body.data.actual.participacion.estudiantes).toBe(1);
    expect(resumenB.body.data.actual.progreso.pct).toBe(10);

    const rankingB = await api
      .get('/api/dashboard/ranking?semanas=8')
      .set('Authorization', `Bearer ${TOKEN_B}`);
    expect(rankingB.body.data.top.map((t) => t.alias)).toEqual(['Dante Solo']);

    // Y al revés: el docente A no ve a Dante ni su módulo "Ajeno".
    const rankingA = await api
      .get('/api/dashboard/ranking?semanas=8')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(JSON.stringify(rankingA.body.data)).not.toContain('Dante Solo');

    const temasA = await api
      .get('/api/dashboard/progreso-por-tema?semanas=8')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(JSON.stringify(temasA.body.data)).not.toContain('Ajeno');
  });

  it('un docente sin estudiantes devuelve ceros y nulos, no NaN ni nivel inventado', async () => {
    const vacio = await makeDocenteVerificado();
    creados.docentes.push(vacio.userId);

    const res = await api
      .get('/api/dashboard/resumen?semanas=8')
      .set('Authorization', `Bearer ${vacio.token}`);

    expect(res.status).toBe(200);
    const { actual, alcance } = res.body.data;
    expect(alcance.estudiantes).toBe(0);
    expect(actual.participacion.pct).toBe(0);
    // Sin nota no se inventa un nivel: `null` para que la interfaz diga
    // "Sin datos" en vez de "Bajo", que sería una afirmación falsa.
    expect(actual.progreso.pct).toBeNull();
    expect(actual.progreso.nivel).toBeNull();
    expect(actual.riesgo.total).toBe(0);
    expect(actual.riesgo.aliases).toEqual([]);
    expect(actual.xp.promedio).toBeNull();
    expect(actual.activos.total).toBe(0);

    // La gráfica también responde, con la serie completa y sin temas.
    const temas = await api
      .get('/api/dashboard/progreso-por-tema?semanas=8')
      .set('Authorization', `Bearer ${vacio.token}`);
    expect(temas.status).toBe(200);
    expect(temas.body.data.temas).toEqual([]);
    expect(temas.body.data.serie).toHaveLength(8);
  });

  it('las semanas inválidas caen al valor por defecto en vez de romper', async () => {
    for (const q of ['semanas=0', 'semanas=abc', 'semanas=-5', 'semanas=999']) {
      const res = await api.get(`/api/dashboard/resumen?${q}`).set('Authorization', `Bearer ${TOKEN}`);
      expect(res.status, `${q} no debería dar error`).toBe(200);
      // 999 se acota al tope de 26; el resto vuelve al default de 8.
      expect([8, 26]).toContain(res.body.data.periodo.semanas);
    }
    // El número de puntos de la serie sigue a `semanas`.
    const serie = await api
      .get('/api/dashboard/progreso-por-tema?semanas=4')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(serie.body.data.serie).toHaveLength(4);
  });
});