const fs = require('fs');
const path = require('path');
const { toQR } = require('toqr');
const { printQRCode } = require('../node_modules/expo/node_modules/@expo/cli/build/src/utils/qr');

const IP = '192.168.0.13';
const PORT = '8081';

const expoGoUrl = `exp://${IP}:${PORT}`;
const devClientUrl = `exp+nexo://expo-development-client/?url=http%3A%2F%2F${IP}%3A${PORT}`;

function generateSvg(url, margin = 4) {
  const qr = toQR(url);
  const size = Math.sqrt(qr.byteLength) | 0;
  const total = size + margin * 2;
  let paths = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr[r * size + c] === 1) {
        paths += `M${c + margin} ${r + margin}h1v1h-1z `;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="320" height="320" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="#ffffff" rx="12" />
  <path d="${paths.trim()}" fill="#0f172a" />
</svg>`;
}

// Generate SVGs
const svgExpoGo = generateSvg(expoGoUrl);
const svgDevClient = generateSvg(devClientUrl);

const artifactDir = path.resolve('C:/Users/MarceloPC/.gemini/antigravity-ide/brain/b603ea3f-7e8e-44db-8703-b2d18e3d643a');
if (fs.existsSync(artifactDir)) {
  fs.writeFileSync(path.join(artifactDir, 'expo-go-qr.svg'), svgExpoGo, 'utf8');
  fs.writeFileSync(path.join(artifactDir, 'expo-dev-client-qr.svg'), svgDevClient, 'utf8');
}

fs.writeFileSync(path.join(__dirname, '..', 'expo-go-qr.svg'), svgExpoGo, 'utf8');
fs.writeFileSync(path.join(__dirname, '..', 'expo-dev-client-qr.svg'), svgDevClient, 'utf8');

// Generate HTML preview
const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nexo - Conexión Móvil Expo</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card: #151d30;
      --border: #23314f;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --success: #34d399;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body {
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      background: rgba(52, 211, 153, 0.12);
      border: 1px solid rgba(52, 211, 153, 0.35);
      border-radius: 9999px;
      color: var(--success);
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 14px;
    }
    .badge .dot {
      width: 8px;
      height: 8px;
      background: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 8px var(--success);
    }
    h1 {
      font-size: 30px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin-bottom: 8px;
    }
    p.subtitle {
      color: var(--text-muted);
      font-size: 15px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 24px;
      max-width: 820px;
      width: 100%;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
    }
    .card-title {
      font-size: 19px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .card-desc {
      color: var(--text-muted);
      font-size: 13px;
      margin-bottom: 22px;
    }
    .qr-box {
      background: #ffffff;
      padding: 16px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 22px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    }
    .qr-box svg {
      display: block;
      width: 240px;
      height: 240px;
    }
    .url-chip {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      padding: 10px 14px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: var(--accent);
      word-break: break-all;
      width: 100%;
      user-select: all;
    }
    .instructions {
      margin-top: 36px;
      max-width: 640px;
      text-align: center;
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.6;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.06);
      padding: 16px 20px;
      border-radius: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="badge">
      <span class="dot"></span> Servidor Metro Activo &bull; Puerto 8081
    </div>
    <h1>Nexo &bull; Expo Dev Server</h1>
    <p class="subtitle">Conectado a la IP local <code>192.168.0.13:8081</code></p>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">📱 Expo Go</div>
      <div class="card-desc">Escanea con la app Expo Go en Android o la Cámara en iOS</div>
      <div class="qr-box">
        ${svgExpoGo}
      </div>
      <div class="url-chip">${expoGoUrl}</div>
    </div>

    <div class="card">
      <div class="card-title">🚀 Development Build</div>
      <div class="card-desc">Escanea si tienes la app compilada localmente en tu teléfono</div>
      <div class="qr-box">
        ${svgDevClient}
      </div>
      <div class="url-chip">${devClientUrl}</div>
    </div>
  </div>

  <div class="instructions">
    💡 <strong>Tip:</strong> Asegúrate de que el celular esté en la misma red Wi-Fi que la computadora. En Android puedes abrir Expo Go y seleccionar <em>"Scan QR code"</em>. También puedes escribir manualmente la URL <code>${expoGoUrl}</code> en la app.
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, '..', 'expo-qr.html'), htmlContent, 'utf8');

console.log('=== EXPO GO QR CODE ===');
console.log(`URL: ${expoGoUrl}\n`);
printQRCode(expoGoUrl).print();

console.log('\n=== DEV CLIENT QR CODE ===');
console.log(`URL: ${devClientUrl}\n`);
printQRCode(devClientUrl).print();
