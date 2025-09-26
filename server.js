const http = require('http');
const { spawn } = require('child_process');
const url = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;

let currentProc = null;
let currentEnv = null;
let status = {
  running: false,
  startTime: null,
  endTime: null,
  exitCode: null,
};

const logBuffer = [];
const LOG_MAX = 2000; // lines
const sseClients = new Set();

function pushLog(line) {
  logBuffer.push(line);
  if (logBuffer.length > LOG_MAX) logBuffer.shift();
  // broadcast to SSE clients
  for (const res of sseClients) {
    try {
      res.write(`data: ${JSON.stringify({ type: 'log', line })}\n\n`);
    } catch (_) {}
  }
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function notFound(res) {
  res.statusCode = 404;
  res.end('Not Found');
}

function badRequest(res, msg) {
  json(res, 400, { error: msg || 'Bad Request' });
}

function allowCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        const ctype = req.headers['content-type'] || '';
        if (ctype.includes('application/json')) {
          resolve(JSON.parse(data || '{}'));
        } else if (ctype.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(data);
          const obj = {};
          for (const [k, v] of params.entries()) obj[k] = v;
          resolve(obj);
        } else {
          resolve({ raw: data });
        }
      } catch (e) {
        resolve({});
      }
    });
  });
}

function ensureNotRunning(res) {
  if (currentProc && status.running) {
    json(res, 409, { error: 'A run is already in progress' });
    return false;
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  allowCORS(res);
  const parsed = url.parse(req.url, true);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve OpenAPI spec
  if (parsed.pathname === '/openapi.json' && req.method === 'GET') {
    try {
      const specPath = path.join(process.cwd(), 'openapi.json');
      if (!fs.existsSync(specPath)) {
        json(res, 404, { error: 'OpenAPI spec not found. Ensure openapi.json exists at project root.' });
        return;
      }
      const spec = fs.readFileSync(specPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(spec);
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return;
  }

  // Network info endpoint: expose local IPv4 addresses and base URLs
  if (parsed.pathname === '/network' && req.method === 'GET') {
    try {
      const nets = os.networkInterfaces();
      const ipv4 = [];
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
          if (net.family === 'IPv4' && !net.internal) ipv4.push({ iface: name, address: net.address });
        }
      }
      const bases = ipv4.map((n) => `http://${n.address}:${PORT}`);
      json(res, 200, { ipv4, bases, recommended: bases[0] || null });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return;
  }

  if (parsed.pathname === '/start' && req.method === 'POST') {
    if (!ensureNotRunning(res)) return;
    const cfg = await parseBody(req);

    const env = Object.assign({}, process.env, {
      NON_INTERACTIVE: '1',
      TARGET_COTE: cfg.targetCote ?? cfg.target_cote ?? cfg.target ?? '',
      MARKET_ID: cfg.marketId ?? cfg.market ?? 'DC',
      AUTO_LOGIN: cfg.autoLogin ?? '1',
      // Always place automatically at the end in API mode
      PLACEMENT_AUTO: '1',
      STAKE_AMOUNT: cfg.stakeAmount ?? cfg.stake ?? '1',
      RANDOM_MODE: cfg.randomMode ?? '0',
      RANDOM_SKIP_RATE: cfg.randomSkipRate ?? '',
      MAX_ODD_PER_SELECTION: cfg.maxOddPerSelection ?? '',
      SELECTION_MODE: cfg.selectionMode ?? 'priority',
      OU_LINE: cfg.ouLine ?? '',
      OU_PRIORITY: cfg.ouPriority ?? '',
      // Login credentials (override .env if provided)
      COUNTRY_CODE: cfg.countryCode ?? cfg.country_code ?? process.env.COUNTRY_CODE ?? '',
      PHONE_NUMBER: cfg.phoneNumber ?? cfg.phone_number ?? process.env.PHONE_NUMBER ?? '',
      PASSWORD: cfg.password ?? process.env.PASSWORD ?? '',
    });

    // spawn app.js
    const child = spawn(process.execPath, ['app.js'], {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    currentProc = child;
    currentEnv = env;
    status = { running: true, startTime: new Date().toISOString(), endTime: null, exitCode: null };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (data) => {
      const lines = String(data).split(/\r?\n/).filter(Boolean);
      for (const ln of lines) pushLog(ln);
    });
    child.stderr.on('data', (data) => {
      const lines = String(data).split(/\r?\n/).filter(Boolean);
      for (const ln of lines) pushLog(`[err] ${ln}`);
    });
    child.on('exit', (code) => {
      status.running = false;
      status.exitCode = code;
      status.endTime = new Date().toISOString();
      pushLog(`Process finished with code ${code}`);
    });

    json(res, 202, { message: 'started', pid: child.pid });
    return;
  }

  if (parsed.pathname === '/status' && req.method === 'GET') {
    json(res, 200, { status, running: !!(currentProc && status.running), env: currentEnv && { MARKET_ID: currentEnv.MARKET_ID, NON_INTERACTIVE: currentEnv.NON_INTERACTIVE } });
    return;
  }

  if (parsed.pathname === '/session' && req.method === 'GET') {
    try {
      const profileDir = process.env.PAWA_PROFILE_DIR || path.join(process.cwd(), '.pawa-profile');
      const sessFile = path.join(profileDir, 'session.json');
      const profileDirExists = fs.existsSync(profileDir);
      const sessionFileExists = fs.existsSync(sessFile);
      let session = null;
      if (sessionFileExists) {
        try {
          const raw = fs.readFileSync(sessFile, 'utf8');
          session = JSON.parse(raw);
        } catch (_) {}
      }
      json(res, 200, { profileDirExists, sessionFileExists, session });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return;
  }

  if (parsed.pathname === '/logout' && req.method === 'POST') {
    try {
      // Stop current run if any
      if (currentProc && status.running) {
        currentProc.kill('SIGTERM');
      }
      const profileDir = process.env.PAWA_PROFILE_DIR || path.join(process.cwd(), '.pawa-profile');
      if (fs.existsSync(profileDir)) {
        fs.rmSync(profileDir, { recursive: true, force: true });
      }
      json(res, 200, { message: 'session cleared' });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return;
  }

  if (parsed.pathname === '/stop' && req.method === 'POST') {
    if (!currentProc || !status.running) {
      json(res, 409, { error: 'No run in progress' });
      return;
    }
    currentProc.kill('SIGTERM');
    json(res, 202, { message: 'stopping' });
    return;
  }

  if (parsed.pathname === '/logs' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    // send history
    for (const line of logBuffer) {
      res.write(`data: ${JSON.stringify({ type: 'log', line })}\n\n`);
    }
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  // Serve OpenAPI spec
  if (parsed.pathname === '/openapi.json' && req.method === 'GET') {
    try {
      const specPath = path.join(process.cwd(), 'openapi.json');
      if (!fs.existsSync(specPath)) {
        json(res, 404, { error: 'OpenAPI spec not found. Ensure openapi.json exists at project root.' });
        return;
      }
      const spec = fs.readFileSync(specPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(spec);
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return;
  }


  // Serve static documentation page
  if (parsed.pathname === '/docs' && req.method === 'GET') {
    try {
      const docPath = path.join(process.cwd(), 'docs.html');
      if (!fs.existsSync(docPath)) {
        json(res, 404, { error: 'docs.html not found at project root.' });
        return;
      }
      const html = fs.readFileSync(docPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return;
  }

  // Alias: serve the same page at /docs.html
  if (parsed.pathname === '/docs.html' && req.method === 'GET') {
    try {
      const docPath = path.join(process.cwd(), 'docs.html');
      if (!fs.existsSync(docPath)) {
        json(res, 404, { error: 'docs.html not found at project root.' });
        return;
      }
      const html = fs.readFileSync(docPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return;
  }

  // Serve Swagger UI (moved to /swagger) pointing to /openapi.json
  if (parsed.pathname === '/swagger' && req.method === 'GET') {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Betpawa runner API Swagger</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>body { margin: 0; } #swagger-ui { min-height: 100vh; }</style>
  <script defer src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script defer src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js"></script>
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'BaseLayout'
      });
    });
  </script>
  </head>
  <body>
    <div id="swagger-ui"></div>
  </body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (parsed.pathname === '/' && req.method === 'GET') {
    json(res, 200, { message: 'Betpawa runner API', endpoints: ['/start', '/status', '/logs', '/stop', '/session', '/logout', '/openapi.json', '/docs', '/swagger', '/network'] , docs: '/docs' , swagger: '/swagger', network: '/network' });
    return;
  }

  notFound(res);
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  const local = `http://127.0.0.1:${PORT}`;
  console.log(`API server listening on ${local}`);
  if (ips.length) {
    console.log('LAN addresses:');
    for (const ip of ips) console.log(`  -> http://${ip}:${PORT}`);
  } else {
    console.log('No LAN IPv4 address detected.');
  }
});
