import { useState, useMemo, Fragment } from 'react';
import { MdCompareArrows, MdCheckCircle, MdError, MdArrowForward } from 'react-icons/md';

const parseConfig = (c) => (typeof c === 'string' ? (() => { try { return JSON.parse(c); } catch { return {}; } })() : (c || {}));

const QuizGame = ({ config: rawConfig, onComplete }) => {
  const config = parseConfig(rawConfig);
  const [respuestas, setRespuestas] = useState({});
  const [resultado, setResultado] = useState(null);
  const [hover, setHover] = useState(null);

  const pares = useMemo(() => (config?.pares || []).filter(p => p.columnaA && p.columnaB), [rawConfig]);

  const numStyle = {
    flexShrink: 0, minWidth: '1.7rem', height: '1.7rem', padding: '0 0.35rem',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '0.5rem', background: 'var(--accent)', color: '#ffffff',
    fontWeight: 700, fontSize: '0.85rem', lineHeight: 1
  };

  if (pares.length === 0) {
    return (
      <div className="game-empty">
        <MdCompareArrows className="game-icon-big" />
        <h3>Relacionar no disponible</h3>
        <p>El docente no ha configurado este juego correctamente.</p>
      </div>
    );
  }

  const handleSubmit = () => {
    let correctas = 0;
    pares.forEach((par, i) => {
      if (respuestas[`r_${i}`] === par.columnaB) correctas++;
    });
    const puntaje = Math.round((correctas / pares.length) * 100);
    setResultado({ correctas, total: pares.length, puntaje });
    onComplete({ puntaje_obtenido: puntaje, respuestas });
  };

  return (
    <div className="game-container">
      <div className="game-header">
        <MdCompareArrows className="game-icon" />
        <span className="game-type-label">Relacionar Conceptos</span>
        <span className="game-hint">Cada número es la fila de la columna A que estás resolviendo</span>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        rowGap: '0.75rem', columnGap: '1rem',
        maxWidth: '700px', margin: '0 auto', alignItems: 'center'
      }}>
        {/* Encabezados */}
        <div style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent)', paddingBottom: '0.5rem', borderBottom: '2px solid var(--border)', marginBottom: '0.25rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Columna A</div>
        <div />
        <div style={{ textAlign: 'center', fontWeight: 700, color: 'var(--info)', paddingBottom: '0.5rem', borderBottom: '2px solid var(--border)', marginBottom: '0.25rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Columna B</div>

        {/* Filas: Caja A | Flecha | Dropdown B */}
        {pares.map((par, i) => {
          const selected = respuestas[`r_${i}`];
          const isCorrect = resultado && selected === par.columnaB;
          const isWrong = resultado && selected && selected !== par.columnaB;
          const arrowColor = resultado
            ? (selected ? (selected === par.columnaB ? 'var(--success)' : 'var(--danger)') : 'var(--text-muted)')
            : undefined;
          return (
            <Fragment key={i}>
              {/* Caja A */}
              <div
                onMouseEnter={() => { if (!resultado) setHover({ n: i }); }}
                onMouseLeave={() => setHover(null)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={numStyle}>{i + 1}</span>
                <div style={{
                  flex: 1, minHeight: '3.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  padding: '0.9rem 1.25rem', background: resultado
                    ? (selected === par.columnaB ? 'var(--success-soft)' : 'var(--danger-soft)')
                    : 'var(--accent-soft)',
                  color: resultado
                    ? (selected === par.columnaB ? 'var(--success)' : 'var(--danger)')
                    : 'var(--accent)',
                  borderRadius: '0.75rem', fontWeight: 600, textAlign: 'center', fontSize: '0.95rem',
                  border: `2px solid ${resultado
                    ? (selected === par.columnaB ? 'var(--success)' : 'var(--danger)')
                    : 'var(--accent)'}`,
                  transition: 'all 0.3s ease',
                  boxShadow: hover && hover.n === i ? '0 0 0 3px var(--accent), 0 4px 12px -2px rgba(0,0,0,0.2)' : '0 2px 4px rgba(0,0,0,0.04)'
                }}>
                  <span>{par.columnaA}</span>
                  {resultado && selected === par.columnaB && (
                    <MdCheckCircle style={{ marginLeft: '0.25rem' }} />
                  )}
                </div>
              </div>

              {/* Flecha */}
              <div
                onMouseEnter={() => { if (!resultado) setHover({ n: i }); }}
                onMouseLeave={() => setHover(null)}
                className="games-rel-arrow"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: arrowColor, transition: 'color 0.3s ease' }}>
                <MdArrowForward size={20} />
              </div>

              {/* Dropdown B */}
              <div
                onMouseEnter={() => { if (!resultado) setHover({ n: i }); }}
                onMouseLeave={() => setHover(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  borderRadius: '0.75rem',
                  boxShadow: hover && hover.n === i ? '0 0 0 3px var(--accent), 0 4px 12px -2px rgba(0,0,0,0.2)' : 'none',
                  transition: 'box-shadow 0.3s ease'
                }}>
                <select
                  value={selected || ''}
                  onChange={(e) => setRespuestas(prev => ({ ...prev, [`r_${i}`]: e.target.value }))}
                  onFocus={() => { if (!resultado) setHover({ n: i }); }}
                  onBlur={() => setHover(null)}
                  disabled={!!resultado}
                  style={{
                    flex: 1, width: '100%', minHeight: '3.1rem', padding: '0.9rem 1.25rem', borderRadius: '0.75rem',
                    border: `2px solid ${isCorrect ? 'var(--success)' : isWrong ? 'var(--danger)' : 'var(--info-soft)'}`,
                    background: isCorrect ? 'var(--success-soft)' : isWrong ? 'var(--danger-soft)' : 'var(--bg-card)',
                    color: isCorrect ? 'var(--success)' : isWrong ? 'var(--danger)' : 'var(--text)',
                    fontWeight: 600, fontSize: '0.95rem', cursor: resultado ? 'default' : 'pointer',
                    transition: 'all 0.3s ease', outline: 'none', fontFamily: 'inherit'
                  }}>
                  <option value="">—</option>
                  {pares.map(p => <option key={p.columnaB} value={p.columnaB}>{p.columnaB}</option>)}
                </select>
                <span style={numStyle}>{i + 1}</span>
              </div>
            </Fragment>
          );
        })}
      </div>

      {!resultado ? (
        <button className="game-submit-btn" onClick={handleSubmit} disabled={Object.keys(respuestas).length === 0}>
          {Object.keys(respuestas).length > 0 ? 'Verificar respuestas' : 'Relaciona los elementos primero'}
        </button>
      ) : (
        <div className={`game-result ${resultado.puntaje >= 60 ? 'success' : 'fail'}`}>
          <p><MdCheckCircle /> Acertaste {resultado.correctas} de {resultado.total} pares</p>
          <p className="result-score">Puntaje: {resultado.puntaje}/100</p>
        </div>
      )}
    </div>
  );
};

export default QuizGame;
