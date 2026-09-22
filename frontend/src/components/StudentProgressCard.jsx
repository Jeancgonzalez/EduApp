import React, { useState } from 'react';
import {
  MdSportsEsports, MdAssignment, MdMenuBook, MdMailOutline, MdStar
} from 'react-icons/md';

// Categorías de rendimiento 1.0-5.0 (las 4 del gráfico). La categoría llega
// calculada desde el backend (NotaService), no se reclasifica aquí.
const CATEGORIA_INFO = {
  excelente: { label: 'Excelente', className: 'badge-excelente' },
  bueno: { label: 'Bueno', className: 'badge-bueno' },
  regular: { label: 'Regular', className: 'badge-regular' },
  bajo: { label: 'Bajo', className: 'badge-bajo' },
};

const getProgressColor = (percentage) => {
  if (percentage >= 80) return '#10b981';
  if (percentage >= 50) return '#f59e0b';
  return '#ef4444';
};

const StudentProgressCard = ({ student, sendingReportId, onSendReport }) => {
  const [iadTooltipOpen, setIadTooltipOpen] = useState(false);
  const diagnostico = student.diagnostico;

  return (
    <div className="student-progress-card">
      <div className="student-progress-header">
        <div className="student-avatar">{student.name.charAt(0).toUpperCase()}</div>
        <div className="student-identity">
          <div className="student-name-row">
            <span className="student-name">{student.name}</span>
            {!student.iad_obligatorio && (
              <span className="iad-pill iad-no-aplicado" title="Este estudiante no tiene asignada la realización obligatoria de la Misión Digital (IAD-Primaria).">
                IAD - No aplicado
              </span>
            )}
            {Boolean(student.iad_obligatorio) && !diagnostico && (
              <span className="iad-pill iad-pendiente" title="El estudiante debe completar la Misión Digital antes de usar el aplicativo.">
                IAD pendiente
              </span>
            )}
            {diagnostico && (
              <span
                className={`iad-pill-contenedor ${iadTooltipOpen ? 'abierto' : ''}`}
                onClick={() => setIadTooltipOpen(prev => !prev)}
                onMouseEnter={() => setIadTooltipOpen(true)}
                onMouseLeave={() => setIadTooltipOpen(false)}
              >
                <span className={`iad-pill iad-${String(diagnostico.nivel).toLowerCase()}`}>
                  IAD: {diagnostico.nivel}
                </span>
                <span className="iad-tooltip">
                  <strong>IAD-Primaria</strong>
                  <span className="iad-tooltip-resumen">
                    {diagnostico.puntaje_total}/30 · Nivel {diagnostico.nivel}
                  </span>
                  {(diagnostico.desglose?.dimensiones || []).map(dim => (
                    <span key={dim.key} className="iad-tooltip-fila">
                      <span className="iad-tooltip-nombre">{dim.nombre}</span>
                      <span className="iad-tooltip-valor">{dim.obtenido}/{dim.maximo} ({dim.porcentaje}%)</span>
                    </span>
                  ))}
                  {diagnostico.desglose?.fortaleza && (
                    <span className="iad-tooltip-texto">
                      <strong>Fortaleza:</strong> {diagnostico.desglose.fortaleza.nombre} ({diagnostico.desglose.fortaleza.porcentaje}%)
                    </span>
                  )}
                  {diagnostico.desglose?.oportunidad && (
                    <span className="iad-tooltip-texto">
                      <strong>Oportunidad:</strong> {diagnostico.desglose.oportunidad.nombre} ({diagnostico.desglose.oportunidad.porcentaje}%)
                    </span>
                  )}
                </span>
              </span>
            )}
          </div>
          <span className="student-email">{student.email}</span>
        {student.grupos && student.grupos.length > 0 && (
          <div className="student-grupo-badges">
            {student.grupos.map((g) => (
              <span key={g.id} className="student-grupo-badge">{g.materia} – {g.nombre}</span>
            ))}
          </div>
        )}
      </div>
      <button
        className="send-report-btn"
        onClick={() => onSendReport(student.id, student.name)}
        disabled={sendingReportId === student.id}
      >
        <MdMailOutline />
        {sendingReportId === student.id ? 'Enviando...' : 'Enviar reporte por correo'}
      </button>
    </div>
    {student.modules && student.modules.length > 0 ? (
      <div className="module-cards-grid">
        {student.modules.map((mod, idx) => {
          const categoriaInfo = CATEGORIA_INFO[mod.categoria] || CATEGORIA_INFO.bajo;
          const barColor = getProgressColor(mod.porcentaje_avance);
          return (
            <div key={idx} className="module-card">
              <div className="module-card-header">
                <h4 className="module-name">{mod.modulo}</h4>
                <span className={`status-badge ${categoriaInfo.className}`}>{categoriaInfo.label}</span>
              </div>
              <div className="module-progress-bar-container">
                <div className="module-progress-bar" style={{ width: `${mod.porcentaje_avance}%`, backgroundColor: barColor }}>
                  <span>{mod.porcentaje_avance}%</span>
                </div>
              </div>
              <div className="module-activity-stats">
                <div className="module-stat-item">
                  <MdMenuBook className="module-stat-icon" />
                  <span className="module-stat-value">{mod.contents.completed}/{mod.contents.total}</span>
                  <span className="module-stat-label">Contenidos</span>
                </div>
                <div className="module-stat-item">
                  <MdSportsEsports className="module-stat-icon" />
                  <span className="module-stat-value">{mod.games.completed}/{mod.games.total}</span>
                  <span className="module-stat-label">Juegos</span>
                </div>
                <div className="module-stat-item">
                  <MdAssignment className="module-stat-icon" />
                  <span className="module-stat-value">{mod.evals.completed}/{mod.evals.total}</span>
                  <span className="module-stat-label">Evaluaciones</span>
                </div>
              </div>
              <div className="module-card-footer">
                <div className="module-score">
                  <MdStar className="score-icon" />
                  <span>{mod.puntaje_total} pts</span>
                  {mod.nota !== null && mod.nota !== undefined && (
                    <span className="module-score-nota">· Nota: {Number(mod.nota).toFixed(1)}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="no-modules-message">Este estudiante aún no ha iniciado actividades en ningún módulo.</div>
    )}
  </div>
  );
};

export default StudentProgressCard;