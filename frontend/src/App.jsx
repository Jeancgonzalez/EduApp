import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppRoutes from './routes/AppRoutes';
import Navbar from './components/layout/Navbar';

// Rutas donde la Navbar debe ser visible (incluye subrutas con startsWith)
const navbarRoutes = ['/contenidos', '/juegos', '/evaluaciones', '/gestion-alumnos',
  '/student/contenidos', '/student/juegos', '/student/evaluaciones', '/student/progreso'];

const Layout = () => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const showNavbar = isAuthenticated && navbarRoutes.some(route => location.pathname.startsWith(route));

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


