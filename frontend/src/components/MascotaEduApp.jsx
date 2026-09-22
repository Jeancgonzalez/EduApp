import { useId } from 'react';
import './MascotaEduApp.css';
 
/**
 * Mascota de EduApp: un libro explorador con gorra de graduado.
 * Reutilizable, solo en el apartado estudiante. Un solo componente SVG
 * con expresiones que reflejan el estado actual del estudiante.
 * No requiere assets externos ni dependencias nuevas.
 *
 * Props:
 *  - expression:       'feliz' | 'celebrando' | 'animando' | 'pensando' (default 'feliz')
 *                      - También se pueden usar: 'sorprendida', 'preocupada', 'triste_leve', 'neutral'
 *  - size:             ancho/alto en px del SVG (default 110)
 *  - className:        clases extra (p.ej. 'mascota-welcome')
 *  - medallas:         número de medallas obtenidas (opcional)
 *  - puntos:           número total de puntos (opcional)
 *  - progreso:         porcentaje de progreso (0-100, opcional)
 *  - pendientes:       número de actividades pendientes (opcional)
 *  - completados:      número de actividades completadas (opcional)
 *  - estrellas:        número de estrellas obtenidas (0-3, opcional)
 *  - mensaje:          mensaje personalizado (opcional, string)
 *  - contexto:         'dashboard' | 'contenidos' | 'juegos' | 'evaluaciones' | 'progreso' (opcional)
 *  - situacion_especial: 'nuevo_registro' | 'tres_estrellas' | 'cercano_medalla' |
 *                        'muchas_actividades_pendientes' | 'muchas_actividades_completadas' |
 *                        'nueva_actividad_completada' | 'reintento' (opcional)
 *
 * Nota: Si se proporciona `mensaje`, este sobrescribe el texto de la burbuja
 * y define la expresión según su contenido. Si no, se selecciona un mensaje
 * apropiado según los datos contextuales. En ambos casos se dibuja el mismo
 * SVG completo del personaje.
 */
const VALID_EXPRESSIONS = {
  feliz: true,
  celebrando: true,
  animando: true,
  pensando: true,
  sorprendida: true,
  preocupada: true,
  triste_leve: true,
  neutral: true,
};

let motionDiagLogged = false;
 
