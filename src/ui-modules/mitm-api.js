import { getRequestBody } from '../utils/common.js';
import logger from '../utils/logger.js';
import {
    addDNSEntry,
    removeDNSEntry,
    checkAllDNSStatus,
    isSudoPasswordRequired,
    isWinElevationRequired,
    TOOL_HOSTS,
} from '../mitm/dns-config.js';
import { loadDnsState, setDnsToolState, syncDnsStateWithHosts } from '../mitm/dns-state.js';
import {
    getMitmStatus,
    startMitmServer,
    stopMitmServer,
    getMitmCachedSudo,
    clearMitmCachedSudo,
    isMitmServerAvailable,
    getXmitmRoot,
    getMitmServerPath,
} from '../mitm/mitm-lifecycle.js';
import { DNS_TOOL_META, MITM_PORT } from '../mitm/constants.js';

let syncDone = false;

function ensureDnsSync() {
    if (!syncDone) {
        syncDone = true;
        syncDnsStateWithHosts().catch((e) => logger.warn(`[MITM API] DNS sync: ${e.message}`));
    }
}

function json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return true;
}

export async function handleGetMitmStatus(req, res, currentConfig) {
    ensureDnsSync();
    const mitm = await getMitmStatus();
    const dnsActual = checkAllDNSStatus();
    const stored = loadDnsState();

    return json(res, 200, {
        mitmRunning: mitm.running,
        pid: mitm.pid,
        dns: dnsActual,
        dnsStored: stored.dns || {},
        sudoRequired: isSudoPasswordRequired(),
        dnsElevationRequired: isWinElevationRequired(),
        sudoCached: getMitmCachedSudo(),
        mitmAvailable: isMitmServerAvailable(),
        xmitmRoot: getXmitmRoot(),
        mitmServerPath: getMitmServerPath(),
        mitmPort: MITM_PORT,
        routerBase: `http://127.0.0.1:${currentConfig?.SERVER_PORT || 3000}`,
        tools: Object.entries(DNS_TOOL_META).map(([id, meta]) => ({
            id,
            label: meta.label,
            icon: meta.icon,
            hosts: TOOL_HOSTS[id] || [],
        })),
    });
}

export async function handleMitmStart(req, res, currentConfig) {
    try {
        const body = await getRequestBody(req);
        const sudoPassword = body?.sudoPassword || null;
        const result = await startMitmServer(currentConfig, sudoPassword);
        return json(res, 200, result);
    } catch (e) {
        const isPasswordError = e.message?.includes('Wrong sudo password') || e.message?.includes('incorrect password');
        clearMitmCachedSudo();
        return json(res, 400, { success: false, error: e.message, passwordError: isPasswordError });
    }
}

export async function handleMitmStop(req, res) {
    try {
        const body = await getRequestBody(req);
        const sudoPassword = body?.sudoPassword || null;
        const result = await stopMitmServer(sudoPassword);
        return json(res, 200, result);
    } catch (e) {
        clearMitmCachedSudo();
        return json(res, 400, { success: false, error: e.message });
    }
}

export async function handleDnsToggle(req, res) {
    try {
        const body = await getRequestBody(req);
        const tool = body?.tool;
        const enable = body?.enable === true;
        const sudoPassword = body?.sudoPassword || null;
        if (!tool) throw new Error('Missing tool');

        if (enable) await addDNSEntry(tool, sudoPassword);
        else await removeDNSEntry(tool, sudoPassword);

        await setDnsToolState(tool, enable);
        return json(res, 200, { success: true, dns: checkAllDNSStatus() });
    } catch (e) {
        logger.warn(`[MITM API] DNS toggle failed: ${e.message}`);
        return json(res, 400, { success: false, error: e.message });
    }
}
