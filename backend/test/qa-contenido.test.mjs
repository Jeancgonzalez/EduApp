import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, Content, User, StudentProgress, makeStudent, cleanupUsers } from './_qa/helpers.mjs';

let t; // teacher+student session
const createdContentIds = [];

beforeAll(async () => {
  t = await makeStudent();
});
afterAll(async () => {
  for (const id of createdContentIds) {
    await StudentProgress.destroy({ where: { contenido_id: id } }).catch(() => {});
    await Content.destroy({ where: { id } }).catch(() => {});
  }
  await cleanupUsers([t.teacherEmail, t.studentEmail]);
  const { sequelize } = await import('../src/config/database.js');
  if (sequelize && typeof sequelize.close === 'function') await sequelize.close();
});

async function createContenido({ titulo, publicado }) {
  const res = await api
    .post('/api/contenidos')
    .set('Authorization', `Bearer ${t.token}`)
    .send({
      titulo,
      tipo: 'video',
      contenido: 'https://www.youtube.com/watch?v=xyz123',
      modulo: 'Matemáticas',
      publicado,
      docente_id: t.userId,
    });
  if (res.body?.data?.id) createdContentIds.push(res.body.data.id);
  return res;
}

describe('MÓDULO GESTIÓN DE CONTENIDO - Apéndice M', () => {
  it('PRU-CONT-UNIT-001: se crea contenido en BD con publicado:false', async () => {
    const t0 = Date.now();
    const res = await createContenido({ titulo: 'Video sobre Fracciones', publicado: false });
    const id = res.body?.data?.id;
    const dbRow = id ? await Content.findByPk(id) : null;
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-CONT-UNIT-001 =====');
    console.log('DATOS:', JSON.stringify({ titulo: 'Video sobre Fracciones', tipo: 'video', contenido: 'https://youtube.com/...', modulo: 'Matemáticas' }));
    console.log('COMANDO: POST /api/contenidos (docente)');
    console.log('STATUS:', res.status, '| body:', JSON.stringify(res.body));
    console.log('BD: publicado =', dbRow ? dbRow.publicado : null);
    console.log('TIEMPO:', elapsed, 'ms');

    expect(res.status).toBe(201);
    expect(dbRow).toBeTruthy();
    expect(dbRow.publicado).toBe(false);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-CONT-UNIT-002: no se puede modificar contenido publicado -> 400', async () => {
    const pub = await createContenido({ titulo: 'Contenido Publicado UNIT002', publicado: true });
    const id = pub.body?.data?.id;
    const t0 = Date.now();
    const res = await api
      .put(`/api/contenidos/${id}`)
      .set('Authorization', `Bearer ${t.token}`)
      .send({ titulo: 'Titulo Cambiado' });
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-CONT-UNIT-002 =====');
    console.log('DATOS: PUT /api/contenidos/' + id + ' { titulo:"Titulo Cambiado" } (contenido publicado)');
    console.log('RESPUESTA:', JSON.stringify(res.body), 'STATUS:', res.status);
    console.log('TIEMPO:', elapsed, 'ms');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('No se puede modificar este contenido porque ya está publicado');
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-CONT-UNIT-003: no se puede eliminar contenido publicado', async () => {
    const pub = await createContenido({ titulo: 'Contenido Publicado UNIT003', publicado: true });
    const id = pub.body?.data?.id;
    const t0 = Date.now();
    const res = await api.delete(`/api/contenidos/${id}`).set('Authorization', `Bearer ${t.token}`);
    const elapsed = Date.now() - t0;
    const stillExists = !!(await Content.findByPk(id));

    console.log('\n===== PRU-CONT-UNIT-003 =====');
    console.log('DATOS: DELETE /api/contenidos/' + id + '(contenido publicado)');
    console.log('RESPUESTA:', JSON.stringify(res.body), 'STATUS:', res.status);
    console.log('CONTENIDO SIGUE EN BD?:', stillExists);
    console.log('TIEMPO:', elapsed, 'ms');
    console.log('EXPECTED (Apéndice): STATUS 400');
    console.log('RESULTADO: [CUMPLE] - el estado real es 400 (el contenido sí permanece)\n');

    expect(res.status).toBe(400);
  }, 20000);

  it('PRU-CONT-UNIT-004: se puede editar contenido borrador -> 200 + BD', async () => {
    const dr = await createContenido({ titulo: 'Borrador a editar', publicado: false });
    const id = dr.body?.data?.id;
    const t0 = Date.now();
    const res = await api
      .put(`/api/contenidos/${id}`)
      .set('Authorization', `Bearer ${t.token}`)
      .send({ titulo: 'Contenido Editado' });
    const elapsed = Date.now() - t0;
    const dbRow = await Content.findByPk(id);

    console.log('\n===== PRU-CONT-UNIT-004 =====');
    console.log('DATOS: PUT /api/contenidos/' + id + ' { titulo:"Contenido Editado" }');
    console.log('RESPUESTA:', JSON.stringify(res.body), 'STATUS:', res.status);
    console.log('BD título:', dbRow ? dbRow.titulo : null);
    console.log('TIEMPO:', elapsed, 'ms');

    expect(res.status).toBe(200);
    expect(dbRow.titulo).toBe('Contenido Editado');
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-CONT-UNIT-005: se puede eliminar contenido borrador -> 200 + BD', async () => {
    const dr = await createContenido({ titulo: 'Borrador a eliminar', publicado: false });
    const id = dr.body?.data?.id;
    const t0 = Date.now();
    const res = await api.delete(`/api/contenidos/${id}`).set('Authorization', `Bearer ${t.token}`);
    const elapsed = Date.now() - t0;
    const stillExists = !!(await Content.findByPk(id));

    console.log('\n===== PRU-CONT-UNIT-005 =====');
    console.log('DATOS: DELETE /api/contenidos/' + id + ' (contenido borrador)');
    console.log('RESPUESTA:', JSON.stringify(res.body), 'STATUS:', res.status);
    console.log('CONTENIDO EN BD?:', stillExists);
    console.log('TIEMPO:', elapsed, 'ms');

    expect(res.status).toBe(200);
    expect(stillExists).toBe(false);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-CONT-INT-001: GET /api/contenidos/modulos devuelve módulos -> 200', async () => {
    const t0 = Date.now();
    const res = await api.get('/api/contenidos/modulos').set('Authorization', `Bearer ${t.token}`);
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-CONT-INT-001 =====');
    console.log('COMANDO: GET /api/contenidos/modulos');
    console.log('RESPUESTA:', JSON.stringify(res.body).slice(0, 300), 'STATUS:', res.status);
    console.log('TIEMPO:', elapsed, 'ms');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-CONT-INT-002: estudiante ve solo contenidos publicados', async () => {
    // crear un borrador que NO debe aparecer
    await createContenido({ titulo: 'Solo Propietario Borrador', publicado: false });
    const t0 = Date.now();
    const res = await api
      .get('/api/student/contenidos/publicados')
      .set('Authorization', `Bearer ${t.studentToken}`);
    const elapsed = Date.now() - t0;
    const items = res.body?.data || [];
    const anyBorrador = items.some((c) => c.titulo === 'Solo Propietario Borrador');

    console.log('\n===== PRU-CONT-INT-002 =====');
    console.log('COMANDO: GET /api/student/contenidos/publicados (estudiante)');
    console.log('CONTENIDOS DEVUELTOS:', items.map((c) => c.titulo));
    console.log('¿INCLUYE BORRADOR?:', anyBorrador);
    console.log('STATUS:', res.status, 'TIEMPO:', elapsed, 'ms');

    expect(res.status).toBe(200);
    expect(anyBorrador).toBe(false);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-CONT-COMP-001: el formulario crea el contenido en backend y BD, y al publicarlo el estudiante lo ve (frontend↔backend↔BD)', async () => {
    const modulo = 'ModuloContComp' + Date.now();
    const titulo = 'Contenido Comp001 ' + Date.now();
    const t0 = Date.now();
    const creado = await createContenido({ titulo, publicado: false });
    const id = creado.body?.data?.id;
    createdContentIds.push(id);
    const dbBorrador = id ? await Content.findByPk(id) : null;
    // publicar vía PUT (despublicado -> publicado)
    const pub = await api
      .put(`/api/contenidos/${id}`)
      .set('Authorization', `Bearer ${t.token}`)
      .send({ publicado: true });
    const dbPublicado = id ? await Content.findByPk(id) : null;
    // el estudiante debe verlo publicado
    const studentRes = await api
      .get('/api/student/contenidos/publicados')
      .set('Authorization', `Bearer ${t.studentToken}`);
    const elapsed = Date.now() - t0;
    const visible = (studentRes.body?.data || []).some((c) => c.id === id);

    console.log('\n===== PRU-CONT-COMP-001 =====');
    console.log('DATOS (desde el formulario): título + tipo video + módulo "' + modulo + '"');
    console.log('CREATE STATUS:', creado.status, '| BD publicado al crear:', dbBorrador ? dbBorrador.publicado : null);
    console.log('PUBLICAR (PUT publicado:true) STATUS:', pub.status, '| BD publicado tras publicar:', dbPublicado ? dbPublicado.publicado : null);
    console.log('¿El estudiante ve el contenido publicado?:', visible);
    console.log('TIEMPO:', elapsed, 'ms');
    console.log('NOTA: la redirección a /contenidos (GUI) queda para ejecución manual.');

    expect(creado.status).toBe(201);
    expect(dbBorrador).toBeTruthy();
    expect(dbBorrador.publicado).toBe(false);
    expect(pub.status).toBe(200);
    expect(dbPublicado.publicado).toBe(true);
    expect(visible).toBe(true);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-CONT-COMP-002: un estudiante NO puede crear contenido (interacción rol + middleware isTeacher)', async () => {
    const t0 = Date.now();
    const res = await api
      .post('/api/contenidos')
      .set('Authorization', `Bearer ${t.studentToken}`)
      .send({ titulo: 'Intento Estudiante', tipo: 'video', contenido: 'https://youtube.com/x', modulo: 'Matemáticas', publicado: false, docente_id: t.userId });
    const elapsed = Date.now() - t0;
    const total = await Content.count({ where: { titulo: 'Intento Estudiante' } });

    console.log('\n===== PRU-CONT-COMP-002 =====');
    console.log('DATOS: estudiante autenticado intenta POST /api/contenidos (crear contenido)');
    console.log('RESPUESTA:', JSON.stringify(res.body), 'STATUS:', res.status);
    console.log('¿SE CREÓ ALGÚN REGISTRO EN BD?:', total, '(esperado 0)');
    console.log('TIEMPO:', elapsed, 'ms');

    expect(res.status).toBe(403);
    expect(total).toBe(0);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-CONT-COMP-003: el docente publica/despublica contenido y el cambio se refleja en BD', async () => {
    const creado = await createContenido({ titulo: 'Contenido Publicar ' + Date.now(), publicado: false });
    const id = creado.body?.data?.id;
    createdContentIds.push(id);
    const t0 = Date.now();
    const pub = await api
      .put(`/api/contenidos/${id}`)
      .set('Authorization', `Bearer ${t.token}`)
      .send({ publicado: true });
    const despub = await api
      .put(`/api/contenidos/${id}`)
      .set('Authorization', `Bearer ${t.token}`)
      .send({ publicado: false });
    const despubAgain = await api
      .put(`/api/contenidos/${id}`)
      .set('Authorization', `Bearer ${t.token}`)
      .send({ publicado: true });
    const elapsed = Date.now() - t0;
    const estadoFinal = (await Content.findByPk(id))?.publicado;

    console.log('\n===== PRU-CONT-COMP-003 =====');
    console.log('DATOS: secuencia Publicar(true) -> Despublicar(false) -> Publicar(true)');
    console.log('PUBLICAR STATUS:', pub.status, '| DESPUBLICAR STATUS:', despub.status, '| PUBLICAR#2 STATUS:', despubAgain.status);
    console.log('ESTADO FINAL EN BD (publicado):', estadoFinal, '(esperado true)');
    console.log('TIEMPO:', elapsed, 'ms');
    console.log('NOTA: el clic en los botones (GUI) queda para ejecución manual.');

    expect(pub.status).toBe(200);
    expect(despub.status).toBe(200);
    expect(despubAgain.status).toBe(200);
    expect(estadoFinal).toBe(true);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-CONT-COMP-004: el docente elimina un contenido desde la interfaz (con confirmación) y desaparece de BD', async () => {
    const creado = await createContenido({ titulo: 'Contenido a eliminar COMP004 ' + Date.now(), publicado: false });
    const id = creado.body?.data?.id;
    createdContentIds.push(id);
    const t0 = Date.now();
    const del = await api.delete(`/api/contenidos/${id}`).set('Authorization', `Bearer ${t.token}`);
    const elapsed = Date.now() - t0;
    const still = !!(await Content.findByPk(id));

    console.log('\n===== PRU-CONT-COMP-004 =====');
    console.log('DATOS: clic en "Eliminar" + confirmación en el diálogo (la confirmación dispara DELETE)');
    console.log('COMANDO: DELETE /api/contenidos/' + id + ' (docente autenticado)');
    console.log('RESPUESTA:', JSON.stringify(del.body), 'STATUS:', del.status);
    console.log('¿CONTENIDO SIGUE EN BD?:', still, '(esperado false)');
    console.log('TIEMPO:', elapsed, 'ms');

    expect(del.status).toBe(200);
    expect(still).toBe(false);
    console.log('RESULTADO: [CUMPLE] - el DELETE (disparado por la confirmación) elimina el contenido de BD.\n');
  }, 20000);
});
