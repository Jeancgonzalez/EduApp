import { createRequire } from 'module';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  api, User, Content, Game, Evaluation, Question, StudentProgress,
  makeStudent, makeTeacher, createPublishedContent, markContentCompleted, cleanupUsers,
} from './_qa/helpers.mjs';

const require = createRequire(import.meta.url);
require('../src/models/associations.js');
const Progress = require('../src/models/progress.model.js');

let t;
let tB;
const createdEvalIds = [];
const createdContentIds = [];
let modSeq = 0;
function nextMod() { modSeq += 1; return `ModuloResEval${Date.now()}_${modSeq}`; }

const P1 = [{ enunciado: '2+2?', opciones: { A: '1', B: '2', C: '3', D: '4' }, respuestaCorrecta: 'B' }];
const P2 = [
  { enunciado: '2+2?', opciones: { A: '1', B: '2', C: '3', D: '4' }, respuestaCorrecta: 'B' },
  { enunciado: '3+2?', opciones: { A: '4', B: '5', C: '6', D: '7' }, respuestaCorrecta: 'B' },
];

beforeAll(async () => {
  t = await makeStudent();
  tB = await makeTeacher();
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
  await StudentProgress.destroy({ where: { estudiante_id: t.studentId } }).catch(() => {});
  await Progress.destroy({ where: { usuario_id: t.studentId } }).catch(() => {});
  await cleanupUsers([t.teacherEmail, t.studentEmail, tB.teacherEmail]);
  const { sequelize } = await import('../src/config/database.js');
  if (sequelize && typeof sequelize.close === 'function') await sequelize.close();
});

async function setUpModule(teacherToken, docenteId, modulo) {
  const c = await createPublishedContent(teacherToken, { titulo: 'Contenido ResEval ' + modulo, modulo, docenteId });
  const contentId = c.body?.data?.id;
  if (contentId) createdContentIds.push(contentId);
  if (teacherToken === t.token) {
    await markContentCompleted(t.studentToken, contentId);
  }
  return contentId;
}

async function createEval(modulo, preguntas, extra = {}) {
  const res = await api
    .post('/api/evaluaciones')
    .set('Authorization', `Bearer ${t.token}`)
    .send({ titulo: 'Eval ResEval ' + modulo, modulo, publicado: true, docente_id: t.userId, preguntas, ...extra });
  const id = res.body?.data?.id;
  if (id) createdEvalIds.push(id);
  return id;
}

async function responderEval(studentToken, evId, respuestas, extraBody = {}) {
  return api
    .post(`/api/student/evaluaciones/${evId}/responder`)
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ respuestas, ...extraBody });
}

