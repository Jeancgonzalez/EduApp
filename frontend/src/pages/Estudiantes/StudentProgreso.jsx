import { useState, useEffect } from 'react';
import api from '../../services/api';
import { MdBarChart, MdMenuBook, MdSportsEsports, MdAssignment, MdStar, MdTimeline, MdCheckCircle, MdEmojiEvents, MdClose } from 'react-icons/md';
import { MEDAL_ICONS, MEDAL_CATEGORIES } from '../../utils/medalIcons';
import MascotaEduApp from '../../components/MascotaEduApp';
import './StudentProgreso.css';

const StudentProgreso = () => {
  const [progreso, setProgreso] = useState(null);
  const [gamificacion, setGamificacion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [medallaSeleccionada, setMedallaSeleccionada] = useState(null);

  useEffect(() => {
    api.get('/student/progreso')
      .then(res => setProgreso(res.data.data))
      .catch(err => console.error('Error:', err));

    api.get('/student/gamificacion')
      .then(res => setGamificacion(res.data.data))
      .catch(err => console.error('Error al cargar medallas:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="progreso-mensaje">Cargando tu progreso...</div>;
  }

  const puntosContenidos = (progreso?.contentsViewed || []).reduce((s, c) => s + (c.puntaje || 0), 0);
  const puntosJuegos = (progreso?.gamesCompleted || []).reduce((s, g) => s + (g.puntaje || 0), 0);
  const puntosEvaluaciones = (progreso?.evaluationsCompleted || []).reduce((s, e) => s + (e.puntaje || 0), 0);
  const totalPuntaje = puntosContenidos + puntosJuegos + puntosEvaluaciones;

  const totalAvance = progreso?.progressByModule?.reduce((s, p) => s + parseFloat(p.porcentaje_avance || 0), 0) || 0;
  const numModulos = progreso?.progressByModule?.length || 1;
  const promedioAvance = Math.round(totalAvance / numModulos);

  const medallas = gamificacion?.medallas || [];

  const pendientesTotales = (
    (progreso?.totalContents || 0) - (progreso?.contentsViewed?.length || 0)
  ) + (
    (progreso?.totalGames || 0) - (progreso?.gamesCompleted?.length || 0)
  ) + (
    (progreso?.totalEvaluations || 0) - (progreso?.evaluationsCompleted?.length || 0)
  );

  return (
    <div className="progreso-container student-area">
      <div className="progreso-header">
        <h2 className="progreso-titulo"><MdBarChart style={{ marginRight: '0.75rem', verticalAlign: 'middle' }} />Mi Progreso</h2>
        <MascotaEduApp
          medallas={gamificacion?.medallas_obtenidas || 0}
          puntos={totalPuntaje}
          progreso={promedioAvance}
          pendientes={pendientesTotales}
          contexto="progreso"
          className="mascota-header"
        />
      </div>

      <div className="progreso-resumen">
        <div className="resumen-card puntos">
          <MdStar className="resumen-icon" />
          <div><span className="resumen-valor">{totalPuntaje}</span><span className="resumen-label">Puntos Totales</span></div>
        </div>
        <div className="resumen-card avance">
          <MdTimeline className="resumen-icon" />
          <div><span className="resumen-valor">{promedioAvance}%</span><span className="resumen-label">Avance Promedio</span></div>
        </div>
        <div className="resumen-card modulos">
          <MdCheckCircle className="resumen-icon" />
          <div><span className="resumen-valor">{progreso?.progressByModule?.length || 0}</span><span className="resumen-label">Módulos Iniciados</span></div>
        </div>
      </div>

      {medallas.length > 0 && (
        <div className="medallas-progreso">
          <div className="section-header">
            <h2 className="section-titulo"><MdEmojiEvents /> Medallas</h2>
            <span className="medallas-contador">{gamificacion?.medallas_obtenidas || 0} de {gamificacion?.medallas_totales || medallas.length} conseguidas</span>
          </div>
          <div className="medallas-grid-progreso">
            {medallas.map(m => {
const Icon = MEDAL_ICONS[m.id] || MdEmojiEvents;
              return (
                <div
                  key={m.id}
                  className={`medalla-item-progreso ${m.obtenida ? 'obtenida' : 'por-conseguir'}`}
                  onClick={() => setMedallaSeleccionada(m)}
                  title={m.descripcion}
                >
                  <Icon size={30} />
                  <span className="medalla-nombre-progreso">{m.nombre}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {progreso?.progressByModule?.length > 0 && (
        <div className="modulos-progreso">
          <h2 className="section-titulo">Progreso por Módulo</h2>
          {progreso.progressByModule.map((mod, i) => (
            <div key={i} className="modulo-progreso-card">
              <div className="modulo-progreso-header">
                <h3>{mod.modulo}</h3>
                <span className="badge badge-nivel">Nivel {mod.nivel}</span>
              </div>
              <div className="progress-bar-container">
                <div className="progress-bar progress-bar-modulo" style={{ width: `${parseFloat(mod.porcentaje_avance)}%` }}><span>{parseFloat(mod.porcentaje_avance)}%</span></div>
              </div>
              <div className="modulo-progreso-stats">
                <span>Puntaje: {mod.puntaje_total} pts</span>
                {mod.ultima_actividad && <span>Última actividad: {new Date(mod.ultima_actividad).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="actividad-grid">
        <div className="actividad-col">
          <h2 className="section-titulo"><MdMenuBook /> Contenidos Vistos</h2>
          {progreso?.contentsViewed?.length > 0 ? (
            <div className="actividad-lista">
              {progreso.contentsViewed.map((item, i) => {
                const nombre = item.contenido?.titulo || `Contenido #${item.contenido_id}`;
                return (
                  <div key={i} className="actividad-item">
                    <MdMenuBook className="actividad-icon" />
                    <div className="actividad-info">
                      <span className="actividad-nombre">{nombre}</span>
                      <span className="actividad-fecha">{new Date(item.fecha).toLocaleDateString()}</span>
                    </div>
                    <span className="puntaje-badge">{item.puntaje} pts</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="sin-actividad">No has visto contenidos aún.</p>}
        </div>

        <div className="actividad-col">
          <h2 className="section-titulo"><MdSportsEsports /> Juegos Completados</h2>
          {progreso?.gamesCompleted?.length > 0 ? (
            <div className="actividad-lista">
              {progreso.gamesCompleted.map((item, i) => {
                const nombre = item.juego?.titulo || `Juego #${item.juego_id}`;
                return (
                  <div key={i} className="actividad-item">
                    <MdSportsEsports className="actividad-icon" />
                    <div className="actividad-info">
                      <span className="actividad-nombre">{nombre}</span>
                      <span className="actividad-fecha">{new Date(item.fecha).toLocaleDateString()}</span>
                    </div>
                    <span className="puntaje-badge">{item.puntaje} pts</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="sin-actividad">No has completado juegos aún.</p>}
        </div>

        <div className="actividad-col">
          <h2 className="section-titulo"><MdAssignment /> Evaluaciones Realizadas</h2>
          {progreso?.evaluationsCompleted?.length > 0 ? (
            <div className="actividad-lista">
              {progreso.evaluationsCompleted.map((item, i) => {
                const nombre = item.evaluacion?.titulo || `Evaluación #${item.evaluacion_id}`;
                return (
                  <div key={i} className="actividad-item">
                    <MdAssignment className="actividad-icon" />
                    <div className="actividad-info">
                      <span className="actividad-nombre">{nombre}</span>
                      <span className="actividad-fecha">{new Date(item.fecha).toLocaleDateString()}</span>
                    </div>
                    <span className="puntaje-badge">{item.puntaje} pts</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="sin-actividad">No has realizado evaluaciones aún.</p>}
        </div>
      </div>

      {medallaSeleccionada && (
        <div className="medalla-modal-overlay" onClick={() => setMedallaSeleccionada(null)}>
          <div className="medalla-modal" onClick={e => e.stopPropagation()}>
            <button className="medalla-modal-cerrar" onClick={() => setMedallaSeleccionada(null)}><MdClose /></button>
            <MascotaEduApp
              expression={medallaSeleccionada.obtenida ? 'celebrando' : 'animando'}
              size={74}
              className="mascota-modal"
            />
            {(() => {
              const m = medallaSeleccionada;
              const Icon = MEDAL_ICONS[m.id] || MdEmojiEvents;
              return (
                <>
                  <div className={`medalla-modal-encabezado ${m.obtenida ? 'obtenida' : 'por-conseguir'}`}>
                    <Icon className="medalla-modal-icono" />
                    <h3>{m.nombre}</h3>
                    <span className="medalla-modal-categoria">{MEDAL_CATEGORIES[m.categoria] || m.categoria}</span>
                  </div>
                  <div className="medalla-modal-cuerpo">
                    <p className="medalla-modal-descripcion">{m.descripcion}</p>
                    {m.obtenida ? (
                      <>
                        <p className="medalla-modal-estado obtenida">¡Medalla conseguida!</p>
                        <p className="medalla-modal-pregunta">¿Por qué la obtuviste?</p>
                        <p className="medalla-modal-respuesta">{m.explicacion}</p>
                      </>
                    ) : (
                      <>
                        <p className="medalla-modal-estado por-conseguir">Medalla aún no conseguida</p>
                        <p className="medalla-modal-pregunta">¿Cómo obtenerla?</p>
                        <p className="medalla-modal-respuesta">{m.condicion}</p>
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentProgreso;