import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import { MdSchool, MdHome, MdMenuBook, MdAssignment, MdSportsEsports, MdGroup, MdLogout, MdWavingHand, MdMenu, MdClose } from 'react-icons/md';
import ThemeToggle from '../../components/layout/ThemeToggle';
import './DashboardDocente.css';

const DocenteDashboard = () => {
  const [data, setData] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Se permite abrir el menú con el parámetro ?drawer=1 (útil en pruebas/responsive).
  const [menuOpen, setMenuOpen] = useState(() => new URLSearchParams(window.location.search).get('drawer') === '1');
  const navigate = useNavigate();

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
      const isStudent = userData.role === 'student' || userData.role === 'estudiante';
      if (isStudent) {
        navigate('/student/dashboard', { replace: true });
        return;
      }
      setUser(userData);
    } catch (error) {
      console.error("Error decodificando token", error);
      localStorage.removeItem('token');
      navigate('/login');
    }

    api.get('/teacher/dashboard')
      .then(res => setData(res.data.data))
      .catch(err => console.error('Error al cargar dashboard:', err))
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  if (!user || loading) return <div className="loading">Cargando plataforma...</div>;

  const userName = user?.name || 'Docente';

  return (
    <div className="dashboard-container cartoon-area">
      {/* Overlay del menú móvil: cierra el drawer al tocar fuera de él */}
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
          <a
            href="#"
            className="nav-item active"
            onClick={() => setMenuOpen(false)}
          >
            <span><MdHome /></span> Inicio
          </a>

          <Link to="/contenidos" className="nav-item" onClick={() => setMenuOpen(false)}><span><MdMenuBook /></span> Mis Contenidos</Link>
          <Link to="/evaluaciones" className="nav-item" onClick={() => setMenuOpen(false)}><span><MdAssignment /></span> Mis Evaluaciones</Link>
          <Link to="/juegos" className="nav-item" onClick={() => setMenuOpen(false)}><span><MdSportsEsports /></span> Mis Juegos</Link>
          <Link to="/gestion-alumnos" className="nav-item" onClick={() => setMenuOpen(false)}><span><MdGroup /></span> Gestión de Alumnos</Link>
          <Link to="/gestion-alumnos/grupos" className="nav-item" onClick={() => setMenuOpen(false)}><span><MdGroup /></span> Grupos</Link>
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="logout-btn">
            <span><MdLogout /></span> Cerrar Sesión
          </button>
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
          <h1>Panel Principal</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ThemeToggle />
            <div className="user-badge">
              <span className="user-role"><MdSchool /> Docente</span>
              <span className="user-name">{userName}</span>
            </div>
          </div>
        </header>

        <section className="dashboard-content">
          <div className="welcome-card">
            <h2>¡Hola {userName}! <MdWavingHand /></h2>
            <p>
              Estás conectado como <strong>Profesor</strong>.
              Elige alguna de las herramientas a tu izquierda para crear contenidos interactivos y ver el progreso de tus alumnos.
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
        </section>
      </main>
    </div>
  );
};

export default DocenteDashboard;