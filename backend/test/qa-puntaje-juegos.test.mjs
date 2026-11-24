import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv/config');
const GameService = require('../src/services/game.service.js');

describe('QA-PUNTAJE-JUEGOS · escala real del juego', () => {
  it('mantiene el comportamiento de los juegos de 100 puntos', () => {
    expect(GameService._puntajeDesdePorcentaje(75, 100)).toBe(75);
    expect(GameService._puntajeDesdePorcentaje(120, 100)).toBe(100);
    expect(GameService._puntajeDesdePorcentaje(89, 100)).toBe(89);
  });

  it('reparte un máximo de 80 entre 9 respuestas', () => {
    // 8 de 9 = 89%; antes se cortaba a 80 y empataba con 9 de 9.
    expect(GameService._puntajeDesdePorcentaje(89, 80)).toBe(71);
    expect(GameService._puntajeDesdePorcentaje(100, 80)).toBe(80);
    expect(GameService._puntajeDesdePorcentaje(78, 80)).toBe(62);
    expect(GameService._puntajeDesdePorcentaje(67, 80)).toBe(54);
  });

  it('nunca pasa del máximo ni acepta valores inválidos', () => {
    expect(GameService._puntajeDesdePorcentaje(-10, 80)).toBe(0);
    expect(GameService._puntajeDesdePorcentaje('abc', 80)).toBe(0);
    expect(GameService._puntajeDesdePorcentaje(100, 0)).toBe(0);
  });
});
