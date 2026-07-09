const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== FACE RECOGNITION SYSTEM DIAGNOSTIC ===\n');

// 1. Check Python 3 version
try {
  const pythonVersion = execSync('python3 --version').toString().trim();
  console.log(`✅ python3 is installed: ${pythonVersion}`);
} catch (e) {
  console.log('❌ python3 is NOT installed or not in PATH.');
  console.log(`Error: ${e.message}\n`);
}

// 2. Check Python imports
const imports = ['cv2', 'numpy', 'urllib.request', 'json', 'sys'];
imports.forEach(pkg => {
  try {
    execSync(`python3 -c "import ${pkg}"`);
    console.log(`✅ Python package '${pkg}' is available.`);
  } catch (e) {
    console.log(`❌ Python package '${pkg}' is NOT available.`);
    console.log(`  To fix, run: pip3 install ${pkg === 'cv2' ? 'opencv-python-headless' : pkg}\n`);
  }
});

// 3. Check ONNX Model paths & downloads
const modelsDir = path.join(__dirname, 'models');
console.log(`\nModels Directory: ${modelsDir}`);
if (fs.existsSync(modelsDir)) {
  console.log(`✅ Models directory exists.`);
  const files = fs.readdirSync(modelsDir);
  console.log(`Existing models: ${files.join(', ') || 'None'}`);
} else {
  console.log(`⚠️ Models directory does not exist yet (will be created automatically on first run).`);
}

// 4. Test run face_rec.py
try {
  const scriptPath = path.join(__dirname, 'utils', 'face_rec.py');
  console.log(`\nRunning face_rec.py test execution...`);
  const output = execSync(`python3 "${scriptPath}"`).toString().trim();
  console.log(`✅ face_rec.py executed successfully.`);
  console.log(`Output: ${output}`);
} catch (e) {
  console.log(`❌ face_rec.py execution failed.`);
  console.log(`Error message: ${e.message}`);
  if (e.stdout) console.log(`stdout: ${e.stdout.toString()}`);
  if (e.stderr) console.log(`stderr: ${e.stderr.toString()}`);
}

console.log('\n=== END DIAGNOSTIC ===');
