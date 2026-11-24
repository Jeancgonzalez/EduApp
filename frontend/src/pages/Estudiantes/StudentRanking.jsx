import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import {
  MdEmojiEvents, MdGroups, MdStar, MdRefresh, MdArrowBack,
} from 'react-icons/md';
import MascotaEduApp from '../../components/MascotaEduApp';
import './StudentRanking.css';

const TOPES = [5, 10];

/** Acceso al inicio en TODOS los estados (cargando, error, vacío y con podio). */
const VolverInicio = () => (
  <Link to="/student/dashboard" className="ranking-volver">
    <MdArrowBack aria-hidden="true" /> Volver al inicio
  </Link>
);

const StudentRanking = () => {
  const [limite, setLimite] = useState(5);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [sinGrupo, setSinGrupo] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    setSinGrupo(false);

    api.get('/dashboard/ranking-estudiante', { params: { limite, semanas: 8 } })
      .then((res) => {
        if (vigente) setDatos(res.data.data);
      })
      .catch((err) => {
        if (!vigente) return;
        if (err.response?.status === 404) {
          setSinGrupo(true);
        } else {
          setError(err.response?.data?.message || 'No pudimos traer el ranking.');
        }
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => { vigente = false; };
  }, [limite]);

  const filas = datos?.top ?? [];
  const actual = datos?.actual ?? null;
  const hayClasificacion = filas.length > 0 || Boolean(actual);

  if (cargando) {
    return (
      <div className="ranking-container student-area">
        <VolverInicio />
        <div className="ranking-mensaje">Preparando el podio de tu grupo...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ranking-container student-area">
        <VolverInicio />
        <div className="ranking-card ranking-error">
          <MascotaEduApp expression="animando" size={80} />
          <p>{error}</p>
          <button type="button" className="ranking-recargar" onClick={() => setLimite((n) => (n === 5 ? 10 : 5))}>
            <MdRefresh /> Intentar de nuevo
          </button>
        </div>
      </div>
    );
  }

  if (sinGrupo) {
    return (
      <div className="ranking-container student-area">
        <VolverInicio />
        <div className="ranking-card ranking-vacio">
          <MascotaEduApp expression="animando" size={100} />
          <h2>Tu podio está por empezar</h2>
          <p>Tu docente todavía no te asignó un grupo. Cuando lo haga, aquí verás cómo van tus compañeros.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ranking-container student-area">
      <VolverInicio />
      <div className="ranking-header">
        <div>
          <h1 className="ranking-titulo"><MdEmojiEvents /> Ranking del grupo</h1>
          <p className="ranking-sub">
            <MdGroups /> {datos?.grupo?.nombre || 'Tu grupo'}
            {datos?.grupo?.materia ? ` · ${datos.grupo.materia}` : ''}
          </p>
        </div>
        <MascotaEduApp
          expression={actual?.sinNota ? 'animando' : 'celebrando'}
          size={84}
          className="ranking-mascota"
        />
      </div>

      <div className="ranking-controles">
        <div className="ranking-segmentos" role="group" aria-label="Tamaño del ranking">
          {TOPES.map((n) => (
            <button
              key={n}
              type="button"
              className={limite === n ? 'activo' : ''}
              onClick={() => setLimite(n)}
              aria-pressed={limite === n}
            >
              Top {n}
            </button>
          ))}
        </div>
        <p className="ranking-aclaracion">
          Se ordena por puntos totales. Los empates se desempatan con acierto y constancia.
        </p>
      </div>

      {actual && (
        <div className={`ranking-yo ${actual.sinNota ? 'ranking-yo-sin-nota' : ''}`}>
          <MascotaEduApp
            expression={actual.sinNota ? 'animando' : 'celebrando'}
            size={70}
          />
          <div className="ranking-yo-texto">
            <p className="ranking-yo-titulo">Tu lugar en el grupo</p>
            <p className="ranking-yo-posicion">
              {actual.sinNota ? 'Aún sin nota' : `#${actual.posicion}`}
            </p>
            <p className="ranking-yo-puntos">{actual.puntos ?? 0} puntos</p>
            <p className="ranking-yo-detalle">
              {actual.sinNota
                ? '¡Ánimo! Con tu primer juego o evaluación ya entras al podio.'
                : actual.posicion <= 3
                  ? '¡Excelente! Estás entre los primeros del grupo.'
                  : 'Cada intento cuenta: ¡sigue avanzando!'}
            </p>
          </div>
          {!actual.sinNota && <span className="ranking-chip-yo">Tú</span>}
        </div>
      )}

      {hayClasificacion ? (
        <section className="ranking-card">
          <h2 className="ranking-seccion-titulo"><MdStar /> Los mejores del grupo</h2>
          <ol className="ranking-lista">
            {filas.map((f) => (
              <li
                key={f.posicion}
                className={`ranking-fila ${f.esActual ? 'ranking-fila-yo' : ''}`}
              >
                <span className={`ranking-pos ${f.posicion <= 3 ? `ranking-pos-${f.posicion}` : ''}`}>
                  {f.posicion <= 3 ? <MdEmojiEvents /> : `#${f.posicion}`}
                </span>
                <span className="ranking-alias">{f.alias}</span>
                <span className="ranking-metrica ranking-xp">{f.puntos} pts</span>
                {f.esActual && <span className="ranking-chip-yo">Tú</span>}
              </li>
            ))}
          </ol>
          {actual && !filas.some((f) => f.esActual) && (
            <p className="ranking-nota-pie">
              Tu posición aparece arriba: el Top {limite} muestra a quienes llevan más puntos.
            </p>
          )}
        </section>
      ) : (
        <div className="ranking-card ranking-vacio">
          <MascotaEduApp expression="animando" size={100} />
          <h2>El podio te espera</h2>
          <p>Todavía no hay actividades calificadas en tu grupo. ¡Puedes ser la primera persona en aparecer!</p>
        </div>
      )}
    </div>
  );
};

export default StudentRanking;