describe('MÓDULO RESOLUCIÓN DE EVALUACIONES - ESTUDIANTE - Apéndice M (Iteración 7)', () => {
  // PRU-RESEVAL-UNIT-003 ---
  it('PRU-RESEVAL-UNIT-003: el controlador registra respuestas y calcula correctamente el puntaje', async () => {
    const modulo = nextMod();
    await setUpModule(t.token, t.userId, modulo);
    const evId = await createEval(modulo, P1);
    const pregunta = (await Question.findAll({ where: { evaluacion_id: evId } }))[0];

    const res = await responderEval(t.studentToken, evId, [{ pregunta_id: pregunta.id, respuesta: pregunta.respuesta_correcta }]);
    const data = res.body?.data;

    console.log('\n===== PRU-RESEVAL-UNIT-003 =====');
    console.log('DATOS: { respuestas: [{ pregunta_id, respuesta: "b" }] } (formato real del backend)');
    console.log('STATUS:', res.status, '| body:', JSON.stringify(res.body).slice(0, 300));
    console.log('puntaje:', data?.puntaje, '(esperado 100 = 1/1) | total_preguntas:', data?.total_preguntas);

    expect(res.status).toBe(200);
    expect(data.total_preguntas).toBe(1);
    expect(data.respuestas_correctas).toBe(1);
    expect(data.puntaje).toBe(100);
    console.log('RESULTADO: [CUMPLE] (nota Apéndice: el puntaje es 0-100; formato es pregunta_id/respuesta, no pregunta/opcion)\n');
  }, 30000);

  // PRU-RESEVAL-UNIT-002 ---
  it('PRU-RESEVAL-UNIT-002: se rechaza un segundo envío cuando se agotan los intentos de la evaluación', async () => {
    const modulo = nextMod();
    await setUpModule(t.token, t.userId, modulo);
    const evId = await createEval(modulo, P1, { max_intentos: 1 });
    const pregunta = (await Question.findAll({ where: { evaluacion_id: evId } }))[0];
    const r1 = await responderEval(t.studentToken, evId, [{ pregunta_id: pregunta.id, respuesta: pregunta.respuesta_correcta }]);
    const r2 = await responderEval(t.studentToken, evId, [{ pregunta_id: pregunta.id, respuesta: pregunta.respuesta_correcta }]);

    console.log('\n===== PRU-RESEVAL-UNIT-002 =====');
    console.log('DATOS: evaluación con max_intentos:1; dos envíos consecutivos');
    console.log('1er STATUS:', r1.status, '| 2do STATUS:', r2.status);
    console.log('2do body:', JSON.stringify(r2.body));

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(400);
    expect(r2.body.message).toContain('agotado');
    console.log('RESULTADO: [CUMPLE] (el rechazo aplica cuando max_intentos se agota; si fuese ilimitado, se permitiría)\n');
  }, 30000);

  // PRU-RESEVAL-UNIT-001 ---
  it('PRU-RESEVAL-UNIT-001: evidencia del límite de tiempo en evaluaciones cronometradas', async () => {
    const modulo = nextMod();
    await setUpModule(t.token, t.userId, modulo);
    const evId = await createEval(modulo, P1, { tiempoLimitado: true, tiempoMinutos: 1 });
    const pregunta = (await Question.findAll({ where: { evaluacion_id: evId } }))[0];

    const res = await responderEval(t.studentToken, evId, [{ pregunta_id: pregunta.id, respuesta: pregunta.respuesta_correcta }], { tiempo: 9999 });

    console.log('\n===== PRU-RESEVAL-UNIT-001 =====');
    console.log('DATOS: evaluación con tiempoLimitado:true, tiempoMinutos:1; envío con tiempo:9999');
    console.log('STATUS:', res.status, '| data.tiempo:', res.body?.data?.tiempo);
    console.log('RESULTADO: [NO CUMPLE respecto al Apéndice] - el backend NO valida el tiempo transcurrido; acepta el intento y solo devuelve "tiempo" como eco.');

    // Documenta el comportamiento real: acepta (200) y repite el campo tiempo.
    expect(res.status).toBe(200);
    expect(res.body.data.tiempo).toBe(9999);
  }, 30000);

  // PRU-RESEVAL-COMP-002 ---
  it('PRU-RESEVAL-COMP-002: el frontend envía las respuestas y recibe el resultado calificado', async () => {
    const modulo = nextMod();
    await setUpModule(t.token, t.userId, modulo);
    const evId = await createEval(modulo, P2);
    const preguntas = await Question.findAll({ where: { evaluacion_id: evId }, order: [['id', 'ASC']] });
    const respuestas = [
      { pregunta_id: preguntas[0].id, respuesta: preguntas[0].respuesta_correcta },
      { pregunta_id: preguntas[1].id, respuesta: preguntas[1].respuesta_correcta === 'a' ? 'b' : 'a' },
    ];

    const res = await responderEval(t.studentToken, evId, respuestas);

    console.log('\n===== PRU-RESEVAL-COMP-002 =====');
    console.log('DATOS: POST /api/student/evaluaciones/' + evId + '/responder (2 preguntas, 1 correcta)');
    console.log('STATUS:', res.status, '| message:', res.body?.message);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Evaluación calificada. Obtuviste 50/100');
    expect(res.body.data.puntaje).toBe(50);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 30000);

  // PRU-RESEVAL-COMP-001 ---
  it('PRU-RESEVAL-COMP-001: el resultado y el puntaje se persisten en la base de datos', async () => {
    const modulo = nextMod();
    await setUpModule(t.token, t.userId, modulo);
    const evId = await createEval(modulo, P2);
    const preguntas = await Question.findAll({ where: { evaluacion_id: evId }, order: [['id', 'ASC']] });
    const respuestas = preguntas.map((p) => ({ pregunta_id: p.id, respuesta: p.respuesta_correcta }));

    const res = await responderEval(t.studentToken, evId, respuestas);
    const prog = await StudentProgress.findOne({ where: { estudiante_id: t.studentId, evaluacion_id: evId } });

    console.log('\n===== PRU-RESEVAL-COMP-001 =====');
    console.log('STATUS:', res.status);
    console.log('BD: puntaje:', prog?.puntaje, '| intentos_realizados:', prog?.intentos_realizados, '| respuestas guardadas:', !!prog?.respuestas);

    expect(res.status).toBe(200);
    expect(prog).toBeTruthy();
    expect(prog.puntaje).toBe(100);
    expect(prog.intentos_realizados).toBeGreaterThanOrEqual(1);
    expect(prog.respuestas).toBeTruthy();
    console.log('RESULTADO: [CUMPLE] (la persistencia real ocurre en progreso_estudiante vía registerEvaluationResult)\n');
  }, 30000);

  // PRU-RESEVAL-INT-002 ---
  it('PRU-RESEVAL-INT-002: el resultado de la evaluación actualiza el progreso y las medallas', async () => {
    const modulo = nextMod();
    await setUpModule(t.token, t.userId, modulo);
    const evId = await createEval(modulo, P1);
    const pregunta = (await Question.findAll({ where: { evaluacion_id: evId } }))[0];
    await responderEval(t.studentToken, evId, [{ pregunta_id: pregunta.id, respuesta: pregunta.respuesta_correcta }]);

    const prog = await api.get('/api/student/progreso').set('Authorization', `Bearer ${t.studentToken}`);
    const gam = await api.get('/api/student/gamificacion').set('Authorization', `Bearer ${t.studentToken}`);
    const byModule = (prog.body?.data?.progressByModule || []).find((m) => m.modulo === modulo);

    console.log('\n===== PRU-RESEVAL-INT-002 =====');
    console.log('GET /api/student/progreso -> modulo:', byModule ? byModule.modulo : null, '| puntaje_total:', byModule?.puntaje_total);
    console.log('GET /api/student/gamificacion -> evaluaciones_completadas:', gam.body?.data?.evaluaciones_completadas);

    expect(prog.status).toBe(200);
    expect(gam.status).toBe(200);
    expect(byModule).toBeTruthy();
    expect(byModule ? byModule.puntaje_total : 0).toBeGreaterThanOrEqual(100);
    expect(gam.body.data.evaluaciones_completadas).toBeGreaterThanOrEqual(1);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 30000);

  // PRU-RESEVAL-INT-001 ---
  it('PRU-RESEVAL-INT-001: un estudiante no puede resolver una evaluación que no le corresponde', async () => {
    // Evaluación creada por el docente B (ajeno); el estudiante A intenta resolverla.
    const moduloB = nextMod();
    const cB = await createPublishedContent(tB.token, { titulo: 'Contenido B ResEval', modulo: moduloB, docenteId: tB.userId });
    const cBId = cB.body?.data?.id;
    if (cBId) createdContentIds.push(cBId);
    const evB = await api
      .post('/api/evaluaciones')
      .set('Authorization', `Bearer ${tB.token}`)
      .send({ titulo: 'Eval B ResEval', modulo: moduloB, publicado: true, docente_id: tB.userId, preguntas: P1 });
    const evBId = evB.body?.data?.id;
    if (evBId) createdEvalIds.push(evBId);
    const preguntaB = (await Question.findAll({ where: { evaluacion_id: evBId } }))[0];

    const res = await responderEval(t.studentToken, evBId, [{ pregunta_id: preguntaB.id, respuesta: preguntaB.respuesta_correcta }]);

    console.log('\n===== PRU-RESEVAL-INT-001 =====');
    console.log('DATOS: POST .../evaluaciones/' + evBId + '/responder con evaluación del docente B (estudiante A)');
    console.log('STATUS:', res.status, '| body:', JSON.stringify(res.body));

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('docente');
    console.log('RESULTADO: [CUMPLE] (control de acceso existe; el backend responde 404 "no disponible para tu docente", no 403)\n');
  }, 30000);

  // PRU-RESEVAL-FUN-001 ---
  it('PRU-RESEVAL-FUN-001: flujo completo: visualiza contenido, resuelve evaluación, recibe resultado y ve su puntaje/medallas', async () => {
    const modulo = nextMod();
    await setUpModule(t.token, t.userId, modulo);
    const evId = await createEval(modulo, P2);
    const preguntas = await Question.findAll({ where: { evaluacion_id: evId }, order: [['id', 'ASC']] });
    const respuestas = preguntas.map((p) => ({ pregunta_id: p.id, respuesta: p.respuesta_correcta }));

    const res = await responderEval(t.studentToken, evId, respuestas);
    const gam = await api.get('/api/student/gamificacion').set('Authorization', `Bearer ${t.studentToken}`);
    const dash = await api.get('/api/student/dashboard').set('Authorization', `Bearer ${t.studentToken}`);
    const mPerfect = (gam.body?.data?.medallas || []).find((m) => m.id === 'puntaje_perfecto_evaluacion' && m.obtenida);

    console.log('\n===== PRU-RESEVAL-FUN-001 =====');
    console.log('STATUS responder:', res.status, '| puntaje:', res.body?.data?.puntaje);
    console.log('gamificación evaluaciones_completadas:', gam.body?.data?.evaluaciones_completadas);
    console.log('dashboard evaluationsCompleted:', dash.body?.data?.evaluationsCompleted);
    console.log('medalla puntaje_perfecto_evaluacion:', !!mPerfect);

    expect(res.status).toBe(200);
    expect(res.body.data.puntaje).toBe(100);
    expect(mPerfect).toBeTruthy();
    console.log('RESULTADO: [CUMPLE]\n');
  }, 30000);
});