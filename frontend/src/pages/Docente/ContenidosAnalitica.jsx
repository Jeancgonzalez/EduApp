import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import {
  MdBook, MdError, MdCheckCircle, MdWarningAmber, MdInfoOutline,
  MdArrowUpward, MdArrowDownward, MdEditNote, MdTimer, MdInsights,
} from 'react-icons/md';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import './DashboardDocenteAnalitica.css';
import './ContenidosAnalitica.css';

const PALETA = {
  light: {
    grid: '#e2e8f0', eje: '#cbd5e1', tick: '#64748b',
    dona: { completada: '#10b981', en_progreso: '#38bdf8', abandonada: '#ef4444' },
    dificultad: { facil: '#059669', media: '#d97706', dificil: '#ea580c', muy_dificil: '#dc2626' },
  },
  dark: {
    grid: '#2b3048', eje: '#3b4160', tick: '#94a3b8',
    dona: { completada: '#34d399', en_progreso: '#60a5fa', abandonada: '#f87171' },
    dificultad: { facil: '#34d399', media: '#fbbf24', dificil: '#fb923c', muy_dificil: '#f87171' },
  },
};

const TIPOS = [
  { clave: 'contenido', etiqueta: 'Contenidos' },
  { clave: 'juego', etiqueta: 'Juegos' },
  { clave: 'evaluacion', etiqueta: 'Evaluaciones' },
];

const ORDEN_DIFICULTAD = ['muy_dificil', 'dificil', 'media', 'facil'];

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

