import { useState, useRef, useEffect } from 'react';
import { MdExtension, MdCheckCircle, MdError, MdWarning } from 'react-icons/md';

const parseConfig = (c) => (typeof c === 'string' ? (() => { try { return JSON.parse(c); } catch { return {}; } })() : (c || {}));

const CrosswordGame = ({ config: rawConfig, onComplete }) => {
  const config = parseConfig(rawConfig);
  const [userGrid, setUserGrid] = useState({});
  const [resultado, setResultado] = useState(null);
  const inputRefs = useRef({});

  const tablero = config?.tablero || [];
  const size = tablero.length || 10;
  const cols = tablero[0]?.length || size;

  const boardRef = useRef(null);
  const [cellSize, setCellSize] = useState(40);

  // Ajusta dinámicamente el tamaño de cada casilla para que el tablero aproveche
  // el espacio real del contenedor (ancho y alto disponible), manteniendo las
  // casillas cuadradas y sin desbordar ni generar scroll innecesario.
  // tamaño = mínimo(ancho disponible / columnas, alto disponible / filas)
  useEffect(() => {
    const el = boardRef.current;
    if (!el || cols === 0) return;
    const medir = () => {
      const gap = 2;
      const PADDING = 8; // solo reserva espacio mínimo; el margen visual lo da el padding flex
      const anchoDisponible = Math.max(0, Math.min(el.clientWidth, window.innerWidth - 16) - PADDING);
      const altoDisponible = Math.min(window.innerHeight * 0.65, 820);
      const porAncho = Math.floor((anchoDisponible - (cols - 1) * gap) / cols);
      const porAlto = Math.floor((altoDisponible - (size - 1) * gap) / size);
      const s = Math.max(12, Math.min(72, porAncho, porAlto));
      setCellSize(prev => (prev === s ? prev : s));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    window.addEventListener('resize', medir);
    return () => { ro.disconnect(); window.removeEventListener('resize', medir); };
  }, [size, cols]);

  // All words from teacher form (may include unplaced words)
  const todasLasPalabras = (config?.palabras || []).filter(p => p.palabra);
  // Only placed words (have grid coordinates from generator)
  const pistas = (config?.pistas || []).filter(p => p.palabra);

  // Build a merged list: show all words, mark which are placed
  const words = todasLasPalabras.map((wp, idx) => {
    const placed = pistas.find(pp => pp.palabra?.toUpperCase() === wp.palabra?.toUpperCase());
    return {
      ...wp,
      numero: placed?.numero || (idx + 1),
      fila: placed?.fila,
      col: placed?.col,
      orientacion: placed?.orientacion || wp?.orientacion || 'H',
      placed: !!placed
    };
  });

  console.log('[CrosswordGame] Todas las palabras:', todasLasPalabras.length);
  console.log('[CrosswordGame] Pistas colocadas:', pistas.length);
  console.log('[CrosswordGame] Words merged:', words);

  if (words.length === 0) {
    return (
      <div className="game-empty">
        <MdExtension className="game-icon-big" />
        <h3>Crucigrama no disponible</h3>
        <p>El docente no ha configurado este crucigrama correctamente.</p>
      </div>
    );
  }

  const handleCellChange = (row, col, value) => {
    const key = `${row}-${col}`;
    setUserGrid(prev => ({ ...prev, [key]: value.toUpperCase() }));
    if (value) {
      const cell = tablero[row]?.[col];
      if (cell?.numero) {
        const word = pistas.find(w => w.numero === cell.numero);
        if (word) {
          const dr = word.orientacion === 'V' ? 1 : 0;
          const dc = word.orientacion === 'H' ? 1 : 0;
          setTimeout(() => inputRefs.current[`${row + dr}-${col + dc}`]?.focus(), 50);
          return;
        }
      }
      const hKey = `${row}-${col + 1}`;
      if (tablero[row]?.[col + 1] && tablero[row]?.[col + 1] !== '#') {
        setTimeout(() => inputRefs.current[hKey]?.focus(), 50);
      } else {
        const vKey = `${row + 1}-${col}`;
        if (tablero[row + 1]?.[col] && tablero[row + 1]?.[col] !== '#') {
          setTimeout(() => inputRefs.current[vKey]?.focus(), 50);
        }
      }
    }
  };

  const handleKeyDown = (e, row, col) => {
    if (e.key === 'Backspace' && !userGrid[`${row}-${col}`]) {
      const hKey = `${row}-${col - 1}`;
      if (tablero[row]?.[col - 1] && tablero[row]?.[col - 1] !== '#') {
        setTimeout(() => inputRefs.current[hKey]?.focus(), 50);
      } else {
        const vKey = `${row - 1}-${col}`;
        if (tablero[row - 1]?.[col] && tablero[row - 1]?.[col] !== '#') {
          setTimeout(() => inputRefs.current[vKey]?.focus(), 50);
        }
      }
    }
  };

  const handleSubmit = () => {
    let correctas = 0;
    let totalValidadas = 0;
    const detalles = [];

    words.forEach((word) => {
      if (!word.placed) return; // Skip unplaced words
      totalValidadas++;
      const expected = word.palabra.toUpperCase();
      const dr = word.orientacion === 'V' ? 1 : 0;
      const dc = word.orientacion === 'H' ? 1 : 0;

      let userWord = '';
      for (let i = 0; i < expected.length; i++) {
        const r = word.fila + dr * i;
        const c = word.col + dc * i;
        userWord += (userGrid[`${r}-${c}`] || '');
      }

      const isCorrect = userWord === expected;
      if (isCorrect) correctas++;
      detalles.push({ word: word.palabra, expected, userWord, isCorrect, numero: word.numero });
    });

    console.log('[CrosswordGame] Validación:', detalles);
    const puntaje = totalValidadas > 0 ? Math.round((correctas / totalValidadas) * 100) : 0;
    console.log(`[CrosswordGame] Puntaje: ${correctas}/${totalValidadas} = ${puntaje}`);
    setResultado({ correctas, total: totalValidadas, puntaje });
    onComplete({ puntaje_obtenido: puntaje, respuestas: userGrid });
  };

  const getExpectedLetter = (row, col) => {
    const cell = tablero[row]?.[col];
    if (!cell || cell === '#') return null;
    if (typeof cell === 'object' && cell.letra) return cell.letra.toUpperCase();
    if (typeof cell === 'string') return cell.toUpperCase();
    return null;
  };

  const getCellValidation = (row, col) => {
    if (!resultado) return null;
    const cell = tablero[row]?.[col];
    if (!cell || cell === '#') return null;
    const key = `${row}-${col}`;
    const typed = userGrid[key] || '';
    const expected = getExpectedLetter(row, col);
    if (!typed && !expected) return null;
    if (typed && expected) return typed.toUpperCase() === expected;
    return null;
  };

  return (
    <div className="game-container crossword-game-container">
      <div className="game-header">
        <MdExtension className="game-icon" />
        <span className="game-type-label">Crucigrama</span>
        <span className="game-hint">Escribe las letras en las casillas según las pistas</span>
      </div>

      {tablero.length > 0 && (
        <div className="crossword-board" ref={boardRef}>
          <div className="sopa-grid" style={{
            gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
            gap: '2px'
          }}>
            {tablero.flat().map((cell, i) => {
              const row = Math.floor(i / cols), col = i % cols;
              const isBlocked = !cell || cell === '#';
              const cellValidation = getCellValidation(row, col);
              const bgColor = isBlocked ? 'var(--cwg-cell-blocked-bg)'
                : cellValidation === true ? 'var(--success)'
                : cellValidation === false ? 'var(--danger)'
                : 'var(--cwg-cell-active-bg)';
              const borderColor = isBlocked ? 'var(--cwg-cell-blocked-border)'
                : cellValidation === true ? 'var(--success)'
                : cellValidation === false ? 'var(--danger)'
                : 'var(--cwg-cell-active-border)';
              const textColor = isBlocked ? 'transparent'
                : cellValidation !== null ? 'white'
                : 'var(--text-strong)';
              const keyCell = `${row}-${col}`;
              const val = userGrid[keyCell] || '';

              return (
                <div key={i} className="sopa-cell" style={{
                  width: cellSize, height: cellSize,
                  background: bgColor, color: textColor,
                  border: `1px solid ${borderColor}`,
                  position: 'relative', transition: 'all 0.3s ease'
                }}>
                  {!isBlocked && (
                    <>
                      {cell?.numero && (
                        <span style={{
                          position: 'absolute', top: '2px', left: '4px',
                          fontSize: '0.7rem', fontWeight: 700,
                          color: cellValidation !== null ? 'rgba(255,255,255,0.85)' : 'var(--cwg-cell-number)',
                          lineHeight: 1, pointerEvents: 'none', zIndex: 1
                        }}>
                          {cell.numero}
                        </span>
                      )}
                      <input ref={el => inputRefs.current[keyCell] = el}
                        value={val}
                        onChange={(e) => handleCellChange(row, col, e.target.value.slice(-1))}
                        onKeyDown={(e) => handleKeyDown(e, row, col)}
                        maxLength={1} disabled={!!resultado}
                        style={{
                          width: '100%', height: '100%', border: 'none', background: 'transparent',
                          textAlign: 'center', fontSize: cellSize < 30 ? '0.9rem' : cellSize < 44 ? '1.15rem' : '1.45rem', fontWeight: 800,
                          textTransform: 'uppercase', outline: 'none', color: 'inherit',
                          fontFamily: 'inherit', cursor: resultado ? 'default' : 'text',
                          padding: 0, boxSizing: 'border-box', position: 'relative', zIndex: 2
                        }} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="crossword-clues">
        <div className="crossword-clues-header">
          <h4>Pistas ({words.length}):</h4>
          <span className="crossword-orientation-legend"><strong>↓</strong> Vertical · <strong>→</strong> Horizontal</span>
        </div>
        {words.map((w, i) => (
          <div key={i} className="clue-item" style={{
            opacity: w.placed ? 1 : 0.6,
            borderLeft: w.placed ? '3px solid #0891b2' : '3px solid #d1d5db'
          }}>
            <span className="clue-orient">{w.orientacion === 'V' ? '↓' : '→'}</span>
            <div className="clue-content">
              <span className="clue-text">
                <strong>#{w.numero}</strong>: {w.pista || 'Sin pista'} <em>({w.palabra.length})</em>
              </span>
              {!w.placed && (
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                  <MdWarning style={{ verticalAlign: 'middle' }} /> No tiene posición en el tablero
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {!resultado ? (
        <button className="game-submit-btn" onClick={handleSubmit} disabled={Object.keys(userGrid).length === 0}>
          {Object.keys(userGrid).length > 0 ? 'Verificar respuestas' : 'Completa las casillas primero'}
        </button>
      ) : (
        <div className={`game-result ${resultado.puntaje >= 60 ? 'success' : 'fail'}`}>
          <p>{resultado.puntaje >= 60 ? <MdCheckCircle /> : <MdError />} Acertaste {resultado.correctas} de {resultado.total} palabras</p>
          <p className="result-score">Puntaje: {resultado.puntaje}/100</p>
        </div>
      )}
    </div>
  );
};

export default CrosswordGame;
