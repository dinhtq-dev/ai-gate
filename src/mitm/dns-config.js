import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import logger from '../utils/logger.js';
import { TOOL_HOSTS } from './constants.js';
import { isAdmin, runElevatedPowerShell } from './win-elevated.js';

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const HOSTS_FILE = IS_WIN
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
    : '/etc/hosts';

function atomicWriteHostsWin(target, originalContent, newContent) {
    const tmpNew = `${target}.9router.new`;
    const tmpBak = `${target}.9router.bak`;
    try {
        fs.writeFileSync(tmpNew, newContent, 'utf8');
        try { fs.unlinkSync(tmpBak); } catch { /* none */ }
        fs.renameSync(target, tmpBak);
        try {
            fs.renameSync(tmpNew, target);
        } catch (e) {
            try { fs.renameSync(tmpBak, target); } catch { fs.writeFileSync(target, originalContent, 'utf8'); }
            throw e;
        }
        try { fs.unlinkSync(tmpBak); } catch { /* best effort */ }
    } finally {
        try { fs.unlinkSync(tmpNew); } catch { /* ignore */ }
    }
}

export function isSudoAvailable() {
    if (IS_WIN) return false;
    try {
        execSync('command -v sudo', { stdio: 'ignore', windowsHide: true });
        return true;
    } catch {
        return false;
    }
}

function canRunSudoWithoutPassword() {
    if (IS_WIN || !isSudoAvailable()) return true;
    try {
        execSync('sudo -n true', { stdio: 'ignore', windowsHide: true });
        return true;
    } catch {
        return false;
    }
}

export function isSudoPasswordRequired() {
    return !IS_WIN && isSudoAvailable() && !canRunSudoWithoutPassword();
}

export function execWithPassword(command, password) {
    return new Promise((resolve, reject) => {
        const useSudo = isSudoAvailable();
        const child = useSudo
            ? spawn('sudo', ['-S', 'sh', '-c', command], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
            : spawn('sh', ['-c', command], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d; });
        child.stderr.on('data', (d) => { stderr += d; });

        child.on('close', (code) => {
            if (code === 0) resolve(stdout);
            else reject(new Error(stderr || `Exit code ${code}`));
        });

        if (useSudo) {
            child.stdin.write(`${password}\n`);
            child.stdin.end();
        }
    });
}

function normalizeHostsContent(content) {
    const eol = IS_WIN ? '\r\n' : '\n';
    return content.replace(/[\r\n\s]+$/g, '') + eol;
}

function readHostsFile() {
    try {
        return fs.readFileSync(HOSTS_FILE, 'utf8');
    } catch {
        return '';
    }
}

function parseHostsLine(line) {
    let trimmed = line.trim();
    if (!trimmed) return null;
    const hashIdx = trimmed.indexOf('#');
    let comment = '';
    if (hashIdx >= 0) {
        comment = trimmed.slice(hashIdx);
        trimmed = trimmed.slice(0, hashIdx).trim();
    }
    if (!trimmed) return { kind: 'comment', raw: line };
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) return { kind: 'other', raw: line };
    return { kind: 'entry', ip: parts[0], hostnames: parts.slice(1), comment, raw: line };
}

function hostsFileHasHost(content, host) {
    for (const line of content.split(/\r?\n/)) {
        const parsed = parseHostsLine(line);
        if (parsed?.kind === 'entry' && parsed.hostnames.includes(host)) return true;
    }
    return false;
}

function removeHostsFromContent(content, hostsToRemove) {
    const removeSet = new Set(hostsToRemove);
    const eol = IS_WIN ? '\r\n' : '\n';
    const out = [];
    for (const line of content.split(/\r?\n/)) {
        const parsed = parseHostsLine(line);
        if (parsed?.kind !== 'entry') {
            out.push(line);
            continue;
        }
        const kept = parsed.hostnames.filter((h) => !removeSet.has(h));
        if (kept.length === parsed.hostnames.length) {
            out.push(line);
            continue;
        }
        if (kept.length === 0) continue;
        const suffix = parsed.comment ? ` ${parsed.comment}` : '';
        out.push(`${parsed.ip} ${kept.join(' ')}${suffix}`);
    }
    return normalizeHostsContent(out.join(eol));
}

function appendHosts(content, hosts) {
    const eol = IS_WIN ? '\r\n' : '\n';
    const trimmed = content.replace(/[\r\n\s]+$/g, '');
    const lines = hosts.map((h) => `127.0.0.1 ${h}`);
    const body = trimmed ? `${trimmed}${eol}${lines.join(eol)}${eol}` : `${lines.join(eol)}${eol}`;
    return normalizeHostsContent(body);
}

