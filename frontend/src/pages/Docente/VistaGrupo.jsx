import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
  MdGroups, MdError, MdBarChart, MdTrendingUp, MdCompareArrows,
  MdSearch, MdTouchApp, MdOpenInNew, MdEmojiEvents, MdClose,
} from 'react-icons/md';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, LabelList, ComposedChart, Line, Cell,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import './DashboardDocenteAnalitica.css';
import './VistaGrupo.css';

const PALETA = {
  light: {
    grid: '#e2e8f0', eje: '#cbd5e1', tick: '#64748b',
    barra: '#7c3aed', linea: '#0284c7',
    tooltipFondo: '#ffffff', tooltipBorde: '#e2e8f0', tooltipTexto: '#0f172a',
    vacio: '#e2e8f0',
    nivel: { Bajo: '#ef4444', Básico: '#f59e0b', Alto: '#3b82f6', Superior: '#10b981' },
  },
  dark: {
    grid: '#2b3048', eje: '#3b4160', tick: '#94a3b8',
    barra: '#8b5cf6', linea: '#38bdf8',
    tooltipFondo: '#20243a', tooltipBorde: '#2b3048', tooltipTexto: '#f1f5f9',
    vacio: '#2b3048',
    nivel: { Bajo: '#f87171', Básico: '#fbbf24', Alto: '#60a5fa', Superior: '#34d399' },
  },
};

const plural = (n, singular, pluralForma) => `${n} ${n === 1 ? singular : pluralForma}`;
const pctTexto = (v) => (v == null ? '—' : `${v}%`);

const Panel = ({ titulo, icono, sub, extra, children }) => (
  <section className="dash-panel">
    <div className="dash-panel-cabecera">
      <div>
        <h3>{icono} {titulo}</h3>
        {sub && <p className="dash-panel-sub">{sub}</p>}
      </div>
      {extra}
    </div>
    {children}
  </section>
);

const Vacio = ({ children }) => <div className="dash-vacio">{children}</div>;

const TooltipTema = ({ active, payload, label, formatter, unidad = '' }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="dash-tooltip">
      {label != null && <p className="dash-tooltip-titulo">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey ?? p.name} className="dash-tooltip-fila">
          <span className="dash-tooltip-punto" style={{ background: p.color || p.payload?.fill }} aria-hidden="true" />
          <span className="dash-tooltip-nombre">{p.name}</span>
          <span className="dash-tooltip-valor">
            {formatter ? formatter(p.value, p) : p.value}{unidad}
          </span>
        </p>
      ))}
    </div>
  );
};

