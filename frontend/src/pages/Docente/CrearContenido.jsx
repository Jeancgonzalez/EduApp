import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import RichTextEditor from '../../components/RichTextEditor';
import GrupoSelect from '../../components/GrupoSelect';
import './CrearContenido.css';

const TIPO_CONFIG = {
  texto: {
    label: 'Lección',
    requiereContenido: true,
    esRichText: true,
    placeholders: { contenido: 'Escribe aquí el contenido de tu lección...' }
  },
  video: {
    label: 'Video',
    requiereUrl: true,
    urlLabel: 'Enlace de YouTube',
    urlPlaceholder: 'https://www.youtube.com/watch?v=...',
    aceptaArchivo: true,
    archivoLabel: 'Subir archivo .mp4 (alternativa)',
    archivoAcepta: '.mp4',
    mensaje: 'Proporciona un enlace de YouTube o sube un archivo .mp4'
  },
  pdf: {
    label: 'PDF',
    requiereArchivo: true,
    archivoLabel: 'Subir archivo PDF (.pdf)',
    archivoAcepta: '.pdf',
    mensaje: 'Debes cargar un archivo PDF'
  },
  documento: {
    label: 'Word',
    requiereArchivo: true,
    archivoLabel: 'Subir documento (.doc, .docx)',
    archivoAcepta: '.doc,.docx',
    mensaje: 'Debes cargar un archivo de Word'
  }
};

const CrearContenido = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isTeacher } = useAuth();
  const [formValues, setFormValues] = useState({
    titulo: '',
    descripcion: '',
    tipo: '',
    contenido: '',
    modulo: '',
    grupo_id: ''
  });
  const [archivo, setArchivo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const tipoActual = formValues.tipo;
  const config = TIPO_CONFIG[tipoActual];

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!isTeacher) {
      navigate('/contenidos');
      return;
    }
  }, [isAuthenticated, isTeacher, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setArchivo(file || null);
    setError('');
  };

  const inputValido = () => {
    if (!formValues.titulo.trim()) return false;
    if (!formValues.modulo.trim()) return false;
    if (!tipoActual) return false;
    if (!config) return false;

    if (config.requiereContenido && config.esRichText) {
      const textContent = formValues.contenido ? formValues.contenido.replace(/<[^>]*>/g, '').trim() : '';
      if (!textContent) return false;
    } else if (config.requiereContenido && !formValues.contenido.trim()) {
      return false;
    }

    if (config.requiereUrl && config.aceptaArchivo) {
      const tieneUrl = formValues.contenido && formValues.contenido.trim();
      const tieneArchivo = !!archivo;
      if (!tieneUrl && !tieneArchivo) return false;
    }

    if (config.requiereUrl && !config.aceptaArchivo) {
      if (!formValues.contenido.trim()) return false;
    }

    if (config.requiereArchivo && !archivo) return false;

    return true;
  };

  const puedePublicar = inputValido();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!puedePublicar) {
      setError('Completa todos los campos obligatorios según el tipo seleccionado.');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('titulo', formValues.titulo);
      formData.append('descripcion', formValues.descripcion);
      formData.append('tipo', tipoActual);
      formData.append('contenido', formValues.contenido);
      formData.append('modulo', formValues.modulo);
      if (formValues.grupo_id) {
        formData.append('grupo_id', formValues.grupo_id);
      }
      formData.append('docente_id', user?.id || '');
      if (archivo) {
        formData.append('archivo', archivo);
      }

      await api.post('/contenidos', formData);

      setSuccess('Contenido creado exitosamente.');
      setFormValues({ titulo: '', descripcion: '', tipo: '', contenido: '', modulo: '', grupo_id: '' });
      setArchivo(null);
      setTimeout(() => navigate('/contenidos'), 800);
    } catch (err) {
      console.error('Error al crear contenido:', err);
      setError(err.response?.data?.message || 'Error al crear el contenido. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="detalle-container cartoon-area">
      <button className="detalle-back" onClick={() => navigate('/contenidos')}>
        ← Volver
      </button>

      <div className="crear-contenido-container">
        <div className="crear-contenido-card">
          <h2>Crear nuevo contenido</h2>

          <form onSubmit={handleSubmit} className="crear-contenido-form">
            <label>
              Título
              <input
                type="text"
                name="titulo"
                value={formValues.titulo}
                onChange={handleChange}
                placeholder="Título del contenido"
                required
              />
            </label>

            <label>
              Descripción (opcional)
              <textarea
                name="descripcion"
                value={formValues.descripcion}
                onChange={handleChange}
                placeholder="Información adicional del contenido"
                rows="3"
              />
            </label>

            <label>
              Tipo de contenido
              <select name="tipo" value={formValues.tipo} onChange={handleChange} required>
                <option value="">Selecciona un tipo</option>
                {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </label>

            {config && (
              <div className="tipo-fields">
                {config.requiereContenido && !config.esRichText && (
                  <label>
                    Contenido textual
                    <textarea
                      name="contenido"
                      value={formValues.contenido}
                      onChange={handleChange}
                      placeholder={config.placeholders?.contenido || 'Escribe el contenido aqui...'}
                      rows="6"
                    />
                  </label>
                )}

                {config.requiereContenido && config.esRichText && (
                  <div className="rte-field">
                    <label>Contenido de la lección</label>
                    <RichTextEditor
                      value={formValues.contenido}
                      onChange={(html) => {
                        setFormValues((prev) => ({ ...prev, contenido: html }));
                        setError('');
                      }}
                      placeholder={config.placeholders?.contenido}
                    />
                  </div>
                )}

                {config.requiereUrl && (
                  <label>
                    {config.urlLabel || 'URL del recurso'}
                    <input
                      type="url"
                      name="contenido"
                      value={formValues.contenido}
                      onChange={handleChange}
                      placeholder={config.urlPlaceholder || 'https://...'}
                    />
                  </label>
                )}

                {config.aceptaArchivo && (
                  <label className={`file-label ${archivo ? 'file-selected' : ''}`}>
                    {config.archivoLabel || 'Subir archivo'}
                    <input
                      type="file"
                      accept={config.archivoAcepta}
                      onChange={handleFileChange}
                      className="file-input"
                    />
                    {archivo && <span className="file-name">{archivo.name}</span>}
                  </label>
                )}

                {config.requiereArchivo && (
                  <label className="file-label">
                    {config.archivoLabel || 'Subir archivo'}
                    <input
                      type="file"
                      accept={config.archivoAcepta}
                      onChange={handleFileChange}
                      className="file-input"
                      required
                    />
                    {archivo && <span className="file-name">{archivo.name}</span>}
                  </label>
                )}

                {config.mensaje && (
                  <p className="tipo-hint">{config.mensaje}</p>
                )}
              </div>
            )}

            <label>
              Módulo
              <input
                type="text"
                name="modulo"
                value={formValues.modulo}
                onChange={handleChange}
                placeholder="Ej: Matemáticas, Lengua, Ciencias..."
                required
              />
            </label>

            <GrupoSelect
              value={formValues.grupo_id}
              onChange={(grupoId) => setFormValues((prev) => ({ ...prev, grupo_id: grupoId }))}
            />

            {error && <div className="form-error">{error}</div>}
            {success && <div className="form-success">{success}</div>}

            <button type="submit" className="submit-btn" disabled={loading || !puedePublicar}>
              {loading ? 'Guardando...' : !puedePublicar ? 'Complete los requisitos' : 'Crear contenido'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CrearContenido;
