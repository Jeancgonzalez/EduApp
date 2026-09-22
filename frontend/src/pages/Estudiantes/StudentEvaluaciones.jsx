import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { MdAssignment, MdPlayArrow, MdAccessTime, MdCheckCircle, MdLock, MdMenuBook, MdStar, MdStarBorder } from 'react-icons/md';
import MascotaEduApp from '../../components/MascotaEduApp';
import ModuloFiltro from '../../components/ModuloFiltro';
import './StudentEvaluaciones.css';

const Estrellas = ({ estrellas = 0 }) => (
  <span className="estrellas" aria-label={`${estrellas} de 3 estrellas`}>
    {[1, 2, 3].map(n => (
      n <= estrellas
        ? <MdStar key={n} style={{ color: '#f59e0b', margin: '0 0.1rem' }} />
        : <MdStarBorder key={n} style={{ color: '#cbd5e1', margin: '0 0.1rem' }} />
    ))}
  </span>
);

const StudentEvaluaciones = () => {
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroModulo, setFiltroModulo] = useState('');

  useEffect(() => {
    api.get('/student/evaluaciones/publicadas')
      .then(res => setEvaluaciones(res.data.data || []))
      .catch(err => console.error('Error al cargar evaluaciones:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="evaluaciones-mensaje">Cargando evaluaciones...</div>;

  const evaluacionesPendientes = evaluaciones.filter(e => !e.completado).length;
  const evaluacionesCompletadas = evaluaciones.filter(e => e.completado).length;
  const estrellasTotales = evaluaciones.reduce((sum, e) => sum + (e.estrellas || 0), 0);

  const modulos = [...new Set(evaluaciones.map(e => e.modulo).filter(Boolean))].sort();
  const evaluacionesVisibles = filtroModulo
    ? evaluaciones.filter(e => e.modulo === filtroModulo)
    : evaluaciones;

  return (
    <div className="evaluaciones-container student-area">
      <div className="evaluaciones-header">
        <h2 className="evaluaciones-titulo"><MdAssignment style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />Mis Evaluaciones</h2>
        <MascotaEduApp
          pendientes={evaluacionesPendientes}
          completados={evaluacionesCompletadas}
          estrellas={estrellasTotales}
          contexto="evaluaciones"
          className="mascota-header"
        />
      </div>

      {evaluaciones.length === 0 ? (
        <div className="evaluaciones-vacio">
          <MdAssignment style={{ fontSize: '3rem', opacity: 0.5 }} />
          <p>No hay evaluaciones pendientes.</p>
          <small>El docente aún no ha publicado evaluaciones.</small>
        </div>
      ) : (
        <>
          <ModuloFiltro modulos={modulos} valor={filtroModulo} onChange={setFiltroModulo} />
          {evaluacionesVisibles.length === 0 ? (
            <div className="evaluaciones-vacio">
              <MdAssignment style={{ fontSize: '3rem', opacity: 0.5 }} />
              <p>No hay evaluaciones publicadas en este módulo.</p>
            </div>
          ) : (
            <div className="evaluaciones-grid">
              {evaluacionesVisibles.map(e => {
            const completado = !!e.completado;
            const bloqueado = !!e.bloqueado;
            if (bloqueado) {
              return (
                <div key={e.id} className="evaluacion-card" style={{ opacity: 0.75 }}>
                  <h3 className="card-titulo">{e.titulo}</h3>
                  <div className="card-info">
                    <span className="badge badge-modulo"><MdMenuBook style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />{e.modulo}</span>
                    {e.requiere_contenido_apoyo && (
                      <span className="badge badge-tiempo" style={{ background: '#fef3c7', color: '#92400e' }}><MdMenuBook style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />Contenido de apoyo</span>
                    )}
                    {e.tiempoLimitado && e.tiempoMinutos && (
                      <span className="badge badge-tiempo"><MdAccessTime style={{ verticalAlign: 'middle' }} /> {e.tiempoMinutos} min</span>
                    )}
                    <span className="badge badge-publicado" style={{ background: '#fef3c7', color: '#92400e' }}>
                      <MdLock style={{ marginRight: '0.25rem' }} /> Bloqueada
                    </span>
                  </div>
                  {e.descripcion && (
                    <p className="card-descripcion">{e.descripcion}</p>
                  )}
                  <div className="botones-accion">
                    <span className="resolver-btn" style={{ background: '#6b7280', cursor: 'not-allowed' }}>
                      <MdLock style={{ verticalAlign: 'middle' }} /> Bloqueada
                    </span>
                  </div>
                  <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: '#92400e', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', width: '100%' }}>
                    <MdLock /> Completa el contenido para desbloquear esta actividad.
                  </p>
                </div>
              );
            }
            return (
              <Link key={e.id} to={`/student/evaluaciones/${e.id}`} className="evaluacion-link" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className={`evaluacion-card ${completado ? 'publicado' : ''}`}>
                  <h3 className="card-titulo">{e.titulo}</h3>
                  <div className="card-info">
                    <span className="badge badge-modulo"><MdMenuBook style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />{e.modulo}</span>
                    {e.requiere_contenido_apoyo && (
                      <span className="badge badge-tiempo" style={{ background: '#fef3c7', color: '#92400e' }}><MdMenuBook style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />Contenido de apoyo</span>
                    )}
                    {e.tiempoLimitado && e.tiempoMinutos && (
                      <span className="badge badge-tiempo"><MdAccessTime style={{ verticalAlign: 'middle' }} /> {e.tiempoMinutos} min</span>
                    )}
                    {completado && <span className="badge badge-publicado"><MdCheckCircle style={{ marginRight: '0.25rem' }} /> Completado</span>}
                  </div>
                  {e.descripcion && (
                    <p className="card-descripcion">{e.descripcion}</p>
                  )}
                  {completado && (
                    <p className="card-descripcion" style={{ color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%' }}>
                      <Estrellas estrellas={e.estrellas} />
                      <span>{e.mejor_puntaje} Pt</span>
                    </p>
                  )}
                  <div className="botones-accion">
                    <span className="resolver-btn">
                      <MdPlayArrow style={{ verticalAlign: 'middle' }} /> {completado ? 'Intentar de nuevo' : 'Resolver Evaluación'}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StudentEvaluaciones;