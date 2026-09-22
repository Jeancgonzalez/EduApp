import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({
  dark: false,
  toggleTheme: () => {}
});

const getInitialDark = () => {
  try {
    const stored = localStorage.getItem('eduapp-theme');
    if (stored) return stored === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
};

const ThemeProvider = ({ children }) => {
  const [dark, setDark] = useState(getInitialDark);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try {
      localStorage.setItem('eduapp-theme', dark ? 'dark' : 'light');
    } catch {
      // Ignorar si localStorage no está disponible
    }
  }, [dark]);

  const toggleTheme = () => setDark(prev => !prev);

  return (
    <ThemeContext.Provider value={{ dark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

const useTheme = () => useContext(ThemeContext);

export { ThemeProvider, useTheme };