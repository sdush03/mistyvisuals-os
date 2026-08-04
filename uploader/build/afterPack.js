/**
 * build/afterPack.js — Complete Electron app signing for notarization
 *
 * Proper inside-out signing order:
 *   1. .dylib and .node leaf binaries
 *   2. Standalone executables (chrome_crashpad_handler, ShipIt, etc.)
 *   3. .framework bundles (deepest first)
 *   4. Helper .app bundles
 *   5. Main .app bundle
 */

const { execSync } = require('child_process');
const { existsSync, statSync } = require('fs');
const path = require('path');

const IDENTITY = 'Developer ID Application: MISTY VISUALS PRIVATE LIMITED (9S743W7CRJ)';
const TS = '--timestamp'; // Apple's default timestamp service

function sign(target, entitlements) {
  const entFlag = entitlements ? `--entitlements "${entitlements}"` : '';
  const cmd = `codesign --force --verbose ${TS} --options runtime ${entFlag} --sign "${IDENTITY}" "${target}"`;
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 90000 });
    return true;
  } catch (err) {
    const msg = ((err.stderr || err.stdout || err.message || '')
      .toString().split('\n').filter(l => l.trim()).pop() || '').trim();
    console.log(`    ⚠️  ${path.basename(target)}: ${msg}`);
    return false;
  }
}

function find(root, args) {
  try {
    return execSync(`find "${root}" ${args}`, { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean);
  } catch { return []; }
}

function isExecutable(f) {
  try { statSync(f); return true; } catch { return false; }
}

exports.default = async function (context) {
  const { appOutDir, packager } = context;
  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  const ents = path.resolve(__dirname, 'entitlements.mac.plist');

  console.log('\n[sign] ══════════════════════════════════════════');
  console.log(`[sign] Signing: ${appPath}`);
  console.log('[sign] ══════════════════════════════════════════\n');

  // ─── 1. Sign all .dylib and .node binaries ───────────────────────────────
  console.log('[sign] 1/5 — Signing .dylib and .node binaries...');
  const dylibs = find(appPath, `-type f \\( -name "*.dylib" -o -name "*.node" \\)`);
  for (const f of dylibs) {
    const ok = sign(f, ents);
    console.log(`  ${ok ? '✅' : '❌'} ${path.relative(appPath, f)}`);
  }

  // ─── 2. Sign standalone executables (Helpers dirs, no extension) ────────
  console.log('\n[sign] 2/5 — Signing standalone executables...');
  // Sign standalone executables inside Frameworks (not inside helper .app bundles)
  // We enumerate them explicitly to avoid path-filter issues with spaces in .app names
  const standaloneExecs = [
    'Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler',
    'Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt',
  ].map(p => path.join(appPath, p)).filter(existsSync);

  for (const f of standaloneExecs) {
    const ok = sign(f, ents);
    console.log(`  ${ok ? '✅' : '❌'} ${path.relative(appPath, f)}`);
  }

  // ─── 3. Sign .framework bundles, deepest first ──────────────────────────
  console.log('\n[sign] 3/5 — Signing .framework bundles (deepest first)...');
  const frameworks = find(appPath, `-name "*.framework" -type d`)
    .sort((a, b) => b.split('/').length - a.split('/').length); // deepest first

  for (const fw of frameworks) {
    const ok = sign(fw, ents);
    console.log(`  ${ok ? '✅' : '❌'} ${path.relative(appPath, fw)}`);
  }

  // ─── 4. Sign inner helper .app bundles ──────────────────────────────────
  console.log('\n[sign] 4/5 — Signing helper .app bundles...');
  const helpers = find(`${appPath}/Contents/Frameworks`, `-name "*.app" -maxdepth 3 -type d`);
  for (const h of helpers) {
    const ok = sign(h, ents);
    console.log(`  ${ok ? '✅' : '❌'} ${path.relative(appPath, h)}`);
  }

  // ─── 5. Sign the main app bundle (with retry) ───────────────────────────
  console.log('\n[sign] 5/5 — Signing main app bundle...');
  for (let i = 1; i <= 3; i++) {
    try {
      execSync(
        `codesign --force --verbose ${TS} --options runtime --entitlements "${ents}" --sign "${IDENTITY}" "${appPath}"`,
        { stdio: 'inherit', timeout: 90000 }
      );
      console.log('\n[sign] ✅ All done — app fully signed!\n');
      return;
    } catch (e) {
      if (i < 3) {
        console.log(`[sign] Main app attempt ${i} failed, retrying in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
      } else throw e;
    }
  }
};
