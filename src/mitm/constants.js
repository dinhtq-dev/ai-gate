/** Per-tool DNS hosts — 127.0.0.1 khi bật chuyển hướng DNS (clone từ XMITM). */
export const TOOL_HOSTS = {
    antigravity: ['daily-cloudcode-pa.googleapis.com', 'cloudcode-pa.googleapis.com'],
    copilot: ['api.individual.githubcopilot.com'],
    kiro: ['q.us-east-1.amazonaws.com', 'codewhisperer.us-east-1.amazonaws.com'],
    cursor: ['api2.cursor.sh'],
};

export const DNS_TOOL_META = {
    antigravity: { label: 'Google Antigravity', icon: 'fa-rocket' },
    copilot: { label: 'GitHub Copilot', icon: 'fa-code-branch' },
    kiro: { label: 'AWS Kiro / CodeWhisperer', icon: 'fa-cloud' },
    cursor: { label: 'Cursor IDE', icon: 'fa-i-cursor' },
};

export const MITM_PORT = 443;
export const MITM_HEALTH_PATH = '/_mitm_health';
