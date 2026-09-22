import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv/config');

const request = require('supertest');
const app = require('../../src/app.js');
const User = require('../../src/models/User.js');
const Content = require('../../src/models/content.model.js');
const Game = require('../../src/models/game.model.js');
const Evaluation = require('../../src/models/evaluation.model.js');
const Question = require('../../src/models/question.model.js');
const StudentProgress = require('../../src/models/studentProgress.model.js');

const api = request(app);

let seq = 0;
function unique(prefix) {
  seq += 1;
  return `${prefix}${Date.now()}_${seq}`;
}

async function login(email, password) {
  const res = await api.post('/api/auth/login').send({ email, password });
  return {
    res,
    token: res.body?.data?.token,
    user: res.body?.data?.user,
  };
}

async function registerTeacher({ name, email, password }) {
  return api
    .post('/api/auth/register')
    .send({ name, email, password, role: 'teacher' });
}

async function registerStudentByTeacher(teacherToken, { name, email, password }) {
  return api
    .post('/api/cuentas/register')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ name, email, password });
}

async function makeTeacher() {
  const email = unique('qa_doc@EduApp.com');
  const name = 'QA Docente';
  const password = 'pass1234';
  const registerRes = await registerTeacher({ name, email, password });
  const { token, user } = await login(email, password);
  return { teacherEmail: email, teacherName: name, password, userId: user?.id, token, registerRes };
}

async function makeStudent() {
  const teacher = await makeTeacher();
  const email = unique('qa_est@EduApp.com');
  const name = 'QA Estudiante';
  const password = 'pass1234';
  const studentReg = await registerStudentByTeacher(teacher.token, { name, email, password });
  const { token, user } = await login(email, password);
  return {
    ...teacher,
    studentEmail: email,
    studentName: name,
    studentId: user?.id,
    studentToken: token,
    studentReg,
  };
}

async function createPublishedContent(teacherToken, { titulo, modulo, docenteId }) {
  const res = await api
    .post('/api/contenidos')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ titulo, tipo: 'video', contenido: 'https://www.youtube.com/watch?v=qa123', modulo, publicado: true, docente_id: docenteId });
  return res;
}

async function markContentCompleted(studentToken, contenidoId) {
  const res = await api
    .post(`/api/student/contenidos/${contenidoId}/acceder`)
    .set('Authorization', `Bearer ${studentToken}`);
  return res;
}

async function cleanupUsers(emails) {
  for (const e of emails) {
    await User.destroy({ where: { email: e } }).catch(() => {});
  }
}

export {
  api,
  app,
  login,
  unique,
  makeTeacher,
  makeStudent,
  createPublishedContent,
  markContentCompleted,
  cleanupUsers,
  User,
  Content,
  Game,
  Evaluation,
  Question,
  StudentProgress,
};
