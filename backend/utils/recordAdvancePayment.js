/**
 * Records an advance payment for an invoice into finance_transactions and invoice_payments,
 * dynamically adapting to the actual columns present in the database.
 * Wrapped in a SAVEPOINT so failures never abort the parent transaction.
 */
async function recordAdvancePayment(client, { invoiceId, advanceAmount, leadId, projectId, title, source = 'manual' }) {
  if (!invoiceId || !advanceAmount || advanceAmount <= 0) return null;

  await client.query('SAVEPOINT advance_payment_sp');
  try {
    const desc = 'Advance payment - ' + (title || `Lead ${leadId}`);

    let catRes = await client.query(
      `SELECT id FROM finance_categories WHERE LOWER(name) = LOWER('Package Advance') LIMIT 1`
    ).catch(() => ({ rows: [] }));
    let catId = catRes.rows[0]?.id || null;
    if (!catId) {
      const insCat = await client.query(
        `INSERT INTO finance_categories (name) VALUES ('Package Advance') RETURNING id`
      ).catch(() => null);
      catId = insCat?.rows?.[0]?.id || null;
    }

    const msRes = await client.query(
      `SELECT id FROM money_sources WHERE is_active = true OR is_active IS NULL ORDER BY id ASC LIMIT 1`
    ).catch(() => ({ rows: [] }));
    const moneySourceId = msRes.rows[0]?.id || null;

    // Check columns on finance_transactions
    let trxId = null;
    try {
      const ftxColsRes = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'finance_transactions'`
      );
      const ftxCols = new Set(ftxColsRes.rows.map(r => r.column_name));

      const ftxFields = ['amount', 'direction', 'date'];
      const ftxVals = [advanceAmount, 'in', 'NOW()::date'];

      if (ftxCols.has('project_uuid') && projectId) {
        ftxFields.push('project_uuid');
        ftxVals.push(projectId);
      }
      if (ftxCols.has('lead_id') && leadId) {
        ftxFields.push('lead_id');
        ftxVals.push(leadId);
      }
      if (ftxCols.has('category_id') && catId) {
        ftxFields.push('category_id');
        ftxVals.push(catId);
      }
      if (ftxCols.has('note')) {
        ftxFields.push('note');
        ftxVals.push(desc);
      }
      if (ftxCols.has('description')) {
        ftxFields.push('description');
        ftxVals.push(desc);
      }
      if (ftxCols.has('type')) {
        ftxFields.push('type');
        ftxVals.push('income');
      }
      if (ftxCols.has('transaction_type')) {
        ftxFields.push('transaction_type');
        ftxVals.push('invoice_payment');
      }
      if (ftxCols.has('money_source_id') && moneySourceId) {
        ftxFields.push('money_source_id');
        ftxVals.push(moneySourceId);
      }
      if (ftxCols.has('metadata')) {
        ftxFields.push('metadata');
        ftxVals.push(JSON.stringify({ source, invoice_id: invoiceId }));
      }

      let paramIdx = 1;
      const placeholders = ftxVals.map(v => (v === 'NOW()::date' ? 'NOW()::date' : `$${paramIdx++}`));
      const realParams = ftxVals.filter(v => v !== 'NOW()::date');

      const trxRes = await client.query(
        `INSERT INTO finance_transactions (${ftxFields.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING id`,
        realParams
      );
      trxId = trxRes.rows[0]?.id || null;
    } catch (ftxErr) {
      console.warn('[recordAdvancePayment] finance_transactions insert warning:', ftxErr.message);
    }

    // Check columns on invoice_payments
    const ipColsRes = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'invoice_payments'`
    );
    const ipCols = new Set(ipColsRes.rows.map(r => r.column_name));

    const ipFields = ['invoice_id'];
    const ipVals = [invoiceId];

    if (ipCols.has('amount')) {
      ipFields.push('amount');
      ipVals.push(advanceAmount);
    }
    if (ipCols.has('amount_applied')) {
      ipFields.push('amount_applied');
      ipVals.push(advanceAmount);
    }
    if (ipCols.has('finance_transaction_id') && trxId) {
      ipFields.push('finance_transaction_id');
      ipVals.push(trxId);
    }
    if (ipCols.has('paid_at')) {
      ipFields.push('paid_at');
      ipVals.push('NOW()');
    }
    if (ipCols.has('method')) {
      ipFields.push('method');
      ipVals.push(source);
    }
    if (ipCols.has('note')) {
      ipFields.push('note');
      ipVals.push('Advance payment confirmation');
    }

    let ipIdx = 1;
    const ipPlaceholders = ipVals.map(v => (v === 'NOW()' ? 'NOW()' : `$${ipIdx++}`));
    const ipParams = ipVals.filter(v => v !== 'NOW()');

    await client.query(
      `INSERT INTO invoice_payments (${ipFields.join(', ')})
       VALUES (${ipPlaceholders.join(', ')})`,
      ipParams
    );

    await client.query(
      `UPDATE invoices SET advance_paid = TRUE, status = 'partial' WHERE id = $1`,
      [invoiceId]
    );

    await client.query('RELEASE SAVEPOINT advance_payment_sp');
    return { success: true, trxId };
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT advance_payment_sp');
    console.error('[recordAdvancePayment] Advance payment recording warning (non-fatal):', err.message || err);
    return null;
  }
}

module.exports = { recordAdvancePayment };
