import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import {
  MdDashboard,
  MdMenuBook,
  MdSportsEsports,
  MdAssignment,
  MdBarChart,
  MdLogout,
  MdMenu,
  MdClose,
  MdSchool
} from 'react-icons/md';
import './Navbar.css';

const Navbar = () => {
  const { user, isTeacher, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const teacherLinks = [
    { to: '/docente/dashboard', icon: <MdDashboard />, label: 'Inicio' },
    { to: '/contenidos', icon: <MdMenuBook />, label: 'Contenidos' },
    { to: '/juegos', icon: <MdSportsEsports />, label: 'Juegos' },
    { to: '/evaluaciones', icon: <MdAssignment />, label: 'Evaluaciones' },
    {to : '/gestion-alumnos', icon: <MdSchool />, label: 'Gestión de Estudiantes' }
  ];

  const studentLinks = [
    { to: '/student/dashboard', icon: <MdDashboard />, label: 'Inicio' },
    { to: '/student/contenidos', icon: <MdMenuBook />, label: 'Contenidos' },
    { to: '/student/juegos', icon: <MdSportsEsports />, label: 'Zona de Juegos' },
    { to: '/student/evaluaciones', icon: <MdAssignment />, label: 'Mis Evaluaciones' },
    { to: '/student/progreso', icon: <MdBarChart />, label: 'Mi Progreso' },
  ];

  const links = isTeacher ? teacherLinks : studentLinks;

  return (
    <nav className={`navbar ${isTeacher ? 'navbar-teacher' : 'navbar-student'}`}>
      <div className="navbar-brand">
        <div className="navbar-logo">
          <MdSchool />
        </div>
        <span className="navbar-title">EduApp</span>
      </div>

      <div className={`navbar-links ${menuOpen ? 'open' : ''}`}>
        {links.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            <span className="nav-icon">{icon}</span>
            <span className="nav-label">{label}</span>
          </NavLink>
        ))}
      </div>

      <div className="navbar-actions">
        <ThemeToggle />
        {user && (
          <div className="navbar-user">
            <span className="navbar-user-role">{isTeacher ? '👨‍🏫' : '🎓'}</span>
            <span className="navbar-user-name">{user.name || 'Usuario'}</span>
          </div>
        )}
        <button className="navbar-logout-btn" onClick={handleLogout} title="Cerrar sesión">
          <MdLogout />
          <span className="navbar-logout-label"></span>
        </button>
        <button
          className="navbar-hamburger"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menú"
        >
          {menuOpen ? <MdClose /> : <MdMenu />}
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
