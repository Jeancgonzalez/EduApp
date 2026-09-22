import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import GrupoSelect from '../../components/GrupoSelect';
import './EvaluacionesEditar.css';

const EvaluacionesEditar = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isTeacher } = useAuth();
  const [modulos, setModulos] = useState([]);
  const [contenidoApoyoError, setContenidoApoyoError] = useState('');
  const [warningSinModulo, setWarningSinModulo] = useState('');
  const isEditMode = location.pathname.endsWith('/editar');

  const [evaluacion, setEvaluacion] = useState(null);
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
    grupo_id: ''
  });
  const [preguntas, setPreguntas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchEvaluacion = async () => {
      try {
        const modulosResponse = await api.get('/contenidos/modulos');
        setModulos(modulosResponse.data?.data || []);

        const response = await api.get(`/evaluaciones/${id}`);
        const data = response.data?.data || null;

        if (!data) {
          setError('Evaluación no encontrada.');
          return;
        }

        setEvaluacion(data);
        setFormValues({
          titulo: data.titulo || '',
          descripcion: data.descripcion || '',
          modulo: data.modulo || '',
          modulo_content_id: data.modulo_content_id ? String(data.modulo_content_id) : '',
          tiempoLimitado: !!data.tiempoLimitado,
          tiempoMinutos: data.tiempoMinutos || 5,
          requiere_contenido_apoyo: !!data.requiere_contenido_apoyo,
          contenido_apoyo_id: data.contenido_apoyo_id ? String(data.contenido_apoyo_id) : '',
          limitarIntentos: data.max_intentos !== null && data.max_intentos !== undefined,
          max_intentos: data.max_intentos ?? '',
          grupo_id: data.grupo_id ? String(data.grupo_id) : ''
        });

        if (data.requiere_contenido_apoyo && data.modulo) {
          if (data.contenido_apoyo_id) {
            setFormValues((prev) => ({ ...prev, contenido_apoyo_id: String(data.contenido_apoyo_id) }));
          } else {
            try {
              const res = await api.get(`/contenidos/por-modulo/${encodeURIComponent(data.modulo)}`);
              const contents = res.data?.data || [];
              if (contents.length > 0) {
                setFormValues((prev) => ({ ...prev, contenido_apoyo_id: contents[0].id }));
              }
            } catch {
              // No content available
            }
          }
        }

        setPreguntas(
          data.preguntas?.map((pregunta) => ({
            id: pregunta.id || pregunta._id, 
            enunciado: pregunta.pregunta,
            opciones: {
              A: pregunta.opcion_a || '',
              B: pregunta.opcion_b || '',
              C: pregunta.opcion_c || '',
              D: pregunta.opcion_d || ''
            },
            respuestaCorrecta: pregunta.respuesta_correcta?.toUpperCase() || '',
            retroalimentacion: pregunta.retroalimentacion || ''
          })) || []
        );
      } catch (err) {
        console.error('Error al cargar la evaluación:', err);
        setError('No se pudo cargar la evaluación. Verifica el ID o la conexión.');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchEvaluacion();
    }
  }, [id]);

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

  const handlePreguntaChange = (questionId, field, value) => {
    setPreguntas((prev) =>
      prev.map((pregunta) =>
        pregunta.id === questionId
          ? field === 'opciones'
            ? { ...pregunta, opciones: { ...pregunta.opciones, ...value } }
            : { ...pregunta, [field]: value }
          : pregunta
      )
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!formValues.titulo.trim() || !formValues.modulo.trim()) {
      setError('Título y módulo son obligatorios.');
      return;
    }

    if (formValues.limitarIntentos) {
      const intentos = Number(formValues.max_intentos);
      if (!formValues.max_intentos || !Number.isInteger(intentos) || intentos < 1) {
        setError('La cantidad de intentos debe ser un número entero mayor o igual a 1.');
        return;
      }
    }

    if (formValues.requiere_contenido_apoyo) {
      if (!formValues.modulo) {
        setContenidoApoyoError('Debe seleccionar un módulo para utilizar contenido de apoyo o desactivar esta opción.');
        return;
      }
      if (!formValues.contenido_apoyo_id) {
        setContenidoApoyoError('No es posible crear esta evaluación porque el módulo seleccionado no posee contenidos de apoyo disponibles.');
        return;
      }
    }

    const preguntasValidas = preguntas.every((pregunta) => {
      return (
        pregunta.enunciado.trim() &&
        pregunta.opciones.A.trim() &&
        pregunta.opciones.B.trim() &&
        pregunta.opciones.C.trim() &&
        pregunta.opciones.D.trim() &&
        pregunta.respuestaCorrecta
      );
    });

    if (!preguntasValidas) {
      setError('Completa todas las preguntas antes de guardar.');
      return;
    }

    setLoading(true);

    try {
      const updateData = {
        ...formValues,
        preguntas: preguntas.map(({ id: preguntaId, enunciado, opciones, respuestaCorrecta, retroalimentacion }) => ({
          id: preguntaId,
          enunciado,
          opciones,
          respuestaCorrecta,
          retroalimentacion
        }))
      };

      if (!updateData.modulo_content_id) {
        delete updateData.modulo_content_id;
      }

      if (!updateData.requiere_contenido_apoyo) {
        delete updateData.contenido_apoyo_id;
      }

      if (!updateData.grupo_id) {
        delete updateData.grupo_id;
      }

      updateData.max_intentos = formValues.limitarIntentos
        ? Number(formValues.max_intentos)
        : null;

      const response = await api.put(`/evaluaciones/${id}`, updateData);
      setEvaluacion(response.data?.data || response.data);
      setSuccess('Evaluación actualizada correctamente.');
      setTimeout(() => {
        navigate('/evaluaciones');
      }, 900);
    } catch (err) {
      console.error('Error al actualizar evaluación:', err);
      console.error('Respuesta del servidor:', err.response?.status, err.response?.data);
      setError(err.response?.data?.message || err.message || 'Error al actualizar la evaluación.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="detalle-mensaje">Cargando evaluación...</div>;
  }

  if (error) {
    return <div className="detalle-mensaje error">{error}</div>;
  }

  if (!evaluacion) {
    return <div className="detalle-mensaje">Evaluación no encontrada.</div>;
  }

  return (
    <div className="detalle-container cartoon-area">
      <button className="detalle-back" onClick={() => navigate(-1)}>
        ← Volver
      </button>

      {isEditMode && isTeacher ? (
        <form className="detalle-card" onSubmit={handleSubmit}>
          {error && <div className="detalle-mensaje error">{error}</div>}
          {success && <div className="detalle-mensaje success">{success}</div>}

          <h2 className="detalle-titulo">Editar Evaluación</h2>

          <label>
            Título
            <input
              name="titulo"
              value={formValues.titulo}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Descripción
            <textarea
              name="descripcion"
              value={formValues.descripcion}
              onChange={handleChange}
              rows={3}
            />
          </label>

          <label>Módulo *
            {modulos.length > 0 ? (
              <select
                name="modulo"
                value={formValues.modulo_content_id || ''}
                onChange={handleChange}
                required
              >
                <option value="">-- Selecciona un módulo --</option>
                {modulos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.modulo} – {m.titulo} ({m.publicado ? 'Publicado' : 'Despublicado'})
                  </option>
                ))}
              </select>
            ) : (
              <input
                name="modulo"
                value={formValues.modulo}
                onChange={handleChange}
                required
              />
            )}
          </label>

          <GrupoSelect
            value={formValues.grupo_id}
            onChange={(grupoId) => setFormValues((prev) => ({ ...prev, grupo_id: grupoId }))}
          />

          <label className="checkbox-label">
            <input
              type="checkbox"
              name="tiempoLimitado"
              checked={formValues.tiempoLimitado}
              onChange={handleChange}
            />
            Evaluación con tiempo limitado
          </label>

          {formValues.tiempoLimitado && (
            <label>
              Tiempo límite (minutos)
              <select
                name="tiempoMinutos"
                value={formValues.tiempoMinutos}
                onChange={handleChange}
              >
                {[5, 10, 15, 20, 25, 30].map((min) => (
                  <option key={min} value={min}>
                    {min} minutos
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="checkbox-label">
            <input
              type="checkbox"
              name="limitarIntentos"
              checked={formValues.limitarIntentos}
              onChange={handleChange}
            />
            Limitar cantidad de intentos
          </label>
        

          {formValues.limitarIntentos && (
            <label>
              Cantidad de intentos permitidos 
              <input
                type="number"
                name="max_intentos"
                value={formValues.max_intentos}
                onChange={handleChange}
                min="1"
                step="1"
                placeholder="Ej: 1, 2, 3..."
              />
            </label>
          )}

          <label className="checkbox-label">
            <input
              type="checkbox"
              name="requiere_contenido_apoyo"
              checked={formValues.requiere_contenido_apoyo}
              onChange={handleChange}
            />
            Mostrar contenido de apoyo antes de iniciar la evaluación
          </label>

          {formValues.requiere_contenido_apoyo && (
            <div className="contenido-apoyo-block">
              {warningSinModulo && (
                <div className="alerta-info" style={{ background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e' }}>
                  {warningSinModulo}
                </div>
              )}
              {!warningSinModulo && (
                <div className="alerta-info">
                  El estudiante deberá visualizar un contenido de apoyo relacionado con el módulo seleccionado antes de iniciar esta evaluación.
                </div>
              )}
              {contenidoApoyoError && (
                <div className="error-message">{contenidoApoyoError}</div>
              )}
            </div>
          )}

          <div className="detalle-body">
            <h3>Preguntas</h3>
            {preguntas.map((pregunta, index) => (
              <div key={pregunta.id} className="pregunta-card">
                <h4>Pregunta {index + 1}</h4>

                <div className="form-group">
                  <label>
                    Enunciado
                    <textarea
                      value={pregunta.enunciado}
                      onChange={(e) => handlePreguntaChange(pregunta.id, 'enunciado', e.target.value)}
                      rows={2}
                      required
                    />
                  </label>
                </div>

                <div className="opciones-grid">
                  {['A', 'B', 'C', 'D'].map((letra) => (
                    <label key={letra}>
                      Opción {letra}
                      <input
                        value={pregunta.opciones[letra]}
                        onChange={(e) =>
                          handlePreguntaChange(pregunta.id, 'opciones', { [letra]: e.target.value })
                        }
                        required
                      />
                    </label>
                  ))}
                </div>

                <label>
                  Respuesta correcta
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
                </label>

                <label>
                  Retroalimentación
                  <textarea
                    value={pregunta.retroalimentacion}
                    onChange={(e) => handlePreguntaChange(pregunta.id, 'retroalimentacion', e.target.value)}
                    placeholder="Explicación, recomendación o comentario sobre esta pregunta (opcional)"
                    rows={2}
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="form-actions">
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      ) : (
        <div className="detalle-card">
          <h2 className="detalle-titulo">{evaluacion.titulo}</h2>

          <div className="detalle-meta">
            <span className="badge modulo">Módulo {evaluacion.modulo}</span>
            {evaluacion.tiempoLimitado ? (
              <span className="badge tipo">Tiempo: {evaluacion.tiempoMinutos} min</span>
            ) : (
              <span className="badge tipo">Sin límite de tiempo</span>
            )}
          </div>

          {evaluacion.descripcion && (
            <p className="detalle-descripcion">{evaluacion.descripcion}</p>
          )}

          <div className="detalle-body">
            <h3>Preguntas</h3>
            {evaluacion.preguntas?.map((pregunta, index) => (
              <div key={pregunta.id || pregunta._id} className="pregunta-card">
                <h4>{index + 1}. {pregunta.pregunta}</h4>
                <ul>
                  <li>A: {pregunta.opcion_a}</li>
                  <li>B: {pregunta.opcion_b}</li>
                  <li>C: {pregunta.opcion_c}</li>
                  <li>D: {pregunta.opcion_d}</li>
                </ul>
                <p>Correcta: {pregunta.respuesta_correcta?.toUpperCase()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EvaluacionesEditar;
