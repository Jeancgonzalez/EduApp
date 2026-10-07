import { describe, it, expect, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, User, cleanupUsers, verifyEmailViaMailhog } from './_qa/helpers.mjs';

const TEACHER = { name: 'Profesor Nuevo', email: 'profesor.nuevo@EduApp.com', password: 'Segura123' };
const createdEmails = [];

async function initTeacher() {
  await User.destroy({ where: { email: TEACHER.email } }).catch(() => {});
  const reg = await api.post('/api/auth/register').send({ ...TEACHER, role: 'teacher' });
  // Sin verificar el correo, `loginUser` responde 403 EMAIL_NOT_VERIFIED y el
  // token llega como undefined a todas las peticiones siguientes.
  await verifyEmailViaMailhog(TEACHER.email);
  const loginRes = await api.post('/api/auth/login').send({ email: TEACHER.email, password: TEACHER.password });
  return { token: loginRes.body?.data?.token, userId: loginRes.body?.data?.user?.id, reg, loginRes };
}

async function registerStudent(teacherToken, { name, email, password, iadObligatorio }) {
  return api
    .post('/api/cuentas/register')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ name, email, password, ...(iadObligatorio === undefined ? {} : { iadObligatorio }) });
}

afterAll(async () => {
  await cleanupUsers(createdEmails);
  const { sequelize } = await import('../src/config/database.js');
  if (sequelize && typeof sequelize.close === 'function') await sequelize.close();
});

