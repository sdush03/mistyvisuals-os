module.exports = async function(api, opts) {
  const { pool } = opts;

  /* ===================== PROFORMA INVOICE (PUBLIC) ===================== */

  api.get('/proforma/:token', async (req, reply) => {
    const token = req.params.token
    if (!token || token.length < 10) return reply.code(400).send({ error: 'Invalid token' })

    try {
      const invR = await pool.query(`
        SELECT i.id, i.lead_id, i.total_amount, i.advance_amount, i.balance_amount,
               i.status, i.created_at, i.advance_paid, i.due_date,
               l.name as lead_name, l.bride_name, l.groom_name,
               l.phone_primary, l.email
        FROM invoices i
        JOIN leads l ON l.id = i.lead_id
        WHERE i.share_token = $1
      `, [token])

      if (!invR.rows.length) return reply.code(404).send({ error: 'Not found' })
      const invoice = invR.rows[0]

      // Get line items
      const itemsR = await pool.query(
        `SELECT description, amount, quantity FROM invoice_line_items WHERE invoice_id = $1 ORDER BY id ASC`,
        [invoice.id]
      )

      // Get payment schedule
      const schedR = await pool.query(
        `SELECT label, percentage, amount, due_date, step_order, status
         FROM invoice_payment_schedule
         WHERE invoice_id = $1
         ORDER BY step_order ASC`,
        [invoice.id]
      )

      // Get actual payments received
      const paymentsR = await pool.query(
        `SELECT ip.amount as amount_paid, ip.paid_at, ip.method
         FROM invoice_payments ip
         WHERE ip.invoice_id = $1
         ORDER BY ip.paid_at ASC`,
        [invoice.id]
      )

      // Get first event date for context
      const eventR = await pool.query(
        `SELECT le.event_date, le.event_type
         FROM lead_events le
         WHERE le.lead_id = $1 AND le.event_date IS NOT NULL
         ORDER BY le.event_date ASC LIMIT 1`,
        [invoice.lead_id]
      )

      // Build couple name
      const bride = (invoice.bride_name || '').trim()
      const groom = (invoice.groom_name || '').trim()
      const coupleName = bride && groom ? `${bride} & ${groom}` : invoice.lead_name

      return reply.send({
        coupleName,
        totalAmount: Number(invoice.total_amount || 0),
        advanceAmount: Number(invoice.advance_amount || 0),
        balanceAmount: Number(invoice.balance_amount || 0),
        advancePaid: !!invoice.advance_paid,
        status: invoice.status,
        createdAt: invoice.created_at,
        firstEvent: eventR.rows[0] || null,
        lineItems: itemsR.rows.map(r => ({
          description: r.description,
          amount: Number(r.amount || 0),
          quantity: Number(r.quantity || 1),
        })),
        paymentSchedule: schedR.rows.map(r => ({
          label: r.label,
          percentage: r.percentage ? Number(r.percentage) : null,
          amount: Number(r.amount || 0),
          dueDate: r.due_date,
          stepOrder: r.step_order,
          status: r.status || 'pending',
        })),
        paymentsReceived: paymentsR.rows.map(r => ({
          amount: Number(r.amount_paid || 0),
          paidAt: r.paid_at,
          method: r.method,
        })),
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load proforma' })
    }
  })

}