const TooltipTema = ({ active, payload, formatter, unidad = '' }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="dash-tooltip">
      {payload.map((p, i) => (
        <p key={`${p.dataKey ?? p.name}-${i}`} className="dash-tooltip-fila">
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

const segATexto = (seg) => {
  if (seg == null) return '—';
  const minutos = Math.floor(seg / 60);
  const segundos = seg % 60;
  if (minutos === 0) return `${segundos} s`;
  return segundos > 0 ? `${minutos} min · ${segundos} s` : `${minutos} min`;
};

const ContenidosAnalitica = ({ grupoId, semanas }) => {
  const { dark } = useTheme();
  const paleta = dark ? PALETA.dark : PALETA.light;

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [datos, setDatos] = useState(null);
  const [intento, setIntento] = useState(0);

  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [orden, setOrden] = useState({ clave: 'intentos', dir: 'desc' });
  const [criterioAbierto, setCriterioAbierto] = useState(false);

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

    api.get(`/dashboard/contenidos?${qs.toString()}`)
      .then((r) => {
        if (!vigente) return;
        setDatos(r.data.data);
      })
      .catch((err) => {
        if (!vigente) return;
        console.error('Error al cargar los contenidos:', err);
        setError(err.response?.data?.message || 'No se pudieron cargar los contenidos.');
      })
      .finally(() => { if (vigente) setCargando(false); });

    return () => { vigente = false; };
  }, [qs, intento]);

  const kpis = datos?.kpis ?? {};
  const dona = datos?.dona ?? { total: 0, segmentos: [] };
  const creadas = datos?.creadas_por_ti ?? { total: 0, publicadas: 0, por_tipo: {} };
  const tabla = datos?.tabla ?? [];
  const cortes = datos?.criterios?.dificultad?.cortes ?? [];
  const umbralAbandono = datos?.criterios?.abandono ?? { alto: 20, minimo_intentos: 5 };
  const umbralAcierto = datos?.criterios?.acierto ?? { bajo: 50 };

  const textoCriterioDificultad = useMemo(() => {
    if (cortes.length === 0) return '';
    return cortes.map((c, i) => {
      if (i === 0) return `${c.etiqueta}: ${c.minimo}% o más`;
      if (i === cortes.length - 1) return `${c.etiqueta}: menos de ${cortes[i - 1].minimo}%`;
      return `${c.etiqueta}: de ${c.minimo}% a ${cortes[i - 1].minimo - 1}%`;
    });
  }, [cortes]);

  const cambiarOrden = (clave) => {
    setOrden((prev) => (prev.clave === clave
      ? { clave, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { clave, dir: 'desc' }));
  };

  const tablaFiltrada = useMemo(() => {
    if (tipoFiltro !== 'todos') return tabla.filter((f) => f.tipo === tipoFiltro);
    return tabla;
  }, [tabla, tipoFiltro]);

  const tablaOrdenada = useMemo(() => {
    const comparar = (a, b) => {
      if (orden.clave === 'titulo') {
        return (orden.dir === 'asc' ? 1 : -1) * String(a.titulo).localeCompare(String(b.titulo));
      }
      if (orden.clave === 'dificultad') {
        const ia = a.dificultad ? ORDEN_DIFICULTAD.indexOf(a.dificultad.clave) : -1;
        const ib = b.dificultad ? ORDEN_DIFICULTAD.indexOf(b.dificultad.clave) : -1;
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return (orden.dir === 'asc' ? 1 : -1) * (ia - ib);
      }
      const claveFila = orden.clave === 'tiempo_medio' ? 'tiempo_medio_seg' : orden.clave;
      const va = a[claveFila];
      const vb = b[claveFila];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (orden.dir === 'asc' ? 1 : -1) * (Number(va) - Number(vb));
    };
    return [...tablaFiltrada].sort(comparar);
  }, [tablaFiltrada, orden]);

  const conDificultad = useMemo(() => tabla.filter((f) => f.dificultad).length, [tabla]);

  if (cargando) {
    return (
      <div className="contenidos-page">
        <div className="dash-analitica">
          <div className="dash-cargando" role="status" aria-live="polite">
            <span className="dash-cargando-punto" aria-hidden="true" />
            Cargando contenidos y actividades...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="contenidos-page">
        <div className="dash-analitica">
          <div className="dash-panel dash-panel-error">
            <h3><MdError /> No se pudieron cargar los contenidos</h3>
            <p className="dash-panel-sub">{error}</p>
            <button type="button" className="dash-enlace-boton" onClick={() => setIntento((n) => n + 1)}>
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!datos) return null;

  if (creadas.total === 0) {
    return (
      <div className="contenidos-page">
        <div className="dash-analitica">
          <Vacio>
            Todavía no has creado ningún contenido, juego o evaluación. Cuando
            publiques tus primeras actividades verás aquí cómo las usan tus estudiantes.
          </Vacio>
        </div>
      </div>
    );
  }

  const kpisTabla = [
    {
      clave: 'finalizacion', tono: 'exito', icono: MdCheckCircle,
      etiqueta: 'Finalización promedio',
      valor: kpis.finalizacion_promedio == null ? '—' : `${kpis.finalizacion_promedio}%`,
      sub: dona.total > 0 ? `de ${plural(dona.total, 'intento', 'intentos')} del período` : 'sin intentos en el período',
    },
    {
      clave: 'abandono', tono: 'aviso', icono: MdWarningAmber,
      etiqueta: 'Abandono promedio',
      valor: kpis.abandono_promedio == null ? '—' : `${kpis.abandono_promedio}%`,
      sub: dona.total > 0 ? `de ${plural(dona.total, 'intento', 'intentos')} del período` : 'sin intentos en el período',
    },
    {
      clave: 'tiempo', tono: 'info', icono: MdTimer,
      etiqueta: 'Tiempo medio',
      valor: segATexto(kpis.tiempo_medio_seg),
      sub: kpis.tiempo_medio_seg == null ? 'sin duraciones registradas' : `mediana de ${plural(kpis.tiempo_cobertura?.con_duracion ?? 0, 'intento', 'intentos')} con duración`,
    },
    {
      clave: 'dificultad', tono: 'acento', icono: MdInsights,
      etiqueta: 'Dificultad dominante',
      valor: null,
      dificultad: kpis.dificultad_dominante,
      sub: kpis.dificultad_dominante ? `en ${kpis.dificultad_dominante.actividades} de ${conDificultad} con acierto registrado` : 'ninguna actividad con acierto registrado',
    },
  ];

  const segmentos = dona.segmentos.map((s) => ({ ...s, fill: paleta.dona[s.clave] || '#94a3b8' }));
  const punto = (color) => <i className="dash-punto" style={{ background: color }} aria-hidden="true" />;

  return (
    <div className="contenidos-page">
      <div className="dash-analitica">
        <div className="dash-analitica-header">
          <h2><MdBook /> Contenidos y Actividades</h2>
          <p className="dash-analitica-nota">
            {grupoId
              ? 'Alcance: el grupo seleccionado en el filtro.'
              : `Alcance: ${plural(datos.alcance?.estudiantes ?? 0, 'estudiante', 'estudiantes')} · ${plural(dona.total, 'intento', 'intentos')} en el período.`}
          </p>
        </div>

        <div className="dash-kpi-grid">
          {kpisTabla.map((k) => (
            <div className="dash-kpi" key={k.clave}>
              <div className="dash-kpi-cabecera">
                <span className="dash-kpi-icon" data-tono={k.tono} aria-hidden="true"><k.icono /></span>
                <span className="dash-kpi-label">{k.etiqueta}</span>
              </div>
              <p className="dash-kpi-valor">
                {k.dificultad ? (
                  <span className="con-kpi-dificultad" style={{ color: paleta.dificultad[k.dificultad.clave] }}>
                    {k.dificultad.etiqueta}
                  </span>
                ) : k.valor}
              </p>
              <p className="dash-kpi-sub">{k.sub}</p>
            </div>
          ))}
        </div>

        <div className="con-grid-2">
          <Panel
            titulo="Estado global"
            icono={<MdCheckCircle />}
            sub="Todos los intentos del período, en completadas, en progreso o abandonadas."
            extra={<p className="dash-panel-meta">{plural(dona.total, 'intento', 'intentos')}</p>}
          >
            {dona.total === 0 ? (
              <Vacio>Aún no hay intentos en este período. Cuando los estudiantes abran estas actividades, el estado global empieza a llenarse.</Vacio>
            ) : (
              <div className="con-dona">
                <div className="con-dona-grafico">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={segmentos}
                        dataKey="cantidad"
                        name="Intentos"
                        innerRadius="62%"
                        outerRadius="86%"
                        paddingAngle={2}
                        cornerRadius={4}
                        startAngle={90}
                        endAngle={-270}
                      >
                        {segmentos.map((s) => (
                          <Cell key={s.clave} fill={s.fill} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip content={<TooltipTema formatter={(v) => plural(v, 'intento', 'intentos')} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="con-dona-centro">
                    <strong>{dona.total}</strong>
                    <span>intentos</span>
                  </div>
                </div>

                <ul className="dash-leyenda dash-leyenda-estatica con-dona-leyenda">
                  {segmentos.map((s) => (
                    <li key={s.clave}>
                      <span className="dash-leyenda-item">
                        {punto(s.fill)}
                        {s.etiqueta}
                      </span>
                      <span className="dash-leyenda-valor">
                        <strong>{s.cantidad}</strong> · {s.pct}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <Panel
            titulo="Creadas por ti"
            icono={<MdEditNote />}
            sub="Tus recursos publicados. Todo lo que ves en esta sección es de origen propio."
            extra={<p className="dash-panel-meta">{plural(creadas.publicadas, 'publicado', 'publicados')}</p>}
          >
            <p className="con-creadas-numero">
              {creadas.total}
              <span>actividades creadas</span>
            </p>
            <ul className="con-creadas-lista">
              {TIPOS.map((t) => {
                const porTipo = creadas.por_tipo?.[t.clave] ?? { total: 0, publicadas: 0 };
                return (
                  <li key={t.clave}>
                    <span>{t.etiqueta}</span>
                    <span className="con-creadas-cuenta">
                      <strong>{porTipo.total}</strong>
                      <span className="dash-tabla-sub">{plural(porTipo.publicadas, 'publicado', 'publicados')}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {creadas.borradores > 0 && (
              <p className="dash-panel-nota">
                {plural(creadas.borradores, 'actividad sigue', 'actividades siguen')} en borrador y no se cuentan en la tabla.
              </p>
            )}
          </Panel>
        </div>

        <Panel
          titulo="Detalle por actividad"
          icono={<MdBook />}
          sub="Cada fila es una de tus actividades publicadas. La dificultad sale del % de acierto de los intentos; el tiempo, de la mediana de los que registraron duración."
          extra={<p className="dash-panel-meta">{plural(tabla.length, 'actividad', 'actividades')}</p>}
        >
          <div className="con-tabla-controles">
            <div className="dash-segmentos" role="group" aria-label="Filtrar por tipo de actividad">
              <button type="button" className={tipoFiltro === 'todos' ? 'dash-segmento-activo' : ''} onClick={() => setTipoFiltro('todos')}>Todo</button>
              {TIPOS.map((t) => (
                <button key={t.clave} type="button" className={tipoFiltro === t.clave ? 'dash-segmento-activo' : ''} onClick={() => setTipoFiltro(t.clave)}>{t.etiqueta}</button>
              ))}
            </div>
          </div>

          {tablaFiltrada.length === 0 ? (
            <Vacio>No hay actividades de este tipo todavía.</Vacio>
          ) : (
            <div className="dash-tabla-envoltura">
              <table className="dash-tabla con-tabla">
                <thead>
                  <tr>
                    <th>
                      <button type="button" className={`con-orden ${orden.clave === 'titulo' ? 'con-orden-activo' : ''}`} onClick={() => cambiarOrden('titulo')}>
                        Actividad
                        {orden.clave === 'titulo' && (orden.dir === 'asc' ? <MdArrowUpward /> : <MdArrowDownward />)}
                      </button>
                    </th>
                    <th className="con-cab-sup">Tipo</th>
                    <th>
                      <button type="button" className={`con-orden ${orden.clave === 'finalizacion' ? 'con-orden-activo' : ''}`} onClick={() => cambiarOrden('finalizacion')}>
                        Finalización
                        {orden.clave === 'finalizacion' && (orden.dir === 'asc' ? <MdArrowUpward /> : <MdArrowDownward />)}
                      </button>
                    </th>
                    <th className="con-col-acierto">
                      <button type="button" className={`con-orden ${orden.clave === 'acierto' ? 'con-orden-activo' : ''}`} onClick={() => cambiarOrden('acierto')}>
                        % Acierto
                        {orden.clave === 'acierto' && (orden.dir === 'asc' ? <MdArrowUpward /> : <MdArrowDownward />)}
                      </button>
                    </th>
                    <th>
                      <div className="con-cab-dificultad">
                        <button type="button" className={`con-orden ${orden.clave === 'dificultad' ? 'con-orden-activo' : ''}`} onClick={() => cambiarOrden('dificultad')}>
                          Dificultad
                          {orden.clave === 'dificultad' && (orden.dir === 'asc' ? <MdArrowUpward /> : <MdArrowDownward />)}
                        </button>
                        <span className="con-i">
                          <button
                            type="button"
                            className="con-i-boton"
                            aria-label="Criterio de dificultad"
                            aria-expanded={criterioAbierto}
                            onClick={() => setCriterioAbierto((v) => !v)}
                          >
                            <MdInfoOutline />
                          </button>
                        </span>
                      </div>
                    </th>
                    
                    <th className="con-col-tiempo">
                      <button type="button" className={`con-orden ${orden.clave === 'tiempo_medio' ? 'con-orden-activo' : ''}`} onClick={() => cambiarOrden('tiempo_medio')}>
                        Tiempo promedio de finalización
                        {orden.clave === 'tiempo_medio' && (orden.dir === 'asc' ? <MdArrowUpward /> : <MdArrowDownward />)}
                      </button>
                    </th>
                    
                  </tr>
                </thead>
                <tbody>
                  {tablaOrdenada.map((f) => (
                    <tr key={`${f.tipo}:${f.actividad_id}`}>
                      <td data-label="Actividad">
                        <span className="con-titulo">{f.titulo}</span>
                        <div className="dash-tabla-sub">
                          {[f.modulo, `${plural(f.intentos, 'intento', 'intentos')}`].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td data-label="Tipo" className="con-cab-sup">
                        <span className="con-tipo">{TIPOS.find((t) => t.clave === f.tipo)?.etiqueta ?? f.tipo}</span>
                      </td>
                      <td data-label="Finalización" className="dash-tabla-num">
                        {numTexto(f.finalizacion)}{f.finalizacion != null && '%'}
                      </td>
                      <td data-label="% Acierto" className="dash-tabla-num con-col-acierto">
                        {f.acierto != null ? (
                          <div className="con-acierto">
                            <span className="con-acierto-pct">{f.acierto.toFixed(1)}%</span>
                            {f.acierto_bajo && (
                              <MdWarningAmber className="con-acierto-alto" aria-label="Acierto bajo" title={`Acierto bajo: ${f.acierto.toFixed(1)}% de ${f.intentos} intentos`} />
                            )}
                          </div>
                        ) : (
                          <span title={f.tipo === 'contenido' ? 'Esta actividad no tiene preguntas calificables' : 'Sin intentos en el período'}>—</span>
                        )}
                      </td>
                      
                      {/* CORRECCIÓN: Etiqueta "No aplica" con el mismo estilo de la leyenda */}
                      <td data-label="Dificultad">
                        <span className="con-dificultad-label-mobile">
                          Dificultad
                          <span className="con-i">
                            <button
                              type="button"
                              className="con-i-boton"
                              aria-label="Criterio de dificultad"
                              aria-expanded={criterioAbierto}
                              onClick={() => setCriterioAbierto((v) => !v)}
                            >
                              <MdInfoOutline />
                            </button>
                          </span>
                        </span>
                        {f.dificultad ? (
                          <span className="con-dif-chip" style={{ color: paleta.dificultad[f.dificultad.clave] }}>
                            {punto(paleta.dificultad[f.dificultad.clave])}
                            {f.dificultad.etiqueta}
                          </span>
                        ) : f.tipo === 'contenido' ? (
                          /* CAMBIO: Ahora usa las clases de la leyenda y el punto gris */
                          <span className="con-dif-chip con-dif-chip-mudo" title="Esta actividad no tiene preguntas calificables">
                            {punto('#94a3b8')}
                            No aplica
                          </span>
                        ) : (
                          <span className="dash-tabla-sub">Sin dato</span>
                        )}
                      </td>
                      
                      <td data-label="Tiempo promedio" className="dash-tabla-num con-col-tiempo">
                        {segATexto(f.tiempo_medio_seg)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="con-dif-leyenda" aria-label="Leyenda de dificultad">
            {cortes.map((c) => (
              <span key={c.clave} className="con-dif-chip" style={{ color: paleta.dificultad[c.clave] }}>
                {punto(paleta.dificultad[c.clave])}
                {c.etiqueta}
              </span>
            ))}
            <span className="con-dif-chip con-dif-chip-mudo">
              {punto('#94a3b8')}
              No aplica
            </span>
            <span className="con-dif-chip con-dif-chip-mudo">
              {punto('#cbd5e1')}
              Pocos datos
            </span>
          </div>
        </Panel>
      </div>

      {criterioAbierto && (
        <>
          <div className="con-i-backdrop" onClick={() => setCriterioAbierto(false)} />
          <div className="con-i-popover" role="dialog" aria-modal="true">
            <strong>Criterio de dificultad</strong>
            <p>Se deduce del % de acierto de quienes la hicieron (más acierto, más fácil):</p>
            <ul>
              {textoCriterioDificultad.map((linea) => <li key={linea}>{linea}</li>)}
            </ul>
            <p><strong>No aplica</strong>: Los contenidos creados no aplican (por ejemplo, lecciones, pdf o videos).</p>
            <p><strong>Pocos datos</strong>: la actividad tiene menos de 5 intentos calificados, por lo que no se puede determinar una dificultad fiable.</p>
            <p>Con el <strong>⚠</strong> se alertan las actividades cuyo % de acierto (columna <strong>% Acierto</strong>) queda por debajo del <strong>{umbralAcierto.bajo}%</strong>.</p>
            <button type="button" className="con-i-cerrar" onClick={() => setCriterioAbierto(false)}>
              Cerrar
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ContenidosAnalitica;