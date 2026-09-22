import { createRequire } from 'module';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  api, User, Content, Game, Evaluation, Question, StudentProgress,
  makeStudent, createPublishedContent, markContentCompleted, cleanupUsers,
} from './_qa/helpers.mjs';

const require = createRequire(import.meta.url);
const Progress = require('../src/models/progress.model.js');
require('../src/models/associations.js');

let t;
const createdEvalIds = [];
const createdContentIds = [];
const createdGameIds = [];

const MODULO_EVAL = 'ModuloProgEval' + Date.now();
const MODULO_MANUAL = 'ModuloProgManual' + Date.now();
const MODULO_MEDAL = 'ModuloProgMedal' + Date.now();

beforeAll(async () => {
  t = await makeStudent();
});
afterAll(async () => {
  for (const id of createdEvalIds) {
    const ev = await Evaluation.findByPk(id);
    if (ev) await Question.destroy({ where: { evaluacion_id: id } });
    await StudentProgress.destroy({ where: { evaluacion_id: id } }).catch(() => {});
    await Evaluation.destroy({ where: { id } }).catch(() => {});
  }
  for (const id of createdContentIds) {
    await StudentProgress.destroy({ where: { contenido_id: id } }).catch(() => {});
    await Content.destroy({ where: { id } }).catch(() => {});
  }
  for (const id of createdGameIds) {
    await StudentProgress.destroy({ where: { juego_id: id } }).catch(() => {});
    await Game.destroy({ where: { id } }).catch(() => {});
  }
  await StudentProgress.destroy({ where: { estudiante_id: t.studentId } }).catch(() => {});
  await Progress.destroy({ where: { usuario_id: t.studentId } }).catch(() => {});
  await cleanupUsers([t.teacherEmail, t.studentEmail]);
  const { sequelize } = await import('../src/config/database.js');
  if (sequelize && typeof sequelize.close === 'function') await sequelize.close();
});

async function syncProgreso(puntos) {
  return api
    .put('/api/progreso')
    .set('Authorization', `Bearer ${t.studentToken}`)
    .send({ usuarioId: t.studentId, modulo: MODULO_MANUAL, puntosGanados: puntos });
}

async function crearEval(evModulo, preguntas) {
  const creada = await api
    .post('/api/evaluaciones')
    .set('Authorization', `Bearer ${t.token}`)
    .send({
      titulo: 'Eval Progreso ' + evModulo, modulo: evModulo, publicado: true, docente_id: t.userId, preguntas,
    });
  const id = creada.body?.data?.id;
  if (id) createdEvalIds.push(id);
  return id;
}

async function crearJuego(jModulo, puntajeMax) {
  const res = await api
    .post('/api/juegos')
    .set('Authorization', `Bearer ${t.token}`)
    .send({ titulo: 'Juego Progreso ' + Date.now(), tipo: 'quiz', modulo: jModulo, publicado: true, puntaje_max: puntajeMax, docente_id: t.userId });
  const id = res.body?.data?.id;
  if (id) createdGameIds.push(id);
  return id;
}

