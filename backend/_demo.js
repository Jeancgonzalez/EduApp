require('dotenv').config();
const { sequelize } = require('./src/config/database');
const Game = require('./src/models/game.model');
const Evaluation = require('./src/models/evaluation.model');
const Progress = require('./src/models/progress.model');
const NotaService = require('./src/services/nota.service');
require('./src/models/associations');

(async () => {
  try {
    await sequelize.authenticate();
    const MODULO = 'Introducción a la informática';

    // 1) maximaPuntuacion EN ENTORNO REAL
    const juego = await Game.findByPk(361, { raw: true });
    const evalRow = await Evaluation.findByPk(202, { raw: true });
    const juegoPts = juego ? juego.puntaje_max : 0;
    const evalPts = 100; // la evaluación cuenta como 100 pts, no usa puntaje_max propio
    const max = NotaService.maximaPuntuacion(juego ? [{ puntaje_max: juegoPts }] : [], evalRow ? [{}] : []);
    console.log('=== maximaPuntuacion(juegos, evaluaciones) ===');
    console.log(`  juego 361  -> puntaje_max = ${juegoPts}`);
    console.log(`  eval  202  -> cuenta como = ${evalPts}`);
    console.log(`  contenido 225 -> no puntúa (0), no participa`);
    console.log(`  => maximaPuntuacion([{puntaje_max:${juegoPts}}], [{}]) = ${juegoPts} + 100×${1} = ${max} pts\n`);

    // 2) calcularNota EN ENTORNO REAL
    console.log('=== calcularNota(obtenido, max=200)  [ronda a 1 decimal, piso 1.0] ===');
    const casos = [
      { email: 'jean.demo-jean.01@test.com', note: 'Carlos: nada completado (0 pts)' },
      { email: 'jean.demo-jean.07@test.com', note: 'Valentina: 100+40 = 140 pts' },
      { email: 'jean.demo-jean.06@test.com', note: 'Dylan: 65+70 = 135 pts' },
      { email: 'jean.demo-jean.15@test.com', note: 'Antonella: 100+100 = 200 pts' },
    ];
    for (const c of casos) {
      const prog = await Progress.findOne({ where: { modulo: MODULO } }).catch(() => null);
      void prog;
      const rows = await sequelize.query(
        `SELECT u.email, p.puntaje_total FROM progreso p JOIN users u ON u.id = p.usuario_id WHERE p.modulo = ? AND u.email = ?`,
        { replacements: [MODULO, c.email], type: sequelize.QueryTypes.SELECT }
      );
      const total = rows.length ? rows[0].puntaje_total : null;
      const nota = total == null ? null : NotaService.calcularNota(total, max);
      console.log(`${c.note.padEnd(40)} obtenido=${String(total).padStart(3)}  ->  (${total}/${max})×5 = ${((total / max) * 5).toFixed(3)}  ->  nota=${nota}`);
    }

    // Caso especial: piso 1.0 (0 pts -> 0.0, pero clamp fuerza 1.0)
    const cero = NotaService.calcularNota(0, 200);
    console.log(`\nPiso: calcularNota(0, 200) -> clamp(0.0, 1.0, 5.0) -> ${cero}`);

    // Caso null: sin recursos puntuables
    const sinRecursos = NotaService.calcularNota(80, 0);
    console.log(`Sin recursos: calcularNota(80, 0) -> ${sinRecursos}`);
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await sequelize.close().catch(() => {});
    process.exit(0);
  }
})();