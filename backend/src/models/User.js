const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  password_encrypted: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  role: {
    type: DataTypes.ENUM('student', 'teacher'),
    defaultValue: 'student',
    allowNull: false,
  },
  docente_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  emailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  iad_obligatorio: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  emailVerificationCodeHash: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  emailVerificationExpires: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Recuperación de contraseña. Son columnas APARTE de las de verificación de
  // correo a propósito: si compartieran campos, un reseteo pisaría el código de
  // verificación de un docente que se acaba de registrar, y el código de reseteo
  // sería aceptado como si fuera de verificación (mismo hash, misma función).
  passwordResetCodeHash: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  passwordResetExpires: {
    type: DataTypes.DATE,
    allowNull: true,
  }
}, {
  timestamps: true,
  tableName: 'users'
});

module.exports = User;
