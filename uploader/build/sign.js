/**
 * build/sign.js
 * Custom electron-builder beforeSign hook.
 * Forces codesign to use DigiCert's timestamp server instead of Apple's,
 * which is far more reliable globally and avoids the "timestamp service
 * not available" hang / error.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function (context) {
  const { appOutDir, packager, outDir } = context;
  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);

  if (!fs.existsSync(appPath)) {
    console.log('[sign] App bundle not found yet, skipping custom sign hook.');
    return;
  }

  const identity = process.env.CSC_NAME ||
    'Developer ID Application: MISTY VISUALS PRIVATE LIMITED (9S743W7CRJ)';
  const entitlements = path.resolve('build/entitlements.mac.plist');
  const timestampServer = 'http://timestamp.digicert.com';

  console.log(`[sign] Signing with identity: ${identity}`);
  console.log(`[sign] Timestamp server: ${timestampServer}`);

  // Sign all binaries deep inside the app bundle
  const cmd = [
    'codesign',
    '--deep',
    '--force',
    '--verbose',
    `--timestamp=${timestampServer}`,
    '--options', 'runtime',
    `--entitlements`, `"${entitlements}"`,
    `--sign`, `"${identity}"`,
    `"${appPath}"`
  ].join(' ');

  console.log(`[sign] Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
  console.log('[sign] ✅ Code signing complete.');
};
