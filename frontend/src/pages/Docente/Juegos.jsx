import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { FaTrashAlt } from 'react-icons/fa';
import { MdSportsEsports, MdMenuBook, MdCheckCircle, MdLock, MdRocketLaunch, MdSearch, MdGridOn, MdHelp, MdStyle, MdLink, MdGroup } from 'react-icons/md';
import { useAuth } from '../../context/AuthContext';
import Swal from 'sweetalert2';
import './Juegos.css';

const TIPO_ICONOS = {
  sopa_de_letras: <MdSearch />,
  crucigrama: <MdGridOn />,
  adivinanza: <MdHelp />,
  memoria: <MdStyle />,
  relacionar: <MdLink />,
};

const Juegos = () => {
  const { isTeacher } = useAuth();
  const [juegos, setJuegos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterGrupo, setFilterGrupo] = useState('');
  const [allGrupos, setAllGrupos] = useState([]);

  useEffect(() => { fetchJuegos(); }, []);

  useEffect(() => {
    api.get('/teacher/grupos')
      .then(res => setAllGrupos(res.data?.data?.grupos || []))
      .catch(() => setAllGrupos([]));
  }, []);

  const fetchJuegos = async () => {
    try {
      setLoading(true);
      const response = await api.get('/juegos');
      setJuegos(response.data?.data || []);
    } catch (err) {
      setError('Hubo un problema al cargar los juegos.');
    } finally {
      setLoading(false);
    }
  };

  // Sin grupos asignados = visible para todos, así que aparece siempre que
  // hay un filtro activo. Con grupos, coincide si comparte alguno.
  const juegosFiltrados = juegos.filter(j => {
    if (!filterGrupo) return true;
    const ids = Array.isArray(j.grupos) ? j.grupos.map(g => g.id) : (j.grupo_ids || []);
    if (ids.length === 0) return true;
    return ids.includes(parseInt(filterGrupo, 10));
  });

  const handleEliminar = async (juego) => {
    const result = await Swal.fire({
      title: '¿Eliminar juego?',
      html: `¿Estás seguro de que deseas eliminar <strong>"${juego.titulo}"</strong>?
        <br/><br/>
        <div style="background:#fef2f2;border-radius:8px;padding:1rem;text-align:left;font-size:0.85rem;color:#991b1b;border:1px solid #fecaca;">
          <strong>⚠️ Esta acción:</strong>
          <ul style="margin:0.5rem 0 0 1rem;padding:0;">
            <li>Eliminará el progreso de estudiantes relacionado</li>
            <li>Actualizará los puntajes automáticamente</li>
            <li>No se puede deshacer</li>
          </ul>
        </div>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (result.isConfirmed) {
      try {
        const res = await api.delete(`/juegos/${juego.id}`);
        setJuegos(prev => prev.filter(j => j.id !== juego.id));
        Swal.fire({ title: '¡Eliminado!', text: res.data?.message || 'Juego eliminado correctamente.', icon: 'success', timer: 3000, showConfirmButton: false });
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || 'No se pudo eliminar el juego.', 'error');
      }
    }
  };

  const handleTogglePublicar = async (juego) => {
    const result = await Swal.fire({
      title: `¿${juego.publicado ? 'Despublicar' : 'Publicar'} juego?`,
      text: juego.publicado
        ? 'Al despublicarlo podrás editarlo de nuevo.'
        : 'Al publicarlo estará visible para estudiantes y no podrá editarse.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: juego.publicado ? '#f59e0b' : '#10b981',
      cancelButtonColor: '#6b7280',
      confirmButtonText: juego.publicado ? 'Despublicar' : 'Publicar',
      cancelButtonText: 'Cancelar',
    });
    if (result.isConfirmed) {
      try {
        await api.put(`/juegos/${juego.id}`, { publicado: !juego.publicado });
        fetchJuegos();
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || 'Error al cambiar estado.', 'error');
      }
    }
  };

  if (loading) return <div className="juegos-mensaje">Cargando juegos...</div>;
  if (error) return <div className="juegos-mensaje error">{error}</div>;

  return (
    <div className="juegos-container cartoon-area">
      <div className="juegos-header">
        <h2 className="juegos-titulo"><MdSportsEsports style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />Lista de Juegos</h2>
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
            <Link to="/crear-juegos" className="crear-juego-btn">
              Crear Juego
            </Link>
          )}
        </div>
      </div>

      {juegosFiltrados.length === 0 ? (
        <div className="juegos-vacio">
          <p>{filterGrupo ? 'No hay juegos para el grupo seleccionado.' : 'No hay juegos disponibles en este momento.'}</p>
          {isTeacher && <Link to="/crear-juegos" className="crear-juego-btn">Crear el primer juego</Link>}
        </div>
      ) : (
        <div className="juegos-grid">
          {juegosFiltrados.map((juego) => (
            <div key={juego.id} className={`juego-card ${juego.publicado ? 'publicado' : ''}`}>
              <h3 className="card-titulo">{TIPO_ICONOS[juego.tipo] || <MdSportsEsports />} {juego.titulo}</h3>
              <div className="card-info">
                <span className="badge badge-tipo">{juego.tipo?.replace(/_/g, ' ')}</span>
                <span className="badge badge-modulo"><MdMenuBook style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> Módulo {juego.modulo}</span>
                {Array.isArray(juego.grupos) && juego.grupos.length > 0 ? (
                  <span className="badge badge-grupo"><MdGroup style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> Grupos: {juego.grupos.map(g => `${g.materia} – ${g.nombre}`).join(' · ')}</span>
                ) : (
                  <span className="badge badge-grupo"><MdGroup style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> Todos los estudiantes</span>
                )}
                {juego.publicado && <span className="badge badge-publicado"><MdCheckCircle style={{ marginRight: '0.25rem' }} /> Publicado</span>}
              </div>
              {juego.descripcion && (
                <p className="card-descripcion">{juego.descripcion}</p>
              )}

              {isTeacher && (
                <div className="botones-accion">
                  <button
                    className={`publicar-btn ${juego.publicado ? 'despublicar' : ''}`}
                    onClick={() => handleTogglePublicar(juego)}
                  >
                    {juego.publicado ? <MdLock style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> : <MdRocketLaunch style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />}
                    {juego.publicado ? 'Despublicar' : 'Publicar'}
                  </button>

                  {!juego.publicado && (
                    <Link
                      to={`/editar-juego/${juego.id}`}
                      className="editar-btn-juego"
                    >
                      Editar
                    </Link>
                  )}

                  {!juego.publicado && (
                    <button
                    className="eliminar-btn"
                    onClick={() => handleEliminar(juego)}
                  >
                    <FaTrashAlt style={{ marginRight: '1px' }} />
                  </button>
                  )}

                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Juegos;
