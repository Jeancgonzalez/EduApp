import { createRequire } from 'module';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  api, User, Content, Game, Evaluation, Question, StudentProgress,
  makeStudent, createPublishedContent, markContentCompleted, cleanupUsers,
} from './_qa/helpers.mjs';

const require = createRequire(import.meta.url);
require('../src/models/associations.js');
const Progress = require('../src/models/progress.model.js');

let t;
const createdGameIds = [];
const createdContentIds = [];
let modSeq = 0;
function nextMod() { modSeq += 1; return `ModuloResJuego${Date.now()}_${modSeq}`; }

beforeAll(async () => {
  t = await makeStudent();
});
afterAll(async () => {
  for (const id of createdGameIds) {
    await StudentProgress.destroy({ where: { juego_id: id } }).catch(() => {});
    await Game.destroy({ where: { id } }).catch(() => {});
  }
  for (const id of createdContentIds) {
    await StudentProgress.destroy({ where: { contenido_id: id } }).catch(() => {});
    await Content.destroy({ where: { id } }).catch(() => {});
  }
  await StudentProgress.destroy({ where: { estudiante_id: t.studentId } }).catch(() => {});
  await Progress.destroy({ where: { usuario_id: t.studentId } }).catch(() => {});
  await cleanupUsers([t.teacherEmail, t.studentEmail]);
  const { sequelize } = await import('../src/config/database.js');
  if (sequelize && typeof sequelize.close === 'function') await sequelize.close();
});

async function setUpModule(modulo) {
  const c = await createPublishedContent(t.token, { titulo: 'Contenido ResJuego ' + modulo, modulo, docenteId: t.userId });
  const contentId = c.body?.data?.id;
  if (contentId) createdContentIds.push(contentId);
  await markContentCompleted(t.studentToken, contentId);
  return contentId;
}

async function createGame(modulo, puntajeMax = 100) {
  const res = await api
    .post('/api/juegos')
    .set('Authorization', `Bearer ${t.token}`)
    .send({ titulo: 'Juego ResJuego ' + Date.now(), tipo: 'quiz', modulo, publicado: true, puntaje_max: puntajeMax, docente_id: t.userId });
  const id = res.body?.data?.id;
  if (id) createdGameIds.push(id);
  return id;
}

async function resolverJuego(juegoId, datosIntento) {
  return api
    .post(`/api/student/juegos/${juegoId}/responder`)
    .set('Authorization', `Bearer ${t.studentToken}`)
    .send(datosIntento);
}

