import React from 'react';
import {
  MdPerson, MdChevronRight, MdWarning, MdSchedule, MdSchool,
} from 'react-icons/md';
import './ProgresoIndividual.css';

/**
 * Listado de estudiantes del Progreso Individual.
 *
 * Es una tabla y no una rejilla de tarjetas porque la pregunta que responde el
 * docente es comparativa ("¿quién está por debajo de 3?") y eso necesita
 * columnas alineadas y encabezados que se puedan ordenar con un clic. Las
 * tarjetas se reservan para el móvil, donde una tabla de seis columnas obliga a
 * desplazar en horizontal para leer la fila.
 *
 * Solo se muestran alias: el correo del estudiante no aporta nada para leer un
 * desempeño y no hace falta exponerlo en una tabla que se puede compartir por
 * URL.
 */

/** Niveles en orden de mayor a menor exigencia; el color es el de la paleta. */
export const NIVELES = [
  { clave: 'Superior', texto: 'Superior', color: '#10b981' },
  { clave: 'Alto', texto: 'Alto', color: '#3b82f6' },
  { clave: 'Básico', texto: 'Básico', color: '#f59e0b' },
  { clave: 'Bajo', texto: 'Bajo', color: '#ef4444' },
];

export const COLOR_NIVEL = Object.fromEntries(NIVELES.map((n) => [n.clave, n.color]));

const COLOR_RIESGO = '#dc2626';

