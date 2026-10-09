/**
 * build/prepare_universal.js
 * Ensures that both Apple Silicon (arm64) and Intel (x64) binaries
 * are present in node_modules so electron-builder can package a Universal macOS app.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const nodeModules = path.join(projectRoot, 'node_modules');

// Define the required cross-arch optional packages with versions matching package-lock
const requiredPackages = [
  {
    name: '@img/sharp-darwin-arm64@0.35.5',
    checkFile: path.join(nodeModules, '@img', 'sharp-darwin-arm64', 'lib', 'sharp-darwin-arm64-0.35.5.node'),
    dest: path.join(nodeModules, '@img', 'sharp-darwin-arm64')
  },
  {
    name: '@img/sharp-libvips-darwin-arm64@1.3.4',
    checkFile: path.join(nodeModules, '@img', 'sharp-libvips-darwin-arm64', 'lib', 'libvips-cpp.8.18.7.dylib'),
    dest: path.join(nodeModules, '@img', 'sharp-libvips-darwin-arm64')
  },
  {
    name: '@ffmpeg-installer/darwin-arm64@4.1.5',
    checkFile: path.join(nodeModules, '@ffmpeg-installer', 'darwin-arm64', 'ffmpeg'),
    dest: path.join(nodeModules, '@ffmpeg-installer', 'darwin-arm64')
  },
  {
    name: '@img/sharp-darwin-x64@0.35.5',
    checkFile: path.join(nodeModules, '@img', 'sharp-darwin-x64', 'lib', 'sharp-darwin-x64-0.35.5.node'),
    dest: path.join(nodeModules, '@img', 'sharp-darwin-x64')
  },
  {
    name: '@img/sharp-libvips-darwin-x64@1.3.4',
    checkFile: path.join(nodeModules, '@img', 'sharp-libvips-darwin-x64', 'lib', 'libvips-cpp.8.18.7.dylib'),
    dest: path.join(nodeModules, '@img', 'sharp-libvips-darwin-x64')
  },
  {
    name: '@ffmpeg-installer/darwin-x64@4.1.0',
    checkFile: path.join(nodeModules, '@ffmpeg-installer', 'darwin-x64', 'ffmpeg'),
    dest: path.join(nodeModules, '@ffmpeg-installer', 'darwin-x64')
  }
];

function prepare() {
  console.log('[universal-prep] Checking native multi-arch dependencies for Universal build...');
  const missing = requiredPackages.filter(pkg => !fs.existsSync(pkg.checkFile));

  if (missing.length === 0) {
    console.log('[universal-prep] ✅ All arm64 and x64 native binaries present in node_modules.');
    return;
  }

  console.log(`[universal-prep] Missing ${missing.length} native package(s). Downloading via npm pack...`);
  const tmpDir = path.join(projectRoot, '.tmp_pkg_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    for (const pkg of missing) {
      console.log(`[universal-prep] 📦 Fetching ${pkg.name}...`);
      const tarball = execSync(`npm pack ${pkg.name}`, { cwd: tmpDir, encoding: 'utf8' }).trim().split('\n').pop();
      const tarballPath = path.join(tmpDir, tarball);
      fs.mkdirSync(pkg.dest, { recursive: true });
      execSync(`tar -xzf "${tarballPath}" -C "${pkg.dest}" --strip-components=1`);
      console.log(`[universal-prep] ✅ Extracted ${pkg.name} -> ${path.relative(projectRoot, pkg.dest)}`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('[universal-prep] Native dependencies successfully prepared for Universal build.\n');
}

if (require.main === module) {
  prepare();
}

module.exports = prepare;
