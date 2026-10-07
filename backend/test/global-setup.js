const MAILHOG_API = process.env.MAILHOG_API || 'http://localhost:8025';

/**
 * Vacía MailHog antes de empezar la suite.
 *
 * La verificación de correo busca el código con `GET /api/v2/search`, que
 * MailHog responde recorriendo TODOS los mensajes que tiene guardados. Como
 * cada corrida deja ~150 correos nuevos (uno por docente y estudiante de
 * prueba) y MailHog no tiene expiración, la búsqueda se ralentiza cada vez más:
 * a ~1.000 mensajes los `beforeAll` empezaban a agotar el tiempo y los tests
 * saltaban con "Hook timed out", de forma intermitente.
 *
 * Vaciar aquí deja cada corrida en las mismas condiciones y, de paso, evita que
 * los correos de prueba se acumulen indefinidamente.
 *
 * Si MailHog está apagado no se falla la suite: es una dependencia externa y los
 * tests que lo necesitan ya avisan con un mensaje explícito.
 */
export default async function globalSetup() {
  try {
    const res = await fetch(`${MAILHOG_API}/api/v1/messages`, { method: 'DELETE' });
    if (res.ok) {
      console.log('[qa] MailHog vaciado: cada corrida arranca con la bandeja limpia.');
    } else {
      console.warn(`[qa] No se pudo vaciar MailHog (HTTP ${res.status}). La búsqueda puede ir lenta.`);
    }
  } catch (error) {
    console.warn(`[qa] MailHog no disponible (${error.message}). Si los tests de docente fallan, enciéndelo.`);
  }
}