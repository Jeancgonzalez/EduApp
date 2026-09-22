import { useState, useCallback } from 'react';
import { MdGridOn, MdCheckCircle, MdError, MdSearch } from 'react-icons/md';

const parseConfig = (c) => (typeof c === 'string' ? (() => { try { return JSON.parse(c); } catch { return {}; } })() : (c || {}));

const WordSearchGame = ({ config: rawConfig, onComplete }) => {
  const config = parseConfig(rawConfig);
  const [selected, setSelected] = useState([]);
  const [found, setFound] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [hoverPos, setHoverPos] = useState(null);

  const palabras = (config?.palabras || []).filter(p => p.palabra);
  const todasLasPalabras = palabras.map(p => p.palabra.toUpperCase());
  const gridData = config?.tablero || [];
  const gridSize = config?.tamano || 10;

  if (palabras.length === 0) {
    return (
      <div className="game-empty">
        <MdGridOn className="game-icon-big" />
        <h3>Sopa de Letras no disponible</h3>
        <p>El docente no ha configurado este juego correctamente.</p>
      </div>
    );
  }

  const getWordAt = useCallback((r1, c1, r2, c2) => {
    const dr = r2 === r1 ? 0 : (r2 > r1 ? 1 : -1);
    const dc = c2 === c1 ? 0 : (c2 > c1 ? 1 : -1);
    if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return '';
    const steps = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1));
    let word = '';
    for (let i = 0; i <= steps; i++) {
      const r = r1 + dr * i, c = c1 + dc * i;
      if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) return '';
      word += (gridData[r]?.[c] || '');
    }
    return word;
  }, [gridData, gridSize]);

  const handleCellClick = (row, col) => {
    if (resultado) return;
    if (found.some(f => f.row === row && f.col === col)) return;
    if (selected.length === 0) {
      setSelected([{ row, col }]);
    } else {
      const first = selected[0];
      const last = selected[selected.length - 1];
      if (first.row === row && first.col === col) {
        setSelected([]);
        return;
      }
      const word = getWordAt(first.row, first.col, row, col);
      const wordRev = word.split('').reverse().join('');
      const matchIdx = todasLasPalabras.findIndex(w => w === word || w === wordRev);
      if (matchIdx !== -1 && !found.some(f => f.palabraIdx === matchIdx)) {
        const fromRow = first.row, fromCol = first.col;
        const toRow = row, toCol = col;
        const dr = toRow === fromRow ? 0 : (toRow > fromRow ? 1 : -1);
        const dc = toCol === fromCol ? 0 : (toCol > fromCol ? 1 : -1);
        const steps = Math.max(Math.abs(toRow - fromRow), Math.abs(toCol - fromCol));
        const cells = [];
        for (let i = 0; i <= steps; i++) {
          cells.push({ row: fromRow + dr * i, col: fromCol + dc * i });
        }
        setFound(prev => [...prev, { palabraIdx: matchIdx, cells }]);
        setSelected([]);
      } else {
        setSelected([{ row, col }]);
      }
    }
  };

  const handleCellHover = (row, col) => {
    if (resultado || selected.length === 0) return;
    setHoverPos({ row, col });
  };

  const isSelected = (r, c) => selected.some(s => s.row === r && s.col === c);
  const isFound = (r, c) => found.some(f => f.cells.some(cell => cell.row === r && cell.col === c));

  const handleSubmit = () => {
    const puntaje = Math.round((found.length / todasLasPalabras.length) * 100);
    setResultado({ encontradas: found.length, total: todasLasPalabras.length, puntaje });
    onComplete({ puntaje_obtenido: puntaje, palabras_encontradas: found.map(f => todasLasPalabras[f.palabraIdx]) });
  };

  return (
    <div className="game-container">
      <div className="game-header">
        <MdGridOn className="game-icon" />
        <span className="game-type-label">Sopa de Letras</span>
        <span className="game-hint">Haz clic en la primera letra y luego en la última para marcar una palabra</span>
      </div>
      <div className="sopa-layout">
        <div className="sopa-grid-section">
          {gridData.length > 0 ? (
            <div className="sopa-grid" style={{ '--grid-size': gridSize }}>
              {gridData.flat().map((letra, i) => {
                const row = Math.floor(i / gridSize);
                const col = i % gridSize;
                const foundCell = isFound(row, col);
                const selCell = isSelected(row, col);
                return (
                  <span key={i} className={`sopa-cell ${foundCell ? 'found-cell' : ''} ${selCell ? 'selected-cell' : ''}`}
                    style={{
                      background: foundCell ? 'var(--success)' : selCell ? 'var(--accent)' : 'var(--bg-elevated)',
                      color: foundCell || selCell ? 'white' : 'var(--text-strong)',
                      cursor: resultado ? 'default' : 'pointer',
                      fontWeight: foundCell ? 700 : 600,
                      transition: 'all 0.2s ease',
                      userSelect: 'none'
                    }}
                    onClick={() => handleCellClick(row, col)}
                    onMouseEnter={() => handleCellHover(row, col)}>
                    {letra || ''}
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="no-board-msg">Cuadrícula no disponible.</div>
          )}
        </div>
        <div className="sopa-sidebar">
          <div className="word-list-panel">
            <h4>Encuentra las siguientes palabras:</h4>
            {palabras.map((p, i) => {
              const foundWord = found.some(f => f.palabraIdx === i);
              return (
                <div key={i} className="word-item" style={{ opacity: foundWord ? 0.6 : 1 }}>
                  <div className="word-main" style={{
                    color: foundWord ? 'var(--success)' : 'var(--text-strong)',
                    textDecoration: foundWord ? 'line-through' : 'none'
                  }}>
                    <MdSearch className="word-icon" />
                    <span>{p.palabra}</span>
                    {foundWord && <MdCheckCircle className="word-check" />}
                  </div>
                  {p.pista && <p className="word-hint">{p.pista}</p>}
                </div>
              );
            })}
          </div>
          <div className="found-counter" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-strong)', padding: '0.5rem 0' }}>
            Encontradas: {found.length}/{todasLasPalabras.length}
          </div>
        </div>
      </div>
      {!resultado ? (
        <button className="game-submit-btn" onClick={handleSubmit} disabled={found.length === 0}>
          {found.length > 0 ? `Finalizar búsqueda (${found.length}/${todasLasPalabras.length})` : 'Selecciona palabras en la cuadrícula'}
        </button>
      ) : (
        <div className={`game-result ${resultado.puntaje >= 60 ? 'success' : 'fail'}`}
          style={{ animation: 'resultAnim 0.4s ease' }}>
          <p>{resultado.puntaje >= 60 ? <MdCheckCircle /> : <MdError />} Encontraste {resultado.encontradas} de {resultado.total} palabras</p>
          <p className="result-score">Puntaje: {resultado.puntaje}/100</p>
        </div>
      )}
    </div>
  );
};

export default WordSearchGame;
