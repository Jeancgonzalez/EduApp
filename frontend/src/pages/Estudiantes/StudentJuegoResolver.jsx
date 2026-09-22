import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { MdArrowBack, MdCheckCircle, MdError, MdRefresh, MdSportsEsports, MdMenuBook, MdStar, MdStarBorder } from 'react-icons/md';
import Swal from 'sweetalert2';
import AdivinanzaGame from '../../components/games/AdivinanzaGame';
import QuizGame from '../../components/games/QuizGame';
import WordSearchGame from '../../components/games/WordSearchGame';
import CrosswordGame from '../../components/games/CrosswordGame';
import MemoryGame from '../../components/games/MemoryGame';
import MascotaEduApp from '../../components/MascotaEduApp';
import '../../components/games/Games.css';
import './StudentJuegos.css';

const typeNames = { sopa_de_letras: 'Sopa de Letras', crucigrama: 'Crucigrama', memoria: 'Memoria', relacionar: 'Relacionar', adivinanza: 'Adivinanza' };

const estrellasDePorcentaje = (pct) => {
  if (pct === null || pct === undefined) return 0;
  if (pct >= 90) return 3;
  if (pct >= 70) return 2;
  return 1;
};

const Estrellas = ({ estrellas = 0 }) => (
  <span style={{ display: 'inline-flex', gap: '0.15rem', alignItems: 'center' }}>
    {[1, 2, 3].map(n => (
      n <= estrellas
        ? <MdStar key={n} style={{ color: '#f59e0b', fontSize: '2rem' }} />
        : <MdStarBorder key={n} style={{ color: '#cbd5e1', fontSize: '2rem' }} />
    ))}
  </span>
);

const StudentJuegoResolver = () => {
  const { id } = useParams();
  const [juego, setJuego] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [resumenJuegos, setResumenJuegos] = useState(null);

  useEffect(() => {
    api.get(`/juegos/${id}`)
      .then(res => {
        const juegoData = res.data.data;
        setJuego(juegoData);
      })
      .catch(err => setError(err.response?.data?.message || 'Error al cargar juego'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleGameComplete = async (datos) => {
    setEnviando(true);
    try {
      const res = await api.post(`/student/juegos/${id}/responder`, { ...datos, juego_id: id });
      setResultado(res.data.data);
      try {
        const listaRes = await api.get('/student/juegos/publicados');
        const lista = listaRes.data.data || [];
        const total = lista.length;
        const completados = lista.filter(j => j.completado).length;
        setResumenJuegos({ total, completados, pendientes: Math.max(0, total - completados) });
      } catch { }
      const p = datos.puntaje_obtenido || 0;
      Swal.fire({ icon: p >= 60 ? 'success' : 'info', title: p >= 60 ? '¡Buen trabajo!' : 'Sigue intentando', text: `Obtuviste ${p} puntos`, confirmButtonColor: '#0891b2' });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message || 'Error al enviar respuesta' });
    } finally { setEnviando(false); }
  };

  if (loading) return <div className="juegos-mensaje">Cargando juego...</div>;
  if (error) return <div className="juegos-container student-area"><div className="juegos-vacio"><h3>{error}</h3></div></div>;
  if (!juego) return <div className="juegos-container student-area"><div className="juegos-vacio"><h3>Juego no encontrado</h3></div></div>;

  const renderGame = () => {
    const config = juego.configuracion || {};
    switch (juego.tipo) {
      case 'adivinanza': return <AdivinanzaGame config={config} onComplete={handleGameComplete} />;
      case 'relacionar': return <QuizGame config={config} onComplete={handleGameComplete} />;
      case 'sopa_de_letras': return <WordSearchGame config={config} onComplete={handleGameComplete} />;
      case 'crucigrama': return <CrosswordGame config={config} onComplete={handleGameComplete} />;
      case 'memoria': return <MemoryGame config={config} onComplete={handleGameComplete} />;
      default: return <div className="juegos-vacio"><h3>Tipo de juego no soportado: {juego.tipo}</h3></div>;
    }
  };

  return (
    <div className="juegos-container student-area">
      <Link to="/student/juegos" className="back-btn"><MdArrowBack /> Volver a Juegos</Link>
      <div className="detalle-card">
        <div className="detalle-header">
          <h2 className="detalle-titulo"><MdSportsEsports style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />{juego.titulo}</h2>
          <div className="card-info">
            <span className="badge badge-tipo">{typeNames[juego.tipo] || juego.tipo}</span>
            <span className="badge badge-modulo"><MdMenuBook style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> Módulo {juego.modulo}</span>
          </div>
        </div>
        {juego.descripcion && <p className="card-descripcion" style={{ marginBottom: '1.5rem' }}>{juego.descripcion}</p>}
        <div className="juego-contenido">{renderGame()}</div>
      </div>

      {resultado && (
        (() => {
          const pctLogro = resultado.porcentaje_logro || Math.round((resultado.puntaje_obtenido / resultado.puntaje_maximo) * 100);
          const estrellasIntento = estrellasDePorcentaje(pctLogro);
          const esUltimaActividad = resumenJuegos && resumenJuegos.total > 0 && resumenJuegos.pendientes <= 0;
          const mensajeJuego = estrellasIntento === 3
            ? `¡Increíble! Conseguiste ⭐⭐⭐ con ${resultado.puntaje_obtenido}/${resultado.puntaje_maximo} puntos. ¡Felicidades!`
            : estrellasIntento === 2
              ? `¡Felicidades! Esta vez conseguiste ⭐⭐ con ${resultado.puntaje_obtenido}/${resultado.puntaje_maximo} puntos. ¡Buen trabajo!`
              : `¡Ánimo! Obtuviste ${resultado.puntaje_obtenido}/${resultado.puntaje_maximo} puntos y conseguiste ⭐. Inténtalo nuevamente para mejorar.`;
          return (
            <div className="resultado-card" style={{ marginTop: '2rem' }}>
              <MascotaEduApp
                expression={resultado.puntaje_obtenido >= 60 ? 'celebrando' : 'animando'}
                size={86}
                className="mascota-resultado"
                contexto="juegos"
                estrellas={estrellasIntento}
                pendientes={esUltimaActividad ? 0 : resumenJuegos?.pendientes}
                completados={resumenJuegos?.completados}
                mensaje={esUltimaActividad ? undefined : mensajeJuego}
              />
              <div className="resultado-icono">{resultado.puntaje_obtenido >= 60 ? <MdCheckCircle style={{ color: '#059669' }} /> : <MdError style={{ color: '#dc2626' }} />}</div>
              <h3>{resultado.puntaje_obtenido >= 60 ? '¡Excelente trabajo!' : 'Sigue practicando'}</h3>
              <div className="resultado-puntaje"><MdStar style={{ color: '#f59e0b', verticalAlign: 'middle' }} /> {resultado.puntaje_obtenido} / {resultado.puntaje_maximo} puntos</div>
              <Estrellas estrellas={estrellasIntento} />
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${pctLogro}%` }}>
                  <span>{pctLogro}%</span>
                </div>
              </div>
              <Link to="/student/juegos" className="btn-volver-jugar"><MdRefresh /> Volver a Juegos</Link>
            </div>
          );
        })()
      )}
    </div>
  );
};

export default StudentJuegoResolver;
