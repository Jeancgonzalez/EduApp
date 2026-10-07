import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppRoutes from './routes/AppRoutes';
import Navbar from './components/layout/Navbar';
import { useSesionTelemetria } from './hooks/useTelemetria';

// Rutas donde la Navbar global debe ser visible.
// NOTE: '/dashboard/analitica' se quitó a propósito: esa sección monta su
// propio NavbarAnalitica dentro de DashboardDocenteAnalitica.
const navbarRoutes = [
  '/contenidos',
  '/juegos',
  '/evaluaciones',
  '/gestion-alumnos',
  '/student/contenidos',
  '/student/juegos',
  '/student/evaluaciones',
  '/student/progreso',
];

const Layout = () => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  const showNavbar =
    isAuthenticated &&
    navbarRoutes.some((route) => location.pathname.startsWith(route));

  // El heartbeat se monta aquí para que sobreviva a la navegación entre
  // contenidos, juegos y evaluaciones, que es lo que mide el tiempo activo.
  useSesionTelemetria();

  return (
    <>
      {showNavbar && <Navbar />}
      <AppRoutes />
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Layout />
      </Router>
    </AuthProvider>
  );
}

export default App;