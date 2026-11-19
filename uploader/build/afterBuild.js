/**
 * build/afterBuild.js
 * Runs AFTER all artifacts (DMG) are built.
 * Notarizes the DMG with Apple, waits for approval, then staples the ticket.
 */

const { execSync } = require('child_process');

exports.default = async function (buildResult) {
  const dmgPath = buildResult.artifactPaths.find(p => p.endsWith('.dmg'));
  if (!dmgPath) {
    console.log('[notarize] No DMG found, skipping notarization.');
    return;
  }

  const profile = process.env.NOTARY_PROFILE || process.env.KEYCHAIN_PROFILE;
  const appleId = process.env.APPLE_ID;
  const password = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  const identity = process.env.CSC_NAME || 'Developer ID Application: MISTY VISUALS PRIVATE LIMITED (9S743W7CRJ)';
  try {
    console.log(`[sign] Signing DMG installer file with identity: ${identity}`);
    execSync(`codesign --force --verbose --timestamp --sign "${identity}" "${dmgPath}"`, { stdio: 'inherit' });
    console.log('[sign] ✅ DMG container signed successfully!');
  } catch (e) {
    console.warn('[sign] DMG codesign warning:', e.message);
  }

  if (process.env.SKIP_NOTARIZE === 'true' || (!profile && (!appleId || !password || !teamId))) {
    console.log('[notarize] ⚠️ Apple credentials missing or SKIP_NOTARIZE is set. Skipping Apple notarization.');
    console.log(`[notarize] 📦 Signed DMG ready at: ${dmgPath}\n`);
    return;
  }

  console.log('\n[notarize] ──────────────────────────────────────────');
  console.log(`[notarize] Submitting: ${dmgPath}`);
  console.log('[notarize] Waiting for Apple to notarize (2-5 mins)...');
  console.log('[notarize] ──────────────────────────────────────────\n');

  const submitCmd = profile
    ? `xcrun notarytool submit "${dmgPath}" --keychain-profile "${profile}" --wait`
    : `xcrun notarytool submit "${dmgPath}" --apple-id "${appleId}" --password "${password}" --team-id "${teamId}" --wait`;

  try {
    execSync(submitCmd, { stdio: 'inherit' });

    console.log('\n[notarize] Stapling ticket to DMG...');
    execSync(`xcrun stapler staple "${dmgPath}"`, { stdio: 'inherit' });

    console.log('[notarize] ✅ Notarization and stapling complete!');
    console.log(`[notarize] 📦 Ready to distribute: ${dmgPath}\n`);
  } catch (err) {
    console.warn('\n[notarize] ⚠️ Apple notarization failed:', err.message);
    console.warn('[notarize] If 403: Check if an updated agreement is pending acceptance on https://developer.apple.com/account.');
    console.warn('[notarize] Proceeding with Developer ID signed app to complete publishing.');
    console.log(`[notarize] 📦 Signed DMG ready at: ${dmgPath}\n`);
  }
};
