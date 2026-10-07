import React, { useEffect, useState } from 'react';
import { MdMailOutline, MdClose, MdError } from 'react-icons/md';
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import Swal from 'sweetalert2';
import api from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { COLOR_NIVEL } from './ProgresoIndividualListado';
import './ProgresoIndividual.css';

/**
 * Ficha de un estudiante dentro del Progreso Individual.
 *
 * Vive al lado del listado, no en otra página: el docente compara a un
 * estudiante con el resto de la tabla sin perder el filtro que tenía puesto.
 *
 * Solo se incluye lo que es de un estudiante. El ranking del grupo y la
 * distribución de niveles son de la Vista de Grupo: repetidos aquí serían la
 * misma información dos veces en el mismo panel.
 */

const SIN_NIVEL = '#64748b';

const ProgressThemeRow = ({ modulo, pctInicial, pctActual }) => {
  const delta = Math.round(pctActual - pctInicial);
  return (
    <div className="progreso-tema-row">
      <span className="progreso-tema-nombre">{modulo}</span>
      <div className="progreso-tema-barras">
        <div className="progreso-tema-barra">
          <div
            className="progreso-tema-barra-fill diagnostico"
            style={{ width: `${Math.max(2, pctInicial)}%` }}
          />
        </div>
        <div className="progreso-tema-barra">
          <div
            className="progreso-tema-barra-fill actual"
            style={{ width: `${Math.max(2, pctActual)}%` }}
          />
        </div>
      </div>
      <div className="progreso-tema-valores">
        <span className="pct pct-inicial">{pctInicial}%</span>
        <span className="pct pct-actual">{pctActual}%</span>
      </div>
      <span className={`progreso-tema-delta ${delta >= 0 ? 'positivo' : 'negativo'}`}>
        {delta >= 0 ? '+' : ''}{delta} pp
      </span>
    </div>
  );
};

