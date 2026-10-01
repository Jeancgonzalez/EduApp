import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import './GrupoSelect.css';

/**
 * Selector múltiple de grupos para dirigir un recurso (contenido, juego o
 * evaluación) a uno, varios o ninguno de los grupos del docente.
 *
 * Contrato con el backend:
 *   - value = []            -> visible para TODOS los estudiantes.
 *   - value = [1, 2]        -> visible solo para miembros de los grupos 1 y 2.
 *   - onChange siempre recibe un array de números (posiblemente vacío).
 *
 * Se usa una casilla "Todos" en lugar de un <select multiple> porque así el
 * estado inicial ("todos") es explícito y no depende de qué opción aparece
 * preseleccionada en el navegador.
 */
const GrupoMultiSelect = ({ value = [], onChange, disabled = false }) => {
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    api.get('/teacher/grupos')
      .then(res => {
        if (!vivo) return;
        setGrupos(res.data?.data?.grupos || []);
        setError('');
      })
      .catch(() => {
        if (vivo) setError('No se pudieron cargar tus grupos.');
      })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, []);

  // Normaliza el valor a array de números. Protege contra `value` undefined,
  // null o un string suelto que llegue desde un formulario.
  const seleccionados = useMemo(() => {
    const lista = Array.isArray(value) ? value : (value === '' || value == null ? [] : [value]);
    return [...new Set(lista.map(Number).filter(n => Number.isInteger(n) && n > 0))];
  }, [value]);

  const todosSeleccionados = seleccionados.length === 0;

  const alternar = (id) => {
    const idNum = Number(id);
    const nuevos = seleccionados.includes(idNum)
      ? seleccionados.filter(g => g !== idNum)
      : [...seleccionados, idNum];
    // Quedarse sin casillas equivaldría a "todos", así que se fuerza a todos.
    onChange(nuevos.length ? nuevos : []);
  };

  const seleccionarTodos = () => onChange([]);
  const seleccionarNinguno = () => onChange(grupos.map(g => g.id));

  return (
    <div className="grupo-select-field">
      <div className="grupo-select-header">
        <span className="grupo-select-label">Dirigido a</span>
        {grupos.length > 0 && (
          <span className="grupo-select-acciones">
            <button type="button" onClick={seleccionarTodos} disabled={disabled || todosSeleccionados}>
              Todos
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={seleccionarNinguno} disabled={disabled}>
              Ninguno
            </button>
          </span>
        )}
      </div>

      {loading ? (
        <p className="grupo-select-hint">Cargando grupos...</p>
      ) : error ? (
        <p className="grupo-select-error">{error} Podrás guardarlo para todos.</p>
      ) : grupos.length === 0 ? (
        <p className="grupo-select-hint">
          Aún no has creado grupos. Puedes crearlos en la sección "Grupos" para dirigir recursos a estudiantes específicos.
        </p>
      ) : (
        <>
          <ul className="grupo-select-lista">
            <li>
              <label className={`grupo-select-opcion ${todosSeleccionados ? 'activa' : ''}`}>
                <input
                  type="radio"
                  name="grupo_ids_todos"
                  checked={todosSeleccionados}
                  onChange={seleccionarTodos}
                  disabled={disabled}
                />
                <span>
                  <strong>Todos los estudiantes</strong>
                  <em>Visible para cualquiera con acceso a tus recursos</em>
                </span>
              </label>
            </li>
            {grupos.map((g) => {
              const activo = seleccionados.includes(g.id);
              return (
                <li key={g.id}>
                  <label className={`grupo-select-opcion ${activo ? 'activa' : ''}`}>
                    <input
                      type="checkbox"
                      checked={activo}
                      onChange={() => alternar(g.id)}
                      disabled={disabled}
                    />
                    <span>
                      <strong>{g.materia} – {g.nombre}</strong>
                      <em>
                        {g.totalEstudiantes ?? g.estudiante_ids?.length ?? 0} estudiante
                        {(g.totalEstudiantes ?? g.estudiante_ids?.length ?? 0) === 1 ? '' : 's'}
                      </em>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="grupo-select-hint">
            {todosSeleccionados
              ? 'Sin grupos seleccionados: lo.verán todos tus estudiantes.'
              : `Seleccionados ${seleccionados.length} grupo${seleccionados.length === 1 ? '' : 's'}. Solo lo verán los estudiantes de esos grupos.`}
          </p>
        </>
      )}
    </div>
  );
};

export default GrupoMultiSelect;
