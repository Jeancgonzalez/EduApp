import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv/config');

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app.js');
const DashboardService = require('../src/services/dashboard.service.js');

const SECRET = process.env.JWT_SECRET || 'supersecretoeduapp123';
const tokenPara = (role) => jwt.sign({ id: 1, docente_id: 1, role }, SECRET);

describe('QA-RANKING-ESTUDIANTE · autorización y privacidad', () => {
  it('exige token', async () => {
    const res = await request(app).get('/api/dashboard/ranking-estudiante');
    expect(res.status).toBe(401);
  });

  it('rechaza a un docente aunque tenga token', async () => {
    const res = await request(app)
      .get('/api/dashboard/ranking-estudiante')
      .set('Authorization', `Bearer ${tokenPara('teacher')}`);
    expect(res.status).toBe(403);
  });

  it('muestra solo nombre de pila e inicial del apellido', () => {
    expect(DashboardService._aliasPrivado('Ana María Pérez')).toBe('Ana P.');
    expect(DashboardService._aliasPrivado('Bruno Díaz')).toBe('Bruno D.');
    expect(DashboardService._aliasPrivado('')).toBe('Compañero');
  });

  it('ordena por puntos antes que por porcentaje', () => {
    // El caso que motivó el cambio: 600 pts con 40% de acierto tiene que subir
    // por encima de 500 pts con 100%. Antes mandaba el porcentaje.
    const filas = [
      { alias: 'Ana P.', puntos: 500, pct: 100, intentos: 10 },
      { alias: 'Bruno D.', puntos: 600, pct: 40, intentos: 2 },
    ];
    expect(DashboardService._ordenarPorPuntos(filas).map((f) => f.alias))
      .toEqual(['Bruno D.', 'Ana P.']);
  });

  it('desempata por acierto, constancia y alias a igualdad de puntos', () => {
    const filas = [
      { alias: 'Carla P.', puntos: 300, pct: 80, intentos: 1 },
      { alias: 'Diego R.', puntos: 300, pct: 80, intentos: 3 },
      { alias: 'Elena S.', puntos: 300, pct: 95, intentos: 1 },
      { alias: 'Ana P.', puntos: 300, pct: 80, intentos: 3 },
    ];
    expect(DashboardService._ordenarPorPuntos(filas).map((f) => f.alias))
      .toEqual(['Elena S.', 'Ana P.', 'Diego R.', 'Carla P.']);
  });
});
