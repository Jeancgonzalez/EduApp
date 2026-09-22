const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || '';
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '465', 10);

// Si no hay credenciales SMTP configuradas, el envío se simula en consola
// (permitiendo el desarrollo y las pruebas locales sin credenciales reales).
const mailConfigured = Boolean(EMAIL_USER && EMAIL_PASSWORD);

let transporter = null;

if (mailConfigured) {
  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT === 465,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASSWORD,
    },
  });
}

// Envía un correo usando el transportador configurado. Si no hay SMTP,
// simula el envío mostrando los datos en la consola (modo prueba local).
const sendMail = async (to, subject, text, html) => {
  if (!mailConfigured) {
    console.log('\n[EduApp Mailer] MODO PRUEBA (sin SMTP configurado). Email NO enviado realmente.');
    console.log(`[EduApp Mailer] Para: ${to}`);
    console.log(`[EduApp Mailer] Asunto: ${subject}`);
    if (text) console.log(`[EduApp Mailer] Texto:\n${text}\n`);
    return { devMode: true, to };
  }

  console.log(`[EduApp Mailer] Enviando email real vía ${EMAIL_HOST}:${EMAIL_PORT}...`);
  console.log(`[EduApp Mailer] Para: ${to} | Asunto: ${subject}`);
  const t0 = Date.now();

  try {
    const info = await transporter.sendMail({
      from: `"EduApp" <${EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
    console.log(`[EduApp Mailer] ✅ Email enviado. MessageId: ${info.messageId} (${Date.now() - t0}ms)`);
    return { devMode: false, info };
  } catch (err) {
    console.error(`[EduApp Mailer] ❌ FALLÓ el envío de email a ${to}:`);
    console.error(`[EduApp Mailer] Error type: ${err.name}`);
    console.error(`[EduApp Mailer] Error message: ${err.message}`);
    if (err.code) console.error(`[EduApp Mailer] Error code: ${err.code}`);
    console.error(err);
    throw err;
  }
};

const sendVerificationEmail = async (to, code) => {
  const subject = 'Verifica tu correo electrónico - EduApp';
  const text =
    `Hola,` +
    `\n\nGracias por registrarte en EduApp.` +
    `\n\nTu código de verificación es:` +
    `\n\n${code}` +
    `\n\nEste código es válido durante 10 minutos.` +
    `\n\nSi no realizaste este registro, puedes ignorar este mensaje.` +
    `\n\nSaludos,` +
    `\nEquipo EduApp`;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#f4f7f6; padding:24px; border-radius:12px; max-width:480px; margin:0 auto;">
      <div style="background:#ffffff; border-radius:12px; padding:28px; text-align:center; border:1px solid #e5e7eb;">
        <h2 style="margin:0 0 8px; color:#111827;">Verifica tu correo electrónico</h2>
        <p style="color:#6b7280; margin:0 0 20px;">Gracias por registrarte en EduApp.</p>
        <p style="color:#374151; margin:0 0 8px;">Tu código de verificación es:</p>
        <div style="font-size:32px; font-weight:700; letter-spacing:8px; color:#2563eb; background:#eff6ff; border-radius:8px; padding:12px; margin:12px 0;">${code}</div>
        <p style="color:#9ca3af; font-size:13px; margin:12px 0 0;">Este código es válido durante 10 minutos.</p>
        <p style="color:#9ca3af; font-size:13px; margin:12px 0 0;">Si no realizaste este registro, puedes ignorar este mensaje.</p>
        <p style="color:#111827; margin:20px 0 0;">Saludos,<br/><strong>Equipo EduApp</strong></p>
      </div>
    </div>
  `;

  return sendMail(to, subject, text, html);
};

// Plantilla base para los correos de notificación/aviso.
const notificationWrapper = (title, innerHtml) => `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#f4f7f6; padding:24px; border-radius:12px; max-width:520px; margin:0 auto;">
    <div style="background:#ffffff; border-radius:12px; padding:28px; border:1px solid #e5e7eb;">
      <div style="text-align:center; margin-bottom:20px;">
        <div style="font-size:20px; font-weight:700; color:#007bff;">EduApp</div>
        <div style="color:#9ca3af; font-size:13px;">Plataforma educativa</div>
      </div>
      ${innerHtml}
      <p style="color:#6b7280; margin:20px 0 0;">Saludos,<br/><strong>Equipo EduApp</strong></p>
    </div>
  </div>
`;

const sendNewContentEmail = async (studentName, to, tituloContenido, modulo) => {
  const subject = 'Nuevo contenido disponible en EduApp';
  const text =
    `Hola ${studentName},` +
    `\n\nTu docente ha publicado un nuevo contenido en EduApp.` +
    `\n\nContenido:` +
    `\n"${tituloContenido}"` +
    `\n\nMódulo:` +
    `\n"${modulo}"` +
    `\n\nIngresa a EduApp para consultar el contenido y continuar aprendiendo.` +
    `\n\nSaludos,` +
    `\nEquipo EduApp`;

  const html = notificationWrapper('', `
    <h2 style="margin:0 0 12px; color:#111827;">Hola ${studentName},</h2>
    <p style="color:#374151; margin:0 0 16px;">Tu docente ha publicado un nuevo contenido en EduApp.</p>
    <p style="color:#374151; margin:0 0 4px;">Contenido:</p>
    <p style="font-weight:700; color:#111827; margin:0 0 12px;">"${tituloContenido}"</p>
    <p style="color:#374151; margin:0 0 4px;">Módulo:</p>
    <p style="font-weight:700; color:#111827; margin:0 0 16px;">"${modulo}"</p>
    <p style="color:#374151; margin:0;">Ingresa a EduApp para consultar el contenido y continuar aprendiendo.</p>
  `);

  return sendMail(to, subject, text, html);
};

const sendNewEvaluationEmail = async (studentName, to, tituloEvaluacion, modulo) => {
  const subject = 'Nueva evaluación disponible en EduApp';
  const text =
    `Hola ${studentName},` +
    `\n\nTu docente ha publicado una nueva evaluación.` +
    `\n\nEvaluación:` +
    `\n"${tituloEvaluacion}"` +
    `\n\nMódulo:` +
    `\n"${modulo}"` +
    `\n\nIngresa a EduApp para realizarla.` +
    `\nRecuerda revisar primero el contenido de apoyo si la evaluación lo requiere.` +
    `\n\nSaludos,` +
    `\nEquipo EduApp`;

  const html = notificationWrapper('', `
    <h2 style="margin:0 0 12px; color:#111827;">Hola ${studentName},</h2>
    <p style="color:#374151; margin:0 0 16px;">Tu docente ha publicado una nueva evaluación.</p>
    <p style="color:#374151; margin:0 0 4px;">Evaluación:</p>
    <p style="font-weight:700; color:#111827; margin:0 0 12px;">"${tituloEvaluacion}"</p>
    <p style="color:#374151; margin:0 0 4px;">Módulo:</p>
    <p style="font-weight:700; color:#111827; margin:0 0 16px;">"${modulo}"</p>
    <p style="color:#374151; margin:0;">Ingresa a EduApp para realizarla.</p>
    <p style="color:#9ca3af; font-size:13px; margin:6px 0 0;">Recuerda revisar primero el contenido de apoyo si la evaluación lo requiere.</p>
  `);

  return sendMail(to, subject, text, html);
};

const sendNewGameEmail = async (studentName, to, tituloJuego, modulo) => {
  const subject = 'Nuevo juego disponible en EduApp';
  const text =
    `Hola ${studentName},` +
    `\n\nTu docente ha publicado un nuevo juego educativo.` +
    `\n\nJuego:` +
    `\n"${tituloJuego}"` +
    `\n\nMódulo:` +
    `\n"${modulo}"` +
    `\n\nIngresa a EduApp y demuestra lo que has aprendido.` +
    `\n¡Diviértete aprendiendo!` +
    `\n\nSaludos,` +
    `\nEquipo EduApp`;

  const html = notificationWrapper('', `
    <h2 style="margin:0 0 12px; color:#111827;">Hola ${studentName},</h2>
    <p style="color:#374151; margin:0 0 16px;">Tu docente ha publicado un nuevo juego educativo.</p>
    <p style="color:#374151; margin:0 0 4px;">Juego:</p>
    <p style="font-weight:700; color:#111827; margin:0 0 12px;">"${tituloJuego}"</p>
    <p style="color:#374151; margin:0 0 4px;">Módulo:</p>
    <p style="font-weight:700; color:#111827; margin:0 0 16px;">"${modulo}"</p>
    <p style="color:#374151; margin:0;">Ingresa a EduApp y demuestra lo que has aprendido.</p>
    <p style="color:#374151; margin:6px 0 0;">¡Diviértete aprendiendo!</p>
  `);

  return sendMail(to, subject, text, html);
};

const sendProgressReportEmail = async (studentName, to, reportDate, modulesHtml, overallProgress) => {
  const subject = 'Reporte de progreso - EduApp';
  const text =
    `REPORTE DE PROGRESO - EDUAPP` +
    `\n\nEstudiante: ${studentName}` +
    `\nFecha del reporte: ${reportDate}` +
    `\n\nSigue aprendiendo y mejorando!` +
    `\n\nEduApp`;

  const html = notificationWrapper('', `
    <h2 style="margin:0 0 8px; color:#111827; text-align:center; text-transform:uppercase;">Reporte de Progreso</h2>
    <p style="color:#9ca3af; font-size:13px; text-align:center; margin:0 0 20px;">EduApp</p>
    <div style="background:#f8fafc; border-radius:8px; padding:14px 16px; margin-bottom:20px;">
      <p style="margin:0 0 6px; color:#4b5563;"><strong>Estudiante:</strong> ${studentName}</p>
      <p style="margin:0; color:#4b5563;"><strong>Fecha del reporte:</strong> ${reportDate}</p>
    </div>
    ${modulesHtml}
    <div style="background:#eff6ff; border-radius:8px; padding:14px 16px; text-align:center; margin-top:20px;">
      <p style="margin:0; color:#2563eb; font-weight:700;">Progreso general: ${overallProgress}%</p>
    </div>
    <p style="color:#111827; text-align:center; margin:20px 0 0; font-weight:600;">"¡Sigue aprendiendo y mejorando!"</p>
  `);

  return sendMail(to, subject, text, html);
};

const sendStudentWelcomeEmail = async (studentName, to, email, password) => {
  const subject = 'Bienvenido a EduApp - Acceso a tu cuenta';
  const text =
    `Hola ${studentName},` +
    `\n\nTu docente ha creado tu cuenta en EduApp.` +
    `\n\nTus credenciales de acceso son:` +
    `\n\nCorreo: ${email}` +
    `\nContraseña: ${password}` +
    `\n\nIngresa a EduApp para comenzar a aprender.` +
    `\n\nSaludos,` +
    `\nEquipo EduApp`;

  const html = notificationWrapper('', `
    <h2 style="margin:0 0 8px; color:#111827;">¡Hola ${studentName}!</h2>
    <p style="color:#374151; margin:0 0 16px;">Tu docente ha creado tu cuenta en EduApp.</p>
    <div style="background:#f8fafc; border-radius:8px; padding:14px 16px; margin:0 0 16px; border:1px solid #e5e7eb;">
      <p style="margin:0 0 6px; color:#4b5563;"><strong>Correo:</strong> ${email}</p>
      <p style="margin:0; color:#4b5563;"><strong>Contraseña:</strong> ${password}</p>
      <p style="margin:10px 0 0; color:#9ca3af; font-size:13px;">Te recomendamos cambiar tu contraseña en tu primer ingreso.</p>
    </div>
    <p style="color:#374151; margin:0;">Ingresa a EduApp para comenzar a aprender. ¡Bienvenido!</p>
  `);

  return sendMail(to, subject, text, html);
};

const sendGroupAssignedEmail = async (studentName, to, nombreGrupo, materia) => {
  const subject = 'Has sido asignado a un grupo en EduApp';
  const text =
    `Hola ${studentName},` +
    `\n\nTu docente te ha asignado al siguiente grupo en EduApp:` +
    `\n\nMateria: ${materia}` +
    `\nGrupo: ${nombreGrupo}` +
    `\n\nDesde ahora podrás acceder a los contenidos, juegos y evaluaciones de este grupo.` +
    `\n\nSaludos,` +
    `\nEquipo EduApp`;

  const html = notificationWrapper('', `
    <h2 style="margin:0 0 8px; color:#111827;">¡Hola ${studentName}!</h2>
    <p style="color:#374151; margin:0 0 16px;">Tu docente te ha asignado a un nuevo grupo en EduApp.</p>
    <div style="background:#f8fafc; border-radius:8px; padding:14px 16px; margin:0 0 16px; border:1px solid #e5e7eb;">
      <p style="margin:0 0 6px; color:#4b5563;"><strong>Materia:</strong> ${materia}</p>
      <p style="margin:0; color:#4b5563;"><strong>Grupo:</strong> ${nombreGrupo}</p>
    </div>
    <p style="color:#374151; margin:0;">Desde ahora podrás acceder a los contenidos, juegos y evaluaciones de este grupo.</p>
  `);

  return sendMail(to, subject, text, html);
};

module.exports = {
  sendVerificationEmail,
  sendNewContentEmail,
  sendNewEvaluationEmail,
  sendNewGameEmail,
  sendProgressReportEmail,
  sendStudentWelcomeEmail,
  sendGroupAssignedEmail,
  sendMail,
  mailConfigured,
};
