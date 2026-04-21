module.exports = function installMetrics(opts) {
  const {
    pool,
    recomputeUserMetrics,
    addDaysToYMD,
    dateToYMD,
    addDaysYMD,
    recomputeLeadMetrics,
    normalizeYMD
  } = opts;

let metricsLastRun = null
  let metricsRunning = false
  
  async function recomputeUserMetricsRange(fromYmd, toYmd, client = pool) {
    const start = normalizeYMD(fromYmd)
    const end = normalizeYMD(toYmd)
    if (!start || !end) return
    let cursor = start
    while (cursor <= end) {
      await recomputeUserMetrics(cursor, client)
      cursor = addDaysToYMD(cursor, 1)
      if (!cursor) break
    }
  }
  
  async function runMetricsJob(force = false, range = null) {
    if (metricsRunning) return
    const today = dateToYMD(new Date())
    const from = range?.from || addDaysYMD(-6)
    const to = range?.to || today
    if (!force && metricsLastRun === today) return
    metricsRunning = true
    try {
      await recomputeLeadMetrics()
      await recomputeUserMetricsRange(from, to)
      metricsLastRun = today
      await pool.query(
        `
        INSERT INTO metrics_refresh_log (id, last_run_at)
        VALUES (1, NOW())
        ON CONFLICT (id) DO UPDATE SET last_run_at = EXCLUDED.last_run_at
        `
      )
    } catch (err) {
      console.warn('Metrics job failed:', err?.message || err)
    } finally {
      metricsRunning = false
    }
  }
  
  /* ===================== PHOTO LIBRARY ===================== */
  fastify.register(require('./routes/photo-library'), {
      getImageContentType,
      requireAdmin,
      requireAuth,
      sanitizeTags,
      ensureDirectory,
      crypto,
      fastify,
      fs,
      path,
      PHOTO_UPLOAD_DIR,
      pool,
  
  })
  /* ===================== VIDEO LIBRARY ===================== */
  fastify.register(require('./routes/video-library'), {
      requireAdmin,
      requireAuth,
      sanitizeTags,
      ensureDirectory,
      crypto,
      fastify,
      VIDEO_UPLOAD_DIR,
      fs,
      multipart,
      path,
      pool,
  
  })
  /* ===================== TESTIMONIALS ===================== */
  fastify.register(require('./routes/testimonials'), {
      requireAdmin,
      requireAuth,
      fastify,
      pool,
  
  })

  return {
    recomputeUserMetricsRange,
    runMetricsJob
  }
}
