// 用量管理模块

import { showToast, bindOnce, escapeHtml, resolveProviderConfig, getProviderIconMarkup, getProviderThemeColor, getAccountInitial } from './utils.js';
import { getAuthHeaders } from './auth.js';
import { t, getCurrentLanguage } from './i18n.js';

// 提供商配置缓存
let currentProviderConfigs = null;
let supportedUsageProviders = [];
let lastUsageData = null;
let usagePageDataPromise = null;

/**
 * 更新提供商配置
 * @param {Array} configs - 提供商配置列表
 */
export function updateUsageProviderConfigs(configs) {
    currentProviderConfigs = configs;
}

/**
 * 初始化用量管理功能
 */
export function initUsageManager() {
    const refreshBtn = document.getElementById('refreshUsageBtn');
    bindOnce(refreshBtn, 'click', refreshUsage, 'refreshUsage');

    const providersList = document.getElementById('providersList');
    if (providersList) {
        bindOnce(providersList, 'click', (e) => {
            const btn = e.target.closest('.btn-refresh-provider-usage');
            if (!btn) return;
            e.stopPropagation();
            const providerType = btn.getAttribute('data-provider');
            if (providerType) refreshProviderUsage(providerType);
        }, 'providerUsageRefreshDelegate');
    }
}

/**
 * 加载页面数据
 */
export function loadUsagePageData() {
    if (usagePageDataPromise) {
        return usagePageDataPromise;
    }

    usagePageDataPromise = loadSupportedProviders()
        .then(() => loadUsage())
        .finally(() => {
            usagePageDataPromise = null;
        });

    return usagePageDataPromise;
}

/**
 * 提供商列表重绘后恢复已缓存的用量展示
 */
export function reapplyUsageDisplay() {
    if (!lastUsageData) return;
    renderUsageData(lastUsageData);
    applySupportedProviderVisibility();
}

/**
 * 加载支持用量查询的提供商列表
 */
