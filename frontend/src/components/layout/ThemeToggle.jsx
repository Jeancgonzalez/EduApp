import React from 'react';
import { MdDarkMode, MdLightMode } from 'react-icons/md';
import { useTheme } from '../../context/ThemeContext';
import './ThemeToggle.css';

const ThemeToggle = ({ className = '' }) => {
  const { dark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={toggleTheme}
      title={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      {dark ? <MdLightMode /> : <MdDarkMode />}
    </button>
  );
};

export default ThemeToggle;