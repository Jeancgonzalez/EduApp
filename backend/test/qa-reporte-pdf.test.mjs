import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { makeDocenteVerificado, registerStudentByTeacher, unique } from './_qa/helpers.mjs';

/**
 * QA del reporte PDF/CSV de Analítica (report.service.js + reportSchedule.service.js).
 *
 * Lo que este test persigue no es "no se rompe", sino el conjunto de defectos
 * que el PDF real exhibía:
 *
 *  1. **Celdas-objeto.** La tabla de riesgo guardaba el objeto entero del
 *     estudiante y `String(fila[clave])` imprimía `[object Object]`. La prueba
 *     extrae el texto del PDF (streams FlateDecode + zlib) y falla si aparece
 *     `[object Object]`, `NaN`, `undefined` o `null`.
 *  2. **El PDF no se generaba.** `setF()` no devolvía el `doc` y el encadenado
 *     `setF('bold').fontSize(...)` tiraba TypeError → la descarga daba 500.
 *  3. **Progreso medio inconsistente** (51% vs 56% vs 55.6). Ahora se calcula
 *     sobre UNA base, el % por estudiante; aquí se afirma el número exacto.
 *  4. **Privacidad.** Con la opción (nueva columna `incluir_nombres`) apagada,
 *     el reporte abrevia a primer nombre + inicial y avisa en las notas; con la
 *     opción encendida, muestra el nombre completo.
 *  5. **Textos legacy.** Los runs viejos con separador "·", tabla de riesgo de
 *     una columna o comparación de una fila se sanean al descargar.
 *
 * Los datos son concretos para poder afirmar números exactos:
 *   Ana  90% + 20%  -> 55% Básico
 *   Carla 75%       -> 75% Alto
 *   Bruno 40%       -> 40% Bajo  (en riesgo por logro)
 *   Elena 60%       -> 60% Básico (en riesgo: 10 días sin ingresar)
 *   Progreso medio = round((55+75+40+60)/4) = 58%
 */

const require = createRequire(import.meta.url);
require('../src/models/associations.js');
const { sequelize } = require('../src/config/database.js');
const ReportService = require('../src/services/report.service.js');

const zlib = require('zlib');

const diasAtras = (n) => new Date(Date.now() - n * 864e5);
const AYER = diasAtras(1);
const HACE_DIEZ_DIAS = diasAtras(10);

const creados = {
  docentes: [],
  estudiantes: [],
  grupos: [],
  contenidos: [],
  juegos: [],
  evaluaciones: [],
};

let DOCENTE_ID = 0;
let GRUPO_ALFA = null;
let GRUPO_BETA = null;

const seleccionar = async (sql, replacements) => {
  const filas = await sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
  return Array.isArray(filas) ? filas : [];
};

const idDeUsuario = async (email) => {
  const filas = await seleccionar('SELECT id FROM users WHERE email = :email', { email });
  return filas[0].id;
};

const crearEstudiante = async (tokenDocente, nombre) => {
  const email = unique('qa_rp_est@EduApp.com');
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

const insertarSesiones = async (sesiones) => {
  const tuplas = sesiones.map(() => `(?, ?, ?, ?)`);
  const valores = sesiones.flatMap((s) => [s.estudiante_id, s.docente_id, s.iniciado_en, 0]);
  await sequelize.query(
    `INSERT INTO estudiante_sesion (estudiante_id, docente_id, iniciado_en, duracion_seg) VALUES ${tuplas.join(', ')}`,
    { replacements: valores }
  );
};

/** Extrae el texto de un PDF: infla los streams FlateDecode y toma los tokens de texto. */
const extraerTexto = (pdf) => {
  const latin = pdf.toString('latin1');
  const textos = [];
  const reStream = /\/Filter\s*\/FlateDecode[^>]*>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = reStream.exec(latin)) !== null) {
    const bytes = Buffer.alloc(m[1].length);
    for (let i = 0; i < m[1].length; i += 1) bytes[i] = m[1].charCodeAt(i) & 0xff;
    let decod;
    try {
      decod = zlib.inflateSync(bytes);
    } catch {
      continue;
    }
    const contenido = decod.toString('latin1');
    // pdfkit 0.20 escribe `<hex>` dentro de los arrays TJ (y `(...)` en textos
    // simples); ambos se aceptan. Los números entre tokens son kerning y se
    // ignoran; las palabras se unen con espacio y se normaliza el resultado.
    const reTok = /<([0-9a-fA-F]{2,})>|\(((?:[^()\\]|\\.)*)\)/g;
    let t;
    while ((t = reTok.exec(contenido)) !== null) {
      if (t[1] !== undefined) {
        const hex = t[1].length % 2 === 1 ? `${t[1]}0` : t[1];
        textos.push(Buffer.from(hex, 'hex').toString('latin1'));
      } else {
        textos.push(t[2].replace(/\\([()\\])/g, '$1'));
      }
    }
  }
  return textos.join(' ').replace(/\s+/g, ' ').trim();
};

