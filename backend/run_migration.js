require('dotenv').config()
const fs = require('fs')
const path = require('path')

// Add .ts extension support in node so require('./db.ts') works
if (!require.extensions['.ts']) {
    require.extensions['.ts'] = require.extensions['.js']
}

const { pool } = require('./db.ts')

async function run() {
    try {
        const p = path.join(__dirname, 'migrations', '20260313_add_quotation_engine.sql')
        const sql = fs.readFileSync(p, 'utf8')
        await pool.query(sql)
        console.log('Migration OK')
    } catch (err) {
        console.error('Migration Error:', err.message)
    } finally {
        process.exit(0)
    }
}
run()