const obtenerContextoYMensaje = (
  expression,
  medallas,
  puntos,
  progreso,
  pendientes,
  completados,
  estrellas,
  situacion_especial,
  contexto
) => {
  // Función auxiliar para singular/plural en español
  const singularPlural = (cantidad, singular, plural) =>
    cantidad === 1 ? singular : plural;
 
// 1. Situaciones especiales (mayor prioridad)
  if (situacion_especial) {
    const especiales = {
      nuevo_registro: { exp: 'celebrando', msj: '¡WOW! ¡Superaste tu puntuación anterior! ¡Mira cuánto has mejorado!' },
      tres_estrellas: { exp: 'celebrando', msj: '¡Tres estrellas! ¡Eso fue increíble!' },
      cercano_medalla: { exp: 'preocupada', msj: '¡Estás muy cerca de conseguir una nueva medalla! ¡Sigue así!' },
      muchas_actividades_pendientes: { exp: 'pensando', msj: '¡Hay mucho por descubrir! Empieza por una actividad y avancemos poco a poco.' },
      muchas_actividades_completadas: { exp: 'feliz', msj: '¡Has estado trabajando muchísimo! ¡Mira todo lo que has conseguido!' },
      nueva_actividad_completada: { exp: 'celebrando', msj: '¡Lo conseguiste! ¡Otra actividad completada!' },
      reintento: { exp: 'animando', msj: '¡Una segunda oportunidad! Inténtalo nuevamente y demuestra cuánto has aprendido.' },
    };

    const especial = especiales[situacion_especial];
    if (especial) {
      return { expression: especial.exp, mensaje: especial.msj, usarlogicaAutomatica: true };
    }
  }

  // NUEVO: Todos los juegos completados (mayor prioridad después de situaciones especiales)
  if (contexto === 'juegos' && pendientes !== undefined && completados !== undefined && pendientes <= 0 && completados > 0) {
    return { expression: 'celebrando', mensaje: '¡Yay! ¡Ya has realizado todos los juegos disponibles! ¡Sigue así! ⭐', usarlogicaAutomatica: true };
  }

  // NUEVO: Todas las evaluaciones completadas (mayor prioridad después de situaciones especiales)
  if (contexto === 'evaluaciones' && pendientes !== undefined && completados !== undefined && pendientes <= 0 && completados > 0) {
    return { expression: 'celebrando', mensaje: '¡Yay! ¡Ya has realizado todas las evaluaciones disponibles! ¡Sigue así! ⭐', usarlogicaAutomatica: true };
  }

  // NUEVO: Todos los contenidos completados (mayor prioridad después de situaciones especiales)
  if (contexto === 'contenidos' && pendientes !== undefined && completados !== undefined && pendientes <= 0 && completados > 0) {
    return { expression: 'celebrando', mensaje: '¡Yay! ¡Ya has realizado todos los contenidos disponibles! ¡Sigue así! ⭐', usarlogicaAutomatica: true };
  }

  // 2. Logro de medallas
  if (medallas !== undefined) {
    if (medallas >= 3) {
      return { expression: 'celebrando', mensaje: `¡Hey! Ya tienes ${medallas} medallas! ¡Lo estás haciendo genial!`, usarlogicaAutomatica: true };
    }
    if (medallas >= 1) {
      return { expression: 'celebrando', mensaje: '¡Felicidades! ¡Acabas de conseguir una nueva medalla! ¡Sigue desbloqueando logros!', usarlogicaAutomatica: true };
    }
  }
 
  // 3. Progreso alto
  if (progreso !== undefined) {
    if (progreso >= 80) {
      return { expression: 'feliz', mensaje: `¡Wow! Ya llevas ${progreso}% de progreso. ¡Estás cada vez más cerca de completar todo!`, usarlogicaAutomatica: true };
    }
    if (progreso >= 50) {
      return { expression: 'feliz', mensaje: `¡Buen trabajo! Llevas un ${progreso}% de progreso. ¡Sigue así!`, usarlogicaAutomatica: true };
    }
  }
 
  // 4. Actividades pendientes
  if (pendientes !== undefined && pendientes >= 0) {
    if (pendientes < 2) {
      return { expression: 'feliz', mensaje: `¡Casi lo tienes! Solo te queda una ${singularPlural(pendientes, 'actividad', 'actividades')}. ¡Un último esfuerzo!`, usarlogicaAutomatica: true };
    }
    if (pendientes >= 2) {
      return { expression: 'pensando', mensaje: '¡Hay muchas actividades por aprender. Empieza con una y poco a poco avanzarás.', usarlogicaAutomatica: true };
    }
  }
 
  // 5. Contenidos completados/pendientes
  if (completados !== undefined || (pendientes !== undefined && pendientes >= 0)) {
    if (completados !== undefined && completados >= 5) {
      return { expression: 'feliz', mensaje: `¡Qué buen trabajo! Ya completaste ${singularPlural(completados, 'contenido', 'contenidos')}. ¡Sigue aprendiendo así!`, usarlogicaAutomatica: true };
    }
    if (pendientes !== undefined && pendientes <= 2 && completados !== undefined) {
      return { expression: 'feliz', mensaje: `¡Ya casi! Solo te falta ${singularPlural(pendientes, 'contenido', 'contenidos')}. ¡Puedes hacerlo!`, usarlogicaAutomatica: true };
    }
    if (pendientes !== undefined && pendientes > 0 && completados === undefined) {
      return { expression: 'pensando', mensaje: '¡Psst! Primero debes terminar este contenido para desbloquear las actividades que siguen.', usarlogicaAutomatica: true };
    }
  }
 
// 6. Evaluaciones pendientes
  if (contexto === 'evaluaciones' && pendientes !== undefined && pendientes > 0) {
    return { expression: 'pensando', mensaje: '¡Hey! Tienes una evaluación pendiente. ¡Lee con atención y demuestra lo que aprendiste!', usarlogicaAutomatica: true };
  }

// 7. Juegos disponibles
  if (contexto === 'juegos' && pendientes !== undefined && pendientes > 0) {
    return { expression: 'animando', mensaje: `¡Hay ${singularPlural(pendientes, 'juego', 'juegos')} esperándote! ¿Cuál quieres intentar primero?`, usarlogicaAutomatica: true };
  }
  
  // 8. Estrellas
  if (estrellas !== undefined) {
    if (estrellas >= 3) {
      return { expression: 'celebrando', mensaje: '¡Conseguiste ⭐⭐⭐! ¡Hiciste un trabajo excelente!', usarlogicaAutomatica: true };
    }
    if (estrellas === 2) {
      return { expression: 'feliz', mensaje: '¡Esta vez conseguiste ⭐⭐! ¡Inténtalo nuevamente para conseguir las tres!', usarlogicaAutomatica: true };
    }
    if (estrellas === 1) {
      return { expression: 'pensando', mensaje: 'Inténtalo nuevamente para conseguir más estrellas.', usarlogicaAutomatica: true };
    }
  }
 
  // 9. Resultado bajo
  if (medallas !== undefined && medallas <= 1 && progreso !== undefined && progreso < 30) {
    return { expression: 'triste_leve', mensaje: '¡No te preocupes por empezar despacio! Cada actividad que completas te acerca un poco más a tu meta.', usarlogicaAutomatica: true };
  }
  if (contexto === 'evaluaciones' && progreso !== undefined && progreso < 50) {
    return { expression: 'triste_leve', mensaje: '¡No te preocupes! Puedes aprender de tus errores y seguir mejorando. ¡Tú puedes!', usarlogicaAutomatica: true };
  }
 
  // 10. Default - mantener expresión original, sin mensaje automático forzado
  // Pero SÍ permitir que el componente intente mostrar mensaje si hay datos
  if (medallas !== undefined || puntos !== undefined || progreso !== undefined || pendientes !== undefined || completados !== undefined || estrellas !== undefined) {
    return { expression, mensaje: null, usarlogicaAutomatica: true };
  }
 
  // 11. Sin datos relevantes - mantener expresión original sin mensaje automático
  return { expression, mensaje: null, usarlogicaAutomatica: false };
};
 