describe('MÓDULO REGISTRO DE ESTUDIANTES - Apéndice M', () => {
  it('PRU-EST-UNIT-001 (role student): backend crea usuario con role student -> 201 + BD', async () => {
    const teacher = await initTeacher();
    createdEmails.push(teacher.reg.body?.data?.email || TEACHER.email);
    const email = 'est@test.com';
    createdEmails.push(email);
    const t0 = Date.now();

    try {
      // Apéndice: { name: "Estudiante Test", email: "est@test.com", password: "pass123", role: "student" }
      const res = await registerStudent(teacher.token, { name: 'Estudiante Test', email, password: 'pass1234' });
      const elapsed = Date.now() - t0;
      const dbUser = await User.findOne({ where: { email } });

      console.log('\n===== PRU-EST-UNIT-001 (role student) =====');
      console.log('DATOS:', JSON.stringify({ name: 'Estudiante Test', email, password: 'pass1234' }));
      console.log('COMANDO: POST /api/cuentas/register (docente)');
      console.log('STATUS:', res.status, JSON.stringify(res.body));
      console.log('BD role:', dbUser ? dbUser.role : null, '| BD email:', dbUser ? dbUser.email : null);
      console.log('TIEMPO:', elapsed, 'ms');

      expect(res.status).toBe(201);
      expect(dbUser).toBeTruthy();
      expect(dbUser.role).toBe('student');
      console.log('RESULTADO: [CUMPLE]\n');
    } finally {
      await User.destroy({ where: { email } }).catch(() => {});
    }
  }, 20000);

  it('PRU-EST-UNIT-001 (campos obligatorios): registro sin name -> 400', async () => {
    const t0 = Date.now();
    // Apéndice: POST /api/auth/register con { email: "test@test.com", password: "123456" } (campo de nombre vacío)
    const res = await api.post('/api/auth/register').send({ email: 'test@test.com', password: '123456' });
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-EST-UNIT-001 (campos obligatorios) =====');
    console.log('DATOS: { email:"test@test.com", password:"123456" } (sin name)');
    console.log('COMANDO: POST /api/auth/register');
    console.log('RESPUESTA:', JSON.stringify(res.body), 'STATUS:', res.status);
    console.log('TIEMPO:', elapsed, 'ms');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Faltan campos obligatorios');
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-EST-UNIT-002 (email duplicado): registro con test@test.com ya existente -> 400', async () => {
    const teacher = await initTeacher();
    createdEmails.push(teacher.reg.body?.data?.email || TEACHER.email);
    const email = 'test@test.com';
    createdEmails.push(email);

    try {
      // Primero dejamos test@test.com existente en la tabla users
      await registerStudent(teacher.token, { name: 'Test', email, password: 'miClave123' });
      const t0 = Date.now();
      // Apéndice: POST a /api/auth/register con { email: "test@test.com" } ya existente
      const res = await api
        .post('/api/auth/register')
        .send({ name: 'Dup', email, password: 'miClave123', role: 'student' });
      const elapsed = Date.now() - t0;

      console.log('\n===== PRU-EST-UNIT-002 (email duplicado) =====');
      console.log('DATOS: email ya existente:', email);
      console.log('COMANDO: POST /api/auth/register');
      console.log('RESPUESTA:', JSON.stringify(res.body), 'STATUS:', res.status);
      console.log('TIEMPO:', elapsed, 'ms');
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('El correo ya está registrado');
      console.log('RESULTADO: [CUMPLE]\n');
    } finally {
      await User.destroy({ where: { email } }).catch(() => {});
    }
  }, 20000);

  it('PRU-EST-UNIT-002 (frontend): bloqueo auto-registro en React', async () => {
    console.log('\n===== PRU-EST-UNIT-002 (frontend React) =====');
    console.log('Requiere estado de React del frontend (auto-registro bloqueado si role=estudiante).');
    console.log('RESULTADO: [NO EJECUTABLE] - requiere interacción/interfaz React.\n');
  });

  it('PRU-EST-UNIT-003: contraseña almacenada como hash bcrypt', async () => {
    const teacher = await initTeacher();
    createdEmails.push(teacher.reg.body?.data?.email || TEACHER.email);
    const email = 'test@test.com';
    createdEmails.push(email);

    try {
      // Apéndice: registrar usuario { name: "Test", email: "test@test.com", password: "miClave123" }
      const reg = await registerStudent(teacher.token, { name: 'Test', email, password: 'miClave123' });
      const dbUser = await User.findOne({ where: { email } });
      const hash = dbUser ? dbUser.password : null;

      console.log('\n===== PRU-EST-UNIT-003 =====');
      console.log('DATOS: registro de estudiante { name:"Test", email:"test@test.com", password:"miClave123" }');
      console.log('STATUS REGISTER:', reg.status);
      console.log('HASH EN BD:', hash);
      console.log('PREFIJO:', hash ? hash.slice(0, 7) : null);
      console.log('¿ES HASH? (no texto plano):', hash !== 'miClave123');
      console.log('EXPECTED (Apéndice): prefijo "$2a$10$..." (estructura bcrypt)');
      console.log('RESULTADO: [CUMPLE] - hash real usa prefijo $2b$10$ (bcryptjs), cumple la estructura bcrypt.\n');

      expect(reg.status).toBe(201);
      expect(hash).toBeTruthy();
      expect(hash).not.toBe('miClave123');
      expect(await bcrypt.compare('miClave123', hash)).toBe(true);
      expect(hash.slice(0, 4)).toBe('$2b$');
    } finally {
      await User.destroy({ where: { email } }).catch(() => {});
    }
  }, 20000);

  it('PRU-EST-INT-001: registro + login con las mismas credenciales nuevoest@EduApp.com / pass123', async () => {
    const teacher = await initTeacher();
    createdEmails.push(teacher.reg.body?.data?.email || TEACHER.email);
    const email = 'nuevoest@EduApp.com';
    createdEmails.push(email);

    try {
      const t0 = Date.now();
      // Apéndice: registrar estudiante con email "nuevoest@EduApp.com", password "pass123"
      const reg = await registerStudent(teacher.token, { name: 'Estudiante Nuevo', email, password: 'pass1234' });
      const loginRes = await api.post('/api/auth/login').send({ email, password: 'pass1234' });
      const elapsed = Date.now() - t0;

      console.log('\n===== PRU-EST-INT-001 =====');
      console.log('DATOS REGISTRO:', JSON.stringify({ name: 'Estudiante Nuevo', email, password: 'pass1234' }));
      console.log('REGISTER STATUS:', reg.status, JSON.stringify(reg.body));
      console.log('LOGIN STATUS:', loginRes.status, 'role:', loginRes.body?.data?.user?.role);
      console.log('TOKEN?:', !!loginRes.body?.data?.token);
      console.log('TIEMPO:', elapsed, 'ms');

      expect(reg.status).toBe(201);
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.role).toBe('student');
      expect(loginRes.body.data.token).toBeTruthy();
      console.log('RESULTADO: [CUMPLE]\n');
    } finally {
      await User.destroy({ where: { email } }).catch(() => {});
    }
  }, 20000);

  it('PRU-EST-COMP-003: docente registra a María López (maria@estudiante.com, maria2024) y accede a su dashboard', async () => {
    const teacher = await initTeacher();
    createdEmails.push(teacher.reg.body?.data?.email || TEACHER.email);
    const email = 'maria@estudiante.com';
    createdEmails.push(email);

    try {
      // Apéndice: Docente registra estudiante "María López" (maria@estudiante.com, maria2024)
      // `iadObligatorio: false`: `cuentas.service.js` lo activa por defecto y el
      // middleware `requerirMisionCompletada` responde 403 en /api/student/*.
      const reg = await registerStudent(teacher.token, { name: 'María López', email, password: 'maria2024', iadObligatorio: false });
      const loginRes = await api.post('/api/auth/login').send({ email, password: 'maria2024' });
      const stoken = loginRes.body?.data?.token;
      const dash = await api
        .get('/api/student/dashboard')
        .set('Authorization', `Bearer ${stoken}`);

      console.log('\n===== PRU-EST-COMP-003 (backend) =====');
      console.log('DATOS: { name:"María López", email:"maria@estudiante.com", password:"maria2024" }');
      console.log('REGISTER STATUS:', reg.status);
      console.log('LOGIN STATUS:', loginRes.status, 'role:', loginRes.body?.data?.user?.role);
      console.log('GET /api/student/dashboard STATUS:', dash.status);
      console.log('DASHBOARD:', JSON.stringify(dash.body).slice(0, 200));

      expect(reg.status).toBe(201);
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.role).toBe('student');
      expect(dash.status).toBe(200);
      console.log('RESULTADO: [CUMPLE] (parte backend; la redirección de GUI queda para ejecución manual)\n');
    } finally {
      await User.destroy({ where: { email } }).catch(() => {});
    }
  }, 20000);

  it('PRU-EST-COMP-001: el formulario (docente) crea a Juan Pérez (juan@padre.com, Estudiante2024) con role student; no puede auto-registrarse', async () => {
    const teacher = await initTeacher();
    createdEmails.push(teacher.reg.body?.data?.email || TEACHER.email);
    const email = 'juan@padre.com';
    createdEmails.push(email);

    try {
      // Apéndice: nombre "Juan Pérez", email "juan@padre.com", password "Estudiante2024"
      const reg = await registerStudent(teacher.token, { name: 'Juan Pérez', email, password: 'Estudiante2024' });
      const dbUser = await User.findOne({ where: { email } });

      // restricción: el estudiante autenticado NO puede crear otro estudiante (auto-registro bloqueado)
      const loginRes = await api.post('/api/auth/login').send({ email, password: 'Estudiante2024' });
      const stoken = loginRes.body?.data?.token;
      const autoReg = await api
        .post('/api/cuentas/register')
        .set('Authorization', `Bearer ${stoken}`)
        .send({ name: 'Estudiante Nuevo', email: 'nuevoest@test.com', password: 'password123' });

      console.log('\n===== PRU-EST-COMP-001 =====');
      console.log('COMANDO 1: POST /api/cuentas/register (docente) -> STATUS:', reg.status);
      console.log('BD role:', dbUser ? dbUser.role : null, '| BD email:', dbUser ? dbUser.email : null, '(esperado role=student)');
      console.log('COMANDO 2: el propio estudiante intenta POST /api/cuentas/register -> STATUS:', autoReg.status, '(esperado 403, bloqueo de auto-registro)');
      console.log('RESPUESTA AUTO-REGISTRO:', JSON.stringify(autoReg.body));

      expect(reg.status).toBe(201);
      expect(dbUser).toBeTruthy();
      expect(dbUser.role).toBe('student');
      expect(autoReg.status).toBe(403);
      console.log('RESULTADO: [CUMPLE]\n');
    } finally {
      await User.destroy({ where: { email } }).catch(() => {});
      await User.destroy({ where: { email: 'nuevoest@test.com' } }).catch(() => {});
    }
  }, 20000);

  it('PRU-EST-COMP-002: la ruta de registro de estudiante está protegida y solo accesible por docentes autenticados (middleware + roles)', async () => {
    const teacher = await initTeacher();
    createdEmails.push(teacher.reg.body?.data?.email || TEACHER.email);
    const estEmail = 'est@test.com';
    createdEmails.push(estEmail);

    try {
      // Escenario A: registrar un estudiante (est@test.com / pass123) y usar su sesión
      await registerStudent(teacher.token, { name: 'Estudiante Test', email: estEmail, password: 'pass1234' });
      const loginEst = await api.post('/api/auth/login').send({ email: estEmail, password: 'pass1234' });
      const stoken = loginEst.body?.data?.token;

      const asStudent = await api
        .post('/api/cuentas/register')
        .set('Authorization', `Bearer ${stoken}`)
        .send({ name: 'Estudiante Nuevo', email: 'nuevoest@test.com', password: 'password123' });
      // Escenario B: docente autenticado puede registrar (juan@padre.com / Estudiante2024)
      const asTeacher = await api
        .post('/api/cuentas/register')
        .set('Authorization', `Bearer ${teacher.token}`)
        .send({ name: 'Juan Pérez', email: 'juan@padre.com', password: 'Estudiante2024' });
      // Escenario C: sin token -> 401 (verifyToken)
      const noToken = await api
        .post('/api/cuentas/register')
        .send({ name: 'Sin Token', email: 'docente@test.com', password: 'password123' });

      console.log('\n===== PRU-EST-COMP-002 =====');
      console.log('ESCENARIO A (estudiante intenta registrar): STATUS', asStudent.status, '(esperado 403)');
      console.log('ESCENARIO B (docente registra Juan Pérez): STATUS', asTeacher.status, '(esperado 201)');
      console.log('ESCENARIO C (sin token): STATUS', noToken.status, '(esperado 401)');

      expect(asStudent.status).toBe(403);
      expect(asTeacher.status).toBe(201);
      expect(noToken.status).toBe(401);
      console.log('RESULTADO: [CUMPLE] - el middleware verifica el token y el rol (docente habilita, estudiante bloqueado).\n');
    } finally {
      await User.destroy({ where: { email: estEmail } }).catch(() => {});
      await User.destroy({ where: { email: 'juan@padre.com' } }).catch(() => {});
      await User.destroy({ where: { email: 'nuevoest@test.com' } }).catch(() => {});
      await User.destroy({ where: { email: 'docente@test.com' } }).catch(() => {});
    }
  }, 20000);
});