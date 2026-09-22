import { useState, useEffect } from 'react';
import { MdMemory, MdCheckCircle, MdError } from 'react-icons/md';

const parseConfig = (c) => (typeof c === 'string' ? (() => { try { return JSON.parse(c); } catch { return {}; } })() : (c || {}));

const cardFrontStyle = {
  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: '0.5rem', backfaceVisibility: 'hidden', fontWeight: 700, fontSize: '1.5rem',
  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', zIndex: 2
};
const cardBackStyle = {
  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: '0.5rem', backfaceVisibility: 'hidden', fontWeight: 700, fontSize: '0.9rem',
  background: 'var(--bg-elevated)', border: '2px solid var(--border)', transform: 'rotateY(180deg)',
  color: 'var(--text-strong)', padding: '0.2rem', wordBreak: 'break-word', textAlign: 'center', lineHeight: '1.2'
};

const MemoryGame = ({ config: rawConfig, onComplete }) => {
  const config = parseConfig(rawConfig);
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState([]);
  const [attempts, setAttempts] = useState(0);
  const [resultado, setResultado] = useState(null);
  const [lockBoard, setLockBoard] = useState(false);

  const pares = (config?.pares || []).filter(p => p.elemento1 && p.elemento2);

  useEffect(() => {
    if (pares.length > 0) {
      setCards(pares.flatMap((par, idx) => [
        { id: idx * 2, pairId: idx, content: par.elemento1 },
        { id: idx * 2 + 1, pairId: idx, content: par.elemento2 },
      ]).sort(() => Math.random() - 0.5));
      setFlipped([]); setMatched([]); setAttempts(0); setResultado(null); setLockBoard(false);
    }
  }, [rawConfig]);

  useEffect(() => {
    if (cards.length > 0 && matched.length === cards.length && !resultado) {
      const intentosOptimos = pares.length;
      const puntaje = Math.max(0, Math.round((intentosOptimos / Math.max(attempts, intentosOptimos)) * 100));
      setResultado({ puntaje, attempts, total: pares.length });
      onComplete({ puntaje_obtenido: puntaje, intentos: attempts });
    }
  }, [matched.length, cards.length]);

  if (pares.length === 0) {
    return (
      <div className="game-empty">
        <MdMemory className="game-icon-big" />
        <h3>Memorama no disponible</h3>
        <p>El docente no ha configurado este juego correctamente.</p>
      </div>
    );
  }

  const handleCardClick = (cardId) => {
    if (lockBoard || resultado) return;
    if (flipped.includes(cardId) || matched.includes(cardId)) return;
    if (flipped.length === 2) return;

    const newFlipped = [...flipped, cardId];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setLockBoard(true);
      setAttempts(attempts + 1);
      const [first, second] = newFlipped;
      const card1 = cards.find(c => c.id === first);
      const card2 = cards.find(c => c.id === second);
      if (card1?.pairId === card2?.pairId) {
        setMatched([...matched, first, second]);
        setFlipped([]);
        setLockBoard(false);
      } else {
        setTimeout(() => { setFlipped([]); setLockBoard(false); }, 900);
      }
    }
  };

  return (
    <div className="game-container">
      <div className="game-header">
        <MdMemory className="game-icon" />
        <span className="game-type-label">Memorama</span>
        <span className="game-hint">Encuentra todos los pares haciendo clic en las cartas</span>
      </div>
      <div className="memory-stats-bar">
        <span>Intentos: {attempts}</span>
        <span>Encontrados: {Math.floor(matched.length / 2)}/{pares.length}</span>
      </div>
      <div className="memory-board">
        {cards.map((card) => {
          const isFlipped = flipped.includes(card.id) || matched.includes(card.id);
          return (
            <div key={card.id}
              onClick={() => handleCardClick(card.id)}
              style={{
                aspectRatio: '1', perspective: '600px', cursor: resultado ? 'default' : 'pointer'
              }}>
              <div style={{
                width: '100%', height: '100%', position: 'relative',
                transformStyle: 'preserve-3d', transition: 'transform 0.45s ease',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
              }}>
                <div style={cardFrontStyle}>?</div>
                <div style={{
                  ...cardBackStyle,
                  background: matched.includes(card.id) ? 'var(--success-soft)' : 'var(--bg-elevated)',
                  borderColor: matched.includes(card.id) ? 'var(--success)' : 'var(--border)',
                  color: matched.includes(card.id) ? 'var(--success)' : 'var(--text-strong)'
                }}>{card.content}</div>
              </div>
            </div>
          );
        })}
      </div>
      {resultado && (
        <div className={`game-result ${resultado.puntaje >= 60 ? 'success' : 'fail'}`}>
          <p>{resultado.puntaje >= 60 ? <MdCheckCircle /> : <MdError />} Juego completado en {resultado.attempts} intentos</p>
          <p className="result-score">Puntaje: {resultado.puntaje}/100</p>
        </div>
      )}
    </div>
  );
};

export default MemoryGame;
