import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import GameTypeCard from '../../components/juegos/GameTypeCard';
import DynamicGameForm from '../../components/juegos/DynamicGameForm';
import GamePreview from '../../components/juegos/GamePreview';
import GrupoSelect from '../../components/GrupoSelect';
import './JuegosEditar.css';
import { MdSearch, MdGridOn, MdHelp, MdStyle, MdLink, MdSave } from 'react-icons/md';

const JuegosEditar = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [juego, setJuego] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');

  const [modulos, setModulos] = useState([]);

  const [formValues, setFormValues] = useState({
    titulo: '',
    tipo: '',
    configuracion: null,
    modulo: '',
    modulo_content_id: '',
    descripcion: '',
    puntaje_max: 100,
    grupo_id: ''
  });

  useEffect(() => {
    api.get('/contenidos/modulos')
      .then(res => setModulos(res.data?.data || []))
      .catch(() => setModulos([]));
  }, []);

  useEffect(() => {
    const fetchJuego = async () => {
      try {
        const response = await api.get(`/juegos/${id}`);
        const data = response.data?.data || null;

        if (!data) {
          setError('Juego no encontrado.');
          return;
        }

        setJuego(data);
        setFormValues({
          titulo: data.titulo || '',
          tipo: data.tipo || '',
          configuracion: typeof data.configuracion === 'string' ? JSON.parse(data.configuracion) : (data.configuracion || null),
          modulo: data.modulo || '',
          modulo_content_id: data.modulo_content_id ? String(data.modulo_content_id) : '',
          descripcion: data.descripcion || '',
          puntaje_max: data.puntaje_max || 100,
          grupo_id: data.grupo_id ? String(data.grupo_id) : '',
        });

      } catch (err) {
        console.error('Error al cargar el juego:', err);
        setError('No se pudo cargar el juego. Verifica el ID o la conexión.');
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchJuego();
    }
  }, [id]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    if (name === 'modulo' && modulos.length > 0) {
      const contenido = modulos.find((m) => String(m.id) === value);
      const moduloNombre = contenido ? contenido.modulo : '';
      setFormValues((prevValues) => ({
        ...prevValues,
        modulo: moduloNombre,
        modulo_content_id: value
      }));
      return;
    }

    setFormValues((prevValues) => ({
      ...prevValues,
      [name]: value
    }));
  };

  const handleGameTypeSelect = (tipo) => {
    setFormValues((prev) => ({
      ...prev,
      tipo,
      configuracion: null
    }));
  };

  const handleConfiguracionChange = (nuevaConfiguracion) => {
    setFormValues((prev) => ({
      ...prev,
      configuracion: nuevaConfiguracion
    }));
  };

 
    const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    
    if (!formValues.titulo || !formValues.tipo || !formValues.modulo || !formValues.configuracion || !formValues.descripcion) {
      setError('Los campos título, módulo, tipo de juego y descripción son obligatorios.');
      return;
    }

    setLoading(true);
    try {
      const payload = { ...formValues };
      if (!payload.modulo_content_id) {
        delete payload.modulo_content_id;
      }
      if (!payload.grupo_id) {
        delete payload.grupo_id;
      }
      console.log('Enviando PUT /juegos/', id, payload);
      await api.put(`/juegos/${id}`, payload);
      setSuccess('Juego actualizado correctamente.');
      setTimeout(() => {
        navigate(`/juegos`);
      }, 900);
    } catch (err) {
      console.error('Error al actualizar el juego:', err);
      setError(err.response?.data?.message || 'Hubo un error al actualizar el juego. Por favor, inténtalo de nuevo.');
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

  if (loading) {
    return <div className="detalle-mensaje">Cargando juego...</div>;
  }

  if (error && !juego) {
    return <div className="detalle-mensaje error">{error}</div>;
  }

  if (!juego) {
    return <div className="detalle-mensaje">Juego no encontrado.</div>;
  }

  return (
    <div className="editar-juegos-container cartoon-area">
      <button className="volver-btn" onClick={() => navigate(-1)}>
        ← Volver a Juegos
      </button>

      <div className="editar-juegos-header">
        <h2>Editar Juego Interactivo</h2>
        <p className="header-subtitle">Edita los detalles generales y la dinámica de juego para tus estudiantes.</p>
      </div>

      <div className="editar-juegos-layout">
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

          <form onSubmit={handleSubmit} className="editar-juegos-form-actions">
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}
            
            <button 
              type="submit" 
              disabled={loading || !formValues.tipo || !formValues.configuracion} 
              className="submit-btn"
            >
              {loading ? 'Actualizando Juego...' : <><MdSave style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} /> Actualizar y Publicar Juego</>}
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

export default JuegosEditar;