import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import PasswordInput from '../../components/PasswordInput';
import './RegisterEstudiante.css';

const RegisterEstudiante = () => {
  // Inicializamos en 'estudiante' 
  const [role, setRole] = useState('profesor'); // Aunque el rol es fijo, lo mantenemos para cumplir la regla de negocio
  const [formData, setFormData] = useState({
    nombre: '',
    usuario: '',
    email: '',
    password: '',
    confirmPassword: '',
    iadObligatorio: true
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const navigate = useNavigate();

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

  const handleCheckbox = (e) => {
    const { name, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: checked }));
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
      // Ajustar ruta según tu backend
      const response = await api.post('/cuentas/register', {
        name: formData.nombre,
        email: formData.email,
        password: formData.password,
        iadObligatorio: formData.iadObligatorio
      });

      if (response.data) {
        Swal.fire({ title: '¡Registrado!', text: 'Estudiante registrado correctamente.', icon: 'success', timer: 1500, showConfirmButton: false });
        navigate('/gestion-alumnos/cuentas');
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

  return (
    <div className="register-container cartoon-area">


    <Link to="/docente/dashboard" className="back-link-registerEst " >
        ← Volver al Inicio
      </Link>
      <div className="register-card">

        <div className="register-header">
          <div className="logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <h1>Crear una Cuenta para que tus estudiantes puedan trabajar en la plataforma</h1>

          <p>EduApp Platform</p>

          <div className="info-message-external">
            👋 <strong>¡Hola docente!</strong><br />
            Solo tu puedes registrar a tus estudiantes. En la gestión de alumnos podrás ver y modificar las cuentas de tus estudiantes. 
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
                placeholder="Ingresa su nombre completo"
                value={formData.nombre}
                onChange={handleChange}
                disabled={role === 'estudiante'}
                required
                
              />
            </div>
            {fieldErrors.nombre && <div className="field-error">⚠ {fieldErrors.nombre}</div>}
          </div>


          <div className={`form-group ${fieldErrors.email ? 'has-error' : ''}`}>
            <label>Correo del padre o tutor</label>
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

          <div className="form-group mision-obligatoria-group">
            <label className="mision-obligatoria-label">
              <input
                type="checkbox"
                name="iadObligatorio"
                checked={formData.iadObligatorio}
                onChange={handleCheckbox}
              />
              <span>
                <strong>Misión Digital (IAD-Primaria) obligatoria</strong>
                <small>El estudiante deberá completar el cuestionario antes de usar el aplicativo. Desmarca para permitirle el acceso directo.</small>
              </span>
            </label>
          </div>

          <button type="submit" className="register-btn" disabled={isLoading || role === 'estudiante'}>
            {isLoading ? 'Creando...' : 'Crear estudiante'}
          </button>
        </form>

        <div className="register-footer">
            ¿Terminastes de registrar? <Link to="/docente/dashboard">Volver al inicio</Link>
        </div>


      </div>
    </div>
  );
};

export default RegisterEstudiante;
