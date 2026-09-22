import React, { useEffect, useState } from 'react';
import './DynamicGameForm.css';

/* ============================
   GENERADOR DE SOPA DE LETRAS
   ============================ */
const generarSopaDeLetras = (palabras, tamano = 12) => {
  const size = Math.max(tamano, 10);
  const grid = Array.from({ length: size }, () => Array(size).fill(''));
  const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const DIRECCIONES = [
    [0, 1], [1, 0], [0, -1], [-1, 0],
    [1, 1], [-1, -1], [1, -1], [-1, 1]
  ];

  const palabrasFiltradas = palabras
    .map(p => p.palabra?.toUpperCase().replace(/\s/g, ''))
    .filter(p => p && p.length > 0 && p.length <= size);

  const placed = [];
  for (const palabra of palabrasFiltradas) {
    let colocada = false;
    for (let intento = 0; intento < 100 && !colocada; intento++) {
      const dir = DIRECCIONES[Math.floor(Math.random() * DIRECCIONES.length)];
      const fila = Math.floor(Math.random() * size);
      const col = Math.floor(Math.random() * size);
      const endFila = fila + dir[0] * (palabra.length - 1);
      const endCol = col + dir[1] * (palabra.length - 1);
      if (endFila < 0 || endFila >= size || endCol < 0 || endCol >= size) continue;
      let ok = true;
      for (let i = 0; i < palabra.length; i++) {
        const r = fila + dir[0] * i, c = col + dir[1] * i;
        if (grid[r][c] !== '' && grid[r][c] !== palabra[i]) { ok = false; break; }
      }
      if (ok) {
        for (let i = 0; i < palabra.length; i++) grid[fila + dir[0] * i][col + dir[1] * i] = palabra[i];
        placed.push(palabra);
        colocada = true;
      }
    }
  }
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (!grid[r][c]) grid[r][c] = LETRAS[Math.floor(Math.random() * LETRAS.length)];
  return { grid, size, palabrasColocadas: placed };
};

/* ============================
   GENERADOR DE CRUCIGRAMA (auto-ubicación)
   El docente solo ingresa palabra + pista; este generador decide la
   orientación y la posición de cada palabra para que se entrelacen.
   Estrategia:
     1) Normalizar letras; descartar las palabras que no caben en el tablero.
     2) Ordenar de mayor a menor longitud (las largas se ubican primero).
     3) Primera palabra en horizontal, centrada.
4) Resto: probar todas las posiciones del tablero en ambas orientaciones y
         escoger la de más cruces; las palabras sin letras en común se ubican en
         la posición más cercana al cuerpo del crucigrama (siempre acopladas).
   ============================ */
