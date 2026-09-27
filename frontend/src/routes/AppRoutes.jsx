import { Routes, Route, Navigate } from 'react-router-dom';
import Login from '../pages/Login';
import RegistrarDocente from '../pages/RegisterDocente';
import VerificarCorreo from '../pages/VerificarCorreo';
import RecuperarPassword from '../pages/RecuperarPassword';
import RegistrarEstudiante from '../pages/Docente/RegisterEstudiante';
import DashboardDocente from '../pages/Docente/DashboardDocente';
import Contenidos from '../pages/Docente/Contenidos';
import ContenidoEditar from '../pages/Docente/ContenidoEditar';
import CrearContenido from '../pages/Docente/CrearContenido';
import Evaluaciones from '../pages/Docente/Evaluaciones';
import CrearEvaluacion from '../pages/Docente/CrearEvaluacion';
import ProtectedRoute from './ProtectedRoute';
import EvaluacionesEditar from '../pages/Docente/EvaluacionesEditar';
import Juegos from '../pages/Docente/Juegos';
import CrearJuegos from '../pages/Docente/CrearJuegos';
import JuegosEditar from '../pages/Docente/JuegosEditar';
import GestionAlumnos from '../pages/Docente/GestionAlumnos';
import ProgresoEstudiantes from '../pages/Docente/ProgresoEstudiantes';

import CuentasEstudiantes from '../pages/Docente/CuentasEstudiantes';
import Grupos from '../pages/Docente/Grupos';

import StudentDashboard from '../pages/Estudiantes/StudentDashboard';
import StudentContenidos from '../pages/Estudiantes/StudentContenidos';
import StudentContenidoDetalle from '../pages/Estudiantes/StudentContenidoDetalle';
import StudentJuegos from '../pages/Estudiantes/StudentJuegos';
import StudentJuegoResolver from '../pages/Estudiantes/StudentJuegoResolver';
import StudentEvaluaciones from '../pages/Estudiantes/StudentEvaluaciones';
import StudentEvaluacionResolver from '../pages/Estudiantes/StudentEvaluacionResolver';
import StudentProgreso from '../pages/Estudiantes/StudentProgreso';
import StudentMisionDigital from '../pages/Estudiantes/StudentMisionDigital';
import MisionRequeridaGate from './MisionRequeridaGate';

const AppRoutes = () => {
  return (
    <Routes>
      {/* Rutas públicas */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/registroDocente" element={<RegistrarDocente />} />
      <Route path="/verificar-correo" element={<VerificarCorreo />} />
      <Route path="/recuperar-password" element={<RecuperarPassword />} />

      {/* Ruta protegida solo para profesores */}
      <Route 
        path="/registroEstudiante" 
        element={
          <ProtectedRoute>
            <RegistrarEstudiante />
          </ProtectedRoute>
        } 
      />

      {/* Dashboard Docente*/}
      <Route
        path="/docente/dashboard"
        element={
          <ProtectedRoute>
            <DashboardDocente />
          </ProtectedRoute>
        }
      />

      {/* Rutas de Contenidos */}
      <Route
        path="/contenidos"
        element={
          <ProtectedRoute>
            <Contenidos />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/contenidos/:id"
        element={
          <ProtectedRoute>
            <ContenidoEditar/>
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/contenidos/:id/editar"
        element={
          <ProtectedRoute requiredRole="teacher">
            <ContenidoEditar />
          </ProtectedRoute>
        }
      />

      <Route
        path="/crear-contenido"
        element={
          <ProtectedRoute requiredRole="teacher">
            <CrearContenido />
          </ProtectedRoute>
        }
      />

      {/* Rutas de Evaluaciones */}
      <Route
        path="/evaluaciones"
        element={
          <ProtectedRoute>
            <Evaluaciones />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/evaluaciones/:id"
        element={
          <ProtectedRoute>
            <EvaluacionesEditar />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/evaluaciones/:id/editar"
        element={
          <ProtectedRoute requiredRole="teacher">
            <EvaluacionesEditar />
          </ProtectedRoute>
        }
      />

      <Route
        path="/crear-evaluacion"
        element={
          <ProtectedRoute requiredRole="teacher">
            <CrearEvaluacion />
          </ProtectedRoute>
        }
      />

      {/* Rutas de Juegos */}
      <Route 
        path="/juegos"
        element={
          <ProtectedRoute>
            <Juegos />
          </ProtectedRoute>
        }
      />

      <Route
        path="/crear-juegos"
        element={
          <ProtectedRoute requiredRole="teacher">
            <CrearJuegos />
          </ProtectedRoute>
        }
      />

      <Route
        path="/editar-juego/:id"
        element={
          <ProtectedRoute requiredRole="teacher">
            <JuegosEditar />
          </ProtectedRoute>
        }
      />

      {/* Rutas de Gestión de Estudiantes */}
      <Route
        path="/gestion-alumnos"
        element={
          <ProtectedRoute requiredRole="teacher">
            <GestionAlumnos />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gestion-alumnos/progreso"
        element={
          <ProtectedRoute requiredRole="teacher">
            <ProgresoEstudiantes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gestion-alumnos/cuentas"
        element={
          <ProtectedRoute requiredRole="teacher">
            <CuentasEstudiantes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gestion-alumnos/grupos"
        element={
          <ProtectedRoute requiredRole="teacher">
            <Grupos />
          </ProtectedRoute>
        }
      />

      {/* Ruta de resumen de progreso docente */}
<Route
        path="/gestion-alumnos/grupos"
        element={
          <ProtectedRoute requiredRole="teacher">
            <Grupos />
          </ProtectedRoute>
        }
      />

{/* Rutas de Estudiante */}
      <Route
        path="/student/dashboard"
        element={
          <ProtectedRoute>
            <MisionRequeridaGate>
              <StudentDashboard />
            </MisionRequeridaGate>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/contenidos"
        element={
          <ProtectedRoute>
            <MisionRequeridaGate>
              <StudentContenidos />
            </MisionRequeridaGate>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/contenidos/:id"
        element={
          <ProtectedRoute>
            <MisionRequeridaGate>
              <StudentContenidoDetalle />
            </MisionRequeridaGate>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/juegos"
        element={
          <ProtectedRoute>
            <MisionRequeridaGate>
              <StudentJuegos />
            </MisionRequeridaGate>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/juegos/:id"
        element={
          <ProtectedRoute>
            <MisionRequeridaGate>
              <StudentJuegoResolver />
            </MisionRequeridaGate>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/evaluaciones"
        element={
          <ProtectedRoute>
            <MisionRequeridaGate>
              <StudentEvaluaciones />
            </MisionRequeridaGate>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/evaluaciones/:id"
        element={
          <ProtectedRoute>
            <MisionRequeridaGate>
              <StudentEvaluacionResolver />
            </MisionRequeridaGate>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/progreso"
        element={
          <ProtectedRoute>
            <MisionRequeridaGate>
              <StudentProgreso />
            </MisionRequeridaGate>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student/mision"
        element={
          <ProtectedRoute>
            <StudentMisionDigital />
          </ProtectedRoute>
        }
      />

      {/* Ruta 404 - No encontrada */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default AppRoutes;