const { Pool } = require('pg')
const pool = new Pool({ connectionString: 'postgresql://postgres@localhost:5432/postgres' })
pool.query('SELECT id, name, phone_primary FROM leads ORDER BY id DESC LIMIT 5').then(res => {
  console.log(res.rows)
  pool.end()
})
