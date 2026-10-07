import api from './api';

// Cliente de telemetría del estudiante (Fase 2b del dashboard del docente).
//
// Regla de oro: NINGUNA de estas llamadas puede romper la navegación del
// estudiante. Si el backend devuelve error o no hay conexión, la promesa se
// resuelve con un valor neutro (`null` / `0`) en lugar de rechazar, porque un 500
// en telemetría no puede impedir que un estudiante responda una evaluación.
//
// La duración no se calcula aquí: el backend la obtiene restando la apertura del
// intento (o el último heartbeat de sesión) contra el cierre, de modo que el
// reloj del cliente no altera la métrica.

const TOTAL = '/api';

/**
 * Abre un intento de telemetría para una actividad.
 *
 * @param {'contenido'|'juego'|'evaluacion'} tipo
 * @param {number|string} actividadId
 * @returns {Promise<number|null>} `intento_id` para enviarlo junto al resolver,
 *   o `null` si la telemetría no está disponible.
 */
export const iniciarActividad = async (tipo, actividadId) => {
  const id = Number(actividadId);
  if (!Number.isInteger(id) || id <= 0) return null;

  try {
    const res = await api.post(`${TOTAL}/student/actividad/${tipo}/${id}/iniciar`);
    return res.data?.data?.intento_id ?? null;
  } catch (error) {
    console.warn(`[telemetría] No se pudo iniciar el intento de ${tipo} ${id}:`, error.message);
    return null;
  }
};

/**
 * Avisa de que el estudiante sigue conectado. Acumula el tiempo activo y la
 * sesión abierta. El backend responde 200 incluso si falla, así que aquí solo
 * interesta no generar ruido cuando el estudiante navega rápido.
 */
export const enviarHeartbeat = async () => {
  try {
    const res = await api.post(`${TOTAL}/student/sesion/heartbeat`);
    return res.data?.data ?? null;
  } catch (error) {
    console.warn('[telemetría] Heartbeat fallido:', error.message);
    return null;
  }
};

/**
 * Cierra la sesión del estudiante para que el tiempo activo no siga creciendo.
 *
 * Usa `fetch` con `keepalive` porque al dispararse desde `pagehide` la petición
 * normal sería cancelada al descargar la página. `navigator.sendBeacon` no sirve
 * aquí: no permite mandar la cabecera `Authorization`.
 */
export const cerrarSesion = async () => {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    await fetch(`${TOTAL}/student/sesion/cerrar`, {
      method: 'POST',
      keepalive: true,
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    console.warn('[telemetría] No se pudo cerrar la sesión:', error.message);
  }
};

export default { iniciarActividad, enviarHeartbeat, cerrarSesion };