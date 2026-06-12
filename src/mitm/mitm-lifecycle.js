import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execSync } from 'child_process';
import logger from '../utils/logger.js';
import { isSudoAvailable, execWithPassword } from './dns-config.js';
import { MITM_PORT, MITM_HEALTH_PATH } from './constants.js';

const IS_LINUX = process.platform === 'linux';
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

let mitmProcess = null;
let mitmPid = null;
let mitmRealPid = null;
let cachedSudoPassword = null;
let mitmStopping = false;

function shellQuote(str) {
    if (str == null || str === '') return "''";
    return `'${String(str).replace(/'/g, "'\\''")}'`;
}

function killPortCmd(port) {
    if (IS_WIN) {
        return `powershell -NonInteractive -WindowStyle Hidden -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`;
    }
    if (IS_LINUX) return `fuser -k ${port}/tcp 2>/dev/null`;
    if (IS_MAC) return `sh -c 'lsof -ti:${port} | xargs kill -9 2>/dev/null || true'`;
    return `fuser -k ${port}/tcp 2>/dev/null || true`;
}

export function getXmitmRoot() {
    if (process.env.XMITM_ROOT) return path.resolve(process.env.XMITM_ROOT);
    return path.resolve(process.cwd(), '..', 'xmitm');
}

export function getMitmServerPath() {
    return path.join(getXmitmRoot(), 'src', 'server.js');
}

export function isMitmServerAvailable() {
    return fs.existsSync(getMitmServerPath());
}

function buildMitmEnv(currentConfig) {
    const port = currentConfig?.SERVER_PORT || 3000;
    const host = currentConfig?.HOST === '0.0.0.0' ? '127.0.0.1' : (currentConfig?.HOST || '127.0.0.1');
    return {
        MITM_ROUTER_BASE: `http://${host}:${port}`,
        ROUTER_API_KEY: currentConfig?.REQUIRED_API_KEY || '',
    };
}

function pollMitmHealth(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        const check = () => {
            const req = https.request(
                {
                    hostname: '127.0.0.1',
                    port: MITM_PORT,
                    path: MITM_HEALTH_PATH,
                    method: 'GET',
                    rejectUnauthorized: false,
                },
                (res) => {
                    let body = '';
                    res.on('data', (d) => { body += d; });
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(body);
                            if (json.ok === true) resolve({ ok: true, pid: json.pid });
                            else reject(new Error('Health check returned not OK'));
                        } catch {
                            reject(new Error('Invalid health response'));
                        }
                    });
                }
            );
            req.on('error', () => {
                if (Date.now() < deadline) setTimeout(check, 500);
                else reject(new Error('MITM health timeout'));
            });
            req.end();
        };
        check();
    });
}

export async function getMitmStatus() {
    if (mitmStopping) return { running: false, pid: null };
    try {
        const result = await pollMitmHealth(2000);
        if (result?.pid) mitmRealPid = result.pid;
        return { running: true, pid: result.pid || mitmPid || mitmRealPid };
    } catch {
        if (mitmProcess && !mitmProcess.killed) {
            return { running: true, pid: mitmPid };
        }
        return { running: false, pid: null };
    }
}

