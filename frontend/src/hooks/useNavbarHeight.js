import { useEffect } from 'react';

/**
 * Publica la altura real del navbar en la variable CSS `--navbar-height`
 * (en `document.documentElement`).
 *
 * Se mide con ResizeObserver para que la variable siga siendo correcta cuando
 * el navbar cambia de alto: en móvil hace wrap y crece al abrir el menú.
 * Las vistas que se apoyan en la variable (p. ej. el panel de diagnóstico)
 * se reposicionan solas sin fijar la altura a mano.
 *
 * @param {import('react').RefObject<HTMLElement>} ref - ref del elemento <nav>.
 */
const useNavbarHeight = (ref) => {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const aplicar = () => {
      const alto = Math.round(el.getBoundingClientRect().height);
      if (alto > 0) {
        document.documentElement.style.setProperty('--navbar-height', `${alto}px`);
      }
    };

    aplicar();

    let observador;
    if (typeof ResizeObserver !== 'undefined') {
      observador = new ResizeObserver(aplicar);
      observador.observe(el);
    } else {
      window.addEventListener('resize', aplicar);
    }

    return () => {
      if (observador) observador.disconnect();
      else window.removeEventListener('resize', aplicar);
    };
  }, [ref]);
};

export default useNavbarHeight;
