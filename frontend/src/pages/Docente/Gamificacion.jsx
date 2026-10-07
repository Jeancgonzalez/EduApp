import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import {
  MdMilitaryTech, MdError, MdEmojiEvents, MdTrendingDown, MdStars,
  MdBolt, MdInsights, MdWhatshot, MdHourglassEmpty,
} from 'react-icons/md';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LabelList, ScatterChart, Scatter, ZAxis, ReferenceLine,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import './DashboardDocenteAnalitica.css';
import './Gamificacion.css';

const PALETA = {
  light: {
    grid: '#e2e8f0', eje: '#cbd5e1', tick: '#64748b',
    barra: '#7c3aed',
    tooltipFondo: '#ffffff', tooltipBorde: '#e2e8f0', tooltipTexto: '#0f172a',
    rareza: { comun: '#10b981', poco_comun: '#f59e0b', rara: '#7c3aed' },
    grupos: { g0: '#94a3b8', g1: '#38bdf8', g2: '#f59e0b', g3: '#10b981' },
    tendencia: '#ea580c',
  },
  dark: {
    grid: '#2b3048', eje: '#3b4160', tick: '#94a3b8',
    barra: '#8b5cf6',
    tooltipFondo: '#20243a', tooltipBorde: '#2b3048', tooltipTexto: '#f1f5f9',
    rareza: { comun: '#34d399', poco_comun: '#fbbf24', rara: '#a5b4fc' },
    grupos: { g0: '#94a3b8', g1: '#60a5fa', g2: '#fbbf24', g3: '#34d399' },
    tendencia: '#fb923c',
  },
};

const ICONO_RAREZA = {
  comun: MdWhatshot,
  poco_comun: MdStars,
  rara: MdEmojiEvents,
};

const plural = (n, singular, pluralForma) => `${n} ${n === 1 ? singular : pluralForma}`;
const numTexto = (v) => (v == null ? '—' : String(v));

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
      {payload.map((p, i) => (
        <p key={`${p.dataKey ?? p.name}-${i}`} className="dash-tooltip-fila">
          <span
            className="dash-tooltip-punto"
            style={{ background: p.color || p.payload?.fill }}
            aria-hidden="true"
          />
          <span className="dash-tooltip-nombre">{p.name}</span>
          <span className="dash-tooltip-valor">
            {formatter ? formatter(p.value, p) : p.value}{unidad}
          </span>
        </p>
      ))}
    </div>
  );
};

const TooltipContinuidad = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const punto = payload[0].payload;
  if (!punto) return null;
  return (
    <div className="dash-tooltip">
      <p className="dash-tooltip-titulo">{punto.alias}</p>
      <p className="dash-tooltip-fila">
        <span className="dash-tooltip-nombre">Días con actividad</span>
        <span className="dash-tooltip-valor">{plural(punto.dias, 'día', 'días')}</span>
      </p>
      <p className="dash-tooltip-fila">
        <span className="dash-tooltip-nombre">Insignias</span>
        <span className="dash-tooltip-valor">{plural(punto.insignias, 'insignia', 'insignias')}</span>
      </p>
    </div>
  );
};

