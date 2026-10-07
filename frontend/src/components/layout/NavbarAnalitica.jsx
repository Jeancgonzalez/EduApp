import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import CampanaNotificaciones from '../CampanaNotificaciones';
import {
  MdSchool,
  MdDashboard,
  MdGroups,
  MdEmojiEvents,
  MdBook,
  MdMilitaryTech,
  MdInsertDriveFile,
  MdLogout,
  MdMenu,
  MdClose,
  MdBarChart, 
} from 'react-icons/md';
import './NavbarAnalitica.css';

/**
 * Navbar de la sección Analítica.
 *
 * Estructura idéntica al navbar principal (brand + links + acciones) pero
 * scopeada con clases `.analitica-*` para no colisionar con `.navbar`.
 *
 * Conserva los query params (grupoId, semanas, estudiante) al cambiar de
 * sección para no perder el filtro activo al navegar entre pestañas.
 */
const SECCIONES = [
  { to: '/docente/dashboard', icon: <MdDashboard />, label: 'Inicio' },
  { to: '/dashboard/analitica/resumen',             icon: <MdBarChart  />,       label: 'Resumen' },
  { to: '/dashboard/analitica/vista-grupo',         icon: <MdGroups />,          label: 'Vista de Grupo' },
  { to: '/dashboard/analitica/progreso-individual', icon: <MdEmojiEvents />,     label: 'Progreso Individual' },
  { to: '/dashboard/analitica/contenidos',          icon: <MdBook />,            label: 'Contenidos' },
  { to: '/dashboard/analitica/gamificacion',        icon: <MdMilitaryTech />,    label: 'Gamificación' },
  
];

const NavbarAnalitica = () => {
  const { user, isTeacher, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const qs = location.search; // conserva ?grupoId=&semanas=&estudiante=

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="analitica-navbar" aria-label="Panel de Analítica">
      {/* ---------- Brand ---------- */}
      <div className="analitica-brand">
        <div className="analitica-logo">
          <MdSchool />
        </div>
        <span className="analitica-title">EduApp</span>
      </div>

      {/* ---------- Links ---------- */}
      <div className={`analitica-links ${menuOpen ? 'open' : ''}`}>
        {SECCIONES.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={{ pathname: to, search: qs }}
            end
            className={({ isActive }) =>
              `analitica-link${isActive ? ' active' : ''}`
            }
            onClick={() => setMenuOpen(false)}
          >
            <span className="analitica-icon">{icon}</span>
            <span className="analitica-label">{label}</span>
          </NavLink>
        ))}
      </div>

      {/* ---------- Acciones ---------- */}
      <div className="analitica-actions">
        <ThemeToggle />

        {/* La campana va solo para el docente */}
        {isTeacher && <CampanaNotificaciones />}

        {user && (
          <div className="analitica-user">
            <span className="analitica-user-role">{isTeacher ? '👨‍🏫' : '🎓'}</span>
            <span className="analitica-user-name">{user.name || 'Usuario'}</span>
          </div>
        )}

        <button
          type="button"
          className="analitica-logout-btn"
          onClick={handleLogout}
          title="Cerrar sesión"
        >
          <MdLogout />
        </button>

        <button
          type="button"
          className="analitica-hamburger"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Menú"
        >
          {menuOpen ? <MdClose /> : <MdMenu />}
        </button>
      </div>
    </nav>
  );
};

export default NavbarAnalitica;