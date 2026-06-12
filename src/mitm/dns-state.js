import fs from 'fs';
import path from 'path';
import { withFileLock, atomicWriteFile } from '../utils/file-lock.js';
import { checkAllDNSStatus } from './dns-config.js';
import logger from '../utils/logger.js';

const STATE_FILE = path.join(process.cwd(), 'configs', 'mitm-dns-state.json');

function defaultState() {
    return { dns: {}, updatedAt: null };
}

export function loadDnsState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return defaultState();
        return { ...defaultState(), ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
    } catch {
        return defaultState();
    }
}

export async function saveDnsState(state) {
    const payload = { ...state, updatedAt: new Date().toISOString() };
    await withFileLock(STATE_FILE, async () => {
        await atomicWriteFile(STATE_FILE, JSON.stringify(payload, null, 2));
    });
    return payload;
}

export async function setDnsToolState(tool, enabled) {
    const state = loadDnsState();
    if (!state.dns) state.dns = {};
    state.dns[tool] = !!enabled;
    return saveDnsState(state);
}

/** Đồng bộ trạng thái lưu với file hosts thực tế khi khởi động. */
export async function syncDnsStateWithHosts() {
    try {
        const state = loadDnsState();
        const actual = checkAllDNSStatus();
        let updated = false;
        if (!state.dns) state.dns = {};

        for (const [tool, isPresent] of Object.entries(actual)) {
            if (isPresent && !state.dns[tool]) {
                state.dns[tool] = true;
                updated = true;
                logger.info(`[DNS Sync] Detected '${tool}' in hosts — marking ON`);
            }
        }

        if (updated) await saveDnsState(state);
    } catch (error) {
        logger.warn(`[DNS Sync] Failed: ${error.message}`);
    }
}
