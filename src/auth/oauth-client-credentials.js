import fs from 'fs';
import path from 'path';

const CREDENTIALS_FILE = process.env.OAUTH_CLIENTS_FILE
    || path.resolve('configs/oauth-clients.json');

const PROVIDER_ENV_KEYS = {
    'gemini-cli-oauth': {
        clientId: 'GEMINI_CLI_OAUTH_CLIENT_ID',
        clientSecret: 'GEMINI_CLI_OAUTH_CLIENT_SECRET',
    },
    'gemini-antigravity': {
        clientId: 'ANTIGRAVITY_OAUTH_CLIENT_ID',
        clientSecret: 'ANTIGRAVITY_OAUTH_CLIENT_SECRET',
    },
};

function loadFromFile() {
    try {
        if (fs.existsSync(CREDENTIALS_FILE)) {
            return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
        }
    } catch {
        // Fall through to env-only lookup.
    }
    return {};
}

const fileCredentials = loadFromFile();

export function getOAuthClientCredentials(providerKey) {
    const envKeys = PROVIDER_ENV_KEYS[providerKey] || {};
    const fromFile = fileCredentials[providerKey] || {};
    return {
        clientId: process.env[envKeys.clientId] || fromFile.clientId || '',
        clientSecret: process.env[envKeys.clientSecret] || fromFile.clientSecret || '',
    };
}

export const geminiCliOAuthCredentials = () => getOAuthClientCredentials('gemini-cli-oauth');
export const antigravityOAuthCredentials = () => getOAuthClientCredentials('gemini-antigravity');
