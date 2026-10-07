/**
 * MigrationService
 * ----------------
 * Runner de migraciones SQL versionadas y reversibles.
 *
 * - Los scripts viven en `backend/migrations/<NNN>_<nombre>.up.sql` y `.down.sql`.
 * - Cada migración aplicada se registra en la tabla `schema_migrations`, de modo
 *   que el arranque es idempotente: nunca se reaplica una migración ya aplicada.
 * - `revertirUltima()` deshace la última migración usando su script `.down.sql`
 *   y borra su registro del ledger.
 *
 * Diseño a propósito:
 *  - No se usa `sequelize.sync({ alter: true })`: puede destruir datos.
 *  - No se depende de sequelize-cli ni de ninguna librería nueva; se ejecuta el
 *    SQL directamente con la conexión ya abierta por `config/database.js`.
 *  - Los scripts se separan por `;` respetando el código entre comillas y los
 *    comentarios `--`, suficiente para DDL (no hay procedimientos almacenados).
 */

const fs = require('fs');
const path = require('path');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

class MigrationService {
  /**
   * Divide un script SQL en sentencias ejecutables.
   * Respeta comillas simples/dobles, backticks y comentarios de línea.
   */
  static _splitStatements(sql) {
    const statements = [];
    let current = '';
    let quote = null;

    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];
      const next = sql[i + 1];

      // Comentario de línea: se descarta hasta el fin de línea.
      if (!quote && (ch === '-' && next === '-')) {
        while (i < sql.length && sql[i] !== '\n') i++;
        current += '\n';
        continue;
      }

      // Comentario de bloque.
      if (!quote && ch === '/' && next === '*') {
        i += 2;
        while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
        i++;
        continue;
      }

      // Apertura/cierre de cadena (los backticks identificadores también).
      if (!quote && (ch === "'" || ch === '"' || ch === '`')) {
        quote = ch;
        current += ch;
        continue;
      }
      if (quote && ch === quote) {
        // Doble comilla simple escapada ('' dentro de cadena).
        if (quote === "'" && next === "'") {
          current += "''";
          i++;
          continue;
        }
        quote = null;
        current += ch;
        continue;
      }

      if (!quote && ch === ';') {
        const trimmed = current.trim();
        if (trimmed) statements.push(trimmed);
        current = '';
        continue;
      }

      current += ch;
    }

    const last = current.trim();
    if (last) statements.push(last);
    return statements;
  }

  /** Lista las migraciones disponibles, ordenadas por su prefijo numérico. */
  static listar() {
    if (!fs.existsSync(MIGRATIONS_DIR)) return [];
    return fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.up.sql'))
      .map(f => {
        const id = f.replace(/\.up\.sql$/, '');
        const [orden, ...resto] = id.split('_');
        return { id, orden: parseInt(orden, 10) || 0, nombre: resto.join('_'), archivo: f };
      })
      .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));
  }

  static _ruta(archivo) {
    return path.join(MIGRATIONS_DIR, archivo);
  }

  static async _crearLedger() {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`migracion\` VARCHAR(190) NOT NULL,
        \`aplicada_en\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_schema_migrations\` (\`migracion\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  static async _aplicadas() {
    const filas = await sequelize.query(
      'SELECT migracion FROM schema_migrations',
      { type: QueryTypes.SELECT }
    );
    return new Set(filas.map(f => f.migracion));
  }

  /** Aplica todas las migraciones pendientes. Idempotente. */
  static async aplicarPendientes({ verbose = true } = {}) {
    await MigrationService._crearLedger();
    const aplicadas = await MigrationService._aplicadas();
    const pendientes = MigrationService.listar().filter(m => !aplicadas.has(m.id));

    if (pendientes.length === 0) {
      if (verbose) console.log('📗 Migraciones: nada pendiente.');
      return [];
    }

    const ejecutadas = [];
    for (const m of pendientes) {
      const sql = fs.readFileSync(MigrationService._ruta(m.archivo), 'utf8');
      const statements = MigrationService._splitStatements(sql);
      for (const st of statements) {
        await sequelize.query(st);
      }
      await sequelize.query(
        'INSERT IGNORE INTO schema_migrations (migracion) VALUES (?)',
        { replacements: [m.id] }
      );
      ejecutadas.push(m.id);
      if (verbose) console.log(`📗 Migración aplicada: ${m.id} (${statements.length} sentencias).`);
    }

    return ejecutadas;
  }

  /**
   * Revierte la última migración aplicada usando su script `.down.sql`.
   * @param {string|null} id - migración concreta; por defecto la última aplicada.
   */
  static async revertirUltima(id = null) {
    await MigrationService._crearLedger();
    const aplicadas = await MigrationService._aplicadas();

    let objetivo = id;
    if (!objetivo) {
      const filas = await sequelize.query(
        'SELECT migracion FROM schema_migrations ORDER BY id DESC LIMIT 1',
        { type: QueryTypes.SELECT }
      );
      objetivo = filas[0]?.migracion || null;
    }

    if (!objetivo || !aplicadas.has(objetivo)) {
      throw new Error(`No hay migración aplicada para revertir (id="${objetivo}").`);
    }

    const downFile = `${objetivo}.down.sql`;
    const ruta = MigrationService._ruta(downFile);
    if (!fs.existsSync(ruta)) {
      throw new Error(`No existe el script de reversión para "${objetivo}".`);
    }

    const statements = MigrationService._splitStatements(fs.readFileSync(ruta, 'utf8'));
    for (const st of statements) {
      await sequelize.query(st);
    }
    await sequelize.query('DELETE FROM schema_migrations WHERE migracion = ?', { replacements: [objetivo] });

    console.log(`↩️  Migración revertida: ${objetivo} (${statements.length} sentencias).`);
    return objetivo;
  }
}

module.exports = MigrationService;