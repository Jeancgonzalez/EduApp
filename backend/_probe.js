require('dotenv').config();
const path = require('path');
const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');
const Game = require('./src/models/game.model');
const Evaluation = require('./src/models/evaluation.model');
const Content = require('./src/models/content.model');
const Group = require('./src/models/grupo.model');
require('./src/models/associations');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('DB OK');
    const teacher = await User.findOne({ where: { email: 'jeancar1616@hotmail.com' }, raw: true });
    if (!teacher) { console.log('DOCENTE NO ENCONTRADO'); process.exit(0); }
    console.log('Docente:', teacher.id, teacher.name, 'role=', teacher.role, 'verified=', teacher.emailVerified);

    const [ng, ne, nc] = await Promise.all([
      Game.count({ where: { publicado: true, docente_id: teacher.id } }),
      Evaluation.count({ where: { publicado: true, docente_id: teacher.id } }),
      Content.count({ where: { publicado: true, docente_id: teacher.id } }),
    ]);
    console.log('Publicados:', { juegos: ng, evaluaciones: ne, contenidos: nc });

    const games = await Game.findAll({ where: { publicado: true, docente_id: teacher.id }, attributes: ['id', 'titulo', 'modulo', 'grupo_id', 'puntaje_max'], raw: true, order: [['modulo', 'ASC'], ['id', 'ASC']] });
    const evals = await Evaluation.findAll({ where: { publicado: true, docente_id: teacher.id }, attributes: ['id', 'titulo', 'modulo', 'grupo_id'], raw: true, order: [['modulo', 'ASC'], ['id', 'ASC']] });
    const contents = await Content.findAll({ where: { publicado: true, docente_id: teacher.id }, attributes: ['id', 'titulo', 'modulo', 'grupo_id'], raw: true, order: [['modulo', 'ASC'], ['id', 'ASC']] });
    console.log('\n--- JUEGOS ---');
    games.forEach(g => console.log(`[${g.id}] mod=${g.modulo} grupo=${g.grupo_id ?? 'NULL'} max=${g.puntaje_max} | ${g.titulo}`));
    console.log('\n--- EVALUACIONES ---');
    evals.forEach(e => console.log(`[${e.id}] mod=${e.modulo} grupo=${e.grupo_id ?? 'NULL'} | ${e.titulo}`));
    console.log('\n--- CONTENIDOS ---');
    contents.forEach(c => console.log(`[${c.id}] mod=${c.modulo} grupo=${c.grupo_id ?? 'NULL'} | ${c.titulo}`));

    const groups = await Group.findAll({ where: { docente_id: teacher.id }, raw: true });
    console.log('\n--- GRUPOS ---');
    groups.forEach(g => console.log(`[${g.id}] ${g.materia} - ${g.nombre}`));

    const students = await User.findAll({ where: { role: 'student', docente_id: teacher.id }, attributes: ['id', 'name', 'email'], raw: true });
    console.log('\nEstudiantes actuales:', students.length);
    students.slice(0, 20).forEach(s => console.log(`  [${s.id}] ${s.name} <${s.email}>`));
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await sequelize.close().catch(() => {});
    process.exit(0);
  }
})();