const http = require('http');

const req = http.request({
  hostname: '127.0.0.1',
  port: 3001,
  path: '/facebook-ads/leads?date_from=&date_to=',
  method: 'GET',
  headers: {
    'bypass-auth': 'debug' // We will bypass auth just for this test
  }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('Status Code:', res.statusCode);
      if (Array.isArray(parsed)) {
          console.log(`Returned ${parsed.length} items`);
          console.log('First 5 IDs:', parsed.slice(0, 5).map(i => i.id));
      } else {
          console.log('Not an array:', parsed);
      }
    } catch (e) {
      console.log('Failed to parse json. Status:', res.statusCode, 'Data:', data.substring(0, 500));
    }
  });
});

req.on('error', e => console.error(e));
req.end();
