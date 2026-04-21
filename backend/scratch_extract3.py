import json
import re
import os

with open('server.js', 'r') as f:
    text = f.read()

# 1. CONSTANTS
const_start = text.find('/* ===================== CONSTANTS ===================== */')
help_start = text.find('/* ===================== HELPERS ===================== */')

constants_code = text[const_start + len('/* ===================== CONSTANTS ===================== */'):help_start].strip()

# Create config/constants.js
os.makedirs('config', exist_ok=True)
with open('config/constants.js', 'w') as f:
    f.write("const path = require('path')\n")
    # Fix __dirname issue
    c_code = constants_code.replace("path.join(__dirname, 'uploads')", "path.join(__dirname, '../uploads')")
    f.write(c_code + "\n")
    
    # Export them
    const_names = re.findall(r'^const ([A-Z_]+) =', constants_code, re.MULTILINE)
    f.write("module.exports = {\n")
    for name in const_names:
        f.write(f"  {name},\n")
    f.write("}\n")

# 2. HELPERS
guard_start = text.find('/* ===================== API AUTH GUARD ===================== */')
helpers_code = text[help_start + len('/* ===================== HELPERS ===================== */'):guard_start].strip()

# Also extract toISTDateString from top
toist_start = text.find('const toISTDateString =')
toist_end = text.find('}', toist_start) + 1
toist_code = text[toist_start:toist_end]

combined_helpers = toist_code + "\n\n" + helpers_code

opts_helpers = ['pool', 'fs', 'path', 'crypto', 'jwt', 'AUTH_SECRET', 'AUTH_COOKIE'] + const_names

# Collect all exported helper names
funcs = set(re.findall(r'^function ([a-zA-Z0-9_]+)\(', combined_helpers, re.MULTILINE))
funcs.update(set(re.findall(r'^async function ([a-zA-Z0-9_]+)\(', combined_helpers, re.MULTILINE)))
local_consts = set(re.findall(r'^const ([a-zA-Z0-9_]+) =', combined_helpers, re.MULTILINE))

export_names = list(funcs | local_consts)

os.makedirs('utils', exist_ok=True)
with open('utils/helpers.js', 'w') as f:
    f.write("module.exports = function installHelpers(opts) {\n")
    f.write("  const {\n    " + ",\n    ".join(opts_helpers) + "\n  } = opts;\n\n")
    f.write(combined_helpers.replace('\n', '\n  ') + "\n\n")
    f.write("  return {\n    " + ",\n    ".join(export_names) + "\n  }\n")
    f.write("}\n")

# 3. METRICS JOB
metrics_start = text.find('/* ===================== METRICS JOB ===================== */')
start_boundary = text.find('/* ===================== START ===================== */', metrics_start)
metrics_code = text[metrics_start + len('/* ===================== METRICS JOB ===================== */'):start_boundary].strip()

funcs_m = set(re.findall(r'^function ([a-zA-Z0-9_]+)\(', metrics_code, re.MULTILINE))
funcs_m.update(set(re.findall(r'^async function ([a-zA-Z0-9_]+)\(', metrics_code, re.MULTILINE)))
local_consts_m = set(re.findall(r'^let ([a-zA-Z0-9_]+) =', metrics_code, re.MULTILINE))

export_names_m = list(funcs_m)

metrics_opts = ['pool', 'recomputeUserMetrics', 'addDaysToYMD', 'dateToYMD', 'addDaysYMD', 'recomputeLeadMetrics', 'normalizeYMD']

os.makedirs('jobs', exist_ok=True)
with open('jobs/metrics.js', 'w') as f:
    f.write("module.exports = function installMetrics(opts) {\n")
    f.write("  const {\n    " + ",\n    ".join(metrics_opts) + "\n  } = opts;\n\n")
    f.write(metrics_code.replace('\n', '\n  ') + "\n\n")
    f.write("  return {\n    " + ",\n    ".join(export_names_m) + "\n  }\n")
    f.write("}\n")

# 4. REWRITE SERVER.JS
new_server = text[:toist_start]
new_server += text[toist_end:const_start]
new_server += f'''/* ===================== CONSTANTS ===================== */
const constants = require('./config/constants.js')
const {{
  {", ".join(const_names)}
}} = constants;

/* ===================== HELPERS ===================== */
const helpers = require('./utils/helpers.js')({{
  pool, fs, path, crypto, jwt, AUTH_SECRET, AUTH_COOKIE, ...constants
}})
const {{
  {", ".join(export_names)}
}} = helpers;

'''
new_server += text[guard_start:metrics_start]
new_server += f'''/* ===================== METRICS JOB ===================== */
const metricsJob = require('./jobs/metrics.js')({{
  pool, recomputeUserMetrics, addDaysToYMD, dateToYMD, addDaysYMD, recomputeLeadMetrics, normalizeYMD
}})
setInterval(metricsJob.runMetricsJob, 60 * 60 * 1000).unref()

'''
new_server += text[start_boundary:]

with open('server.js', 'w') as f:
    f.write(new_server)

print('Extracted successfully!')
