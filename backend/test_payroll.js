const Fastify = require('fastify');
const jwt = require('@fastify/jwt');
const http = require('http');

async function run() {
  const fastify = Fastify();
  fastify.register(jwt, { secret: 'local-dev-secret' });
  
  await fastify.ready();
  const token = fastify.jwt.sign({ sub: 1, role: 'admin' }, { expiresIn: '1d' });
  
  console.log("Using token:", token);

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/payroll/summary?month=2026-02-01',
    method: 'GET',
    headers: {
      'Cookie': `token=${token}`
    }
  };

  const req = http.request(options, res => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => { 
        console.log("STATUS:", res.statusCode);
        console.log(JSON.stringify(JSON.parse(data), null, 2)); 
    });
  });

  req.on('error', error => { console.error(error); });
  req.end();
}

run();
