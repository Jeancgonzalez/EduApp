import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv/config');

const request = require('supertest');
const app = require('../../src/app.js');
// `src/server.js` carga las asociaciones antes de atender peticiones, pero los
// tests no levantan el server: sin esto, cualquier consulta con `include` a
// Group/Content falla con 500 "Group is not associated to Content!".
require('../../src/models/associations.js');
const User = require('../../src/models/User.js');
const Content = require('../../src/models/content.model.js');
const Game = require('../../src/models/game.model.js');
const Evaluation = require('../../src/models/evaluation.model.js');
const Question = require('../../src/models/question.model.js');
const StudentProgress = require('../../src/models/studentProgress.model.js');
const ActividadIntento = require('../../src/models/actividadIntento.model.js');

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

async function registerStudentByTeacher(teacherToken, { name, email, password, iadObligatorio }) {
  return api
    .post('/api/cuentas/register')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ name, email, password, ...(iadObligatorio === undefined ? {} : { iadObligatorio }) });
}

/**
 * Crea un docente verificado y con token, más un estudiante a su nombre.
 *
 * El estudiante se registra con `iadObligatorio: false` porque
 * `cuentas.service.js` lo activa por defecto y el middleware
 * `requerirMisionCompletada` bloquea todas las rutas `/api/student/*` con 403
 * ("Debes completar la Misión Digital...") hasta que se termine el diagnóstico.
 * Estos tests miden progreso, juegos y evaluaciones, no la Misión Digital.
 */
async function makeStudent() {
  const teacher = await makeTeacher();
  const email = unique('qa_est@EduApp.com');
  const name = 'QA Estudiante';
  const password = 'pass1234';
  const studentReg = await registerStudentByTeacher(teacher.token, { name, email, password, iadObligatorio: false });
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

/**
 * Completa la verificación de correo leyendo el código que llegó a MailHog.
 *
 * `loginUser` bloquea al docente mientras `emailVerified` sea false, así que sin
 * este paso `makeTeacher()` devolvía `token: undefined` y todas las peticiones
 * posteriores iban con `Bearer undefined` (403). Verificar por el camino real
 * —registro → correo → verify-email— mantiene la prueba de extremo a extremo en
 * lugar de parchear la base de datos.
 */
const MAILHOG_API = process.env.MAILHOG_API || 'http://localhost:8025';

// MailHog entrega `To` como `[{ Mailbox, Domain }]`, no como strings.
function destinatarios(item) {
  return [].concat(item.To || []).map((t) => {
    if (typeof t === 'string') return t;
    if (t.Mailbox && t.Domain) return `${t.Mailbox}@${t.Domain}`;
    return JSON.stringify(t);
  });
}

// Margen generoso: la suite completa crea muchos docentes y MailHog responde
// cada vez más lento según crece la bandeja (por eso `global-setup.js` la
// vacía). Con 6x400 ms saltaba el `beforeAll` bajo carga; 12x500 ms da 6 s de
// margen real, muy por debajo del `hookTimeout` de 60 s.
async function fetchVerificationCode(email, { retries = 12, delayMs = 500 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const res = await fetch(`${MAILHOG_API}/api/v2/search?kind=to&query=${encodeURIComponent(email)}`);
    if (res.ok) {
      const data = await res.json();
      // La v2 de MailHog devuelve `items`; se acepta `messages` por compatibilidad.
      const items = data.items || data.messages || [];
      for (const item of items) {
        const para = destinatarios(item).join(' ');
        const body = (item.Content && item.Content.Body) || '';
        if (!para.toLowerCase().includes(email.toLowerCase())) continue;
        // El cuerpo llega en quoted-printable, pero los dígitos van intactos.
        const match = body.match(/\b(\d{6})\b/);
        if (match) return match[1];
      }
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `No se encontró el código de verificación de ${email} en MailHog (${MAILHOG_API}). ` +
      '¿Está MailHog encendido? Sin él los tests de docente no pueden iniciar sesión.'
  );
}

async function verifyEmailViaMailhog(email) {
  const code = await fetchVerificationCode(email);
  const res = await api.post('/api/auth/verify-email').send({ email, code });
  if (res.status !== 200) {
    throw new Error(`No se pudo verificar ${email}: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  return code;
}

/**
 * Crea un docente verificado sin pasar por el correo.
 *
 * `makeTeacher()` recorre registro → MailHog → verify-email, que es el camino
 * real pero depende de un servicio externo (MailHog). Los tests que solo miden
 * el panel analítico no necesitan comprobar el correo, así que aquí se inserta
 * el usuario ya verificado y se entra por el endpoint de login de verdad: el
 * token, los middleware y la autorización siguen recorriendo el código real,
 * lo único que se acorta es el envío del código.
 *
 * Los datos se insertan con el mismo modelo que usa el registro, de modo que si
 * el esquema cambiara el test fallaría aquí y no con un error de columna
 * fantasma más adelante.
 */
async function makeDocenteVerificado() {
  const bcrypt = require('bcryptjs');
  const email = unique('qa_doc@EduApp.com');
  const name = 'QA Docente';
  const password = 'pass1234';

  const user = await User.create({
    name,
    email,
    password: await bcrypt.hash(password, 10),
    role: 'teacher',
    emailVerified: true,
  });

  const { token, user: logged } = await login(email, password);
  return { teacherEmail: email, teacherName: name, password, userId: user.id, token, user: logged };
}

/**
 * Crea un docente verificado (vía MailHog) y con token listo para usar.
 */
async function makeTeacher() {
  const email = unique('qa_doc@EduApp.com');
  const name = 'QA Docente';
  const password = 'pass1234';
  const registerRes = await registerTeacher({ name, email, password });
  await verifyEmailViaMailhog(email);
  const { token, user } = await login(email, password);
  return { teacherEmail: email, teacherName: name, password, userId: user?.id, token, registerRes };
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
  registerTeacher,
  registerStudentByTeacher,
  makeTeacher,
  makeDocenteVerificado,
  makeStudent,
  verifyEmailViaMailhog,
  fetchVerificationCode,
  createPublishedContent,
  markContentCompleted,
  cleanupUsers,
  User,
  Content,
  Game,
  Evaluation,
  Question,
  StudentProgress,
  ActividadIntento,
};
