import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
  MdSchool, MdLogout, MdFlag, MdCheckCircle, MdArrowForward, MdStar
} from 'react-icons/md';
import ThemeToggle from '../../components/layout/ThemeToggle';
import MascotaEduApp from '../../components/MascotaEduApp';
import './StudentMisionDigital.css';

/**
 * Misión Digital (IAD-Primaria).
 * Experiencia gamificada que aplica el instrumento de alfabetización digital
 * a todo estudiante nuevo. Reutiliza el shell del apartado estudiante
 * (sidebar + cartoon). Flujos: intro / misión (situación a situación) / resultado.
 */
const StudentMisionDigital = () => {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('Estudiante');
  const [estado, setEstado] = useState('cargando'); // cargando | intro | mision | resultado | error
  const [pregunta, setPregunta] = useState(null);
  const [respondidas, setRespondidas] = useState(0);
  const [total, setTotal] = useState(10);
  const [seleccion, setSeleccion] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [obligatorio, setObligatorio] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      const userData = JSON.parse(jsonPayload);
      if (userData.role === 'teacher' || userData.role === 'docente') {
        navigate('/docente/dashboard', { replace: true });
        return;
      }
      setUserName(userData.name || 'Estudiante');
    } catch (e) {
      localStorage.removeItem('token');
      navigate('/login');
      return;
    }

    api.get('/student/diagnostico')
      .then(res => {
        const d = res.data.data;
        setObligatorio(d.obligatorio === true);
        if (d.estado === 'completado') {
          setEstado('resultado');
        } else if (d.estado === 'en_progreso') {
          setPregunta(d.pregunta);
          setRespondidas(d.respondidas || 0);
          setTotal(d.total || 10);
          setEstado('mision');
        } else {
          setTotal(d.total || 10);
          setEstado('intro');
        }
      })
      .catch(err => {
        setError(err.response?.data?.message || 'No se pudo consultar la Misión Digital.');
        setEstado('error');
      });
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const comenzar = async () => {
    setEnviando(true);
    try {
      const res = await api.post('/student/diagnostico/iniciar');
      const d = res.data.data;
      if (d.estado === 'completado') {
        setEstado('resultado');
      } else {
        setPregunta(d.pregunta);
        setRespondidas(d.respondidas || 0);
        setTotal(d.total || 10);
        setEstado('mision');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo iniciar la misión.');
      setEstado('error');
    } finally {
      setEnviando(false);
    }
  };

  const siguiente = async () => {
    if (!seleccion || !pregunta) return;
    setEnviando(true);
    try {
      const res = await api.post('/student/diagnostico/responder', {
        pregunta_id: pregunta.id,
        letra: seleccion,
      });
      const d = res.data.data;
      if (d.estado === 'completado') {
        setEstado('resultado');
      } else {
        setPregunta(d.pregunta);
        setRespondidas(d.respondidas || 0);
        setTotal(d.total || 10);
        setSeleccion(null);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar la respuesta.');
      setEstado('error');
    } finally {
      setEnviando(false);
    }
  };

  const renderMascota = (mensaje, expression = 'celebrando', size = 110) => (
    <MascotaEduApp
      mensaje={mensaje}
      expression={expression}
      size={size}
      contexto="mision"
      className="mascota-mision"
    />
  );

  const renderDotProgress = (actual) => {
    return (
      <div className="mision-dots" aria-label={`Misión ${actual} de ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`mision-dot ${i < actual ? 'completada' : ''} ${i === actual ? 'actual' : ''}`} />
        ))}
      </div>
    );
  };

  return (
    <div className="dashboard-container student-area">
      <main className="dashboard-main">
        <header className="main-header">
          <div className="mision-header-left">
            <h1>Misión Digital</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button className="mision-header-logout" onClick={handleLogout} title="Cerrar sesión">
              <MdLogout />
            </button>
            <ThemeToggle />
            <div className="user-badge student-badge">
              <span className="user-role"><MdSchool /> Estudiante</span>
              <span className="user-name">{userName}</span>
            </div>
          </div>
        </header>

        <section className="dashboard-content">
          {estado === 'cargando' && <div className="loading">Preparando la misión...</div>}

          {estado === 'error' && (
            <div className="mision-card mision-error">
              <h2>Ups, algo salió mal</h2>
              <p>{error}</p>
              <button className="mision-btn mision-btn-primario" onClick={() => window.location.reload()}>
                Reintentar
              </button>
            </div>
          )}
{estado === 'intro' && (
            <div className="mision-card mision-intro">
              <div className="mision-decor" aria-hidden="true">
                <MdStar className="mision-decor-star mision-decor-star-1" />
                <MdStar className="mision-decor-star mision-decor-star-2" />
                <MdStar className="mision-decor-star mision-decor-star-3" />
                <MdStar className="mision-decor-star mision-decor-star-4" />
                <MdStar className="mision-decor-star mision-decor-star-5" />
                <MdStar className="mision-decor-star mision-decor-star-6" />
                <MdStar className="mision-decor-star mision-decor-star-7" />
                <MdStar className="mision-decor-star mision-decor-star-8" />
                <MdStar className="mision-decor-star mision-decor-star-9" />
                <MdStar className="mision-decor-star mision-decor-star-10" />
              </div>
              <div className="mision-intro-mascota">
{renderMascota(
                  '¡Hola! Soy Eddu. Vamos a descubrir cómo usas la tecnología para aprender. ¡Tú puedes!',
                  'celebrando',
                  158
                )}
              </div>
              <div className="mision-intro-texto">
                <h2>Misión Digital</h2>
                <p>
                  Participa en una aventura de {total} situaciones para conocer cómo
                  usas las herramientas digitales. No hay respuestas equivocadas
                </p>
                <ul className="mision-intro-lista">
                  <li><MdCheckCircle /> Una sola vez, sin calificación.</li>
                  <li><MdCheckCircle /> Responde lo que harías en cada situación.</li>
                </ul>

                {obligatorio && (
                  <p className="mision-intro-obligatoria">
                    Esta misión es obligatoria: debes completarla antes de continuar
                    explorando el aplicativo.
                  </p>
                )}

                <button
                  className="mision-btn mision-btn-primario"
                  onClick={comenzar}
                  disabled={enviando}
                >
                  {enviando ? 'Comenzando...' : 'Comenzar misión'}
                </button>
              </div>
            </div>
          )}

          {estado === 'mision' && pregunta && (
            <div className="mision-card mision-activa">
              <div className="mision-cabecera">
                <div className="mision-titulo">
                  <MdFlag className="mision-titulo-icono" />
                  <span>Misión {respondidas + 1} de {total}</span>
                </div>
                {renderDotProgress(respondidas)}
              </div>

              <div className="mision-activa-mascota">
                {renderMascota('Lee y elige la opción de lo que harías.', 'pensando')}
              </div>

              <div className="mision-situacion">
                <span className="mision-dimension">{pregunta.dimension_nombre}</span>
                <p>{pregunta.situacion}</p>
              </div>

              <div className="mision-opciones">
                {pregunta.opciones.map(opcion => (
                  <button
                    key={opcion.letra}
                    type="button"
                    className={`mision-opcion ${seleccion === opcion.letra ? 'seleccionada' : ''}`}
                    onClick={() => setSeleccion(opcion.letra)}
                  >
                    <span className="mision-opcion-letra">{opcion.letra}</span>
                    <span className="mision-opcion-texto">{opcion.texto}</span>
                  </button>
                ))}
              </div>

              <div className="mision-acciones">
                <button
                  className="mision-btn mision-btn-primario"
                  onClick={siguiente}
                  disabled={!seleccion || enviando}
                >
                  {enviando ? 'Guardando...' : 'Siguiente'} <MdArrowForward />
                </button>
              </div>
            </div>
          )}

          {estado === 'resultado' && (
            <div className="mision-card mision-resultado">
              <div className="mision-activa-mascota mision-resultado-nube">
                {renderMascota(
                  '¡Listo! Ya completaste la encuesta. Gracias por participar. Disfruta de la aplicación.',
                  'celebrando'
                )}
              </div>

              <h2>¡Misión Digital completada!</h2>
              <p className="mision-resultado-nota">
                Felicitaciones ya realizastes todas las preguntas. Ya puedes usar la aplicación 😊.
              </p>

              <div className="mision-acciones">
                <button className="mision-btn mision-btn-primario" onClick={() => navigate('/student/dashboard')}>
                  Salir
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default StudentMisionDigital;