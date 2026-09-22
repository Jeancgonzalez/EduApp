import { MdFilterList } from 'react-icons/md';
import './ModuloFiltro.css';

const ModuloFiltro = ({ modulos = [], valor = '', onChange }) => {
  if (modulos.length === 0) return null;
  return (
    <div className="modulo-filtro" role="group" aria-label="Filtrar por módulo">
      <MdFilterList className="modulo-filtro-icon" />
      <label className="grupo-filtro-label" htmlFor="filtro-modulo">Módulo</label>
      <select
        id="filtro-modulo"
        className="filter-select"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Todos los módulos</option>
        {modulos.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
};

export default ModuloFiltro;