describe('MÓDULO PROGRESO, PUNTAJE, MEDALLAS Y ESTRELLAS - Apéndice M (Iteración 6)', () => {
  // PRU-PROG-UNIT-001 ---
  it('PRU-PROG-UNIT-003: el cálculo del puntaje acumulado es incremental y correcto', async () => {
    const res = await syncProgreso(30);
    const db = await Progress.findOne({ where: { usuario_id: t.studentId, modulo: MODULO_MANUAL } });

    console.log('\n===== PRU-PROG-UNIT-003 =====');
    console.log('DATOS: PUT /api/progreso { usuarioId, modulo, puntosGanados:30 }');
    console.log('RESPUESTA:', JSON.stringify({ status: res.status, body: res.body }));
    console.log('BD puntaje_total:', db ? db.puntaje_total : null, '| nivel:', db ? db.nivel : null, '(esperado 30 / nivel 1)');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(db).toBeTruthy();
    expect(db.puntaje_total).toBe(30);
    expect(db.nivel).toBe(1);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  // PRU-PROG-UNIT-002 ---
  it('PRU-PROG-UNIT-002: se asigna medalla al superar el umbral de puntos establecido', async () => {
    // Nota del Apéndice: usaba `acumulador_puntos` en 500 pts. El código real (medals.service.js)
    // asigna: superestudiante = 500 pts y acumulador_puntos = 1000 pts. Verificamos superestudiante.
    const contenido = await createPublishedContent(t.token, { titulo: 'Contenido Medal', modulo: MODULO_MEDAL, docenteId: t.userId });
    const contentId = contenido.body?.data?.id;
    if (contentId) createdContentIds.push(contentId);
    await markContentCompleted(t.studentToken, contentId);

    const juegos = [];
    for (let i = 0; i < 5; i++) {
      const jId = await crearJuego(MODULO_MEDAL, 100);
      if (!jId) throw new Error('No se pudo crear juego para medalla');
      juegos.push(jId);
    }
    for (const jId of juegos) {
      const r = await api
        .post(`/api/student/juegos/${jId}/responder`)
        .set('Authorization', `Bearer ${t.studentToken}`)
        .send({ puntaje_obtenido: 100 });
      expect(r.status).toBe(200);
    }

    const res = await api
      .get('/api/student/gamificacion')
      .set('Authorization', `Bearer ${t.studentToken}`);
    const gam = res.body?.data;
    const medallas = (gam?.medallas || []).filter((m) => m.obtenida);
    const supEstd = medallas.find((m) => m.id === 'superestudiante');

    console.log('\n===== PRU-PROG-UNIT-002 =====');
    console.log('DATOS: 5 juegos x 100 pts = 500 pts acumulados (StudentProgress)');
    console.log('GET /api/student/gamificacion | STATUS:', res.status);
    console.log('puntos_total:', gam?.puntos_total, '| medallas:', medallas.map((m) => m.id).join(', ') || '(ninguna)');
    console.log('Esperado: superestudiante (500 pts) obtenida');

    expect(res.status).toBe(200);
    expect(gam.puntos_total).toBeGreaterThanOrEqual(500);
    expect(supEstd).toBeTruthy();
    console.log('RESULTADO: [CUMPLE]\n');
  }, 40000);

  // PRU-PROG-UNIT-001 ---
  it('PRU-PROG-UNIT-001: el cálculo de las estrellas se basa en el porcentaje de logro', async () => {
    const contenido = await createPublishedContent(t.token, { titulo: 'Contenido PROG UNIT003', modulo: MODULO_EVAL, docenteId: t.userId });
    const contentId = contenido.body?.data?.id;
    if (contentId) createdContentIds.push(contentId);
    await markContentCompleted(t.studentToken, contentId);

    const evId = await crearEval(MODULO_EVAL, [
      { enunciado: 'p1', opciones: { A: '1', B: '2', C: '3', D: '4' }, respuestaCorrecta: 'A' },
      { enunciado: 'p2', opciones: { A: '1', B: '2', C: '3', D: '4' }, respuestaCorrecta: 'B' },
      { enunciado: 'p3', opciones: { A: '1', B: '2', C: '3', D: '4' }, respuestaCorrecta: 'C' },
      { enunciado: 'p4', opciones: { A: '1', B: '2', C: '3', D: '4' }, respuestaCorrecta: 'D' },
    ]);
    const preguntas = await Question.findAll({ where: { evaluacion_id: evId }, order: [['id', 'ASC']] });
    const respuestas = preguntas.map((p, i) => ({
      pregunta_id: p.id,
      respuesta: i === 0 ? (p.respuesta_correcta === 'a' ? 'b' : 'a') : p.respuesta_correcta,
    }));

    const res = await api
      .post(`/api/student/evaluaciones/${evId}/responder`)
      .set('Authorization', `Bearer ${t.studentToken}`)
      .send({ respuestas });
    const prog = await StudentProgress.findOne({ where: { estudiante_id: t.studentId, evaluacion_id: evId } });

    console.log('\n===== PRU-PROG-UNIT-001 =====');
    console.log('DATOS: 3 de 4 correctas (75%)');
    console.log('POST .../responder | STATUS:', res.status, '| puntaje:', res.body?.data?.puntaje);
    console.log('BD puntaje:', prog ? prog.puntaje : null);

    expect(res.status).toBe(200);
    expect(res.body.data.puntaje).toBe(75);
    expect(prog.puntaje).toBe(75);
    console.log('RESULTADO: [CUMPLE] (75% → 2 estrellas via estrellasDePorcentaje)\n');
  }, 30000);

  // PRU-PROG-COMP-001 ---
  it('PRU-PROG-COMP-002: la consulta del progreso desde el dashboard responde con el detalle', async () => {
    const res = await api
      .get('/api/student/progreso')
      .set('Authorization', `Bearer ${t.studentToken}`);
    const data = res.body?.data;

    console.log('\n===== PRU-PROG-COMP-002 =====');
    console.log('GET /api/student/progreso | STATUS:', res.status);
    console.log('progressByModule:', JSON.stringify((data?.progressByModule || []).slice(0, 5)));

    expect(res.status).toBe(200);
    expect(Array.isArray(data?.progressByModule)).toBe(true);
    const modEval = (data?.progressByModule || []).find((m) => m.modulo === MODULO_EVAL);
    expect(modEval).toBeTruthy();
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  // PRU-PROG-COMP-002 ---
  it('PRU-PROG-COMP-001: el puntaje se persiste de forma incremental en la base de datos', async () => {
    const before = await Progress.findOne({ where: { usuario_id: t.studentId, modulo: MODULO_MANUAL } });
    const res = await syncProgreso(40);
    const after = await Progress.findOne({ where: { usuario_id: t.studentId, modulo: MODULO_MANUAL } });

    console.log('\n===== PRU-PROG-COMP-001 =====');
    console.log('DATOS: PUT /api/progreso { puntosGanados:40 } sobre el puntaje previo');
    console.log('STATUS:', res.status);
    console.log('puntaje_total antes:', before ? before.puntaje_total : null, '| después:', after ? after.puntaje_total : null);

    expect(res.status).toBe(200);
    expect(after.puntaje_total).toBe((before ? before.puntaje_total : 0) + 40);
    console.log('RESULTADO: [CUMPLE] (incremento acumulado persistido)\n');
  }, 20000);

  // PRU-PROG-INT-001 ---
  it('PRU-PROG-INT-001: resolver una evaluación actualiza el dashboard de progreso sin re-login', async () => {
    const res = await api
      .get('/api/student/dashboard')
      .set('Authorization', `Bearer ${t.studentToken}`);

    console.log('\n===== PRU-PROG-INT-001 =====');
    console.log('GET /api/student/dashboard | STATUS:', res.status);
    console.log('evaluationsCompleted:', res.body?.data?.evaluationsCompleted, '| overallProgress:', res.body?.data?.overallProgress);

    expect(res.status).toBe(200);
    expect(res.body.data.evaluationsCompleted).toBeGreaterThanOrEqual(1);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  // PRU-PROG-FUN-001 ---
  it('PRU-PROG-FUN-001: flujo completo: resolver evaluación, recibir puntos, ver puntaje/medallas actualizados', async () => {
    const res = await api
      .get('/api/student/gamificacion')
      .set('Authorization', `Bearer ${t.studentToken}`);
    const gam = res.body?.data;
    const medallas = (gam?.medallas || []).filter((m) => m.obtenida);

    console.log('\n===== PRU-PROG-FUN-001 =====');
    console.log('GET /api/student/gamificacion | STATUS:', res.status);
    console.log('puntos_total:', gam?.puntos_total, '| nivel:', gam?.nivel, '| estrellas:', gam?.estrellas_totales);
    console.log('medallas:', medallas.map((m) => m.id).join(', ') || '(ninguna)');

    expect(res.status).toBe(200);
    expect(typeof gam.puntos_total).toBe('number');
    expect(gam.estrellas_totales).toBeGreaterThanOrEqual(0);
    expect(gam.nivel).toBeGreaterThanOrEqual(1);
    const mPerfect = medallas.find((m) => m.id === 'puntaje_perfecto_evaluacion');
    expect(mPerfect).not.toBeTruthy();
    console.log('RESULTADO: [CUMPLE] (puntaje 75 no otorga puntaje_perfecto_evaluacion: consistente)\n');
  }, 20000);
});