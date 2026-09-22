import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
  MdPeople, MdTrendingUp, MdStar, MdWarning, MdSearch, MdArrowBack, MdSend
} from 'react-icons/md';
import Swal from 'sweetalert2';
import StudentProgressCard from '../../components/StudentProgressCard';
import './ProgresoEstudiantes.css';

const SECCIONES = [
  { key: 'bajo', label: 'Bajo', desc: 'La nota promedio en la escala 1.0 a 5.0 es menor a 3.0', color: '#ef4444' },
  { key: 'regular', label: 'Regular', desc: 'La nota promedio en la escala 1.0 a 5.0 está entre 3.0 y 3.5', color: '#f59e0b' },
  { key: 'bueno', label: 'Bueno', desc: 'La nota promedio en la escala 1.0 a 5.0 está entre 3.6 y 4.4', color: '#3b82f6' },
  { key: 'excelente', label: 'Excelente', desc: 'La nota promedio en la escala 1.0 a 5.0 es igual o mayor a 4.5', color: '#10b981' },
];

const SECCIONES_POR_KEY = Object.fromEntries(SECCIONES.map(s => [s.key, s]));

// La categoría de cada estudiante llega calculada desde el backend (NotaService);
// aquí solo se utiliza, no se vuelve a clasificar.
const categoriaDe = (student) => student.categoria || 'bajo';

const RendimientoTooltip = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const seccion = payload[0]?.payload;
  if (!seccion || seccion.count === 0) return null;
  return (
    <div className="rendimiento-tooltip">
      <span className="rendimiento-tooltip-dot" style={{ background: seccion.color }} />
      <div className="rendimiento-tooltip-texto">
        <strong>{seccion.label}</strong>
        <span>{seccion.desc}</span>
        <span>{seccion.count} estudiante{seccion.count !== 1 ? 's' : ''}</span>
        <span>{seccion.pct}% del total</span>
      </div>
    </div>
  );
};

const ProgresoEstudiantes = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [studentsModuleData, setStudentsModuleData] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterModulo, setFilterModulo] = useState('');
  const [filterGrupo, setFilterGrupo] = useState('');
  const [sendingReportId, setSendingReportId] = useState(null);
  const [reportMessage, setReportMessage] = useState(null);
  const [reportError, setReportError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, moduleRes] = await Promise.all([
          api.get('/teacher/students/stats'),
          api.get('/teacher/students/module-progress'),
        ]);

        setStats(statsRes.data.data);
        setStudentsModuleData(moduleRes.data.data || []);

        if (moduleRes.data.data.length === 0) {
          setError('No se encontraron estudiantes asociados.');
        }
      } catch (err) {
        console.error('Error al cargar datos:', err);
        if (err.response?.status === 403) {
          setError('No tienes permisos para acceder a esta información.');
        } else {
          setError('Error al cargar los datos de progreso.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const allModules = useMemo(() => {
    const modSet = new Set();
    studentsModuleData.forEach(s => {
      (s.modules || []).forEach(m => modSet.add(m.modulo));
    });
    return [...modSet].sort();
  }, [studentsModuleData]);

  const allGrupos = useMemo(() => {
    const mapa = new Map();
    studentsModuleData.forEach(s => {
      (s.grupos || []).forEach(g => mapa.set(g.id, g));
    });
    return [...mapa.values()];
  }, [studentsModuleData]);

  // Los datos de módulos ya incluyen la nota global (1.0-5.0) calculada en el backend.
  const filteredStudents = useMemo(() => {
    let result = studentsModuleData;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
    }
    if (filterGrupo) {
      const gid = Number(filterGrupo);
      result = result.filter(s => (s.grupos || []).some(g => g.id === gid));
    }
    if (filterModulo) {
      result = result.filter(s => (s.modules || []).some(m => m.modulo.toLowerCase().includes(filterModulo.toLowerCase())));
    }
    return result;
  }, [studentsModuleData, search, filterGrupo, filterModulo]);

  // Distribución por secciones (bajo / regular / bueno / excelente) según la categoría de la nota global.
  const sectionCounts = useMemo(() => {
    const counts = { bajo: 0, regular: 0, bueno: 0, excelente: 0 };
    filteredStudents.forEach(s => {
      counts[categoriaDe(s)] += 1;
    });
    const total = filteredStudents.length;
    return SECCIONES.map(sec => ({
      ...sec,
      count: counts[sec.key],
      pct: total > 0 ? Math.round((counts[sec.key] / total) * 100) : 0,
    }));
  }, [filteredStudents]);

  const sectionData = useMemo(() => {
    return sectionCounts.map(sec => ({
      key: sec.key,
      name: sec.label,
      count: sec.count,
      pct: sec.pct,
      color: sec.color,
      desc: sec.desc,
    }));
  }, [sectionCounts]);

  // Estudiantes visibles según la sección seleccionada en el resumen (la categoría