export async function startMitmServer(currentConfig, sudoPassword) {
    if (!isMitmServerAvailable()) {
        throw new Error(`XMITM not found at ${getMitmServerPath()}. Set XMITM_ROOT or clone xmitm beside AIGate.`);
    }

    if (mitmProcess && !mitmProcess.killed) {
        throw new Error('MITM server is already running');
    }

    try {
        const existing = await pollMitmHealth(2000);
        if (existing?.ok) {
            mitmRealPid = existing.pid || null;
            logger.info(`[MITM] Already running — reattached (PID: ${mitmRealPid || 'unknown'})`);
            return { running: true, pid: mitmRealPid, reattached: true };
        }
    } catch {
        // proceed to spawn
    }

    const password = sudoPassword || cachedSudoPassword;
    if (isSudoAvailable() && password) {
        try {
            await execWithPassword('echo ok', password);
        } catch {
            throw new Error('Wrong sudo password. Please check and try again.');
        }
    }

    const envVars = buildMitmEnv(currentConfig);
    const mitmEnv = { ...process.env, NODE_ENV: 'production', ...envVars };
    const serverPath = getMitmServerPath();
    const projectRoot = getXmitmRoot();

    logger.info(`[MITM] Spawning: ${serverPath}`);

    let spawnPasswordError = false;
    let spawnExitCode = null;

    if (IS_WIN) {
        mitmProcess = spawn(process.execPath, [serverPath], {
            detached: true,
            windowsHide: true,
            cwd: projectRoot,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: mitmEnv,
        });
        mitmProcess.unref();
    } else if (isSudoAvailable()) {
        const inlineCmd = [
            `HOME=${shellQuote(os.homedir())}`,
            `NODE_ENV=production`,
            envVars.MITM_ROUTER_BASE ? `MITM_ROUTER_BASE=${shellQuote(envVars.MITM_ROUTER_BASE)}` : '',
            envVars.ROUTER_API_KEY ? `ROUTER_API_KEY=${shellQuote(envVars.ROUTER_API_KEY)}` : '',
            `exec ${shellQuote(process.execPath)}`,
            shellQuote(serverPath),
        ].filter(Boolean).join(' ');
        const shellCmd = IS_MAC ? `exec ${inlineCmd}` : `setsid sh -c ${shellQuote(inlineCmd)}`;
        mitmProcess = spawn('sudo', ['-S', 'sh', '-c', shellCmd], {
            detached: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        mitmProcess.stdin.write(`${password}\n`);
        mitmProcess.stdin.end();
    } else {
        mitmProcess = spawn(process.execPath, [serverPath], {
            detached: true,
            cwd: projectRoot,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: mitmEnv,
        });
        mitmProcess.unref();
    }

    mitmPid = mitmProcess.pid;

    mitmProcess.stdout?.on('data', (data) => process.stdout.write(data));
    mitmProcess.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg.includes('incorrect password') || msg.includes('Sorry, try again') || msg.includes('no password was provided')) {
            spawnPasswordError = true;
            cachedSudoPassword = null;
            return;
        }
        if (msg && !msg.includes('Password:') && !msg.includes('password for')) {
            process.stderr.write(data);
        }
    });

    mitmProcess.on('exit', (code, signal) => {
        spawnExitCode = code;
        logger.info(`[MITM] exited (code: ${code}${signal ? `, signal: ${signal}` : ''})`);
        mitmProcess = null;
        mitmPid = null;
        mitmRealPid = null;
    });

    let health;
    try {
        health = await pollMitmHealth(12000);
        if (!health) throw new Error('Health check returned no result');
    } catch (e) {
        if (spawnPasswordError) throw new Error('Wrong sudo password. Please check and try again.');
        if (spawnExitCode !== null) throw new Error(`MITM server failed to start (exit code: ${spawnExitCode})`);
        if (mitmProcess && !mitmProcess.killed) {
            try { mitmProcess.kill('SIGKILL'); } catch { /* ignore */ }
        }
        mitmProcess = null;
        mitmPid = null;
        mitmRealPid = null;
        throw new Error(`MITM server failed to start: ${e.message}`);
    }

    if (health?.pid) {
        mitmRealPid = health.pid;
        logger.info(`[MITM] healthy (PID: ${mitmRealPid})`);
    }

    if (password) cachedSudoPassword = password;
    return { running: true, pid: mitmRealPid || mitmPid };
}

export async function stopMitmServer(sudoPassword) {
    const password = sudoPassword || cachedSudoPassword;
    mitmStopping = true;

    if (mitmRealPid) {
        logger.info(`[MITM] Killing node PID ${mitmRealPid}`);
        if (password) {
            try {
                execSync(
                    `echo ${shellQuote(password)} | sudo -S kill ${mitmRealPid} 2>/dev/null; ` +
                    `sleep 0.3; ` +
                    `echo ${shellQuote(password)} | sudo -S kill -9 ${mitmRealPid} 2>/dev/null || true`,
                    { stdio: 'ignore', timeout: 5000 }
                );
            } catch { /* best effort */ }
        } else {
            try { process.kill(mitmRealPid, 'SIGTERM'); await new Promise((r) => setTimeout(r, 200)); } catch { /* ignore */ }
            try { process.kill(mitmRealPid, 'SIGKILL'); } catch { /* ignore */ }
        }
        mitmRealPid = null;
    }

    if (mitmProcess && !mitmProcess.killed) {
        try { process.kill(-mitmPid, 'SIGTERM'); } catch { try { mitmProcess.kill('SIGTERM'); } catch { /* ignore */ } }
        await new Promise((r) => setTimeout(r, 300));
        if (mitmProcess && !mitmProcess.killed) {
            try { process.kill(-mitmPid, 'SIGKILL'); } catch { try { mitmProcess.kill('SIGKILL'); } catch { /* ignore */ } }
        }
        mitmProcess = null;
        mitmPid = null;
    }

    if (IS_WIN) {
        try { execSync(killPortCmd(MITM_PORT), { stdio: 'ignore', timeout: 5000, windowsHide: true }); } catch { /* ignore */ }
    } else if (password) {
        try {
            execSync(`echo ${shellQuote(password)} | sudo -S ${killPortCmd(MITM_PORT)}`, { stdio: 'ignore', timeout: 5000 });
        } catch { /* ignore */ }
    } else if (IS_LINUX || IS_MAC) {
        try { execSync(killPortCmd(MITM_PORT), { stdio: 'ignore', timeout: 3000 }); } catch { /* ignore */ }
    }

    for (let i = 0; i < 3; i++) {
        try {
            await pollMitmHealth(1000);
            if (IS_WIN) {
                try { execSync(killPortCmd(MITM_PORT), { stdio: 'ignore', timeout: 3000, windowsHide: true }); } catch { /* ignore */ }
            } else if (password) {
                try {
                    execSync(`echo ${shellQuote(password)} | sudo -S ${killPortCmd(MITM_PORT)}`, { stdio: 'ignore', timeout: 3000 });
                } catch { /* ignore */ }
            }
        } catch {
            break;
        }
    }

    mitmStopping = false;
    return { running: false, pid: null };
}

export function getMitmCachedSudo() {
    return !!cachedSudoPassword;
}

export function clearMitmCachedSudo() {
    cachedSudoPassword = null;
}