const PROHIBIDO = /\[object Object\]|NaN|undefined|\bnull\b|\u00b7/;

/** Ruptura de kerning: pdfkit reparte cada palabra en glifos separados por
 * números, así que "Sebastián F." extrae como "Sebastián F .". Para comparar
 * frases se ignora el espaciado. */
const plana = (s) => s.replace(/\s+/g, '');

beforeAll(async () => {
  // --- Docente y actividades -----------------------------------------------
  const docente = await makeDocenteVerificado();
  DOCENTE_ID = docente.userId;
  creados.docentes.push(DOCENTE_ID);

  await sequelize.query(
    `INSERT INTO contenidos (id, titulo, descripcion, tipo, contenido, modulo, docente_id, publicado, created_at, updated_at)
     VALUES (?)`,
    {
      replacements: [[
        712001, 'Apuntes de algebra QA', 'Apuntes', 'pdf', 'contenido', 'Algebra',
        DOCENTE_ID, 1, new Date(), new Date(),
      ]],
    }
  );
  creados.contenidos.push(712001);

  await sequelize.query(
    `INSERT INTO juegos (id, titulo, tipo, modulo, descripcion, docente_id, puntaje_max, publicado, created_at, updated_at)
     VALUES (?)`,
    {
      replacements: [[
        712002, 'Desafio QA', 'aritmetica', 'Algebra', 'Juego', DOCENTE_ID, 100, 1, new Date(), new Date(),
      ]],
    }
  );
  creados.juegos.push(712002);

  await sequelize.query(
    `INSERT INTO evaluaciones (id, titulo, descripcion, modulo, docente_id, tiempoLimitado, publicado, requiere_contenido_apoyo, createdAt, updatedAt)
     VALUES (?)`,
    {
      replacements: [[
        712003, 'Evaluacion QA', 'Evaluacion', 'Algebra', DOCENTE_ID, 0, 1, 0, new Date(), new Date(),
      ]],
    }
  );
  creados.evaluaciones.push(712003);

  // --- Estudiantes y grupos --------------------------------------------------
  const ana = await crearEstudiante(docente.token, 'Ana Ruiz');
  const carla = await crearEstudiante(docente.token, 'Carla Paz');
  const bruno = await crearEstudiante(docente.token, 'Bruno Diaz');
  const elena = await crearEstudiante(docente.token, 'Elena Soto');
  creados.estudiantes.push(ana, carla, bruno, elena);

  GRUPO_ALFA = await crearGrupo(DOCENTE_ID, 'QA Grupo Alfa');
  GRUPO_BETA = await crearGrupo(DOCENTE_ID, 'QA Grupo Beta');
  await sequelize.query(
    `INSERT INTO grupo_estudiantes (grupo_id, estudiante_id) VALUES (:a, :ana), (:a, :carla), (:b, :bruno), (:b, :elena)`,
    {
      replacements: {
        a: GRUPO_ALFA.id, b: GRUPO_BETA.id,
        ana: ana.id, carla: carla.id, bruno: bruno.id, elena: elena.id,
      },
    }
  );

  // --- Intentos (calificados) ------------------------------------------------
  await insertarIntentos([
    { estudiante_id: ana.id, docente_id: DOCENTE_ID, tipo: 'contenido', actividad_id: 712001, modulo: 'Algebra', puntaje_obtenido: 90, puntaje_maximo: 100, iniciado_en: AYER, completado: true },
    { estudiante_id: ana.id, docente_id: DOCENTE_ID, tipo: 'evaluacion', actividad_id: 712003, modulo: 'Algebra', puntaje_obtenido: 20, puntaje_maximo: 100, iniciado_en: AYER, completado: false },
    { estudiante_id: carla.id, docente_id: DOCENTE_ID, tipo: 'evaluacion', actividad_id: 712003, modulo: 'Algebra', puntaje_obtenido: 75, puntaje_maximo: 100, iniciado_en: AYER, completado: true },
    { estudiante_id: bruno.id, docente_id: DOCENTE_ID, tipo: 'evaluacion', actividad_id: 712003, modulo: 'Algebra', puntaje_obtenido: 40, puntaje_maximo: 100, iniciado_en: AYER, completado: false },
    { estudiante_id: elena.id, docente_id: DOCENTE_ID, tipo: 'contenido', actividad_id: 712001, modulo: 'Algebra', puntaje_obtenido: 60, puntaje_maximo: 100, iniciado_en: AYER, completado: true },
  ]);

  // Sesiones: todos salvo Elena tienen una sesión ayer; Elena hace 10 días,
  // así que entra en riesgo por inactividad (y no por la nota).
  await insertarSesiones([
    { estudiante_id: ana.id, docente_id: DOCENTE_ID, iniciado_en: AYER },
    { estudiante_id: carla.id, docente_id: DOCENTE_ID, iniciado_en: AYER },
    { estudiante_id: bruno.id, docente_id: DOCENTE_ID, iniciado_en: AYER },
    { estudiante_id: elena.id, docente_id: DOCENTE_ID, iniciado_en: HACE_DIEZ_DIAS },
  ]);
}, 120000);

