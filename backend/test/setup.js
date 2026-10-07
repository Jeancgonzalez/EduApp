/**
 * Carga de entorno para la suite de pruebas.
 *
 * Sin esto, los testslevantan la app sin variables de conexión y todos los
 * endpoints que tocan la base responden 500 con
 * "Access denied for user ''@'localhost'". El proceso de vitest no carga
 * `.env` por sí solo (solo lo hacía `src/server.js`, que los tests no levantan).
 */
require('dotenv').config();