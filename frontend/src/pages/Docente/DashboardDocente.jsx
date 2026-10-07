import React, { useEffect, useState } from 'react';
import { useNavigate, Link, NavLink, useLocation } from 'react-router-dom';
import api from '../../services/api';
import {
  MdSchool, MdHome, MdMenuBook, MdAssignment, MdSportsEsports, MdGroup,
  MdLogout, MdWavingHand, MdMenu, MdClose, MdBarChart, MdGroups,
  MdEmojiEvents, MdBook, MdInsertDriveFile, MdMilitaryTech,
  MdExpandLess, MdExpandMore,
} from 'react-icons/md';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../../components/layout/ThemeToggle';
import DashboardDocenteAnalitica from './DashboardDocenteAnalitica';
import FiltrosAnalitica from './FiltrosAnalitica';
import ResumenGeneral from './ResumenGeneral';
import CampanaNotificaciones from '../../components/CampanaNotificaciones';
import './DashboardDocente.css';

const DocenteDashboard = () => {
  const [data, setData] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(
    () => new URLSearchParams(window.location.search).get('drawer') === '1'
  );
  const [analiticaOpen, setAnaliticaOpen] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();
  const { logout, isTeacher } = useAuth();   // 👈 añadido isTeacher

  const enAnalitica = location.pathname.startsWith('/dashboard/analitica');

  const searchParams = new URLSearchParams(location.search);
  const grupoId = searchParams.get('grupoId') ? Number(searchParams.get('grupoId')) : null;
  const semanas = Number(searchParams.get('semanas')) || 8;

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      const userData = JSON.parse(jsonPayload);
      const isStudent = userData.role === 'student' || userData.role === 'estudiante';
      if (isStudent) {
        navigate('/student/dashboard', { replace: true });
        return;
      }
      setUser(userData);
    } catch (error) {
      console.error('Error decodificando token', error);
      localStorage.removeItem('token');
      navigate('/login');
    }

    api.get('/teacher/dashboard')
      .then((res) => setData(res.data.data))
      .catch((err) => console.error('Error al cargar dashboard:', err))
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user || loading) return <div className="loading">Cargando plataforma...</div>;

  const userName = user?.name || 'Docente';

  return (
    <div className="dashboard-container cartoon-area">
      <div
        className={`sidebar-overlay ${menuOpen ? 'open' : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-icon-small">
            <MdSchool />
          </div>
          <h2>EduApp</h2>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/docente/dashboard" end className="nav-item" onClick={() => setMenuOpen(false)}>
            <span><MdHome /></span> Inicio
          </NavLink>
          <Link to="/contenidos" className="nav-item" onClick={() => setMenuOpen(false)}>
            <span><MdMenuBook /></span> Mis Contenidos
          </Link>
          <Link to="/evaluaciones" className="nav-item" onClick={() => setMenuOpen(false)}>
            <span><MdAssignment /></span> Mis Evaluaciones
          </Link>
          <Link to="/juegos" className="nav-item" onClick={() => setMenuOpen(false)}>
            <span><MdSportsEsports /></span> Mis Juegos
          </Link>
          <Link to="/gestion-alumnos" className="nav-item" onClick={() => setMenuOpen(false)}>
            <span><MdGroup /></span> Gestión de Alumnos
          </Link>
          <Link to="/gestion-alumnos/grupos" className="nav-item" onClick={() => setMenuOpen(false)}>
            <span><MdGroup /></span> Grupos
          </Link>

          <div className={`nav-section ${analiticaOpen ? 'open' : 'closed'}`}>
            <button
              type="button"
              className="nav-section-title"
              onClick={() => setAnaliticaOpen((o) => !o)}
              aria-expanded={analiticaOpen}
              aria-controls="nav-section-analitica"
            >
              <MdBarChart aria-hidden="true" />
              <span>Analítica</span>
              <span className="nav-section-chevron">
                {analiticaOpen ? <MdExpandLess /> : <MdExpandMore />}
              </span>
            </button>

            {analiticaOpen && (
              <div id="nav-section-analitica" className="nav-section-body">
                <NavLink to="/dashboard/analitica/resumen" className="nav-item" onClick={() => setMenuOpen(false)}>
                  <span><MdBarChart /></span> Resumen General
                </NavLink>
                <NavLink to="/dashboard/analitica/vista-grupo" className="nav-item" onClick={() => setMenuOpen(false)}>
                  <span><MdGroups /></span> Vista de Grupo
                </NavLink>
                <NavLink to="/dashboard/analitica/progreso-individual" className="nav-item" onClick={() => setMenuOpen(false)}>
                  <span><MdEmojiEvents /></span> Progreso Individual
                </NavLink>
                <NavLink to="/dashboard/analitica/contenidos" className="nav-item" onClick={() => setMenuOpen(false)}>
                  <span><MdBook /></span> Contenidos
                </NavLink>
                <NavLink to="/dashboard/analitica/gamificacion" className="nav-item" onClick={() => setMenuOpen(false)}>
                  <span><MdMilitaryTech /></span> Gamificación
                </NavLink>
                <NavLink to="/dashboard/analitica/reportes" className="nav-item" onClick={() => setMenuOpen(false)}>
                  <span><MdInsertDriveFile /></span> Reportes
                </NavLink>
              </div>
            )}
          </div>
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="logout-btn">
            <span><MdLogout /></span> Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        {/* Header "Panel Principal": SOLO fuera de Analítica */}
        {!enAnalitica && (
          <header className="main-header">
            <button
              className="mobile-nav-toggle"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <MdClose /> : <MdMenu />}
            </button>
            <h1>Panel Principal</h1>
            <div className="navbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <ThemeToggle />

              {/* La campana va solo para el docente: las notificaciones son del
                  panel de Analítica, no del campus del estudiante. */}
              {isTeacher && <CampanaNotificaciones />}

              <div className="user-badge">
                <span className="user-role"><MdSchool /> Docente</span>
                <span className="user-name">{userName}</span>
              </div>
            </div>
          </header>
        )}

        {/* En Analítica: botón hamburguesa flotante para el sidebar en móvil */}
        {enAnalitica && (
          <button
            type="button"
            className="mobile-nav-toggle mobile-nav-toggle-floating"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <MdClose /> : <MdMenu />}
          </button>
        )}

        <section className="dashboard-content">
          {/* ---------- VISTA DASHBOARD (fuera de Analítica) ---------- */}
          {!enAnalitica && (
            <>
              <div className="welcome-card">
                <h2>¡Hola {userName}! <MdWavingHand /></h2>
                <p>
                  Estás conectado como <strong>Profesor</strong>.
                  Elige alguna de las herramientas a tu izquierda para crear
                  contenidos interactivos y ver el progreso de tus alumnos.
                </p>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <h3>Estudiantes Registrados</h3>
                  <p>{data?.totalStudents ?? 0}</p>
                </div>
                <div className="stat-card">
                  <h3>Juegos Activos</h3>
                  <p>{data?.totalGames ?? 0}</p>
                </div>
                <div className="stat-card">
                  <h3>Evaluaciones Activas</h3>
                  <p>{data?.totalEvaluations ?? 0}</p>
                </div>
              </div>

              {/* Resumen General inline (sin NavbarAnalitica) */}
              <div className="dashboard-resumen-inline">
                <FiltrosAnalitica />
                <ResumenGeneral grupoId={grupoId} semanas={semanas} />
              </div>
            </>
          )}

          {/* ---------- VISTA ANALÍTICA ---------- */}
          {enAnalitica && <DashboardDocenteAnalitica />}
        </section>
      </main>
    </div>
  );
};

export default DocenteDashboard;