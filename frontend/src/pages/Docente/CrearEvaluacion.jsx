import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import GrupoMultiSelect from '../../components/GrupoMultiSelect';
import './CrearEvaluacion.css';

const CrearEvaluacion = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isTeacher } = useAuth();
  const [modulos, setModulos] = useState([]);
  const [contenidoApoyoError, setContenidoApoyoError] = useState('');
  const [warningSinModulo, setWarningSinModulo] = useState('');
  const [formValues, setFormValues] = useState({
    titulo: '',
    descripcion: '',
    modulo: '',
    modulo_content_id: '',
    tiempoLimitado: false,
    tiempoMinutos: 5,
    requiere_contenido_apoyo: false,
    contenido_apoyo_id: '',
    limitarIntentos: false,
    max_intentos: '',
    grupo_ids: []
  });

  const [preguntas, setPreguntas] = useState([
    {
      id: 1,
      enunciado: '',
      opciones: { A: '', B: '', C: '', D: '' },
      respuestaCorrecta: '',
      retroalimentacion: ''
    }
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (!isTeacher) {
      navigate('/evaluaciones');
      return;
    }

    api.get('/contenidos/modulos')
      .then(res => setModulos(res.data?.data || []))
      .catch(() => setModulos([]));
  }, [isAuthenticated, isTeacher, navigate]);

  const validarContenidoApoyo = async (contentId) => {
    if (!contentId) {
      setFormValues((prev) => ({ ...prev, contenido_apoyo_id: '' }));
      setContenidoApoyoError('Selecciona un contenido para usar como apoyo.');
      return;
    }
    try {
      const res = await api.get(`/contenidos/${contentId}`);
      const contenido = res.data?.data;
      if (contenido) {
        setFormValues((prev) => ({ ...prev, contenido_apoyo_id: contentId }));
        setContenidoApoyoError('');
      } else {
        setFormValues((prev) => ({ ...prev, contenido_apoyo_id: '' }));
        setContenidoApoyoError('No es posible crear esta evaluación porque el módulo seleccionado no posee contenidos de apoyo disponibles.');
      }
    } catch {
      setFormValues((prev) => ({ ...prev, contenido_apoyo_id: '' }));
      setContenidoApoyoError('No es posible crear esta evaluación porque el módulo seleccionado no posee contenidos de apoyo disponibles.');
    }
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    if (name === 'limitarIntentos') {
      setFormValues((prev) => ({
        ...prev,
        limitarIntentos: checked,
        max_intentos: checked ? prev.max_intentos : ''
      }));
      return;
    }

    if (name === 'requiere_contenido_apoyo') {
      if (checked) {
        setFormValues((prev) => ({ ...prev, requiere_contenido_apoyo: true }));
        if (!formValues.modulo_content_id) {
          setWarningSinModulo('Primero debes seleccionar un módulo para poder utilizar contenido de apoyo.');
        } else {
          setWarningSinModulo('');
          validarContenidoApoyo(formValues.modulo_content_id);
        }
      } else {
        setFormValues((prev) => ({
          ...prev,
          requiere_contenido_apoyo: false,
          contenido_apoyo_id: ''
        }));
        setContenidoApoyoError('');
        setWarningSinModulo('');
      }
      return;
    }

    if (name === 'modulo') {
      if (modulos.length > 0) {
        const contentId = value;
        const contenido = modulos.find((m) => String(m.id) === contentId);
        const moduloNombre = contenido ? contenido.modulo : '';
        setFormValues((prev) => ({
          ...prev,
          modulo: moduloNombre,
          modulo_content_id: contentId
        }));
        setContenidoApoyoError('');
        setWarningSinModulo('');
        if (formValues.requiere_contenido_apoyo) {
          if (contentId) {
            validarContenidoApoyo(contentId);
          } else {
            setWarningSinModulo('Primero debes seleccionar un módulo para poder utilizar contenido de apoyo.');
            setFormValues((prev) => ({ ...prev, contenido_apoyo_id: '' }));
          }
        }
      } else {
        setFormValues((prev) => ({ ...prev, modulo: value }));
        setContenidoApoyoError('');
        setWarningSinModulo('');
        if (formValues.requiere_contenido_apoyo) {
          if (value) {
            validarContenidoApoyo(value);
          } else {
            setWarningSinModulo('Primero debes seleccionar un módulo para poder utilizar contenido de apoyo.');
            setFormValues((prev) => ({ ...prev, contenido_apoyo_id: '' }));
          }
        }
      }
      return;
    }

    setFormValues((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handlePreguntaChange = (id, field, value) => {
    setPreguntas((prev) =>
      prev.map((pregunta) =>
        pregunta.id === id
          ? field === 'opciones'
            ? { ...pregunta, opciones: { ...pregunta.opciones, ...value } }
            : { ...pregunta, [field]: value }
          : pregunta
      )
    );
  };

  const agregarPregunta = () => {
    const nuevaPregunta = {
      id: preguntas.length + 1,
      enunciado: '',
      opciones: { A: '', B: '', C: '', D: '' },
      respuestaCorrecta: '',
      retroalimentacion: ''
    };
    setPreguntas((prev) => [...prev, nuevaPregunta]);
  };

  const eliminarPregunta = (id) => {
    if (preguntas.length > 1) {
      setPreguntas((prev) => prev.filter((pregunta) => pregunta.id !== id));
    }
  };

  const validarFormulario = () => {
    if (!formValues.titulo.trim()) {
      setError('El título es obligatorio.');
      return false;
    }

    if (!formValues.modulo.trim()) {
      setError('El módulo es obligatorio.');
      return false;
    }

    if (formValues.requiere_contenido_apoyo) {
      if (!formValues.modulo) {
        setContenidoApoyoError('Debe seleccionar un módulo para utilizar contenido de apoyo o desactivar esta opción.');
        return false;
      }
      if (!formValues.contenido_apoyo_id) {
        setContenidoApoyoError('No es posible crear esta evaluación porque el módulo seleccionado no posee contenidos de apoyo disponibles.');
        return false;
      }
    }

    if (formValues.limitarIntentos) {
      const intentos = Number(formValues.max_intentos);
      if (!formValues.max_intentos || !Number.isInteger(intentos) || intentos < 1) {
        setError('La cantidad de intentos debe ser un número entero mayor o igual a 1.');
        return false;
      }
    }

    for (let i = 0; i < preguntas.length; i++) {
      const pregunta = preguntas[i];
      if (!pregunta.enunciado.trim()) {
        setError(`La pregunta ${i + 1} necesita un enunciado.`);
        return false;
      }

      if (!pregunta.opciones.A.trim() || !pregunta.opciones.B.trim() ||
          !pregunta.opciones.C.trim() || !pregunta.opciones.D.trim()) {
        setError(`La pregunta ${i + 1} necesita todas las opciones (A, B, C, D).`);
        return false;
      }

      if (!pregunta.respuestaCorrecta) {
        setError(`La pregunta ${i + 1} necesita una respuesta correcta.`);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!validarFormulario()) {
      return;
    }

    setLoading(true);

    try {
      const evaluacionData = {
        ...formValues,
        docente_id: user.id,
        preguntas: preguntas.map(({ id, ...rest }) => rest)
      };

      if (!evaluacionData.modulo_content_id) {
        delete evaluacionData.modulo_content_id;
      }

      if (!evaluacionData.requiere_contenido_apoyo) {
        delete evaluacionData.contenido_apoyo_id;
      }

      // Array vacío = visible para todos los grupos.
      evaluacionData.grupo_ids = Array.isArray(evaluacionData.grupo_ids) ? evaluacionData.grupo_ids : [];

      evaluacionData.max_intentos = formValues.limitarIntentos
        ? Number(formValues.max_intentos)
        : null;

      const response = await api.post('/evaluaciones', evaluacionData);

      setSuccess('Evaluación creada exitosamente.');
      setTimeout(() => {
        navigate('/evaluaciones');
      }, 800);
    } catch (err) {
      console.error('Error al crear evaluación:', err);
      setError(err.response?.data?.message || 'Error al crear la evaluación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="crear-evaluacion-container cartoon-area">
      <button className="volver-btn" onClick={() => navigate(-1)}>
        ← Volver a Evaluaciones
      </button>

      <div className="crear-evaluacion-header">
        <h2>Crear Nueva Evaluación</h2>
      </div>

      <form onSubmit={handleSubmit} className="crear-evaluacion-form">
        <div className="form-section">
          <h3>Información General</h3>

          <div className="form-group">
            <label htmlFor="titulo">Título *</label>
            <input
              type="text"
              id="titulo"
              name="titulo"
              value={formValues.titulo}
              onChange={handleChange}
              placeholder="Ej: Evaluación de Matemáticas Básicas"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="descripcion">Descripción</label>
            <textarea
              id="descripcion"
              name="descripcion"
              value={formValues.descripcion}
              onChange={handleChange}
              placeholder="Describe brevemente el contenido de la evaluación"
              rows="3"
            />
          </div>

          <div className="form-group">
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
                  <option key={m.id} value={m.id}>{m.modulo} – {m.titulo} ({m.publicado ? 'Publicado' : 'Despublicado'})</option>
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

      <GrupoMultiSelect
        value={formValues.grupo_ids}
        onChange={(grupoIds) => setFormValues((prev) => ({ ...prev, grupo_ids: grupoIds }))}
      />

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="tiempoLimitado"
                checked={formValues.tiempoLimitado}
                onChange={handleChange}
              />
              <span>Evaluación con tiempo limitado</span>
            </label>
          </div>

          {formValues.tiempoLimitado && (
            <div className="form-group">
              <label htmlFor="tiempoMinutos">Tiempo límite (minutos)</label>
              <select
                id="tiempoMinutos"
                name="tiempoMinutos"
                value={formValues.tiempoMinutos}
                onChange={handleChange}
              >
                <option value={5}>5 minutos</option>
                <option value={10}>10 minutos</option>
                <option value={15}>15 minutos</option>
                <option value={20}>20 minutos</option>
                <option value={25}>25 minutos</option>
                <option value={30}>30 minutos</option>
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="limitarIntentos"
                checked={formValues.limitarIntentos}
                onChange={handleChange}
              />
              <span>Limitar cantidad de intentos</span>
            </label>
          </div>
            
          {formValues.limitarIntentos && (
            <div className="form-group">
              <label htmlFor="max_intentos">Cantidad de intentos permitidos </label>
              <input
                type="number"
                id="max_intentos"
                name="max_intentos"
                value={formValues.max_intentos}
                onChange={handleChange}
                min="1"
                step="1"
                placeholder="Ej: 1, 2, 3..."
              />
            </div>
          )}

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="requiere_contenido_apoyo"
                checked={formValues.requiere_contenido_apoyo}
                onChange={handleChange}
              />
              <span>Mostrar contenido de apoyo antes de iniciar la evaluación</span>
            </label>
          </div>

          {formValues.requiere_contenido_apoyo && (
            <div className="contenido-apoyo-block">
              {warningSinModulo && (
                <div className="alerta-info" style={{ background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e' }}>
                  {warningSinModulo}
                </div>
              )}
              {!warningSinModulo && (
                <div className="alerta-info">
                  El estudiante visualizara el módulo seleccionado como contenido de apoyo antes de iniciar esta evaluación. Sirve para reforzar conceptos clave relacionados a las preguntas que se presentarán posteriormente.
                </div>
              )}
              {contenidoApoyoError && (
                <div className="error-message">{contenidoApoyoError}</div>
              )}
            </div>
          )}
        </div>

        <div className="form-section">
          <div className="preguntas-header">
            <h3>Preguntas</h3>
            <button type="button" onClick={agregarPregunta} className="agregar-pregunta-btn">
              + Agregar Pregunta
            </button>
          </div>

          {preguntas.map((pregunta, index) => (
            <div key={pregunta.id} className="pregunta-card">
              <div className="pregunta-header">
                <h4>Pregunta {index + 1}</h4>
                {preguntas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => eliminarPregunta(pregunta.id)}
                    className="eliminar-pregunta-btn"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="form-group">
                <label>Enunciado *</label>
                <textarea
                  value={pregunta.enunciado}
                  onChange={(e) => handlePreguntaChange(pregunta.id, 'enunciado', e.target.value)}
                  placeholder="Escribe la pregunta aquí"
                  rows="2"
                  required
                />
              </div>

              <div className="opciones-grid">
                {['A', 'B', 'C', 'D'].map((letra) => (
                  <div key={letra} className="form-group">
                    <label>Opción {letra} *</label>
                    <input
                      type="text"
                      value={pregunta.opciones[letra]}
                      onChange={(e) => handlePreguntaChange(pregunta.id, 'opciones', { [letra]: e.target.value })}
                      placeholder={`Opción ${letra}`}
                      required
                    />
                  </div>
                ))}
              </div>

              <div className="form-group">
                <label>Respuesta Correcta *</label>
                <select
                  value={pregunta.respuestaCorrecta}
                  onChange={(e) => handlePreguntaChange(pregunta.id, 'respuestaCorrecta', e.target.value)}
                  required
                >
                  <option value="">Seleccionar...</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </select>
              </div>

              <div className="form-group">
                <label>Retroalimentación</label>
                <textarea
                  value={pregunta.retroalimentacion}
                  onChange={(e) => handlePreguntaChange(pregunta.id, 'retroalimentacion', e.target.value)}
                  placeholder="Explicación, recomendación o comentario sobre esta pregunta (opcional)"
                  rows="2"
                />
              </div>
            </div>
          ))}
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="form-actions">
          <button type="submit" disabled={loading} className="submit-btn">
            {loading ? 'Creando...' : 'Crear Evaluación'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CrearEvaluacion;