async function loadSupportedProviders() {
    const listEl = document.getElementById('supportedProvidersList');
    if (!listEl) return;

    try {
        const response = await fetch('/api/usage/supported-providers', {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const providers = await response.json();
        supportedUsageProviders = providers;

        listEl.innerHTML = '';
        const displayOrder = currentProviderConfigs ? currentProviderConfigs.map(c => c.id) : providers;

        displayOrder.forEach(providerId => {
            if (!providers.includes(providerId)) return;
            if (currentProviderConfigs) {
                const config = currentProviderConfigs.find(c => c.id === providerId);
                if (config && config.visible === false) return;
            }

            const tag = document.createElement('span');
            tag.className = 'provider-tag';
            const theme = getProviderThemeColor(resolveProviderConfig(providerId, getProviderConfigMap()));
            tag.style.setProperty('--provider-theme', theme);
            tag.innerHTML = `${getProviderIconMarkup(providerId, getProviderConfigMap())} ${getProviderDisplayName(providerId)}`;
            tag.title = t('usage.doubleClickToRefresh');
            tag.addEventListener('dblclick', () => refreshProviderUsage(providerId));
            listEl.appendChild(tag);
        });

        applySupportedProviderVisibility();
    } catch (error) {
        console.error('获取支持的提供商列表失败:', error);
        listEl.innerHTML = `<span class="error-text">${t('usage.failedToLoad')}</span>`;
    }
}

function applySupportedProviderVisibility() {
    document.querySelectorAll('.provider-usage-panel').forEach(panel => {
        const content = panel.querySelector('.provider-usage-content');
        const providerType = content?.getAttribute('data-provider');
        if (!providerType) return;
        const supported = supportedUsageProviders.includes(providerType);
        panel.hidden = !supported;
    });
}

function getProviderUsageContainer(providerType) {
    return document.querySelector(`.provider-usage-content[data-provider="${providerType}"]`);
}

/**
 * 加载用量数据
 */
export async function loadUsage() {
    const loadingEl = document.getElementById('usageLoading');
    const errorEl = document.getElementById('usageError');

    if (loadingEl) loadingEl.hidden = false;
    if (errorEl) errorEl.hidden = true;

    try {
        const response = await fetch('/api/usage', { method: 'GET', headers: getAuthHeaders() });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (loadingEl) loadingEl.hidden = true;
        renderUsageData(data);
        updateTimeInfo(data);
    } catch (error) {
        console.error('获取用量数据失败:', error);
        if (loadingEl) loadingEl.hidden = true;
        if (errorEl) {
            errorEl.hidden = false;
            const msgEl = document.getElementById('usageErrorMessage');
            if (msgEl) msgEl.textContent = error.message;
        }
    }
}

/**
 * 刷新全部用量
 */
export async function refreshUsage() {
    const refreshBtn = document.getElementById('refreshUsageBtn');
    if (refreshBtn) refreshBtn.disabled = true;

    try {
        showToast(t('usage.loading'), 'info');

        const response = await fetch('/api/usage?refresh=true', { method: 'GET', headers: getAuthHeaders() });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        renderUsageData(data);
        updateTimeInfo(data);
        showToast(t('common.refresh.success'), 'success');
    } catch (error) {
        console.error('刷新用量失败:', error);
        showToast(t('common.error'), error.message || t('common.requestFailed'), 'error');
    } finally {
        if (refreshBtn) refreshBtn.disabled = false;
    }
}

/**
 * 刷新单个实例
 */
export async function refreshSingleInstanceUsage(providerType, uuid, displayName) {
    try {
        showToast(t('usage.refreshingInstance', { name: displayName }), 'info');
        const response = await fetch(`/api/usage/${providerType}/${uuid}?refresh=true`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data && data.uuid) {
            updateSingleInstanceCard(providerType, data);
            showToast(t('common.refresh.success'), 'success');
        } else {
            await loadUsage();
        }
    } catch (error) {
        console.error('刷新单个实例用量失败:', error);
        showToast(error.message || t('common.requestFailed'), 'error');
    }
}

/**
 * 更新单个实例卡片 (局部更新 DOM)
 */
function updateSingleInstanceCard(providerType, instanceData) {
    const container = getProviderUsageContainer(providerType);
    if (!container) return;

    const grid = container.querySelector('.usage-cards-grid');
    if (!grid) return;

    const cards = grid.querySelectorAll('.usage-instance-card');
    let targetCard = null;

    for (const card of cards) {
        if (card.getAttribute('data-uuid') === instanceData.uuid) {
            targetCard = card;
            break;
        }
    }

    if (targetCard) {
        const isCollapsed = targetCard.classList.contains('collapsed');
        const newCard = createInstanceUsageCard(instanceData, providerType);
        newCard.classList.toggle('collapsed', isCollapsed);
        grid.replaceChild(newCard, targetCard);
    }
}

/**
 * 刷新单个提供商
 */
export async function refreshProviderUsage(providerType) {
    try {
        showToast(t('usage.refreshingProvider', { name: getProviderDisplayName(providerType) }), 'info');
        const response = await fetch(`/api/usage/${providerType}?refresh=true`, { method: 'GET', headers: getAuthHeaders() });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }
        const data = await response.json();

        if (data.providers && data.providers[providerType]) {
            updateProviderUsageInline(providerType, data.providers[providerType]);
            updateTimeInfo(data);
        } else {
            await loadUsage();
        }

        showToast(t('common.refresh.success'), 'success');
    } catch (error) {
        console.error('刷新提供商用量失败:', error);
        showToast(error.message || t('common.requestFailed'), 'error');
    }
}

/**
 * 更新单个提供商的 inline 用量区域
 */
function updateProviderUsageInline(providerType, providerData) {
    const container = getProviderUsageContainer(providerType);
    if (!container) return;

    const instances = (providerData.instances || []).filter(i => !i.isDisabled && !i.error?.includes('not initialized'));
    renderProviderUsageInline(container, providerType, instances);
}

/**
 * 更新时间相关信息
 */
function updateTimeInfo(data) {
    if (data.serverTime) {
        const el = document.getElementById('serverTimeValue');
        if (el) el.textContent = new Date(data.serverTime).toLocaleString(getCurrentLanguage());
    }

    const lastUpdateEl = document.getElementById('usageLastUpdate');
    if (lastUpdateEl) {
        const timeStr = new Date(data.timestamp || Date.now()).toLocaleString(getCurrentLanguage());
        const key = data.fromCache ? 'usage.lastUpdateCache' : 'usage.lastUpdate';
        lastUpdateEl.textContent = t(key, { time: timeStr });
        lastUpdateEl.setAttribute('data-i18n', key);
        lastUpdateEl.setAttribute('data-i18n-params', JSON.stringify({ time: timeStr }));
    }
}

/**
 * 渲染数据到各 provider item 的 inline 容器
 */
function renderUsageData(data) {
    lastUsageData = data;
    const containers = document.querySelectorAll('.provider-usage-content[data-provider]');
    if (!containers.length) return;

    const groupedInstances = {};
    if (data?.providers) {
        for (const [type, pData] of Object.entries(data.providers)) {
            if (currentProviderConfigs?.find(c => c.id === type)?.visible === false) continue;
            const valid = (pData.instances || []).filter(i => !i.isDisabled && !i.error?.includes('not initialized'));
            if (valid.length > 0) groupedInstances[type] = valid;
        }
    }

    containers.forEach(container => {
        const providerType = container.getAttribute('data-provider');
        if (!providerType) return;
        if (supportedUsageProviders.length && !supportedUsageProviders.includes(providerType)) return;
        renderProviderUsageInline(container, providerType, groupedInstances[providerType] || []);
    });
}

/**
 * 在单个 provider item 内渲染用量卡片
 */
function renderProviderUsageInline(container, providerType, instances) {
    container.innerHTML = '';

    if (!instances.length) {
        container.innerHTML = `<div class="usage-empty-inline"><p>${t('usage.noData')}</p></div>`;
        return;
    }

    const successCount = instances.filter(i => i.success).length;
    const summary = document.createElement('div');
    summary.className = 'provider-usage-summary';
    summary.innerHTML = `
        <span class="instance-count">${t('usage.group.instances', { count: instances.length })}</span>
        <span class="success-count ${successCount === instances.length ? 'all-success' : ''}">${t('usage.group.success', { count: successCount, total: instances.length })}</span>
        <button type="button" class="btn btn-secondary btn-sm btn-toggle-provider-cards" title="${t('usage.group.expandAll')}">
            <i class="fas fa-expand-alt"></i>
        </button>
    `;

    const toggleBtn = summary.querySelector('.btn-toggle-provider-cards');
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cards = container.querySelectorAll('.usage-instance-card');
        const allCollapsed = Array.from(cards).every(card => card.classList.contains('collapsed'));
        cards.forEach(card => card.classList.toggle('collapsed', !allCollapsed));
        toggleBtn.querySelector('i').className = allCollapsed ? 'fas fa-compress-alt' : 'fas fa-expand-alt';
    });

    const grid = document.createElement('div');
    grid.className = 'usage-cards-grid';
    instances.forEach(inst => grid.appendChild(createInstanceUsageCard(inst, providerType)));

    container.appendChild(summary);
    container.appendChild(grid);
}

