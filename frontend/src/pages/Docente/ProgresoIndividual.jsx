import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
  MdWarning, MdArrowBack, MdSearch, MdPerson, MdSort, MdRefresh,
} from 'react-icons/md';
import ProgresoIndividualListado, { NIVELES } from './ProgresoIndividualListado';
import ProgresoIndividualDetalle from './ProgresoIndividualDetalle';
import './ProgresoIndividual.css';

const SEMANAS_POR_DEFECTO = 8;
const NOTA_MIN = 1.0;
const NOTA_MAX = 5.0;

const normalizarNivel = (valor) => {
  if (!valor) return 'Todos';
  const limpio = String(valor).trim();
  const sinTilde = limpio.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const encontrado = NIVELES.find((n) => {
    const base = n.clave.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return base === sinTilde;
  });
  return encontrado ? encontrado.clave : 'Todos';
};

const ORDENES = [
  { clave: 'nota', texto: 'Calificación' },
  { clave: 'xp', texto: 'XP' },
  { clave: 'alias', texto: 'Nombre' },
  { clave: 'conexion', texto: 'Última conexión' },
];

const ORDEN_POR_DEFECTO = 'nota';
const DIR_POR_DEFECTO = 'desc';

const leerNota = (valor) => {
  const n = Number(valor);
  if (valor === null || valor === '' || !Number.isFinite(n)) return null;
  return Math.min(NOTA_MAX, Math.max(NOTA_MIN, Math.round(n * 10) / 10));
};

const comparar = (a, b, dir) => {
  const va = a ?? null;
  const vb = b ?? null;
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  const signo = dir === 'asc' ? 1 : -1;
  if (typeof va === 'string' || typeof vb === 'string') {
    return signo * String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
  }
  return signo * (va - vb);
};

const fechaOculta = (v) => {
  const ms = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
};

const chipActivo = (color) => ({
  background: `${color}1a`,
  borderColor: color,
  color: color,
  boxShadow: `0 0 0 3px ${color}1f`,
});

