import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
  MdGroups, MdTouchApp, MdTrendingUp, MdError, MdEmojiEvents, MdBarChart,
  MdOpenInNew, MdArrowUpward, MdArrowDownward, MdRemove,
} from 'react-icons/md';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, LabelList,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import './DashboardDocenteAnalitica.css';
import './ResumenGeneral.css';

/** Cada cuánto se refresca el Top 5. 12 s: dentro del rango 10–15 s pedido. */
const INTERVALO_EN_VIVO_MS = 12_000;

/** Cuántos estudiantes se listan en el Top 5 y en los conceptos con error. */
const TOP_N = 5;

/** Aliases de riesgo que caben en la tarjeta antes de resumir el resto. */
const ALIASES_VISIBLES = 4;

/**
 * Colores de la gráfica de líneas, uno por tema.
 *
 * No se pueden leer del CSS: Recharts pinta ejes, rejilla y tooltip como
 * atributos `fill`/`stroke` en SVG, que ganan a cualquier regla de estilos.
 * Los seis tonos se separan en tono y luminosidad para que dos temas contiguos no
 * se confundan en una línea de 2 px, y el orden es fijo para que el mismo tema
 * conserve el color entre consultas y recargas.
 */
const COLORES_TEMA = {
  light: ['#7c3aed', '#0284c7', '#059669', '#d97706', '#db2777', '#4f46e5'],
  dark: ['#8b5cf6', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a5b4fc'],
};

const PALETA = {
  light: {
    grid: '#e2e8f0', eje: '#cbd5e1', tick: '#64748b',
    error: '#dc2626',
    tooltipFondo: '#ffffff', tooltipBorde: '#e2e8f0', tooltipTexto: '#0f172a',
  },
  dark: {
    grid: '#2b3048', eje: '#3b4160', tick: '#94a3b8',
    error: '#f87171',
    tooltipFondo: '#20243a', tooltipBorde: '#2b3048', tooltipTexto: '#f1f5f9',
  },
};

/**
 * Formatea una variación contra el período anterior.
 */
const formatVariacion = (actual, anterior, sufijo = '') => {
  if (actual == null || anterior == null) return null;
  const diff = Math.round(actual - anterior);
  if (diff === 0) return { texto: 'Sin cambios', tono: 'neutro' };
  return { texto: `${diff > 0 ? '+' : ''}${diff}${sufijo}`, tono: diff > 0 ? 'sube' : 'baja' };
};

/**
 * Clase de color de una variación.
 */
const claseVariacion = (variacion, mejorSiSube) => {
  if (!variacion) return 'dash-kpi-dato';
  if (variacion.tono === 'neutro') return 'dash-kpi-dato dash-kpi-dato-neutro';
  const favorable = (variacion.tono === 'sube') === Boolean(mejorSiSube);
  return `dash-kpi-dato dash-kpi-dato-${favorable ? 'favorable' : 'desfavorable'}`;
};

/** Rótulo de variación con flecha, o el aviso de que no hay base de comparación. */
const Variacion = ({ variacion, mejorSiSube = true }) => {
  if (!variacion) {
    return (
      <span className="dash-kpi-dato">
        <span className="dash-kpi-dato-icon" aria-hidden="true" />
        Sin datos previos
      </span>
    );
  }
  const Icono = variacion.tono === 'sube'
    ? MdArrowUpward
    : variacion.tono === 'baja' ? MdArrowDownward : MdRemove;

  return (
    <span className={claseVariacion(variacion, mejorSiSube)}>
      <Icono className="dash-kpi-dato-icon" aria-hidden="true" />
      {variacion.texto}
      <span className="dash-kpi-vs">vs. período anterior</span>
    </span>
  );
};

/** `true`/`false` de una media query, para lo que depende del ancho. */
const useMediaQuery = (consulta) => {
  const [coincide, setCoincide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(consulta).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(consulta);
    const alCambiar = (e) => setCoincide(e.matches);
    mql.addEventListener('change', alCambiar);
    return () => mql.removeEventListener('change', alCambiar);
  }, [consulta]);

  return coincide;
};

