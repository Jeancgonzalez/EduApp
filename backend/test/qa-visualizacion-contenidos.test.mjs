import { createRequire } from 'module';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  api, User, Content, Game, Evaluation, Question, StudentProgress,
  makeStudent, makeTeacher, createPublishedContent, markContentCompleted, cleanupUsers,
} from './_qa/helpers.mjs';

const require = createRequire(import.meta.url);
require('../src/models/associations.js');

let t;        // docente A + estudiante A (de A)
let tB;       // docente B (ajeno)
const createdContentIds = [];

const MOD_A = 'ModuloVisA' + Date.now();
const MOD_B = 'ModuloVisB' + Date.now();

beforeAll(async () => {
  t = await makeStudent();
  tB = await makeTeacher();
});
afterAll(async () => {
  for (const id of createdContentIds) {
    await StudentProgress.destroy({ where: { contenido_id: id } }).catch(() => {});
    await Content.destroy({ where: { id } }).catch(() => {});
  }
  await cleanupUsers([t.teacherEmail, t.studentEmail, tB.teacherEmail]);
  const { sequelize } = await import('../src/config/database.js');
  if (sequelize && typeof sequelize.close === 'function') await sequelize.close();
});

describe('MÓDULO VISUALIZACIÓN DE CONTENIDOS - ESTUDIANTE - Apéndice M (Iteración 7)', () => {
  // PRU-VISCONT-UNIT-002 ---
  it('PRU-VISCONT-UNIT-002: el controlador lista únicamente los contenidos publicados del docente', async () => {
    const pub = await createPublishedContent(t.token, { titulo: 'Contenido Publicado A', modulo: MOD_A, docenteId: t.userId });
    const pubId = pub.body?.data?.id;
    if (pubId) createdContentIds.push(pubId);
    const draft = await api
      .post('/api/contenidos')
      .set('Authorization', `Bearer ${t.token}`)
      .send({ titulo: 'Contenido Borrador A', tipo: 'video', contenido: 'https://youtu.be/aaa', modulo: MOD_A, publicado: false, docente_id: t.userId });
    const draftId = draft.body?.data?.id;
    if (draftId) createdContentIds.push(draftId);

    const res = await api
      .get('/api/contenidos')
      .set('Authorization', `Bearer ${t.studentToken}`);
    const items = res.body?.data || [];
    const anyBorrador = items.some((c) => c.titulo === 'Contenido Borrador A');

    console.log('\n===== PRU-VISCONT-UNIT-002 =====');
    console.log('DATOS: GET /api/contenidos (estudiante)');
    console.log('STATUS:', res.status);
    console.log('Títulos:', items.map((c) => c.titulo));
    console.log('¿Incluye borrador?:', anyBorrador);

    expect(res.status).toBe(200);
    expect(items.some((c) => c.titulo === 'Contenido Publicado A')).toBe(true);
    expect(anyBorrador).toBe(false);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  // PRU-VISCONT-UNIT-001 ---
  it('PRU-VISCONT-UNIT-001: el detalle de un contenido devuelve el contenido formateado; 404 si no existe', async () => {
    const res = await api
      .get('/api/contenidos')
      .set('Authorization', `Bearer ${t.studentToken}`);
    const publicado = (res.body?.data || []).find((c) => c.titulo === 'Contenido Publicado A');
    const id = publicado?.id;

    const det = await api
      .get(`/api/contenidos/${id}`)
      .set('Authorization', `Bearer ${t.studentToken}`);

    console.log('\n===== PRU-VISCONT-UNIT-001 =====');
    console.log('DATOS: GET /api/contenidos/' + id);
    console.log('STATUS:', det.status);
    console.log('Campos devueltos:', id ? Object.keys(det.body?.data || {}).join(', ') : '(sin id)');
    console.log('Título:', det.body?.data?.titulo, '| contenido:', id ? (det.body?.data?.contenido || '').toString().slice(0, 40) : null);

    expect(det.status).toBe(200);
    expect(det.body.data.id).toBe(id);
    expect(typeof det.body.data.titulo).toBe('string');

    const noExiste = await api
      .get('/api/contenidos/99999999')
      .set('Authorization', `Bearer ${t.studentToken}`);

    console.log('GET /api/contenidos/99999999 -> STATUS:', noExiste.status);
    expect(noExiste.status).toBe(404);
    console.log('RESULTADO: [CUMPLE] (nota: campo real es "contenido", no "contenido_html")\n');
  }, 20000);

  // PRU-VISCONT-COMP-002 ---
  it('PRU-VISCONT-COMP-002: la comunicación frontend-backend al cargar la lista de contenidos responde 200', async () => {
    const res = await api
      .get('/api/student/contenidos/publicados')
      .set('Authorization', `Bearer ${t.studentToken}`);

    console.log('\n===== PRU-VISCONT-COMP-002 =====');
    console.log('DATOS: GET /api/student/contenidos/publicados (endpoint real del frontend)');
    console.log('STATUS:', res.status, '| contenidos:', (res.body?.data || []).length);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.data)).toBe(true);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  // PRU-VISCONT-COMP-001 ---
  it('PRU-VISCONT-COMP-001 un estudiante no recibe contenidos de un docente ajeno', async () => {
    const ext = await createPublishedContent(tB.token, { titulo: 'Contenido de Docente B', modulo: MOD_B, docenteId: tB.userId });
    const extId = ext.body?.data?.id;
    if (extId) createdContentIds.push(extId);

    const res = await api
      .get('/api/student/contenidos/publicados')
      .set('Authorization', `Bearer ${t.studentToken}`);
    const items = res.body?.data || [];
    const incluyeAjeno = items.some((c) => c.titulo === 'Contenido de Docente B');

    // Además: pedir directamente el id del contenido ajeno -> 404 (filtrado por docente)
    const det = await api
      .get(`/api/contenidos/${extId}`)
      .set('Authorization', `Bearer ${t.studentToken}`);

    console.log('\n===== PRU-VISCONT-COMP-001 =====');
    console.log('DATOS: GET /api/student/contenidos/publicados con contenido del docente B');
    console.log('STATUS lista:', res.status, '| ¿incluye ajeno?:', incluyeAjeno);
    console.log('GET /api/contenidos/' + extId + ' (ajeno) -> STATUS:', det.status);

    expect(res.status).toBe(200);
    expect(incluyeAjeno).toBe(false);
    expect(det.status).toBe(404);
    console.log('RESULTADO: [CUMPLE] (el filtro por docente_id impide ver contenidos ajenos)\n');
  }, 20000);

  // PRU-VISCONT-INT-001 ---
  it('PRU-VISCONT-INT-001: control de acceso: un estudiante no puede ver contenido de un módulo ajeno', async () => {
    const ext = await api
      .post('/api/contenidos')
      .set('Authorization', `Bearer ${tB.token}`)
      .send({ titulo: 'Contenido Modulo Ajeno B', tipo: 'texto', contenido: 'privado', modulo: MOD_B, publicado: true, docente_id: tB.userId });
    const extId = ext.body?.data?.id;
    if (extId) createdContentIds.push(extId);

    const det = await api
      .get(`/api/contenidos/${extId}`)
      .set('Authorization', `Bearer ${t.studentToken}`);

    console.log('\n===== PRU-VISCONT-INT-001 =====');
    console.log('DATOS: GET /api/contenidos/' + extId + ' (módulo no asignado al estudiante)');
    console.log('STATUS:', det.status, '| body:', JSON.stringify(det.body));

    expect(det.status).toBe(404);
    console.log('RESULTADO: [CUMPLE] (el endpoint filtra por docente; contenido no visible)\n');
  }, 20000);

  // PRU-VISCONT-FUN-001 ---
  it('PRU-VISCONT-FUN-001: flujo completo: el estudiante visualiza y accede al contenido publicado', async () => {
    const res = await api
      .get('/api/student/contenidos/publicados')
      .set('Authorization', `Bearer ${t.studentToken}`);
    const publicado = (res.body?.data || []).find((c) => c.titulo === 'Contenido Publicado A');

    const acc = await api
      .post(`/api/student/contenidos/${publicado.id}/acceder`)
      .set('Authorization', `Bearer ${t.studentToken}`);

    const prog = await StudentProgress.findOne({ where: { estudiante_id: t.studentId, contenido_id: publicado.id } });

    console.log('\n===== PRU-VISCONT-FUN-001 =====');
    console.log('DATOS: GET lista + POST /api/student/contenidos/' + publicado.id + '/acceder');
    console.log('STATUS acceder:', acc.status, '| mensaje:', acc.body?.message);
    console.log('Registro BD contenido completado:', !!prog && prog.completado);

    expect(acc.status).toBe(200);
    expect(prog).toBeTruthy();
    expect(prog.completado).toBe(true);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);
});