/**
 * 创建实例卡片 (全面适配新结构)
 */
function createInstanceUsageCard(instance, providerType) {
    const card = document.createElement('div');
    card.className = `usage-instance-card ${instance.success ? 'success' : 'error'} collapsed`;
    card.setAttribute('data-uuid', instance.uuid);

    const usage = instance.usage || {};
    const summary = usage.summary || { usedPercent: 0, status: 'normal' };
    const user = usage.user || {};
    const displayName = user.email || instance.name || instance.uuid;
    const planClass = summary.planClass || 'plan-default';
    const providerConfig = resolveProviderConfig(providerType, getProviderConfigMap());
    const providerTheme = getProviderThemeColor(providerConfig);
    const providerIcon = getProviderIconMarkup(providerConfig);
    const providerName = getProviderDisplayName(providerType);
    const accountInitial = getAccountInitial(displayName);

    card.style.setProperty('--provider-theme', providerTheme);

    card.innerHTML = `
        <div class="usage-card-collapsed-summary">
            <div class="collapsed-summary-row collapsed-summary-name-row">
                <i class="fas fa-chevron-right usage-toggle-icon"></i>
                <span class="usage-account-avatar" title="${escapeAttr(displayName)}">${accountInitial}</span>
                <span class="collapsed-name" title="${escapeAttr(displayName)} ${escapeAttr(t('usage.clickToManage'))}" onclick="event.stopPropagation(); window.jumpToProviderNode('${providerType}', '${instance.uuid}', event)">${escapeHtml(displayName)}</span>
                ${summary.plan ? `<span class="collapsed-plan-badge ${planClass}">${escapeHtml(summary.plan)}</span>` : ''}
                ${instance.success ? '<i class="fas fa-check-circle status-success"></i>' : '<i class="fas fa-times-circle status-error"></i>'}
            </div>
            ${instance.success ? `
            <div class="collapsed-summary-row collapsed-summary-usage-row">
                <div class="collapsed-progress-bar ${summary.status}"><div class="progress-fill" style="width: ${summary.usedPercent}%"></div></div>
                <span class="collapsed-percent">
                    ${summary.unit === 'percent'
                        ? `${summary.usedPercent.toFixed(1)}%`
                        : `${formatNumber(summary.totalUsed || 0)} / ${formatNumber(summary.totalLimit || 0)}`
                    }
                </span>
            </div>
            ` : (instance.error ? `<div class="collapsed-summary-row collapsed-summary-usage-row"><span class="collapsed-error">${t('common.error')}</span></div>` : '')}
        </div>
        <div class="usage-card-expanded-content">
            <div class="usage-instance-header">
                <div class="instance-header-top">
                    <div class="instance-provider-type">${providerIcon}<span>${escapeHtml(providerName)}</span></div>
                    <div class="instance-status-badges">
                        ${instance.configFilePath ? `<button class="btn-download-config" title="${t('usage.card.downloadConfig')}"><i class="fas fa-download"></i></button>` : ''}
                        <button class="btn-refresh-usage" title="${t('usage.card.refresh')}"><i class="fas fa-sync-alt"></i></button>
                        ${instance.isDisabled ? `<span class="badge badge-disabled">${t('usage.card.status.disabled')}</span>` : `<span class="badge ${instance.isHealthy ? 'badge-healthy' : 'badge-unhealthy'}">${t(instance.isHealthy ? 'usage.card.status.healthy' : 'usage.card.status.unhealthy')}</span>`}
                    </div>
                </div>
                <div class="instance-name">
                    <span class="usage-account-avatar usage-account-avatar--lg" title="${escapeAttr(displayName)}">${accountInitial}</span>
                    <span class="instance-name-text" title="${escapeAttr(displayName)}">${escapeHtml(displayName)}</span>
                </div>
                <div class="instance-user-info">
                    ${user.label ? `<span class="user-email"><i class="fas fa-envelope"></i> ${user.label}</span>` : ''}
                </div>
            </div>
            <div class="usage-instance-content"></div>
        </div>
    `;

    card.querySelector('.usage-card-collapsed-summary').onclick = (e) => {
        e.stopPropagation();
        card.classList.toggle('collapsed');
    };

    if (instance.configFilePath) {
        card.querySelector('.btn-download-config').onclick = (e) => { e.stopPropagation(); downloadConfigFile(instance.configFilePath); };
    }

    card.querySelector('.btn-refresh-usage').onclick = (e) => {
        e.stopPropagation();
        refreshSingleInstanceUsage(providerType, instance.uuid, displayName);
    };

    const contentArea = card.querySelector('.usage-instance-content');
    if (instance.error) {
        contentArea.innerHTML = `<div class="usage-error-message"><i class="fas fa-exclamation-triangle"></i> <span>${instance.error}</span></div>`;
    } else if (instance.usage) {
        contentArea.appendChild(renderUsageDetails(instance.usage));
    }

    return card;
}