/** "hace 3 días" / "hoy" / "sin registro": relativo y sin fechas fijas. */
function textoConexion(fecha) {
  if (!fecha) return 'Sin registro';
  const ms = new Date(fecha).getTime();
  if (!Number.isFinite(ms)) return 'Sin registro';

  const dias = Math.floor((Date.now() - ms) / 864e5);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 30) return `Hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return `Hace ${meses} mes${meses === 1 ? '' : 'es'}`;
}

/** Fecha y hora exactas para el `title`, que es donde va el dato preciso. */
const tituloConexion = (fecha) => {
  if (!fecha) return 'Sin sesión registrada';
  const d = new Date(fecha);
  return Number.isFinite(d.getTime())
    ? `Última conexión: ${d.toLocaleString('es')}`
    : 'Sin sesión registrada';
};

const ChipNivel = ({ nivel }) => {
  if (!nivel) return <span className="dash-nivel">Sin datos</span>;
  const color = COLOR_NIVEL[nivel] || '#64748b';
  return (
    <span
      className="progreso-nivel-chip"
      style={{ background: `${color}1f`, color, borderColor: `${color}66` }}
      title={`Nivel de desempeño: ${nivel}`}
    >
      {nivel}
    </span>
  );
};

const ChipRiesgo = ({ fila }) => {
  if (!fila.en_riesgo) {
    return <span className="progreso-riesgo-chip sin-riesgo">Fuera de riesgo</span>;
  }
  const motivo = fila.motivo_riesgo_texto
    || (fila.motivo_riesgo === 'inactivo' ? 'Sin ingresar' : 'Bajo nivel de desempeño');
  return (
    <span
      className="progreso-riesgo-chip"
      style={{ background: `${COLOR_RIESGO}1a`, color: COLOR_RIESGO, borderColor: `${COLOR_RIESGO}59` }}
      title={`Motivo: ${motivo}`}
    >
      <MdWarning aria-hidden="true" />
      {motivo}
    </span>
  );
};

/** Flecha del encabezado activo; el sentido lo decide `dir`. */
const flecha = (activa, dir) => (activa ? (dir === 'asc' ? '↑' : '↓') : '');

const ProgresoIndividualListado = ({
  estudiantes = [],
  orden = 'nota',
  dir = 'desc',
  onOrdenar,
  seleccionadoId = null,
  onVerDetalle,
}) => {
  if (!estudiantes.length) return null;

  const encabezado = (clave, texto, extra = '') => {
    const activa = orden === clave;
    return (
      <th
        key={clave}
        className={extra}
        aria-sort={activa ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          className={`progreso-th-orden ${activa ? 'activo' : ''}`}
          onClick={() => onOrdenar && onOrdenar(clave)}
        >
          {texto}
          <span aria-hidden="true" className="progreso-th-flecha">{flecha(activa, dir)}</span>
        </button>
      </th>
    );
  };

  return (
    <>
      {/* ---------- Tabla (escritorio y tableta) ---------- */}
      <div className="dash-tabla-envoltura progreso-tabla-envoltura">
        <table className="dash-tabla progreso-tabla">
          <caption className="progreso-tabla-caption">
            Listado de estudiantes con calificación numérica, nivel de desempeño, XP,
            última conexión y estado de riesgo.
          </caption>
          <thead>
            <tr>
              {encabezado('alias', 'Alias')}
              {encabezado('nota', 'Calificación', 'dash-tabla-num')}
              {encabezado('xp', 'XP', 'dash-tabla-num')}
              <th scope="col">Nivel</th>
              {encabezado('conexion', 'Última conexión')}
              <th scope="col">Riesgo</th>
              <th scope="col"><span className="progreso-th-sr">Detalle</span></th>
            </tr>
          </thead>
          <tbody>
            {estudiantes.map((e) => {
              const seleccionado = seleccionadoId === e.id;
              return (
                <tr
                  key={e.id}
                  className={seleccionado ? 'seleccionada' : undefined}
                  onClick={() => onVerDetalle(e.id)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={seleccionado}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      onVerDetalle(e.id);
                    }
                  }}
                >
                  <td>
                    <span className="dash-tabla-alias">{e.alias}</span>
                    {(e.grupos || []).length > 0 && (
                      <span className="dash-tabla-sub">
                        <MdSchool aria-hidden="true" /> {e.grupos.join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className="dash-tabla-num">
                    {e.nota != null ? Number(e.nota).toFixed(1) : '—'}
                  </td>
                  <td className="dash-tabla-num">{e.xp ?? 0}</td>
                  <td><ChipNivel nivel={e.nivel} /></td>
                  <td title={tituloConexion(e.ultima_conexion)}>
                    <span className="progreso-conexion">
                      <MdSchedule aria-hidden="true" />
                      {textoConexion(e.ultima_conexion)}
                    </span>
                  </td>
                  <td><ChipRiesgo fila={e} /></td>
                  <td className="progreso-tabla-flecha">
                    <MdChevronRight aria-hidden="true" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- Tarjetas (móvil) ---------- */}
      <ul className="progreso-tarjetas-grid">
        {estudiantes.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className={`progreso-tarjeta ${seleccionadoId === e.id ? 'seleccionada' : ''}`}
              onClick={() => onVerDetalle(e.id)}
            >
              <div className="progreso-tarjeta-header">
                <span className="progreso-tarjeta-avatar" aria-hidden="true">
                  <MdPerson />
                </span>
                <div className="progreso-tarjeta-nombre">
                  <span className="progreso-tarjeta-alias">{e.alias}</span>
                  {(e.grupos || []).length > 0 && (
                    <span className="progreso-tarjeta-email">{e.grupos.join(' · ')}</span>
                  )}
                </div>
                <ChipNivel nivel={e.nivel} />
              </div>

              <div className="progreso-tarjeta-stats">
                <div className="progreso-tarjeta-stat">
                  <span className="stat-label">Nota</span>
                  <span className="stat-value">
                    {e.nota != null ? Number(e.nota).toFixed(1) : '—'}
                  </span>
                </div>
                <div className="progreso-tarjeta-stat">
                  <span className="stat-label">XP</span>
                  <span className="stat-value">{e.xp ?? 0}</span>
                </div>
                <div className="progreso-tarjeta-stat" title={tituloConexion(e.ultima_conexion)}>
                  <span className="stat-label">Última conexión</span>
                  <span className="stat-value stat-texto">
                    {textoConexion(e.ultima_conexion)}
                  </span>
                </div>
              </div>

              <div className="progreso-tarjeta-footer">
                <ChipRiesgo fila={e} />
                <span className="progreso-tarjeta-ver">
                  Ver detalle <MdChevronRight aria-hidden="true" />
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
};

export default ProgresoIndividualListado;
