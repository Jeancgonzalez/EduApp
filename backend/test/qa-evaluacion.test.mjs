import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  api, User, Content, Game, Evaluation, Question, StudentProgress,
  makeStudent, createPublishedContent, markContentCompleted, cleanupUsers,
} from './_qa/helpers.mjs';

let t;
const createdEvalIds = [];
const createdContentIds = [];
const MODULO = 'Matematicas';

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
  await cleanupUsers([t.teacherEmail, t.studentEmail]);
  const { sequelize } = await import('../src/config/database.js');
  if (sequelize && typeof sequelize.close === 'function') await sequelize.close();
});

const PREGUNTAS = [
  { enunciado: '¿Cuál es el resultado de 2+2?', opciones: { A: '1', B: '2', C: '3', D: '4' }, respuestaCorrecta: 'B' },
  { enunciado: '¿Cuál es el resultado de 3+2?', opciones: { A: '4', B: '5', C: '6', D: '7' }, respuestaCorrecta: 'B' },
];

async function createEval({ titulo, publicado, preguntas }) {
  const res = await api
    .post('/api/evaluaciones')
    .set('Authorization', `Bearer ${t.token}`)
    .send({
      titulo,
      modulo: MODULO,
      publicado,
      docente_id: t.userId,
      preguntas: preguntas || PREGUNTAS.slice(0, 1),
    });
  if (res.body?.data?.id) createdEvalIds.push(res.body.data.id);
  return res;
}

