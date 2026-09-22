import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { MdCheckCircle, MdSportsEsports, MdPlayArrow, MdLock, MdMenuBook, MdStar, MdStarBorder } from 'react-icons/md';
import MascotaEduApp from '../../components/MascotaEduApp';
import ModuloFiltro from '../../components/ModuloFiltro';
import './StudentJuegos.css';

const tipoIconos = {
  sopa_de_letras: 'Sopa de Letras',
  crucigrama: 'Crucigrama',
  memoria: 'Memoria',
  relacionar: 'Relacionar',
  adivinanza: 'Adivinanza',
};

const Estrellas = ({ estrellas = 0 }) => (
  <span className="estrellas" aria-label={`${estrellas} de 3 estrellas`}>
    {[1, 2, 3].map(n => (
      n <= estrellas
        ? <MdStar key={n} style={{ color: '#f59e0b', margin: '0 0.1rem' }} />
        : <MdStarBorder key={n} style={{ color: '#cbd5e1', margin: '0 0.1rem' }} />
    ))}
  </span>
);

const StudentJuegos = () => {
  const [juegos, setJuegos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroModulo, setFiltroModulo] = useState('');

  useEffect(() => {
    api.get('/student/juegos/publicados')
      .then(res => setJuegos(res.data.data || []))
      .catch(err => console.error('Error al cargar juegos:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="juegos-mensaje">Cargando zona de juegos...</div>;

  const juegosCompletados = juegos.filter(j => j.completado).length;
  const juegosPendientes = juegos.length - juegosCompletados;
  const estrellasTotales = juegos.reduce((sum, j) => sum + (j.estrellas || 0), 0);

  const modulos = [...new Set(juegos.map(j => j.modulo).filter(Boolean))].sort();
  const juegosVisibles = filtroModulo
    ? juegos.filter(j => j.modulo === filtroModulo)
    : juegos;

  return (
    <div className="juegos-container student-area">
      <div className="juegos-header">
        <h2 className="juegos-titulo"><MdSportsEsports style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />Zona de Juegos</h2>
        <MascotaEduApp
          pendientes={juegosPendientes}
          completados={juegosCompletados}
          estrellas={estrellasTotales}
          contexto="juegos"
          className="mascota-header"
        />
      </div>

      {juegos.length === 0 ? (
        <div className="juegos-vacio">
          <MdSportsEsports style={{ fontSize: '3rem', opacity: 0.5 }} />
          <p>No hay juegos disponibles en este momento.</p>
          <small>El docente aún no ha publicado juegos educativos.</small>
        </div>
      ) : (
        <>
          <ModuloFiltro modulos={modulos} valor={filtroModulo} onChange={setFiltroModulo} />
          {juegosVisibles.length === 0 ? (
            <div className="juegos-vacio">
              <MdSportsEsports style={{ fontSize: '3rem', opacity: 0.5 }} />
              <p>No hay juegos publicados en este módulo.</p>
            </div>
          ) : (
            <div className="juegos-grid">
              {juegosVisibles.map(j => {
            const completado = !!j.completado;
            const bloqueado = !!j.bloqueado;
            if (bloqueado) {
              return (
                <div key={j.id} className="juego-card" style={{ opacity: 0.75 }}>
                  <h3 className="card-titulo">{j.titulo}</h3>
                  <div className="card-info">
                    <span className="badge badge-tipo">{tipoIconos[j.tipo] || j.tipo}</span>
                    <span className="badge badge-modulo"><MdMenuBook style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />{j.modulo}</span>
                    <span className="badge badge-publicado" style={{ background: '#fef3c7', color: '#92400e' }}>
                      <MdLock style={{ marginRight: '0.25rem' }} /> Bloqueado
                    </span>
                  </div>
                  {j.descripcion && (
                    <p className="card-descripcion">{j.descripcion}</p>
                  )}
                  <div className="botones-accion">
                    <span className="jugar-btn" style={{ background: '#6b7280', cursor: 'not-allowed' }}>
                      <MdLock style={{ verticalAlign: 'middle' }} /> Bloqueado
                    </span>
                  </div>
                  <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: '#92400e', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', width: '100%' }}>
                    <MdLock /> Completa el contenido para desbloquear esta actividad.
                  </p>
                </div>
              );
            }
            return (
              <Link key={j.id} to={`/student/juegos/${j.id}`} className="juego-link" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className={`juego-card ${completado ? 'publicado' : ''}`}>
                  <h3 className="card-titulo">{j.titulo}</h3>
                  <div className="card-info">
                    <span className="badge badge-tipo">{tipoIconos[j.tipo] || j.tipo}</span>
                    <span className="badge badge-modulo"><MdMenuBook style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />{j.modulo}</span>
                    {completado && <span className="badge badge-publicado"><MdCheckCircle style={{ marginRight: '0.25rem' }} /> Completado</span>}
                  </div>
                  {j.descripcion && (
                    <p className="card-descripcion">{j.descripcion}</p>
                  )}
                  {completado && (
                    <p className="card-descripcion" style={{ color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%' }}>
                      <Estrellas estrellas={j.estrellas} />
                      <span>{j.mejor_puntaje} Pt</span>
                    </p>
                  )}
                  <div className="botones-accion">
                    <span className="jugar-btn">
                      <MdPlayArrow style={{ verticalAlign: 'middle' }} /> {completado ? 'Jugar de nuevo' : 'Jugar Ahora'}
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

export default StudentJuegos;