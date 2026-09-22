import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MdTrendingUp, MdPeople, MdSchool, MdGroup } from 'react-icons/md';
import './GestionAlumnos.css';

const GestionAlumnos = () => {
  const navigate = useNavigate();

  return (
    <div className="gestion-alumnos-container cartoon-area">
      <div className="gestion-header">
        <div className="gestion-header-icon">
          <MdSchool />
        </div>
        <h1>Gestión de Estudiantes</h1>
        <p>Selecciona una de las siguientes opciones para administrar a tus estudiantes.</p>
      </div>

      <div className="gestion-cards-grid">
        <div
          className="gestion-card progreso-card"
          onClick={() => navigate('/gestion-alumnos/progreso')}
        >
          <div className="gestion-card-icon">
            <MdTrendingUp />
          </div>
          <div className="gestion-card-content">
            <h2>Progreso de Estudiantes</h2>
            <p>Visualiza el rendimiento académico, estadísticas detalladas y el progreso individual de cada estudiante en los distintos módulos y actividades.</p>
          </div>
          <div className="gestion-card-action">
            <span>Ingresar →</span>
          </div>
        </div>

        <div
          className="gestion-card cuentas-card"
          onClick={() => navigate('/gestion-alumnos/cuentas')}
        >
          <div className="gestion-card-icon">
            <MdPeople />
          </div>
          <div className="gestion-card-content">
            <h2>Gestionar Cuentas</h2>
            <p>Administra las cuentas de tus estudiantes: crea, edita, desactiva o elimina accesos al sistema EduApp.</p>
          </div>
          <div className="gestion-card-action">
            <span>Ingresar →</span>
          </div>
        </div>

        <div
          className="gestion-card grupos-card"
          onClick={() => navigate('/gestion-alumnos/grupos')}
        >
          <div className="gestion-card-icon">
            <MdGroup />
          </div>
          <div className="gestion-card-content">
            <h2>Gestionar Grupos</h2>
            <p>Organiza a tus estudiantes en grupos por materia y nombre, y dirígete recursos específicos a cada grupo.</p>
          </div>
          <div className="gestion-card-action">
            <span>Ingresar →</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GestionAlumnos;
