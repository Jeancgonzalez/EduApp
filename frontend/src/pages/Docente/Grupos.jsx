import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  MdGroup, MdArrowBack, MdAdd, MdEdit, MdDelete,
  MdPeopleOutline, MdPerson, MdCheck
} from 'react-icons/md';
import Swal from 'sweetalert2';
import './Grupos.css';

const ITEMS_PER_PAGE = 8;

const Grupos = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [grupos, setGrupos] = useState([]);
  const [estudiantes, setEstudiantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchGrupos = async () => {
    setLoading(true);
    try {
      const res = await api.get('/teacher/grupos');
      setGrupos(res.data?.data?.grupos || []);
      setEstudiantes(res.data?.data?.estudiantes || []);
    } catch (err) {
      console.error('Error al cargar grupos:', err);
      Swal.fire('Error', 'No se pudieron cargar los grupos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGrupos(); }, []);

  const filteredGrupos = useMemo(() => {
    if (!search) return grupos;
    const q = search.toLowerCase();
    return grupos.filter(g =>
      g.materia.toLowerCase().includes(q) || g.nombre.toLowerCase().includes(q)
    );
  }, [grupos, search]);

  const totalPages = Math.max(1, Math.ceil(filteredGrupos.length / ITEMS_PER_PAGE));
  const paginatedGrupos = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredGrupos.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredGrupos, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const openCreateEditModal = async (grupo) => {
    const isEdit = !!grupo;
    const { value: formValues } = await Swal.fire({
      title: isEdit ? `Editar Grupo: ${grupo.nombre}` : 'Crear Nuevo Grupo',
      width: 460,
      html: `
        <div style="text-align:left;font-family:Inter,sans-serif;">
          <div style="margin-bottom:1.5rem;">
            <label style="display:block;margin-bottom:0.25rem;font-weight:600;font-size:0.9rem;color:#374151;">Materia *</label>
            <input id="swal-materia" class="swal2-input" placeholder="Ej: Matemáticas, Lengua, Ciencias..." value="${isEdit ? (grupo.materia || '') : ''}" style="width:100%;box-sizing:border-box;margin:0;">
          </div>
          <div style="margin-bottom:1rem;">
            <label style="display:block;margin-bottom:0.25rem;font-weight:600;font-size:0.9rem;color:#374151;">Nombre del grupo *</label>
            <input id="swal-nombre" class="swal2-input" placeholder="Ej: 3ro A, Grupo B..." value="${isEdit ? (grupo.nombre || '') : ''}" style="width:100%;box-sizing:border-box;margin:0;">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: isEdit ? 'Guardar cambios' : 'Crear grupo',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#6b7280',
      preConfirm: () => {
        const materia = document.getElementById('swal-materia').value.trim();
        const nombre = document.getElementById('swal-nombre').value.trim();
        if (!materia) { Swal.showValidationMessage('La materia es obligatoria'); return false; }
        if (!nombre) { Swal.showValidationMessage('El nombre del grupo es obligatorio'); return false; }
        return { materia, nombre };
      }
    });

    if (formValues) {
      try {
        if (isEdit) {
          await api.put(`/teacher/grupos/${grupo.id}`, formValues);
        } else {
          await api.post('/teacher/grupos', { ...formValues, docente_id: user.id });
        }
        Swal.fire('¡Éxito!', isEdit ? 'Grupo actualizado correctamente.' : 'Grupo creado correctamente.', 'success');
        fetchGrupos();
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || 'No se pudo guardar el grupo.', 'error');
      }
    }
  };

  const openAssignModal = async (grupo) => {
    const miembrosActuales =
      new Set((grupo.estudiante_ids || []).map((id) => Number(id)));

    const checkboxesHtml = estudiantes.length
      ? estudiantes.map((e, index) => `
          <label style="display:flex;align-items:center;gap:0.6rem;padding:0.45rem 0.25rem;cursor:pointer;font-size:0.9rem;color:#334155;border-bottom:1px solid #f1f5f9;">
            <input type="checkbox" id="swal-est-${e.id}" value="${e.id}" ${miembrosActuales.has(Number(e.id)) ? 'checked' : ''}>
            <span style="flex:1;">${e.name}</span>
            <span style="color:#94a3b8;font-size:0.8rem;">${e.email}</span>
          </label>
        `).join('')
      : '<p style="color:#94a3b8;text-align:center;padding:1rem 0;">No hay estudiantes registrados todavía.</p>';

    const { isConfirmed } = await Swal.fire({
      title: `Asignar estudiantes a "${grupo.nombre}"`,
      width: 520,
      html: `
        <div style="text-align:left;font-family:Inter,sans-serif;max-height:380px;overflow-y:auto;">
          ${checkboxesHtml}
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar asignación',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#6b7280',
    });

    if (isConfirmed) {
      const estSeleccionados = estudiantes
        .filter((e) => document.getElementById(`swal-est-${e.id}`)?.checked)
        .map((e) => e.id);
      try {
        await api.put(`/teacher/grupos/${grupo.id}/estudiantes`, { estudiante_ids: estSeleccionados });
        Swal.fire('¡Éxito!', 'Estudiantes asignados al grupo correctamente.', 'success');
        fetchGrupos();
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || 'No se pudo asignar los estudiantes.', 'error');
      }
    }
  };

  const handleDelete = async (grupo) => {
    const result = await Swal.fire({
      title: `¿Eliminar el grupo "${grupo.nombre}"?`,
      html: '<p style="color:#6b7280;">Los recursos (contenidos, evaluaciones y juegos) asociados a este grupo pasarán a ser visibles para <strong>todos</strong> los estudiantes.</p>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/teacher/grupos/${grupo.id}`);
        Swal.fire('¡Eliminado!', 'El grupo fue eliminado correctamente.', 'success');
        fetchGrupos();
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || 'No se pudo eliminar el grupo.', 'error');
      }
    }
  };

  const totalEstudiantesGrupos = grupos.reduce((acc, g) => acc + (g.totalEstudiantes || 0), 0);

  return (
    <div className="grupos-container cartoon-area">
      <button className="grupos-volver" onClick={() => navigate('/gestion-alumnos')}>
        <MdArrowBack /> Volver
      </button>

      <div className="grupos-header">
        <div className="grupos-header-icon">
          <MdGroup />
        </div>
        <div>
          <h1>Gestión de Grupos</h1>
          <p>Crea grupos de estudiantes y asigna contenidos, evaluaciones y juegos de forma dirigida.</p>
        </div>
      </div>

      <div className="grupos-summary">
        <div className="grupos-summary-card">
          <MdGroup className="summary-icon" />
          <div>
            <span className="summary-value">{grupos.length}</span>
            <span className="summary-label">Grupos</span>
          </div>
        </div>
        <div className="grupos-summary-card">
          <MdPeopleOutline className="summary-icon check" />
          <div>
            <span className="summary-value">{totalEstudiantesGrupos}</span>
            <span className="summary-label">Estudiantes en grupos</span>
          </div>
        </div>
        <div className="grupos-summary-card">
          <MdPerson className="summary-icon" />
          <div>
            <span className="summary-value">{estudiantes.length}</span>
            <span className="summary-label">Estudiantes registrados</span>
          </div>
        </div>
        <button className="grupos-register-btn" onClick={() => openCreateEditModal(null)}>
          <MdAdd /> Nuevo Grupo
        </button>
      </div>

      {loading ? (
        <div className="grupos-loading">Cargando grupos...</div>
      ) : (
        <>
          <div className="grupos-toolbar">
            <div className="grupos-search-box">
              <MdPerson className="grupos-search-icon" />
              <input
                type="text"
                placeholder="Buscar por materia o nombre del grupo..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              />
              {search && (
                <button className="grupos-search-clear" onClick={() => setSearch('')} title="Limpiar búsqueda">×</button>
              )}
            </div>
          </div>

          <div className="grupos-table-wrapper">
            <table className="grupos-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Grupo</th>
                  <th>Materia</th>
                  <th>Estudiantes</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedGrupos.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="grupos-table-empty">
                      No hay grupos todavía.
                    </td>
                  </tr>
                ) : (
                  paginatedGrupos.map((g, idx) => (
                    <tr key={g.id}>
                      <td className="td-num">{(currentPage - 1) * ITEMS_PER_PAGE + idx + 1}</td>
                      <td>
                        <div className="td-name">
                          <div className="grupos-avatar">{g.nombre.charAt(0).toUpperCase()}</div>
                          <span className="grupos-nombre">{g.nombre}</span>
                        </div>
                      </td>
                      <td className="td-materia">{g.materia}</td>
                      <td>
                        <span className="grupos-count-badge">
                          {g.totalEstudiantes || 0} estudiantes
                        </span>
                      </td>
                      <td>
                        <div className="td-actions">
                          <button
                            className="grupos-action-btn assign-btn"
                            title="Asignar estudiantes"
                            onClick={() => openAssignModal(g)}
                          >
                            <MdPerson />
                          </button>
                          <button
                            className="grupos-action-btn edit-btn"
                            title="Editar grupo"
                            onClick={() => openCreateEditModal(g)}
                          >
                            <MdEdit />
                          </button>
                          <button
                            className="grupos-action-btn delete-btn"
                            title="Eliminar grupo"
                            onClick={() => handleDelete(g)}
                          >
                            <MdDelete />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="grupos-pagination">
              <button
                className="pagination-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                ← Anterior
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  className={`pagination-btn ${page === currentPage ? 'active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
              <button
                className="pagination-btn"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Grupos;