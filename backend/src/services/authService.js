const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendVerificationEmail } = require('./mailer.service');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretoeduapp123';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 segundos entre reenvíos

// Almacén en memoria del último envío por correo para limitar el reenvío (entorno local).
const lastSentAt = new Map();

// El código se almacena como HMAC para no guardarlo en texto plano.
const hashCode = (code) =>
  crypto.createHmac('sha256', JWT_SECRET).update(String(code)).digest('hex');

const generateCode = () =>
  crypto.randomInt(100000, 1000000).toString(); // 6 dígitos

const generateAndStoreCode = async (user) => {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  user.emailVerificationCodeHash = hashCode(code);
  user.emailVerificationExpires = expiresAt;
  await user.save();

  await sendVerificationEmail(user.email, code);

  return { code, expiresAt };
};

const registerUser = async (userData) => {
  const { name, email, password, role } = userData;

  if (!password || password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres.');
  }

  // Verificar si el usuario ya existe
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    // Si existe una cuenta creada por un docente (estudiante) o un docente
    // que aún no verificó su correo, no permitimos duplicados.
    throw new Error('El correo ya está registrado');
  }

  // Encriptar la contraseña (hash)
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Crear el usuario en la BD (correo aún NO verificado)
  const newUser = await User.create({
    name,
    email,
    password: hashedPassword,
    role: role || 'teacher',
    emailVerified: false,
  });

  // Generar código y enviarlo al correo
  await generateAndStoreCode(newUser);

  return newUser;
};

const verifyEmail = async (email, code) => {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    throw new Error('Correo no encontrado.');
  }

  if (user.emailVerified) {
    return { alreadyVerified: true, user };
  }

  // 1. Que el código exista
  if (!user.emailVerificationCodeHash || !user.emailVerificationExpires) {
    throw new Error('El código ha expirado. Solicita un nuevo código.');
  }

  // 2. Que sea correcto
  const isCorrect = user.emailVerificationCodeHash === hashCode(String(code));
  if (!isCorrect) {
    throw new Error('El código ingresado no es correcto. Inténtalo nuevamente.');
  }

  // 3. Que no haya expirado
  if (Date.now() > new Date(user.emailVerificationExpires).getTime()) {
    throw new Error('El código ha expirado. Solicita un nuevo código.');
  }

  // 4. Marcar como verificado (de un solo uso: se limpia el código)
  user.emailVerified = true;
  user.emailVerificationCodeHash = null;
  user.emailVerificationExpires = null;
  await user.save();

  return { alreadyVerified: false, user };
};

const resendVerificationCode = async (email) => {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    throw new Error('Correo no encontrado.');
  }

  if (user.emailVerified) {
    throw new Error('Este correo ya ha sido verificado.');
  }

  // Protección contra abuso: esperar 60 segundos entre reenvíos.
  const now = Date.now();
  const prev = lastSentAt.get(email) || 0;
  if (now - prev < RESEND_COOLDOWN_MS) {
    const remaining = Math.ceil((RESEND_COOLDOWN_MS - (now - prev)) / 1000);
    const err = new Error(`Espera ${remaining} segundos antes de solicitar otro código.`);
    err.status = 429;
    throw err;
  }

  lastSentAt.set(email, now);

  // Generar un nuevo código (invalida el anterior al sobrescribir el hash)
  await generateAndStoreCode(user);

  return { email: user.email };
};

const loginUser = async (email, password) => {
  // Buscar al usuario
  const user = await User.findOne({ where: { email } });
  if (!user) {
    throw new Error('Datos inválidos');
  }

  // Verificar contraseña
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error('Datos inválidos');
  }

  // Bloquear a los docentes cuyo correo no ha sido verificado.
  // (Los estudiantes creados por un docente se consideran verificados.)
  if (user.role === 'teacher' && !user.emailVerified) {
    const err = new Error('Debe verificar su correo electrónico antes de iniciar sesión.');
    err.status = 403;
    err.code = 'EMAIL_NOT_VERIFIED';
    throw err;
  }

  // Generar Token JWT
  const token = jwt.sign(
    {
      id: user.id,
      role: user.role,
      name: user.name,
      docente_id: user.docente_id,
      iad_obligatorio: user.iad_obligatorio === true,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return { user, token };
};

module.exports = {
  registerUser,
  loginUser,
  verifyEmail,
  resendVerificationCode,
};
