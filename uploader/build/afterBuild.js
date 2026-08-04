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

  const appleId = process.env.APPLE_ID;
  const password = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !password || !teamId) {
    console.error('[notarize] ❌ Missing APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID env vars.');
    throw new Error('Missing notarization credentials');
  }

  console.log('\n[notarize] ──────────────────────────────────────────');
  console.log(`[notarize] Submitting: ${dmgPath}`);
  console.log('[notarize] Waiting for Apple to notarize (2-5 mins)...');
  console.log('[notarize] ──────────────────────────────────────────\n');

  execSync(
    `xcrun notarytool submit "${dmgPath}" --apple-id "${appleId}" --password "${password}" --team-id "${teamId}" --wait`,
    { stdio: 'inherit' } // no timeout — Apple notarization can take 5-30 mins
  );

  console.log('\n[notarize] Stapling ticket to DMG...');
  execSync(`xcrun stapler staple "${dmgPath}"`, { stdio: 'inherit' });

  console.log('[notarize] ✅ Notarization and stapling complete!');
  console.log(`[notarize] 📦 Ready to distribute: ${dmgPath}\n`);
};
