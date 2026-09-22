import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './Evaluaciones.css';
import { FaTrashAlt, FaEdit } from 'react-icons/fa';
import { MdAssignment, MdMenuBook, MdCheckCircle, MdLock, MdRocketLaunch, MdGroup } from 'react-icons/md';
import Swal from 'sweetalert2';

const Evaluaciones = () => {
  const { isTeacher } = useAuth();
  const navigate = useNavigate();
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterGrupo, setFilterGrupo] = useState('');
  const [allGrupos, setAllGrupos] = useState([]);
  

  useEffect(() => {
    const fetchEvaluaciones = async () => {
      try {
        const response = await api.get('/evaluaciones');
        setEvaluaciones(response.data?.data || []);
        setLoading(false);
      } catch (err) {
        console.error('Error al cargar las evaluaciones:', err);
        setError('Hubo un problema al cargar las evaluaciones.');
        setLoading(false);
      }
    };

    fetchEvaluaciones();

    api.get('/teacher/grupos')
      .then(res => setAllGrupos(res.data?.data?.grupos || []))
      .catch(() => setAllGrupos([]));
  }, []);

  const evaluacionesFiltradas = evaluaciones.filter(e => {
    if (!filterGrupo) return true;
    return (e.grupo_id === parseInt(filterGrupo, 10)) || (!e.grupo_id && e.grupo_id !== 0);
  });

  const handleTogglePublicar = async (evaluacion) => {
    const result = await Swal.fire({
      title: `¿${evaluacion.publicado ? 'Despublicar' : 'Publicar'} evaluación?`,
      text: evaluacion.publicado
        ? 'Al despublicarla podrás editarla de nuevo y eliminarla.'
        : 'Al publicarla estará visible para estudiantes y no podrá editarse ni eliminarse.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: evaluacion.publicado ? '#f59e0b' : '#10b981',
      cancelButtonColor: '#6b7280',
      confirmButtonText: evaluacion.publicado ? 'Despublicar' : 'Publicar',
      cancelButtonText: 'Cancelar',
    });
    
    if (result.isConfirmed) {
      try {
        await api.put(`/evaluaciones/${evaluacion.id}`, { publicado: !evaluacion.publicado });
        // Actualizar el estado local
        setEvaluaciones(prevEvaluaciones =>
          prevEvaluaciones.map(e =>
            e.id === evaluacion.id ? { ...e, publicado: !evaluacion.publicado } : e
          )
        );
        Swal.fire('¡Actualizado!', `Evaluación ${evaluacion.publicado ? 'despublicada' : 'publicada'} correctamente.`, 'success');
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || 'Error al cambiar estado.', 'error');
      }
    }
  };

  const handleDelete = async (evaluacion) => {
    const result = await Swal.fire({
      title: '¿Eliminar evaluación?',
      html: `¿Estás seguro de que deseas eliminar <strong>"${evaluacion.titulo}"</strong>?<br/><small style="color:#ef4444">Esta acción no puede deshacerse.</small>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/evaluaciones/${evaluacion.id || evaluacion._id}`);
        setEvaluaciones(prevEvaluaciones => prevEvaluaciones.filter(e => e.id !== evaluacion.id));
        Swal.fire({ 
          title: '¡Eliminada!', 
          text: 'La evaluación ha sido eliminada correctamente.',
          icon: 'success', 
          timer: 2000, 
          showConfirmButton: false 
        });
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || 'No se pudo eliminar.', 'error');
      }
    }
  };

  if (loading) {
    return <div className="evaluaciones-mensaje">Cargando evaluaciones...</div>;
  }

  if (error) {
    return <div className="evaluaciones-mensaje error">{error}</div>;
  }

  return (
    <div className="evaluaciones-container cartoon-area">
      <div className="evaluaciones-header">
        <h2 className="evaluaciones-titulo"><MdAssignment style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />Lista de Evaluaciones</h2>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {allGrupos.length > 0 && (
            <div className="grupo-filtro">
              <span className="grupo-filtro-label">Grupo:</span>
              <select value={filterGrupo} onChange={(e) => setFilterGrupo(e.target.value)} aria-label="Filtrar por grupo">
                <option value="">Todos los grupos</option>
                {allGrupos.map((g) => (
                  <option key={g.id} value={g.id}>{g.materia} – {g.nombre}</option>
                ))}
              </select>
            </div>
          )}
          {isTeacher && (
            <Link to="/crear-evaluacion" className="crear-evaluacion-btn">
              Crear Evaluación
            </Link>
          )}
        </div>
      </div>

      {evaluacionesFiltradas.length === 0 ? (
        <div className="evaluaciones-vacio">
          <p>{filterGrupo ? 'No hay evaluaciones para el grupo seleccionado.' : 'No hay evaluaciones disponibles en este momento.'}</p>
          {isTeacher && (
            <Link to="/crear-evaluacion" className="crear-evaluacion-btn">
              Crear la primera evaluación
            </Link>
          )}
        </div>
      ) : (
        <div className="evaluaciones-grid">
          {evaluacionesFiltradas.map((evaluacion) => (
            <div key={evaluacion.id || evaluacion._id} className={`evaluacion-card ${evaluacion.publicado ? 'publicado' : ''}`}>
              <h3 className="card-titulo">{evaluacion.titulo}</h3>
              <div className="card-info">
                  <span className="badge badge-modulo"><MdMenuBook style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> Módulo {evaluacion.modulo}</span>
                  {evaluacion.grupo && <span className="badge badge-grupo"><MdGroup style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> Grupo: {evaluacion.grupo.materia} – {evaluacion.grupo.nombre}</span>}
                  {evaluacion.requiere_contenido_apoyo && (
                      <span className="badge badge-tiempo" style={{ background: '#fef3c7', color: '#92400e' }}><MdMenuBook style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />Contenido de apoyo</span>
                    )}
                {evaluacion.publicado && (
                  <span className="badge badge-publicado"><MdCheckCircle style={{ marginRight: '0.25rem' }} /> Publicado</span>
                )}
              </div>
              {evaluacion.descripcion && (
                <p className="card-descripcion">{evaluacion.descripcion}</p>
              )}
              
              {isTeacher && (
                <div className="botones-accion">
                  <button
                    className={`publicar-btn ${evaluacion.publicado ? 'despublicar' : ''}`}
                    onClick={() => handleTogglePublicar(evaluacion)}
                  >
                    {evaluacion.publicado ? <MdLock style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> : <MdRocketLaunch style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />}
                    {evaluacion.publicado ? 'Despublicar' : 'Publicar'}
                  </button>
                  
                  {!evaluacion.publicado && (
                    <Link 
                      to={`/evaluaciones/${evaluacion.id || evaluacion._id}/editar`} 
                      className="editar-btn-evaluacion"
                    >
                      Editar
                    </Link>
                  )}
                  
                  {!evaluacion.publicado && (
                    <button 
                      className="eliminar-btn" 
                      onClick={() => handleDelete(evaluacion)}
                    >
                      <FaTrashAlt style={{ marginRight: '1px' }} />
                      
                    </button>
                  )}

                </div>
              )}
              
              {!isTeacher && (
                <div className="botones-accion">
                  <Link
                    to={`/evaluaciones/${evaluacion.id || evaluacion._id}`}
                    className="resolver-btn"
                  >
                    Resolver Evaluación
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Evaluaciones;