const Gamificacion = ({ grupoId, semanas }) => {
  const { dark } = useTheme();
  const paleta = dark ? PALETA.dark : PALETA.light;

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [datos, setDatos] = useState(null);
  const [intento, setIntento] = useState(0);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('semanas', String(semanas));
    if (grupoId) p.set('grupoId', String(grupoId));
    return p;
  }, [grupoId, semanas]);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');

    api.get(`/dashboard/gamificacion?${qs.toString()}`)
      .then((r) => {
        if (!vigente) return;
        setDatos(r.data.data);
      })
      .catch((err) => {
        if (!vigente) return;
        console.error('Error al cargar la gamificación:', err);
        setError(err.response?.data?.message || 'No se pudo cargar la gamificación.');
      })
      .finally(() => { if (vigente) setCargando(false); });

    return () => { vigente = false; };
  }, [qs, intento]);

  /* ---------------- datos derivados ---------------- */

  const alcance = datos?.alcance?.estudiantes ?? 0;
  const totales = datos?.totales ?? {};
  const rarezas = datos?.rarezas ?? [];
  const grupos = datos?.grupos_insignias ?? [];
  const rangosXp = datos?.xp_rangos ?? [];
  const masObtenidas = datos?.mas_obtenidas ?? [];
  const menosObtenidas = datos?.menos_obtenidas ?? [];
  const continuidad = datos?.continuidad ?? [];

  const seriesContinuidad = useMemo(
    () => grupos.map((g) => ({
      ...g,
      puntos: continuidad.filter((c) => c.grupo === g.clave),
    })),
    [grupos, continuidad]
  );

  const mayorFrecuencia = useMemo(
    () => rangosXp.reduce((max, r) => Math.max(max, r.estudiantes), 0),
    [rangosXp]
  );

  const maxInsigniasAlumno = useMemo(
    () => Math.max(1, ...continuidad.map((c) => c.insignias)),
    [continuidad]
  );

  const comparativa = useMemo(() => {
    if (continuidad.length < 4) return null;
    const dias = continuidad.map((c) => c.dias).sort((a, b) => a - b);
    const mediana = dias[Math.floor(dias.length / 2)];
    const suma = (lista) => lista.reduce((acc, c) => acc + c.insignias, 0);
    const arriba = continuidad.filter((c) => c.dias >= mediana);
    const abajo = continuidad.filter((c) => c.dias < mediana);
    if (arriba.length === 0 || abajo.length === 0) return null;
    return {
      mediana,
      mediaArriba: suma(arriba) / arriba.length,
      mediaAbajo: suma(abajo) / abajo.length,
      nArriba: arriba.length,
      nAbajo: abajo.length,
    };
  }, [continuidad]);

  /**
   * Línea de trazabilidad: conecta TODOS los puntos ordenados por días
   * de actividad. Se necesita al menos 2 puntos para trazar una línea.
   */
  const lineaTrazabilidad = useMemo(() => {
    const puntos = continuidad
      .filter((c) => Number.isFinite(c.dias) && Number.isFinite(c.insignias))
      .map((c) => ({ dias: c.dias, insignias: c.insignias }))
      .sort((a, b) => a.dias - b.dias);

    if (puntos.length < 2) return null;
    return { puntos };
  }, [continuidad]);

  /* ---------------- carga / error / vacío ---------------- */

  if (cargando) {
    return (
      <div className="gamificacion-page">
        <div className="dash-analitica">
          <div className="dash-cargando" role="status" aria-live="polite">
            <span className="dash-cargando-punto" aria-hidden="true" />
            Cargando la gamificación...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="gamificacion-page">
        <div className="dash-analitica">
          <div className="dash-panel dash-panel-error">
            <h3><MdError /> No se pudo cargar la gamificación</h3>
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

  if (!datos || alcance === 0) {
    return (
      <div className="gamificacion-page">
        <div className="dash-analitica">
          <Vacio>
            Todavía no tienes estudiantes registrados. Cuando asignes cuentas o
            agrupes alumnos verás aquí qué insignias están ganando.
          </Vacio>
        </div>
      </div>
    );
  }

  /** Fila de la lista de insignias. */
  const FilaInsignia = ({ item }) => {
    const color = paleta.rareza[item.rareza] || paleta.barra;
    const IconoRareza = ICONO_RAREZA[item.rareza] || MdEmojiEvents;
    return (
      <li className="gam-insignia">
        <i className="dash-punto gam-insignia-punto" style={{ background: color }} aria-hidden="true" />
        <span className="gam-insignia-nombre" title={item.nombre}>{item.nombre}</span>
        <span className="gam-insignia-cuenta">
          <strong>{item.estudiantes}</strong> de {item.de}
          <span className="gam-insignia-pct"> · {item.pct}%</span>
        </span>
        <span className="gam-insignia-rar" data-rareza={item.rareza}>
          <IconoRareza aria-hidden="true" />
          {rarezas.find((r) => r.clave === item.rareza)?.etiqueta ?? item.rareza}
        </span>
      </li>
    );
  };

  return (
    <div className="gamificacion-page">
      <div className="dash-analitica">
        <div className="dash-analitica-header">
          <h2><MdMilitaryTech /> Gamificación</h2>
          <p className="dash-analitica-nota">
            {grupoId
              ? 'Alcance: el grupo seleccionado en el filtro.'
              : `Alcance: ${plural(alcance, 'estudiante del docente', 'estudiantes del docente')}.`}
          </p>
        </div>

        {/* ---------- Resumen ---------- */}
        <div className="dash-kpi-grid">
          <div className="dash-kpi" data-tono="acento">
            <div className="dash-kpi-cabecera">
              <span className="dash-kpi-icon"><MdEmojiEvents /></span>
              <span className="dash-kpi-label">Insignias en circulación</span>
            </div>
            <p className="dash-kpi-valor">
              {totales.otorgadas ?? 0}
              <span className="dash-kpi-unidad"> de {totales.disponibles ?? 0}</span>
            </p>
            <p className="dash-kpi-sub">del catálogo total ya se han repartido</p>
          </div>

          <div className="dash-kpi" data-tono="exito">
            <div className="dash-kpi-cabecera">
              <span className="dash-kpi-icon"><MdStars /></span>
              <span className="dash-kpi-label">Estudiantes con insignias</span>
            </div>
            <p className="dash-kpi-valor">
              {totales.estudiantes_con_insignias ?? 0}
              <span className="dash-kpi-unidad"> de {alcance}</span>
            </p>
            <p className="dash-kpi-sub">
              {totales.sin_insignias > 0
                ? `${plural(totales.sin_insignias, 'estudiante sin ninguna', 'estudiantes sin ninguna')}`
                : 'Toda la clase tiene al menos una'}
            </p>
          </div>

          <div className="dash-kpi" data-tono="info">
            <div className="dash-kpi-cabecera">
              <span className="dash-kpi-icon"><MdBolt /></span>
              <span className="dash-kpi-label">XP promedio</span>
            </div>
            <p className="dash-kpi-valor">
              {numTexto(datos.xp_promedio)}
              <span className="dash-kpi-unidad"> XP</span>
            </p>
            <p className="dash-kpi-sub">
              {datos.xp_promedio == null
                ? 'Nadie ha iniciado actividades todavía'
                : `De los ${plural(datos.con_xp ?? 0, 'estudiante con XP', 'estudiantes con XP')}`}
            </p>
          </div>

          <div className="dash-kpi" data-tono="aviso">
            <div className="dash-kpi-cabecera">
              <span className="dash-kpi-icon"><MdInsights /></span>
              <span className="dash-kpi-label">XP del período</span>
            </div>
            <p className="dash-kpi-valor">
              {datos.xp_total ?? 0}
              <span className="dash-kpi-unidad"> XP</span>
            </p>
            <p className="dash-kpi-sub">
              {datos.sin_xp > 0
                ? `${plural(datos.sin_xp, 'estudiante sin XP', 'estudiantes sin XP')}`
                : 'Todos han sumado XP'}
            </p>
          </div>
        </div>

        {/* ---------- Insignias más y menos obtenidas ---------- */}
        <Panel
          titulo="Insignias más y menos obtenidas"
          icono={<MdEmojiEvents />}
          sub="Cuántas personas del alcance tienen cada insignia. El color es su rareza en este grupo, no en el catálogo."
          extra={(
            <p className="dash-panel-meta">
              {totales.otorgadas} en circulación
            </p>
          )}
        >
          {datos.sin_registro ? (
            <Vacio>
              Todavía no hay insignias registradas. Esta tabla se llena sola cuando
              cada estudiante abre su panel de gamificación: no se calcula al vuelo
              para los 30 alumnos en cada consulta.
            </Vacio>
          ) : (
            <>
              <div className="gam-listas">
                <div>
                  <p className="gam-subtitulo">
                    <MdTrendingDown aria-hidden="true" /> Más obtenidas
                  </p>
                  <ul className="gam-lista">
                    {masObtenidas.map((i) => <FilaInsignia key={i.medalla_id} item={i} />)}
                  </ul>
                </div>
                <div>
                  <p className="gam-subtitulo">
                    <MdHourglassEmpty aria-hidden="true" /> Menos obtenidas
                  </p>
                  <ul className="gam-lista">
                    {menosObtenidas.map((i) => <FilaInsignia key={i.medalla_id} item={i} />)}
                  </ul>
                </div>
              </div>

              <div className="gam-comparativa gam-explica-rareza">
                <p>
                  <strong>Cómo leer la rareza.</strong>{' '}
                  Cada insignia se etiqueta según cuántas personas del grupo la tienen.{' '}
                  <strong>Común</strong> cuando la tiene al menos el 50% del grupo,{' '}
                  <strong>Poco común</strong> cuando está entre el 15% y el 49%, y{' '}
                  <strong>Rara</strong> cuando la tiene menos del 15%. El color del punto
                  y el icono al lado de cada insignia reflejan esa categoría.
                </p>
              </div>
            </>
          )}
        </Panel>

        {/* ---------- Distribución de XP por rango ---------- */}
        <Panel
          titulo="Distribución de XP por rango"
          icono={<MdBolt />}
          sub="Cuántos estudiantes hay en cada rango de XP acumulado. Un histograma y no un promedio porque el promedio esconde si la clase está escalonada o si hay uno solo jugando."
          extra={(
            <p className="dash-panel-meta">
              {datos.xp_promedio == null
                ? 'Sin XP en el período'
                : `Promedio ${datos.xp_promedio} XP entre los que tienen`}
            </p>
          )}
        >
          <div className="dash-grafico gam-grafico-xp">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rangosXp} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} vertical={false} />
                <XAxis
                  dataKey="etiqueta"
                  tickLine={false}
                  axisLine={{ stroke: paleta.eje }}
                  tick={{ fill: paleta.tick, fontSize: 12 }}
                  height={56}
                  interval={0}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: paleta.tick, fontSize: 12 }}
                  label={{
                    value: 'Estudiantes',
                    angle: -90,
                    position: 'insideLeft',
                    fill: paleta.tick,
                    fontSize: 11,
                  }}
                  width={56}
                />
                <Tooltip
                  cursor={{ fill: paleta.grid, fillOpacity: 0.35 }}
                  content={(
                    <TooltipTema
                      formatter={(valor) => plural(valor, 'estudiante', 'estudiantes')}
                    />
                  )}
                />
                <Bar
                  dataKey="estudiantes"
                  name="Estudiantes"
                  fill={paleta.barra}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={64}
                >
                  <LabelList
                    dataKey="estudiantes"
                    position="top"
                    style={{ fill: paleta.tick, fontSize: 12, fontWeight: 700 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="dash-panel-pie">
            Rango más habitual: <strong>
              {rangosXp.reduce((max, r) => (r.estudiantes > max.estudiantes ? r : max), rangosXp[0] ?? { estudiantes: 0, etiqueta: '—' }).etiqueta}
            </strong>
            {mayorFrecuencia > 0
              ? `, con ${plural(mayorFrecuencia, 'estudiante', 'estudiantes')}.`
              : '.'}
            {datos.sin_xp > 0 && ` Los ${datos.sin_xp} que no aparecen en XP también cuentan en el alcance.`}
          </p>
        </Panel>

        {/* ---------- Efecto de la gamificación ---------- */}
        <Panel
          titulo="Efecto de la gamificación"
          icono={<MdInsights />}
          sub="Cada punto es un estudiante: en horizontal los días con actividad en el período, en vertical las insignias que tiene. La línea conecta a los estudiantes en orden de días para ver el recorrido del grupo."
          extra={(
            <p className="dash-panel-meta">
              {continuidad.length} estudiantes
            </p>
          )}
        >
          {continuidad.length === 0 ? (
            <Vacio>Este alcance todavía no tiene estudiantes que representar.</Vacio>
          ) : (
            <>
              <div className="dash-grafico">
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ top: 16, right: 24, left: 0, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} />
                    <XAxis
                      type="number"
                      dataKey="dias"
                      name="Días con actividad"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={{ stroke: paleta.eje }}
                      tick={{ fill: paleta.tick, fontSize: 12 }}
                      label={{
                        value: 'Días con actividad',
                        position: 'insideBottom',
                        offset: -8,
                        fill: paleta.tick,
                        fontSize: 11,
                      }}
                      height={52}
                    />
                    <YAxis
                      type="number"
                      dataKey="insignias"
                      name="Insignias"
                      allowDecimals={false}
                      domain={[0, maxInsigniasAlumno]}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: paleta.tick, fontSize: 12 }}
                      label={{
                        value: 'Insignias obtenidas',
                        angle: -90,
                        position: 'insideLeft',
                        fill: paleta.tick,
                        fontSize: 11,
                      }}
                      width={64}
                    />
                    <ZAxis range={[70, 70]} />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3', stroke: paleta.eje }}
                      content={<TooltipContinuidad />}
                    />

                    {seriesContinuidad
                      .filter((s) => s.puntos.length > 0)
                      .map((s) => (
                        <Scatter
                          key={s.clave}
                          name={s.clave}
                          data={s.puntos}
                          fill={paleta.grupos[s.clave]}
                        />
                      ))}

                    {lineaTrazabilidad && (
                      <Scatter
                        name="trazabilidad"
                        data={lineaTrazabilidad.puntos}
                        legendType="none"
                        isAnimationActive={false}
                        fill={paleta.tendencia}
                        line={{
                          stroke: paleta.tendencia,
                          strokeWidth: 2.5,
                          strokeDasharray: '7 5',
                        }}
                        shape={() => <g />}
                      />
                    )}

                    <ReferenceLine y={0} stroke={paleta.eje} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              <ul className="dash-leyenda dash-leyenda-estatica">
                {seriesContinuidad.map((s) => (
                  <li key={s.clave}>
                    <span className="dash-leyenda-item gam-leyenda-rar">
                      <i className="dash-punto" style={{ background: paleta.grupos[s.clave] }} />
                      {s.etiqueta} · {plural(s.puntos.length, 'estudiante', 'estudiantes')}
                    </span>
                  </li>
                ))}
              </ul>

              {comparativa && (
                <p className="gam-comparativa">
                  Quienes alcanzan la mediana de {comparativa.mediana}{' '}
                  {comparativa.mediana === 1 ? 'día' : 'días'} de actividad promedian{' '}
                  <strong>{comparativa.mediaArriba.toFixed(1)}</strong> insignias, contra{' '}
                  <strong>{comparativa.mediaAbajo.toFixed(1)}</strong> de quienes se quedan por
                  debajo ({comparativa.nArriba} frente a {comparativa.nAbajo} estudiantes).{' '}
                  {comparativa.mediaArriba > comparativa.mediaAbajo
                    ? 'Entrar más se relaciona con tener más insignias.'
                    : 'En este grupo, entrar más no se relaciona con tener más insignias.'}
                </p>
              )}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default Gamificacion;