const ProgresoIndividual = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const grupoId = searchParams.get('grupoId') ? Number(searchParams.get('grupoId')) : null;
  const semanas = Number(searchParams.get('semanas')) || SEMANAS_POR_DEFECTO;
  const estudianteSel = searchParams.get('estudiante') ? Number(searchParams.get('estudiante')) : null;

  const nivelUrl = normalizarNivel(searchParams.get('nivel'));
  const notaMinUrl = leerNota(searchParams.get('notaMin'));
  const notaMaxUrl = leerNota(searchParams.get('notaMax'));
  const riesgoUrl = searchParams.get('riesgo') === '1';
  const temaUrl = searchParams.get('tema') || '';
  const busquedaUrl = searchParams.get('q') || '';
  const ordenUrl = ORDENES.some((o) => o.clave === searchParams.get('orden'))
    ? searchParams.get('orden')
    : ORDEN_POR_DEFECTO;
  const dirUrl = searchParams.get('dir') === 'asc' ? 'asc' : DIR_POR_DEFECTO;

  const escribirParams = useCallback((cambios) => {
    const p = new URLSearchParams(searchParams);
    Object.entries(cambios).forEach(([clave, valor]) => {
      if (valor === null || valor === '' || valor === undefined) p.delete(clave);
      else p.set(clave, String(valor));
    });
    setSearchParams(p);
  }, [searchParams, setSearchParams]);

  const cambiarFiltro = useCallback((clave, valor) => {
    escribirParams({ [clave]: valor });
  }, [escribirParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [estudiantes, setEstudiantes] = useState([]);
  const [temas, setTemas] = useState([]);
  const [umbrales, setUmbrales] = useState(null);
  const [intento, setIntento] = useState(0);

  const busquedaLocal = useRef(busquedaUrl);
  const [busqueda, setBusqueda] = useState(busquedaUrl);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ semanas: String(semanas) });
        if (grupoId) params.set('grupoId', String(grupoId));
        const { data } = await api.get(`/teacher/students/progreso-individual?${params.toString()}`);
        if (cancelado) return;
        setEstudiantes(Array.isArray(data?.data) ? data.data : []);
        setTemas(Array.isArray(data?.meta?.temas) ? data.meta.temas : []);
        setUmbrales(data?.meta?.umbrales ?? null);
      } catch (err) {
        if (cancelado) return;
        console.error('Error al cargar el progreso individual:', err);
        setEstudiantes([]);
        setTemas([]);
        setError(
          err.response?.status === 403
            ? 'No tienes permisos para acceder a esta información.'
            : err.response?.data?.message || 'No se pudo cargar el listado de estudiantes.'
        );
      } finally {
        if (!cancelado) setLoading(false);
      }
    };
    cargar();
    return () => { cancelado = true; };
  }, [grupoId, semanas, intento]);

  useEffect(() => {
    busquedaLocal.current = busquedaUrl;
    setBusqueda(busquedaUrl);
  }, [busquedaUrl]);

  useEffect(() => {
    if (busqueda === busquedaUrl) return undefined;
    const t = setTimeout(() => cambiarFiltro('q', busqueda.trim() || null), 300);
    return () => clearTimeout(t);
  }, [busqueda, busquedaUrl, cambiarFiltro]);

  const conteoNivel = useMemo(() => {
    const conteo = { Todos: estudiantes.length };
    for (const n of NIVELES) conteo[n.clave] = 0;
    for (const e of estudiantes) {
      if (e.nivel && conteo[e.nivel] !== undefined) conteo[e.nivel] += 1;
    }
    return conteo;
  }, [estudiantes]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const min = notaMinUrl;
    const max = notaMaxUrl;

    let resultado = estudiantes.filter((e) => {
      if (nivelUrl !== 'Todos' && e.nivel !== nivelUrl) return false;
      if (min !== null || max !== null) {
        if (e.nota == null) return false;
        if (min !== null && e.nota < min) return false;
        if (max !== null && e.nota > max) return false;
      }
      if (riesgoUrl && !e.en_riesgo) return false;
      if (temaUrl && !(e.temas || []).includes(temaUrl)) return false;
      if (q && !String(e.alias || '').toLowerCase().includes(q)) return false;
      return true;
    });

    const valor = (e) => {
      switch (ordenUrl) {
        case 'xp': return e.xp ?? null;
        case 'alias': return e.alias || null;
        case 'conexion': return fechaOculta(e.ultima_conexion);
        case 'nota':
        default: return e.nota ?? null;
      }
    };

    resultado = [...resultado].sort((a, b) => comparar(valor(a), valor(b), dirUrl));
    return resultado;
  }, [estudiantes, nivelUrl, notaMinUrl, notaMaxUrl, riesgoUrl, temaUrl, busqueda, ordenUrl, dirUrl]);

  const hayFiltrosLocales =
    nivelUrl !== 'Todos' || notaMinUrl !== null || notaMaxUrl !== null
    || riesgoUrl || Boolean(temaUrl) || Boolean(busquedaUrl.trim())
    || ordenUrl !== ORDEN_POR_DEFECTO || dirUrl !== DIR_POR_DEFECTO;

  const limpiarFiltros = () => {
    const p = new URLSearchParams(searchParams);
    ['nivel', 'notaMin', 'notaMax', 'riesgo', 'tema', 'q', 'orden', 'dir']
      .forEach((k) => p.delete(k));
    setSearchParams(p);
  };

  const totalEnRiesgo = useMemo(
    () => estudiantes.filter((e) => e.en_riesgo).length,
    [estudiantes]
  );

  const criterioRiesgo = useMemo(() => {
    if (!umbrales) return 'En riesgo';
    const { min, basico } = umbrales.nota || {};
    const dias = umbrales.riesgo?.dias_sin_ingresar;
    const partes = [];
    if (basico != null) {
      partes.push(
        min != null
          ? `nivel Bajo (nota entre ${min.toFixed(1)} y ${(basico - 0.1).toFixed(1)})`
          : `nivel Bajo (nota menor a ${basico.toFixed(1)})`
      );
    }
    if (dias != null) partes.push(`${dias} días sin ingresar`);
    return partes.length ? `En riesgo: ${partes.join(' o ')}` : 'En riesgo';
  }, [umbrales]);

  const rangoNota =
    `${notaMinUrl !== null ? notaMinUrl.toFixed(1) : NOTA_MIN.toFixed(1)} – `
    + `${notaMaxUrl !== null ? notaMaxUrl.toFixed(1) : NOTA_MAX.toFixed(1)}`;

  const handleVerDetalle = (studentId) => escribirParams({ estudiante: studentId });
  const handleCerrarDetalle = () => escribirParams({ estudiante: null });

  const cambiarOrden = (clave) => {
    if (clave === ordenUrl) escribirParams({ dir: dirUrl === 'asc' ? 'desc' : 'asc' });
    else escribirParams({ orden: clave, dir: clave === 'alias' ? 'asc' : 'desc' });
  };

  // ---------- Estados vacíos / error ----------
  if (error) {
    return (
      <div className="progreso-error-card">
        <MdWarning className="error-icon" />
        <h3>{error}</h3>
        <p>Los datos mostrados corresponden únicamente a los estudiantes registrados por ti.</p>
        <button className="progreso-volver" onClick={() => navigate('/docente/dashboard')}>
          <MdArrowBack /> Volver
        </button>
      </div>
    );
  }

  if (loading && estudiantes.length === 0) {
    return <div className="progreso-loading">Cargando datos de estudiantes...</div>;
  }

  if (estudiantes.length === 0) {
    return (
      <div className="dash-vacio">
        <MdPerson aria-hidden="true" />
        <p>No hay estudiantes registrados en este filtro.</p>
        {grupoId && (
          <p>Prueba con "Todos los grupos" en la barra de filtros o registra un estudiante en el grupo.</p>
        )}
        <button className="progreso-volver" onClick={() => navigate('/gestion-alumnos')}>
          <MdArrowBack /> Ir a Gestión de Alumnos
        </button>
      </div>
    );
  }

  /* ============================================================
     VISTA 1: FICHA DEL ESTUDIANTE (pantalla completa)
     ============================================================
     Cuando hay `?estudiante=` en la URL, mostramos SOLO el detalle.
     Volver al listado se hace con el botón "Cerrar detalle" del
     propio componente (que borra el parámetro). */
  if (estudianteSel) {
    return (
      <div className="progreso-individual-container">
        <ProgresoIndividualDetalle
          estudianteId={estudianteSel}
          grupoId={grupoId}
          onCerrar={handleCerrarDetalle}
        />
      </div>
    );
  }

  /* ============================================================
     VISTA 2: LISTADO (pantalla completa)
     ============================================================ */
  return (
    <div className="progreso-individual-container">
      <div className="progreso-individual-header">
        <h2>Progreso Individual</h2>
        <p className="dash-analitica-nota">
          Selecciona una fila para ver la ficha del estudiante. Los filtros se combinan y quedan guardados en la URL.
        </p>
      </div>

      {/* ---------- FILTROS ---------- */}
      <div className="progreso-individual-filtros">
        <div className="filtro-chips" role="group" aria-label="Filtrar por nivel de desempeño">
          <button
            type="button"
            className={`chip ${nivelUrl === 'Todos' ? 'chip-activo' : ''}`}
            onClick={() => cambiarFiltro('nivel', null)}
          >
            <span className="chip-texto">Todos ({conteoNivel.Todos})</span>
          </button>
          {NIVELES.map((n) => {
            const activo = nivelUrl === n.clave;
            const vacio = conteoNivel[n.clave] === 0;
            return (
              <button
                key={n.clave}
                type="button"
                className={`chip ${activo ? 'chip-activo' : ''} ${vacio && !activo ? 'chip-vacio' : ''}`}
                style={activo ? chipActivo(n.color) : undefined}
                onClick={() => cambiarFiltro('nivel', activo ? null : n.clave)}
                aria-pressed={activo}
              >
                <span className="chip-punto" style={{ background: n.color }} aria-hidden="true" />
                <span className="chip-texto">{n.texto} ({conteoNivel[n.clave]})</span>
              </button>
            );
          })}
        </div>

        <div className="filtro-rango">
          <span className="filtro-label">Calificación</span>
          <input
            type="range"
            min={NOTA_MIN}
            max={NOTA_MAX}
            step={0.1}
            value={notaMinUrl ?? NOTA_MIN}
            onChange={(e) => cambiarFiltro('notaMin', Number(e.target.value))}
            className="filtro-input-range"
            aria-label={`Calificación mínima: ${rangoNota}`}
          />
          <input
            type="range"
            min={NOTA_MIN}
            max={NOTA_MAX}
            step={0.1}
            value={notaMaxUrl ?? NOTA_MAX}
            onChange={(e) => cambiarFiltro('notaMax', Number(e.target.value))}
            className="filtro-input-range"
            aria-label={`Calificación máxima: ${rangoNota}`}
          />
          <span className="filtro-rango-valores">{rangoNota}</span>
        </div>

        <label className="filtro-campo" htmlFor="filtro-tema">
          <span className="filtro-label">Tema</span>
          <select
            id="filtro-tema"
            className="dash-filtro-select"
            value={temaUrl}
            onChange={(e) => cambiarFiltro('tema', e.target.value || null)}
          >
            <option value="">Todos los temas</option>
            {temas.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        <div className="filtro-busqueda">
          <MdSearch className="filtro-icono" aria-hidden="true" />
          <input
            type="text"
            placeholder="Buscar por alias..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="filtro-input-busqueda"
            aria-label="Buscar estudiante por alias"
          />
        </div>

        <div className="filtro-riesgo">
          <label className="filtro-checkbox">
            <input
              type="checkbox"
              checked={riesgoUrl}
              onChange={(e) => cambiarFiltro('riesgo', e.target.checked ? '1' : null)}
            />
            <span className="checkbox-slider" aria-hidden="true" />
            <span>
              En riesgo
              <span className="filtro-conteo"> ({totalEnRiesgo})</span>
            </span>
          </label>
          <span className="filtro-ayuda" title={criterioRiesgo}>{criterioRiesgo}</span>
        </div>

        <div className="filtro-orden">
          <span className="filtro-label">
            <MdSort aria-hidden="true" /> Ordenar por
          </span>
          <div className="dash-segmentos" role="group" aria-label="Ordenar el listado">
            {ORDENES.map((o) => (
              <button
                key={o.clave}
                type="button"
                className={ordenUrl === o.clave ? 'dash-segmento-activo' : ''}
                onClick={() => cambiarOrden(o.clave)}
                aria-pressed={ordenUrl === o.clave}
              >
                {o.texto}
                {ordenUrl === o.clave && <span aria-hidden="true"> {dirUrl === 'asc' ? '↑' : '↓'}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="filtro-acciones">
          <span className="filtro-resumen" aria-live="polite">
            {filas.length} de {estudiantes.length} estudiante{estudiantes.length === 1 ? '' : 's'}
          </span>
          {hayFiltrosLocales && (
            <button type="button" className="dash-filtros-limpiar" onClick={limpiarFiltros}>
              <MdRefresh aria-hidden="true" /> Limpiar filtros
            </button>
          )}
          <button
            type="button"
            className="dash-filtros-limpiar"
            onClick={() => setIntento((i) => i + 1)}
            disabled={loading}
          >
            <MdRefresh aria-hidden="true" /> Actualizar
          </button>
        </div>
      </div>

      {/* ---------- LISTADO ---------- */}
      <div className="progreso-individual-panel">
        {loading && <div className="progreso-loading">Actualizando listado...</div>}
        {filas.length === 0 ? (
          <div className="dash-vacio">
            <p>Ningún estudiante cumple los filtros aplicados.</p>
            {hayFiltrosLocales && (
              <button type="button" className="progreso-volver" onClick={limpiarFiltros}>
                <MdRefresh /> Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <ProgresoIndividualListado
            estudiantes={filas}
            orden={ordenUrl}
            dir={dirUrl}
            onOrdenar={cambiarOrden}
            seleccionadoId={null}
            onVerDetalle={handleVerDetalle}
          />
        )}
      </div>
    </div>
  );
};

export default ProgresoIndividual;