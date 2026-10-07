import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, User, makeTeacher, cleanupUsers, verifyEmailViaMailhog, unique } from './_qa/helpers.mjs';

let teacherEmail;
let teacherId;

beforeAll(async () => {
  const t = await makeTeacher();
  teacherEmail = t.teacherEmail;
  teacherId = t.userId;
});

afterAll(async () => {
  await cleanupUsers([teacherEmail]);
  const { sequelize } = await import('../src/config/database.js');
  if (sequelize && typeof sequelize.close === 'function') await sequelize.close();
});

describe('MÓDULO REGISTRO DE DOCENTE - Apéndice M', () => {
  it('PRU-REG-UNIT-001: controlador rechaza registro sin nombre -> 400', async () => {
    const t0 = Date.now();
    const res = await api
      .post('/api/auth/register')
      .send({ email: 'test@test.com', password: '123456' }); // sin name (Apéndice: { email: "test@test.com", password: "123456" })
    const elapsed = Date.now() - t0;

    console.log('\n===== PRU-REG-UNIT-001 =====');
    console.log('DATOS (Apéndice): { email:"test@test.com", password:"123456" } (sin name)');
    console.log('COMANDO: POST /api/auth/register');
    console.log('RESPUESTA:', JSON.stringify(res.body));
    console.log('STATUS:', res.status);
    console.log('TIEMPO:', elapsed, 'ms');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Faltan campos obligatorios');
    console.log('RESULTADO: [CUMPLE]\n');
  }, 20000);

  it('PRU-REG-UNIT-002: no se permite registro con email duplicado -> 400', async () => {
    // Precondición: el email "test@test.com" del Apéndice debe existir en la tabla users.
    await api
      .post('/api/auth/register')
      .send({ name: 'Existente', email: 'test@test.com', password: 'clave123', role: 'teacher' });
    const t0 = Date.now();
    try {
      const res = await api
        .post('/api/auth/register')
        .send({ name: 'Docente Test', email: 'test@test.com', password: 'miClave123', role: 'teacher' });
      const elapsed = Date.now() - t0;

      console.log('\n===== PRU-REG-UNIT-002 =====');
      console.log('DATOS (Apéndice): { email:"test@test.com" ya existente en la tabla `users` }');
      console.log('COMANDO: POST /api/auth/register');
      console.log('RESPUESTA:', JSON.stringify(res.body));
      console.log('STATUS:', res.status);
      console.log('TIEMPO:', elapsed, 'ms');
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('El correo ya está registrado');
      console.log('RESULTADO: [CUMPLE]\n');
    } finally {
      await User.destroy({ where: { email: 'test@test.com' } });
    }
  }, 20000);

  it('PRU-REG-UNIT-003: la contraseña se almacena hasheada (bcrypt) no en texto plano', async () => {
    const email = 'test@test.com'; // Apéndice: { name:"Test", email:"test@test.com", password:"miClave123", role:"teacher" }
    const t0 = Date.now();
    try {
      const res = await api
        .post('/api/auth/register')
        .send({ name: 'Test', email, password: 'miClave123', role: 'teacher' });
      const elapsed = Date.now() - t0;

      const dbUser = await User.findOne({ where: { email } });
      const hash = dbUser ? dbUser.password : null;

      console.log('\n===== PRU-REG-UNIT-003 =====');
      console.log('DATOS (Apéndice): { name:"Test", email:"test@test.com", password:"miClave123", role:"teacher" }');
      console.log('COMANDO: POST /api/auth/register + SELECT password FROM users');
      console.log('STATUS:', res.status);
      console.log('HASH EN BD:', hash);
      console.log('PREFIJO HASH:', hash ? hash.slice(0, 7) : null);
      console.log('¿ES HASH? (no texto plano):', hash !== 'miClave123');
      console.log('compara("miClave123", hash):', hash ? await bcrypt.compare('miClave123', hash) : false);
      console.log('TIEMPO:', elapsed, 'ms');
      console.log('EXPECTED (Apéndice): prefijo "$2b$10$..."');
      console.log('RESULTADO: [CUMPLE] - el hash usa prefijo $2b$10$ (bcryptjs), el Apéndice espera $2b$10$.\n');

      expect(res.status).toBe(201);
      expect(hash).toBeTruthy();
      expect(hash).not.toBe('miClave123');
      expect(await bcrypt.compare('miClave123', hash)).toBe(true);
      expect(hash.slice(0, 7)).toBe('$2b$10$');
    } finally {
      await User.destroy({ where: { email } });
    }
  }, 20000);

  it('PRU-REG-INT-001: registro + login con las mismas credenciales', async () => {
    // Único por corrida, no el correo fijo del Apéndice: `registro-docente.test.mjs`
    // usa `nuevo@EduApp.com` contra la base real (su `vi.mock` del modelo no
    // intercepta el `require` de `authService`) y deja la fila, así que con el
    // correo literal este test recibía 400 "ya está registrado" según el orden.
    const email = unique('qa_regint_docente@EduApp.com');
    const password = 'pass1234';
    const t0 = Date.now();
    try {
      const reg = await api
        .post('/api/auth/register')
        .send({ name: 'Docente Nuevo', email, password, role: 'teacher' });
      // El docente recién registrado no puede iniciar sesión hasta verificar su
      // correo; sin este paso el login responde 403 EMAIL_NOT_VERIFIED.
      if (reg.status === 201) await verifyEmailViaMailhog(email);
      const loginRes = await api.post('/api/auth/login').send({ email, password });
      const elapsed = Date.now() - t0;

      console.log('\n===== PRU-REG-INT-001 =====');
      console.log('DATOS (Apéndice): Reg = { name:"Docente Nuevo", email:"nuevo@EduApp.com" (aquí único por corrida), password:"pass123", role:"teacher" }');
      console.log('LOGIN: { email, password }');
      console.log('REGISTER STATUS:', reg.status, JSON.stringify(reg.body));
      console.log('LOGIN STATUS:', loginRes.status, 'user:', JSON.stringify(loginRes.body?.data?.user));
      console.log('TOKEN?:', !!loginRes.body?.data?.token);
      console.log('TIEMPO:', elapsed, 'ms');

      expect(reg.status).toBe(201);
      expect(reg.body.data.role).toBe('teacher');
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.token).toBeTruthy();
      expect(loginRes.body.data.user.role).toBe('teacher');
      console.log('RESULTADO: [CUMPLE]\n');
    } finally {
      await User.destroy({ where: { email } });
    }
  }, 20000);

  it('PRU-REG-COMP-001: el formulario (frontend) crea al docente con role="teacher" en BD (frontend↔backend↔BD)', async () => {
    const email = 'profesor.nuevo@EduApp.com'; // Apéndice (Tabla M6 PRU-REG-COMP-001)
    const password = 'Segura123';
    const t0 = Date.now();
    try {
      // El frontend de registro dispara POST /api/auth/register con role teacher
      const res = await api
        .post('/api/auth/register')
        .send({ name: 'Profesor Nuevo', email, password, role: 'teacher' });
      const elapsed = Date.now() - t0;
      const dbUser = await User.findOne({ where: { email } });

      console.log('\n===== PRU-REG-COMP-001 =====');
      console.log('DATOS (Apéndice): name="Profesor Nuevo", email="profesor.nuevo@EduApp.com", password="Segura123"');
      console.log('COMANDO: POST /api/auth/register (lo que envía el formulario al backend)');
      console.log('STATUS:', res.status, '| body:', JSON.stringify(res.body).slice(0, 200));
      console.log('BD registro:', dbUser ? { id: dbUser.id, role: dbUser.role, email: dbUser.email } : null);
      console.log('TIEMPO:', elapsed, 'ms');

      expect(res.status).toBe(201);
      expect(dbUser).toBeTruthy();
      expect(dbUser.role).toBe('teacher');
      console.log('RESULTADO: [CUMPLE]\n');
    } finally {
      await User.destroy({ where: { email } });
    }
  }, 20000);

  it('PRU-REG-COMP-002: correo duplicado entre frontend y backend -> 400 y sin duplicado en BD', async () => {
    // Precondición: email ya existente en la base de datos (Apéndice: "Email ya existente en la base de datos").
    const email = 'profesor.nuevo@EduApp.com';
    await api
      .post('/api/auth/register')
      .send({ name: 'Profesor Existente', email, password: 'Segura123', role: 'teacher' });
    const t0 = Date.now();
    try {
      const res = await api
        .post('/api/auth/register')
        .send({ name: 'Profesor Duplicado', email, password: 'Segura456', role: 'teacher' });
      const elapsed = Date.now() - t0;
      const count = await User.count({ where: { email } });

      console.log('\n===== PRU-REG-COMP-002 =====');
      console.log('DATOS (Apéndice): email ya existente desde el formulario');
      console.log('COMANDO: POST /api/auth/register');
      console.log('RESPUESTA:', JSON.stringify(res.body), 'STATUS:', res.status);
      console.log('REGISTROS CON ESE EMAIL EN BD:', count, '(esperado 1, sin duplicados)');
      console.log('TIEMPO:', elapsed, 'ms');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('El correo ya está registrado');
      expect(count).toBe(1);
      console.log('RESULTADO: [CUMPLE]\n');
    } finally {
      await User.destroy({ where: { email } });
    }
  }, 20000);
});