const ProgresoIndividualDetalle = ({ estudianteId, grupoId = null, onCerrar }) => {
  const { dark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState(null);

  const paleta = dark ? {
    grid: '#2b3048', tick: '#94a3b8', lineaVerde: '#34d399', eje: '#3b4160',
    tooltipFondo: '#20243a', tooltipBorde: '#2b3048', tooltipTexto: '#f1f5f9',
  } : {
    grid: '#e2e8f0', tick: '#64748b', lineaVerde: '#10b981', eje: '#cbd5e1',
    tooltipFondo: '#ffffff', tooltipBorde: '#e2e8f0', tooltipTexto: '#0f172a',
  };

  const contenidoTooltip = {
    background: paleta.tooltipFondo,
    border: `1px solid ${paleta.tooltipBorde}`,
    color: paleta.tooltipTexto,
    borderRadius: 8,
  };

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      setLoading(true);
      setError(null);
      try {
        // El grupo viaja con la petición porque decide contra qué universo se
        // calcula el promedio del radar y la línea de referencia del XP.
        const params = new URLSearchParams();
        if (grupoId) params.set('grupoId', String(grupoId));
        const query = params.toString();
        const { data } = await api.get(
          `/teacher/students/${estudianteId}/detail${query ? `?${query}` : ''}`
        );
        if (!cancelado) setDetalle(data.data);
      } catch (err) {
        console.error('Error al cargar detalle:', err);
        if (cancelado) return;
        setDetalle(null);
        setError(
          err.response?.status === 404
            ? 'Este estudiante ya no está registrado en los grupos seleccionados.'
            : 'No se pudo cargar el detalle del estudiante.'
        );
      } finally {
        if (!cancelado) setLoading(false);
      }
    };
    if (estudianteId) cargar();
    return () => { cancelado = true; };
  }, [estudianteId, grupoId]);

  const enviarReporte = async () => {
    const r = await Swal.fire({
      title: '¿Enviar reporte de progreso?',
      text: 'Se enviará el reporte de progreso al correo del estudiante.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonText: 'Cancelar',
      confirmButtonText: 'Enviar',
    });
    if (!r.isConfirmed) return;
    try {
      await api.post(`/teacher/students/${estudianteId}/send-report`);
      Swal.fire('¡Enviado!', 'El reporte fue enviado correctamente.', 'success');
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || 'No se pudo enviar el reporte.', 'error');
    }
  };

  if (loading) return <div className="progreso-loading">Cargando detalle...</div>;
  if (error) {
    return (
      <div className="progreso-error-card">
        <MdError className="error-icon" />
        <h3>{error}</h3>
        <button type="button" className="progreso-volver" onClick={onCerrar}>
          <MdClose /> Cerrar detalle
        </button>
      </div>
    );
  }
  if (!detalle) return null;

  const {
    alias, nota, nivel, posicion, xp,
    badges = [], badgesPending = 0,
    radar = [], evolution = [], progreso_por_tema = [], sesiones = [],
    diagnostico,
    primer_intento_pct: primerIntentoPct,
    tiempo_activo_seg: tiempoActivoSeg,
    sesiones_total: sesionesTotal,
  } = detalle;

  const inicial = alias ? alias.charAt(0).toUpperCase() : '?';
  const nivelColor = (nivel && COLOR_NIVEL[nivel]) || SIN_NIVEL;
  const notaTexto = nota != null ? Number(nota).toFixed(1) : 'Sin datos';

  // ---------- Radar ----------
  const radarData = radar.map((r) => ({
    modulo: r.modulo,
    estudiante: Number(r.estudiante) || 0,
    promedio: Number(r.promedio_grupo) || 0,
  }));

  // Un radar sólo tiene sentido con 3+ ejes
  const mostrarRadar = radarData.length >= 3;

  // ---------- Evolución ----------
  const evolutionData = evolution.map((e) => ({
    mes: e.mes,
    puntaje: Number(e.puntaje) || 0,
    promedio: e.promedio_grupo == null ? null : Number(e.promedio_grupo),
  }));

  // La línea del grupo sólo se dibuja si hay al menos un mes con referencia:
  // una línea plana en cero parece un dato y no lo es.
  const hayPromedioGrupo = evolutionData.some((e) => e.promedio != null);

  // ---------- Sesiones ----------
  const sesCount = sesionesTotal ?? sesiones.length;
  const tiempoSeg = tiempoActivoSeg ?? sesiones.reduce((a, s) => a + (s.duracion || 0), 0);
  const tiempoHoras = (tiempoSeg / 3600).toFixed(1);
  const primerIntento = primerIntentoPct != null ? Math.round(primerIntentoPct) : '—';

  // ---------- Progreso por tema ----------
  const temas = progreso_por_tema.map((t) => ({
    modulo: t.modulo,
    pct_inicial: Number(t.pct_inicial) || 0,
    pct_actual: Number(t.pct_actual) || 0,
  }));

  return (
    <div className="progreso-individual-detalle">
      {/* ---------- ENCABEZADO ---------- */}
      <div className="hero-estudiante">
        <div className="hero-estudiante-left">
          <div className="hero-estudiante-avatar" aria-hidden="true">{inicial}</div>
          <div className="hero-estudiante-info">
            <h2 className="hero-estudiante-nombre">{alias}</h2>
            <div className="hero-estudiante-meta">
              <span className="hero-badge" style={{ background: nivelColor }}>
                Nivel: {nivel || 'Sin datos'}
              </span>
              <span className="hero-posicion">Posición: #{posicion}</span>
            </div>
          </div>
        </div>

        <div className="hero-estudiante-stats">
          <div className="hero-stat">
            <span className="hero-stat-valor">{notaTexto}</span>
            <span className="hero-stat-label">
              {nota != null ? 'Calificación (1.0–5.0)' : 'Calificación'}
            </span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-valor">{xp ?? 0}</span>
            <span className="hero-stat-label">XP acumulados</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-valor">
              {primerIntento}{primerIntento !== '—' ? '%' : ''}
            </span>
            <span className="hero-stat-label">Primer intento</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-valor">{tiempoHoras} h</span>
            <span className="hero-stat-label">Tiempo activo</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-valor">{sesCount}</span>
            <span className="hero-stat-label">Sesiones</span>
          </div>
        </div>
      </div>

      {/* ---------- INSIGNIAS ---------- */}
      <div className="insignias-pills-section">
        <span className="insignias-pills-title">INSIGNIAS OBTENIDAS</span>
        <div className="insignias-pills">
          {badges.length === 0 && (
            <span className="insignia-pill insignia-pill-vacia">
              Sin insignias registradas
            </span>
          )}
          {badges.map((b) => (
            <span key={b.id} className="insignia-pill" title={b.categoria || undefined}>
              <span className="insignia-pill-dot" />
              {b.nombre}
            </span>
          ))}
          {badgesPending > 0 && (
            <span className="insignia-pill insignia-pill-pendiente">
              + {badgesPending} pendientes
            </span>
          )}
        </div>
      </div>

      {/* ---------- GRÁFICAS ---------- */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3 className="chart-card-title">Radar de fortalezas y debilidades por tema</h3>
          <p className="chart-card-sub">Porcentaje de avance del estudiante frente al promedio del grupo (%)</p>

          {radarData.length === 0 ? (
            <div className="grafico-vacio">Sin datos de temas para comparar.</div>
          ) : mostrarRadar ? (
            <>
              <ResponsiveContainer width="100%" height={320}>
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid gridType="polygon" stroke={paleta.grid} />
                  <PolarAngleAxis
                    dataKey="modulo"
                    tick={{ fill: paleta.tick, fontSize: 11 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tickCount={5}
                    tick={{ fill: paleta.tick, fontSize: 10 }}
                    stroke={paleta.grid}
                    axisLine={false}
                    label={{ value: '% avance', fill: paleta.tick, fontSize: 10, position: 'insideStart' }}
                  />
                  <Radar
                    name="Estudiante"
                    dataKey="estudiante"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="#93c5fd"
                    fillOpacity={0.5}
                  />
                  <Radar
                    name="Promedio del grupo"
                    dataKey="promedio"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    fill="transparent"
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={contenidoTooltip}
                    formatter={(v) => [`${v}%`, '']}
                  />
                </RadarChart>
              </ResponsiveContainer>
              <div className="leyenda-item-extra">
                Ejes: tema. Radio: porcentaje de avance (0–100 %).
              </div>
            </>
          ) : (
            /* ---------- Fallback: menos de 3 temas ---------- */
            <div className="radar-fallback">
              <p className="radar-fallback-msg">
                El radar necesita al menos 3 temas para formarse. Actualmente hay{' '}
                {radarData.length} tema{radarData.length === 1 ? '' : 's'} con datos.
                Se muestran como barras comparativas.
              </p>

              <div className="radar-fallback-barras">
                {radarData.map((r) => (
                  <div key={r.modulo} className="radar-fallback-row">
                    <span className="rf-nombre">{r.modulo}</span>
                    <div className="rf-barra">
                      <div
                        className="rf-fill-estudiante"
                        style={{ width: `${Math.max(2, r.estudiante)}%` }}
                      />
                      <div
                        className="rf-fill-promedio"
                        style={{ width: `${Math.max(2, r.promedio)}%` }}
                      />
                    </div>
                    <span className="rf-valor">
                      <span className="rf-valor-est">{r.estudiante}%</span>
                      <span className="rf-valor-prom">{r.promedio}%</span>
                    </span>
                  </div>
                ))}
              </div>

              <div className="radar-fallback-leyenda">
                <span className="leyenda-item">
                  <span className="leyenda-swatch rf-swatch-est" /> Estudiante
                </span>
                <span className="leyenda-item">
                  <span className="leyenda-swatch rf-swatch-prom" /> Promedio del grupo
                </span>
                <span className="leyenda-unidad">Barras: % de avance (0–100 %)</span>
              </div>
            </div>
          )}
        </div>

        <div className="chart-card">
          <h3 className="chart-card-title">Evolución del XP por mes</h3>
          <p className="chart-card-sub">
            Puntos de XP ganados cada mes frente al promedio del grupo (puntos)
          </p>
          {evolutionData.length === 0 ? (
            <div className="grafico-vacio">Sin datos de evolución.</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={evolutionData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke={paleta.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="mes"
                    stroke={paleta.tick}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    label={{ value: 'Mes (AAAA-MM)', position: 'insideBottom', offset: -4, fill: paleta.tick, fontSize: 11 }}
                  />
                  <YAxis
                    stroke={paleta.tick}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: paleta.eje }}
                    label={{ value: 'XP (puntos)', angle: -90, position: 'insideLeft', fill: paleta.tick, fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={contenidoTooltip}
                    formatter={(v, name) => [
                      v == null ? 'Sin referencia' : `${v} puntos`,
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="puntaje"
                    name="Estudiante"
                    stroke={paleta.lineaVerde}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: paleta.lineaVerde, strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                  {hayPromedioGrupo && (
                    <Line
                      type="monotone"
                      dataKey="promedio"
                      name="Promedio del grupo"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      connectNulls
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
              {!hayPromedioGrupo && (
                <p className="leyenda-nota">
                  Sin datos de otros estudiantes en esos meses, por eso no se dibuja
                  la línea del promedio del grupo.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ---------- PROGRESO POR TEMA ---------- */}
      <div className="chart-card chart-card-full">
        <h3 className="chart-card-title">Progreso por tema: diagnóstico vs. actual</h3>
        <p className="chart-card-sub">
          Porcentaje de avance en el diagnóstico inicial y en la actividad reciente (%)
        </p>
        {temas.length === 0 ? (
          <div className="grafico-vacio">Sin datos de progreso por tema.</div>
        ) : (
          <>
            <div className="progreso-tema-lista">
              {temas.map((t) => (
                <ProgressThemeRow
                  key={t.modulo}
                  modulo={t.modulo}
                  pctInicial={t.pct_inicial}
                  pctActual={t.pct_actual}
                />
              ))}
            </div>
            <div className="progreso-tema-leyenda">
              <span className="leyenda-item">
                <span className="leyenda-swatch swatch-inicial" /> Diagnóstico inicial
              </span>
              <span className="leyenda-item">
                <span className="leyenda-swatch swatch-actual" /> Nivel actual
              </span>
              <span className="leyenda-unidad">
                Barras: % de avance. pp = puntos porcentuales.
              </span>
            </div>
          </>
        )}
      </div>

      {/* ---------- DIAGNÓSTICO IAD ---------- */}
      {diagnostico && (
        <div className="chart-card chart-card-full">
          <h3 className="chart-card-title">Diagnóstico IAD-Primaria</h3>
          <div className="diagnostico-info">
            <p><strong>Nivel:</strong> {diagnostico.nivel}</p>
            <p><strong>Puntaje total:</strong> {diagnostico.puntaje_total}</p>
          </div>
        </div>
      )}

      {/* ---------- ACCIONES ---------- */}
      <div className="detalle-actions">
        <button type="button" className="progreso-volver" onClick={onCerrar}>
          <MdClose /> Cerrar detalle
        </button>
        <button type="button" className="btn-enviar-reporte" onClick={enviarReporte}>
          <MdMailOutline /> Enviar reporte por correo
        </button>
      </div>
    </div>
  );
};

export default ProgresoIndividualDetalle;