const generarCrucigrama = (palabrasInput, tamano = 15) => {
  const size = tamano;
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  const colocadas = [];
  const noColocadas = [];

  // 1) Normalización y filtrado.
  const palabras = palabrasInput
    .map(p => ({
      palabra: (p.palabra || '').toUpperCase().replace(/\s/g, ''),
      pista: (p.pista || '').trim()
    }))
    .filter(p => p.palabra.length > 0)
    .filter(p => {
      if (p.palabra.length > size) {
        noColocadas.push(`${p.palabra} (demasiado larga)`);
        return false;
      }
      return true;
    })
    // 2) De mayor a menor longitud.
    .sort((a, b) => b.palabra.length - a.palabra.length)
    .map((p, i) => ({ ...p, numero: i + 1 }));

  if (palabras.length === 0) return { grid, colocadas, size, noColocadas };

  // Escribe la palabra en (fila, col) según la orientación (número en su inicio).
  const escribir = (pw, fila, col, orientacion) => {
    for (let k = 0; k < pw.palabra.length; k++) {
      const r = orientacion === 'V' ? fila + k : fila;
      const c = orientacion === 'H' ? col + k : col;
      if (!grid[r][c]) grid[r][c] = { letra: pw.palabra[k], numero: k === 0 ? pw.numero : null };
    }
  };

  // ¿La palabra cabe completa dentro del tablero desde (fila, col)?
  const enLimites = (fila, col, longitud, orientacion) => {
    const fin = orientacion === 'V' ? fila + longitud : col + longitud;
    return fila >= 0 && col >= 0 && fila < size && col < size && fin <= size;
  };

  // Evalúa una candidatura (fila, col, orientacion) para 'pw'.
  //  - Cada celda propia debe estar vacía o contener la misma letra (cruce).
  //  - Las celdas ortogonalmente adyacentes que NO son cruce deben estar
  //    vacías, para que las palabras no queden pegadas sin cruzarse.
  // Devuelve el número de cruces (letras compartidas) o -1 si no es válida.
  const crucesDe = (pw, fila, col, orientacion) => {
    if (!enLimites(fila, col, pw.palabra.length, orientacion)) return -1;
    const cruces = [];
    for (let k = 0; k < pw.palabra.length; k++) {
      const r = orientacion === 'V' ? fila + k : fila;
      const c = orientacion === 'H' ? col + k : col;
      if (grid[r][c]) {
        if (grid[r][c].letra !== pw.palabra[k]) return -1; // letra distinta
        cruces.push(k);
      }
    }
    // Regla de aislamiento: vecinos ortogonales de las celdas sin cruce vacíos.
    for (let k = 0; k < pw.palabra.length; k++) {
      if (cruces.includes(k)) continue;
      const r = orientacion === 'V' ? fila + k : fila;
      const c = orientacion === 'H' ? col + k : col;
      const vecinos = orientacion === 'V' ? [[r, c - 1], [r, c + 1]] : [[r - 1, c], [r + 1, c]];
      for (const [vr, vc] of vecinos) {
        if (vr >= 0 && vr < size && vc >= 0 && vc < size && grid[vr][vc]) return -1;
      }
    }
    return cruces.length;
  };

  // Distancia mínima (Chebyshev) de una candidatura al cuerpo del crucigrama,
  // para que las palabras sin cruce queden pegadas al conjunto y nunca "floten"
  // en un extremo lejano del tablero.
  const distanciaAlCuerpo = (fila, col, orientacion, longitud) => {
    let min = Infinity;
    for (let k = 0; k < longitud; k++) {
      const r = orientacion === 'V' ? fila + k : fila;
      const c = orientacion === 'H' ? col + k : col;
      for (let rf = 0; rf < size; rf++) {
        for (let cf = 0; cf < size; cf++) {
          if (!grid[rf][cf]) continue;
          const d = Math.max(Math.abs(rf - r), Math.abs(cf - c));
          if (d < min) min = d;
        }
      }
    }
    return min;
  };

  // 3) Primera palabra: horizontal, centrada.
  const primera = palabras[0];
  const filaIni = Math.floor(size / 2);
  const colIni = Math.floor((size - primera.palabra.length) / 2);
  escribir(primera, filaIni, colIni, 'H');
  colocadas.push({ ...primera, fila: filaIni, col: colIni, orientacion: 'H' });

  // 4) Resto de palabras: probar TODAS las posiciones del tablero en ambas
  //    orientaciones y escoger la mejor según:
  //      - cuantos más cruces tenga la candidatura, mejor (acople real);
  //      - a igualdad de cruces, la más cercana al cuerpo del crucigrama.
  //    Score = cruces * 1000 - distancia. Así, una palabra sin letras en común
  //    se coloca inmediatamente al lado del cuerpo (distancia mínima) en lugar
  //    de quedar descolgada en un borde.
  for (let idx = 1; idx < palabras.length; idx++) {
    const pw = palabras[idx];
    let mejor = null;
    let mejorScore = -Infinity;

    for (let fila = 0; fila < size; fila++) {
      for (let col = 0; col < size; col++) {
        for (const orientacion of ['H', 'V']) {
          const cruces = crucesDe(pw, fila, col, orientacion);
          if (cruces < 0) continue;
          const dist = distanciaAlCuerpo(fila, col, orientacion, pw.palabra.length);
          const score = cruces * 1000 - dist;
          if (score > mejorScore) {
            mejorScore = score;
            mejor = { fila, col, orientacion, cruces };
          }
        }
      }
    }

    if (mejor) {
      escribir(pw, mejor.fila, mejor.col, mejor.orientacion);
      colocadas.push({ ...pw, fila: mejor.fila, col: mejor.col, orientacion: mejor.orientacion });
    } else {
      noColocadas.push(`${pw.palabra} (sin espacio)`);
    }
  }

  return { grid, colocadas, size, noColocadas };
};

/* ============================
   GENERADOR DE MEMOTEST
   ============================ */
const generarMemoria = (pares) => {
  return pares.filter(p => p.elemento1 && p.elemento2);
};

/* ============================
   GENERADOR DE RELACIONAR
   ============================ */
