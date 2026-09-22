require('dotenv').config();
const { spawn } = require('child_process');
const http = require('http');

const PORT = 3000;
const BASE = `http://localhost:${PORT}/api`;

function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }

async function puertoAbierto() {
  return new Promise(resolve => {
    const req = http.get(`http://localhost:${PORT}/api/health`, r => {
      r.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
  });
}

(async () => {
  let child = null;
  try {
    if (!(await puertoAbierto())) {
      console.log('Iniciando backend...');
      child = spawn('node', ['src/server.js'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      let ok = false;
      for (let i = 0; i < 30; i++) {
        if (await puertoAbierto()) { ok = true; break; }
        await esperar(1000);
      }
      if (!ok) throw new Error('El backend no respondió a tiempo.');
    }
    console.log('Backend OK\n');

    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jeancar1616@hotmail.com', password: '123456' }),
    });
    const login = await loginRes.json();
    const token = login?.data?.token;
    if (!token) throw new Error('Login falló: ' + JSON.stringify(login).slice(0, 300));
    console.log('Login docente OK\n');

    const headers = { Authorization: `Bearer ${token}` };

    const modRes = await fetch(`${BASE}/teacher/students/module-progress`, { headers });
    const mod = await modRes.json();
    const data = mod?.data || [];
    console.log(`module-progress: ${data.length} estudiantes`);
    console.log('Categorías por estudiante (nota global):');
    const filas = data.map(s => ({
      email: s.email,
      nota: s.nota,
      categoria: s.categoria,
      iad_obligatorio: s.iad_obligatorio,
      diagnostico: s.diagnostico ? s.diagnostico.nivel : null,
    }));
    console.table(filas);

    // Verificaciones puntuales
    const dylan = data.find(s => /dylan/i.test(s.name) || s.nota === 3.5);
    const mod3 = data.find(s => /dylan|valentina|sof|emma|dylan/i.test(s.name));
    if (dylan) {
      const cat = dylan.categoria;
      console.log(`Student nota 3.5 (${dylan.email}): categoria = ${cat} (${cat === 'regular' ? 'OK' : 'ERROR'})`);
    }
    const nuevo = data.find(s => s.email === 'nuevoest@test.com');
    if (nuevo) {
      console.log(`nuevoest@test.com: nota=${nuevo.nota} categoria=${nuevo.categoria} (esperado bajo ${nuevo.nota < 3 ? 'OK' : '?'})`);
    }
    const con3 = data.filter(s => s.nota >= 3.0 && s.nota < 3.6);
    console.log(`Estudiantes con nota 3.0-3.5 (deberían ser 'regular'):`, con3.map(s => `${s.email}=${s.nota}:${s.categoria}`).join(', '));
    const noIad = data.filter(s => s.iad_obligatorio === false);
    console.log(`Estudiantes iad_obligatorio=false (etiqueta 'IAD - No aplicado'): ${noIad.length}`);

    const statsRes = await fetch(`${BASE}/teacher/students/stats`, { headers });
    const stats = await statsRes.json();
    console.log('\nStats (Nota Promedio):', JSON.stringify(stats?.data));
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    // El backend queda corriendo con el código nuevo para que el docente vea la gráfica.
  }
})();