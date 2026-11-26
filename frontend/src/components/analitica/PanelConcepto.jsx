import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import {
  MdClose,
  MdError,
  MdGroups,
  MdWarningAmber,
  MdQuiz,
  MdCheckCircle,
  MdExpandMore,
  MdExpandLess,
} from 'react-icons/md';
import './analitica-conceptos.css';

const TIPO_LABEL = {
  contenido: 'Contenido',
  juego: 'Juego',
  evaluacion: 'Evaluación',
};

const num = (v) => (v == null ? 0 : Number(v));

const LETRAS = ['a', 'b', 'c', 'd'];

/** Preguntas que se muestran antes de pedir "Mostrar todas". */
const LIMITE_PREGUNTAS = 10;

const textoDominante = (dom) => {
  if (!dom) return null;
  const t = dom.texto != null ? dom.texto : dom.letra;
  return t == null || t === '' ? '(opción vacía)' : String(t);
};

const PanelConcepto = ({ concepto, grupoId, semanas, onClose }) => {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [preguntas, setPreguntas] = useState(null);
  const [confusiones, setConfusiones] = useState(null);
  const [estudiantes, setEstudiantes] = useState(null);
  const [ordenEstudiantes, setOrdenEstudiantes] = useState('errores');
  const [mostrarTodas, setMostrarTodas] = useState(false);

  const esJuego = concepto?.tipo === 'juego';
  const esMemotest = esJuego && concepto?.tipo_juego === 'memoria';
  const esSopaLetras = esJuego && concepto?.tipo_juego === 'sopa_de_letras';

  const baseQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('tipo', concepto.tipo);
    p.set('semanas', String(semanas));
    if (grupoId) p.set('grupoId', String(grupoId));
    return p;
  }, [concepto.tipo, grupoId, semanas]);

  // Carga inicial: preguntas alimenta los puntos críticos; confusiones aporta la
  // posible confusión; estudiantes arma la tabla de respuestas por estudiante.
  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    setEstudiantes(null);
    const qs = baseQs.toString();

    // El memotest no tiene un mapa estudiantes x elemento coherente: cada
    // partida se resume en un número de intentos, no en respuestas por palabra.
    const peticiones = [
      api.get(`/analitica/conceptos/${concepto.actividad_id}/preguntas?${qs}`),
      api.get(`/analitica/conceptos/${concepto.actividad_id}/confusiones?${qs}`),
    ];
    if (!esMemotest) {
      peticiones.push(api.get(`/analitica/conceptos/${concepto.actividad_id}/estudiantes?${qs}`));
    }

    Promise.all(peticiones)
      .then(([pq, cf, es]) => {
        if (!vigente) return;
        setPreguntas(pq.data.data);
        setConfusiones(cf.data.data);
        setEstudiantes(es ? es.data.data : null);
      })
      .catch((err) => {
        if (!vigente) return;
        console.error('Error al cargar el diagnóstico del concepto:', err);
        setError(err.response?.data?.message || 'No se pudo cargar el diagnóstico.');
      })
      .finally(() => { if (vigente) setCargando(false); });

    return () => { vigente = false; };
  }, [concepto.actividad_id, baseQs, esMemotest]);

  useEffect(() => {
    const alTeclear = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [onClose]);

  const items = preguntas?.items ?? [];
  const minRespuestas = preguntas?.minimo_respuestas ?? 5;

  const ordenados = useMemo(
    () => [...items].filter((it) => num(it.errores) > 0).sort((a, b) => num(b.errores) - num(a.errores)),
    [items]
  );

  // Definición completa de la evaluación, numerada P1..Pn en el mismo orden que
  // las columnas de la tabla de estudiantes.
  const esEvaluacion = concepto?.tipo === 'evaluacion';
  const preguntasEval = useMemo(() => {
    if (!esEvaluacion) return [];
    return items
      .map((it, i) => ({ ...it, numero: it.numero != null ? it.numero : i + 1 }))
      .sort((a, b) => a.numero - b.numero);
  }, [items, esEvaluacion]);

  const visiblesEval = mostrarTodas ? preguntasEval : preguntasEval.slice(0, LIMITE_PREGUNTAS);

  const filasOrdenadas = useMemo(() => {
    const filas = estudiantes?.filas ?? [];
    if (ordenEstudiantes === 'alias') return [...filas].sort((a, b) => a.alias.localeCompare(b.alias));
    return filas;
  }, [estudiantes, ordenEstudiantes]);

  // Puntos críticos adaptados al tipo de juego. El memotest se mide por los
  // intentos que necesitó cada partida; en la sopa el error dominante siempre es
  // "No encontrada", así que duplica la tarjeta de la palabra más difícil.
  const criticos = useMemo(() => {
    const tarjetas = [];

    if (esMemotest) {
      const memoria = items[0];
      if (memoria?.promedio_intentos != null) {
        const partidas = num(memoria.partidas_con_dato);
        tarjetas.push({
          clave: 'promedio_memoria',
          tono: 'info',
          etiqueta: 'Intentos promedio',
          texto: `${memoria.promedio_intentos} intentos por partida`,
          dato: partidas
            ? `promedio de ${partidas} partidas con detalle`
            : 'sin partidas con detalle',
        });
      }
      return tarjetas;
    }

    const top = ordenados[0];
    // Con un filtro de grupo activo puede haber menos de `minRespuestas` fallos.
    // En vez de dejar el panel vacío, mostramos el elemento más fallado con
    // etiqueta de "pocos datos": es información real, no una estimación.
    if (top) {
      const pocosDatos = num(top.errores) < minRespuestas;
      const etiquetaBase = esSopaLetras
        ? 'Palabra más difícil de encontrar'
        : 'Lo más fallado';
      tarjetas.push({
        clave: 'top',
        tono: pocosDatos ? 'pocos' : 'error',
        etiqueta: pocosDatos ? `${etiquetaBase} · pocos datos` : etiquetaBase,
        texto: top.etiqueta || top.enunciado || `Elemento ${top.clave}`,
        dato: `${num(top.errores)} fallos de ${num(top.total)} respuestas (${top.pct_error}%)`,
      });
    }
    if (!esSopaLetras) {
      const dom = top ? textoDominante(top.error_dominante) : null;
      if (dom) {
        tarjetas.push({
          clave: 'dominante',
          tono: 'error',
          etiqueta: 'Error más elegido',
          texto: dom,
          dato: `elegido ${num(top.error_dominante.cantidad)} veces en esa pregunta`,
        });
      }
    }
    const celdas = confusiones && confusiones.soportado ? (confusiones.celdas || []) : [];
    const confusion = [...celdas]
      .filter((c) => c.esperado !== c.elegido)
      .sort((a, b) => num(b.cantidad) - num(a.cantidad))[0];
    if (confusion) {
      tarjetas.push({
        clave: 'confusion',
        tono: 'confusion',
        etiqueta: 'Posible confusión',
        texto: `Eligieron “${confusion.elegido}” en vez de “${confusion.esperado}”`,
        dato: `${num(confusion.cantidad)} veces`,
      });
    }
    return tarjetas.slice(0, 3);
  }, [items, ordenados, confusiones, minRespuestas, esMemotest, esSopaLetras]);

  const pctError = concepto?.pct_error != null ? concepto.pct_error : null;
  const mensajeSinCriticos = esMemotest
    ? 'Sin partidas con intentos registrados en el período.'
    : 'Sin errores suficientes para señalar puntos críticos en el período.';

  return (
    <div className="acp-overlay" onClick={onClose} role="presentation">
      <aside
        className="acp-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Diagnóstico: ${concepto?.nombre || concepto?.concepto || 'concepto'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="acp-cabecera">
          <div className="acp-cabecera-fila">
            <div>
              <span className="acx-fila-tipo">{TIPO_LABEL[concepto?.tipo] || concepto?.tipo}</span>
              <h2 className="acp-titulo">{concepto?.nombre || concepto?.concepto}</h2>
            </div>
            <button type="button" className="acp-cerrar" onClick={onClose} aria-label="Cerrar diagnóstico">
              <MdClose />
            </button>
          </div>

          <div className="acp-medidor" role="img" aria-label={`${pctError ?? 0}% de intentos fallidos`}>
            <div className="acp-barra">
              <span className="acp-barra-viva" style={{ width: `${pctError ?? 0}%` }} />
            </div>
          </div>
          <p className="acp-metricas">
            {pctError != null && <span><strong>{pctError}%</strong> de intentos fallidos</span>}
            {concepto?.cobertura && (
              <span>
                <strong>{concepto.cobertura.con_detalle}</strong> de {concepto.cobertura.intentos} intentos con detalle
              </span>
            )}
          </p>
        </header>

        <div className="acp-cuerpo">
          {cargando && (
            <div className="acp-estado" role="status" aria-live="polite">
              Cargando el diagnóstico del concepto...
            </div>
          )}

          {!cargando && error && (
            <div className="acp-estado"><MdError /> {error}</div>
          )}

          {!cargando && !error && (
            <>
              {preguntas?.sin_detalle && (
                <div className="acp-aviso">
                  <MdWarningAmber aria-hidden="true" />
                  <span>
                    Estos intentos no tienen detalle guardado (son anteriores a la captura
                    o no registraron cada respuesta). No se muestran cifras inventadas.
                  </span>
                </div>
              )}

              {/* Puntos críticos */}
              <section>
                <h3 className="acp-titulo-bloque"><MdWarningAmber aria-hidden="true" /> Puntos críticos</h3>
                {criticos.length === 0 ? (
                  <div className="acp-vacio">{mensajeSinCriticos}</div>
                ) : (
                  <div className="acp-criticos">
                    {criticos.map((c) => (
                      <div key={c.clave} className="acp-critico" data-tono={c.tono}>
                        <span className="acp-critico-etiqueta">{c.etiqueta}</span>
                        <span className="acp-critico-texto">{c.texto}</span>
                        <span className="acp-critico-dato">{c.dato}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* El memotest no tiene un mapa estudiantes x elemento coherente:
                  su único dato útil es el promedio de intentos por partida. */}
              {!esMemotest && (
              <section>
                <h3 className="acp-titulo-bloque"><MdGroups aria-hidden="true" /> Estudiantes afectados</h3>
                {!estudiantes ? (
                  <div className="acp-vacio">Cargando estudiantes...</div>
                ) : (estudiantes.filas || []).length === 0 ? (
                  <div className="acp-vacio">Sin respuestas de estudiantes en el período.</div>
                ) : (
                  <>
                    <div className="acp-heat-controles">
                      <span className="acp-ayuda">Un estudiante por fila, un elemento por columna.</span>
                      <div className="acp-segmentos" role="group" aria-label="Ordenar estudiantes">
                        <button
                          type="button"
                          className={ordenEstudiantes === 'errores' ? 'dash-segmento-activo' : ''}
                          onClick={() => setOrdenEstudiantes('errores')}
                        >
                          Más errores
                        </button>
                        <button
                          type="button"
                          className={ordenEstudiantes === 'alias' ? 'dash-segmento-activo' : ''}
                          onClick={() => setOrdenEstudiantes('alias')}
                        >
                          Alfabético
                        </button>
                      </div>
                    </div>
                    <div className="acp-heat-envoltura">
                      <table className="acp-heat">
                        <thead>
                          <tr>
                            <th scope="col" className="acp-heat-esquina">Estudiante</th>
                            {estudiantes.elementos.map((el) => (
                              <th scope="col" key={el.clave} title={el.etiqueta}>
                                {el.numero != null && <span className="acp-heat-num">P{el.numero}</span>}
                                {el.etiqueta}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filasOrdenadas.map((fila) => (
                            <tr key={fila.alias}>
                              <th scope="row" title={`${fila.alias} · ${fila.errores} errores`}>{fila.alias}</th>
                              {estudiantes.elementos.map((el) => {
                                const estado = fila.estados ? fila.estados[el.clave] : null;
                                return (
                                  <td key={el.clave} data-estado={estado || undefined}>
                                    {estado === 'acierto' ? '✓' : estado === 'error' ? '✗' : estado === 'sin_responder' ? '·' : ''}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="acp-leyenda-inline">
                      <span><i className="acp-chip" data-estado="correcta" /> acierto ✓</span>
                      <span><i className="acp-chip" data-estado="dominante" /> error ✗</span>
                      <span><i className="acp-chip" data-estado="sin_responder" /> sin responder ·</span>
                    </div>
                    {estudiantes.truncado && (
                      <p className="acp-ayuda">
                        {esEvaluacion
                          ? 'Se muestra un recorte de estudiantes y preguntas para mantener la tabla legible.'
                          : 'Mostrando los estudiantes y elementos con más errores (la tabla se recorta para mantenerla legible).'}
                      </p>
                    )}
                  </>
                )}
              </section>
              )}

              {/* Preguntas de la evaluación (solo para evaluaciones) */}
              {esEvaluacion && (
                <section>
                  <h3 className="acp-titulo-bloque">
                    <MdQuiz aria-hidden="true" /> Preguntas de la evaluación
                  </h3>
                  <p className="acp-ayuda">
                    {concepto?.nombre || concepto?.concepto}: la numeración (P1, P2…) coincide con las
                    columnas de la tabla de estudiantes.
                  </p>

                  {preguntasEval.length === 0 ? (
                    <div className="acp-vacio">Esta evaluación todavía no tiene preguntas registradas.</div>
                  ) : (
                    <>
                      <ol className="acp-preguntas">
                        {visiblesEval.map((q) => {
                          const fallos = num(q.errores);
                          const conFallos = fallos > 0;
                          const domLetra = q.error_dominante?.letra ?? null;
                          return (
                            <li
                              key={q.clave}
                              className="acp-pregunta"
                              data-con-fallos={conFallos ? 'true' : undefined}
                            >
                              <div className="acp-pregunta-cab">
                                <span className="acp-pregunta-num">P{q.numero}</span>
                                {conFallos ? (
                                  <>
                                    <span className="acp-pregunta-chip" data-tono="error">
                                      {fallos} fallo{fallos === 1 ? '' : 's'}
                                    </span>
                                    <span className="acp-pregunta-chip" data-tono="suave">
                                      {num(q.pct_error)}% de fallos
                                    </span>
                                  </>
                                ) : num(q.total) > 0 ? (
                                  <span className="acp-pregunta-chip" data-tono="ok">Sin fallos</span>
                                ) : (
                                  <span className="acp-pregunta-chip" data-tono="suave">Sin respuestas</span>
                                )}
                              </div>

                              <p className="acp-pregunta-enun">{q.enunciado}</p>
                              {q.imagen && (
                                <img className="acp-pregunta-img" src={q.imagen} alt="" loading="lazy" />
                              )}

                              <ul className="acp-opciones">
                                {LETRAS.map((letra) => {
                                  const op = q.opciones?.[letra];
                                  if (!op) return null;
                                  const esCorrecta = letra === q.correcta;
                                  const esErrorDominante = !esCorrecta && letra === domLetra;
                                  return (
                                    <li
                                      key={letra}
                                      className="acp-opcion"
                                      data-correcta={esCorrecta ? 'true' : undefined}
                                      data-error-dominante={esErrorDominante ? 'true' : undefined}
                                    >
                                      <span className="acp-opcion-letra">{letra.toUpperCase()}</span>
                                      <span className="acp-opcion-texto">{op.texto}</span>
                                      {esCorrecta && (
                                        <span className="acp-opcion-marca" data-tono="ok">
                                          <MdCheckCircle aria-hidden="true" /> Correcta
                                        </span>
                                      )}
                                      {esErrorDominante && (
                                        <span className="acp-opcion-marca" data-tono="error">
                                          <MdError aria-hidden="true" /> Error más elegido
                                        </span>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>

                              <p className="acp-pregunta-pie">
                                {num(q.total) > 0
                                  ? `${fallos} fallos de ${num(q.total)} respuestas`
                                  : 'Todavía nadie la respondió en el período.'}
                              </p>
                            </li>
                          );
                        })}
                      </ol>

                      {preguntasEval.length > LIMITE_PREGUNTAS && (
                        <button
                          type="button"
                          className="acp-preguntas-toggle"
                          onClick={() => setMostrarTodas((v) => !v)}
                          aria-expanded={mostrarTodas}
                        >
                          {mostrarTodas ? (
                            <><MdExpandLess aria-hidden="true" /> Mostrar menos</>
                          ) : (
                            <><MdExpandMore aria-hidden="true" /> Mostrar todas ({preguntasEval.length})</>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
};

export default PanelConcepto;
