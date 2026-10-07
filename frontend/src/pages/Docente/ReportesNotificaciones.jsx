import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  MdNotifications,
  MdSchedule,
  MdHistory,
  MdDownload,
  MdSend,
  MdEdit,
  MdDelete,
  MdPause,
  MdPlayArrow,
  MdAdd,
  MdCheckCircle,
  MdOpenInNew,
} from 'react-icons/md';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import './ReportesNotificaciones.css';

/* ------------------------------------------------------------------ *
 *  Utilidades
 * ------------------------------------------------------------------ */

const hoyIso = () => {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

const formatearFecha = (valor) => {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatearMomento = (valor) => {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const nombreDesdeCabecera = (valor) => {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(valor || '');
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

const PERIODOS = [
  { semanas: 4, etiqueta: 'Últimas 4 semanas' },
  { semanas: 8, etiqueta: 'Últimas 8 semanas' },
  { semanas: 12, etiqueta: 'Últimas 12 semanas' },
  { semanas: 26, etiqueta: 'Último semestre' },
];

const DISPARADORES = {
  programado: 'Programado',
  manual: 'Envío manual',
  login: 'Al iniciar sesión',
};

const ESTADOS = {
  pendiente: 'Pendiente',
  generado: 'Generado',
  enviado: 'Enviado',
  error: 'Error',
};

const formVacio = (grupoId = null) => ({
  nombre: '',
  frecuencia_meses: 1,
  fecha_inicio: hoyIso(),
  formato: 'pdf',
  secciones: [],
  grupo_id: grupoId,
  activo: true,
  incluir_nombres: false,
});

const ReportesNotificaciones = () => {
  const [searchParams] = useSearchParams();
  const { emit } = useAuth();

  const grupoGlobal = searchParams.get('grupoId') ? Number(searchParams.get('grupoId')) : null;
  const semanas = Number(searchParams.get('semanas')) || 8;
  const etiquetaPeriodo = (PERIODOS.find((p) => p.semanas === semanas) || PERIODOS[1]).etiqueta;

  const [vista, setVista] = useState('configuracion');
  const [catalogo, setCatalogo] = useState({ secciones: [], frecuencias: [1, 2, 3] });
  const [grupos, setGrupos] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  const [form, setForm] = useState(() => formVacio(grupoGlobal));
  const [editandoId, setEditandoId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [ocupadoId, setOcupadoId] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  /* ---------- Cargas ---------- */

  const cargarSchedules = useCallback(async () => {
    const res = await api.get('/teacher/report-schedules');
    setSchedules(Array.isArray(res.data?.data) ? res.data.data : []);
  }, []);

  const cargarHistorial = useCallback(async () => {
    const res = await api.get('/teacher/report-runs', { params: { limite: 50 } });
    setHistorial(Array.isArray(res.data?.data) ? res.data.data : []);
  }, []);

  const cargarNotificaciones = useCallback(async () => {
    const res = await api.get('/teacher/notifications', { params: { tipo: 'reporte' } });
    setNotificaciones(Array.isArray(res.data?.data) ? res.data.data : []);
  }, []);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    Promise.all([
      api.get('/teacher/report-schedules/catalog').then((r) => {
        if (!vivo) return;
        setCatalogo({
          secciones: Array.isArray(r.data?.data?.secciones) ? r.data.data.secciones : [],
          frecuencias: Array.isArray(r.data?.data?.frecuencias) ? r.data.data.frecuencias : [1, 2, 3],
        });
        setForm((prev) =>
          prev.secciones.length === 0 && Array.isArray(r.data?.data?.secciones)
            ? { ...prev, secciones: r.data.data.secciones.map((s) => s.clave) }
            : prev
        );
      }),
      api.get('/teacher/grupos').then((r) => {
        const raw = r.data?.data;
        if (vivo) setGrupos(Array.isArray(raw) ? raw : (raw?.grupos || []));
      }),
      cargarSchedules(),
      cargarHistorial(),
      cargarNotificaciones(),
    ])
      .catch((err) => {
        if (!vivo) return;
        console.error('No se pudo cargar la sección de reportes:', err);
        setError(err.response?.data?.message || 'No se pudo cargar la información de reportes.');
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });

    return () => {
      vivo = false;
    };
  }, [cargarSchedules, cargarHistorial, cargarNotificaciones]);

  useEffect(() => {
    setForm((prev) => (editandoId ? prev : { ...prev, grupo_id: grupoGlobal }));
  }, [grupoGlobal, editandoId]);

  /* ---------- Derivados ---------- */

  const ultimoPorSchedule = useMemo(() => {
    const mapa = new Map();
    for (const run of historial) {
      if (!run.descargable || !run.schedule_id) continue;
      if (!mapa.has(run.schedule_id)) mapa.set(run.schedule_id, run);
    }
    return mapa;
  }, [historial]);

  /* ---------- Handlers ---------- */

  const alternarSeccion = (clave) => {
    setForm((prev) => ({
      ...prev,
      secciones: prev.secciones.includes(clave)
        ? prev.secciones.filter((s) => s !== clave)
        : [...prev.secciones, clave],
    }));
  };

  const editar = (s) => {
    setEditandoId(s.id);
    setForm({
      nombre: s.nombre,
      frecuencia_meses: s.frecuencia_meses,
      fecha_inicio: String(s.fecha_inicio || '').slice(0, 10) || hoyIso(),
      formato: s.formato === 'csv' ? 'csv' : 'pdf',
      secciones: Array.isArray(s.secciones) ? s.secciones : [],
      grupo_id: s.grupo_id ?? null,
      activo: Boolean(s.activo),
      incluir_nombres: Boolean(s.incluir_nombres),
    });
    setError('');
    setAviso('');
    setVista('configuracion');
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setForm(formVacio(grupoGlobal));
    setError('');
  };

  const guardar = async (event) => {
    event.preventDefault();
    setError('');
    setAviso('');

    if (!form.nombre.trim()) {
      setError('Ponle un nombre al reporte.');
      return;
    }
    if (form.secciones.length === 0) {
      setError('Selecciona al menos una sección.');
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        frecuenciaMeses: Number(form.frecuencia_meses),
        fechaInicio: form.fecha_inicio,
        formato: form.formato,
        secciones: form.secciones,
        grupoId: form.grupo_id,
        activo: Boolean(form.activo),
        incluirNombres: Boolean(form.incluir_nombres),
      };
      await (editandoId
        ? api.put(`/teacher/report-schedules/${editandoId}`, payload)
        : api.post('/teacher/report-schedules', payload));

      setEditandoId(null);
      setForm(formVacio(grupoGlobal));
      setAviso(editandoId ? 'Reporte actualizado.' : 'Reporte programado.');
      await Promise.all([cargarSchedules(), cargarHistorial()]);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar el reporte programado.');
    } finally {
      setGuardando(false);
    }
  };

  const alternarActivo = async (s) => {
    setError('');
    setAviso('');
    setOcupadoId(s.id);
    try {
      await api.put(`/teacher/report-schedules/${s.id}`, {
        nombre: s.nombre,
        frecuenciaMeses: s.frecuencia_meses,
        fechaInicio: String(s.fecha_inicio || '').slice(0, 10),
        formato: s.formato,
        secciones: s.secciones,
        grupoId: s.grupo_id,
        activo: !s.activo,
        incluirNombres: Boolean(s.incluir_nombres),
      });
      setAviso(s.activo ? 'Reporte pausado.' : 'Reporte reactivado.');
      await cargarSchedules();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cambiar el estado del reporte.');
    } finally {
      setOcupadoId(null);
    }
  };

  const eliminar = async (s) => {
    if (!window.confirm(`¿Eliminar el reporte programado "${s.nombre}"?`)) return;
    setError('');
    setAviso('');
    setOcupadoId(s.id);
    try {
      await api.delete(`/teacher/report-schedules/${s.id}`);
      if (editandoId === s.id) cancelarEdicion();
      setAviso('Reporte programado eliminado.');
      await cargarSchedules();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo eliminar el reporte programado.');
    } finally {
      setOcupadoId(null);
    }
  };

  const enviarAhora = async (s) => {
    setError('');
    setAviso('');
    setOcupadoId(s.id);
    try {
      await api.post(`/teacher/report-schedules/${s.id}/enviar`, null, {
        params: { semanas },
      });
      setAviso(`Reporte generado con los datos de ${etiquetaPeriodo.toLowerCase()}. Ya está en el historial.`);
      await Promise.all([cargarHistorial(), cargarNotificaciones(), cargarSchedules()]);
      emit('notificaciones');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo generar el reporte.');
    } finally {
      setOcupadoId(null);
    }
  };

  const descargar = async (run, formatoPedido) => {
    const formato = formatoPedido || run.formato || 'pdf';
    setError('');
    setOcupadoId(run.id);
    try {
      const res = await api.get(`/teacher/report-runs/${run.id}/descargar`, {
        params: { formato },
        responseType: 'blob',
      });
      const nombre =
        nombreDesdeCabecera(res.headers?.['content-disposition'])
        || `reporte-${run.id}.${formato}`;
      const url = URL.createObjectURL(res.data);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      let mensaje = 'No se pudo descargar el reporte.';
      if (err.response?.data instanceof Blob) {
        try {
          const texto = await err.response.data.text();
          const parseado = JSON.parse(texto);
          if (parseado?.message) mensaje = parseado.message;
        } catch {
          // si no es JSON legible se queda el mensaje genérico
        }
      } else if (err.response?.data?.message) {
        mensaje = err.response.data.message;
      }
      setError(mensaje);
    } finally {
      setOcupadoId(null);
    }
  };

  const marcarLeida = async (notificacion) => {
    if (notificacion.leido) return;
    try {
      await api.post(`/teacher/notifications/${notificacion.id}/leer`);
      setNotificaciones((prev) =>
        prev.map((n) => (n.id === notificacion.id ? { ...n, leido: true } : n))
      );
      emit('notificaciones');
    } catch (err) {
      console.error('No se pudo marcar la notificación como leída:', err);
    }
  };

  const marcarTodasLeidas = async () => {
    try {
      await api.post('/teacher/notifications/leer-todas');
      setNotificaciones((prev) => prev.map((n) => ({ ...n, leido: true })));
      emit('notificaciones');
    } catch (err) {
      setError('No se pudieron marcar las notificaciones como leídas.');
    }
  };

  /* ---------- Vista ---------- */

  if (cargando) {
    return (
      <div className="reportes-page">
        <div className="dash-cargando">
          <span className="dash-cargando-punto" /> Cargando reportes programados...
        </div>
      </div>
    );
  }

  const noLeidas = notificaciones.filter((n) => !n.leido).length;

  return (
    <div className="reportes-page">
      <div className="dash-analitica">
        <div className="dash-analitica-header">
          <h2>
            <MdSchedule /> Reportes programados
          </h2>
          <p className="dash-analitica-nota">
            Los reportes salen con los datos del grupo y del período que elige la barra de
            filtros. El archivo se arma al descargarlo, desde la misma información que se
            generó en su momento.
          </p>
        </div>

        <div className="rep-segmentos" role="tablist">
          {[
            { clave: 'configuracion', etiqueta: 'Configuración', icono: <MdSchedule /> },
            { clave: 'historial', etiqueta: 'Historial', icono: <MdHistory /> },
            {
              clave: 'notificaciones',
              etiqueta: 'Notificaciones',
              icono: <MdNotifications />,
              extra: noLeidas > 0 ? <span className="rep-globo">{noLeidas}</span> : null,
            },
          ].map((pestana) => (
            <button
              key={pestana.clave}
              type="button"
              role="tab"
              aria-selected={vista === pestana.clave}
              className={vista === pestana.clave ? 'dash-segmento-activo' : ''}
              onClick={() => setVista(pestana.clave)}
            >
              {pestana.icono} {pestana.etiqueta}
              {pestana.extra}
            </button>
          ))}
        </div>

        {error && <div className="rep-alerta rep-alerta-error">{error}</div>}
        {aviso && (
          <div className="rep-alerta rep-alerta-ok">
            <MdCheckCircle /> {aviso}
          </div>
        )}

        {/* ---------- CONFIGURACIÓN ---------- */}
        {vista === 'configuracion' && (
          <>
            <section className="dash-panel">
              <h3>
                {editandoId ? <MdEdit /> : <MdAdd />}
                {editandoId ? 'Editar reporte programado' : 'Nuevo reporte programado'}
              </h3>
              <p className="dash-panel-sub">
                {editandoId
                  ? 'Cambiar la frecuencia o la fecha recalcula el próximo envío; cambiar solo el formato no lo mueve.'
                  : `El primer envío sale en la fecha que elijas y luego se repite cada ${
                      form.frecuencia_meses === 1 ? 'mes' : `${form.frecuencia_meses} meses`
                    }.`}
              </p>

              <form className="rep-form" onSubmit={guardar}>
                <div className="rep-form-fila">
                  <label className="rep-campo">
                    <span className="rep-campo-label">Nombre</span>
                    <input
                      type="text"
                      value={form.nombre}
                      maxLength={120}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      placeholder="Ej: Reporte mensual del grupo 5A"
                      required
                    />
                  </label>

                  <label className="rep-campo">
                    <span className="rep-campo-label">Frecuencia</span>
                    <select
                      value={form.frecuencia_meses}
                      onChange={(e) =>
                        setForm({ ...form, frecuencia_meses: Number(e.target.value) })
                      }
                    >
                      {catalogo.frecuencias.map((f) => (
                        <option key={f} value={f}>
                          {f === 1 ? 'Cada mes' : `Cada ${f} meses`}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="rep-form-fila">
                  <label className="rep-campo">
                    <span className="rep-campo-label">Fecha de inicio</span>
                    <input
                      type="date"
                      value={form.fecha_inicio}
                      onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                      required
                    />
                  </label>

                  <label className="rep-campo">
                    <span className="rep-campo-label">Formato</span>
                    <select
                      value={form.formato}
                      onChange={(e) => setForm({ ...form, formato: e.target.value })}
                    >
                      <option value="pdf">PDF</option>
                      <option value="csv">CSV</option>
                    </select>
                  </label>

                  <label className="rep-campo">
                    <span className="rep-campo-label">Grupo</span>
                    <select
                      value={form.grupo_id ?? ''}
                      onChange={(e) =>
                        setForm({ ...form, grupo_id: e.target.value ? Number(e.target.value) : null })
                      }
                    >
                      <option value="">Todos mis grupos</option>
                      {grupos.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="rep-campo">
                  <span className="rep-campo-label">Secciones incluidas</span>
                  <div className="rep-secciones">
                    {catalogo.secciones.map((s) => (
                      <label key={s.clave} className="rep-seccion">
                        <input
                          type="checkbox"
                          checked={form.secciones.includes(s.clave)}
                          onChange={() => alternarSeccion(s.clave)}
                        />
                        <span>{s.etiqueta}</span>
                      </label>
                    ))}
                  </div>
                  <p className="rep-ayuda">
                    Las secciones son las mismas que muestra Analítica: cada una trae sus
                    tablas, no un resumen de otra.
                  </p>

                  <label className="rep-interruptor">
                    <input
                      type="checkbox"
                      checked={Boolean(form.incluir_nombres)}
                      onChange={(e) => setForm({ ...form, incluir_nombres: e.target.checked })}
                    />
                    <span>
                      <strong>Incluir nombres completos</strong>
                      <small>
                        {form.incluir_nombres
                          ? 'El reporte mostrará el nombre completo de los estudiantes.'
                          : 'El reporte mostrará alias como "Ana R." (recomendado).'}
                      </small>
                    </span>
                  </label>
                </div>

                <label className="rep-interruptor">
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                  />
                  <span>
                    <strong>{form.activo ? 'Activo' : 'Pausado'}</strong>
                    <small>
                      {form.activo
                        ? 'Se genera solo en cada fecha programada.'
                        : 'No se genera nada hasta reactivarlo. La configuración se conserva.'}
                    </small>
                  </span>
                </label>

                <div className="rep-form-acciones">
                  <button type="submit" className="rep-btn rep-btn-primario" disabled={guardando}>
                    {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Programar reporte'}
                  </button>
                  {editandoId && (
                    <button type="button" className="rep-btn" onClick={cancelarEdicion}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="dash-panel">
              <div className="dash-panel-cabecera">
                <div>
                  <h3>
                    <MdSchedule /> Reportes configurados
                  </h3>
                  <p className="dash-panel-sub">
                    {schedules.length === 0
                      ? 'Todavía no hay reportes programados.'
                      : `${schedules.length} reporte(s) configurado(s).`}
                  </p>
                </div>
              </div>

              {schedules.length === 0 ? (
                <div className="dash-vacio">
                  Todavía no hay ningún reporte programado. Crea el primero con el formulario
                  de arriba: el archivo se generará solo en su primera fecha y después en cada
                  periodo.
                </div>
              ) : (
                <div className="dash-tabla-envoltura">
                  <table className="dash-tabla rep-tabla">
                    <thead>
                      <tr>
                        <th>Reporte</th>
                        <th>Frecuencia</th>
                        <th>Próximo envío</th>
                        <th>Formato</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedules.map((s) => {
                        const ultimo = ultimoPorSchedule.get(s.id);
                        const ocupado = ocupadoId === s.id;
                        return (
                          <tr key={s.id}>
                            <td>
                              <span className="dash-tabla-alias" title={s.nombre}>
                                {s.nombre}
                              </span>
                              <span className="dash-tabla-sub">
                                {s.grupo_nombre || 'Todos los grupos'} ·{' '}
                                {(s.secciones || [])
                                  .map((c) => catalogo.secciones.find((x) => x.clave === c)?.etiqueta || c)
                                  .join(', ') || 'Sin secciones'}
                              </span>
                            </td>
                            <td>
                              {s.frecuencia_meses === 1
                                ? 'Cada mes'
                                : `Cada ${s.frecuencia_meses} meses`}
                              {s.ultima_ejecucion && (
                                <span className="dash-tabla-sub">
                                  Último: {formatearFecha(s.ultima_ejecucion)}
                                </span>
                              )}
                            </td>
                            <td>
                              {s.activo && s.proxima_ejecucion ? (
                                formatearMomento(s.proxima_ejecucion)
                              ) : (
                                <span className="rep-pausa">—</span>
                              )}
                            </td>
                            <td>{(s.formato || 'pdf').toUpperCase()}</td>
                            <td>
                              <span className="rep-estado" data-estado={s.activo ? 'ok' : 'off'}>
                                {s.activo ? 'Activo' : 'Pausado'}
                              </span>
                            </td>
                            <td>
                              <div className="rep-acciones">
                                <button
                                  type="button"
                                  className="rep-btn rep-btn-chico"
                                  onClick={() => enviarAhora(s)}
                                  disabled={ocupado}
                                  title={`Generar ahora con los datos de ${etiquetaPeriodo.toLowerCase()}`}
                                >
                                  <MdSend /> Enviar ahora
                                </button>
                                <button
                                  type="button"
                                  className="rep-btn rep-btn-chico"
                                  onClick={() => descargar(ultimo, ultimo.formato)}
                                  disabled={ocupado || !ultimo}
                                  title={
                                    ultimo
                                      ? `Descargar el último reporte generado (${formatearFecha(ultimo.creado_en)})`
                                      : 'Todavía no hay un reporte generado: se genera con "Enviar ahora"'
                                  }
                                >
                                  <MdDownload /> Exportar
                                </button>
                                <button
                                  type="button"
                                  className="rep-btn rep-btn-chico"
                                  onClick={() => alternarActivo(s)}
                                  disabled={ocupado}
                                >
                                  {s.activo ? <MdPause /> : <MdPlayArrow />}
                                  {s.activo ? 'Pausar' : 'Activar'}
                                </button>
                                <button
                                  type="button"
                                  className="rep-btn rep-btn-chico"
                                  onClick={() => editar(s)}
                                  disabled={ocupado}
                                >
                                  <MdEdit /> Editar
                                </button>
                                <button
                                  type="button"
                                  className="rep-btn rep-btn-chico rep-btn-peligro"
                                  onClick={() => eliminar(s)}
                                  disabled={ocupado}
                                >
                                  <MdDelete /> Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {/* ---------- HISTORIAL ---------- */}
        {vista === 'historial' && (
          <section className="dash-panel">
            <div className="dash-panel-cabecera">
              <div>
                <h3>
                  <MdHistory /> Historial de reportes
                </h3>
                <p className="dash-panel-sub">
                  Cada fila guarda los datos tal como se generaron: si el grupo cambia después,
                  el reporte descargado sigue siendo el de su fecha.
                </p>
              </div>
            </div>

            {historial.length === 0 ? (
              <div className="dash-vacio">
                Todavía no se ha generado ningún reporte. Cuando uno se envíe, programada o
                manualmente, aparecerá aquí con su estado y su descarga.
              </div>
            ) : (
              <div className="dash-tabla-envoltura">
                <table className="dash-tabla rep-tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Reporte</th>
                      <th>Origen</th>
                      <th>Período</th>
                      <th>Formato</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map((run) => {
                      const formato = String(run.formato || 'pdf').toUpperCase();
                      return (
                        <tr key={run.id}>
                          <td className="rep-celda-fecha">
                            {formatearMomento(run.generado_en || run.creado_en)}
                          </td>
                          <td className="rep-celda-reporte">
                            <span
                              className="dash-tabla-alias"
                              title={run.schedule_nombre || 'Reporte eliminado'}
                            >
                              {run.schedule_nombre || 'Reporte eliminado'}
                            </span>
                            <span className="dash-tabla-sub">
                              {run.grupo_nombre || 'Todos los grupos'}
                            </span>
                          </td>
                          <td>{DISPARADORES[run.disparador] || run.disparador}</td>
                          <td className="rep-celda-periodo">
                            {run.periodo_desde
                              ? `${formatearFecha(run.periodo_desde)} – ${formatearFecha(run.periodo_hasta)}`
                              : '—'}
                          </td>
                          <td>
                            <span className="rep-chip-formato">{formato}</span>
                          </td>
                          <td>
                            <span className="rep-estado" data-estado={run.estado === 'error' ? 'mal' : 'ok'}>
                              {ESTADOS[run.estado] || run.estado}
                            </span>
                            {run.error_mensaje && (
                              <span className="dash-tabla-sub rep-error-detalle">
                                {run.error_mensaje}
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="rep-acciones">
                              {run.descargable ? (
                                <button
                                  type="button"
                                  className="rep-btn rep-btn-chico rep-btn-descarga"
                                  onClick={() => descargar(run)}
                                  disabled={ocupadoId === run.id}
                                  title={`Descargar reporte en ${formato}`}
                                >
                                  <MdDownload /> {formato}
                                </button>
                              ) : (
                                <span className="dash-tabla-sub">Sin archivo</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ---------- NOTIFICACIONES ---------- */}
        {vista === 'notificaciones' && (
          <section className="dash-panel">
            <div className="dash-panel-cabecera">
              <div>
                <h3>
                  <MdNotifications /> Notificaciones de reportes
                </h3>
                <p className="dash-panel-sub">
                  Solo lo relacionado con reportes. La campana de la barra superior muestra
                  todo lo que tengas pendiente, marcado y sin marcar.
                </p>
              </div>
              <div className="rep-cabecera-acciones">
                {noLeidas > 0 && (
                  <button type="button" className="rep-btn rep-btn-chico" onClick={marcarTodasLeidas}>
                    <MdCheckCircle /> Marcar leídas
                  </button>
                )}
                <Link to="/docente/notificaciones" className="rep-btn rep-btn-chico">
                  <MdOpenInNew /> Ver todas
                </Link>
              </div>
            </div>

            {notificaciones.length === 0 ? (
              <div className="dash-vacio">
                No hay notificaciones de reportes. Aparecerán aquí y en la campana cada vez
                que se genere un reporte, programado o manual.
              </div>
            ) : (
              <ul className="rep-notificaciones">
                {notificaciones.map((n) => {
                  const run = n.data?.run_id
                    ? historial.find((r) => r.id === n.data.run_id)
                    : null;
                  const grupo = run?.grupo_nombre || n.data?.grupo_nombre || null;
                  const formato = String(run?.formato || n.data?.formato || 'pdf').toUpperCase();
                  return (
                    <li key={n.id} className={n.leido ? '' : 'rep-notif-sin-leer'}>
                      <button type="button" className="rep-notif" onClick={() => marcarLeida(n)}>
                        <span className="rep-notif-cabecera">
                          <span className="rep-notif-titulo">{n.titulo}</span>
                          {grupo && (
                            <span
                              className="rep-notif-chip rep-notif-chip-grupo"
                              title="Grupo del reporte"
                            >
                              {grupo}
                            </span>
                          )}
                          {run?.descargable && (
                            <span
                              className="rep-notif-chip rep-notif-chip-formato"
                              title="Formato del archivo"
                            >
                              {formato}
                            </span>
                          )}
                        </span>
                        {n.mensaje && <span className="rep-notif-mensaje">{n.mensaje}</span>}
                        <span className="rep-notif-fecha">{formatearMomento(n.creado_en)}</span>
                      </button>
                      {run && run.descargable && (
                        <button
                          type="button"
                          className="rep-btn rep-btn-chico rep-btn-descarga"
                          onClick={() => descargar(run)}
                          disabled={ocupadoId === run.id}
                          title={`Descargar reporte en ${formato}`}
                        >
                          <MdDownload /> {formato}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default ReportesNotificaciones;