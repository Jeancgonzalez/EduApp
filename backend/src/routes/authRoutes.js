const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST /api/auth/register
router.post('/register', authController.register);

// POST /api/auth/login
router.post('/login', authController.login);

// POST /api/auth/verify-email (verifica el código enviado al correo)
router.post('/verify-email', authController.verifyEmail);

// POST /api/auth/resend-code (reenvía un nuevo código de verificación)
router.post('/resend-code', authController.resendCode);

module.exports = router;
