const authService = require('../services/authService');

const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    
    // Validación básica
    if (!name || !email || !password) {
      return res.status(400).json({ status: 'error', message: 'Faltan campos obligatorios' });
    }

    const { user: newUser, emailSent } = await authService.registerUser({ name, email, password, role });

    res.status(201).json({
      status: 'success',
      message: 'Usuario registrado exitosamente',
      data: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        emailVerified: false,
        emailSent
      }
    });
  } catch (error) {
    // Pasar al middleware de manejo de errores
    if (error.message === 'El correo ya está registrado' || error.message === 'La contraseña debe tener al menos 8 caracteres.') {
      return res.status(400).json({ status: 'error', message: error.message });
    }
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Faltan correo o contraseña' });
    }

    const { user, token } = await authService.loginUser(email, password);

    res.status(200).json({
      status: 'success',
      message: 'Login exitoso',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          iadObligatorio: user.iad_obligatorio === true
        }
      }
    });
  } catch (error) {
    if (error.message === 'Datos inválidos') {
      return res.status(401).json({ status: 'error', message: error.message });
    }
    if (error.code === 'EMAIL_NOT_VERIFIED') {
      return res.status(403).json({
        status: 'error',
        code: 'EMAIL_NOT_VERIFIED',
        message: error.message
      });
    }
    next(error);
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ status: 'error', message: 'Faltan correo o código de verificación' });
    }

    const { alreadyVerified } = await authService.verifyEmail(email, code);

    res.status(200).json({
      status: 'success',
      message: alreadyVerified
        ? 'Este correo ya había sido verificado.'
        : '¡Correo verificado correctamente!'
    });
  } catch (error) {
    const statusMap = {
      'Correo no encontrado.': 404,
      'El código ha expirado. Solicita un nuevo código.': 400,
    };
    const status = statusMap[error.message] || (error.message.includes('no es correcto') ? 400 : 500);
    res.status(status).json({ status: 'error', message: error.message });
  }
};

const resendCode = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Falta el correo' });
    }

    await authService.resendVerificationCode(email);

    res.status(200).json({
      status: 'success',
      message: 'Se envió un nuevo código de verificación a tu correo.'
    });
  } catch (error) {
    const status = error.message === 'Correo no encontrado.' ? 404
      : error.message === 'Este correo ya ha sido verificado.' ? 400
      : error.status === 429 ? 429
      : 500;
    res.status(status).json({ status: 'error', message: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Falta el correo' });
    }

    const { emailSent } = await authService.requestPasswordReset(email);

    res.status(200).json({
      status: 'success',
      message: 'Si el correo está registrado, te enviamos un código para crear una contraseña nueva.',
      data: { emailSent }
    });
  } catch (error) {
    res.status(error.status || 500).json({ status: 'error', message: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, code, password } = req.body;

    if (!email || !code || !password) {
      return res.status(400).json({ status: 'error', message: 'Faltan correo, código o contraseña' });
    }

    await authService.resetPassword(email, code, password);

    res.status(200).json({
      status: 'success',
      message: 'Tu contraseña fue actualizada. Ya puedes iniciar sesión.'
    });
  } catch (error) {
    res.status(error.status || 500).json({ status: 'error', message: error.message });
  }
};

module.exports = {
  register,
  login,
  verifyEmail,
  resendCode,
  forgotPassword,
  resetPassword
};
