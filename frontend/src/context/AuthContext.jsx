import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { cerrarSesion } from '../services/telemetria';

const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  isTeacher: false,
  notificationCount: 0,
  setNotificationCount: () => {},
  login: () => {},
  logout: () => {},
  emit: () => {},
  on: () => {},
});

const parseJwt = (token) => {
  if (!token) return null;

  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.warn('Token inválido en AuthContext:', error);
    localStorage.removeItem('token');
    return null;
  }
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => parseJwt(localStorage.getItem('token')));
  const [notificationCount, setNotificationCount] = useState(0);

  const isTeacher = !!user && (user.role === 'teacher' || user.role === 'docente');
  const isAuthenticated = !!user;

  // ---------- Carga del contador de notificaciones ----------
  // El endpoint es exclusivo de docentes (`isTeacher` en el backend). Si la
  // consulta se lanza con el token de un estudiante devuelve 403 y el
  // interceptor de axios desloguea la sesión, así que solo se consulta cuando
  // el usuario conectado es docente.
  const loadNotificationCount = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setNotificationCount(0);
      return;
    }
    try {
      const res = await api.get('/teacher/notifications/count');
      setNotificationCount(res.data?.data?.count || 0);
    } catch (err) {
      // Silencioso: puede ser 404 si aún no implementas el endpoint.
      // No rompemos la app por un contador.
      console.warn('[Auth] No se pudo cargar el contador de notificaciones:', err.message);
      setNotificationCount(0);
    }
  }, []);

  useEffect(() => {
    if (user && isTeacher) loadNotificationCount();
    else setNotificationCount(0);
  }, [user, isTeacher, loadNotificationCount]);

  // ---------- Login / Logout ----------
  const login = useCallback((token) => {
    localStorage.setItem('token', token);
    setUser(parseJwt(token));
    // El useEffect se encargará de cargar el contador cuando user cambie.
  }, []);

  const logout = useCallback(() => {
    try { cerrarSesion(); } catch (e) { /* ignorar */ }
    localStorage.removeItem('token');
    setUser(null);
    setNotificationCount(0);
  }, []);

  // ---------- Bus de eventos simple ----------
  // Permite que componentes como ReportesNotificaciones hagan emit('evento', datos)
  // y otros puedan escuchar con on('evento', handler).
  const listenersRef = React.useRef({});

  const emit = useCallback((event, payload) => {
    const list = listenersRef.current[event];
    if (list) list.forEach((fn) => fn(payload));
  }, []);

  const on = useCallback((event, handler) => {
    if (!listenersRef.current[event]) listenersRef.current[event] = [];
    listenersRef.current[event].push(handler);
    return () => {
      listenersRef.current[event] = listenersRef.current[event].filter(
        (fn) => fn !== handler
      );
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isTeacher,
      notificationCount,
      setNotificationCount,
      login,
      logout,
      emit,
      on,
    }),
    [user, isAuthenticated, isTeacher, notificationCount, login, logout, emit, on]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuth = () => useContext(AuthContext);

export { AuthProvider, useAuth };
export default AuthContext;