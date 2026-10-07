import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MdFilterList, MdRefresh } from 'react-icons/md';
import api from '../../services/api';

/**
 * Barra de filtros globales del panel analítico.
 *
 * Grupo y período se combinan con los filtros de cada vista y con el detalle
 * individual: en Progreso Individual el listado y la ficha comparten la misma
 * barra, así que cambiar de grupo recarga los dos lados a la vez.
 */
const PERIODOS = [
  { semanas: 4, etiqueta: 'Últimas 4 semanas' },
  { semanas: 8, etiqueta: 'Últimas 8 semanas' },
  { semanas: 12, etiqueta: 'Últimas 12 semanas' },
  { semanas: 26, etiqueta: 'Último semestre' },
];

const SEMANAS_POR_DEFECTO = 8;

const FiltrosAnalitica = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [grupos, setGrupos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const grupoId = searchParams.get('grupoId') ? Number(searchParams.get('grupoId')) : null;
  const semanas = Number(searchParams.get('semanas')) || SEMANAS_POR_DEFECTO;

  // ---------- Carga de grupos ----------
  const cargarGrupos = useCallback(() => {
    setCargando(true);
    setError('');
    api
      .get('/teacher/grupos')
      .then((r) => {
        const raw = r.data?.data;
        setGrupos(Array.isArray(raw) ? raw : (raw?.grupos || []));
      })
      .catch((err) => {
        console.error('No se pudieron cargar los grupos del filtro:', err);
        setGrupos([]);
        setError('No se pudieron cargar los grupos');
      })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargarGrupos(); }, [cargarGrupos]);

  /**
   * Un `grupoId` en la URL que ya no existe se elimina en cuanto se sabe
   * que la lista no lo contiene, para que la vista no quede bloqueada.
   */
  useEffect(() => {
    if (cargando || !grupoId) return;
    if (grupos.some((g) => g.id === grupoId)) return;
    const p = new URLSearchParams(searchParams);
    p.delete('grupoId');
    setSearchParams(p, { replace: true });
  }, [cargando, grupos, grupoId, searchParams, setSearchParams]);

  /** Escribe un parámetro conservando el resto de la URL. */
  const cambiar = useCallback((clave, valor) => {
    const p = new URLSearchParams(searchParams);
    if (valor === null || valor === '' || valor === undefined) p.delete(clave);
    else p.set(clave, String(valor));
    setSearchParams(p);
  }, [searchParams, setSearchParams]);

  const hayFiltros = Boolean(grupoId) || semanas !== SEMANAS_POR_DEFECTO;

  const etiquetaGrupo = useMemo(() => {
    if (!grupoId) return '';
    const g = grupos.find((x) => x.id === grupoId);
    if (!g) return '';
    return g.materia ? `${g.nombre} · ${g.materia}` : g.nombre;
  }, [grupoId, grupos]);

  return (
    <div className="dash-filtros" role="group" aria-label="Filtros del panel analítico">
      <span className="dash-filtros-icono" aria-hidden="true"><MdFilterList /></span>

      {/* ---------- Selector de grupo ---------- */}
      <label className="dash-filtro" htmlFor="dash-filtro-grupo">
        <span className="dash-filtro-label">Grupo</span>
        <select
          id="dash-filtro-grupo"
          className="dash-filtro-select"
          value={grupoId ?? ''}
          disabled={cargando}
          onChange={(e) => cambiar('grupoId', e.target.value || null)}
        >
          <option value="">Todos los grupos</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.materia ? `${g.nombre} · ${g.materia}` : g.nombre}
              {g.totalEstudiantes != null ? ` (${g.totalEstudiantes})` : ''}
            </option>
          ))}
        </select>
      </label>

      {/* ---------- Selector de período (siempre visible) ---------- */}
      <label className="dash-filtro" htmlFor="dash-filtro-periodo">
        <span className="dash-filtro-label">Período</span>
        <select
          id="dash-filtro-periodo"
          className="dash-filtro-select"
          value={semanas}
          onChange={(e) => cambiar('semanas', e.target.value)}
        >
          {PERIODOS.map((p) => (
            <option key={p.semanas} value={p.semanas}>{p.etiqueta}</option>
          ))}
        </select>
      </label>

      <span className="dash-filtros-resumen" aria-live="polite">
        {error && <span className="dash-filtros-error">{error}</span>}
        {!error && cargando && 'Cargando grupos...'}
        {!error && !cargando && (
          grupoId
            ? `Filtrando por ${etiquetaGrupo || `grupo ${grupoId}`}`
            : `${grupos.length} grupo${grupos.length === 1 ? '' : 's'}`
        )}
      </span>

      {hayFiltros && (
        <button
          type="button"
          className="dash-filtros-limpiar"
          onClick={() => cambiar('grupoId', null)}
        >
          <MdRefresh aria-hidden="true" />
          Quitar filtro de grupo
        </button>
      )}
    </div>
  );
};

export default FiltrosAnalitica;