const plural = (n, singular, pluralForma) => `${n} ${n === 1 ? singular : pluralForma}`;

/**
 * Tarjeta de KPI.
 */
const Kpi = ({
  icono, tono, etiqueta, valor, unidad, detalle, variacion, mejorSiSube = true,
}) => (
  <div className="dash-kpi">
    <span className="dash-kpi-cabecera">
      <span className="dash-kpi-icon" data-tono={tono} aria-hidden="true">{icono}</span>
      <span className="dash-kpi-label">{etiqueta}</span>
    </span>
    <span className="dash-kpi-valor">
      {valor}
      {unidad && <span className="dash-kpi-unidad">{unidad}</span>}
    </span>
    {detalle && <span className="dash-kpi-sub">{detalle}</span>}
    <Variacion variacion={variacion} mejorSiSube={mejorSiSube} />
  </div>
);

/**
 * Tarjeta de "Estudiantes en riesgo".
 */
const KpiRiesgo = ({ resumen, onClick }) => {
  const riesgo = resumen.actual.riesgo;
  const { pct_max: pctMax, dias_sin_ingresar: dias } = resumen.umbrales.riesgo;
  const variacion = formatVariacion(riesgo.total, resumen.anterior.riesgo.total);
  const visibles = riesgo.aliases.slice(0, ALIASES_VISIBLES);
  const resto = riesgo.aliases.length - visibles.length;

  return (
    <div className="dash-kpi dash-kpi-riesgo">
      <span className="dash-kpi-cabecera">
        <span className="dash-kpi-icon" data-tono="peligro" aria-hidden="true"><MdError /></span>
        <span className="dash-kpi-label">Estudiantes en riesgo</span>
      </span>

      <div className="dash-kpi-cuerpo">
        <div className="dash-kpi-principal">
          <span className="dash-kpi-valor">
            {riesgo.total}
            {riesgo.truncado && (
              <span
                className="dash-kpi-sufijo"
                title={`Hay al menos ${riesgo.total}: la lista viene truncada`}
              >
                +
              </span>
            )}
          </span>
          <Variacion variacion={variacion} mejorSiSube={false} />
        </div>

        <div className="dash-kpi-aliases">
          {riesgo.aliases.length === 0 ? (
            <p className="dash-kpi-aliases-vacio">
              Ninguno: todos rinden por encima del nivel Bajo y han entrado en los
              últimos {dias} días.
            </p>
          ) : (
            <ul className="dash-kpi-alias-lista">
              {visibles.map((a) => (
                <li key={a.estudiante_id} className="dash-alias" data-motivo={a.motivo}>
                  <span className="dash-alias-nombre">{a.alias}</span>
                  <span className="dash-alias-dato">
                    {a.motivo === 'inactivo' && a.dias_sin_ingresar != null
                      ? `${a.dias_sin_ingresar} d`
                      : `${a.pct}%`}
                  </span>
                </li>
              ))}
              {resto > 0 && <li className="dash-alias dash-alias-mas">y {resto} más</li>}
            </ul>
          )}

          <p className="dash-kpi-criterio">
            Nivel Bajo (menos de {pctMax}%) o {dias}+ días sin ingresar.
          </p>

          {riesgo.aliases.length > 0 && (
            <button type="button" className="dash-enlace-boton" onClick={onClick}>
              Ver en Progreso Individual <MdOpenInNew aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Resumen General del panel analítico.
 */
const ResumenGeneral = ({ grupoId, semanas }) => {
  const navigate = useNavigate();
  const { dark } = useTheme();
  const paleta = dark ? PALETA.dark : PALETA.light;
  const coloresTema = dark ? COLORES_TEMA.dark : COLORES_TEMA.light;
  const esMovil = useMediaQuery('(max-width: 640px)');

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [resumen, setResumen] = useState(null);
  const [temas, setTemas] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [conceptos, setConceptos] = useState(null);

  /** Error del refresco en vivo: no borra lo ya mostrado, solo avisa. */
  const [errorEnVivo, setErrorEnVivo] = useState('');
  /** Marca del último Top 5 recibido, para el rótulo "en vivo". */
  const [actualizadoEn, setActualizadoEn] = useState(null);

  /** Claves de los temas que el docente ocultó al pulsar la leyenda. */
  const [temasOcultos, setTemasOcultos] = useState([]);
  /** Contador de reintentos: relanza la carga inicial sin recargar la página. */
  const [intento, setIntento] = useState(0);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('semanas', String(semanas));
    if (grupoId) p.set('grupoId', String(grupoId));
    return p;
  }, [grupoId, semanas]);

  const qsRanking = useMemo(() => {
    const p = new URLSearchParams(qs);
    p.set('limite', String(TOP_N));
    return p;
  }, [qs]);

  const qsConceptos = useMemo(() => {
    const p = new URLSearchParams(qs);
    p.set('top', String(TOP_N));
    return p;
  }, [qs]);

  /** Carga inicial de los cuatro bloques, en una sola tanda. */
  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    setTemasOcultos([]);

    Promise.all([
      api.get(`/dashboard/resumen?${qs.toString()}`),
      api.get(`/dashboard/progreso-por-tema?${qs.toString()}`),
      api.get(`/dashboard/ranking?${qsRanking.toString()}`),
      api.get(`/dashboard/conceptos-error?${qsConceptos.toString()}`),
    ])
      .then(([r, t, k, c]) => {
        if (!vigente) return;
        setResumen(r.data.data);
        setTemas(t.data.data);
        setRanking(k.data.data);
        setConceptos(c.data.data);
        setActualizadoEn(Date.now());
      })
      .catch((err) => {
        if (!vigente) return;
        console.error('Error al cargar el resumen analítico:', err);
        setError(err.response?.data?.message || 'No se pudo cargar el resumen general.');
      })
      .finally(() => { if (vigente) setCargando(false); });

    return () => { vigente = false; };
  }, [qs, qsRanking, qsConceptos, intento]);

  /**
   * Refresco en vivo del Top 5.
   */
  const pedirRanking = useCallback(() => {
    api
      .get(`/dashboard/ranking?${qsRanking.toString()}`)
      .then((r) => {
        setRanking(r.data.data);
        setActualizadoEn(Date.now());
        setErrorEnVivo('');
      })
      .catch((err) => {
        console.warn('No se pudo refrescar el Top 5:', err);
        setErrorEnVivo('sin actualizar');
      });
  }, [qsRanking]);

  useEffect(() => {
    if (cargando || !resumen) return undefined;

    const id = setInterval(() => {
      if (document.visibilityState === 'visible') pedirRanking();
    }, INTERVALO_EN_VIVO_MS);

    const alVolver = () => {
      if (document.visibilityState === 'visible') pedirRanking();
    };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [cargando, resumen, pedirRanking]);

  /** Navega a otra vista conservando el filtro global (grupo y período). */
  const irA = (ruta, extra = {}) => {
    const p = new URLSearchParams(qs);
    Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)));
    navigate(`${ruta}?${p.toString()}`);
  };

  /* ---------------- carga / error / vacío ---------------- */

  if (cargando) {
    return (
      <div className="resumen-general-page">
        <div className="dash-analitica">
          <div className="dash-cargando" role="status" aria-live="polite">
            <span className="dash-cargando-punto" aria-hidden="true" />
            Cargando el resumen general...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="resumen-general-page">
        <div className="dash-analitica">
          <div className="dash-panel dash-panel-error">
            <h3><MdError /> No se pudo cargar el resumen</h3>
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

  if (!resumen || resumen.alcance.estudiantes === 0) {
    return (
      <div className="resumen-general-page">
        <div className="dash-analitica">
          <div className="dash-vacio">
            Todavía no tienes estudiantes registrados. Cuando asignes cuentas o
            agrupes alumnos verás aquí su participación.
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- datos derivados ---------------- */

  const { actual, anterior, periodo, alcance } = resumen;
  const listaTemas = temas?.temas ?? [];
  const serieTemas = temas?.serie ?? [];
  const haySerie = listaTemas.length > 0
    && serieTemas.some((p) => listaTemas.some((t) => p[t.clave] != null));

  const top = ranking?.top ?? [];
  const totalConNota = ranking?.total_estudiantes ?? 0;
  const errores = conceptos?.top ?? [];

  /** "hace 12 s" / "hace 2 min", sin un temporizador propio corriendo. */
  const antiguedad = (() => {
    if (!actualizadoEn) return null;
    const s = Math.max(0, Math.round((Date.now() - actualizadoEn) / 1000));
    return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
  })();

  return (
    <div className="resumen-general-page">
      <div className="dash-analitica">
        <div className="dash-analitica-header">
          <h2><MdBarChart /> Resumen General</h2>
          <p className="dash-analitica-nota">
            Últimas {periodo.semanas} semanas · {plural(alcance.estudiantes, 'estudiante', 'estudiantes')}
            {grupoId
              ? ' · grupo filtrado'
              : ` · ${plural(alcance.grupos, 'grupo', 'grupos')}`}
          </p>
        </div>

        {/* ---------- KPIs ---------- */}
        <div className="dash-kpi-grid">
          <Kpi
            icono={<MdTouchApp />}
            tono="info"
            etiqueta="Participación semanal"
            valor={actual.participacion.pct}
            unidad="%"
            detalle={`${actual.participacion.estudiantes_activos} de ${actual.participacion.estudiantes} con actividad en el período`}
            variacion={formatVariacion(actual.participacion.pct, anterior.participacion.pct, ' pp')}
          />

          <Kpi
            icono={<MdTrendingUp />}
            tono="acento"
            etiqueta="Progreso promedio"
            valor={actual.progreso.pct == null ? '—' : actual.progreso.pct}
            unidad={actual.progreso.pct == null ? '' : '%'}
            detalle={
              actual.progreso.nivel
                ? `Nivel ${actual.progreso.nivel}`
                : 'Sin actividades calificadas en el período'
            }
            variacion={formatVariacion(actual.progreso.pct, anterior.progreso.pct, ' pp')}
          />

          <KpiRiesgo
            resumen={resumen}
            onClick={() => irA('/dashboard/analitica/progreso-individual', { enRiesgo: '1' })}
          />

          <Kpi
            icono={<MdEmojiEvents />}
            tono="exito"
            etiqueta="XP promedio"
            valor={actual.xp.promedio == null ? '—' : actual.xp.promedio}
            unidad={actual.xp.promedio == null ? '' : ' XP'}
            detalle={
              actual.xp.estudiantes === 0
                ? 'Sin puntos acumulados en el período'
                : `Media de ${plural(actual.xp.estudiantes, 'estudiante', 'estudiantes')} con nota`
            }
            variacion={formatVariacion(actual.xp.promedio, anterior.xp.promedio, ' XP')}
          />

          <Kpi
            icono={<MdGroups />}
            tono="aviso"
            etiqueta={`Usuarios activos (${actual.activos.horas} h)`}
            valor={actual.activos.total}
            detalle={`${actual.activos.pct}% de tus estudiantes`}
            variacion={formatVariacion(
              actual.activos.total,
              anterior.activos.total,
              ` en ${actual.activos.horas} h`
            )}
          />
        </div>

        {/* ---------- Progreso por tema ---------- */}
        <div className="dash-panel">
          <h3><MdTrendingUp /> Progreso por tema</h3>
          <p className="dash-panel-sub">
            Porcentaje de logro por tema (módulo) en cada semana del período.
            {temas?.temas_ocultos > 0 && ` Se muestran los ${listaTemas.length} temas con más actividad; ${temas.temas_ocultos} más quedan fuera.`}
            {' Pulsa un tema de la leyenda para mostrarlo u ocultarlo.'}
          </p>

          {haySerie ? (
            <>
              <div className="dash-grafico">
                <ResponsiveContainer width="100%" height={esMovil ? 230 : 280}>
                  <LineChart data={serieTemas} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} vertical={false} />
                    <XAxis
                      dataKey="semana"
                      tick={{ fontSize: 12, fill: paleta.tick }}
                      axisLine={{ stroke: paleta.eje }}
                      tickLine={false}
                      label={{ value: 'Semana', position: 'insideBottom', offset: -2, fill: paleta.tick, fontSize: 11 }}
                      height={44}
                    />
                    <YAxis
                      unit="%"
                      domain={[0, 100]}
                      allowDecimals={false}
                      tick={{ fontSize: 12, fill: paleta.tick }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                      label={{ value: '% de logro', angle: -90, position: 'insideLeft', fill: paleta.tick, fontSize: 11 }}
                    />
                    <Tooltip
                      cursor={{ stroke: paleta.eje }}
                      contentStyle={{
                        background: paleta.tooltipFondo,
                        border: `1px solid ${paleta.tooltipBorde}`,
                        borderRadius: 10,
                        color: paleta.tooltipTexto,
                      }}
                      labelStyle={{ color: paleta.tooltipTexto, fontWeight: 700 }}
                      itemStyle={{ color: paleta.tooltipTexto }}
                      formatter={(valor, nombre) => [`${valor}%`, nombre]}
                    />
                    {listaTemas.map((t, idx) => (
                      <Line
                        key={t.clave}
                        type="monotone"
                        dataKey={t.clave}
                        name={t.nombre}
                        stroke={coloresTema[idx % coloresTema.length]}
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5 }}
                        hide={temasOcultos.includes(t.clave)}
                        connectNulls={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="dash-leyenda" role="group" aria-label="Temas del gráfico">
                {listaTemas.map((t, idx) => {
                  const activo = !temasOcultos.includes(t.clave);
                  return (
                    <button
                      key={t.clave}
                      type="button"
                      className={`dash-leyenda-item${activo ? '' : ' dash-leyenda-item-off'}`}
                      onClick={() => setTemasOcultos((prev) => (
                        prev.includes(t.clave)
                          ? prev.filter((c) => c !== t.clave)
                          : [...prev, t.clave]
                      ))}
                      aria-pressed={activo}
                    >
                      <i
                        className="dash-punto"
                        style={{ background: coloresTema[idx % coloresTema.length] }}
                      />
                      {t.nombre}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="dash-vacio">
              Sin actividades calificadas en el período. El progreso por tema se
              llena con juegos y evaluaciones; los contenidos no llevan nota.
            </div>
          )}
        </div>

        {/* ---------- Top 5 en vivo ---------- */}
        <div className="dash-panel">
          <div className="dash-panel-cabecera">
            <div>
              <h3><MdEmojiEvents /> Top 5 en vivo</h3>
              <p className="dash-panel-sub">
                Solo juegos y evaluaciones, que son los que llevan nota.
                {totalConNota > 0 && ` ${plural(totalConNota, 'estudiante tiene', 'estudiantes tienen')} resultados en el período.`}
              </p>
            </div>
            <p className="dash-vivo">
              <span className="dash-vivo-punto" aria-hidden="true" />
              {antiguedad ? `Actualizado hace ${antiguedad}` : 'En vivo'}
              {errorEnVivo && <span className="dash-vivo-error"> · {errorEnVivo}</span>}
            </p>
          </div>

          {top.length > 0 ? (
            <ol className="dash-ranking">
              {top.map((fila) => (
                <li key={fila.estudiante_id}>
                  <span className={`dash-ranking-pos dash-ranking-pos-${fila.posicion}`}>
                    {fila.posicion}
                  </span>
                  <span className="dash-ranking-nombre">{fila.alias}</span>
                  <span className="dash-nivel" data-nivel={fila.nivel || 'Sin datos'}>
                    {fila.nivel || 'Sin datos'}
                  </span>
                  <span className="dash-ranking-nota">{fila.pct}%</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="dash-vacio">
              Todavía no hay resultados calificados en el período. El ranking
              aparece cuando se resuelvan juegos o evaluaciones.
            </div>
          )}

          <div className="dash-panel-pie">
            <button
              type="button"
              className="dash-enlace-boton"
              onClick={() => irA('/dashboard/analitica/vista-grupo')}
            >
              Ver ranking completo <MdOpenInNew aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* ---------- Conceptos con mayor error ---------- */}
        <div className="dash-panel">
          <h3><MdError /> Conceptos con mayor error</h3>
          <p className="dash-panel-sub">
            Intentos no completados por actividad, en el período.
          </p>

          {errores.length > 0 ? (
            <>
              <div className="dash-grafico">
                <ResponsiveContainer width="100%" height={esMovil ? 220 : 260}>
                  <BarChart
                    data={errores}
                    layout="vertical"
                    margin={{ top: 4, right: esMovil ? 26 : 40, left: 4, bottom: 4 }}
                    barCategoryGap="28%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} horizontal={false} />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fontSize: 12, fill: paleta.tick }}
                      axisLine={{ stroke: paleta.eje }}
                      tickLine={false}
                      label={{
                        value: 'Intentos fallidos',
                        position: 'insideBottom',
                        offset: -2,
                        fill: paleta.tick,
                        fontSize: 11,
                      }}
                      height={40}
                    />
                    <YAxis
                      type="category"
                      dataKey="nombre"
                      tick={{ fontSize: 12, fill: paleta.tick }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => (
                        String(v).length > 22 ? `${String(v).slice(0, 21)}…` : v
                      )}
                      width={esMovil ? 108 : 190}
                    />
                    <Tooltip
                      cursor={{ fill: paleta.grid, fillOpacity: 0.5 }}
                      contentStyle={{
                        background: paleta.tooltipFondo,
                        border: `1px solid ${paleta.tooltipBorde}`,
                        borderRadius: 10,
                        color: paleta.tooltipTexto,
                      }}
                      labelStyle={{ color: paleta.tooltipTexto, fontWeight: 700 }}
                      itemStyle={{ color: paleta.tooltipTexto }}
                      formatter={(valor, _nombre, item) => [
                        `${valor} fallidos · ${item.payload.errores} de ${item.payload.intentos} intentos (${item.payload.pct_error}%)`,
                        'Errores',
                      ]}
                    />
                    <Bar
                      dataKey="errores"
                      name="Errores"
                      fill={paleta.error}
                      radius={[0, 8, 8, 0]}
                      maxBarSize={26}
                    >
                      <LabelList
                        dataKey="errores"
                        position="right"
                        fill={paleta.tooltipTexto}
                        fontSize={12}
                        fontWeight={700}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="dash-panel-pie">
                <button
                  type="button"
                  className="dash-enlace-boton"
                  onClick={() => irA('/dashboard/analitica/contenidos', {
                    tipo: errores[0].tipo,
                    actividadId: errores[0].actividad_id,
                  })}
                >
                  Ver detalle <MdOpenInNew aria-hidden="true" />
                </button>
              </div>
            </>
          ) : (
            <div className="dash-vacio">
              Sin errores registrados en el período. Cuando aparezca un intento sin
              completar, el concepto se listará aquí.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResumenGeneral;