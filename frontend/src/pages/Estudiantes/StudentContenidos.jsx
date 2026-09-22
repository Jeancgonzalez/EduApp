import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { MdMenuBook, MdVisibility, MdCheckCircle, MdAdd } from 'react-icons/md';
import MascotaEduApp from '../../components/MascotaEduApp';
import ModuloFiltro from '../../components/ModuloFiltro';
import './StudentContenidos.css';


const tipoNombres = { video: 'Video', pdf: 'PDF', enlace: 'Enlace', texto: 'Lección', documento: 'Word' };

const StudentContenidos = () => {
  const [contenidos, setContenidos] = useState([]);
  const [completados, setCompletados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroModulo, setFiltroModulo] = useState('');

  useEffect(() => {
    // Cargar contenidos publicados
    api.get('/student/contenidos/publicados')
      .then(res => {
        setContenidos(res.data.data || []);
        setError(null);
      })
      .catch(err => {
        console.error('Error al cargar contenidos:', err);
        setError('No se pudieron cargar los contenidos. Intenta nuevamente.');
      });

    // Cargar contenidos completados por el estudiante
    api.get('/student/completados')
      .then(res => setCompletados(res.data.data?.contenidos || []))
      .catch(err => console.error('Error al cargar completados:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="contenidos-container student-area">
        <div className="contenidos-mensaje">Cargando contenidos...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="contenidos-container student-area">
        <div className="contenidos-mensaje error">{error}</div>
      </div>
    );
  }

  const disponiblesIds = new Set(contenidos.map(c => c.id));
  const completadosDisponibles = completados.filter(id => disponiblesIds.has(id));
  const pendientes = Math.max(0, contenidos.length - completadosDisponibles.length);
  const totalCompletados = completadosDisponibles.length;

  const modulos = [...new Set(contenidos.map(c => c.modulo).filter(Boolean))].sort();
  const contenidosVisibles = filtroModulo
    ? contenidos.filter(c => c.modulo === filtroModulo)
    : contenidos;

  return (
    <div className="contenidos-container student-area">
      <div className="contenidos-header">
        <h1 className="contenidos-titulo">
          <MdMenuBook style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />Mis Contenidos
        </h1>
        <MascotaEduApp
          pendientes={pendientes}
          completados={totalCompletados}
          contexto="contenidos"
          className="mascota-header"
        />
      </div>

      {contenidos.length === 0 ? (
        <div className="contenidos-vacio">
          <MdMenuBook style={{ fontSize: '3rem', opacity: 0.5 }} />
          <p>No hay contenidos disponibles en este momento.</p>
          <small>Los docentes aún no han publicado materiales educativos.</small>
        </div>
      ) : (
        <>
          <ModuloFiltro modulos={modulos} valor={filtroModulo} onChange={setFiltroModulo} />
          {contenidosVisibles.length === 0 ? (
            <div className="contenidos-vacio">
              <MdMenuBook style={{ fontSize: '3rem', opacity: 0.5 }} />
              <p>No hay contenidos publicados en este módulo.</p>
            </div>
          ) : (
            <div className="contenidos-grid">
              {contenidosVisibles.map(contenido => {
            const visto = completados.includes(contenido.id);
            return (
              <Link 
                key={contenido.id} 
                to={`/student/contenidos/${contenido.id}`} 
                className="contenido-link"
              >
                <div 
                  className={`contenido-card ${visto ? 'publicado' : ''}`}>
                  <div>
                    <div className="card-info">
                      <span className="badge badge-tipo">
                        {tipoNombres[contenido.tipo] || contenido.tipo}
                      </span>
                      <span className="badge badge-modulo">
                        <MdMenuBook style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> {contenido.modulo}
                      </span>
                    </div>
                    
                    <h3 className="card-titulo">{contenido.titulo}</h3>
                    
                    <p className="card-descripcion">
                      {contenido.descripcion || "Sin descripción"}
                    </p>
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    marginTop: '1rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #f3f4f6'
                  }}>
                    <span className="crear-contenido-btn" style={{ background: visto ? '#6b7280' : 'linear-gradient(135deg, #10b981, #059669)' }}>
                      <MdVisibility style={{ marginRight: '0.25rem' }} /> 
                      {visto ? 'Revisar' : 'Ver Contenido'}
                    </span>
                    
                    {visto && (
                      <span style={{ 
                        fontSize: '0.8rem', 
                        color: '#059669',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <MdCheckCircle /> Completado
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StudentContenidos;