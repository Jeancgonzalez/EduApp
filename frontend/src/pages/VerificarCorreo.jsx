import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { MdSchool } from 'react-icons/md';
import api from '../services/api';
import ThemeToggle from '../components/layout/ThemeToggle';
import './VerificarCorreo.css';

const VerificarCorreo = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const initialEmail = location.state?.email || '';
  // Si se llega desde /registroDocente y el backend no pudo enviar el correo
  // (p. ej. SMTP caído en local), avisamos para que usen "Reenviar código".
  const [emailSentWarning, setEmailSentWarning] = useState(location.state?.emailSent === false);

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

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

  const handleVerify = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setVerifyLoading(true);

    try {
      const response = await api.post('/auth/verify-email', { email, code });
      setMessage(response.data?.message || '¡Correo verificado correctamente!');
      setCode('');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo verificar el código.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setError('');
    setMessage('');

    try {
      await api.post('/auth/resend-code', { email });
      setMessage('Se envió un nuevo código a tu correo.');
      setEmailSentWarning(false);
      setResendCooldown(60);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo reenviar el código.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="verify-container">
      <ThemeToggle className="auth-theme-toggle" />
      <div className="verify-card">
        <div className="verify-header">
          <div className="logo-icon">
            <MdSchool size={32} />
          </div>
          <h1>Verifica tu correo electrónico</h1>
          <p>Enviamos un código de verificación a tu correo electrónico. Revisa tu bandeja de entrada e ingresa el código para continuar.</p>
        </div>

        {message && <div className="success-message">{message}</div>}
        {emailSentWarning && !message && (
          <div className="error-message">
            No pudimos enviar el código a tu correo. Usa &quot;Reenviar código&quot; para intentarlo de nuevo.
          </div>
        )}
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleVerify} className="verify-form">
          <div className="form-group">
            <label>Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Código de verificación</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Ingresa el código de 6 dígitos"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>

          <button type="submit" className="verify-btn" disabled={verifyLoading || code.length !== 6}>
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
              disabled={resendLoading || !email}
            >
              {resendLoading ? 'Enviando...' : 'Reenviar código'}
            </button>
          )}
        </div>

        <div className="verify-footer">
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </div>
      </div>
    </div>
  );
};

export default VerificarCorreo;