afterAll(async () => {
  const idsDocentes = creados.docentes;
  const idsEstudiantes = creados.estudiantes.map((e) => e.id);
  const idsGrupos = creados.grupos.map((g) => g.id);

  if (idsDocentes.length) {
    await sequelize.query('DELETE FROM estudiante_sesion WHERE docente_id IN (?)', { replacements: [idsDocentes] }).catch(() => {});
    await sequelize.query('DELETE FROM actividad_intentos WHERE docente_id IN (?)', { replacements: [idsDocentes] }).catch(() => {});
  }
  if (idsGrupos.length) {
    await sequelize.query('DELETE FROM grupo_estudiantes WHERE grupo_id IN (?)', { replacements: [idsGrupos] }).catch(() => {});
    await sequelize.query('DELETE FROM grupos WHERE id IN (?)', { replacements: [idsGrupos] }).catch(() => {});
  }
  if (creados.contenidos.length) {
    await sequelize.query('DELETE FROM contenidos WHERE id IN (?)', { replacements: [creados.contenidos] }).catch(() => {});
  }
  if (creados.juegos.length) {
    await sequelize.query('DELETE FROM juegos WHERE id IN (?)', { replacements: [creados.juegos] }).catch(() => {});
  }
  if (creados.evaluaciones.length) {
    await sequelize.query('DELETE FROM evaluaciones WHERE id IN (?)', { replacements: [creados.evaluaciones] }).catch(() => {});
  }
  if (idsEstudiantes.length) {
    await sequelize.query('DELETE FROM diagnostico_aplicaciones WHERE estudiante_id IN (?)', { replacements: [idsEstudiantes] }).catch(() => {});
    await sequelize.query('DELETE FROM users WHERE id IN (?)', { replacements: [idsEstudiantes] }).catch(() => {});
  }
  if (idsDocentes.length) {
    await sequelize.query('DELETE FROM users WHERE id IN (?)', { replacements: [idsDocentes] }).catch(() => {});
  }
  await sequelize.close().catch(() => {});
});

const SECCIONES = ['resumen', 'grupo', 'estudiantes', 'temas'];

const construir = (extra = {}) =>
  ReportService.construirSnapshotAnalitico({
    docenteId: DOCENTE_ID,
    secciones: SECCIONES,
    semanas: 8,
    titulo: 'Reporte de Analítica',
    ...extra,
  });