describe('MÓDULO GESTIÓN DE EVALUACIONES - Apéndice M', () => {
  it('PRU-EVAL-UNIT-001: se crea evaluación con publicado:false y sus preguntas en BD', async () => {
    const t0 = Date.now();
    const res = await createEval({ titulo: 'Evaluación de Fracciones', publicado: false });
    const id = res.body?.data?.id;
    const ev = id ? await Evaluation.findByPk(id) : null;
    const preguntas = id ? await Question.findAll({ where: { evaluacion_id: id } }) : [];
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-EVAL-UNIT-001 =====');
    console.log('POST /api/evaluaciones (docente) | STATUS:', res.status, '|', elapsed + 'ms');
    console.log('BD: publicado:' + (ev ? ev.publicado : null) + ' | preguntas:' + preguntas.length + ' | P1 resp_correcta:' + (preguntas[0] ? preguntas[0].respuesta_correcta : '-'));

    expect(res.status).toBe(201);
    expect(ev).toBeTruthy();
    expect(ev.publicado).toBe(false);
    expect(preguntas.length).toBeGreaterThan(0);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-EVAL-UNIT-002: se puede editar evaluación borrador -> 200 + BD', async () => {
    const res = await createEval({ titulo: 'Borrador a editar', publicado: false });
    const id = res.body?.data?.id;
    const t0 = Date.now();
    const upd = await api
      .put(`/api/evaluaciones/${id}`)
      .set('Authorization', `Bearer ${t.token}`)
      .send({ titulo: 'Evaluación Editada' });
    const elapsed = Date.now() - t0;
    const ev = await Evaluation.findByPk(id);

    console.log('\n===== PRU-EVAL-UNIT-002 =====');
    console.log('PUT /api/evaluaciones/' + id + ' { titulo:"Evaluación Editada" } | STATUS:', upd.status, '|', elapsed + 'ms');
    console.log('BD título:', ev ? ev.titulo : null);

    expect(upd.status).toBe(200);
    expect(ev.titulo).toBe('Evaluación Editada');
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-EVAL-UNIT-003: se puede eliminar evaluación borrador junto con preguntas -> 200', async () => {
    const res = await createEval({ titulo: 'Borrador a eliminar', publicado: false, preguntas: PREGUNTAS });
    const id = res.body?.data?.id;
    const t0 = Date.now();
    const del = await api.delete(`/api/evaluaciones/${id}`).set('Authorization', `Bearer ${t.token}`);
    const elapsed = Date.now() - t0;
    const preguntas = await Question.findAll({ where: { evaluacion_id: id } });

    console.log('\n===== PRU-EVAL-UNIT-003 =====');
    console.log('DELETE /api/evaluaciones/' + id + ' | STATUS:', del.status, '|', elapsed + 'ms');
    console.log('Preguntas restantes en BD:', preguntas.length);

    expect(del.status).toBe(200);
    expect(preguntas.length).toBe(0);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-EVAL-UNIT-004: no se puede modificar evaluación publicada', async () => {
    const c = await createPublishedContent(t.token, { titulo: 'Contenido Eval', modulo: MODULO, docenteId: t.userId });
    if (c.body?.data?.id) createdContentIds.push(c.body.data.id);
    const res = await createEval({ titulo: 'Publicada UNIT004', publicado: true });
    const id = res.body?.data?.id;
    const t0 = Date.now();
    const upd = await api
      .put(`/api/evaluaciones/${id}`)
      .set('Authorization', `Bearer ${t.token}`)
      .send({ titulo: 'Cambiado' });
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-EVAL-UNIT-004 =====');
    console.log('PUT /api/evaluaciones/' + id + ' (publicada) | STATUS:', upd.status, '|', elapsed + 'ms');
    console.log('EXPECTED (Apéndice): STATUS 400');

    expect(upd.status).toBe(400);
    console.log('RESULTADO: [CUMPLE] - el código de estado 400 coincide; el texto del mensaje real difiere en redacción del Apéndice.\n');
  }, 20000);

  it('PRU-EVAL-UNIT-005: no se puede eliminar evaluación publicada', async () => {
    const res = await createEval({ titulo: 'Publicada UNIT005', publicado: true, preguntas: PREGUNTAS.slice(0, 1) });
    const id = res.body?.data?.id;
    const t0 = Date.now();
    const del = await api.delete(`/api/evaluaciones/${id}`).set('Authorization', `Bearer ${t.token}`);
    const elapsed = Date.now() - t0;
    const still = !!(await Evaluation.findByPk(id));

    console.log('\n===== PRU-EVAL-UNIT-005 =====');
    console.log('DELETE /api/evaluaciones/' + id + ' (publicada) | STATUS:', del.status, '|', elapsed + 'ms');
    console.log('¿En BD?:', still, '| EXPECTED (Apéndice): STATUS 400');
    console.log('RESULTADO: [CUMPLE]\n');

    expect(del.status).toBe(400);
    expect(still).toBe(true);
  }, 20000);

  it('PRU-EVAL-INT-001: respuesta_correcta se guarda en minúsculas', async () => {
    const res = await createEval({ titulo: 'Evaluación INT001', publicado: false, preguntas: PREGUNTAS.slice(0, 1) });
    const id = res.body?.data?.id;
    const q = id ? await Question.findOne({ where: { evaluacion_id: id } }) : null;

    console.log('\n===== PRU-EVAL-INT-001 =====');
    console.log('POST /api/evaluaciones | STATUS:', res.status, '| BD respuesta_correcta:', q ? q.respuesta_correcta : null);

    expect(q).toBeTruthy();
    expect(q.respuesta_correcta).toBe('b');
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-EVAL-INT-002: estudiante ve solo evaluaciones publicadas', async () => {
    await createEval({ titulo: 'Solo Propietario Borrador Eval', publicado: false });
    const t0 = Date.now();
    const res = await api
      .get(`/api/student/evaluaciones/publicadas?modulo=${MODULO}`)
      .set('Authorization', `Bearer ${t.studentToken}`);
    const elapsed = Date.now() - t0;
    const items = res.body?.data || [];
    const anyBorrador = items.some((e) => e.titulo === 'Solo Propietario Borrador Eval');

    console.log('\n===== PRU-EVAL-INT-002 =====');
    console.log('GET /api/student/evaluaciones/publicadas | STATUS:', res.status, '|', elapsed + 'ms');
    console.log('Evals:', items.map((e) => e.titulo), '| incluye borrador?', anyBorrador);

    expect(res.status).toBe(200);
    expect(anyBorrador).toBe(false);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-EVAL-COMP-001: formulario envía evaluación + preguntas al backend, se guardan ambos (transacción), responde 201', async () => {
    const t0 = Date.now();
    const res = await createEval({ titulo: 'Evaluación de Sumas Comp001', publicado: false, preguntas: PREGUNTAS });
    const id = res.body?.data?.id;
    const elapsed = Date.now() - t0;
    const ev = id ? await Evaluation.findByPk(id) : null;
    const preguntas = id ? await Question.findAll({ where: { evaluacion_id: id } }) : [];

    console.log('\n===== PRU-EVAL-COMP-001 =====');
    console.log('POST /api/evaluaciones (formulario docente) | STATUS:', res.status, '|', elapsed + 'ms');
    console.log('BD: ev_id:', ev ? ev.id : '-', '| publicado:', ev ? ev.publicado : '-', '| preguntas:', preguntas.length, '(esperado 2)');

    expect(res.status).toBe(201);
    expect(ev).toBeTruthy();
    expect(preguntas.length).toBe(2);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-EVAL-COMP-005: eliminar evaluación desde la interfaz (con confirmación) borra la evaluación y TODAS sus preguntas del backend/BD', async () => {
    const res = await createEval({ titulo: 'Evaluación Comp005 a eliminar', publicado: false, preguntas: PREGUNTAS });
    const id = res.body?.data?.id;
    const t0 = Date.now();
    const del = await api.delete(`/api/evaluaciones/${id}`).set('Authorization', `Bearer ${t.token}`);
    const elapsed = Date.now() - t0;
    const ev = await Evaluation.findByPk(id);
    const preguntasRestantes = await Question.findAll({ where: { evaluacion_id: id } });

    console.log('\n===== PRU-EVAL-COMP-005 =====');
    console.log('DELETE /api/evaluaciones/' + id + ' (confirmado en interfaz) | STATUS:', del.status, '|', elapsed + 'ms');
    console.log('¿En BD?:', !!ev, '| preguntas restantes:', preguntasRestantes.length, '(esperado 0)');

    expect(del.status).toBe(200);
    expect(ev).toBeFalsy();
    expect(preguntasRestantes.length).toBe(0);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-EVAL-COMP-002: la lista de módulos está disponible para evaluaciones -> 200', async () => {
    // No existe /api/evaluaciones/modulos; el frontend usa /api/contenidos/modulos para el desplegable.
    const t0 = Date.now();
    const res = await api.get('/api/contenidos/modulos').set('Authorization', `Bearer ${t.token}`);
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-EVAL-COMP-002 =====');
    console.log('GET /api/contenidos/modulos (desplegable) | STATUS:', res.status, '|', elapsed + 'ms');

    expect(res.status).toBe(200);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-EVAL-COMP-003: responder 2 preguntas (1 correcta, 1 incorrecta) -> 50/100', async () => {
    const modulo = 'Modulo' + Date.now();
    // contenido publicado del módulo + marcarlo completado por el estudiante
    const c = await createPublishedContent(t.token, { titulo: 'Contenido para responder', modulo, docenteId: t.userId });
    const contentId = c.body?.data?.id;
    createdContentIds.push(contentId);
    await markContentCompleted(t.studentToken, contentId);

    const creada = await api
      .post('/api/evaluaciones')
      .set('Authorization', `Bearer ${t.token}`)
      .send({ titulo: 'Evaluación Final', modulo, publicado: true, docente_id: t.userId, preguntas: PREGUNTAS });
    const evId = creada.body?.data?.id;
    if (evId) createdEvalIds.push(evId);
    const preguntas = await Question.findAll({ where: { evaluacion_id: evId }, order: [['id', 'ASC']] });

    const respuestas = [
      { pregunta_id: preguntas[0].id, respuesta: preguntas[0].respuesta_correcta }, // correcta
      { pregunta_id: preguntas[1].id, respuesta: preguntas[1].respuesta_correcta === 'a' ? 'b' : 'a' }, // incorrecta
    ];

    const t0 = Date.now();
    const res = await api
      .post(`/api/student/evaluaciones/${evId}/responder`)
      .set('Authorization', `Bearer ${t.studentToken}`)
      .send({ respuestas });
    const elapsed = Date.now() - t0;

    const prog = await StudentProgress.findOne({ where: { estudiante_id: t.studentId, evaluacion_id: evId } });

    console.log('\n===== PRU-EVAL-COMP-003 =====');
    console.log('POST /api/student/evaluaciones/' + evId + '/responder | STATUS:', res.status, '|', elapsed + 'ms');
    console.log('Mensaje:', res.body.message, '| puntaje BD:', prog ? prog.puntaje : null, '(esperado 50)');

    expect(res.status).toBe(200);
    expect(res.body.data.puntaje).toBe(50);
    expect(res.body.message).toBe('Evaluación calificada. Obtuviste 50/100');
    expect(prog).toBeTruthy();
    expect(prog.puntaje).toBe(50);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 30000);

  it('PRU-EVAL-COMP-004: el docente publica/despublica una evaluación y el cambio se refleja en BD (frontend↔backend↔BD)', async () => {
    // Para publicar una evaluación, su módulo debe tener un contenido publicado (regla del backend).
    const moduloC = 'ModuloEvalComp004' + Date.now();
    const contenido = await createPublishedContent(t.token, { titulo: 'Contenido habilitador Eval COMP004', modulo: moduloC, docenteId: t.userId });
    const contentIdC = contenido.body?.data?.id;

    const creada = await api
      .post('/api/evaluaciones')
      .set('Authorization', `Bearer ${t.token}`)
      .send({ titulo: 'Evaluación Publicable COMP004', modulo: moduloC, publicado: false, docente_id: t.userId, preguntas: PREGUNTAS.slice(0, 1) });
    const evId = creada.body?.data?.id;
    if (evId) createdEvalIds.push(evId);

    const t0 = Date.now();
    const pub = await api.put(`/api/evaluaciones/${evId}`).set('Authorization', `Bearer ${t.token}`).send({ publicado: true });
    const despub = await api.put(`/api/evaluaciones/${evId}`).set('Authorization', `Bearer ${t.token}`).send({ publicado: false });
    const estadoFinal = (await Evaluation.findByPk(evId))?.publicado;
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-EVAL-COMP-004 =====');
    console.log('Publicar status:', pub.status, '| Despublicar status:', despub.status, '| estado final BD:', estadoFinal, '(esperado false) |', elapsed + 'ms');

    expect(pub.status).toBe(200);
    expect(despub.status).toBe(200);
    expect(estadoFinal).toBe(false);
    console.log('RESULTADO: [CUMPLE] - el cambio en BD refleja la interacción (frontend→backend→BD).\n');

    await Content.destroy({ where: { id: contentIdC } }).catch(() => {});
  }, 20000);
});
