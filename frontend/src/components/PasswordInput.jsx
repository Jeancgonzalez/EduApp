import React, { useState } from 'react';
import { MdVisibility, MdVisibilityOff } from 'react-icons/md';

const PasswordInput = ({ icon, showToggle = true, ...inputProps }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="input-wrapper">
      {icon}
      <input {...inputProps} type={visible ? 'text' : 'password'} />
      {showToggle && (
        <button
          type="button"
          className="password-toggle-btn"
          onClick={() => setVisible((v) => !v)}
          title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          tabIndex={0}
        >
          {visible ? <MdVisibilityOff /> : <MdVisibility />}
        </button>
      )}
    </div>
  );
};

export default PasswordInput;