describe('construirSnapshotAnalitico (reporte nuevo)', () => {
  it('estructura las secciones y los textos correctos', async () => {
    const s = await construir();
    expect(s.secciones_etiquetas).toEqual([
      'Resumen general',
      'Vista de grupo',
      'Progreso por estudiante',
      'Progreso por curso',
    ]);
    expect(s.secciones).toEqual(SECCIONES);
    expect(s.notas.length).toBeGreaterThanOrEqual(4);
    expect(s.docente.nombre).toBeTruthy();
    expect(s.periodo.semanas).toBe(8);
  });

  it('el Progreso medio sale del promedio por estudiante (misma base que la Comparación)', async () => {
    const s = await construir();
    const kpi = s.kpis.find((k) => k.etiqueta === 'Progreso medio');
    expect(kpi.valor).toBe('58%');
    expect(kpi.detalle).toContain('Básico');
  });

  it('la tabla de riesgo tiene las 5 columnas y filas planas (sin objetos)', async () => {
    const s = await construir();
    const tabla = s.tablas.find((t) => t.clave === 'riesgo');
    expect(tabla).toBeTruthy();
    expect(tabla.columnas.map((c) => c.clave)).toEqual(['alias', 'nivel', 'pct', 'dias', 'motivo']);
    expect(tabla.filas.length).toBe(2);
    const crudo = JSON.stringify(tabla.filas);
    expect(crudo).not.toMatch(/\[object Object\]|NaN|undefined/);
    expect(tabla.filas[0]).toMatchObject({ alias: 'Bruno D.', pct: '40%', nivel: 'Bajo' });
    expect(tabla.filas[1].pct).toBe('60%');
    expect(tabla.filas[1].dias).toMatch(/^\d+ d$/);
    expect(tabla.filas[1].motivo).toBeTruthy();
  });

  it('la Comparación muestra todos los grupos y no se colapsa en una fila', async () => {
    const s = await construir();
    const tabla = s.tablas.find((t) => t.clave === 'grupos');
    expect(tabla.titulo).toBe('Comparación entre grupos');
    expect(tabla.filas).toHaveLength(2);
    expect(s.distribucion_niveles).toBeUndefined();
    const dist = s.tablas.find((t) => t.clave === 'niveles');
    expect(dist.filas.map((f) => [f.nivel, f.estudiantes])).toEqual([
      ['Bajo', 1], ['Básico', 2], ['Alto', 1], ['Superior', 0],
    ]);
  });

  it('"Progreso por tema" se llama "Progreso por curso" y el grupo plano por curso', async () => {
    const s = await construir();
    const tabla = s.tablas.find((t) => t.clave === 'temas');
    expect(tabla.titulo).toBe('Progreso por curso');
    expect(tabla.columnas[0].etiqueta).toBe('Curso');
    expect(tabla.filas[0]).toMatchObject({ nombre: 'Algebra', semanas: expect.any(Number) });

    const etiqueta = s.secciones_etiquetas[3];
    expect(etiqueta).toBe('Progreso por curso');
  });
});

describe('privacy: incluirNombres', () => {
  it('por defecto abrevia nombres e incluye la nota de privacidad', async () => {
    const s = await construir({ incluirNombres: false });
    const est = s.tablas.find((t) => t.clave === 'estudiantes');
    expect(est.filas.map((f) => f.alias)).toEqual(
      expect.arrayContaining(['Ana R.', 'Bruno D.'])
    );
    expect(JSON.stringify(est.filas)).not.toContain('Ana Ruiz');
    expect(s.notas.join(' ')).toContain('nombre abreviado');
  });

  it('con la opción activada muestra el nombre completo', async () => {
    const s = await construir({ incluirNombres: true });
    const est = s.tablas.find((t) => t.clave === 'estudiantes');
    expect(est.filas.map((f) => f.alias)).toEqual(
      expect.arrayContaining(['Ana Ruiz', 'Bruno Diaz'])
    );
    expect(s.notas.join(' ')).toContain('nombres completos');
  });
});

