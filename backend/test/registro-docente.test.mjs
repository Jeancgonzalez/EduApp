import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';

// Mocked User model — se sustituye el módulo antes de importar app.js,
// de modo que authService utiliza el mock y NO se conecta a MySQL.
const userMock = vi.hoisted(() => ({
  findOne: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../src/models/User', () => ({
  __esModule: true,
  default: userMock,
}));

// app.js no conecta a MySQL (la conexión ocurre en server.js), por lo que es seguro importarla.
// Se importa por la ruta de módulos de Vitest para que el mock del modelo se aplique.
import app from '../src/app.js';

beforeEach(() => {
  vi.clearAllMocks();
  userMock.create.mockReset();
  userMock.findOne.mockReset();
});

afterAll(async () => {
  const { sequelize } = await import('../src/config/database.js');
  if (sequelize && typeof sequelize.close === 'function') {
    await sequelize.close();
  }
});

describe('PRU-REG-UNIT-001 — Controlador rechaza registros sin campos obligatorios', () => {
  it('devuelve 400 con mensaje "Faltan campos obligatorios" cuando falta el nombre', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@test.com', password: '12345678' }); // sin 'name'

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Faltan campos obligatorios');
    expect(userMock.create).not.toHaveBeenCalled();
  });
});

describe('PRU-REG-UNIT-002 — No se permiten registros con email duplicado', () => {
  it('devuelve 400 con mensaje "El correo ya está registrado"', async () => {
    userMock.findOne.mockResolvedValue({ id: 1, email: 'test@test.com' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Docente', email: 'test@test.com', password: '12345678', role: 'teacher' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('El correo ya está registrado');
    expect(userMock.create).not.toHaveBeenCalled();
  });
});

describe('PRU-REG-UNIT-003 — La contraseña se almacena como hash bcrypt', () => {

  it('crea el usuario con un hash $2b$10$..., no en texto plano', async () => {

    userMock.findOne.mockResolvedValue(null);

    userMock.create.mockImplementation(async (data) => ({
      id: 1,
      ...data
    }));

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test',
        email: 'test@test.com',
        password: 'miClave123',
        role: 'teacher'
      });

    expect(res.status).toBe(201);

    const createdData = userMock.create.mock.calls[0][0];

    // Verifica que la contraseña utiliza bcrypt con costo 10
    expect(createdData.password).toMatch(/^\$2b\$10\$/);

    // Verifica que NO se almacena la contraseña en texto plano
    expect(createdData.password).not.toBe('miClave123');

    // Verifica que el hash corresponde a la contraseña original
    expect(
      await bcrypt.compare('miClave123', createdData.password)
    ).toBe(true);

    console.log(
      'RESULTADO: [CUMPLE] - La contraseña se almacena mediante bcrypt ($2b$10$) y no en texto plano.'
    );
  });
});

describe('PRU-REG-UNIT-004 — El servicio registra un usuario con role=teacher (unitaria, modelo simulado)', () => {
  it('registra (201) un usuario con role=teacher y contraseña hasheada', async () => {
    userMock.findOne.mockResolvedValue(null);
    userMock.create.mockImplementation(async (data) => ({
      id: 1, name: data.name, email: data.email, password: data.password, role: data.role,
    }));

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Profesor', email: 'nuevo@EduApp.com', password: 'pass1234', role: 'teacher' });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('teacher');
    const createdData = userMock.create.mock.calls[0][0];
    expect(createdData.role).toBe('teacher');
  });
});
