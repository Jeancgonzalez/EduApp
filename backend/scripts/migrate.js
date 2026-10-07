#!/usr/bin/env node
/**
 * CLI de migraciones del backend.
 *
 *   npm run migrate                     Aplica las pendientes
 *   npm run migrate:status              Lista aplicadas y pendientes
 *   npm run migrate:down                Revierte la última aplicada
 *   npm run migrate:down -- <id>        Revierte una migración concreta
 *
 * Requiere la base de datos levantada (las mismas variables de `.env` que el
 * servidor: DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT).
 */

require('dotenv').config();
const { testConnection } = require('../src/config/database');
const MigrationService = require('../src/services/migration.service');
const { sequelize } = require('../src/config/database');

const [, , comando = 'up', ...resto] = process.argv;

(async () => {
  try {
    await testConnection();

    if (comando === 'up') {
      const aplicadas = await MigrationService.aplicarPendientes();
      if (aplicadas.length === 0) {
        console.log('✔ No hay migraciones pendientes.');
      }
    } else if (comando === 'down') {
      const id = resto[0] || null;
      await MigrationService.revertirUltima(id);
    } else if (comando === 'status') {
      await MigrationService._crearLedger();
      const aplicadas = await MigrationService._aplicadas();
      const todas = MigrationService.listar();
      if (todas.length === 0) {
        console.log('(no hay migraciones en migrations/)');
      }
      for (const m of todas) {
        const marca = aplicadas.has(m.id) ? '✔ aplicada ' : '– pendiente';
        console.log(`${marca}  ${m.id}`);
      }
    } else {
      console.error(`Comando desconocido: "${comando}". Usa: up | down | status`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('❌ Error en migraciones:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
})();