describe('renderPdf / renderCsv', () => {
  it('genera un PDF con texto legible y sin glifos/valores prohibidos', async () => {
    const s = await construir({ incluirNombres: false });
    const pdf = await ReportService.renderPdf(s);
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(2000);

    const texto = extraerTexto(pdf);
    expect(texto.length).toBeGreaterThan(50);
    expect(texto).not.toMatch(PROHIBIDO);
    for (const esperado of [
      'Reporte de Analítica',
      'Progreso medio',
      'Estudiantes en riesgo',
      'Comparación entre grupos',
      'Progreso por curso',
      'Notas del reporte',
      'Bruno D.',
    ]) {
      expect(plana(texto)).toContain(plana(esperado));
    }
  });

  it('PDF con nombres: el nombre completo reemplaza al alias', async () => {
    const s = await construir({ incluirNombres: true });
    const pdf = await ReportService.renderPdf(s);
    const texto = extraerTexto(pdf);
    expect(texto).not.toMatch(PROHIBIDO);
    expect(plana(texto)).toContain('AnaRuiz');
    expect(plana(texto)).not.toContain('AnaR.');
  });

  it('CVS con separador ; , BOM UTF-8 y sin valores prohibidos', async () => {
    const s = await construir({ incluirNombres: false });
    const csv = ReportService.renderCsv(s);
    const texto = csv.toString('utf8');
    expect(csv[0]).toBe(0xef);
    expect(csv[1]).toBe(0xbb);
    expect(csv[2]).toBe(0xbf);
    expect(texto.trim()).toContain(';');
    expect(texto).not.toMatch(PROHIBIDO);
    expect(texto).toContain('Progreso por curso');
    expect(texto).toContain('NOTAS DEL REPORTE');
  });
});

describe('_sanearSnapshot (runs legacy)', () => {
  it('repara la tabla de riesgo, la comparación de una fila, separadores y títulos', async () => {
    const legado = {
      titulo: 'Reporte de Analítica',
      generado_en: new Date().toISOString(),
      docente: { id: 1, nombre: 'Docente Demo Gra' },
      alcance: { grupo_nombre: 'Grupo B - Tarde', grupo_materia: 'Informática', estudiantes: 9, grupos: 1 },
      periodo: { semanas: 8, desde: '2026-08-11', hasta: '2026-10-06' },
      secciones: ['resumen', 'grupo', 'estudiantes', 'temas'],
      kpis: [
        { etiqueta: 'Progreso medio', valor: '51%', detalle: 'Básico · -6 pp vs. período anterior' },
      ],
      tablas: [
        {
          clave: 'riesgo',
          titulo: 'Estudiantes en riesgo',
          columnas: [{ clave: 'alias', etiqueta: 'Alias' }],
          filas: [
            {
              alias: {
                estudiante_id: 9,
                alias: 'Sebastián Franco',
                pct: 27,
                dias_sin_ingresar: 15,
                motivo: 'bajo',
                motivo_texto: 'Bajo nivel de desempeño',
              },
            },
          ],
          nota: 'Sobre 9 estudiante(s) con nota.',
        },
        {
          clave: 'grupos',
          titulo: 'Comparación - Grupo B - Tarde',
          columnas: [{ clave: 'nombre', etiqueta: 'Grupo' }],
          filas: [{ nombre: 'Grupo B - Tarde' }],
          nota: 'El filtro de grupo se aplicó también a esta comparación.',
        },
        {
          clave: 'temas',
          titulo: 'Progreso por tema',
          columnas: [{ clave: 'nombre', etiqueta: 'Tema' }],
          filas: [{ nombre: 'Informática 101', semanas: 7, promedio: '53%', mejor: '70%' }],
          nota: null,
        },
      ],
    };

    const sano = ReportService._sanearSnapshot(legado);
    expect(sano.kpis[0].detalle).not.toContain('·');
    expect(sano.kpis[0].detalle).toContain(' | ');

    const riesgo = sano.tablas.find((t) => t.clave === 'riesgo');
    expect(riesgo.columnas.map((c) => c.clave)).toEqual(['alias', 'nivel', 'pct', 'dias', 'motivo']);
    expect(riesgo.filas[0]).toMatchObject({ alias: 'Sebastián F.', pct: '27%', dias: '15 d' });
    expect(riesgo.filas[0].motivo).toContain('Bajo nivel de desempeño');

    expect(sano.tablas.find((t) => t.clave === 'grupos')).toBeUndefined();

    const temas = sano.tablas.find((t) => t.clave === 'temas');
    expect(temas.titulo).toBe('Progreso por curso');
    expect(temas.columnas[0].etiqueta).toBe('Curso');

    const pdf = await ReportService.renderPdf(sano);
    const texto = extraerTexto(pdf);
    expect(texto).not.toMatch(PROHIBIDO);
    expect(plana(texto)).toContain('SebastiánF.');
    expect(plana(texto)).toContain('Progresoporcurso');
  });
});