import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { useIntentoActividad } from '../../hooks/useTelemetria';
import { MdArrowBack, MdCheckCircle, MdError, MdStars, MdAccessTime, MdQuiz, MdMenuBook, MdVisibility, MdReplay, MdFeedback, MdStar, MdStarBorder } from 'react-icons/md';
import Swal from 'sweetalert2';
import LessonContent from '../../components/LessonContent';
import MascotaEduApp from '../../components/MascotaEduApp';
import './StudentEvaluacionResolver.css';

const estrellasDePorcentaje = (pct) => {
  if (pct === null || pct === undefined) return 0;
  if (pct >= 90) return 3;
  if (pct >= 70) return 2;
  return 1;
};

const Estrellas = ({ estrellas = 0 }) => (
  <span style={{ display: 'inline-flex', gap: '0.15rem', alignItems: 'center' }}>
    {[1, 2, 3].map(n => (
      n <= estrellas
        ? <MdStar key={n} style={{ color: '#f59e0b', fontSize: '2rem' }} />
        : <MdStarBorder key={n} style={{ color: '#cbd5e1', fontSize: '2rem' }} />
    ))}
  </span>
);

const StudentEvaluacionResolver = () => {
  const { id } = useParams();
  const [evaluacion, setEvaluacion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [respuestas, setRespuestas] = useState({});
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [tiempoRestante, setTiempoRestante] = useState(null);
  const [iniciado, setIniciado] = useState(false);
  const [contenidoApoyo, setContenidoApoyo] = useState(null);
  const [contenidoVisto, setContenidoVisto] = useState(false);
  const [mostrandoContenido, setMostrandoContenido] = useState(false);
  const [estadoEvaluacion, setEstadoEvaluacion] = useState(null);
  const [mostrandoFeedback, setMostrandoFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState(null);
  const [resumenEvaluaciones, setResumenEvaluaciones] = useState(null);

  // El intento se abre al pulsar "Comenzar Evaluación" y no al cargar la página:
  // así recargar o volver a entrar no infla el número de intentos del dashboard.
  const intentoId = useIntentoActividad('evaluacion', id, iniciado);
  const intervalRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const evRes = await api.get(`/evaluaciones/${id}`);
        const data = evRes.data.data;
        if (!data || !data.preguntas) {
          setError('Esta evaluación no tiene preguntas configuradas.');
          setLoading(false);
          return;
        }
        setEvaluacion(data);

        const estadoRes = await api.get(`/student/evaluaciones/${id}/estado`);
        setEstadoEvaluacion(estadoRes.data.data);

        if (estadoRes.data.data.feedback_visto && !estadoRes.data.data.es_ilimitado) {
          const fbRes = await api.post(`/student/evaluaciones/${id}/retroalimentacion`);
          setFeedbackData(fbRes.data.data);
          setMostrandoFeedback(true);
          setLoading(false);
          return;
        }

        if (data.requiere_contenido_apoyo) {
          try {
            const caRes = await api.get(`/student/evaluaciones/${id}/contenido-apoyo`);
            setContenidoApoyo(caRes.data.data);
            if (caRes.data.data.contenido) {
              setMostrandoContenido(true);
            }
          } catch {
          }
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Error al cargar la evaluación.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  useEffect(() => {
    if (iniciado && evaluacion?.tiempoLimitado && evaluacion?.tiempoMinutos) {
      const totalSeg = evaluacion.tiempoMinutos * 60;
      setTiempoRestante(totalSeg);
      intervalRef.current = setInterval(() => {
        setTiempoRestante(prev => {
          if (prev <= 1) { clearInterval(intervalRef.current); handleSubmit(true); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [iniciado, evaluacion]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const handleVerContenidoApoyo = async () => {
    try {
      await api.post(`/student/evaluaciones/${id}/contenido-apoyo/visto`);
      setContenidoVisto(true);
      setMostrandoContenido(false);
    } catch {
      setContenidoVisto(true);
      setMostrandoContenido(false);
    }
  };

  const handleSubmit = async (auto = false) => {
    setEnviando(true);
    try {
      const respuestasArray = Object.entries(respuestas).map(([pid, r]) => ({ pregunta_id: Number(pid), respuesta: r }));
      const res = await api.post(`/student/evaluaciones/${id}/responder`, {
        respuestas: respuestasArray,
        // Cierra el intento abierto al comenzar la evaluación; el backend calcula
        // la duración. Si vale `null`, la calificación se guarda igual.
        intento_id: intentoId,
      });
      setResultado(res.data.data);
      try {
        const listaRes = await api.get('/student/evaluaciones/publicadas');
        const lista = listaRes.data.data || [];
        const total = lista.length;
        const completados = lista.filter(e => e.completado).length;
        setResumenEvaluaciones({ total, completados, pendientes: Math.max(0, total - completados) });
      } catch { }
      const estadoRes = await api.get(`/student/evaluaciones/${id}/estado`);
      setEstadoEvaluacion(estadoRes.data.data);

      if (estadoRes.data.data.es_ilimitado) {
        const fbRes = await api.post(`/student/evaluaciones/${id}/retroalimentacion`);
        setFeedbackData(fbRes.data.data);
        setMostrandoFeedback(true);
      } else if (!auto) {
        Swal.fire({ icon: res.data.data.puntaje >= 60 ? 'success' : 'info', title: res.data.data.puntaje >= 60 ? '¡Excelente!' : 'Sigue practicando', text: res.data.message, confirmButtonColor: '#7c3aed' });
      }
    } catch (err) {
      if (!auto) Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message || 'Error al enviar respuestas' });
    } finally { setEnviando(false); }
  };

  const handleReintentar = () => {
    setRespuestas({});
    setResultado(null);
    setIniciado(false);
    setTiempoRestante(null);
    setMostrandoFeedback(false);
    setFeedbackData(null);
  };

  const handleVerFeedback = async () => {
    if (estadoEvaluacion?.puede_reintentar && !estadoEvaluacion?.es_ilimitado) {
      const confirm = await Swal.fire({
        icon: 'warning',
        title: '¡Atención!',
        text: 'Si decides ver la retroalimentación de esta evaluación, ya no podrás volver a realizarla, aunque aún tengas intentos disponibles. ¿Deseas continuar?',
        showCancelButton: true,
        confirmButtonText: 'Sí, ver retroalimentación',
        cancelButtonText: 'No, volver',
        confirmButtonColor: '#7c3aed',
        cancelButtonColor: '#6b7280'
      });
      if (!confirm.isConfirmed) return;
    }
    try {
      const res = await api.post(`/student/evaluaciones/${id}/retroalimentacion`);
      setFeedbackData(res.data.data);
      setMostrandoFeedback(true);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message || 'Error al cargar retroalimentación' });
    }
  };

  const crearMensajeEvaluacion = (puntaje) => {
    const estrellas = estrellasDePorcentaje(puntaje);
    if (estrellas === 3) return `¡Increíble! Conseguiste ⭐⭐⭐. Tu puntaje fue ${puntaje}/100. ¡Felicidades!`;
    if (estrellas === 2) return `¡Felicidades! Esta vez conseguiste ⭐⭐. Tu puntaje fue ${puntaje}/100. ¡Buen trabajo!`;
    return `¡Ánimo! Tu puntaje fue ${puntaje}/100. Inténtalo nuevamente para conseguir más estrellas.`;
  };

  const esUltimaEvaluacion = resumenEvaluaciones && resumenEvaluaciones.total > 0 && resumenEvaluaciones.pendientes <= 0;

  if (loading) return <div className="student-loading"><div className="spinner"></div><p>Cargando evaluación...</p></div>;
  if (error) return <div className="student-page student-area"><div className="empty-state"><h3>{error}</h3></div></div>;

  if (mostrandoFeedback && feedbackData) {
    return (
      <div className="student-page student-area">
        <Link to="/student/evaluaciones" className="btn-back"><MdArrowBack /> Volver a Evaluaciones</Link>
        <div className="evaluacion-start-card">
          <MascotaEduApp
            expression={feedbackData.puntaje >= 60 ? 'celebrando' : 'animando'}
            size={84}
            className="mascota-inicio"
            contexto="evaluaciones"
            estrellas={estrellasDePorcentaje(feedbackData.puntaje)}
            pendientes={esUltimaEvaluacion ? 0 : resumenEvaluaciones?.pendientes}
            completados={resumenEvaluaciones?.completados}
            mensaje={esUltimaEvaluacion ? undefined : crearMensajeEvaluacion(feedbackData.puntaje)}
          />
          <h1>Retroalimentación</h1>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            Puntaje obtenido: <strong>{feedbackData.puntaje}/100</strong>
          </p>
          <Estrellas estrellas={estrellasDePorcentaje(feedbackData.puntaje)} />
          <div className="resultado-detalle" style={{ marginBottom: '1.5rem' }}>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${feedbackData.puntaje}%` }}><span>{feedbackData.puntaje}%</span></div>
            </div>
          </div>
          <div className="feedback-preguntas">
            {feedbackData.preguntas.map((p, idx) => (
              <div key={p.pregunta_id} className="pregunta-card feedback-item">
                <h4>Pregunta {idx + 1}</h4>
                <p className="pregunta-enunciado">{p.pregunta}</p>
                <div className="opciones-grid">
                  {[p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d].filter(t => t).map((texto, oi) => {
                    const letra = ['a', 'b', 'c', 'd'][oi];
                    const esEstudiante = p.respuesta_estudiante === letra;
                    const esCorrecta = p.respuesta_correcta === letra;
                    let clase = 'opcion-label feedback-opcion';
                    if (esEstudiante && esCorrecta) clase += ' correcta-seleccionada';
                    else if (esEstudiante) clase += ' incorrecta-seleccionada';
                    else if (esCorrecta) clase += ' correcta-no-seleccionada';
                    return (
                      <div key={letra} className={clase}>
                        <span className="opcion-letra">{letra.toUpperCase()}.</span>
                        <span className="opcion-texto">{texto}</span>
                        {esEstudiante && <span className="feedback-marca">{esCorrecta ? '✓' : '✗'}</span>}
                        {esCorrecta && !esEstudiante && <span className="feedback-marca correcta">✓</span>}
                      </div>
                    );
                  })}
                </div>
                <p className="detalle-respuesta">
                  Tu respuesta: <strong>{p.respuesta_estudiante ? p.respuesta_estudiante.toUpperCase() : 'No respondida'}</strong>
                  {p.respuesta_estudiante !== p.respuesta_correcta && (
                    <> | Correcta: <strong className="texto-correcto">{p.respuesta_correcta?.toUpperCase()}</strong></>
                  )}
                </p>
                {p.retroalimentacion && (
                  <div className="retroalimentacion-texto">
                    <strong>Retroalimentación:</strong>
                    <p>{p.retroalimentacion}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            {estadoEvaluacion?.es_ilimitado && (
              <button className="btn-iniciar" onClick={handleReintentar} style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                <MdReplay /> Volver a intentar
              </button>
            )}
            <Link to="/student/evaluaciones" className="btn-volver-jugar" style={{ display: 'inline-block' }}>
              ← Volver a Evaluaciones
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (mostrandoContenido && contenidoApoyo?.contenido) {
    return (
      <div className="student-page student-area">
        <Link to="/student/evaluaciones" className="btn-back"><MdArrowBack /> Volver a Evaluaciones</Link>
        <div className="evaluacion-start-card">
          <MascotaEduApp expression="pensando" size={84} className="mascota-inicio" />
          <MdMenuBook className="start-icon" />
          <h1>Contenido de Apoyo</h1>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
            Revisa el siguiente contenido antes de continuar con la evaluación.
          </p>
            <div className="contenido-apoyo-visualizacion">
              <h2>{contenidoApoyo.contenido.titulo}</h2>
              {contenidoApoyo.contenido.descripcion && (
                <p>{contenidoApoyo.contenido.descripcion}</p>
              )}
              <div className="contenido-cuerpo">
                {(() => {
                  const c = contenidoApoyo.contenido;
                  switch (c.tipo) {
                    case 'video': {
                      const esYouTube = c.contenido.includes('youtube.com') || c.contenido.includes('youtu.be');
                      if (esYouTube) {
                        return (
                          <div className="video-container">
                            <iframe
                              src={c.contenido}
                              title={c.titulo}
                              allowFullScreen
                              style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }}
                            ></iframe>
                          </div>
                        );
                      }
                      return (
                        <div className="video-container">
                          <video controls style={{ width: '100%', height: '100%', borderRadius: '8px', background: '#000' }}>
                            <source src={c.contenido} type="video/mp4" />
                            Tu navegador no soporta la reproducción de video.
                          </video>
                        </div>
                      );
                    }
                    case 'pdf':
                      return (
                        <div className="pdf-container">
                          <iframe
                            src={c.contenido}
                            title={c.titulo}
                            style={{ width: '100%', height: '600px', border: 'none', borderRadius: '8px' }}
                          ></iframe>
                        </div>
                      );
                    case 'documento':
                      return (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>
                          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
                            Este documento no se puede previsualizar en el navegador.
                          </p>
                          <a
                            href={c.contenido}
                            download
                            className="btn-iniciar"
                            style={{ display: 'inline-flex', gap: '0.5rem', padding: '0.75rem 1.5rem', textDecoration: 'none' }}
                          >
                            Descargar Documento
                          </a>
                        </div>
                      );
                    case 'enlace':
                      return (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>
                          <a
                            href={c.contenido}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-iniciar"
                            style={{ display: 'inline-flex', gap: '0.5rem', padding: '0.75rem 1.5rem', textDecoration: 'none' }}
                          >
                            Abrir Recurso Externo
                          </a>
                        </div>
                      );
                    case 'texto':
                      return (
                        <div className="leccion-contenido">
                          <LessonContent html={c.contenido} />
                        </div>
                      );
                    default:
                      return (
                        <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.contenido}</p>
                      );
                  }
                })()}
              </div>
            </div>
            <button className="btn-iniciar" onClick={handleVerContenidoApoyo} style={{ marginTop: '1.5rem' }}>
              <MdVisibility /> Continuar a la evaluación
            </button>
        </div>
      </div>
    );
  }

  if (!iniciado && !resultado) {
    const esIlimitado = estadoEvaluacion && estadoEvaluacion.es_ilimitado;
    const sinIntentos = estadoEvaluacion && !estadoEvaluacion.es_ilimitado && !estadoEvaluacion.puede_reintentar && !estadoEvaluacion.feedback_visto;
    return (
      <div className="student-page student-area">
        <Link to="/student/evaluaciones" className="btn-back"><MdArrowBack /> Volver a Evaluaciones</Link>
        <div className="evaluacion-start-card">
          <MascotaEduApp expression="animando" size={84} className="mascota-inicio" />
          <MdQuiz className="start-icon" />
          <h1>{evaluacion.titulo}</h1>
          <p>{evaluacion.descripcion}</p>
          <div className="start-info">
            <span><strong>Módulo:</strong> {evaluacion.modulo}</span>
            {evaluacion.tiempoLimitado && evaluacion.tiempoMinutos && <span><strong>Tiempo límite:</strong> {evaluacion.tiempoMinutos} minutos</span>}
            <span><strong>Preguntas:</strong> {evaluacion.preguntas?.length || 0}</span>
            {estadoEvaluacion && (
              <span><strong>Intentos:</strong> {esIlimitado ? 'ilimitados' : `${estadoEvaluacion.intentos_realizados}/${estadoEvaluacion.max_intentos}`}</span>
            )}
          </div>
          {sinIntentos ? (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <p style={{ color: '#92400e', marginBottom: '1rem' }}>Has agotado todos tus intentos. Visualiza la retroalimentación para finalizar.</p>
              <button className="btn-iniciar" onClick={handleVerFeedback} style={{ background: '#7c3aed' }}>
                <MdFeedback /> Ver retroalimentación
              </button>
            </div>
          ) : (
            <button className="btn-iniciar" onClick={() => setIniciado(true)}>
              <MdAccessTime /> Comenzar Evaluación
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="student-page student-area">
      <div className="evaluacion-resolver-header">
        <div className="resolver-info">
          <h1>{evaluacion.titulo}</h1>
          <span className="modulo-badge">{evaluacion.modulo}</span>
        </div>
        {tiempoRestante !== null && (
          <div className={`tiempo-restante ${tiempoRestante < 60 ? 'tiempo-critico' : ''}`}>
            <MdAccessTime /> {formatTime(tiempoRestante)}
          </div>
        )}
      </div>

      {!resultado ? (
        <>
          <div className="preguntas-list">
            {(evaluacion.preguntas || []).map((p, idx) => (
              <div key={p.id} className="pregunta-card">
                <div className="pregunta-numero">Pregunta {idx + 1}</div>
                <p className="pregunta-enunciado">{p.pregunta}</p>
                <div className="opciones-grid">
                  {[{ l: 'a', t: p.opcion_a }, { l: 'b', t: p.opcion_b }, { l: 'c', t: p.opcion_c }, { l: 'd', t: p.opcion_d }].filter(o => o.t).map(o => (
                    <label key={o.l} className={`opcion-label ${respuestas[p.id] === o.l ? 'selected' : ''}`}>
                      <input type="radio" name={`p_${p.id}`} value={o.l} onChange={() => setRespuestas({ ...respuestas, [p.id]: o.l })} />
                      <span className="opcion-letra">{o.l.toUpperCase()}.</span>
                      <span className="opcion-texto">{o.t}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="evaluacion-actions">
            <span className="respuestas-count">Respondidas: {Object.keys(respuestas).length} / {evaluacion.preguntas?.length || 0}</span>
            <button className="btn-enviar" onClick={() => handleSubmit(false)} disabled={enviando || Object.keys(respuestas).length === 0}>
              {enviando ? 'Enviando...' : <><MdStars /> Enviar Respuestas</>}
            </button>
          </div>
        </>
      ) : (
        <div className="resultado-card">
          <MascotaEduApp
            expression={resultado.puntaje >= 60 ? 'celebrando' : 'animando'}
            size={86}
            className="mascota-resultado"
            contexto="evaluaciones"
            estrellas={estrellasDePorcentaje(resultado.puntaje)}
            pendientes={esUltimaEvaluacion ? 0 : resumenEvaluaciones?.pendientes}
            completados={resumenEvaluaciones?.completados}
            mensaje={esUltimaEvaluacion ? undefined : crearMensajeEvaluacion(resultado.puntaje)}
          />
          <div className="resultado-icono">{resultado.puntaje >= 60 ? <MdCheckCircle style={{ color: '#059669' }} /> : <MdError style={{ color: '#dc2626' }} />}</div>
          <h3>{resultado.puntaje >= 60 ? '¡Excelente trabajo!' : 'Sigue practicando'}</h3>
          <div className="resultado-puntaje"><MdStars /> Puntaje: {resultado.puntaje}/100</div>
          <Estrellas estrellas={estrellasDePorcentaje(resultado.puntaje)} />
          <div className="resultado-detalle">
            <p>Respuestas correctas: {resultado.respuestas_correctas} de {resultado.total_preguntas}</p>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${resultado.puntaje}%` }}><span>{resultado.puntaje}%</span></div>
            </div>
            {estadoEvaluacion && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#6b7280' }}>
                Intentos: {estadoEvaluacion.es_ilimitado ? 'ilimitados' : `${estadoEvaluacion.intentos_realizados}/${estadoEvaluacion.max_intentos}`}
              </p>
            )}
          </div>
          <div className="resultado-acciones" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            {estadoEvaluacion?.puede_reintentar && (
              <button className="btn-iniciar" onClick={handleReintentar} style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                <MdReplay /> Volver a intentar
              </button>
            )}
            <button className="btn-iniciar" onClick={handleVerFeedback} style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center', background: '#7c3aed' }}>
              <MdFeedback /> Ver retroalimentación
            </button>
          </div>
          <Link to="/student/evaluaciones" className="btn-volver-jugar">← Volver a Evaluaciones</Link>
        </div>
      )}
    </div>
  );
};

export default StudentEvaluacionResolver;
