import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import api from '../../services/api';
import { FaTrashAlt } from 'react-icons/fa';
import { MdLock, MdRocketLaunch } from 'react-icons/md';
import Swal from 'sweetalert2';
import RichTextEditor from '../../components/RichTextEditor';
import GrupoSelect from '../../components/GrupoSelect';
import LessonContent from '../../components/LessonContent';
import './CrearContenido.css';

const TIPO_CONFIG = {
  texto: {
    label: 'Lección',
    requiereContenido: true,
    esRichText: true,
    placeholders: { contenido: 'Escribe aquí el contenido de tu lección...' }
  },
  video: {
    label: 'Video',
    requiereUrl: true,
    urlLabel: 'Enlace de YouTube',
    urlPlaceholder: 'https://www.youtube.com/watch?v=...',
    aceptaArchivo: true,
    archivoLabel: 'Subir archivo .mp4 (alternativa)',
    archivoAcepta: '.mp4',
    mensaje: 'Proporciona un enlace de YouTube o sube un archivo .mp4'
  },
  pdf: {
    label: 'PDF',
    requiereArchivo: true,
    archivoLabel: 'Subir archivo PDF (.pdf)',
    archivoAcepta: '.pdf',
    mensaje: 'Debes cargar un archivo PDF'
  },
  documento: {
    label: 'Word',
    requiereArchivo: true,
    archivoLabel: 'Subir documento (.doc, .docx)',
    archivoAcepta: '.doc,.docx',
    mensaje: 'Debes cargar un archivo de Word'
  }
};