async function writeHostsContent(newContent, sudoPassword) {
    const current = readHostsFile();
    if (newContent === current) return;

    if (IS_WIN) {
        if (isAdmin()) {
            atomicWriteHostsWin(HOSTS_FILE, current, newContent);
            try { execSync('ipconfig /flushdns', { windowsHide: true, stdio: 'ignore' }); } catch { /* ignore */ }
            return;
        }
        const tmpPath = path.join(os.tmpdir(), `aigate-hosts-${Date.now()}.tmp`);
        fs.writeFileSync(tmpPath, newContent, 'utf8');
        const esc = (s) => String(s).replace(/'/g, "''");
        await runElevatedPowerShell(
            `Copy-Item -LiteralPath '${esc(tmpPath)}' -Destination '${esc(HOSTS_FILE)}' -Force; ` +
            `Remove-Item -LiteralPath '${esc(tmpPath)}' -Force -ErrorAction SilentlyContinue; ` +
            `ipconfig /flushdns | Out-Null`
        );
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        return;
    }

    const escaped = newContent.replace(/'/g, "'\\''");
    await execWithPassword(`printf '%s' '${escaped}' | tee ${HOSTS_FILE} > /dev/null`, sudoPassword);
    await flushDNS(sudoPassword);
}

export function isWinElevationRequired() {
    return IS_WIN && !isAdmin();
}

async function flushDNS(sudoPassword) {
    if (IS_WIN) return;
    if (IS_MAC) {
        await execWithPassword('dscacheutil -flushcache && killall -HUP mDNSResponder', sudoPassword);
    } else {
        await execWithPassword('resolvectl flush-caches 2>/dev/null || true', sudoPassword);
    }
}

function checkDNSEntry(host = null) {
    const hostsContent = readHostsFile();
    if (!hostsContent) return false;
    if (host) return hostsFileHasHost(hostsContent, host);
    return TOOL_HOSTS.antigravity.every((h) => hostsFileHasHost(hostsContent, h));
}

export function checkAllDNSStatus() {
    const hostsContent = readHostsFile();
    const result = {};
    for (const [tool, hosts] of Object.entries(TOOL_HOSTS)) {
        result[tool] = hosts.every((h) => hostsFileHasHost(hostsContent, h));
    }
    return result;
}

export async function addDNSEntry(tool, sudoPassword) {
    const hosts = TOOL_HOSTS[tool];
    if (!hosts) throw new Error(`Unknown tool: ${tool}`);

    const entriesToAdd = hosts.filter((h) => !checkDNSEntry(h));
    if (entriesToAdd.length === 0) {
        logger.info(`[DNS] ${tool}: already active`);
        return;
    }

    try {
        const current = readHostsFile();
        const next = appendHosts(current, entriesToAdd);
        await writeHostsContent(next, sudoPassword);
        if (!checkAllDNSStatus()[tool]) {
            throw new Error('Hosts file was not updated — run as Administrator or approve UAC');
        }
        logger.info(`[DNS] ${tool}: added ${entriesToAdd.join(', ')}`);
    } catch (error) {
        const msg = error.message?.includes('incorrect password') ? 'Wrong sudo password'
            : error.message?.includes('canceled') ? 'UAC prompt canceled — DNS not changed'
                : `Failed to add DNS entry: ${error.message}`;
        throw new Error(msg);
    }
}

export async function removeDNSEntry(tool, sudoPassword) {
    const hosts = TOOL_HOSTS[tool];
    if (!hosts) throw new Error(`Unknown tool: ${tool}`);

    const entriesToRemove = hosts.filter((h) => checkDNSEntry(h));
    if (entriesToRemove.length === 0) {
        logger.info(`[DNS] ${tool}: already inactive`);
        return;
    }

    try {
        const current = readHostsFile();
        const next = removeHostsFromContent(current, entriesToRemove);
        await writeHostsContent(next, sudoPassword);
        if (checkAllDNSStatus()[tool]) {
            throw new Error('Hosts file still contains entries — run as Administrator or approve UAC');
        }
        logger.info(`[DNS] ${tool}: removed ${entriesToRemove.join(', ')}`);
    } catch (error) {
        const msg = error.message?.includes('incorrect password') ? 'Wrong sudo password'
            : error.message?.includes('canceled') ? 'UAC prompt canceled — DNS not changed'
                : `Failed to remove DNS entry: ${error.message}`;
        throw new Error(msg);
    }
}

export { TOOL_HOSTS };
