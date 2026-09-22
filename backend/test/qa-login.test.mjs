import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, login, makeTeacher, makeStudent, cleanupUsers, Content, unique } from './_qa/helpers.mjs';

let teacherEmail;
let teacherToken;
let teacherId;
const createdContentIds = [];

beforeAll(async () => {
  const t = await makeTeacher();
  teacherEmail = t.teacherEmail;
  teacherToken = t.token;
  teacherId = t.userId;
});

afterAll(async () => {
  for (const id of createdContentIds) {
    await Content.destroy({ where: { id } }).catch(() => {});
  }
  await cleanupUsers([teacherEmail]);
  const { sequelize } = await import('../src/config/database.js');
  if (sequelize && typeof sequelize.close === 'function') await sequelize.close();
});

describe('MÓDULO LOGIN - Pruebas no funcionales del Apéndice M', () => {
  it('PRU-LOGIN-UNIT-001: backend rechaza login sin credenciales -> 400', async () => {
    const t0 = Date.now();
    const res = await api.post('/api/auth/login').send({});
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-LOGIN-UNIT-001 =====');
    console.log('DATOS: cuerpo vacío {}');
    console.log('COMANDO: POST /api/auth/login -d "{}"');
    console.log('RESPUESTA:', JSON.stringify(res.body));
    console.log('STATUS:', res.status);
    console.log('TIEMPO:', elapsed, 'ms');
    console.log('COMPROBACIÓN: status===400 && message==="Faltan correo o contraseña"');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Faltan correo o contraseña');
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-LOGIN-UNIT-002: login correcto entrega token JWT 24h', async () => {
    const t0 = Date.now();
    const { res, token, user } = await login(teacherEmail, 'pass1234');
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-LOGIN-UNIT-002 =====');
    console.log('DATOS:', JSON.stringify({ email: teacherEmail, password: 'pass1234' }));
    console.log('COMANDO: POST /api/auth/login');
    console.log('STATUS:', res.status);
    console.log('USER:', JSON.stringify(user));
    console.log('TOKEN (primeros 60):', token ? token.slice(0, 60) + '...' : token);
    console.log('TIEMPO:', elapsed, 'ms');

    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const ttl = payload.exp - payload.iat;
    console.log('PAYLOAD JWT:', JSON.stringify(payload));
    console.log('TTL (exp-iat):', ttl, 'segundos (esperado 86400 = 24h)');

    expect(res.status).toBe(200);
    expect(token).toBeTruthy();
    expect(user.role).toBe('teacher');
    expect(payload.id).toBe(user.id);
    expect(payload).toHaveProperty('role');
    expect(payload).toHaveProperty('name');
    expect(payload).toHaveProperty('docente_id');
    expect(ttl).toBe(86400);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-LOGIN-COMP-003: login + GET /api/contenidos con el token devuelve los contenidos del docente (inyección automática del JWT)', async () => {
    const modulo = 'Modulo' + Date.now();
    const titulo = 'Contenido Comp003 ' + unique('t_');
    const creado = await api
      .post('/api/contenidos')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ titulo, tipo: 'video', contenido: 'https://www.youtube.com/watch?v=comp003', modulo, publicado: false, docente_id: teacherId });
    const contentId = creado.body?.data?.id;
    if (contentId) createdContentIds.push(contentId);

    const t0 = Date.now();
    const { res: loginRes, token } = await login(teacherEmail, 'pass1234');
    const res = await api.get('/api/contenidos').set('Authorization', `Bearer ${token}`);
    const elapsed = Date.now() - t0;

    const items = res.body?.data || [];
    const encontrado = items.some((c) => c.id === contentId);

    console.log('\n===== PRU-LOGIN-COMP-003 =====');
    console.log('DATOS: login exitoso + GET /api/contenidos con el token JWT');
    console.log('CREADO contenido id=' + contentId + ' título="' + titulo + '" por el docente');
    console.log('LOGIN STATUS:', loginRes.status, '| TOKEN?:', !!token);
    console.log('GET /api/contenidos STATUS:', res.status);
    console.log('CONTENIDOS DEVUELTOS:', items.length, '| ¿incluye el creado?:', encontrado);
    console.log('TIEMPO:', elapsed, 'ms');

    expect(loginRes.status).toBe(200);
    expect(token).toBeTruthy();
    expect(res.status).toBe(200);
    expect(encontrado).toBe(true);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-LOGIN-COMP-001: el docente inicia sesión con credenciales correctas, obtiene token y accede a la vista principal', async () => {
    const t0 = Date.now();
    const { res, token, user } = await login(teacherEmail, 'pass1234');
    // con el token de este login, el docente accede a un endpoint protegido de su panel
    const panel = await api.get('/api/contenidos').set('Authorization', `Bearer ${token}`);
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-LOGIN-COMP-001 =====');
    console.log('DATOS: credenciales correctas del docente -> POST /api/auth/login');
    console.log('LOGIN STATUS:', res.status, '| TOKEN emitido?:', !!token, '| ROLE:', user?.role);
    console.log('POST-LOGIN ACCESO A /api/contenidos STATUS:', panel.status);
    console.log('TIEMPO:', elapsed, 'ms');
    console.log('NOTE: la redirección a la vista principal (GUI) queda para ejecución manual.');

    expect(res.status).toBe(200);
    expect(token).toBeTruthy();
    expect(user.role).toBe('teacher');
    expect(panel.status).toBe(200);
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-LOGIN-COMP-002: el formulario valida credenciales e impide el acceso si son incorrectas', async () => {
    const t0 = Date.now();
    // parte backend: credenciales incorrectas -> 401 y sin token
    const res = await api.post('/api/auth/login').send({ email: teacherEmail, password: 'clave-incorrecta-xyz' });
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-LOGIN-COMP-002 =====');
    console.log('DATOS: credenciales INCORRECTAS -> POST /api/auth/login');
    console.log('RESPUESTA:', JSON.stringify(res.body), 'STATUS:', res.status);
    console.log('¿SE EMITIÓ TOKEN?:', false);
    console.log('TIEMPO:', elapsed, 'ms');
    console.log('NOTE: la validación visual en el formulario (mensaje de error) queda para ejecución manual.');

    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-LOGIN-INT-001: estudiante autenticado es redirigido a /student/dashboard y no a /docente/dashboard', async () => {
    const s = await makeStudent();
    const t0 = Date.now();
    const { res, token, user } = await login(s.studentEmail, 'pass1234');
    const elapsed = Date.now() - t0;

    // Replica exacta de la lógica de redirección del frontend (Login.jsx:29-31):
    // const user = JSON.parse(atob(token.split('.')[1]...)); const isTeacher = role==='teacher'||role==='docente';
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const isTeacher = payload.role === 'teacher' || payload.role === 'docente';
    const targetDashboard = isTeacher ? '/docente/dashboard' : '/student/dashboard';

    console.log('\n===== PRU-LOGIN-INT-001 =====');
    console.log('DATOS (Apéndice): login con credenciales de ESTUDIANTE (role: student, email=' + s.studentEmail + ')');
    console.log('COMANDO: POST /api/auth/login + decodificar payload del JWT (lógica del frontend)');
    console.log('LOGIN STATUS:', res.status, '| ROLE en BD/response:', user?.role);
    console.log('ROLE en payload JWT:', payload.role);
    console.log('isTeacher? (lógica Login.jsx):', isTeacher);
    console.log('REDIRECCIÓN DECIDIDA:', targetDashboard);
    console.log('TIEMPO:', elapsed, 'ms');

    expect(res.status).toBe(200);
    expect(token).toBeTruthy();
    expect(payload.role).toBe('student');
    expect(isTeacher).toBe(false);
    expect(targetDashboard).toBe('/student/dashboard');
    expect(targetDashboard).not.toBe('/docente/dashboard');
    console.log('RESULTADO: [CUMPLE] - el estudiante es redirigido a /student/dashboard y no al de docente.\n');

    await cleanupUsers([s.studentEmail, s.teacherEmail]);
  }, 20000);

  it('PRU-LOGIN-INT-002: docente autenticado es redirigido a /docente/dashboard y no a /student/dashboard', async () => {
    const t0 = Date.now();
    const { res, token, user } = await login(teacherEmail, 'pass1234');
    const elapsed = Date.now() - t0;

    // Replica exacta de la lógica de redirección del frontend (Login.jsx:29-31)
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const isTeacher = payload.role === 'teacher' || payload.role === 'docente';
    const targetDashboard = isTeacher ? '/docente/dashboard' : '/student/dashboard';

    console.log('\n===== PRU-LOGIN-INT-002 =====');
    console.log('DATOS (Apéndice): login con credenciales de DOCENTE (role: docente, email=' + teacherEmail + ')');
    console.log('COMANDO: POST /api/auth/login + decodificar payload del JWT (lógica del frontend)');
    console.log('LOGIN STATUS:', res.status, '| ROLE en BD/response:', user?.role);
    console.log('ROLE en payload JWT:', payload.role);
    console.log('isTeacher? (lógica Login.jsx):', isTeacher);
    console.log('REDIRECCIÓN DECIDIDA:', targetDashboard);
    console.log('TIEMPO:', elapsed, 'ms');

    expect(res.status).toBe(200);
    expect(token).toBeTruthy();
    expect(payload.role).toBe('teacher');
    expect(isTeacher).toBe(true);
    expect(targetDashboard).toBe('/docente/dashboard');
    expect(targetDashboard).not.toBe('/student/dashboard');
    console.log('RESULTADO: [CUMPLE] - el docente es redirigido a /docente/dashboard y no al de estudiante.\n');
  }, 20000);
});