const ContenidoEditar = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [contenido, setContenido] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const isEditMode = location.pathname.endsWith('/editar');

  // Temporal: Simula un hook de autenticación
  const isTeacher = true;

  const [formValues, setFormValues] = useState({
    titulo: '',
    descripcion: '',
    tipo: '',
    modulo: '',
    contenido: '',
    grupo_id: ''
  });
  const [archivo, setArchivo] = useState(null);

  const tipoActual = isEditMode ? formValues.tipo : (contenido?.tipo || '');
  const config = TIPO_CONFIG[tipoActual];

  useEffect(() => {
    const fetchContenido = async () => {
      try {
        const response = await api.get(`/contenidos/${id}`);
        const data = response.data?.data || null;

        if (!data) {
          setError('Contenido no encontrado.');
          return;
        }

        setContenido(data);
        setFormValues({
          titulo: data.titulo || '',
          descripcion: data.descripcion || '',
          tipo: data.tipo || '',
          modulo: data.modulo || '',
          contenido: data.contenido || '',
          grupo_id: data.grupo_id ? String(data.grupo_id) : '',
        });

      } catch (err) {
        console.error('Error al cargar el contenido:', err);
        setError('No se pudo cargar el contenido. Verifica el ID o la conexión.');
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchContenido();
    }
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setArchivo(file || null);
    setError('');
  };

  const inputValido = () => {
    if (!formValues.titulo.trim()) return false;
    if (!formValues.modulo.trim()) return false;
    if (!tipoActual) return false;
    if (!config) return false;

    if (config.requiereContenido && config.esRichText) {
      const textContent = formValues.contenido ? formValues.contenido.replace(/<[^>]*>/g, '').trim() : '';
      if (!textContent) return false;
    } else if (config.requiereContenido && !formValues.contenido.trim()) {
      return false;
    }

    if (config.requiereUrl && config.aceptaArchivo) {
      const tieneUrl = formValues.contenido && formValues.contenido.trim();
      const tieneArchivo = !!archivo;
      if (!tieneUrl && !tieneArchivo) return false;
    }

    if (config.requiereUrl && !config.aceptaArchivo) {
      if (!formValues.contenido.trim()) return false;
    }

    if (config.requiereArchivo && !archivo && !formValues.contenido) return false;

    return true;
  };

  const puedePublicar = inputValido();

  const handleTogglePublicar = async (contenidoItem) => {
    let warningHtml = '';
    if (contenidoItem.publicado) {
      try {
        const evalRes = await api.get(`/evaluaciones?contenido_apoyo_id=${contenidoItem.id}`);
        const relatedEvals = evalRes.data?.data || [];
        if (relatedEvals.length > 0) {
          warningHtml = `
            <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:1rem;text-align:left;font-size:0.85rem;color:#92400e;margin-top:0.75rem;">
              <strong>⚠️ Importante:</strong><br/>
              Este contenido está relacionado con evaluaciones y juegos. Al despublicarlo, todas las evaluaciones y juegos asociados también serán despublicados automáticamente.
            </div>`;
        }
      } catch {}
    }

    const result = await Swal.fire({
      title: `¿${contenidoItem.publicado ? 'Despublicar' : 'Publicar'} contenido?`,
      html: contenidoItem.publicado
        ? `<p style="color:#6b7280;">Al despublicarlo podrás editarlo de nuevo y eliminarlo.</p>${warningHtml}`
        : 'Al publicarlo estará visible para estudiantes y no podrá editarse ni eliminarse.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: contenidoItem.publicado ? '#f59e0b' : '#10b981',
      cancelButtonColor: '#6b7280',
      confirmButtonText: contenidoItem.publicado ? 'Despublicar' : 'Publicar',
      cancelButtonText: 'Cancelar',
    });
    
    if (result.isConfirmed) {
      try {
        await api.put(`/contenidos/${contenidoItem.id}`, { publicado: !contenidoItem.publicado });
        const response = await api.get(`/contenidos/${id}`);
        setContenido(response.data?.data);
        Swal.fire('¡Actualizado!', `Contenido ${contenidoItem.publicado ? 'despublicado' : 'publicado'} correctamente.`, 'success');
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || 'Error al cambiar estado.', 'error');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!puedePublicar) {
      setError('Completa todos los campos obligatorios según el tipo seleccionado.');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('titulo', formValues.titulo);
      formData.append('descripcion', formValues.descripcion);
      formData.append('tipo', tipoActual);
      formData.append('contenido', formValues.contenido);
      formData.append('modulo', formValues.modulo);
      if (formValues.grupo_id) {
        formData.append('grupo_id', formValues.grupo_id);
      }
      if (archivo) {
        formData.append('archivo', archivo);
      }

      await api.put(`/contenidos/${id}`, formData);

      setSuccess('Contenido actualizado correctamente.');
      setTimeout(() => navigate('/contenidos'), 800);
    } catch (err) {
      console.error('Error al actualizar contenido:', err);
      setError(err.response?.data?.message || 'Error al actualizar el contenido. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const result = await Swal.fire({
      title: '¿Eliminar contenido?',
      html: `¿Estás seguro de que deseas eliminar <strong>"${contenido.titulo}"</strong>?
        <br/><br/>
        <div style="background:#fef2f2;border-radius:8px;padding:1rem;text-align:left;font-size:0.85rem;color:#991b1b;border:1px solid #fecaca;">
          <strong>⚠️ Esta acción:</strong>
          <ul style="margin:0.5rem 0 0 1rem;padding:0;">
            <li>Eliminará el progreso de estudiantes relacionado</li>
            <li>Eliminará juegos y evaluaciones relacionados al módulo del contenido si es el único contenido del módulo</li>
            <li>No se puede deshacer</li>
          </ul>
        </div>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    
    if (result.isConfirmed) {
      try {
        const res = await api.delete(`/contenidos/${contenido.id || contenido._id}`);
        Swal.fire({ 
          title: '¡Eliminado!', 
          text: res.data?.message || 'Contenido eliminado correctamente.',
          icon: 'success', 
          timer: 3000, 
          showConfirmButton: false 
        });
        navigate('/contenidos');
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || 'No se pudo eliminar.', 'error');
      }
    }
  };

  if (loading) {
    return (
      <div className="detalle-container cartoon-area">
        <button className="detalle-back" onClick={() => navigate('/contenidos')}>
          ← Volver
        </button>
        <div className="crear-contenido-container">
          <div className="crear-contenido-card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: '#6b7280' }}>Cargando contenido...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !contenido) {
    return (
      <div className="detalle-container cartoon-area">
        <button className="detalle-back" onClick={() => navigate('/contenidos')}>
          ← Volver
        </button>
        <div className="crear-contenido-container">
          <div className="crear-contenido-card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: '#dc2626' }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!contenido) {
    return (
      <div className="detalle-container cartoon-area">
        <button className="detalle-back" onClick={() => navigate('/contenidos')}>
          ← Volver
        </button>
        <div className="crear-contenido-container">
          <div className="crear-contenido-card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: '#6b7280' }}>Contenido no encontrado.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="detalle-container cartoon-area">
      <button className="detalle-back" onClick={() => navigate('/contenidos')}>
        ← Volver
      </button>

      {isEditMode ? (
        <div className="crear-contenido-container">
          <div className="crear-contenido-card">
            <h2>Editar contenido</h2>

            <form onSubmit={handleSubmit} className="crear-contenido-form">
              <label>
                Título
                <input
                  type="text"
                  name="titulo"
                  value={formValues.titulo}
                  onChange={handleChange}
                  placeholder="Título del contenido"
                  required
                />
              </label>

              <label>
                Descripción (opcional)
                <textarea
                  name="descripcion"
                  value={formValues.descripcion}
                  onChange={handleChange}
                  placeholder="Información adicional del contenido"
                  rows="3"
                />
              </label>

              <label>
                Tipo de contenido
                <select name="tipo" value={formValues.tipo} onChange={handleChange} required>
                  <option value="">Selecciona un tipo</option>
                  {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </label>

              {config && (
                <div className="tipo-fields">
                  {config.requiereContenido && !config.esRichText && (
                    <label>
                      Contenido textual
                      <textarea
                        name="contenido"
                        value={formValues.contenido}
                        onChange={handleChange}
                        placeholder={config.placeholders?.contenido || 'Escribe el contenido aqui...'}
                        rows="6"
                      />
                    </label>
                  )}

                  {config.requiereContenido && config.esRichText && (
                    <div className="rte-field">
                      <label>Contenido de la lección</label>
                      <RichTextEditor
                        value={formValues.contenido}
                        onChange={(html) => {
                          setFormValues((prev) => ({ ...prev, contenido: html }));
                          setError('');
                        }}
                        placeholder={config.placeholders?.contenido}
                      />
                    </div>
                  )}

                  {config.requiereUrl && (
                    <label>
                      {config.urlLabel || 'URL del recurso'}
                      <input
                        type="url"
                        name="contenido"
                        value={formValues.contenido}
                        onChange={handleChange}
                        placeholder={config.urlPlaceholder || 'https://...'}
                      />
                    </label>
                  )}

                  {config.aceptaArchivo && (
                    <label className={`file-label ${archivo ? 'file-selected' : ''}`}>
                      {config.archivoLabel || 'Subir archivo'}
                      <input
                        type="file"
                        accept={config.archivoAcepta}
                        onChange={handleFileChange}
                        className="file-input"
                      />
                      {archivo && <span className="file-name">{archivo.name}</span>}
                    </label>
                  )}

                  {config.requiereArchivo && (
                    <label className="file-label">
                      {config.archivoLabel || 'Subir archivo'}
                      <input
                        type="file"
                        accept={config.archivoAcepta}
                        onChange={handleFileChange}
                        className="file-input"
                      />
                      {archivo && <span className="file-name">{archivo.name}</span>}
                    </label>
                  )}

                  {config.mensaje && (
                    <p className="tipo-hint">{config.mensaje}</p>
                  )}
                </div>
              )}

              <label>
                Módulo
                <input
                  type="text"
                  name="modulo"
                  value={formValues.modulo}
                  onChange={handleChange}
                  placeholder="Ej: Matemáticas, Lengua, Ciencias..."
                  required
                />
              </label>

              <GrupoSelect
                value={formValues.grupo_id}
                onChange={(grupoId) => setFormValues((prev) => ({ ...prev, grupo_id: grupoId }))}
              />

              {error && <div className="form-error">{error}</div>}
              {success && <div className="form-success">{success}</div>}

              <button type="submit" className="submit-btn" disabled={loading || !puedePublicar}>
                {loading ? 'Guardando...' : !puedePublicar ? 'Complete los requisitos' : 'Guardar cambios'}
              </button>
            </form>
          </div>
        </div>
      ) : (
         <div className="detalle-card">
          <h2 className="detalle-titulo">{contenido.titulo}</h2>
          <p><strong className="detalle-modulo">Módulo:</strong> {contenido.modulo}</p>
          <p><strong className="detalle-tipo">Tipo del contenido:</strong> {({ texto: 'Lección', video: 'Video', pdf: 'PDF', documento: 'Word', enlace: 'Enlace' })[contenido.tipo] || contenido.tipo}</p>
          <p className="detalle-descripcion">{contenido.descripcion}</p>
          {contenido.tipo === 'texto' ? (
            <div className="detalle-contenido leccion-contenido">
              <LessonContent html={contenido.contenido} />
            </div>
          ) : (
            <p className="detalle-contenido">{contenido.contenido}</p>
          )}
          
          {isTeacher && (
            <div className="detalle-actions">
              <button
                className={`publicar-btn ${contenido.publicado ? 'despublicar' : ''}`}
                onClick={() => handleTogglePublicar(contenido)}
              >
                {contenido.publicado ? <MdLock style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> : <MdRocketLaunch style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />}
                {contenido.publicado ? 'Despublicar' : 'Publicar'}
              </button>
            {!contenido.publicado && (
              <Link to={`/contenidos/${id}/editar`} className="editar-btn-contenido">
                Editar
              </Link>
            )}
            {!contenido.publicado && (
              <button className="eliminar-btn" onClick={handleDelete}>
              <FaTrashAlt style={{ marginRight: '1px' }} />
            </button>
            )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
                 

export default ContenidoEditar;