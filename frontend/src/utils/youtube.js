/**
 * Utilidades para extraer y normalizar el ID de un video de YouTube a partir
 * de las URLs típicas que un docente podría pegar:
 *   - https://www.youtube.com/watch?v=ID
 *   - https://youtu.be/ID
 *   - https://www.youtube.com/embed/ID
 *   - https://www.youtube.com/shorts/ID
 *   - https://www.youtube.com/live/ID
 * con o sin parámetros adicionales (&t=, &list=, &si=, etc.) y con/ sin www/m.
 */

const YOUTUBE_HOST_PATTERN =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com)\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)([a-zA-Z0-9_-]{6,})/i;

const YOUTU_BE_PATTERN =
  /^(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{6,})/i;

/**
 * Extrae el ID del video a partir de una URL de YouTube.
 * Devuelve el ID, o null si el enlace no corresponde a un video de YouTube válido.
 *
 * @param {string} url
 * @returns {string|null}
 */
export function getYouTubeVideoId(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const match = trimmed.match(YOUTUBE_HOST_PATTERN) || trimmed.match(YOUTU_BE_PATTERN);
  return match ? match[1] : null;
}

/**
 * Construye la URL embebible del reproductor de YouTube (https://www.youtube.com/embed/ID).
 * Devuelve null si el enlace no es un video de YouTube válido.
 *
 * @param {string} url
 * @returns {string|null}
 */
export function buildEmbedUrl(url) {
  const id = getYouTubeVideoId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}