describe('MÓDULO RESOLUCIÓN DE JUEGOS - ESTUDIANTE - Apéndice M (Iteración 8)', () => {
  // PRU-RESJUEGO-UNIT-002 ---
  it('PRU-RESJUEGO-UNIT-002: el controlador procesa el puntaje del juego de forma proporcional y lo limita al máximo', async () => {
    const modulo = nextMod();
    await setUpModule(modulo);
    const j1 = await createGame(modulo, 100);
    const j2 = await createGame(modulo, 100);

    const r75 = await resolverJuego(j1, { puntaje_obtenido: 75 });
    const rCap = await resolverJuego(j2, { puntaje_obtenido: 120 });

    console.log('\n===== PRU-RESJUEGO-UNIT-002 =====');
    console.log('DATOS: POST /api/student/juegos/' + j1 + '/responder { puntaje_obtenido:75 }');
    console.log('r75 STATUS:', r75.status, '| body:', JSON.stringify(r75.body?.data));
    console.log('r120 (puntaje_max=100) -> ', JSON.stringify(rCap.body?.data));
    console.log('Nota Apéndice: la calificación la envía el cliente (puntaje_obtenido); el backend no calcula desde respuestas nor retorna correctas/total.');

    expect(r75.status).toBe(200);
    expect(r75.body.data.puntaje_obtenido).toBe(75);
    expect(r75.body.data.puntaje_maximo).toBe(100);
    expect(r75.body.data.porcentaje_logro).toBe(75);
    expect(rCap.body.data.puntaje_obtenido).toBe(100);
    console.log('RESULTADO: [CUMPLE] (el puntaje es proporcional al envío y se acota al máximo)\n');
  }, 30000);

  // PRU-RESJUEGO-UNIT-001 ---
  it('PRU-RESJUEGO-UNIT-001: evidencia de límite de intentos/tiempo en juegos', async () => {
    const modulo = nextMod();
    await setUpModule(modulo);
    const jId = await createGame(modulo, 100);

    const r1 = await resolverJuego(jId, { puntaje_obtenido: 50 });
    const r2 = await resolverJuego(jId, { puntaje_obtenido: 80 });

    console.log('\n===== PRU-RESJUEGO-UNIT-001 =====');
    console.log('DATOS: dos envíos consecutivos sobre el mismo juego (sin límite configurado)');
    console.log('1er STATUS:', r1.status, '| 2do STATUS:', r2.status, '| 2do puntaje:', r2.body?.data?.puntaje_obtenido);
    console.log('RESULTADO: [NO CUMPLE respecto al Apéndice] - el backend NO implementa rechazo por intentos agotados ni límite de tiempo en juegos; acepta reintentos (guarda el mejor puntaje).');

    expect(r2.status).toBe(200);
    expect(r2.body.data.puntaje_obtenido).toBe(80);
  }, 30000);

  // PRU-RESJUEGO-COMP-002 ---
  it('PRU-RESJUEGO-COMP-002: el frontend envía los datos del intento y recibe el resultado', async () => {
    const modulo = nextMod();
    await setUpModule(modulo);
    const jId = await createGame(modulo, 100);

    const res = await resolverJuego(jId, { puntaje_obtenido: 60 });

    console.log('\n===== PRU-RESJUEGO-COMP-002 =====');
    console.log('DATOS: POST /api/student/juegos/' + jId + '/responder { puntaje_obtenido:60 }');
    console.log('STATUS:', res.status, '| message:', res.body?.message);
    console.log('body:', JSON.stringify(res.body?.data));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Juego completado. Puntaje: 60/100');
    expect(res.body.data.puntaje_obtenido).toBe(60);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 30000);

  // PRU-RESJUEGO-COMP-001 ---
  it('PRU-RESJUEGO-COMP-001: el resultado del juego y el puntaje se persisten en la base de datos', async () => {
    const modulo = nextMod();
    await setUpModule(modulo);
    const jId = await createGame(modulo, 100);

    const r1 = await resolverJuego(jId, { puntaje_obtenido: 40 });
    const r2 = await resolverJuego(jId, { puntaje_obtenido: 90 });
    const prog = await StudentProgress.findOne({ where: { estudiante_id: t.studentId, juego_id: jId } });

    console.log('\n===== PRU-RESJUEGO-COMP-001 =====');
    console.log('DATOS: envíos 40 y 90 sobre el mismo juego');
    console.log('STATUS r1:', r1.status, '| r2:', r2.status);
    console.log('BD puntaje (mejor):', prog?.puntaje, '| completado:', prog?.completado);

    expect(r2.status).toBe(200);
    expect(prog).toBeTruthy();
    expect(prog.puntaje).toBe(90);
    expect(prog.completado).toBe(true);
    console.log('RESULTADO: [CUMPLE] (persistencia real en progreso_estudiante vía registerGameResult; guarda el mejor puntaje)\n');
  }, 30000);

  // PRU-RESJUEGO-INT-001 ---
  it('PRU-RESJUEGO-INT-001: el resultado del juego se refleja en el progreso y en las medallas', async () => {
    const modulo = nextMod();
    await setUpModule(modulo);
    const j1 = await createGame(modulo, 100);
    const j2 = await createGame(modulo, 100);

    await resolverJuego(j1, { puntaje_obtenido: 100 });
    await resolverJuego(j2, { puntaje_obtenido: 50 });

    const prog = await api.get('/api/student/progreso').set('Authorization', `Bearer ${t.studentToken}`);
    const gam = await api.get('/api/student/gamificacion').set('Authorization', `Bearer ${t.studentToken}`);
    const byModule = (prog.body?.data?.progressByModule || []).find((m) => m.modulo === modulo);
    const medallas = (gam.body?.data?.medallas || []).filter((m) => m.obtenida);

    console.log('\n===== PRU-RESJUEGO-INT-001 =====');
    console.log('porcentaje_avance del módulo:', byModule?.porcentaje_avance, '| puntaje_total:', byModule?.puntaje_total);
    console.log('gamificación juegos_completados:', gam.body?.data?.juegos_completados);
    console.log('medallas:', medallas.map((m) => m.id).join(', ') || '(ninguna)');

    expect(prog.status).toBe(200);
    expect(gam.status).toBe(200);
    expect(byModule).toBeTruthy();
    expect(gam.body.data.juegos_completados).toBeGreaterThanOrEqual(2);
    const mPerfect = medallas.find((m) => m.id === 'puntaje_perfecto_juego');
    expect(mPerfect).toBeTruthy();
    console.log('RESULTADO: [CUMPLE] (puntaje_perfecto_juego por alcanzar 100% en un juego)\n');
  }, 30000);

  // PRU-RESJUEGO-FUN-001 ---
  it('PRU-RESJUEGO-FUN-001: flujo completo: accede al juego, lo resuelve, recibe resultado y ve el dashboard actualizado', async () => {
    const modulo = nextMod();
    await setUpModule(modulo);
    const jId = await createGame(modulo, 100);

    const listaAntes = await api.get('/api/student/juegos/publicados').set('Authorization', `Bearer ${t.studentToken}`);
    const itemAntes = (listaAntes.body?.data || []).find((g) => g.id === jId);

    const res = await resolverJuego(jId, { puntaje_obtenido: 100 });

    const listaDespues = await api.get('/api/student/juegos/publicados').set('Authorization', `Bearer ${t.studentToken}`);
    const itemDespues = (listaDespues.body?.data || []).find((g) => g.id === jId);
    const gam = await api.get('/api/student/gamificacion').set('Authorization', `Bearer ${t.studentToken}`);

    console.log('\n===== PRU-RESJUEGO-FUN-001 =====');
    console.log('LISTA juegos antes: completado:', itemAntes?.completado, '| bloqueado:', itemAntes?.bloqueado, '| estrellas:', itemAntes?.estrellas);
    console.log('STATUS resolver:', res.status, '| puntaje:', res.body?.data?.puntaje_obtenido, '| porcentaje:', res.body?.data?.porcentaje_logro);
    console.log('LISTA juegos después: completado:', itemDespues?.completado, '| mejor_puntaje:', itemDespues?.mejor_puntaje, '| estrellas:', itemDespues?.estrellas);
    console.log('gamificación juegos_completados:', gam.body?.data?.juegos_completados);

    expect(res.status).toBe(200);
    expect(itemDespues.completado).toBe(true);
    expect(itemDespues.mejor_puntaje).toBe(100);
    expect(itemDespues.estrellas).toBe(3);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 30000);
});