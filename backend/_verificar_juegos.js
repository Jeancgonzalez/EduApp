require('dotenv').config();
const { sequelize } = require('./src/config/database');
const Game = require('./src/models/game.model');
require('./src/models/associations');

(async () => {
  try {
    await sequelize.authenticate();
    const juegos = await Game.findAll({ where: { docente_id: 17 }, order: [['id', 'DESC']], limit: 5, raw: true });
    for (const j of juegos) {
      const c = typeof j.configuracion === 'string' ? JSON.parse(j.configuracion) : j.configuracion;
      let detalle = '';
      if (j.tipo === 'crucigrama') {
        const filas = c.tablero.length;
        const cols = c.tablero[0]?.length || 0;
        const activas = c.tablero.flat().filter(x => x && x !== '#').length;
        detalle = `tablero ${filas}x${cols}, celdas activas=${activas}, pistas=${c.pistas?.length}, palabras=${c.palabras?.length}`;
      } else if (j.tipo === 'memoria' || j.tipo === 'relacionar') {
        detalle = `pares=${c.pares?.length}`;
      } else if (j.tipo === 'adivinanza') {
        detalle = `respuestaCorrecta=${c.respuestaCorrecta}, opciones=${['A','B','C'].filter(l => c['opcion' + l]).length}`;
      }
      console.log(`id=${j.id} | ${j.titulo} | tipo=${j.tipo} | publicado=${j.publicado} | puntaje_max=${j.puntaje_max} | modulo_content_id=${j.modulo_content_id} | ${detalle}`);
    }
    await sequelize.close();
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();