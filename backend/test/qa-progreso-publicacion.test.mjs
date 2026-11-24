import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv/config');
require('../src/models/associations.js');

const User = require('../src/models/User.js');
const Content = require('../src/models/content.model.js');
const Evaluation = require('../src/models/evaluation.model.js');
const Progress = require('../src/models/progress.model.js');
const StudentProgress = require('../src/models/studentProgress.model.js');
const ContentService = require('../src/services/content.service.js');
const TeacherController = require('../src/controllers/teacher.controller.js');
const { sequelize } = require('../src/config/database.js');

const MODULO = `QA Módulo Publicación ${Date.now()}`;

let teacher;
let student;
let content;
let evaluation;

beforeAll(async () => {
  const sufijo = `${Date.now()}_${Math.round(Math.random() * 1e6)}`;
  teacher = await User.create({
    name: 'QA Docente Publicación',
    email: `qa_pub_doc_${sufijo}@eduapp.test`,
    password: 'x',
    role: 'teacher',
    emailVerified: true,
  });
  student = await User.create({
    name: 'QA Estudiante Publicación',
    email: `qa_pub_est_${sufijo}@eduapp.test`,
    password: 'x',
    role: 'student',
    docente_id: teacher.id,
    emailVerified: true,
    iad_obligatorio: false,
  });
  content = await Content.create({
    titulo: 'Contenido QA Publicación',
    tipo: 'texto',
    contenido: 'https://example.test/contenido',
    modulo: MODULO,
    docente_id: teacher.id,
    publicado: true,
  });
  evaluation = await Evaluation.create({
    titulo: 'Evaluación QA Publicación',
    modulo: MODULO,
    modulo_content_id: content.id,
    docente_id: teacher.id,
    publicado: true,
    requiere_contenido_apoyo: false,
  });
  await StudentProgress.create({
    estudiante_id: student.id,
    evaluacion_id: evaluation.id,
    completado: true,
    puntaje: 80,
  });
  await Progress.create({
    usuario_id: student.id,
    modulo: MODULO,
    puntaje_total: 80,
    nivel: 2,
    porcentaje_avance: 100,
  });
});

afterAll(async () => {
  await StudentProgress.destroy({ where: { estudiante_id: student.id } });
  await Progress.destroy({ where: { usuario_id: student.id } });
  await Evaluation.destroy({ where: { id: evaluation.id } });
  await Content.destroy({ where: { id: content.id } });
  await User.destroy({ where: { id: [teacher.id, student.id] } });
  await sequelize.close();
});

describe('Publicación de contenido y progreso del módulo', () => {
  it('al republicar el contenido restaura su evaluación y el puntaje del módulo', async () => {
    await ContentService.actualizarContenido(content.id, { publicado: false }, teacher.id);

    const evalDespublicada = await Evaluation.findByPk(evaluation.id);
    expect(evalDespublicada.publicado).toBe(false);
    const progresoDespublicado = await Progress.findOne({
      where: { usuario_id: student.id, modulo: MODULO },
    });
    expect(progresoDespublicado.puntaje_total).toBe(0);

    await ContentService.actualizarContenido(content.id, { publicado: true }, teacher.id);

    const evalRepublicada = await Evaluation.findByPk(evaluation.id);
    expect(evalRepublicada.publicado).toBe(true);
    const progresoRepublicado = await Progress.findOne({
      where: { usuario_id: student.id, modulo: MODULO },
    });
    expect(progresoRepublicado.puntaje_total).toBe(80);
  }, 30000);

  it('la nota del módulo se calcula con los intentos y no con el caché `progreso`', async () => {
    await Progress.update(
      { puntaje_total: 0 },
      { where: { usuario_id: student.id, modulo: MODULO } }
    );

    const filas = await TeacherController._obtenerDatosProgresoModulos(teacher.id);
    const fila = filas.find((f) => f.id === student.id);
    const modulo = fila.modules.find((m) => m.modulo === MODULO);

    expect(modulo.puntaje_total).toBe(80);
    expect(modulo.puntaje_max).toBe(100);
    expect(modulo.nota).toBe(4);
    expect(modulo.categoria).toBe('bueno');
  }, 30000);
});
