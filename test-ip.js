const { pool } = require('./backend/db');
(async () => {
    const res = await pool.query("SELECT * FROM known_internal_ips ORDER BY last_seen_at DESC LIMIT 5");
    console.log("INTERNAL IPs:", res.rows);
    const pv = await pool.query("SELECT * FROM proposal_views ORDER BY created_at DESC LIMIT 5");
    console.log("PROPOSAL VIEWS:", pv.rows);
    process.exit(0);
})();