const generarRelacionar = (pares) => {
  return pares.filter(p => p.columnaA && p.columnaB);
};


const DynamicGameForm = ({ tipo, configuracion, onChange }) => {
  const [tableroGenerado, setTableroGenerado] = useState(null);
  const [mostrarTablero, setMostrarTablero] = useState(false);

  useEffect(() => {
    if (!tipo) return;
    if (!configuracion || configuracion.tipo !== tipo) {
      let initialConfig = { tipo };
      switch (tipo) {
        case 'sopa_de_letras':
          initialConfig = { ...initialConfig, tamano: 12, palabras: [{ palabra: '', pista: '' }] };
          break;
        case 'crucigrama':
          initialConfig = { ...initialConfig, palabras: [{ palabra: '', pista: '' }] };
          break;
        case 'adivinanza':
          initialConfig = { ...initialConfig, adivinanza: '', pista: '', opcionA: '', opcionB: '', opcionC: '', respuestaCorrecta: 'A' };
          break;
        case 'memoria':
          initialConfig = { ...initialConfig, pares: [{ elemento1: '', elemento2: '' }, { elemento1: '', elemento2: '' }] };
          break;
        case 'relacionar':
          initialConfig = { ...initialConfig, pares: [{ columnaA: '', columnaB: '' }, { columnaA: '', columnaB: '' }] };
          break;
        default: break;
      }
      onChange(initialConfig);
      setTableroGenerado(null);
      setMostrarTablero(false);
    }
  }, [tipo]);

  if (!tipo || !configuracion || configuracion.tipo !== tipo) return null;

  const updateConfig = (newValues) => onChange({ ...configuracion, ...newValues });

  const handleArrayChange = (arrayName, index, field, value) => {
    const newArray = [...configuracion[arrayName]];
    newArray[index] = { ...newArray[index], [field]: value };
    updateConfig({ [arrayName]: newArray });
  };

  const addArrayItem = (arrayName, emptyItem) =>
    updateConfig({ [arrayName]: [...configuracion[arrayName], emptyItem] });

  const removeArrayItem = (arrayName, index) => {
    if (configuracion[arrayName].length > 1) {
      updateConfig({ [arrayName]: configuracion[arrayName].filter((_, i) => i !== index) });
    }
  };

  const handleGenerarTablero = () => {
    if (tipo === 'sopa_de_letras') {
      const resultado = generarSopaDeLetras(configuracion.palabras, configuracion.tamano);
      setTableroGenerado(resultado);
      updateConfig({ tablero: resultado.grid, palabrasColocadas: resultado.palabrasColocadas });
    } else if (tipo === 'crucigrama') {
      const resultado = generarCrucigrama(configuracion.palabras);
      setTableroGenerado(resultado);
      updateConfig({ tablero: resultado.grid, pistas: resultado.colocadas });
    }
    setMostrarTablero(true);
  };

  /* ---- RENDER SOPA DE LETRAS ---- */
  const renderSopaLetras = () => (
    <div className="dynamic-form-section">
      <h4>🔍 Sopa de Letras</h4>
      <div className="form-group row">
        <label>Tamaño del tablero:</label>
        <input type="number" min="8" max="18" value={configuracion.tamano || 12}
          onChange={(e) => updateConfig({ tamano: parseInt(e.target.value) })} />
        <span className="hint-inline">({configuracion.tamano}×{configuracion.tamano})</span>
      </div>
      <div className="list-items">
        {configuracion.palabras?.map((item, index) => (
          <div key={index} className="list-item-row">
            <input type="text" placeholder="Palabra a ocultar" value={item.palabra}
              onChange={(e) => handleArrayChange('palabras', index, 'palabra', e.target.value)} />
            <input type="text" placeholder="Pista (opcional)" value={item.pista}
              onChange={(e) => handleArrayChange('palabras', index, 'pista', e.target.value)} />
            <button type="button" className="btn-remove" onClick={() => removeArrayItem('palabras', index)}>✖</button>
          </div>
        ))}
        <button type="button" className="btn-add" onClick={() => addArrayItem('palabras', { palabra: '', pista: '' })}>
          + Agregar Palabra
        </button>
      </div>
      <button type="button" className="btn-generar" onClick={handleGenerarTablero}>
        ⚡ Generar Tablero Automáticamente
      </button>
      {mostrarTablero && tableroGenerado && (
        <div className="tablero-preview">
          <p className="tablero-info">✅ Tablero generado ({tableroGenerado.palabrasColocadas.length}/{configuracion.palabras?.filter(p=>p.palabra).length} palabras colocadas)</p>
          <div className="sopa-grid" style={{ gridTemplateColumns: `repeat(${tableroGenerado.size}, 1fr)` }}>
            {tableroGenerado.grid.flat().map((letra, i) => (
              <div key={i} className={`sopa-celda ${tableroGenerado.palabrasColocadas.some(p => p) ? '' : ''}`}>{letra}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  /* ---- RENDER CRUCIGRAMA ---- */
  const renderCrucigrama = () => (
    <div className="dynamic-form-section">
      <h4>📝 Crucigrama</h4>
      <p className="hint-text">El sistema ubica y orienta cada palabra automáticamente, cruzándolas por letras comunes.</p>
      <div className="list-items">
        {configuracion.palabras?.map((item, index) => (
          <div key={index} className="list-item-row crucigrama-row">
            <span className="num-badge">#{index + 1}</span>
            <input type="text" placeholder="Palabra" value={item.palabra}
              onChange={(e) => handleArrayChange('palabras', index, 'palabra', e.target.value)} />
            <input type="text" placeholder="Pista descriptiva" value={item.pista}
              onChange={(e) => handleArrayChange('palabras', index, 'pista', e.target.value)} />
            <button type="button" className="btn-remove" onClick={() => removeArrayItem('palabras', index)}>✖</button>
          </div>
        ))}
        <button type="button" className="btn-add"
          onClick={() => addArrayItem('palabras', { palabra: '', pista: '' })}>
          + Agregar Palabra
        </button>
      </div>
      <button type="button" className="btn-generar" onClick={handleGenerarTablero}>
        ⚡ Generar Crucigrama Automáticamente
      </button>
      {mostrarTablero && tableroGenerado && (
        <div className="tablero-preview">
          <p className="tablero-info">✅ Crucigrama generado con {tableroGenerado.colocadas?.length} palabras</p>
          {tableroGenerado.noColocadas && tableroGenerado.noColocadas.length > 0 && (
            <p className="tablero-warning">⚠️ No se pudieron colocar: {tableroGenerado.noColocadas.join(', ')}</p>
          )}
          <div className="crucigrama-wrapper">
            {(() => {
              const { grid, size } = tableroGenerado;
              const minRow = grid.findIndex(r => r.some(c => c));
              const maxRow = size - 1 - [...grid].reverse().findIndex(r => r.some(c => c));
              const sub = grid.slice(minRow, maxRow + 1);
              return (
                <div className="crucigrama-grid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
                  {sub.map((row, ri) => row.map((cell, ci) => (
                    <div key={`${ri}-${ci}`} className={`cruz-celda ${cell ? 'activa' : 'vacia'}`}>
                      {cell?.numero && <span className="cruz-num">{cell.numero}</span>}
                      {cell?.letra}
                    </div>
                  )))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );

  /* ---- RENDER ADIVINANZA ---- */
  const renderAdivinanza = () => (
    <div className="dynamic-form-section">
      <h4>🤔 Adivinanza</h4>
      <div className="form-group vertical">
        <label>Adivinanza / Acertijo: *</label>
        <textarea rows="3" value={configuracion.adivinanza || ''}
          onChange={(e) => updateConfig({ adivinanza: e.target.value })}
          placeholder="Tengo dientes y no como, tengo cabeza y no pienzo... ¿Qué soy?" />
      </div>
      <div className="form-group vertical">
        <label>Pista: (opcional)</label>
        <input type="text" value={configuracion.pista || ''}
          onChange={(e) => updateConfig({ pista: e.target.value })}
          placeholder="Ej: Se usa todos los días..." />
      </div>
      <div className="opciones-adivinanza">
        <p className="opciones-titulo">Opciones de respuesta:</p>
        {['A', 'B', 'C'].map((letra) => (
          <div key={letra} className={`opcion-row ${configuracion.respuestaCorrecta === letra ? 'correcta' : ''}`}>
            <span className="opcion-letra">{letra}</span>
            <input type="text"
              value={configuracion[`opcion${letra}`] || ''}
              onChange={(e) => updateConfig({ [`opcion${letra}`]: e.target.value })}
              placeholder={`Opción ${letra}`} />
            <button
              type="button"
              className={`btn-marcar ${configuracion.respuestaCorrecta === letra ? 'marcada' : ''}`}
              onClick={() => updateConfig({ respuestaCorrecta: letra })}>
              {configuracion.respuestaCorrecta === letra ? '✅ Correcta' : 'Marcar correcta'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  /* ---- RENDER MEMORIA ---- */
  const renderMemoria = () => (
    <div className="dynamic-form-section">
      <h4>🃏 Memotest – Pares de Cartas</h4>
      <p className="hint-text">Crea pares de cartas. El juego las mezclará automáticamente.</p>
      <div className="list-items">
        {configuracion.pares?.map((item, index) => (
          <div key={index} className="list-item-row pares-row">
            <div className="par-card">
              <label>Carta A</label>
              <input type="text" placeholder="Ej: Gato" value={item.elemento1}
                onChange={(e) => handleArrayChange('pares', index, 'elemento1', e.target.value)} />
            </div>
            <div className="par-icon">↔️</div>
            <div className="par-card">
              <label>Carta B (pareja)</label>
              <input type="text" placeholder="Ej: Cat" value={item.elemento2}
                onChange={(e) => handleArrayChange('pares', index, 'elemento2', e.target.value)} />
            </div>
            <button type="button" className="btn-remove" onClick={() => removeArrayItem('pares', index)}>✖</button>
          </div>
        ))}
        <button type="button" className="btn-add" onClick={() => addArrayItem('pares', { elemento1: '', elemento2: '' })}>
          + Agregar Par
        </button>
      </div>
      {configuracion.pares?.filter(p => p.elemento1 && p.elemento2).length > 0 && (
        <div className="preview-tablero-memoria">
          <p className="tablero-info">Vista previa del juego ({configuracion.pares.filter(p=>p.elemento1&&p.elemento2).length} pares):</p>
          <div className="memoria-grid">
            {[...generarMemoria(configuracion.pares).flatMap(p => [
              { texto: p.elemento1, tipo: 'A' },
              { texto: p.elemento2, tipo: 'B' }
            ])].map((carta, i) => (
              <div key={i} className="memoria-carta">{carta.texto}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  /* ---- RENDER RELACIONAR ---- */
  const renderRelacionar = () => (
    <div className="dynamic-form-section">
      <h4>🧩 Asociación de Palabras</h4>
      <p className="hint-text">Crea los pares correctos. Las columnas se mostrarán mezcladas al estudiante.</p>
      <div className="relacionar-header-cols">
        <span>Columna A</span>
        <span>Columna B</span>
      </div>
      <div className="list-items">
        {configuracion.pares?.map((item, index) => (
          <div key={index} className="list-item-row">
            <span className="num-badge">{index + 1}</span>
            <input type="text" placeholder="Elemento A" value={item.columnaA}
              onChange={(e) => handleArrayChange('pares', index, 'columnaA', e.target.value)} />
            <span className="link-icon">🔗</span>
            <input type="text" placeholder="Elemento B" value={item.columnaB}
              onChange={(e) => handleArrayChange('pares', index, 'columnaB', e.target.value)} />
            <button type="button" className="btn-remove" onClick={() => removeArrayItem('pares', index)}>✖</button>
          </div>
        ))}
        <button type="button" className="btn-add" onClick={() => addArrayItem('pares', { columnaA: '', columnaB: '' })}>
          + Agregar Par
        </button>
      </div>
      {configuracion.pares?.filter(p => p.columnaA && p.columnaB).length > 0 && (
        <div className="relacionar-preview">
          <p className="tablero-info">Vista previa del juego:</p>
          <div className="relacionar-cols">
            <div className="relacionar-col">
              {generarRelacionar(configuracion.pares).map((p, i) => (
                <div key={i} className="relacionar-item col-a">{p.columnaA}</div>
              ))}
            </div>
            <div className="relacionar-col">
              {[...generarRelacionar(configuracion.pares)].sort(() => Math.random() - 0.5).map((p, i) => (
                <div key={i} className="relacionar-item col-b">{p.columnaB}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="dynamic-form-container fade-in">
      {tipo === 'sopa_de_letras' && renderSopaLetras()}
      {tipo === 'crucigrama' && renderCrucigrama()}
      {tipo === 'adivinanza' && renderAdivinanza()}
      {tipo === 'memoria' && renderMemoria()}
      {tipo === 'relacionar' && renderRelacionar()}
    </div>
  );
};

export default DynamicGameForm;
