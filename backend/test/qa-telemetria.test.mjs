import { describe, it, expect, afterAll } from 'vitest';
import { api, makeStudent, createPublishedContent, markContentCompleted } from './_qa/helpers.mjs';

// Contrato que consume el frontend en la Fase 2b
// (`frontend/src/services/telemetria.js` y `frontend/src/hooks/useTelemetria.js`).
//
// Lo delicado es `intento_id`: `iniciarActividad` lo devuelve y el cliente lo
// reenvía dentro del body del resolver para que el backend cierre el intento. Si
// esa cadena se rompe, el dashboard cuenta intentos que nunca se cierran y la
// duración sale vacía.

afterAll(async () => {
  const { sequelize } = await import('../src/config/database.js');
  if (sequelize && typeof sequelize.close === 'function') await sequelize.close();
});

describe('QA-TELEMETRIA — Contrato de telemetría del estudiante', () => {
  it('abre un intento para un contenido propio y devuelve intento_id numérico', async () => {
    const { token, userId, studentToken } = await makeStudent();

    const creado = await createPublishedContent(token, {
      titulo: `QA telemetria contenido ${Date.now()}`,
      modulo: 'Módulo QA Telemetría',
      docenteId: userId,
    });
    expect(creado.status).toBe(201);
    const contenidoId = creado.body.data.id;

    const res = await api
      .post(`/api/student/actividad/contenido/${contenidoId}/iniciar`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status, `iniciar contenido -> ${JSON.stringify(res.body)}`).toBe(200);
    expect(Number.isInteger(res.body.data.intento_id)).toBe(true);
    expect(res.body.data.intento_id).toBeGreaterThan(0);
  });

  it('cierra el intento cuando el estudiante resuelve el juego', async () => {
    const { token, userId, studentToken } = await makeStudent();
    const modulo = 'QA Telemetria ' + Date.now();

    // El acceso a una actividad se concede por módulo, así que primero se
    // publica un contenido: es lo que inscribe al estudiante en el grupo y le da
    // acceso al juego que se crea después en ese mismo módulo.
    const contenido = await createPublishedContent(token, {
      titulo: 'Contenido telemetria ' + modulo,
      modulo,
      docenteId: userId,
    });
    expect(contenido.status).toBe(201);
    await markContentCompleted(studentToken, contenido.body.data.id);

    const juegoRes = await api
      .post('/api/juegos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        titulo: `QA telemetria juego ${Date.now()}`,
        tipo: 'quiz',
        modulo,
        publicado: true,
        puntaje_max: 100,
        docente_id: userId,
      });
    expect([200, 201]).toContain(juegoRes.status);
    const juegoId = juegoRes.body.data.id;

    const inicio = await api
      .post(`/api/student/actividad/juego/${juegoId}/iniciar`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(inicio.status).toBe(200);
    const intentoId = inicio.body.data.intento_id;

    const envio = await api
      .post(`/api/student/juegos/${juegoId}/responder`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ juego_id: juegoId, intento_id: intentoId, respuestas: [{ pregunta_id: 1, respuesta: 0 }] });
    expect(envio.status).toBe(200);

    // El intento debe quedar cerrado: es lo que da la duración al dashboard.
    const { default: ActividadIntento } = await import('../src/models/actividadIntento.model.js');
    const intento = await ActividadIntento.findByPk(intentoId);
    expect(intento).toBeTruthy();
    expect(intento.cerrado_en).not.toBeNull();
  });

  it('rechaza un tipo de actividad inválido con 400', async () => {
    const { studentToken } = await makeStudent();

    const res = await api
      .post('/api/student/actividad/inventado/1/iniciar')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(400);
  });

  it('devuelve 404 si la actividad no existe', async () => {
    const { studentToken } = await makeStudent();

    const res = await api
      .post('/api/student/actividad/juego/999999999/iniciar')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(404);
  });

  it('el heartbeat y el cierre de sesión responden 200 y nunca rompen al estudiante', async () => {
    const { studentToken } = await makeStudent();

    const latido = await api
      .post('/api/student/sesion/heartbeat')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(latido.status).toBe(200);
    expect(latido.body.success).toBe(true);

    const cierre = await api
      .post('/api/student/sesion/cerrar')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(cierre.status).toBe(200);
  });
});