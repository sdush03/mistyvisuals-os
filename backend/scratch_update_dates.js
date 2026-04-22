require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

async function run() {
  try {
    // 1. Find leads created today from facebook
    const res = await pool.query(`
      SELECT l.id, l.name, l.source, a.metadata 
      FROM leads l
      JOIN lead_activities a ON a.lead_id = l.id
      WHERE a.activity_type = 'lead_created' 
        AND a.created_at >= current_date
    `);
    
    console.log(`Found ${res.rows.length} leads created today.`);
    
    for (const row of res.rows) {
      console.log(`\nLead: ${row.name} (ID: ${row.id})`);
      const meta = row.metadata;
      
      const fieldData = meta?.source_meta?.raw_field_data;
      if (!fieldData) {
        console.log('No raw_field_data found.');
        continue;
      }
      
      let dates = null;
      console.log('Available raw fields:', fieldData.map(f => f.name).join(', '));
      
      for (const field of fieldData) {
        let name = field.name.toLowerCase();
        // Since we don't know the exact string, let's see if there's any hint of dates or anything matching
        if (name.includes('date') || name.includes('when') || name.includes('wedding')) {
          dates = field.values.join(', ');
          console.log(`Found raw question: ${field.name} => ${dates}`);
        }
      }
      
      if (!dates) {
        // Fallback: If there's no explicitly matched date question, manually find the most likely one based on user printing
        console.log('Could not find a date field for this lead based on common names.');
      }
      
      if (dates) {
        console.log(`Updating lead note and event_date for ${row.name}...`);
        
        // Let's find their notes
        const currentNotes = await pool.query(`SELECT id, note_text FROM lead_notes WHERE lead_id = $1 ORDER BY created_at ASC`, [row.id]);
        
        for (const note of currentNotes.rows) {
          if (!note.note_text.includes('**Event Details**') && note.note_text.includes('**Form Answers**')) {
            const newText = note.note_text.replace(
              '**Contact Info**', 
              `**Contact Info**`
            ).replace(
              '**Form Answers**',
              `**Event Details**\nDates: ${dates}\n\n**Form Answers**`
            );
            
            await pool.query(`UPDATE lead_notes SET note_text = $1 WHERE id = $2`, [newText, note.id]);
            console.log(`Updated note ${note.id}`);
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
