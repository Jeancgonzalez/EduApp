import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { MdError, MdInsights } from 'react-icons/md';
import './analitica-conceptos.css';

const TIPO_LABEL = {
  contenido: 'Contenido',
  juego: 'Juego',
  evaluacion: 'Evaluación',
};

/**
 * Lista "Conceptos con mayor error" con barras clicables. Reutiliza el endpoint
 * `/analitica/conceptos/resumen`, que delega en el mismo cálculo que el panel de
 * Resumen General, de modo que las cifras siempre coinciden.
 *
 * Props:
 *  - grupoId, semanas: filtros globales.
 *  - tipo: filtra por 'evaluacion' | 'juego' (opcional).
 *  - onAbrir(concepto): se invoca al pulsar una fila para abrir el panel de diagnóstico.
 *  - max: número máximo de conceptos a mostrar (por defecto 5).
 */
const ConceptosError = ({ grupoId, semanas, tipo, onAbrir, max = 5 }) => {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [datos, setDatos] = useState(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('semanas', String(semanas));
    p.set('top', String(max));
    if (grupoId) p.set('grupoId', String(grupoId));
    if (tipo) p.set('tipo', tipo);
    return p;
  }, [grupoId, semanas, tipo, max]);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');

    api.get(`/analitica/conceptos/resumen?${qs.toString()}`)
      .then((r) => { if (vigente) setDatos(r.data.data); })
      .catch((err) => {
        if (!vigente) return;
        console.error('Error al cargar los conceptos con error:', err);
        setError(err.response?.data?.message || 'No se pudieron cargar los conceptos.');
      })
      .finally(() => { if (vigente) setCargando(false); });

    return () => { vigente = false; };
  }, [qs]);

  const conceptos = datos?.conceptos ?? [];
  const maxErrores = datos?.conceptos?.length
    ? Math.max(...datos.conceptos.map((c) => c.errores || 0), 1)
    : 1;

  if (cargando) {
    return (
      <div className="acp-estado" role="status" aria-live="polite">
        Cargando conceptos con mayor error...
      </div>
    );
  }

  if (error) {
    return <div className="acp-estado"><MdError /> {error}</div>;
  }

  if (datos.conceptos.length === 0) {
    return (
      <div className="acp-estado">
        <MdInsights />
        Sin errores registrados en el período. Cuando aparezca un intento sin
        completar, el concepto se listará aquí.
      </div>
    );
  }

  return (
    <div className="acx-lista">
      {datos.conceptos.map((c) => {
        const ancho = Math.round(((c.errores || 0) / maxErrores) * 100) || 0;
        return (
          <button
            key={`${c.tipo}:${c.actividad_id}`}
            type="button"
            className="acx-fila"
            onClick={() => onAbrir(c)}
          >
            <span className="acx-fila-cabecera">
              <span className="acx-fila-nombre">{c.nombre || c.concepto}</span>
              <span className="acx-fila-tipo">{TIPO_LABEL[c.tipo] || c.tipo}</span>
            </span>
            <span className="acx-barra">
              <span className="acx-barra-relleno" style={{ width: `${ancho}%` }} />
            </span>
            <span className="acx-fila-pie">
              <span>
                <strong>{c.errores}</strong> {c.errores === 1 ? 'intento fallido' : 'intentos fallidos'}
                {' '}de {c.intentos} ({c.pct_error}%)
              </span>
              {c.cobertura?.sin_detalle > 0 && (
                <span className="acx-sin-detalle">
                  {c.cobertura.sin_detalle} sin detalle
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ConceptosError;
