import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { MdEmail, MdLock, MdVpnKey } from 'react-icons/md';
import api from '../services/api';
import ThemeToggle from '../components/layout/ThemeToggle';
import PasswordInput from '../components/PasswordInput';
import './RecuperarPassword.css';

const RESEND_COOLDOWN = 60;

const RecuperarPassword = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [step, setStep] = useState(1); // 1 = solicitar código, 2 = nueva contraseña
  const [error, setError] = useState('');
  const [mailWarning, setMailWarning] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const navigate = useNavigate();
  const location = useLocation();

  // Si el docente llegó desde el login con el correo ya escrito, se precarga.
  useEffect(() => {
    const incoming = location.state?.email;
    if (incoming) setEmail(incoming);
  }, [location.state]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleRequestCode = async (e) => {
    e?.preventDefault();
    setError('');
    setMailWarning('');

    if (!email.trim()) {
      setError('Escribe el correo con el que te registraste.');
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() });
      setStep(2);
      setCooldown(RESEND_COOLDOWN);
      // Si el SMTP está caído el backend responde 200 igual: lo avisamos aquí.
      if (data?.data?.emailSent === false) {
        setMailWarning('No pudimos enviar el correo con el código. Revisa tu bandeja de spam o inténtalo de nuevo en un minuto.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo solicitar el código. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setMailWarning('');
    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() });
      setCooldown(RESEND_COOLDOWN);
      if (data?.data?.emailSent === false) {
        setMailWarning('No pudimos enviar el correo con el código. Inténtalo de nuevo en un minuto.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo reenviar el código.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');

    if (!code.trim()) {
      setError('Escribe el código que te enviamos al correo.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/auth/reset-password', { email: email.trim(), code: code.trim(), password });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo actualizar la contraseña.');
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <div className="reset-container">
        <ThemeToggle className="auth-theme-toggle" />
        <div className="reset-card">
          <div className="reset-header">
            <div className="logo-icon">
              <MdVpnKey size={30} />
            </div>
            <h1>Contraseña actualizada</h1>
            <p>Tu contraseña nueva ya está activa.</p>
          </div>

          <div className="success-message">
            Inicia sesión con la contraseña que acabas de crear.
          </div>

          <button type="button" className="reset-btn" onClick={() => navigate('/login')}>
            Ir a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="reset-container">
      <ThemeToggle className="auth-theme-toggle" />
      <div className="reset-card">
        <div className="reset-header">
          <div className="logo-icon">
            <MdVpnKey size={30} />
          </div>
          <h1>Recuperar contraseña</h1>
          <p>
            {step === 1
              ? 'Escribe el correo de tu cuenta y te enviaremos un código para crear una contraseña nueva.'
              : 'Ingresa el código que enviamos a tu correo y define tu contraseña nueva.'}
          </p>
        </div>

        {error && <div className="error-message">{error}</div>}
        {mailWarning && <div className="mail-warning">{mailWarning}</div>}

        {step === 1 ? (
          <form onSubmit={handleRequestCode} className="reset-form">
            <div className="form-group">
              <label>Correo electrónico</label>
              <div className="input-wrapper">
                <MdEmail className="input-icon" />
                <input
                  type="text"
                  placeholder="Ingresa tu correo"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="reset-btn" disabled={isLoading}>
              {isLoading ? 'Enviando...' : 'Enviar código'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="reset-form">
            <div className="sent-to">
              Código enviado a <strong>{email}</strong>
            </div>

            <div className="form-group">
              <label>Código de 6 dígitos</label>
              <div className="input-wrapper">
                <MdVpnKey className="input-icon" />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  className="code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Contraseña nueva</label>
              <PasswordInput
                icon={<MdLock className="input-icon" />}
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Repite la contraseña nueva</label>
              <PasswordInput
                icon={<MdLock className="input-icon" />}
                placeholder="Vuelve a escribirla"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="reset-btn" disabled={isLoading}>
              {isLoading ? 'Guardando...' : 'Guardar contraseña nueva'}
            </button>

            <div className="resend-box">
              <p>¿No recibiste el código?</p>
              <button
                type="button"
                className="resend-btn"
                onClick={handleResend}
                disabled={isLoading || cooldown > 0}
              >
                {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar código'}
              </button>
              <button
                type="button"
                className="change-email-btn"
                onClick={() => {
                  setStep(1);
                  setCode('');
                  setError('');
                  setMailWarning('');
                }}
              >
                Usar otro correo
              </button>
            </div>
          </form>
        )}

        <div className="reset-footer">
          ¿Recordaste tu contraseña? <Link to="/login">Inicia sesión</Link>
        </div>
      </div>
    </div>
  );
};

export default RecuperarPassword;