/**
 * 渲染用量详情 (全面适配新结构)
 */
function renderUsageDetails(usage) {
    const container = document.createElement('div');
    container.className = 'usage-details';

    const { summary, items } = usage;

    if (summary?.usedPercent !== undefined) {
        const total = document.createElement('div');
        total.className = 'usage-section total-usage';
        total.innerHTML = `
            <div class="total-usage-header">
                <span class="total-label"><i class="fas fa-chart-pie"></i> <span>${t('usage.card.totalUsage')}</span></span>
                <span class="total-value">${summary.usedPercent.toFixed(1)}%</span>
            </div>
            <div class="progress-bar ${summary.status}"><div class="progress-fill" style="width: ${summary.usedPercent}%"></div></div>
            <div class="total-footer">
                ${summary.resetAt ? `<div class="total-reset-info"><i class="fas fa-history"></i> ${t('usage.card.resetAt', { time: formatDate(summary.resetAt) })}</div>` : ''}
            </div>
        `;
        container.appendChild(total);
    }

    if (items?.length > 0) {
        const breakdown = document.createElement('div');
        breakdown.className = 'usage-section usage-breakdown-compact';
        items.forEach(item => {
            const val = item.unit === 'percent' ? `${item.percent.toFixed(1)}%` : `${formatNumber(item.used)} / ${formatNumber(item.limit)}`;
            const itemEl = document.createElement('div');
            itemEl.className = 'breakdown-item-compact';
            itemEl.innerHTML = `
                <div class="breakdown-header-compact"><span class="breakdown-name">${item.label}</span><span class="breakdown-usage">${val}</span></div>
                <div class="progress-bar-small ${item.status}"><div class="progress-fill" style="width: ${item.percent}%"></div></div>
                ${item.resetAt ? `<div class="extra-usage-info reset-time"><i class="fas fa-history"></i> ${formatDate(item.resetAt)}</div>` : ''}
            `;
            breakdown.appendChild(itemEl);
        });
        container.appendChild(breakdown);
    }

    return container;
}

function getProviderConfigMap() {
    if (!currentProviderConfigs) return {};
    return currentProviderConfigs.reduce((map, config) => {
        map[config.id] = config;
        return map;
    }, {});
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
}

function getProviderDisplayName(type) {
    const config = currentProviderConfigs?.find(c => c.id === type);
    if (config?.name) return config.name;
    return resolveProviderConfig(type, getProviderConfigMap()).name || type;
}

function getProviderIcon(type) {
    return getProviderIconMarkup(type, getProviderConfigMap());
}

async function downloadConfigFile(path) {
    try {
        const response = await fetch(`/api/upload-configs/download/${encodeURIComponent(path)}`, { headers: getAuthHeaders() });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = path.split(/[/\\]/).pop();
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showToast(t('common.success'), t('usage.card.downloadSuccess'), 'success');
    } catch (error) {
        showToast(t('common.error'), t('usage.card.downloadFailed') + ': ' + error.message, 'error');
    }
}

function formatNumber(num) {
    if (num === null || num === undefined) return '0.00';
    return (Math.ceil(num * 100) / 100).toFixed(2);
}

function formatDate(str) {
    if (!str) return '--';
    try {
        return new Date(str).toLocaleString(getCurrentLanguage(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return str;
    }
}
