import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MdEmail, MdLock, MdSchool } from 'react-icons/md';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/layout/ThemeToggle';
import PasswordInput from '../components/PasswordInput';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setPendingEmail('');
    setIsLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      
      if (response.data && response.data.data && response.data.data.token) {
        const token = response.data.data.token;
        login(token);
        
        const user = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        const isTeacher = user?.role === 'teacher' || user?.role === 'docente';
        navigate(isTeacher ? '/docente/dashboard' : '/student/dashboard');
      }
    } catch (err) {
      if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        // Correo no verificado: mostrar mensaje y permitir ir a la verificación
        setPendingEmail(email);
        setError(err.response?.data?.message || 'Debe verificar su correo electrónico.');
      } else {
        setError(err.response?.data?.message || 'Error al iniciar sesión. Verifica tus credenciales.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const goToVerification = () => {
    navigate('/verificar-correo', { state: { email: pendingEmail || email } });
  };

  return (
    <div className="login-container">
      <ThemeToggle className="auth-theme-toggle" />
      <div className="login-card">
        
        <div className="login-header">
          <div className="logo-icon">
            <MdSchool size={32} />
          </div>
          <h1>EduApp Platform</h1>
          <p>Aprende jugando, enseña innovando</p>
        </div>

        {error && <div className="error-message">{error}</div>}
        {pendingEmail && (
          <div className="verify-prompt">
            <button type="button" className="verify-link" onClick={goToVerification}>
              Ir a verificar mi correo
            </button>
          </div>
        )}

        <form onSubmit={handleLogin} className="login-form">
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

          <div className="form-group">
            <label>Contraseña</label>
            <PasswordInput
              icon={<MdLock className="input-icon" />}
              placeholder="Ingresa tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="login-btn" disabled={isLoading}>
            {isLoading ? 'Iniciando...' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="login-footer">
          ¿Profe, No tienes cuenta? <a href="/registroDocente">Regístrate</a>
        </div>
      </div>
    </div>
  );
};

export default Login;
