const http = require('http');
const { spawn } = require('child_process');
const url = require('url');

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

  if (parsed.pathname === '/start' && req.method === 'POST') {
    if (!ensureNotRunning(res)) return;
    const cfg = await parseBody(req);

    const env = Object.assign({}, process.env, {
      NON_INTERACTIVE: '1',
      TARGET_COTE: cfg.targetCote ?? cfg.target_cote ?? cfg.target ?? '',
      MARKET_ID: cfg.marketId ?? cfg.market ?? 'DC',
      AUTO_LOGIN: cfg.autoLogin ?? '1',
      PLACEMENT_AUTO: cfg.placementAuto ?? cfg.autoPlace ?? '0',
      STAKE_AMOUNT: cfg.stakeAmount ?? cfg.stake ?? '',
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

  if (parsed.pathname === '/' && req.method === 'GET') {
    json(res, 200, { message: 'Betpawa runner API', endpoints: ['/start', '/status', '/logs', '/stop'] });
    return;
  }

  notFound(res);
});

server.listen(PORT, () => {
  console.log(`API server listening on http://127.0.0.1:${PORT}`);
});
