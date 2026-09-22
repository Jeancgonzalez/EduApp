import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
  MdSchool, MdHome, MdMenuBook, MdAssignment, MdSportsEsports, MdEmojiEvents,
  MdLogout, MdWavingHand, MdInsights, MdCheckCircle, MdStar, MdFlag,
  MdMenu, MdClose
} from 'react-icons/md';
import { MEDAL_ICONS } from '../../utils/medalIcons';
import ThemeToggle from '../../components/layout/ThemeToggle';
import MascotaEduApp from '../../components/MascotaEduApp';
import './DashboardEstduiante.css';

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [gamificacion, setGamificacion] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [diagnostico, setDiagnostico] = useState(null);
  // Se permite abrir el menú con el parámetro ?drawer=1 (útil en pruebas/responsive).
  const [menuOpen, setMenuOpen] = useState(() => new URLSearchParams(window.location.search).get('drawer') === '1');

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
      const isTeacher = userData.role === 'teacher' || userData.role === 'docente';
      if (isTeacher) {
        navigate('/teacher/dashboard', { replace: true });
        return;
      }
      setUser(userData);
    } catch (error) {
      console.error("Error decodificando token", error);
      localStorage.removeItem('token');
      navigate('/login');
    }

     api.get('/student/dashboard')
       .then(res => setData(res.data.data))
       .catch(err => console.error('Error:', err))
       .finally(() => setLoading(false));

    api.get('/student/gamificacion')
      .then(res => setGamificacion(res.data.data))
      .catch(err => console.error('Error al cargar gamificación:', err));

    api.get('/student/diagnostico')
      .then(res => setDiagnostico(res.data.data))
      .catch(() => setDiagnostico(null));
   [];

  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  if (!user) return <div className="loading">Cargando plataforma...</div>;

  const userName = user?.name || 'Estudiante';
  const gamif = gamificacion || {};
  const pctNivel = gamif.puntos_total ? ((gamif.puntos_total % 500) / 500) * 100 : 0;
  const medallas = gamif.medallas || [];
  const puntosTotal = gamif.puntos_total || 0;
  const estrellas = gamif.estrellas_totales || 0;
  const progresoGeneral = data?.overallProgress || 0;

  return (
    <div className="dashboard-container student-area">
      {/* Overlay del menú móvil: cierra el drawer al tocar fuera de él */}
      <div
        className={`sidebar-overlay ${menuOpen ? 'open' : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-icon-small"><MdSchool /></div>
          <h2>EduApp</h2>
        </div>
        
        <nav className="sidebar-nav">
          <a className="nav-item active" onClick={() => setMenuOpen(false)}><span><MdHome /></span> Inicio</a>
          <Link to="/student/contenidos" className="nav-item" onClick={() => setMenuOpen(false)}><span><MdMenuBook /></span> Mis Clases</Link>
          <Link to="/student/evaluaciones" className="nav-item" onClick={() => setMenuOpen(false)}><span><MdAssignment /></span> Mis Evaluaciones</Link>
          <Link to="/student/juegos" className="nav-item" onClick={() => setMenuOpen(false)}><span><MdSportsEsports /></span> Zona de Juegos</Link>
          <Link to="/student/progreso" className="nav-item" onClick={() => setMenuOpen(false)}><span><MdEmojiEvents /></span> Mi Progreso</Link>
          
        </nav>
        <div className="sidebar-footer">
          <button onClick={handleLogout} className="logout-btn"><span><MdLogout /></span> Cerrar Sesión</button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="main-header">
          {/* Botón de menú: visible solo en móvil para abrir el drawer */}
          <button
            className="mobile-nav-toggle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <MdClose /> : <MdMenu />}
          </button>
          <h1>Panel de Estudiante</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ThemeToggle />
            <div className="user-badge student-badge">
              <span className="user-role"><MdSchool /> Estudiante</span>
              <span className="user-name">{userName}</span>
            </div>
          </div>
        </header>

        <section className="dashboard-content">
          <div className="welcome-card">
            <div>
              <h2>¡Hola {userName}! <MdWavingHand /></h2>
              <p>Bienvenido a tu espacio de aprendizaje. Revisa tus contenidos, juegos, evaluaciones y sigue progresando. ¡Cada paso cuenta!</p>
            </div>
            <MascotaEduApp
              medallas={gamif.medallas_obtenidas || 0}
              puntos={puntosTotal}
              progreso={progresoGeneral}
              contexto="dashboard"
              mensaje="Hola, mi nombre es Eddu y te acompañaré a divertirte mientras aprendes 🧠👓"
              className="mascota-welcome"
            />
</div>

          {diagnostico && diagnostico.obligatorio === true && diagnostico.estado !== 'completado' && (
            <div className="mision-dashboard-cta">
              <div className="mision-cta-icono"><MdFlag /></div>
              <div className="mision-cta-texto">
                <h3>Misión Digital</h3>
                <p>Descubre cómo usas la tecnología para aprender. Son solo {diagnostico.total || 10} situaciones, una sola vez.</p>
              </div>
              <Link to="/student/mision" className="mision-cta-btn">
                {diagnostico.estado === 'en_progreso' ? 'Continuar misión' : 'Comenzar misión'}
              </Link>
            </div>
          )}

          {diagnostico && diagnostico.obligatorio === true && diagnostico.estado === 'completado' && (
            <div className="mision-dashboard-cta completada">
              <div className="mision-cta-icono"><MdFlag /></div>
              <div className="mision-cta-texto">
                <h3>Misión Digital completada</h3>
                <p>Gracias por participar y realizar todas las preguntas. !Disfruta de la aplicacion 😋!</p>
              </div>
              <Link to="/student/mision" className="mision-cta-btn">Ver</Link>
            </div>
)}
            <div className="gamificacion-card">
              <div className="gamificacion-header">
              <div className="gamificacion-icon"><MdEmojiEvents /></div>
              <div className="gamificacion-title">
                <h3>Mi Gamificación</h3>
                <span>{gamif.medallas_obtenidas || 0}/{gamif.medallas_totales || 0} medallas · {gamif.estrellas_totales || 0} <MdStar style={{ verticalAlign: 'middle' }} /></span>
              </div>
              <div className="nivel-badge">Nivel {gamif.nivel || 1}</div>
            </div>

            <div className="gamificacion-puntos">
              <span className="puntos-valor">{gamif.puntos_total || 0}</span>
              <span className="puntos-label">Puntos totales</span>
              <span className="puntos-siguiente">Faltan {gamif.puntos_para_siguiente_nivel ?? 500} pts para el siguiente nivel</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar progress-bar-gamif" style={{ width: `${Math.min(pctNivel, 100)}%` }}>
                {pctNivel > 0 ? `${Math.round(pctNivel)}%` : ''}
              </div>
            </div>

            {medallas.length > 0 && (
              <div className="medallas-grid">
                {medallas.map(m => {
                  const Icon = MEDAL_ICONS[m.id] || MdEmojiEvents;
                  return (
                    <div
                      key={m.id}
                      className={`medalla-item ${m.obtenida ? 'obtenida' : 'por-conseguir'}`}
                      title={m.obtenida ? `${m.nombre}: ${m.descripcion}` : `${m.nombre} - Por conseguir: ${m.condicion || m.descripcion}`}
                    >
                      <Icon />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="progress-card">
            <div className="progress-title">
              <span><MdInsights /></span> Progreso General
            </div>
            <div className='text-progress'>Realiza los juegos y evaluaciones para llegar al 100%</div>
            <div className="progress-bar-container">
              <div className="progress-bar progress-bar-modulo" style={{ width: `${data?.overallProgress || 0}%` }}>
                {data?.overallProgress || 0}%
              </div>
            </div>
            {data?.completedModules?.length > 0 && (
              <div className="completed-modules">
                {data.completedModules.map((mod, i) => (
                  <span key={i} style={{ background: '#ecfdf5', color: '#059669', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}><MdCheckCircle style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />{mod}</span>
                ))}
              </div>
            )}
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <h3><MdMenuBook /> Contenidos</h3>
              <p>{data?.contentsViewed || 0}/{data?.totalContents || 0}</p>
            </div>
            <div className="stat-card">
              <h3><MdSportsEsports /> Juegos</h3>
              <p>{data?.gamesCompleted || 0}/{data?.totalGames || 0}</p>
            </div>
            <div className="stat-card">
              <h3><MdAssignment /> Evaluaciones</h3>
              <p>{data?.evaluationsCompleted || 0}/{data?.totalEvaluations || 0}</p>
            </div>
            <div className="stat-card">
              <h3><MdEmojiEvents /> Módulos Completados</h3>
              <p>{data?.completedModules?.length || 0}</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default StudentDashboard;