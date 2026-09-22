import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import GrupoSelect from '../../components/GrupoSelect';
import './CrearJuegos.css';
import GameTypeCard from '../../components/juegos/GameTypeCard';
import DynamicGameForm from '../../components/juegos/DynamicGameForm';
import GamePreview from '../../components/juegos/GamePreview';
import { MdSearch, MdGridOn, MdHelp, MdStyle, MdLink, MdSave } from 'react-icons/md';

const CrearJuegos = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isTeacher } = useAuth();

  const [formValues, setFormValues] = useState({
    titulo: '',
    tipo: '',
    modulo: '',
    modulo_content_id: '',
    descripcion: '',
    puntaje_max: 100,
    configuracion: null,
    grupo_id: ''
  });

  const [modulos, setModulos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (!isTeacher) { navigate('/juegos'); return; }
    // Cargar módulos disponibles
    api.get('/contenidos/modulos')
      .then(res => setModulos(res.data?.data || []))
      .catch(() => setModulos([]));
  }, [isAuthenticated, isTeacher, navigate]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    if (name === 'modulo' && modulos.length > 0) {
      const contenido = modulos.find((m) => String(m.id) === value);
      const moduloNombre = contenido ? contenido.modulo : '';
      setFormValues((prev) => ({
        ...prev,
        modulo: moduloNombre,
        modulo_content_id: value
      }));
      return;
    }

    setFormValues((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleGameTypeSelect = (tipo) => {
    setFormValues((prev) => ({
      ...prev,
      tipo,
      configuracion: null // Reseteamos la configuración al cambiar de tipo
    }));
  };

  const handleConfiguracionChange = (nuevaConfiguracion) => {
    setFormValues((prev) => ({
      ...prev,
      configuracion: nuevaConfiguracion
    }));
  };

  const validarFormulario = () => {
    if (!formValues.titulo.trim()) {
      setError('El título es obligatorio.');
      return false;
    }

    if (!formValues.tipo.trim()) {
      setError('El tipo de juego es obligatorio.');
      return false;
    }

    if (!formValues.modulo.trim()) {
      setError('El módulo es obligatorio.');
      return false;
    }
    
    if (!formValues.configuracion) {
      setError('La configuración del juego es obligatoria.');
      return false;
    }

    // Validaciones específicas según el tipo de juego
    const { configuracion, tipo } = formValues;
    if (tipo === 'sopa_de_letras' || tipo === 'crucigrama') {
      if (!configuracion.palabras || configuracion.palabras.length < 2) {
        setError('Debes agregar al menos 2 palabras.');
        return false;
      }
      const palabrasInvalidas = configuracion.palabras.some(p => !p.palabra.trim());
      if (palabrasInvalidas) {
        setError('Todas las palabras deben tener texto.');
        return false;
      }
      if (!configuracion.tablero || configuracion.tablero.length === 0) {
        setError('Debes generar el tablero con el botón "Generar Tablero" antes de guardar.');
        return false;
      }
    } else if (tipo === 'adivinanza') {
      if (!configuracion.adivinanza.trim() || !configuracion.respuestaCorrecta) {
        setError('La adivinanza y la respuesta correcta son obligatorias.');
        return false;
      }
      if (!configuracion.opcionA || !configuracion.opcionB || !configuracion.opcionC) {
        setError('Debes completar las tres opciones (A, B, C).');
        return false;
      }
    } else if (tipo === 'memoria' || tipo === 'relacionar') {
      if (!configuracion.pares || configuracion.pares.length < 2) {
        setError('Debes agregar al menos 2 pares para relacionar/memoria.');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!validarFormulario()) return;

    setLoading(true);

    try {
      const payload = {
        ...formValues,
        docente_id: user?.id
      };

      if (!payload.modulo_content_id) {
        delete payload.modulo_content_id;
      }

      if (!payload.grupo_id) {
        delete payload.grupo_id;
      }

      await api.post('/juegos', payload);

      setSuccess('Juego creado exitosamente.');

      setTimeout(() => {
        navigate('/juegos');
      }, 900);

    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.message ||
        'Error al crear el juego.'
      );
    } finally {
      setLoading(false);
    }
  };

  const gameTypes = [
    { value: 'sopa_de_letras', icon: <MdSearch />, label: "Sopa de Letras" },
    { value: 'crucigrama', icon: <MdGridOn />, label: "Crucigrama" },
    { value: 'adivinanza', icon: <MdHelp />, label: "Adivinanzas" },
    { value: 'memoria', icon: <MdStyle />, label: "Memotest" },
    { value: 'relacionar', icon: <MdLink />, label: "Asociación de Palabras" },
  ];
  

  return (
    <div className="crear-juegos-container cartoon-area">
      <button className="volver-btn" onClick={() => navigate(-1)}>
        ← Volver a Juegos
      </button>

      <div className="crear-juegos-header">
        <h2>Crear Nuevo Juego Interactivo</h2>
        <p className="header-subtitle">Configura los detalles generales y la dinámica de juego para tus estudiantes.</p>
      </div>

      <div className="crear-juegos-layout">
        <div className="form-column">
          <div className="form-section">
            <h3>1. Información General</h3>
            <div className="form-group">
              <label htmlFor="titulo">Título del Juego *</label>
              <input
                type="text"
                id="titulo"
                name="titulo"
                value={formValues.titulo}
                onChange={handleChange}
                placeholder="Ej: Relacionar partes del cuerpo humano..."
                required
              />
            </div>

            <div className="form-group row-group">
              <div className="form-group-half">
                <label htmlFor="modulo">Módulo *</label>
                {modulos.length > 0 ? (
                  <select
                    id="modulo"
                    name="modulo"
                    value={formValues.modulo_content_id || ''}
                    onChange={handleChange}
                    required
                  >
                    <option value="">-- Selecciona un módulo --</option>
                    {modulos.map((m) => (
                      <option key={m.id} value={m.id}>{m.modulo} – {m.titulo}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    id="modulo"
                    name="modulo"
                    value={formValues.modulo}
                    onChange={handleChange}
                    placeholder="Ej: Matemáticas (no hay módulos creados)"
                    required
                  />
                )}
              </div>
              <div className="form-group-half">
                <label htmlFor="puntaje_max">Puntaje Máximo *</label>
                <input
                  type="number"
                  id="puntaje_max"
                  name="puntaje_max"
                  value={formValues.puntaje_max}
                  onChange={handleChange}
                  min="10"
                  max="1000"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="descripcion">Descripción e Instrucciones</label>
              <textarea
                id="descripcion"
                name="descripcion"
                value={formValues.descripcion}
                onChange={handleChange}
                placeholder="Describe brevemente las instrucciones del juego"
                rows="3"
              />
            </div>

            <GrupoSelect
              value={formValues.grupo_id}
              onChange={(grupoId) => setFormValues((prev) => ({ ...prev, grupo_id: grupoId }))}
            />
          </div>

          <div className="form-section">
            <h3>2. Selecciona el Tipo de Juego</h3>
            <div className="game-types-grid">
              {gameTypes.map((type) => (
                <GameTypeCard
                  key={type.value}
                  value={type.value}
                  icon={type.icon}
                  label={type.label}
                  isSelected={formValues.tipo === type.value}
                  onClick={handleGameTypeSelect}
                />
              ))}
            </div>
          </div>

          {formValues.tipo && (
            <div className="form-section">
              <h3>3. Configuración del Juego</h3>
              <DynamicGameForm
                tipo={formValues.tipo}
                configuracion={formValues.configuracion}
                onChange={handleConfiguracionChange}
              />
            </div>
          )}

          <form onSubmit={handleSubmit} className="crear-juegos-form-actions">
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            
            <button 
              type="submit" 
              disabled={loading || !formValues.tipo || !formValues.configuracion} 
              className="submit-btn"
            >
              {loading ? 'Guardando Juego...' : <><MdSave style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} /> Guardar y Publicar Juego</>}
            </button>
          </form>
        </div>

        <div className="preview-column">
          <GamePreview config={formValues.configuracion} />
        </div>
      </div>
    </div>
  );
}

export default CrearJuegos;