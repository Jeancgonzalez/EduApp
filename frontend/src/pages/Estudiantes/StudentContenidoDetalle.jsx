import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { MdArrowBack, MdCheckCircle, MdVideoLibrary, MdDescription, MdLink, MdTextFields, MdWarning, MdMenuBook } from 'react-icons/md';
import LessonContent from '../../components/LessonContent';
import './StudentContenidosDetalle.css';

const StudentContenidoDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contenido, setContenido] = useState(null);
  const [accesoRegistrado, setAccesoRegistrado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/contenidos/${id}`);
        
        if (!res.data.data) {
          throw new Error('Contenido no encontrado');
        }
        
        setContenido(res.data.data);
        
        // Registrar acceso al contenido
        try {
          await api.post(`/student/contenidos/${id}/acceder`);
          setAccesoRegistrado(true);
        } catch (err) {
          console.error('Error al registrar acceso:', err);
        }
        
      } catch (err) {
        console.error('Error al cargar contenido:', err);
        setError(err.response?.data?.message || 'No se pudo cargar el contenido');
      } finally {
        setLoading(false);
      }
    };
    
    fetch();
  }, [id]);

  if (loading) {
    return (
      <div className="detalle-error-page">
        <div className="detalle-error-content">
          <div className="spinner" style={{ 
            width: '40px', 
            height: '40px', 
            margin: '0 auto 1rem',
            border: '3px solid #e2e8f0',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }}></div>
          <p className="detalle-error-text">Cargando contenido...</p>
        </div>
      </div>
    );
  }

  if (error || !contenido) {
    return (
      <div className="detalle-error-page">
        <div className="detalle-error-content">
          <MdWarning className="detalle-error-icon" />
          <h2 className="detalle-error-title">Contenido no disponible</h2>
          <p className="detalle-error-text">
            {error || 'Este contenido no existe, fue eliminado o no está disponible para tu docente.'}
          </p>
          <button onClick={() => navigate('/student/contenidos')} className="detalle-error-btn">
            <MdArrowBack /> Volver a Contenidos
          </button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (contenido.tipo) {
      case 'video': {
        const esYouTube = contenido.contenido.includes('youtube.com') || contenido.contenido.includes('youtu.be');
        if (esYouTube) {
          return (
            <div className="video-container">
              <iframe
                src={contenido.contenido}
                title={contenido.titulo}
                allowFullScreen
                style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }}
              ></iframe>
            </div>
          );
        }
        return (
          <div className="video-container">
            <video controls style={{ width: '100%', height: '100%', borderRadius: '8px', background: '#000' }}>
              <source src={contenido.contenido} type="video/mp4" />
              Tu navegador no soporta la reproducción de video.
            </video>
          </div>
        );
      }
      case 'pdf':
        return (
          <div className="pdf-container">
            <iframe
              src={contenido.contenido}
              title={contenido.titulo}
              style={{ width: '100%', height: '600px', border: 'none', borderRadius: '8px' }}
            ></iframe>
          </div>
        );
      case 'documento':
        return (
          <div className="documento-container" style={{ textAlign: 'center', padding: '2rem' }}>
            <MdDescription style={{ fontSize: '3rem', color: '#6b7280', marginBottom: '1rem' }} />
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              Este documento no se puede previsualizar en el navegador.
            </p>
            <a
              href={contenido.contenido}
              download
              className="submit-btn-contenido"
              style={{ display: 'inline-flex', gap: '0.5rem', padding: '0.75rem 1.5rem' }}
            >
              <MdDescription /> Descargar Documento
            </a>
          </div>
        );
      case 'enlace':
        return (
          <div className="enlace-container" style={{ textAlign: 'center', padding: '2rem' }}>
            <MdLink className="enlace-icon" style={{ fontSize: '3rem', color: '#2563eb', marginBottom: '1rem' }} />
            <a 
              href={contenido.contenido} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="submit-btn-contenido"
              style={{ display: 'inline-flex', gap: '0.5rem', padding: '0.75rem 1.5rem' }}
            >
              Abrir Recurso Externo
            </a>
          </div>
        );
      case 'texto':
        return (
          <div className="texto-container leccion-contenido">
            <LessonContent html={contenido.contenido} />
          </div>
        );
      default:
        return (
          <div className="texto-container">
            <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{contenido.contenido}</p>
          </div>
        );
    }
  };

  return (
    <div className="detalle-container student-area">
      <button onClick={() => navigate('/student/contenidos')} className="detalle-back">
        <MdArrowBack style={{ marginRight: '0.5rem' }} /> Volver a Contenidos
      </button>

      <div className="detalle-card">
        <div className="detalle-meta">
          <span className="badge tipo">
            {contenido.tipo === 'video' && <MdVideoLibrary style={{ marginRight: '0.25rem' }} />}
            {contenido.tipo === 'pdf' && <MdDescription style={{ marginRight: '0.25rem' }} />}
            {contenido.tipo === 'documento' && <MdDescription style={{ marginRight: '0.25rem' }} />}
            {contenido.tipo === 'enlace' && <MdLink style={{ marginRight: '0.25rem' }} />}
            {contenido.tipo === 'texto' && <MdTextFields style={{ marginRight: '0.25rem' }} />}
            {contenido.tipo === 'texto' ? 'Lección' : contenido.tipo.charAt(0).toUpperCase() + contenido.tipo.slice(1)}
          </span>
          <span className="badge modulo">
            <MdMenuBook style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> {contenido.modulo}
          </span>
          {accesoRegistrado && (
            <span className="badge" style={{ background: '#d1fae5', color: '#065f46' }}>
              <MdCheckCircle style={{ marginRight: '0.25rem' }} /> Acceso registrado
            </span>
          )}
        </div>

        <h1 className="detalle-titulo">{contenido.titulo}</h1>
        
        {contenido.descripcion && (
          <div className="detalle-descripcion">
            {contenido.descripcion}
          </div>
        )}

        <div className="detalle-contenido">
          {renderContent()}
        </div>

        {accesoRegistrado && (
          <div className="form-success" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MdCheckCircle /> Acceso registrado exitosamente
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .video-container {
          position: relative;
          width: 100%;
          aspect-ratio: 16/9;
        }
        
        .pdf-container {
          width: 100%;
          min-height: 600px;
        }
        
        .texto-container {
          line-height: 1.8;
          color: #334155;
        }

        .leccion-contenido {
          line-height: 1.8;
          color: #334155;
          max-width: 100%;
          overflow-x: auto;
        }
        .leccion-contenido p { margin: 0 0 0.5em; }
        .leccion-contenido h1 { font-size: 2em; margin: 0.67em 0; font-weight: 700; }
        .leccion-contenido h2 { font-size: 1.5em; margin: 0.75em 0; font-weight: 600; }
        .leccion-contenido h3 { font-size: 1.17em; margin: 0.83em 0; font-weight: 600; }
        .leccion-contenido h4 { font-size: 1em; margin: 1em 0; font-weight: 600; }
        .leccion-contenido ul, .leccion-contenido ol { padding-left: 1.5em; margin: 0.5em 0; }
        .leccion-contenido li { margin: 0.25em 0; }
        .leccion-contenido a { color: #2563eb; text-decoration: underline; }
        .leccion-contenido img { max-width: 100%; height: auto; border-radius: 4px; margin: 0.5em 0; }
        .leccion-contenido img[style*="float: left"] { margin-right: 1em; }
        .leccion-contenido img[style*="float: right"] { margin-left: 1em; }
        .leccion-contenido blockquote { border-left: 3px solid #d1d5db; padding-left: 1em; margin: 0.5em 0; color: #6b7280; }
        .leccion-contenido pre { background: #1f2937; color: #f3f4f6; border-radius: 6px; padding: 12px 16px; font-family: 'Courier New', monospace; font-size: 14px; overflow-x: auto; margin: 0.5em 0; }
        .leccion-contenido code { background: #f3f4f6; border-radius: 3px; padding: 2px 4px; font-size: 0.9em; }
        .leccion-contenido pre code { background: none; padding: 0; border-radius: 0; color: inherit; }
        .leccion-contenido table { border-collapse: collapse; margin: 0.5em 0; width: 100%; }
        .leccion-contenido td, .leccion-contenido th { border: 2px solid #d1d5db; padding: 8px 12px; vertical-align: top; }
        .leccion-contenido th { background: #f9fafb; font-weight: 600; }
        .leccion-contenido hr { border: none; border-top: 2px solid #d1d5db; margin: 1em 0; }
        
        .enlace-icon {
          font-size: 3rem;
          color: #2563eb;
          margin-bottom: 1rem;
        }
      `}</style>
    </div>
  );
};

export default StudentContenidoDetalle;