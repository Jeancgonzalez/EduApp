require('dotenv').config();
const http = require('http');
const BASE = `http://localhost:3000/api`;

(async () => {
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'jeancar1616@hotmail.com', password: '123456' }),
  }).then(r => r.json());
  const token = login?.data?.token;
  if (!token) throw new Error('login falló');
  const headers = { Authorization: `Bearer ${token}` };

  const mod = await fetch(`${BASE}/teacher/students/module-progress`, { headers }).then(r => r.json());
  const data = mod?.data || [];
  console.log('Total:', data.length);
  const dylan = data.find(s => /tres cuatro/i.test(s.name) || /dylan/i.test(s.name)) || data[0];
  console.log(JSON.stringify(dylan, null, 2).slice(0, 4000));
})();