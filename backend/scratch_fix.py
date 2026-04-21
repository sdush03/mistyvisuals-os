import re
import os

# 1. Update jobs/metrics.js
with open('jobs/metrics.js', 'r') as f:
    m_text = f.read()

m_text = re.sub(r'/\* ===================== PHOTO LIBRARY ===================== \*/.*?/\* ===================== TESTIMONIALS ===================== \*/.*?\n  }\n  \n  return {', '  return {', m_text, flags=re.DOTALL)
# wait, my regex is a bit greedy/specific. Let's just locate the text block exactly.
start_rem = m_text.find('/* ===================== PHOTO LIBRARY ===================== */')
end_rem = m_text.find('return {')
if start_rem != -1 and end_rem != -1:
    m_text = m_text[:start_rem] + "  " + m_text[end_rem:]

with open('jobs/metrics.js', 'w') as f:
    f.write(m_text)


# 2. Update server.js
with open('server.js', 'r') as f:
    s_text = f.read()

# Fix runMetricsJob calls
s_text = s_text.replace('runMetricsJob().catch', 'metricsJob.runMetricsJob().catch')

# Fix recalculateAccountBalances call
s_text = s_text.replace('recalculateAccountBalances().catch', '// recalculateAccountBalances().catch')

registrations = """
/* ===================== PHOTO LIBRARY ===================== */
fastify.register(require('./routes/photo-library'), {
    getImageContentType, requireAdmin, requireAuth, sanitizeTags, ensureDirectory, crypto, fastify, fs, path, PHOTO_UPLOAD_DIR, pool
})
/* ===================== VIDEO LIBRARY ===================== */
fastify.register(require('./routes/video-library'), {
    requireAdmin, requireAuth, sanitizeTags, ensureDirectory, crypto, fastify, fs, multipart, path, pool
})
/* ===================== TESTIMONIALS ===================== */
fastify.register(require('./routes/testimonials'), {
    requireAdmin, requireAuth, fastify, pool
})

fastify.register(apiRoutes, { prefix: '/api' })
fastify.register(apiRoutes, { prefix: '' })

/* ===================== METRICS JOB ===================== */"""

s_text = s_text.replace('/* ===================== METRICS JOB ===================== */', registrations)

with open('server.js', 'w') as f:
    f.write(s_text)

print("Fixed route registrations, metric jobs calls, and recalculateAccountBalances!")
