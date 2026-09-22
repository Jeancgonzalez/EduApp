const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const User = require('../models/User');
const Progress = require('../models/progress.model');
const StudentProgress = require('../models/studentProgress.model');
const DiagnosticoAplicacion = require('../models/diagnosticoAplicacion.model');
const { sendStudentWelcomeEmail } = require('./mailer.service');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = crypto.scryptSync(
  process.env.JWT_SECRET || 'supersecretoeduapp123',
  'eduapp-salt',
  32
);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encrypted = parts.join(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

class CuentasService {
  static async getStudentsByTeacher(teacherId) {
    const students = await User.findAll({
      where: { role: 'student', docente_id: teacherId },
      attributes: ['id', 'name', 'email', 'createdAt', 'password_encrypted', 'iad_obligatorio'],
      raw: true
    });

    if (students.length === 0) {
      return [];
    }

    // IAD-Primaria completado por cada estudiante (para la etiqueta del docente).
    // Solo se muestran aplicaciones terminadas; las "en_progreso" no generan etiqueta.
    const aplicaciones = await DiagnosticoAplicacion.findAll({
      where: {
        estudiante_id: students.map(s => s.id),
        estado: 'completado',
      },
      order: [['id', 'DESC']],
      raw: true,
    });
    const ultimoPorEstudiante = new Map();
    for (const a of aplicaciones) {
      if (!ultimoPorEstudiante.has(a.estudiante_id)) {
        const parsed = a;
        if (typeof parsed.desglose === 'string') {
          try {
            parsed.desglose = JSON.parse(parsed.desglose);
          } catch (e) {
            parsed.desglose = null;
          }
        }
        ultimoPorEstudiante.set(a.estudiante_id, parsed);
      }
    }

    return students.map(s => ({
      ...s,
      diagnostico: ultimoPorEstudiante.has(s.id)
        ? {
            puntaje_total: ultimoPorEstudiante.get(s.id).puntaje_total,
            nivel: ultimoPorEstudiante.get(s.id).nivel,
            desglose: ultimoPorEstudiante.get(s.id).desglose,
            aplicada_en: ultimoPorEstudiante.get(s.id).aplicada_en,
          }
        : null,
    }));
  }

  static async getStudentDetail(studentId, teacherId) {
    const student = await User.findOne({
      where: { id: studentId, role: 'student', docente_id: teacherId },
      attributes: ['id', 'name', 'email', 'createdAt', 'password_encrypted', 'iad_obligatorio']
    });
    if (!student) throw new Error('Estudiante no encontrado o no tienes permisos.');
    return student;
  }

  static async updateStudent(studentId, teacherId, data) {
    const student = await User.findOne({
      where: { id: studentId, role: 'student', docente_id: teacherId }
    });
    if (!student) throw new Error('No tienes permisos para modificar esta cuenta.');

    if (data.email) {
      const existing = await User.findOne({
        where: { email: data.email, id: { [Op.ne]: studentId } }
      });
      if (existing) throw new Error('El correo electrónico ya está registrado por otro usuario.');
    }

    if (data.password) {
      if (data.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
      const salt = await bcrypt.genSalt(10);
      student.password = await bcrypt.hash(data.password, salt);
      student.password_encrypted = encrypt(data.password);
    }

    if (data.name) student.name = data.name;
    if (data.email) student.email = data.email;
    if (typeof data.iadObligatorio === 'boolean') student.iad_obligatorio = data.iadObligatorio;

    await student.save();
    return {
      id: student.id,
      name: student.name,
      email: student.email,
      createdAt: student.createdAt
    };
  }

  static async deleteStudent(studentId, teacherId) {
    const student = await User.findOne({
      where: { id: studentId, role: 'student', docente_id: teacherId }
    });
    if (!student) throw new Error('No tienes permisos para eliminar esta cuenta.');

    await StudentProgress.destroy({ where: { estudiante_id: studentId } });
    await Progress.destroy({ where: { usuario_id: studentId } });

    // Limpieza del diagnóstico IAD-Primaria (respuestas + aplicaciones).
    const apps = await DiagnosticoAplicacion.findAll({
      where: { estudiante_id: studentId },
      attributes: ['id'],
      raw: true
    });
    if (apps.length > 0) {
      const DiagnosticoRespuesta = require('../models/diagnosticoRespuesta.model');
      await DiagnosticoRespuesta.destroy({ where: { aplicacion_id: apps.map(a => a.id) } });
    }
    await DiagnosticoAplicacion.destroy({ where: { estudiante_id: studentId } });

    await student.destroy();

    return true;
  }

  static async revealPassword(studentId, teacherId) {
    const student = await User.findOne({
      where: { id: studentId, role: 'student', docente_id: teacherId }
    });
    if (!student) throw new Error('Estudiante no encontrado o no tienes permisos.');
    if (!student.password_encrypted) throw new Error('No hay contraseña almacenada para mostrar.');

    const plainPassword = decrypt(student.password_encrypted);
    return plainPassword;
  }

  static async registerStudent(teacherId, data) {
    const existing = await User.findOne({ where: { email: data.email } });
    if (existing) throw new Error('El correo ya está registrado');

    if (!data.password || data.password.length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres.');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);

    const newUser = await User.create({
      name: data.name,
      email: data.email,
      password: hashedPassword,
      password_encrypted: encrypt(data.password),
      role: 'student',
      docente_id: teacherId,
      emailVerified: true,
      iad_obligatorio: data.iadObligatorio === false ? false : true,
    });

    try {
      await sendStudentWelcomeEmail(newUser.name, newUser.email, newUser.email, data.password);
      console.log(`[CuentasService] ✅ Email de bienvenida enviado a ${newUser.email}`);
    } catch (mailErr) {
      console.error(`[CuentasService] ❌ No se pudo enviar email de bienvenida a ${newUser.email}:`, mailErr.message);
    }

    return {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      createdAt: newUser.createdAt
    };
  }
}

module.exports = CuentasService;