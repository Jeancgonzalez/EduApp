import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MdNotificationsActive,
  MdCheckCircle,
  MdDownload,
  MdArrowBack,
} from 'react-icons/md';
import api from '../../services/api';
import './Notificaciones.css';

const TIPOS = {
  reporte: 'Reportes',
  info: 'Información',
  exito: 'Éxito',
  aviso: 'Aviso',
};

const formatearMomento = (valor) => {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
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

const Notificaciones = () => {
  const navigate = useNavigate();

  const [notificaciones, setNotificaciones] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ocupadoId, setOcupadoId] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [lista, reporte] = await Promise.all([
        api.get('/teacher/notifications', { params: { limite: 60 } }),
        api.get('/teacher/report-runs', { params: { limite: 50 } }),
      ]);
      setNotificaciones(Array.isArray(lista.data?.data) ? lista.data.data : []);
      setHistorial(Array.isArray(reporte.data?.data) ? reporte.data.data : []);
      setError('');
    } catch (err) {
      console.error('No se pudieron cargar las notificaciones:', err);
      setError('No se pudieron cargar las notificaciones.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const marcarLeida = async (notificacion) => {
    if (notificacion.leido) return;
    try {
      await api.post(`/teacher/notifications/${notificacion.id}/leer`);
      setNotificaciones((prev) =>
        prev.map((n) => (n.id === notificacion.id ? { ...n, leido: true } : n))
      );
    } catch (err) {
      console.warn('No se pudo marcar la notificación como leída:', err);
    }
  };

  const marcarTodas = async () => {
    try {
      await api.post('/teacher/notifications/leer-todas');
      setNotificaciones((prev) => prev.map((n) => ({ ...n, leido: true })));
    } catch (err) {
      setError('No se pudieron marcar las notificaciones como leídas.');
    }
  };

  const descargar = async (run) => {
    setOcupadoId(run.id);
    try {
      const res = await api.get(`/teacher/report-runs/${run.id}/descargar`, {
        params: { formato: run.formato || 'pdf' },
        responseType: 'blob',
      });
      const nombre =
        nombreDesdeCabecera(res.headers?.['content-disposition'])
        || `reporte-${run.id}.${run.formato || 'pdf'}`;
      const url = URL.createObjectURL(res.data);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('No se pudo descargar el reporte.');
    } finally {
      setOcupadoId(null);
    }
  };

  const noLeidas = notificaciones.filter((n) => !n.leido).length;

  return (
    <div className="notif-page cartoon-area">
      <div className="notif-page-inner">
        <button type="button" className="notif-volver" onClick={() => navigate(-1)}>
          <MdArrowBack /> Volver
        </button>

        <header className="notif-cabecera">
          <h1>
            <MdNotificationsActive /> Notificaciones
          </h1>
          <div className="notif-cabecera-acciones">
            {noLeidas > 0 && (
              <button type="button" className="notif-btn" onClick={marcarTodas}>
                <MdCheckCircle /> Marcar leídas ({noLeidas})
              </button>
            )}
          </div>
        </header>

        {error && <div className="notif-error">{error}</div>}

        {cargando ? (
          <div className="dash-cargando">
            <span className="dash-cargando-punto" /> Cargando notificaciones...
          </div>
        ) : notificaciones.length === 0 ? (
          <div className="dash-vacio">
            No tienes notificaciones. Cuando se genere un reporte, te aparecerá aquí y
            con el contador en la campana.
          </div>
        ) : (
          <ul className="notif-lista">
            {notificaciones.map((n) => {
              const run = n.data?.run_id
                ? historial.find((r) => r.id === n.data.run_id)
                : null;
              const grupo = run?.grupo_nombre || n.data?.grupo_nombre || null;
              const formato = String(run?.formato || n.data?.formato || 'pdf').toUpperCase();
              return (
                <li key={n.id} className={n.leido ? '' : 'notif-sin-leer'}>
                  <button type="button" className="notif-item" onClick={() => marcarLeida(n)}>
                    <span className="notif-item-cabecera">
                      <span className="notif-tipo" data-tipo={n.tipo}>
                        {TIPOS[n.tipo] || n.tipo}
                      </span>
                      {grupo && (
                        <span className="notif-grupo" title="Grupo del reporte">
                          {grupo}
                        </span>
                      )}
                      <span className="notif-fecha">{formatearMomento(n.creado_en)}</span>
                    </span>
                    <span className="notif-titulo">{n.titulo}</span>
                    {n.mensaje && <span className="notif-mensaje">{n.mensaje}</span>}
                  </button>
                  {run && run.descargable && (
                    <button
                      type="button"
                      className="notif-btn notif-btn-descarga"
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
      </div>
    </div>
  );
};

export default Notificaciones;