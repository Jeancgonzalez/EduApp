const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.{js,mjs,cjs}'],
    // Los tests no levantan `src/server.js`, así que sin esto no se cargan las
    // variables de conexión y todo lo que toque la base responde 500.
    setupFiles: ['test/setup.js'],
    // Vacía MailHog una vez por corrida: si no, su búsqueda de códigos se
    // ralentiza con cada suite y los `beforeAll` agotan el tiempo.
    globalSetup: ['test/global-setup.js'],
    // Todos los archivos de QA comparten una sola base MariaDB: corren en
    // paralelo se pisan entre ellos (contenidos y usuarios de prueba se cuelan
    // en los listados del otro archivo). Serializarlos hace el resultado
    // determinista: 103 pasan en vez de 93.
    fileParallelism: false,
    globals: true,
    // Cada `beforeAll` crea un docente real y verifica su correo contra MailHog
    // (HTTP + MariaDB de por medio). Con 20 s se agotaba el hook al correr los 12
    // archivos en serie.
    hookTimeout: 60000,
    testTimeout: 30000,
  },
});
