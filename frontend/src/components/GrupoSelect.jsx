import React, { useEffect, useState } from 'react';
import api from '../services/api';
import './GrupoSelect.css';

/**
 * Selector de grupo para dirigir un recurso a un grupo específico de estudiantes.
 * Valor "" = visible para TODOS los estudiantes (comportamiento actual).
 * Valor "ID" = visible solo para estudiantes de ese grupo.
 */
const GrupoSelect = ({ value = '', onChange, disabled = false }) => {
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/teacher/grupos')
      .then(res => setGrupos(res.data?.data?.grupos || []))
      .catch(() => setGrupos([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="grupo-select-field">
      <label htmlFor="grupo_id">Dirigido a</label>
      <select
        id="grupo_id"
        name="grupo_id"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading}
      >
        <option value="">Todos los estudiantes (por defecto)</option>
        {grupos.map((g) => (
          <option key={g.id} value={g.id}>
            {g.materia} – {g.nombre}
          </option>
        ))}
      </select>
      {grupos.length === 0 && !loading && (
        <p className="grupo-select-hint">
          Aún no has creado grupos. Puedes crearlos en la sección "Grupos" para dirigir recursos a estudiantes específicos.
        </p>
      )}
    </div>
  );
};

export default GrupoSelect;