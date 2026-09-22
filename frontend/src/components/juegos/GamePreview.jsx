import React from 'react';
import './GamePreview.css';

const GamePreview = ({ config }) => {
  if (!config || !config.tipo) {
    return (
      <div className="game-preview empty">
        <p>Selecciona un tipo de juego y agrega datos para ver la vista previa.</p>
      </div>
    );
  }

  const renderPreview = () => {
    switch (config.tipo) {
      case 'sopa_de_letras':
        return (
          <div className="preview-content">
            <p><strong>Palabras a buscar:</strong></p>
            <div className="word-tags">
              {config.palabras?.map((p, i) => (
                p.palabra ? <span key={i} className="word-tag">{p.palabra}</span> : null
              ))}
            </div>
            <p className="preview-hint">El tablero de {config.tamano || 10}x{config.tamano || 10} se generará automáticamente.</p>
          </div>
        );
      
      case 'crucigrama':
        return (
          <div className="preview-content">
            <p><strong>Pistas del Crucigrama:</strong></p>
            <ul className="preview-list">
              {config.palabras?.map((p, i) => (
                p.palabra && p.pista ? (
                  <li key={i}>
                    {p.pista} <strong>→ {p.palabra}</strong>
                  </li>
                ) : null
              ))}
            </ul>
          </div>
        );

      case 'adivinanza':
        return (
          <div className="preview-content adivinanza-preview">
            <div className="acertijo-box">
              <span className="quote-icon">❝</span>
              <p>{config.adivinanza || 'Escribe una adivinanza...'}</p>
            </div>
            <div className="respuesta-box">
              <span>Opciones:</span>
              <ul>
                {['A', 'B', 'C'].map(l => config[`opcion${l}`] ? <li key={l}>{l}: {config[`opcion${l}`]}</li> : null)}
              </ul>
              <span>Correcta: <strong>{config.respuestaCorrecta || '...'}</strong></span>
            </div>
            {config.pista && (
              <p className="pista-text">💡 Pista: {config.pista}</p>
            )}
          </div>
        );

      case 'memoria':
      case 'relacionar':
        return (
          <div className="preview-content">
            <p><strong>Pares a relacionar:</strong></p>
            <div className="pares-grid">
              {config.pares?.map((p, i) => {
                const A = p.elemento1 || p.columnaA;
                const B = p.elemento2 || p.columnaB;
                if (!A && !B) return null;
                return (
                  <div key={i} className="par-preview">
                    <div className="par-card-preview">{A || '?'}</div>
                    <span className="link-icon">⟷</span>
                    <div className="par-card-preview">{B || '?'}</div>
                  </div>
                );
              })}
            </div>
            <p className="preview-hint">En el juego real, estos elementos aparecerán desordenados.</p>
          </div>
        );

      default:
        return <p>Vista previa no disponible para este tipo.</p>;
    }
  };

  return (
    <div className="game-preview-container fade-in">
      <h3>Vista Previa del Juego</h3>
      <div className="game-preview-box">
        {renderPreview()}
      </div>
    </div>
  );
};

export default GamePreview;
