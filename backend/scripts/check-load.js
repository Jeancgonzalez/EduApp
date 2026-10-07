/**
 * Comprobación de que todos los módulos del backend cargan sin errores de
 * sintaxis, rutas require inválidas o colisiones de require.
 * No abre conexión: solo instancia los modelos Sequelize.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dirs = ['src', 'scripts', 'test'];

const archivos = [];
const recorrer = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p);
    else if (/\.(js|mjs|cjs)$/.test(e.name) && !e.name.startsWith('_')) archivos.push(p);
  }
};
dirs.forEach(d => recorrer(path.join(ROOT, d)));

// Los tests .test.mjs se cargan por vitest, no por node.
// server.js queda fuera: al cargarlo arranca el servidor y el pool de MySQL.
const aCargar = archivos.filter(f =>
  !/\.test\.m?js$/.test(f) &&
  !f.includes(`${path.sep}_`) &&
  !f.endsWith(`${path.sep}server.js`)
);

let fallos = 0;
for (const f of aCargar) {
  try {
    require(f);
    console.log('OK   ' + path.relative(ROOT, f));
  } catch (error) {
    fallos++;
    console.log('FAIL ' + path.relative(ROOT, f) + '  ->  ' + error.message);
  }
}

console.log(fallos === 0
  ? `\n✔ ${aCargar.length} módulos cargan correctamente`
  : `\n✖ ${fallos} de ${aCargar.length} módulos fallan`);
process.exit(fallos === 0 ? 0 : 1);