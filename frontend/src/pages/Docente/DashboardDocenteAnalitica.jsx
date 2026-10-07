import React from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import ResumenGeneral from './ResumenGeneral';
import VistaGrupo from './VistaGrupo';
import FiltrosAnalitica from './FiltrosAnalitica';
import ProgresoIndividual from './ProgresoIndividual';
import Gamificacion from './Gamificacion';
import Contenidos from './ContenidosAnalitica';
import ReportesNotificaciones from './ReportesNotificaciones';
import NavbarAnalitica from '../../components/layout/NavbarAnalitica';
import './DashboardDocenteAnalitica.css';

const sectionFromPath = (pathname) => {
  const mapping = {
    '/dashboard/analitica/resumen': 'resumen',
    '/dashboard/analitica/vista-grupo': 'vista-grupo',
    '/dashboard/analitica/progreso-individual': 'progreso-individual',
    '/dashboard/analitica/contenidos': 'contenidos',
    '/dashboard/analitica/gamificacion': 'gamificacion',
    '/dashboard/analitica/reportes': 'reportes',
  };
  return mapping[pathname] || 'resumen';
};

const DashboardDocenteAnalitica = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const grupoId = searchParams.get('grupoId') ? Number(searchParams.get('grupoId')) : null;
  const semanas = Number(searchParams.get('semanas')) || 8;
  const section = sectionFromPath(location.pathname);

  const renderSeccion = () => {
    if (section === 'resumen') {
      return <ResumenGeneral grupoId={grupoId} semanas={semanas} />;
    }
    if (section === 'vista-grupo') {
      return <VistaGrupo grupoId={grupoId} semanas={semanas} />;
    }
    if (section === 'progreso-individual') {
      return <ProgresoIndividual />;
    }
    if (section === 'contenidos') {
      return <Contenidos grupoId={grupoId} semanas={semanas} />;
    }
    if (section === 'gamificacion') {
      return <Gamificacion grupoId={grupoId} semanas={semanas} />;
    }
    if (section === 'reportes') {
      return <ReportesNotificaciones />;
    }
    return <div className="dash-vacio">Sección no disponible.</div>;
  };

  return (
    <>
      <NavbarAnalitica />
      {section !== 'reportes' && <FiltrosAnalitica />}
      {renderSeccion()}
    </>
  );
};

export default DashboardDocenteAnalitica;