import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api';

/**
 * Barrera para el apartado de estudiante: si el docente registró al estudiante
 * con la Misión Digital obligatoria y aún no la completa, lo redirigimos a
 * /student/mision antes de tocar cualquier otra sección del aplicativo.
 * Usa `obligatorio` devuelto por el backend (no depende del JWT), así la regla
 * se cumple también para sesiones iniciadas antes de este cambio.
 */
const MisionRequeridaGate = ({ children }) => {
  const [estado, setEstado] = useState({ cargando: true, obligatoria: false, completada: false });

  useEffect(() => {
    let activo = true;
    api.get('/student/diagnostico')
      .then(res => {
        if (!activo) return;
        const d = res.data?.data || {};
        setEstado({
          cargando: false,
          obligatoria: d.obligatorio === true,
          completada: d.estado === 'completado',
        });
      })
      .catch(() => {
        // Si el estado no se puede consultar no bloqueamos la navegación.
        if (activo) setEstado({ cargando: false, obligatoria: false, completada: false });
      });
    return () => { activo = false; };
  }, []);

  if (estado.cargando) {
    return <div className="dashboard-container student-area"><div className="loading">Revisando tu Misión Digital...</div></div>;
  }

  if (estado.obligatoria && !estado.completada) {
    return <Navigate to="/student/mision" replace />;
  }

  return children;
};

export default MisionRequeridaGate;