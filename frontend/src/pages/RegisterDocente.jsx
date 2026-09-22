import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import ThemeToggle from '../components/layout/ThemeToggle';
import PasswordInput from '../components/PasswordInput';
import './RegisterDocente.css';

const RegisterDocente = () => {
  // Inicializamos en 'docente' porque según tus reglas, el estudiante no puede auto-registrarse
  const [role, setRole] = useState('docente');
  const [formData, setFormData] = useState({
    nombre: '',
    usuario: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const navigate = useNavigate();

  // Estado de verificación de correo
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [code, setCode] = useState('');
  const [verifyMessage, setVerifyMessage] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateField = (name, value, all) => {
    switch (name) {
      case 'nombre':
        return value.trim() ? '' : 'El nombre es obligatorio.';
      case 'email':
        if (!value.trim()) return 'El correo electrónico es obligatorio.';
        if (!emailRegex.test(value.trim())) return 'Ingresa un correo electrónico válido.';
        return '';
      case 'password':
        if (!value) return 'La contraseña es obligatoria.';
        if (value.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
        return '';
      case 'confirmPassword':
        if (!value) return 'La confirmación es obligatoria.';
        if (value !== (all?.password ?? formData.password)) return 'Las contraseñas no coinciden.';
        return '';
      default:
        return '';
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next = { ...formData, [name]: value };
    setFormData(next);
    setFieldErrors((prev) => ({
      ...prev,
      [name]: validateField(name, value, next),
    }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    const errs = {};
    for (const key of ['nombre', 'email', 'password', 'confirmPassword']) {
      const msg = validateField(key, formData[key], formData);
      if (msg) errs[key] = msg;
    }
    setFieldErrors(errs);

    if (Object.keys(errs).length > 0) {
      return;
    }

    // Bloqueo de seguridad en frontend cumpliendo tu regla de negocio
    if (role === 'estudiante') {
      return setError('Acción denegada: Los estudiantes deben ser registrados por su docente.');
    }

    setIsLoading(true);

    try {
      const response = await api.post('/auth/register', {
        name: formData.nombre,
        username: formData.usuario,
        email: formData.email,
        password: formData.password,
        role: 'teacher' // Siempre registramos como docente desde esta vista pública
      });

      if (response.data) {
        // El correo requiere verificación: mostrar la pantalla de verificación
        setRegisteredEmail(formData.email);
        setCode('');
        setVerifyMessage('');
        setVerifyError('');
        setResendCooldown(60);
      }
    } catch (err) {
      const backendMessage = err.response?.data?.message || '';
      if (/ya est[áa] registrado/.test(backendMessage.toLowerCase())) {
        setFieldErrors((prev) => ({ ...prev, email: 'Este correo ya está registrado.' }));
      } else {
        setError(backendMessage || 'Error al crear la cuenta. Intenta nuevamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setVerifyMessage('');
    setVerifyError('');
    setVerifyLoading(true);

    try {
      const response = await api.post('/auth/verify-email', {
        email: registeredEmail,
        code
      });

      setVerifyMessage(response.data?.message || '¡Correo verificado correctamente!');
      setCode('');
      // Redirigir al login después de verificar
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setVerifyError(err.response?.data?.message || 'No se pudo verificar el código.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setVerifyError('');
    setVerifyMessage('');

    try {
      await api.post('/auth/resend-code', { email: registeredEmail });
      setVerifyMessage('Se envió un nuevo código a tu correo.');
      setResendCooldown(60);
    } catch (err) {
      setVerifyError(err.response?.data?.message || 'No se pudo reenviar el código.');
    } finally {
      setResendLoading(false);
    }
  };

  // ===== Vista de verificación de correo =====
  if (registeredEmail) {
    return (
      <div className="register-container">
        <ThemeToggle className="auth-theme-toggle" />
        <div className="register-card">
          <div className="register-header">
            <div className="logo-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h1>Verifica tu correo electrónico</h1>
            <p>Enviamos un código de verificación a <strong>{registeredEmail}</strong>. Revisa tu bandeja de entrada e ingresa el código para continuar.</p>
          </div>

          {verifyMessage && <div className="success-message">{verifyMessage}</div>}
          {verifyError && <div className="error-message">{verifyError}</div>}

          <form onSubmit={handleVerify} className="register-form">
            <div className="form-group">
              <label>Código de verificación</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  name="code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Ingresa el código de 6 dígitos"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
            </div>

            <button type="submit" className="register-btn" disabled={verifyLoading || code.length !== 6}>
              {verifyLoading ? 'Verificando...' : 'Verificar correo'}
            </button>
          </form>

          <div className="resend-box">
            <p>¿No recibiste el código?</p>
            {resendCooldown > 0 ? (
              <span className="resend-cooldown">Puedes solicitar otro código en {resendCooldown} segundos.</span>
            ) : (
              <button
                type="button"
                className="resend-btn"
                onClick={handleResend}
                disabled={resendLoading}
              >
                {resendLoading ? 'Enviando...' : 'Reenviar código'}
              </button>
            )}
          </div>

          <div className="register-footer">
            ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
          </div>
        </div>
      </div>
    );
  }

  // ===== Vista de formulario de registro =====
  return (
    <div className="register-container">
      <ThemeToggle className="auth-theme-toggle" />

      <div className="register-card">

        <div className="register-header">
          <div className="logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <h1>Crear una Cuenta para poder trabajar en la plataforma Profesor</h1>

          <p>Únete a EduApp Platform</p>

          <div className="info-message-external">
            👋 <strong>¡Hola estudiante!</strong><br />
            Solo tu profesor puede crear tu cuenta, cuando lo haga podras ingresar a la plataforma.
          </div>
        </div>


        <form onSubmit={handleRegister} className="register-form">
          <div className={`form-group ${fieldErrors.nombre ? 'has-error' : ''}`}>
            <label>Nombre Completo</label>
            <div className="input-wrapper">
              <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                type="text"
                name="nombre"
                placeholder="Ingresa tu nombre completo"
                value={formData.nombre}
                onChange={handleChange}
                required
                disabled={role === 'estudiante'}
              />
            </div>
            {fieldErrors.nombre && <div className="field-error">⚠ {fieldErrors.nombre}</div>}
          </div>


          <div className={`form-group ${fieldErrors.email ? 'has-error' : ''}`}>
            <label>Email o Correo</label>
            <div className="input-wrapper">
              <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <input
                type="email"
                name="email"
                placeholder="tu@email.com"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={role === 'estudiante'}
              />
            </div>
            {fieldErrors.email && <div className="field-error">⚠ {fieldErrors.email}</div>}
          </div>

          <div className={`form-group ${fieldErrors.password ? 'has-error' : ''}`}>
            <label>Contraseña</label>
            <PasswordInput
              icon={
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              }
              name="password"
              placeholder="Mínimo 8 caracteres"
              value={formData.password}
              onChange={handleChange}
              required
              disabled={role === 'estudiante'}
              minLength={8}
            />
            {fieldErrors.password && <div className="field-error">⚠ {fieldErrors.password}</div>}
          </div>

          <div className={`form-group ${fieldErrors.confirmPassword ? 'has-error' : ''}`}>
            <label>Confirmar Contraseña</label>
            <PasswordInput
              icon={
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              }
              name="confirmPassword"
              placeholder="Repite tu contraseña"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              disabled={role === 'estudiante'}
            />
            {fieldErrors.confirmPassword && <div className="field-error">⚠ {fieldErrors.confirmPassword}</div>}
          </div>

          <button type="submit" className="register-btn" disabled={isLoading || role === 'estudiante'}>
            {isLoading ? 'Creando...' : 'Crear Cuenta'}
          </button>
        </form>

        <div className="register-footer">
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterDocente;
