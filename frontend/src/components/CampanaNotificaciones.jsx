import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdNotificationsActive, MdCheckCircle, MdOpenInNew } from 'react-icons/md';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import './CampanaNotificaciones.css';

const MAX_VISIBLES = 6;

const formatearMomento = (valor) => {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Campana global de notificaciones.
 *
 * Es el centro de avisos del docente: aparece en la barra de navegación y en
 * la del panel, y el contador sale de `AuthContext` para que las dos copias
 * muestren el mismo número sin pedirlo dos veces.
 *
 * El desplegable solo se abre bajo demanda: la lista se pide cuando se abre la
 * primera vez y se refresca sola cada minuto, porque un reporte que se genera
 * solo no dispara ningún evento de la interfaz.
 */
const CampanaNotificaciones = () => {
  const { notificationCount, setNotificationCount, on } = useAuth();
  const navigate = useNavigate();

  const [abierto, setAbierto] = useState(false);
  const [notificaciones, setNotificaciones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const contenedorRef = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const res = await api.get('/teacher/notifications', { params: { limite: 10 } });
      const lista = Array.isArray(res.data?.data) ? res.data.data : [];
      setNotificaciones(lista);
      if (res.data?.conteo) setNotificationCount(res.data.conteo);
      setError('');
    } catch (err) {
      console.warn('[Campana] No se pudieron cargar las notificaciones:', err);
      setError('No se pudieron cargar las notificaciones');
    }
  }, [setNotificationCount]);

  const cargarContador = useCallback(async () => {
    try {
      const res = await api.get('/teacher/notifications/count');
      setNotificationCount(res.data?.data || { total: 0, no_leidas: 0 });
    } catch (err) {
      console.warn('[Campana] No se pudo refrescar el contador:', err);
    }
  }, [setNotificationCount]);

  useEffect(() => {
    cargarContador();
    const t = setInterval(cargarContador, 60000);
    return () => clearInterval(t);
  }, [cargarContador]);

  // Cuando algo genera una notificación desde dentro de la app (por ejemplo
  // "Enviar ahora" en Reportes), el evento recarga el contador sin esperar al
  // siguiente minuto.
  useEffect(() => on('notificaciones', cargarContador), [on, cargarContador]);

  useEffect(() => {
    if (abierto) cargar();
  }, [abierto, cargar]);

  // Clic fuera del desplegable lo cierra, y Escape también.
  useEffect(() => {
    if (!abierto) return undefined;
    const alClicFuera = (event) => {
      if (contenedorRef.current && !contenedorRef.current.contains(event.target)) {
        setAbierto(false);
      }
    };
    const alEscape = (event) => {
      if (event.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', alClicFuera);
    document.addEventListener('keydown', alEscape);
    return () => {
      document.removeEventListener('mousedown', alClicFuera);
      document.removeEventListener('keydown', alEscape);
    };
  }, [abierto]);

  const marcarLeida = async (notificacion) => {
    if (notificacion.leido) return;
    try {
      await api.post(`/teacher/notifications/${notificacion.id}/leer`);
      setNotificaciones((prev) =>
        prev.map((n) => (n.id === notificacion.id ? { ...n, leido: true } : n))
      );
      cargarContador();
    } catch (err) {
      console.warn('[Campana] No se pudo marcar como leída:', err);
    }
  };

  const marcarTodas = async () => {
    try {
      await api.post('/teacher/notifications/leer-todas');
      setNotificaciones((prev) => prev.map((n) => ({ ...n, leido: true })));
      setNotificationCount((prev) => ({
        total: prev?.total || 0,
        no_leidas: 0,
      }));
    } catch (err) {
      console.warn('[Campana] No se pudieron marcar como leídas:', err);
    }
  };

  const noLeidas = notificationCount?.no_leidas || 0;
  const haySinMarcar = notificaciones.some((n) => !n.leido);

  return (
    <div className="campana" ref={contenedorRef}>
      <button
        type="button"
        className="campana-btn"
        onClick={() => setAbierto((v) => !v)}
        aria-label={`Notificaciones${noLeidas ? `: ${noLeidas} sin leer` : ''}`}
        aria-expanded={abierto}
      >
        <MdNotificationsActive />
        {noLeidas > 0 && <span className="campana-globo">{noLeidas > 99 ? '99+' : noLeidas}</span>}
      </button>

      {abierto && (
        <div className="campana-panel" role="dialog" aria-label="Notificaciones">
          <div className="campana-cabecera">
            <strong>Notificaciones</strong>
            {haySinMarcar && (
              <button type="button" className="campana-accion" onClick={marcarTodas}>
                <MdCheckCircle /> Marcar leídas
              </button>
            )}
          </div>

          {cargando && notificaciones.length === 0 ? (
            <p className="campana-vacio">Cargando...</p>
          ) : error ? (
            <p className="campana-vacio campana-error">{error}</p>
          ) : notificaciones.length === 0 ? (
            <p className="campana-vacio">No tienes notificaciones.</p>
          ) : (
            <ul className="campana-lista">
              {notificaciones.slice(0, MAX_VISIBLES).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`campana-item ${n.leido ? '' : 'campana-item-nueva'}`}
                    onClick={() => marcarLeida(n)}
                  >
                    <span className="campana-item-titulo">{n.titulo}</span>
                    {n.mensaje && <span className="campana-item-mensaje">{n.mensaje}</span>}
                    <span className="campana-item-fecha">{formatearMomento(n.creado_en)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="campana-pie"
            onClick={() => {
              setAbierto(false);
              navigate('/docente/notificaciones');
            }}
          >
            <MdOpenInNew /> Ver todas
          </button>
        </div>
      )}
    </div>
  );
};

export default CampanaNotificaciones;