import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { iniciarActividad, enviarHeartbeat, cerrarSesion } from '../services/telemetria';

// Cada cuánto se avisa de que el estudiante sigue conectado. Dos minutos mantiene
// el tiempo activo razonablemente exacto sin generar una petición por minuto.
const INTERVALO_HEARTBEAT_MS = 2 * 60 * 1000;

/**
 * Mantiene viva la sesión de telemetría del estudiante.
 *
 * Se monta una sola vez (en el layout de la app) y:
 *  1. abre/renueva la sesión con un heartbeat inmediato y luego cada 2 minutos;
 *  2. cierra la sesión al cerrar o recargar la pestaña y al desmontarse.
 *
 * `pagehide` es el evento adecuado y no `beforeunload`: no dispara el diálogo de
 * "salir de la página" y sigue funcionando con la back/forward cache.
 */
export const useSesionTelemetria = () => {
  const { user } = useAuth();
  const esEstudiante = !!user && user.role === 'student';

  useEffect(() => {
    // El token puede estar caducado: en ese caso el interceptor de `api` ya
    // redirige a /login y no tiene sentido medir nada.
    if (!esEstudiante || !localStorage.getItem('token')) return undefined;

    enviarHeartbeat();
    const intervalo = setInterval(enviarHeartbeat, INTERVALO_HEARTBEAT_MS);

    // `visibilitychange` cubre la pestaña en segundo plano mucho tiempo: al
    // volver a primer plano el estudiante cuenta como activo otra vez.
    const alVolver = () => {
      if (document.visibilityState === 'visible') enviarHeartbeat();
    };
    document.addEventListener('visibilitychange', alVolver);

    const alSalir = () => { cerrarSesion(); };
    window.addEventListener('pagehide', alSalir);

    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('pagehide', alSalir);
      cerrarSesion();
    };
  }, [esEstudiante]);
};

/**
 * Abre un intento de telemetría al entrar en una actividad.
 *
 * Devuelve el `intento_id` para enviarlo en la resolución: el backend lo usa
 * para cerrar el intento y calcular la duración. Si la telemetría no está
 * disponible devuelve `null` y la actividad sigue funcionando igual.
 *
 * @param {'contenido'|'juego'|'evaluacion'} tipo
 * @param {number|string} actividadId
 * @param {boolean} activo Permite no abrir el intento hasta que la actividad haya
 *   cargado (evita registrar intentos de recursos inexistentes).
 */
export const useIntentoActividad = (tipo, actividadId, activo = true) => {
  const [intentoId, setIntentoId] = useState(null);

  // En desarrollo `StrictMode` monta dos veces los efectos: sin este ref se
  // abrirían dos intentos para la misma visita y el dashboard contaría de más.
  const abiertoPara = useRef(null);

  useEffect(() => {
    const id = Number(actividadId);
    if (!activo || !Number.isInteger(id) || id <= 0) return undefined;

    const clave = `${tipo}:${id}`;
    if (abiertoPara.current === clave) return undefined;
    abiertoPara.current = clave;

    let vigente = true;
    setIntentoId(null);
    iniciarActividad(tipo, id)
      .then((idCreado) => { if (vigente) setIntentoId(idCreado); })
      .catch(() => { if (vigente) setIntentoId(null); });

    return () => { vigente = false; };
  }, [tipo, actividadId, activo]);

  return intentoId;
};

export default { useSesionTelemetria, useIntentoActividad };