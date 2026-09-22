import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { MdMenuBook, MdCheckCircle, MdGroup } from 'react-icons/md';
import './Contenidos.css';

const Contenidos = () => {
  const { isTeacher } = useAuth();
  const [contenidos, setContenidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterGrupo, setFilterGrupo] = useState('');
  const [allGrupos, setAllGrupos] = useState([]);

  useEffect(() => {
    const fetchContenidos = async () => {
      try {
        const response = await api.get('/contenidos');
        setContenidos(response.data?.data || []);
        setLoading(false);
      } catch (err) {
        console.error('Error al cargar los contenidos:', err);
        setError('Hubo un problema al cargar los contenidos.');
        setLoading(false);
      }
    };

    fetchContenidos();

    api.get('/teacher/grupos')
      .then(res => setAllGrupos(res.data?.data?.grupos || []))
      .catch(() => setAllGrupos([]));
  }, []);

  const contenidosFiltrados = contenidos.filter(c => {
    if (!filterGrupo) return true;
    return (c.grupo_id === parseInt(filterGrupo, 10)) || (!c.grupo_id && c.grupo_id !== 0);
  });

  if (loading) {
    return <div className="contenidos-mensaje">Cargando contenidos...</div>;
  }

  if (error) {
    return <div className="contenidos-mensaje error">{error}</div>;
  }

  return (
    <div className="contenidos-container cartoon-area">
      <div className="contenidos-header">
        <h2 className="contenidos-titulo"><MdMenuBook style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />Lista de Contenidos</h2>
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
            <Link to="/crear-contenido" className="crear-contenido-btn">
               Crear Contenido
            </Link>
          )}
        </div>
      </div>

      {contenidosFiltrados.length === 0 ? (
        <div className="contenidos-vacio">
          <p>{filterGrupo ? 'No hay contenidos para el grupo seleccionado.' : 'No hay contenidos disponibles en este momento.'}</p>
          {isTeacher && (
            <Link to="/crear-contenido" className="crear-contenido-btn">
              Crear el primer contenido
            </Link>
          )}
        </div>
      ) : (
        <div className="contenidos-grid ">
          {contenidosFiltrados.map((contenido) => (
            <Link
              key={contenido.id || contenido._id}
              to={`/contenidos/${contenido.id || contenido._id}`}
              className={`contenido-card contenido-link ${contenido.publicado ? 'publicado' : ''}`}
            >
              <h3 className="card-titulo">{contenido.titulo}</h3>
              <div className="card-info">
                <span className="badge badge-tipo">{({ video: 'Video', pdf: 'PDF', enlace: 'Enlace', texto: 'Lección', documento: 'Word' })[contenido.tipo] || contenido.tipo}</span>
                <span className="badge badge-modulo"><MdMenuBook style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> Módulo {contenido.modulo}</span>
                {contenido.grupo && <span className="badge badge-grupo"><MdGroup style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> Grupo: {contenido.grupo.materia} – {contenido.grupo.nombre}</span>}
                {contenido.publicado && <span className="badge badge-publicado"><MdCheckCircle style={{ marginRight: '0.25rem' }} /> Publicado</span>}
              </div>
              {contenido.descripcion && (
                <p className="card-descripcion">{contenido.descripcion}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Contenidos;