// Determina la expresión a partir del contenido de un mensaje personalizado
const obtenerExpresionDesdeMensaje = (mensaje) => {
  const msgLower = mensaje.toLowerCase();
  if (msgLower.includes('wow') || msgLower.includes('superaste') || msgLower.includes('increible') || msgLower.includes('felicidades') || msgLower.includes('excelente')) {
    return 'celebrando';
  }
  if (msgLower.includes('medalla') || msgLower.includes('logro')) {
    return 'celebrando';
  }
  if (msgLower.includes('animo') || msgLower.includes('intenta') || msgLower.includes('practic')) {
    return 'animando';
  }
  if (msgLower.includes('pendiente') || msgLower.includes('pendientes')) {
    return 'pensando';
  }
  if (msgLower.includes('preocup') || msgLower.includes('triste')) {
    return 'triste_leve';
  }
  return 'feliz';
};
 
const MascotaEduApp = ({
  expression = 'feliz',
  size = 110,
  className = '',
  medallas,
  puntos,
  progreso,
  pendientes,
  completados,
  estrellas,
  mensaje,
  contexto,
  situacion_especial,
}) => {
  // Diagnostico (una sola vez): si el SO/navegador tiene "reducir movimiento",
  // el CSS lo apaga. Ayuda a confirmar el punto 4 sin abrir DevTools.
  if (typeof window !== 'undefined' && !motionDiagLogged) {
    motionDiagLogged = true;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    console.info('[MascotaEduApp] prefers-reduced-motion activo en el sistema:', reduceMotion);
  }

  // 1. Resolver expresión y mensaje a mostrar, según venga un mensaje
  //    personalizado o se use la lógica automática por contexto.
  let exprResuelta;
  let mensajeFinal;
  let mostrarMensaje;
 
  if (mensaje) {
    // Si el llamador pide una expresión concreta (no la 'feliz' por defecto),
    // se respeta; la deducción automática por texto solo aplica cuando no se
    // especificó una (p. ej. la mascota de bienvenida del dashboard).
    exprResuelta = expression && expression !== 'feliz' ? expression : obtenerExpresionDesdeMensaje(mensaje);
    mensajeFinal = mensaje;
    mostrarMensaje = true;
  } else {
    const resultado = obtenerContextoYMensaje(
      expression,
      medallas,
      puntos,
      progreso,
      pendientes,
      completados,
      estrellas,
      situacion_especial,
      contexto
    );
    exprResuelta = resultado.expression;
    mensajeFinal = resultado.mensaje;
    mostrarMensaje = resultado.mensaje !== null && resultado.usarlogicaAutomatica;
  }
 
  // 2. Validar la expresión y asegurar que siempre tenga animación
  const expr = VALID_EXPRESSIONS[exprResuelta] ? exprResuelta : 'feliz';
  const tieneAnimacion = VALID_EXPRESSIONS[expr] && expr !== 'neutral';
  const expresionConAnimacion = tieneAnimacion ? expr : 'feliz';
 
  const gradId = useId().replace(/:/g, '');
  const coverId = `mascota-cover-${gradId}`;
 
  // 3. Un único SVG completo, tanto para mensaje personalizado como automático
  return (
    <div className="mascota-contenedor">
      <svg
        className={`mascota-eduapp mascota-${expresionConAnimacion}${className ? ` ${className}` : ''}`}
        viewBox="0 0 220 200"
        width={size}
        height={size}
        style={{ width: `${size}px`, height: `${size}px` }}
        role="img"
        aria-label="Mascota de EduApp: un libro explorador con gorra"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={coverId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#5b21b6" />
          </linearGradient>
        </defs>
 
        {/* Decoracion por expresion */}
        {expr === 'pensando' && (
          <g className="mascota-burbuja">
            <circle cx="33" cy="27" r="4" fill="#c4b5fd" />
            <circle cx="20" cy="16" r="6" fill="#c4b5fd" />
            <ellipse cx="46" cy="22" rx="16" ry="11" fill="#ede9fe" stroke="#a78bfa" strokeWidth="1.5" />
            <circle cx="37" cy="33" r="2.5" fill="#6d28d9" />
            <circle cx="46" cy="33" r="2.5" fill="#6d28d9" />
            <circle cx="55" cy="33" r="2.5" fill="#6d28d9" />
          </g>
        )}
 
        {expr === 'celebrando' && (
          <g className="mascota-confeti">
            <circle cx="180" cy="20" r="4" fill="#ef4444" />
            <rect x="33" y="45" width="7" height="12" rx="3" fill="#f59e0b" transform="rotate(-18 36 51)" />
            <rect x="184" y="42" width="7" height="12" rx="3" fill="#22c55e" transform="rotate(24 187 48)" />
            <ellipse cx="48" cy="30" rx="8" ry="3" fill="#3b82f6" transform="rotate(14 48 30)" />
            <rect x="167" y="58" width="4" height="4" rx="2" fill="#a855f7" transform="rotate(45 169 60)" />
          </g>
        )}
 
        {expr === 'animando' && (
          <g className="mascota-lineas" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round">
            <path d="M24 66 v-12 M32 68 v-10" />
            <path d="M196 66 v-12 M188 68 v-10" />
          </g>
        )}
 
        {expr === 'feliz' && (
          <g className="mascota-brillo">
            <path d="M176 20 L179.5 27 L187 30.5 L179.5 34 L176 41 L172.5 34 L165 30.5 L172.5 27 Z" fill="#f59e0b" />
            <path d="M42 15 L44 21 L50 23 L44 25 L42 31 L40 25 L34 23 L40 21 Z" fill="#fbbf24" />
          </g>
        )}
 
        {/* Pies */}
        <ellipse cx="84" cy="188" rx="16" ry="9" fill="#4c1d95" />
        <ellipse cx="136" cy="188" rx="16" ry="9" fill="#4c1d95" />
 
        {/* Brazos (detras del cuerpo) */}
        {expr === 'celebrando' && (
          <g>
            <path d="M54 96 C 40 92, 32 82, 22 74" stroke="#5b21b6" strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="21" cy="73" r="8" fill="#fed7aa" stroke="#312e81" strokeWidth="1.5" />
            <path d="M166 96 C 180 92, 188 82, 198 74" stroke="#5b21b6" strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="199" cy="73" r="8" fill="#fed7aa" stroke="#312e81" strokeWidth="1.5" />
          </g>
        )}
 
        {expr === 'animando' && (
          <g>
            <path d="M54 100 C 40 96, 32 88, 24 80" stroke="#5b21b6" strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="23" cy="79" r="8" fill="#fed7aa" stroke="#312e81" strokeWidth="1.5" />
            <path d="M166 100 C 180 96, 188 88, 196 80" stroke="#5b21b6" strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="197" cy="79" r="8" fill="#fed7aa" stroke="#312e81" strokeWidth="1.5" />
          </g>
        )}
 
        {expr === 'pensando' && (
          <g>
            <path d="M54 112 C 40 110, 34 122, 26 114" stroke="#5b21b6" strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="26" cy="114" r="8" fill="#fed7aa" stroke="#312e81" strokeWidth="1.5" />
            <path d="M164 112 C 176 116, 177 126, 168 135" stroke="#5b21b6" strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="166" cy="135" r="8" fill="#fed7aa" stroke="#312e81" strokeWidth="1.5" />
          </g>
        )}
 
        {expr === 'feliz' && (
          <g>
            <path d="M54 112 C 38 110, 34 122, 26 114" stroke="#5b21b6" strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="26" cy="114" r="8" fill="#fed7aa" stroke="#312e81" strokeWidth="1.5" />
            <path d="M166 112 C 182 110, 186 122, 194 114" stroke="#5b21b6" strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="194" cy="114" r="8" fill="#fed7aa" stroke="#312e81" strokeWidth="1.5" />
          </g>
        )}
 
        {/* Cuerpo: libro abierto de lado */}
        <rect x="52" y="74" width="116" height="112" rx="16" fill={`url(#${coverId})`} />
        <rect x="52" y="74" width="15" height="112" rx="8" fill="#3f1d8f" />
        <rect x="160" y="80" width="12" height="100" rx="5" fill="#f5e6c8" />
        <path d="M163 98 h6 M163 116 h6 M163 134 h6 M163 152 h6 M163 168 h6" stroke="#ddc297" strokeWidth="1.6" strokeLinecap="round" />
 
        {/* Marcapaginas */}
        <rect x="142" y="74" width="9" height="32" rx="4" fill="#f43f5e" />
        <path d="M142 100 L146.5 92 L151 100 Z" fill="#be123c" />
 
        {/* Gorra de graduado */}
        <rect x="86" y="56" width="48" height="16" rx="8" fill="#1e1b4b" />
        <path d="M60 50 L110 32 L160 50 L110 68 Z" fill="#312e81" />
        <circle cx="110" cy="50" r="5" fill="#f59e0b" />
        <path d="M160 50 Q176 52 172 68" stroke="#f59e0b" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <circle cx="171.5" cy="68.5" r="4" fill="#f59e0b" />
 
        {/* Cara */}
        <g>
          <ellipse cx="74" cy="128" rx="8" ry="5.5" fill="#fda4af" opacity="0.85" />
          <ellipse cx="146" cy="128" rx="8" ry="5.5" fill="#fda4af" opacity="0.85" />
 
          <circle cx="92" cy="118" r="11" fill="#ffffff" />
          <circle cx="128" cy="118" r="11" fill="#ffffff" />
 
          {expr === 'pensando' ? (
            <g>
              <circle cx="95" cy="115" r="4.5" fill="#1e1b4b" />
              <circle cx="131" cy="115" r="4.5" fill="#1e1b4b" />
              <circle cx="96" cy="113.5" r="1.6" fill="#ffffff" />
              <circle cx="132" cy="113.5" r="1.6" fill="#ffffff" />
            </g>
          ) : (
            <g>
              <circle cx="92" cy="119" r="5" fill="#1e1b4b" />
              <circle cx="128" cy="119" r="5" fill="#1e1b4b" />
              <circle cx="93.5" cy="117.5" r="1.8" fill="#ffffff" />
              <circle cx="129.5" cy="117.5" r="1.8" fill="#ffffff" />
            </g>
          )}
 
          {expr === 'animando' && (
            <g stroke="#312e81" strokeWidth="3" strokeLinecap="round" fill="none">
              <path d="M84 104 q6 -3 12 0" />
              <path d="M124 104 q6 -3 12 0" />
            </g>
          )}
          {expr === 'celebrando' && (
            <g stroke="#312e81" strokeWidth="3" strokeLinecap="round" fill="none">
              <path d="M84 105 q6 -4 12 -1" />
              <path d="M124 105 q6 -4 12 -1" />
            </g>
          )}
 
          {expr === 'feliz' && (
            <path d="M97 134 Q110 148 123 134" stroke="#312e81" strokeWidth="4.5" fill="none" strokeLinecap="round" />
          )}
 
          {expr === 'pensando' && (
            <circle cx="110" cy="136" r="5.5" fill="#312e81" />
          )}
 
          {expr === 'animando' && (
            <g>
              <ellipse cx="110" cy="137" rx="12" ry="9" fill="#312e81" />
              <ellipse cx="110" cy="143" rx="7.5" ry="4" fill="#fb7185" />
            </g>
          )}
 
          {expr === 'celebrando' && (
            <g>
              <ellipse cx="110" cy="137" rx="14" ry="11" fill="#312e81" />
              <ellipse cx="110" cy="144" rx="8.5" ry="5" fill="#fb7185" />
            </g>
          )}
        </g>
      </svg>
 
      {mostrarMensaje && (
        <span className="mascota-burbuja-mensaje mostrar">{mensajeFinal}</span>
      )}
    </div>
  );
};
 
export default MascotaEduApp;
 