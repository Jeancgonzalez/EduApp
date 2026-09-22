import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
  MdSearch, MdArrowBack, MdVisibility, MdVisibilityOff,
  MdEdit, MdDelete, MdPeople, MdPersonAdd, MdCheckCircle,
  MdCancel, MdWarning, MdSchool
} from 'react-icons/md';
import { FaTrashAlt } from 'react-icons/fa';
import Swal from 'sweetalert2';
import './CuentasEstudiantes.css';

const ITEMS_PER_PAGE = 8;

const CuentasEstudiantes = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingStudent, setEditingStudent] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(null);
  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await api.get('/cuentas');
      setStudents(res.data.data || []);
    } catch (err) {
      console.error('Error al cargar estudiantes:', err);
      Swal.fire('Error', 'No se pudieron cargar los estudiantes.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStudents(); }, []);

  const filteredStudents = useMemo(() => {
    if (!search) return students;
    const q = search.toLowerCase();
    return students.filter(s =>
      s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    );
  }, [students, search]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / ITEMS_PER_PAGE));
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredStudents.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredStudents, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const handleEdit = async (student) => {
    const { value: formValues } = await Swal.fire({
      title: `Estudiante: ${student.name}`,
      width: 480,
      html: `
        <div style="text-align:left;font-family:Inter,sans-serif;">
          <div style="margin-bottom:1.5rem;">
          <label style="display:block;margin-bottom:0.25rem; font-weight:600; font-size:0.95rem; color:#374151; " align="center" >Nombre</label>
          <input id="swal-name" class="swal2-input" value="${student.name}" style="width:100%;box-sizing:border-box;margin:0;">
        </div>

        <div style="margin-bottom:1.5rem;">
           <label style="display:block;margin-bottom:0.25rem; font-weight:600; font-size:0.95rem; color:#374151; " align="center" >Correo electrónico</label>
           <input id="swal-email" class="swal2-input" value="${student.email}" style="width:100%;box-sizing:border-box;margin:0;">
        </div>

        <div style="margin-bottom:1rem;">
          <label style="display:block; margin-bottom:0.25rem; font-weight:600;font-size:0.85rem; color:#374151; " align="center">Nueva contraseña (dejar vacío para mantener la antigua contraseña)</label>
          <div style="position:relative;">
            <input id="swal-password" type="password" class="swal2-input" placeholder="Mínimo 8 caracteres" style="width:100%;box-sizing:border-box;margin:0;padding-right:2.75rem;">
            <button type="button" id="swal-password-toggle" title="Mostrar contraseña" aria-label="Mostrar contraseña" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:transparent;border:none;cursor:pointer;color:#9ca3af;font-size:20px;line-height:1;padding:4px;display:flex;align-items:center;">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
            </button>
          </div>
        </div>

        <div style="margin-bottom:0.5rem;">
          <label style="display:flex;align-items:flex-start;gap:0.5rem;font-weight:600;font-size:0.9rem;color:#374151;cursor:pointer;padding:0.6rem 0.75rem;background:#eef2ff;border:1.5px dashed #c7d2fe;border-radius:10px;">
            <input id="swal-iad" type="checkbox" style="width:18px;height:18px;min-width:18px;margin-top:0.1rem;accent-color:#6366f1;" ${student.iad_obligatorio ? 'checked' : ''}>
            <span>Exigir la Misión Digital (IAD-Primaria) antes del primer acceso</span>
          </label>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar cambios',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#6b7280',
      didOpen: () => {
        const toggleBtn = document.getElementById('swal-password-toggle');
        const input = document.getElementById('swal-password');
        if (toggleBtn && input) {
          toggleBtn.addEventListener('click', () => {
            const isVisible = input.type === 'text';
            input.type = isVisible ? 'password' : 'text';
            toggleBtn.setAttribute('title', isVisible ? 'Mostrar contraseña' : 'Ocultar contraseña');
            toggleBtn.setAttribute('aria-label', isVisible ? 'Mostrar contraseña' : 'Ocultar contraseña');
            toggleBtn.innerHTML = isVisible
              ? '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>';
          });
        }
      },
      preConfirm: () => {
        const name = document.getElementById('swal-name').value.trim();
        const email = document.getElementById('swal-email').value.trim();
        const password = document.getElementById('swal-password').value;
        if (!name) { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
        if (!email) { Swal.showValidationMessage('El correo es obligatorio'); return false; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { Swal.showValidationMessage('Correo no válido'); return false; }
        if (password && password.length < 8) { Swal.showValidationMessage('La contraseña debe tener al menos 8 caracteres'); return false; }
        const iadCheckbox = document.getElementById('swal-iad');
        return { name, email, password, iadObligatorio: iadCheckbox ? iadCheckbox.checked : student.iad_obligatorio };
      }
    });

    if (formValues) {
      try {
        const payload = { name: formValues.name, email: formValues.email };
        if (formValues.password) payload.password = formValues.password;
        payload.iadObligatorio = formValues.iadObligatorio;
        const res = await api.put(`/cuentas/${student.id}`, payload);
        if (res.data.success) {
          Swal.fire({ title: '¡Actualizado!', text: 'Cuenta actualizada correctamente.', icon: 'success', timer: 1500, showConfirmButton: false });
          fetchStudents();
        }
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || 'No se pudo actualizar la cuenta.', 'error');
      }
    }
  };

  const handleDelete = (student) => {
    Swal.fire({
      title: '¿Deseas eliminar este estudiante?',
      html: `<p style="color:#64748b;font-size:0.95rem;">Esta acción no se puede deshacer.</p>
             <p style="font-weight:600;color:#0f172a;">${student.name}</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await api.delete(`/cuentas/${student.id}`);
          Swal.fire({ title: '¡Eliminado!', text: 'Estudiante eliminado correctamente.', icon: 'success', timer: 1500, showConfirmButton: false });
          fetchStudents();
        } catch (err) {
          Swal.fire('Error', err.response?.data?.message || 'No se pudo eliminar.', 'error');
        }
      }
    });
  };

  const handleRevealPassword = async (student) => {
    const confirm = await Swal.fire({
      title: '¿Mostrar contraseña?',
      html: `<p style="color:#64748b;font-size:0.95rem;">Estás a punto de revelar la contraseña de <strong>${student.name}</strong>.</p>
             <p style="color:#ef4444;font-size:0.85rem;">Asegúrate de estar en un entorno privado.</p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, mostrar',
      cancelButtonText: 'Cancelar',
    });

    if (confirm.isConfirmed) {
      try {
        const res = await api.post(`/cuentas/${student.id}/reveal-password`);
        if (res.data.success) {
          Swal.fire({
            title: 'Contraseña del estudiante',
            html: `
              <div style="background:#f8fafc;border-radius:12px;padding:1.5rem;border:1px solid #e2e8f0;">
                <p style="margin:0 0 0.5rem;color:#64748b;font-size:0.85rem;">Estudiante</p>
                <p style="margin:0 0 1rem;font-weight:600;font-size:1.1rem;color:#0f172a;">${student.name}</p>
                <p style="margin:0 0 0.5rem;color:#64748b;font-size:0.85rem;">Contraseña actual</p>
                <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem 1rem;font-family:monospace;font-size:1.1rem;color:#059669;font-weight:700;letter-spacing:0.05em;">
                  ${res.data.data.password}
                </div>
              </div>
            `,
            icon: 'success',
            confirmButtonColor: '#10b981',
            confirmButtonText: 'Cerrar',
          });
        }
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || 'No se pudo obtener la contraseña.', 'error');
      }
    }
  };

  const getStatusBadge = (student) => {
    if (student.createdAt) {
      const daysSinceCreation = Math.floor((Date.now() - new Date(student.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceCreation < 7) return { label: 'Nuevo', className: 'cuentas-badge-new' };
    }
    return { label: 'Activo', className: 'cuentas-badge-active' };
  };

  if (loading) {
    return <div className="cuentas-loading">Cargando estudiantes...</div>;
  }

  return (
    <div className="cuentas-container cartoon-area">
      <div className="cuentas-header">
        <button className="cuentas-volver" onClick={() => navigate('/gestion-alumnos')}>
          <MdArrowBack /> Volver
        </button>
        <div className="cuentas-header-top">
          <div className="cuentas-header-icon">
            <MdSchool />
          </div>
          <div>
            <h1>Gestión de Cuentas de Estudiantes</h1>
            <p>Administra las cuentas de estudiantes registrados por ti.</p>
          </div>
        </div>
      </div>

      <div className="cuentas-summary">
        <div className="cuentas-summary-card">
          <MdPeople className="summary-icon" />
          <div>
            <span className="summary-value">{students.length}</span>
            <span className="summary-label">Total Estudiantes</span>
          </div>
        </div>
        <div className="cuentas-summary-card">
          <MdCheckCircle className="summary-icon check" />
          <div>
            <span className="summary-value">{students.length}</span>
            <span className="summary-label">Cuentas Activas</span>
          </div>
        </div>
        <button className="cuentas-register-btn" onClick={() => navigate('/registroEstudiante')}>
          <MdPersonAdd /> Registrar Estudiante
        </button>
      </div>

      <div className="cuentas-toolbar">
        <div className="cuentas-search-box">
          <MdSearch className="cuentas-search-icon" />
          <input
            type="text"
            placeholder="Buscar estudiante por nombre o email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
          {search && (
            <button className="cuentas-search-clear" onClick={() => { setSearch(''); setCurrentPage(1); }}>
              <MdCancel />
            </button>
          )}
        </div>
      </div>

      <div className="cuentas-table-wrapper">
        <table className="cuentas-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre Completo</th>
              <th>Correo Electrónico</th>
              <th>Contraseña</th>
              <th>Fecha de Registro</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginatedStudents.length === 0 ? (
              <tr>
                <td colSpan="7" className="cuentas-table-empty">
                  {search ? 'No se encontraron estudiantes con ese criterio.' : 'No hay estudiantes registrados. Registra tu primer estudiante.'}
                </td>
              </tr>
            ) : (
              paginatedStudents.map((student, index) => {
                const status = getStatusBadge(student);
                const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
                return (
                  <tr key={student.id}>
                    <td className="td-num">{startIndex + index + 1}</td>
                    <td className="td-name">
                      <div className="cuentas-avatar">{student.name.charAt(0).toUpperCase()}</div>
                      <span className="cuentas-student-name">{student.name}</span>
                    </td>
                    <td className="td-email">{student.email}</td>
                    <td className="td-password">
                      <div className="password-display">
                        <span className="password-dots">{'\u2022'.repeat(10)}</span>
                        <button
                          className="password-reveal-btn"
                          onClick={() => handleRevealPassword(student)}
                          title="Ver contraseña"
                        >
                          <MdVisibility />
                        </button>
                      </div>
                    </td>
                    <td className="td-date">
                      {student.createdAt
                        ? new Date(student.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                    <td>
                      <span className={`cuentas-status-badge ${status.className}`}>{status.label}</span>
                    </td>
                    <td className="td-actions">
                      <button className="cuentas-action-btn edit-btn" onClick={() => handleEdit(student)} title="Editar">
                        <MdEdit />
                      </button>
                      <button className="cuentas-action-btn delete-btn" onClick={() => handleDelete(student)} title="Eliminar">
                        <FaTrashAlt />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="cuentas-pagination">
          <button
            className="pagination-btn"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            Anterior
          </button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i + 1}
              className={`pagination-btn ${currentPage === i + 1 ? 'active' : ''}`}
              onClick={() => setCurrentPage(i + 1)}
            >
              {i + 1}
            </button>
          ))}
          <button
            className="pagination-btn"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
};

export default CuentasEstudiantes;