// viene del backend y coincide con los rangos de nota de la leyenda).
  const visibleStudents = useMemo(() => {
    if (!selectedSection) return filteredStudents;
    return filteredStudents.filter(s => categoriaDe(s) === selectedSection);
  }, [filteredStudents, selectedSection]);

  const selectedSectionInfo = selectedSection ? SECCIONES_POR_KEY[selectedSection] : null;

  const toggleSeccion = (key) => setSelectedSection(selectedSection === key ? null : key);

  const handleSendReport = async (studentId, studentName) => {
    setSendingReportId(studentId);
    setReportMessage(null);
    setReportError(null);
    try {
      const res = await api.post(`/teacher/students/${studentId}/send-report`);
      setReportMessage(res.data?.message || 'El reporte fue enviado correctamente al correo del estudiante.');
    } catch (err) {
      setReportError(err.response?.data?.message || 'No fue posible enviar el reporte. Inténtalo nuevamente.');
    } finally {
      setSendingReportId(null);
    }
  };

  const handleSendAllReports = async () => {
    const confirm = await Swal.fire({
      title: '¿Enviar reporte de todos los estudiantes?',
      text: 'Se enviará el reporte de progreso a todos tus estudiantes con correo verificado. Este proceso puede tardar unos momentos.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, enviar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
    });
    if (!confirm.isConfirmed) return;

    setReportMessage(null);
    setReportError(null);
    Swal.fire({
      title: 'Enviando reportes...',
      text: 'Por favor espera, esto puede tomar unos segundos.',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const res = await api.post('/teacher/students/send-reports');
      const result = res.data?.data;
      Swal.close();
      if (result?.enviados > 0) {
        Swal.fire({
          title: '¡Reportes enviados!',
          text: `Se enviaron ${result.enviados} de ${result.total} reportes correctamente`,
          icon: 'success',
          confirmButtonColor: '#2563eb',
        });
      } else {
        Swal.fire({
          title: 'Sin reportes enviados',
          text: result?.total === 0
            ? 'No hay estudiantes con correo verificado para enviar reportes.'
            : 'No se pudo enviar ningún reporte. Revisa los correos de tus estudiantes.',
          icon: 'info',
          confirmButtonColor: '#2563eb',
        });
      }
    } catch (err) {
      Swal.close();
      Swal.fire({
        title: 'Error',
        text: err.response?.data?.message || 'No fue posible enviar los reportes. Inténtalo nuevamente.',
        icon: 'error',
        confirmButtonColor: '#2563eb',
      });
    }
  };

  if (loading) {
    return <div className="progreso-loading">Cargando datos de estudiantes...</div>;
  }

  return (
    <div className="progreso-container cartoon-area">
      <div className="progreso-header">
        <button className="progreso-volver" onClick={() => navigate('/gestion-alumnos')}>
          <MdArrowBack /> Volver
        </button>
        <h1>Progreso de Estudiantes</h1>
        <p>Panel de monitoreo del rendimiento académico de tus estudiantes por módulo.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="send-all-report-btn" onClick={handleSendAllReports}>
            <MdSend /> Enviar reporte a todos
          </button>
        </div>
      </div>

      {error && studentsModuleData.length === 0 ? (
        <div className="progreso-error-card">
          <MdWarning className="error-icon" />
          <h3>{error}</h3>
          <p>Los datos mostrados corresponden únicamente a los estudiantes registrados por ti.</p>
          <button className="progreso-volver" onClick={() => navigate('/gestion-alumnos')}>
            <MdArrowBack /> Volver a Gestión
          </button>
        </div>
      ) : (
        <>
          <div className="progreso-stats-grid">
            <div className="progreso-stat-card card-total">
              <div className="stat-icon"><MdPeople /></div>
              <div className="stat-info">
                <span className="stat-label">Mis Estudiantes</span>
                <span className="stat-value">{stats?.totalEstudiantes || 0}</span>
              </div>
            </div>
            <div className="progreso-stat-card card-promedio">
              <div className="stat-icon"><MdTrendingUp /></div>
              <div className="stat-info">
                <span className="stat-label">Nota Promedio</span>
                <span className="stat-value">{stats?.promedioGeneral || 0}</span>
              </div>
            </div>
            <div className="progreso-stat-card card-destacados">
              <div className="stat-icon"><MdStar /></div>
              <div className="stat-info">
                <span className="stat-label">Destacados</span>
                <span className="stat-value">{stats?.destacados || 0}</span>
              </div>
            </div>
            <div className="progreso-stat-card card-apoyo">
              <div className="stat-icon"><MdWarning /></div>
              <div className="stat-info">
                <span className="stat-label">Requieren Apoyo</span>
                <span className="stat-value">{stats?.requierenApoyo || 0}</span>
              </div>
            </div>
          </div>

          <div className="progreso-charts-row">
            <div className="progreso-chart-card chart-rendimiento">
              <h3>Rendimiento por Secciones</h3>
              <p className="chart-subtitle">Distribución de estudiantes según su rendimiento (haz clic en una barra para ver el detalle)</p>
              {filteredStudents.length > 0 ? (
                <div className="rendimiento-contenedor">
                  <div className="rendimiento-grafico">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={sectionData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }} barCategoryGap="28%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} interval={0} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                        <YAxis domain={[0, Math.max(filteredStudents.length, 1)]} allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={28} />
                        <Tooltip content={<RendimientoTooltip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                        <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={64}>
                          {sectionData.map(sec => (
                            <Cell
                              key={sec.key}
                              fill={sec.color}
                              cursor="pointer"
                              opacity={!selectedSection || selectedSection === sec.key ? 1 : 0.3}
                              onClick={() => toggleSeccion(sec.key)}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="rendimiento-leyenda">
                    {sectionCounts.map(sec => (
                      <button
                        key={sec.key}
                        type="button"
                        className={`leyenda-derecha-item ${selectedSection === sec.key ? 'activo' : ''}`}
                        onClick={() => toggleSeccion(sec.key)}
                      >
                        <span className="leyenda-punto" style={{ background: sec.color }} />
                        <span className="leyenda-texto">
                          {sec.label}
                          <small>{sec.desc}</small>
                        </span>
                        <span className="leyenda-conteo">{sec.count} ({sec.pct}%)</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="chart-empty">Sin datos suficientes para mostrar el resumen.</div>
              )}
            </div>
          </div>

          <div className="progreso-filters">
            <div className="search-box">
              <MdSearch className="search-icon" />
              <input type="text" placeholder="Buscar estudiante por nombre o email..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="filter-select" value={filterModulo} onChange={(e) => setFilterModulo(e.target.value)}>
              <option value="">Todos los módulos</option>
              {allModules.map((m) => (<option key={m} value={m}>{m}</option>))}
            </select>
            {allGrupos.length > 0 && (
              <select className="filter-select" value={filterGrupo} onChange={(e) => setFilterGrupo(e.target.value)}>
                <option value="">Todos los grupos</option>
                {allGrupos.map((g) => (<option key={g.id} value={g.id}>{g.materia} – {g.nombre}</option>))}
              </select>
            )}
          </div>

          {reportMessage && (
            <div className="report-feedback report-feedback-success">
              {reportMessage}
            </div>
          )}
          {reportError && (
            <div className="report-feedback report-feedback-error">
              {reportError}
            </div>
          )}

          <div className="module-progress-container">
            {visibleStudents.length === 0 ? (
              <div className="progreso-empty-card">
                <MdWarning className="empty-icon" />
                <p>
                  {selectedSection
                    ? `No hay estudiantes en la sección "${selectedSectionInfo.label}" con los filtros aplicados.`
                    : search || filterModulo || filterGrupo
                      ? 'No se encontraron estudiantes con los filtros aplicados.'
                      : 'No hay estudiantes registrados. Registra tu primer estudiante.'}
                </p>
              </div>
            ) : (
              <>
                {selectedSection && (
                  <div className="seccion-detalle-banner">
                    <div>
                      <h3>Estudiantes con rendimiento {selectedSectionInfo.label}</h3>
                      <p>{selectedSectionInfo.desc} · {visibleStudents.length} estudiante{visibleStudents.length !== 1 ? 's' : ''}</p>
                    </div>
                    <button className="seccion-detalle-volver" onClick={() => setSelectedSection(null)}>
                      Volver al resumen
                    </button>
                  </div>
                )}
                {visibleStudents.map((student) => (
                  <StudentProgressCard
                    key={student.id}
                    student={student}
                    sendingReportId={sendingReportId}
                    onSendReport={handleSendReport}
                  />
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ProgresoEstudiantes;
