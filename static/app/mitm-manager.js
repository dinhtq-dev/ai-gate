import { t } from './i18n.js';
import { showToast } from './utils.js';
import { getAuthHeaders } from './auth.js';

const state = {
    mitmRunning: false,
    dns: {},
    tools: [],
    sudoRequired: false,
    dnsElevationRequired: false,
    sudoCached: false,
    mitmAvailable: false,
    loading: false,
};

const dnsToggleBusy = {};
let sudoResolve = null;

function headers() {
    return { 'Content-Type': 'application/json', ...getAuthHeaders() };
}

function openSudoModal(errorMsg = '') {
    return new Promise((resolve) => {
        sudoResolve = resolve;
        let overlay = document.getElementById('mitmSudoOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'mitmSudoOverlay';
            overlay.className = 'mitm-sudo-overlay';
            overlay.innerHTML = `
                <div class="mitm-sudo-modal" role="dialog" aria-modal="true">
                    <h3 data-i18n="mitm.sudo.title">Yêu cầu quyền quản trị</h3>
                    <p data-i18n="mitm.sudo.desc">Cần mật khẩu sudo hoặc phê duyệt UAC để sửa DNS / khởi động MITM.</p>
                    <input type="password" id="mitmSudoInput" class="form-control" autocomplete="current-password"
                        placeholder="${t('mitm.sudo.placeholder')}" />
                    <p id="mitmSudoError" class="form-error" hidden></p>
                    <div class="mitm-sudo-actions">
                        <button type="button" class="btn btn-secondary" id="mitmSudoCancel">${t('common.cancel')}</button>
                        <button type="button" class="btn btn-primary" id="mitmSudoSubmit">${t('common.confirm')}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.querySelector('#mitmSudoCancel').addEventListener('click', () => closeSudoModal(null));
            overlay.querySelector('#mitmSudoSubmit').addEventListener('click', () => {
                const val = overlay.querySelector('#mitmSudoInput').value;
                closeSudoModal(val || null);
            });
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeSudoModal(null);
            });
        }
        const input = overlay.querySelector('#mitmSudoInput');
        const errEl = overlay.querySelector('#mitmSudoError');
        if (errorMsg) {
            errEl.textContent = errorMsg;
            errEl.hidden = false;
        } else {
            errEl.hidden = true;
        }
        input.value = '';
        overlay.hidden = false;
        setTimeout(() => input.focus(), 50);
        input.onkeydown = (e) => {
            if (e.key === 'Enter') closeSudoModal(input.value || null);
            if (e.key === 'Escape') closeSudoModal(null);
        };
    });
}

function closeSudoModal(password) {
    const overlay = document.getElementById('mitmSudoOverlay');
    if (overlay) overlay.hidden = true;
    if (sudoResolve) {
        sudoResolve(password);
        sudoResolve = null;
    }
}

async function maybeGetSudoPassword(errorMsg = '') {
    if (!state.sudoRequired || state.sudoCached) return null;
    return openSudoModal(errorMsg);
}

function updateMitmToggleUI(loading = false) {
    const btn = document.getElementById('mitmToggleBtn');
    const icon = document.getElementById('mitmToggleIcon');
    const text = document.getElementById('mitmToggleText');
    const badge = document.getElementById('mitmStatusBadge');

    if (!btn) return;

    btn.hidden = !state.mitmAvailable;
    if (badge) {
        badge.hidden = !state.mitmRunning;
        badge.classList.toggle('mitm-status-badge--running', state.mitmRunning);
    }

    if (loading) {
        btn.disabled = true;
        if (icon) icon.className = 'fas fa-spinner fa-spin';
        if (text) text.textContent = state.mitmRunning ? t('mitm.action.stopping') : t('mitm.action.starting');
        return;
    }

    btn.disabled = false;
    btn.classList.toggle('mitm-toggle-btn--running', state.mitmRunning);

    if (icon) icon.className = state.mitmRunning ? 'fas fa-stop' : 'fas fa-play';
    if (text) text.textContent = state.mitmRunning ? t('mitm.action.stop') : t('mitm.action.start');
}

function renderDnsList() {
    const container = document.getElementById('dnsList');
    if (!container) return;

    container.innerHTML = '';
    const tools = state.tools.length ? state.tools : [];

    if (!tools.length) {
        container.innerHTML = `<div class="dns-empty">${t('common.loading')}</div>`;
        return;
    }

    for (const tool of tools) {
        const active = state.dns[tool.id] === true;
        const card = document.createElement('div');
        card.className = `dns-card${active ? ' dns-card--active' : ''}`;
        card.dataset.tool = tool.id;

        const hostsHtml = (tool.hosts || []).map((h) =>
            `<div class="dns-hosts__line"><span>127.0.0.1</span> ${h}</div>`
        ).join('');

        const stateHtml = active
            ? `<span class="dns-card__state--on">${t('mitm.dns.intercepting')}</span>`
            : '';

        card.innerHTML = `
            <div class="dns-card__head">
                <div class="dns-card__info">
                    <div class="dns-card__icon"><i class="fas ${tool.icon || 'fa-globe'}"></i></div>
                    <div>
                        <div class="dns-card__label">${tool.label}</div>
                        ${stateHtml}
                    </div>
                </div>
                <label class="dns-switch" aria-label="${tool.label}">
                    <input type="checkbox" id="dns-switch-${tool.id}" ${active ? 'checked' : ''} />
                    <span class="dns-switch__track"></span>
                </label>
            </div>
            <div class="dns-hosts">
                <div class="dns-hosts__label">${t('mitm.dns.hosts')}</div>
                ${hostsHtml}
            </div>
        `;

        const checkbox = card.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            toggleDns(tool.id, checkbox.checked);
        });
        card.addEventListener('click', (e) => {
            if (e.target.closest('label')) return;
            checkbox.checked = !checkbox.checked;
            toggleDns(tool.id, checkbox.checked);
        });

        container.appendChild(card);
    }
}

export async function loadMitmStatus() {
    try {
        const res = await fetch('/api/mitm/status', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        state.mitmRunning = data.mitmRunning === true;
        state.dns = data.dns || {};
        state.tools = data.tools || [];
        state.sudoRequired = data.sudoRequired === true;
        state.dnsElevationRequired = data.dnsElevationRequired === true;
        state.sudoCached = data.sudoCached === true;
        state.mitmAvailable = data.mitmAvailable === true;
        updateMitmToggleUI(false);
        renderDnsList();
    } catch (err) {
        console.warn('[MITM] status load failed:', err);
    }
}

async function toggleMitm() {
    if (state.loading) return;
    if (state.mitmRunning) {
        if (!confirm(t('mitm.confirm.stop'))) return;
        await stopMitm();
    } else {
        await startMitm();
    }
}

async function startMitm() {
    state.loading = true;
    updateMitmToggleUI(true);
    try {
        const sudoPassword = await maybeGetSudoPassword();
        if (state.sudoRequired && !state.sudoCached && sudoPassword === null) return;

        const res = await fetch('/api/mitm/start', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ sudoPassword }),
        });
        const result = await res.json();
        if (result.error) {
            state.sudoCached = false;
            if (result.passwordError) {
                const retry = await openSudoModal(t('mitm.sudo.wrong'));
                if (retry) {
                    const retryRes = await fetch('/api/mitm/start', {
                        method: 'POST',
                        headers: headers(),
                        body: JSON.stringify({ sudoPassword: retry }),
                    });
                    const retryResult = await retryRes.json();
                    if (retryResult.error) showToast(retryResult.error, 'error');
                    else showToast(t('mitm.toast.started'), 'success');
                }
            } else {
                showToast(result.error, 'error');
            }
        } else {
            showToast(t('mitm.toast.started'), 'success');
        }
        await loadMitmStatus();
    } catch (err) {
        showToast(t('mitm.toast.startFailed') + ': ' + err.message, 'error');
        state.sudoCached = false;
    } finally {
        state.loading = false;
        updateMitmToggleUI(false);
    }
}

async function stopMitm() {
    state.loading = true;
    updateMitmToggleUI(true);
    try {
        const sudoPassword = await maybeGetSudoPassword();
        if (state.sudoRequired && !state.sudoCached && sudoPassword === null) return;

        const res = await fetch('/api/mitm/stop', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ sudoPassword }),
        });
        const result = await res.json();
        if (result.error) {
            showToast(result.error, 'error');
            state.sudoCached = false;
        } else {
            showToast(t('mitm.toast.stopped'), 'success');
        }
        await loadMitmStatus();
    } catch (err) {
        showToast(t('mitm.toast.stopFailed') + ': ' + err.message, 'error');
        state.sudoCached = false;
    } finally {
        state.loading = false;
        updateMitmToggleUI(false);
    }
}

async function toggleDns(tool, enable) {
    const prev = state.dns[tool] === true;
    if (dnsToggleBusy[tool]) {
        setDnsSwitch(tool, prev);
        return;
    }
    dnsToggleBusy[tool] = true;
    try {
        let sudoPassword = null;
        // Chỉ Linux/macOS cần modal sudo — Windows dùng UAC popup của hệ thống
        if (state.sudoRequired && !state.sudoCached) {
            sudoPassword = await openSudoModal();
            if (!sudoPassword) {
                setDnsSwitch(tool, prev);
                return;
            }
        }
        if (state.dnsElevationRequired) {
            showToast(enable ? t('mitm.dns.uacEnable') : t('mitm.dns.uacDisable'), 'success');
        }
        const res = await fetch('/api/mitm/dns/toggle', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ tool, enable, sudoPassword }),
        });
        const result = await res.json();
        if (result.success) {
            const toolMeta = state.tools.find((item) => item.id === tool);
            const label = toolMeta?.label || tool;
            showToast(enable ? t('mitm.dns.enabled', { tool: label }) : t('mitm.dns.disabled', { tool: label }), 'success');
            await loadMitmStatus();
        } else {
            setDnsSwitch(tool, prev);
            showToast(result.error || t('mitm.dns.failed'), 'error');
        }
    } catch {
        setDnsSwitch(tool, prev);
        showToast(t('mitm.dns.networkError'), 'error');
    } finally {
        dnsToggleBusy[tool] = false;
    }
}

function setDnsSwitch(tool, checked) {
    const cb = document.getElementById(`dns-switch-${tool}`);
    if (cb) cb.checked = checked;
}

export function initMitmManager() {
    const btn = document.getElementById('mitmToggleBtn');
    if (btn) btn.addEventListener('click', toggleMitm);

    const refreshDnsBtn = document.getElementById('refreshDnsBtn');
    if (refreshDnsBtn) refreshDnsBtn.addEventListener('click', loadMitmStatus);

    loadMitmStatus();
    setInterval(loadMitmStatus, 15000);
}
