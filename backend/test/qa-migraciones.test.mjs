/**
 * Pruebas del runner de migraciones (no requieren base de datos).
 *
 * Lo que se verifica es lo que rompería silenciosamente una migración en
 * producción: que el separador de sentencias no se trague un `;` que esté
 * dentro de una cadena o de un comentario, y que todos los scripts `.sql` del
 * repo se partan en sentencias ejecutables.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const MigrationService = require('../src/services/migration.service');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

describe('MigrationService._splitStatements', () => {
  it('parte por cada punto y coma de nivel superior', () => {
    expect(MigrationService._splitStatements('SELECT 1; SELECT 2;')).toHaveLength(2);
  });

  it('NO parte por un punto y coma dentro de una cadena simple', () => {
    const sql = "SET @s := 'ALTER TABLE `x` ADD COLUMN `y` ENUM(''pre'',''post'')';";
    const out = MigrationService._splitStatements(sql);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('ENUM(\'\'pre\'\',\'\'post\'\')');
  });

  it('NO parte por un punto y coma dentro de una comilla doble', () => {
    expect(MigrationService._splitStatements('SELECT "a;b"; SELECT 2;')).toHaveLength(2);
  });

  it('NO parte por un punto y coma en un comentario de línea', () => {
    const sql = '-- comentario ; con punto y coma\nSELECT 1;';
    expect(MigrationService._splitStatements(sql)).toHaveLength(1);
  });

  it('NO parte por un punto y coma en un comentario de bloque', () => {
    expect(MigrationService._splitStatements('/* bloque ; */ SELECT 1;')).toHaveLength(1);
  });

  it('descarta comentarios y statements vacíos', () => {
    const out = MigrationService._splitStatements(';;  \n  SELECT 1;\n\n;\n');
    expect(out).toHaveLength(1);
    expect(out[0]).toBe('SELECT 1');
  });

  it('conserva el último statement sin punto y coma final', () => {
    expect(MigrationService._splitStatements('SELECT 1')).toHaveLength(1);
  });

  it('respeta los acentos graves de los identificadores de MySQL', () => {
    expect(MigrationService._splitStatements('DROP TABLE `x;y`; SELECT 1;')).toHaveLength(2);
  });
});

describe('Scripts de migración del repositorio', () => {
  const scripts = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))
    : [];

  it('hay migraciones definidas', () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  for (const archivo of scripts) {
    it(`${archivo} se parte en sentencias no vacías`, () => {
      const stmts = MigrationService._splitStatements(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf8'));
      expect(stmts.length).toBeGreaterThan(0);
      for (const s of stmts) expect(s.trim()).not.toBe('');
    });
  }

  it('toda migración .up.sql tiene su .down.sql', () => {
    const sinDown = MigrationService.listar().filter(m => !fs.existsSync(path.join(MIGRATIONS_DIR, `${m.id}.down.sql`)));
    expect(sinDown.map(m => m.id)).toEqual([]);
  });

  it('no usa DROP COLUMN IF EXISTS (requiere MySQL 8.0.29+)', () => {
    for (const archivo of scripts) {
      // Se comparan las sentencias reales, no los comentarios que explican el porqué.
      const stmts = MigrationService._splitStatements(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf8'));
      for (const s of stmts) {
        expect(s).not.toMatch(/DROP\s+COLUMN\s+IF\s+EXISTS/i);
      }
    }
  });

  it('los scripts .up.sql son reentrantes (CREATE TABLE IF NOT EXISTS)', () => {
    for (const archivo of scripts.filter(f => f.endsWith('.up.sql'))) {
      const stmts = MigrationService._splitStatements(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf8'));
      const creates = stmts.filter(s => /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i.test(s));
      expect(creates.map(s => s.slice(0, 60)), `${archivo} crea tablas sin IF NOT EXISTS`).toEqual([]);
    }
  });
});

describe('MigrationService.listar', () => {
  it('ordena por prefijo numérico ascendente', () => {
    const ordenes = MigrationService.listar().map(m => m.orden);
    expect(ordenes).toEqual([...ordenes].sort((a, b) => a - b));
  });

  it('expone id, orden, nombre y archivo', () => {
    for (const m of MigrationService.listar()) {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('orden');
      expect(m).toHaveProperty('nombre');
      expect(m.endsWith ? true : true);
      expect(m.archivo.endsWith('.up.sql')).toBe(true);
      expect(m.id).toBe(m.archivo.replace(/\.up\.sql$/, ''));
    }
  });
});