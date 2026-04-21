import os, re

# all helpers that were globally passed
all_helpers = [
    'createNotification','parseFyLabel','addDaysYMD','normalizeYMD','formatName',
    'canonicalizePhone','parseCookies','normalizeLeadRows','hasAnyEvent','getRoundRobinSalesUserId',
    'recomputeLeadMetrics','normalizePhone','normalizeEmailInput','getImageContentType','normalizeNickname',
    'hashPassword','getOrCreateCity','getFyRange','setAuthCookie','normalizeLeadRow',
    'getFyLabelFromDate','hasPrimaryCity','getAuthFromRequest','requireAdmin','logLeadActivity',
    'getNextLeadNumber','normalizeInstagramUrl','requireAuth','boolToYesNo','clearAuthCookie',
    'logAdminAudit','hasAllEventTimes','verifyToken','getAvailableFyLabels','verifyPassword',
    'startOfDay','runMetricsJob','hasEventsForAllCities','canonicalizeInstagram','normalizeDateValue',
    'parseDataUrl','assignReferenceCode','signToken','getFirstName','recalculateAccountBalances',
    'getCurrentFyLabel','getClientInfo','sanitizeTags','yesNoToBool','formatRefDate',
    'getUserDisplayName','classifyDeviceType','canonicalizeEmail','hasEventInPrimaryCity',
    'listFyLabelsBetween','fetchProfitProjectRows','recomputeUserMetrics','recomputeUserMetricsRange',
    'addDaysToYMD','validateEmail','requireVendor','detectBrowser','ensureDirectory','isValidInstagramUsername',
    'detectPlatform','dateToYMD','getDateRange','resolveUserDisplayName','placesRoutes','crypto',
    'PROTECTED_ADMIN_EMAIL','UPLOADS_DIR','fastify','PUBLIC_API_PATHS','PROD_ORIGIN','fbAdsRoutes',
    'jwt','FOLLOWUP_TYPES','HEAT_VALUES','quotationRoutes','facebookRoutes','LEAD_STATUSES',
    'COVERAGE_SCOPES','DEV_ORIGINS','isProtectedAdminUser','apiRoutes','COMMON_EMAIL_DOMAINS',
    'cors','cookie','ALLOWED_ORIGINS','ALLOWED_COMPOUND_TLDS','toISTDateString','AUTH_SECRET',
    'VIDEO_UPLOAD_DIR','ALLOWED_EMAIL_TLDS','AUTH_COOKIE','fs','multipart','authRoutes','path',
    'PHOTO_UPLOAD_DIR','EMAIL_TYPO_MAP','aiRoutes','pool'
]
opts_regex = re.compile(r'opts(?:=|\s|$)')

with open('server.js', 'r') as f:
    server_text = f.read()

for filename in os.listdir('routes'):
    if not filename.endswith('.js') or filename in ('admin.js', 'auth.js'):
        continue
    filepath = os.path.join('routes', filename)
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Split the file into top (destructure) and body
    body_start_idx = content.find('  } = opts;')
    if body_start_idx == -1: continue
    
    body = content[body_start_idx + 11:]
    
    # Check which helpers are used in body
    used_helpers = []
    for h in all_helpers:
        # Regex boundary to ensure exact match of variable name
        if re.search(r'\b' + re.escape(h) + r'\b', body):
            used_helpers.append(h)
            
    # Rewrite route file
    new_destructure = '  const {\n' + ''.join([f'    {uh},\n' for uh in used_helpers]) + '  } = opts;' if used_helpers else ''
    
    header_end = content.find('  const {\n')
    if header_end == -1: continue
    
    header = content[:header_end]
    with open(filepath, 'w') as f:
        f.write(header + new_destructure + body)
        
    # Now fix server.js
    slug = filename.replace('.js', '')
    patt_str = r"(register\(require\('\./routes/" + slug + r"'\), \{\n).*?(\s+\}\))"
    patt = re.compile(patt_str, re.DOTALL)
    
    opts = ''.join([f'    {uh},\n' for uh in used_helpers])
    
    server_text = patt.sub(r'\g<1>' + opts + r'\g<2>', server_text)

with open('server.js', 'w') as f:
    f.write(server_text)

print('Cleaned up helpers in routes and server.js!')