const VistaGrupo = ({ grupoId, semanas }) => {
  const navigate = useNavigate();
  const { dark } = useTheme();
  const paleta = dark ? PALETA.dark : PALETA.light;

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [distribucion, setDistribucion] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [participacion, setParticipacion] = useState(null);
  const [comparacion, setComparacion] = useState(null);
  const [intento, setIntento] = useState(0);
  const [orden, setOrden] = useState('pct');
  const [busqueda, setBusqueda] = useState('');
  const [nivelActivo, setNivelActivo] = useState(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('semanas', String(semanas));
    if (grupoId) p.set('grupoId', String(grupoId));
    return p;
  }, [grupoId, semanas]);

  const qsRanking = useMemo(() => {
    const p = new URLSearchParams(qs);
    p.set('orden', orden);
    return p;
  }, [qs, orden]);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');

    const pedidos = [
      api.get(`/dashboard/distribucion-niveles?${qs.toString()}`),
      api.get(`/dashboard/ranking-completo?${qsRanking.toString()}`),
      api.get(`/dashboard/participacion-semanal?${qs.toString()}`),
    ];
    if (!grupoId) pedidos.push(api.get(`/dashboard/comparacion-grupos?${qs.toString()}`));

    Promise.all(pedidos)
      .then((respuestas) => {
        if (!vigente) return;
        setDistribucion(respuestas[0].data.data);
        setRanking(respuestas[1].data.data);
        setParticipacion(respuestas[2].data.data);
        setComparacion(respuestas[3]?.data.data ?? null);
      })
      .catch((err) => {
        if (!vigente) return;
        console.error('Error al cargar la vista de grupo:', err);
        setError(err.response?.data?.message || 'No se pudo cargar la vista de grupo.');
      })
      .finally(() => { if (vigente) setCargando(false); });

    return () => { vigente = false; };
  }, [qs, qsRanking, grupoId, intento]);

  const irA = (ruta, extra = {}) => {
    const p = new URLSearchParams(qs);
    Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)));
    navigate(`${ruta}?${p.toString()}`);
  };

  /* ---------------- datos derivados ---------------- */

  const niveles = distribucion?.niveles ?? [];
  const conDato = distribucion?.con_datos ?? 0;
  const sinDato = distribucion?.sin_datos ?? 0;
  const alcance = distribucion?.alcance?.estudiantes ?? 0;

  const filasRanking = useMemo(() => {
    const todas = ranking?.filas ?? [];
    const porNivel = nivelActivo
      ? todas.filter((f) => (f.nivel || null) === nivelActivo)
      : todas;
    const q = busqueda.trim().toLowerCase();
    if (!q) return porNivel;
    return porNivel.filter((f) => f.alias.toLowerCase().includes(q));
  }, [ranking, busqueda, nivelActivo]);

  const contadosDelNivel = useMemo(() => {
    if (!nivelActivo) return 0;
    return (ranking?.filas ?? []).filter((f) => (f.nivel || null) === nivelActivo).length;
  }, [ranking, nivelActivo]);

  const serie = participacion?.serie ?? [];
  const gruposComparacion = comparacion?.grupos ?? [];
  const mostrarComparacion = !grupoId && gruposComparacion.length > 1;

  const techoBrecha = useMemo(() => {
    const max = Math.max(0, ...serie.map((p) => p.brecha ?? 0));
    return max <= 5 ? 5 : Math.ceil(max / 5) * 5;
  }, [serie]);

  /* ---------------- carga / error / vacío ---------------- */

  if (cargando) {
    return (
      <div className="vista-grupo-page">
        <div className="dash-analitica">
          <div className="dash-cargando" role="status" aria-live="polite">
            <span className="dash-cargando-punto" aria-hidden="true" />
            Cargando la vista de grupo...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="vista-grupo-page">
        <div className="dash-analitica">
          <div className="dash-panel dash-panel-error">
            <h3><MdError /> No se pudo cargar la vista de grupo</h3>
            <p className="dash-panel-sub">{error}</p>
            <button
              type="button"
              className="dash-enlace-boton"
              onClick={() => setIntento((n) => n + 1)}
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!distribucion || distribucion.alcance.estudiantes === 0) {
    return (
      <div className="vista-grupo-page">
        <div className="dash-analitica">
          <Vacio>
            Este grupo todavía no tiene estudiantes. Asigna cuentas al grupo y vuelve
            a entrar para ver su reparto por nivel.
          </Vacio>
        </div>
      </div>
    );
  }

  return (
    <div className="vista-grupo-page">
      <div className="dash-analitica">
        <div className="dash-analitica-header">
          <h2><MdGroups /> Vista de Grupo</h2>
          <p className="dash-analitica-nota">
            {grupoId
              ? 'Alcance: el grupo seleccionado en el filtro.'
              : `Alcance: ${plural(alcance, 'estudiante del docente', 'estudiantes del docente')}.`}
          </p>
        </div>

        {/* ---------- Distribución por nivel ---------- */}
        <Panel
          titulo="Distribución por nivel"
          icono={<MdBarChart />}
          sub="Cuántos estudiantes hay en cada nivel de desempeño, con su porcentaje sobre los que ya tienen nota. Haz clic en un nivel para filtrar el ranking."
          extra={(
            <p className="dash-panel-meta">
              {conDato > 0
                ? `${conDato} con nota${sinDato > 0 ? ` · ${sinDato} sin nota` : ''}`
                : 'Nadie con nota todavía'}
            </p>
          )}
        >
          {conDato > 0 ? (
            <>
              <div className="dash-grafico">
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart
                    data={niveles}
                    layout="vertical"
                    margin={{ top: 4, right: 70, left: 4, bottom: 4 }}
                    barCategoryGap="22%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, (maximo) => (maximo || 1) * 1.15]}
                      hide
                    />
                    <YAxis
                      type="category"
                      dataKey="nivel"
                      width={78}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: paleta.tick, fontSize: 12 }}
                    />
                    <Tooltip
                      cursor={{ fill: paleta.grid, fillOpacity: 0.25 }}
                      content={
                        <TooltipTema
                          formatter={(valor, p) => {
                            const fila = p?.payload;
                            return `${valor} · ${pctTexto(fila?.pct)}`;
                          }}
                        />
                      }
                    />
                    <Bar
                      dataKey="estudiantes"
                      name="Estudiantes"
                      radius={[0, 6, 6, 0]}
                      cursor="pointer"
                      onClick={(data) => {
                        const nivel = data?.payload?.nivel ?? data?.nivel;
                        if (nivel) setNivelActivo((prev) => (prev === nivel ? null : nivel));
                      }}
                    >
                      {niveles.map((n) => (
                        <Cell
                          key={n.clave}
                          fill={paleta.nivel[n.nivel] || paleta.barra}
                          fillOpacity={nivelActivo == null || nivelActivo === n.nivel ? 1 : 0.22}
                        />
                      ))}
                      <LabelList
                        dataKey="estudiantes"
                        position="right"
                        formatter={(valor, entrada) => {
                          const pct = entrada?.payload?.pct;
                          return pct != null ? `${valor} · ${pct}%` : valor;
                        }}
                        style={{ fill: paleta.tick, fontSize: 12, fontWeight: 700 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <ul className="dash-leyenda" role="group" aria-label="Filtrar por nivel de desempeño">
                {niveles.map((n) => {
                  const activo = nivelActivo === n.nivel;
                  const apagado = nivelActivo != null && !activo;
                  return (
                    <li key={n.clave}>
                      <button
                        type="button"
                        className={`dash-leyenda-item${activo ? ' dash-leyenda-vista-sel' : ''}${apagado ? ' dash-leyenda-item-off' : ''}`}
                        onClick={() => setNivelActivo((prev) => (prev === n.nivel ? null : n.nivel))}
                        aria-pressed={activo}
                        title={activo ? `Quitar el filtro de nivel ${n.nivel}` : `Filtrar el ranking por nivel ${n.nivel}`}
                      >
                        <i className="dash-punto" style={{ background: paleta.nivel[n.nivel] || paleta.barra }} />
                        {n.nivel}
                        <span className="dash-leyenda-valor">
                          {n.estudiantes} · {pctTexto(n.pct)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <Vacio>
              Nadie tiene actividades calificadas en este período, así que todavía no
              hay niveles que repartir. El ranking de abajo muestra quién ya empezó.
            </Vacio>
          )}
        </Panel>

        {/* ---------- Ranking completo ---------- */}
        <Panel
          titulo="Ranking completo"
          icono={<MdEmojiEvents />}
          sub="Todos los estudiantes del alcance, no solo los primeros. Los que no tienen nota van al final."
          extra={(
            <div className="dash-ranking-controles">
              {nivelActivo && (
                <button
                  type="button"
                  className="dash-filtro-nivel"
                  onClick={() => setNivelActivo(null)}
                  title="Quitar el filtro de nivel"
                >
                  <span className="dash-nivel" data-nivel={nivelActivo}>{nivelActivo}</span>
                  {contadosDelNivel} · <MdClose aria-hidden="true" />
                </button>
              )}
              <label className="dash-buscador" htmlFor="dash-buscar-alias">
                <MdSearch aria-hidden="true" />
                <input
                  id="dash-buscar-alias"
                  type="search"
                  value={busqueda}
                  placeholder="Buscar por alias"
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </label>
              <div className="dash-segmentos" role="group" aria-label="Ordenar el ranking">
                <button
                  type="button"
                  className={orden === 'pct' ? 'dash-segmento-activo' : ''}
                  aria-pressed={orden === 'pct'}
                  onClick={() => setOrden('pct')}
                >
                  Calificación
                </button>
                <button
                  type="button"
                  className={orden === 'xp' ? 'dash-segmento-activo' : ''}
                  aria-pressed={orden === 'xp'}
                  onClick={() => setOrden('xp')}
                >
                  XP
                </button>
              </div>
            </div>
          )}
        >
          {filasRanking.length > 0 ? (
            <div className="dash-tabla-envoltura">
              <table className="dash-tabla">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Alias</th>
                    <th scope="col">Nivel</th>
                    <th scope="col" className="dash-tabla-num">Calificación</th>
                    <th scope="col" className="dash-tabla-num">XP</th>
                  </tr>
                </thead>
                <tbody>
                  {filasRanking.map((f, i) => (
                    <tr key={f.estudiante_id ?? f.id}>
                      <td className="dash-tabla-pos">{i + 1}</td>
                      <td className="dash-tabla-alias">{f.alias}</td>
                      <td>
                        <span className="dash-nivel" data-nivel={f.nivel || 'Sin datos'}>
                          {f.nivel || 'Sin datos'}
                        </span>
                      </td>
                      <td className="dash-tabla-num">{pctTexto(f.pct)}</td>
                      <td className="dash-tabla-num">{f.xp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Vacio>
              {nivelActivo
                ? `No hay estudiantes con nivel ${nivelActivo} en este alcance.`
                : busqueda
                  ? `Ningún alias coincide con «${busqueda}».`
                  : 'Este alcance todavía no tiene estudiantes que ordenar.'}
            </Vacio>
          )}
        </Panel>

        {/* ---------- Participación semanal ---------- */}
        <Panel
          titulo="Participación semanal"
          icono={<MdTrendingUp />}
          sub="Porcentaje de estudiantes que interactuaron cada semana, y cuánta dispersión había entre ellos."
        >
          {serie.length > 0 && serie.some((p) => p.pct != null) ? (
            <>
              <div className="dash-grafico">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={serie} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} />
                    <XAxis
                      dataKey="semana"
                      tickLine={false}
                      axisLine={{ stroke: paleta.eje }}
                      tick={{ fill: paleta.tick, fontSize: 12 }}
                    />
                    <YAxis
                      yAxisId="pct"
                      domain={[0, 100]}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: paleta.tick, fontSize: 12 }}
                      tickFormatter={(v) => `${v}%`}
                      label={{
                        value: 'Participación',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fill: paleta.tick, fontSize: 11 },
                      }}
                    />
                    <YAxis
                      yAxisId="brecha"
                      orientation="right"
                      domain={[0, techoBrecha]}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: paleta.tick, fontSize: 12 }}
                      label={{
                        value: 'Desviación (pp)',
                        angle: 90,
                        position: 'insideRight',
                        style: { fill: paleta.tick, fontSize: 11 },
                      }}
                    />
                    <Tooltip
                      content={(
                        <TooltipTema
                          formatter={(valor, p) => {
                            if (p.dataKey === 'brecha') {
                              return valor == null ? '—' : `${valor} pp`;
                            }
                            return `${p.payload.activos} de ${p.payload.matriculados} · ${valor}%`;
                          }}
                        />
                      )}
                    />
                    <Legend
                      verticalAlign="top"
                      height={28}
                      formatter={(v) => (v === 'pct' ? 'Participación' : 'Desviación estándar')}
                    />
                    <Bar
                      yAxisId="brecha"
                      dataKey="brecha"
                      name="brecha"
                      fill={paleta.barra}
                      fillOpacity={0.35}
                      radius={[4, 4, 0, 0]}
                      connectNulls={false}
                    />
                    <Line
                      yAxisId="pct"
                      type="monotone"
                      dataKey="pct"
                      name="pct"
                      stroke={paleta.linea}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: paleta.linea }}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="dash-panel-nota">
                La línea usa el eje izquierdo (0–100%) y las barras el derecho: son
                magnitudes distintas y compartirlas dejaría la desviación pegada al
                suelo.
              </p>
            </>
          ) : (
            <Vacio>
              Todavía no hay interacción registrada en este período. En cuanto haya
              un intento, la serie semanal se dibuja sola.
            </Vacio>
          )}
        </Panel>

        {/* ---------- Comparación de grupos ---------- */}
        {mostrarComparacion && (
          <Panel
            titulo="Comparación de grupos"
            icono={<MdCompareArrows />}
            sub="Los mismos tres indicadores en cada grupo del docente, para ver cuál está peor."
            extra={<p className="dash-panel-meta">{plural(gruposComparacion.length, 'grupo', 'grupos')}</p>}
          >
            <div className="dash-grafico">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={gruposComparacion} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} vertical={false} />
                  <XAxis
                    dataKey="nombre"
                    tickLine={false}
                    axisLine={{ stroke: paleta.eje }}
                    tick={{ fill: paleta.tick, fontSize: 12 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: paleta.tick, fontSize: 12 }}
                    tickFormatter={(v) => `${v}%`}
                    label={{
                      value: 'Porcentaje',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: paleta.tick, fontSize: 11 },
                    }}
                  />
                  <Tooltip
                    content={(
                      <TooltipTema
                        formatter={(valor, p) => {
                          const g = p.payload;
                          if (p.dataKey === 'progreso_pct') return valor == null ? '—' : `${valor}%`;
                          if (p.dataKey === 'participacion_pct') {
                            return valor == null ? '—' : `${valor}% · ${g.estudiantes - g.sin_datos} de ${g.estudiantes}`;
                          }
                          return valor == null ? '—' : `${valor}% · ${g.en_riesgo} de ${g.estudiantes}`;
                        }}
                      />
                    )}
                  />
                  <Legend verticalAlign="top" height={28} />
                  <Bar dataKey="progreso_pct" name="Progreso" fill={paleta.barra} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="participacion_pct" name="Participación" fill={paleta.linea} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="riesgo_pct" name="En riesgo" fill={paleta.nivel.Bajo} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="dash-tabla-envoltura">
              <table className="dash-tabla">
                <thead>
                  <tr>
                    <th scope="col">Grupo</th>
                    <th scope="col" className="dash-tabla-num">Estudiantes</th>
                    <th scope="col" className="dash-tabla-num">Progreso</th>
                    <th scope="col" className="dash-tabla-num">Participación</th>
                    <th scope="col" className="dash-tabla-num">En riesgo</th>
                  </tr>
                </thead>
                <tbody>
                  {gruposComparacion.map((g) => (
                    <tr key={g.id}>
                      <td>
                        <span className="dash-tabla-alias">{g.nombre}</span>
                        {g.materia && <span className="dash-tabla-sub">{g.materia}</span>}
                      </td>
                      <td className="dash-tabla-num">{g.estudiantes}</td>
                      <td className="dash-tabla-num">{pctTexto(g.progreso_pct)}</td>
                      <td className="dash-tabla-num">{pctTexto(g.participacion_pct)}</td>
                      <td className="dash-tabla-num">{pctTexto(g.riesgo_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        <p className="dash-panel-pie dash-panel-pie-suelto">
          <button type="button" className="dash-enlace-boton" onClick={() => irA('/dashboard/analitica/resumen')}>
            <MdTouchApp aria-hidden="true" />
            Volver al resumen general <MdOpenInNew aria-hidden="true" />
          </button>
        </p>
      </div>
    </div>
  );
};

export default VistaGrupo;
