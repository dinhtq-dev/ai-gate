import { describe, expect, test } from '@jest/globals';
import { normalizeCodexExternalCredentials, detectCodexImportSource } from '../src/auth/codex-import-normalizer.js';

describe('Codex external import normalizer', () => {
    test('normalizes CPA access-token-only credential', () => {
        const [credential] = normalizeCodexExternalCredentials('cpa', {
            type: 'codex',
            account_id: 'acc_cpa',
            email: 'cpa@example.com',
            access_token: 'access-token',
            refresh_token: '',
            expired: '2026-05-31T11:40:33.000Z'
        });

        expect(credential).toMatchObject({
            source: 'cpa',
            access_token: 'access-token',
            refresh_token: '',
            account_id: 'acc_cpa',
            email: 'cpa@example.com',
            expired: '2026-05-31T11:40:33.000Z',
            access_token_only: true
        });
    });

    test('normalizes sub2api exported accounts and skips non-openai accounts', () => {
        const result = normalizeCodexExternalCredentials('sub2api', {
            exported_at: '2026-05-26T00:29:02Z',
            accounts: [
                {
                    name: 'sub@example.com',
                    platform: 'openai',
                    credentials: {
                        access_token: 'access-token',
                        chatgpt_account_id: 'acc_sub',
                        expires_at: 1780576407,
                        refresh_token: ''
                    }
                },
                {
                    name: 'other@example.com',
                    platform: 'other',
                    credentials: {
                        access_token: 'other-token'
                    }
                }
            ]
        });

        expect(result[0]).toMatchObject({
            source: 'sub2api',
            access_token: 'access-token',
            refresh_token: '',
            account_id: 'acc_sub',
            email: 'sub@example.com',
            expired: '2026-06-04T12:33:27.000Z',
            access_token_only: true
        });
        expect(result[1]).toMatchObject({
            skipped: true,
            source: 'sub2api'
        });
    });

    test('normalizes sub2api account array', () => {
        const [credential] = normalizeCodexExternalCredentials('sub2api', [
            {
                name: 'array@example.com',
                platform: 'openai',
                credentials: {
                    access_token: 'access-token',
                    chatgpt_account_id: 'acc_array',
                    expires_at: 1780576407
                }
            }
        ]);

        expect(credential).toMatchObject({
            source: 'sub2api',
            access_token: 'access-token',
            account_id: 'acc_array',
            email: 'array@example.com',
            access_token_only: true
        });
    });

    test('normalizes single sub2api account object', () => {
        const [credential] = normalizeCodexExternalCredentials('sub2api', {
            name: 'single@example.com',
            platform: 'openai',
            credentials: {
                access_token: 'access-token',
                chatgpt_account_id: 'acc_single',
                refresh_token: ''
            }
        });

        expect(credential).toMatchObject({
            source: 'sub2api',
            access_token: 'access-token',
            account_id: 'acc_single',
            email: 'single@example.com',
            access_token_only: true
        });
    });

    test('returns validation error when access_token is missing', () => {
        const [credential] = normalizeCodexExternalCredentials('cpa', {
            account_id: 'acc_missing'
        });

        expect(credential).toMatchObject({
            source: 'cpa',
            error: '缺少 access_token'
        });
    });

    test('normalizes ChatGPT session export with accessToken and nested user/account', () => {
        const [credential] = normalizeCodexExternalCredentials('chatgpt-session', {
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImh0dHBzOi8vYXBpLm9wZW5haS5jb20vYXV0aCI6eyJjaGF0Z3B0X2FjY291bnRfaWQiOiJhY2Nfc2VzcyJ9LCJleHAiOjE4MDAwMDAwMDB9.sig',
            expires: '2026-09-10T16:41:28.839Z',
            authProvider: 'openai',
            user: { email: 'user@example.com' },
            account: { id: 'acc_session', planType: 'free' },
            sessionToken: 'encrypted-session-token'
        });

        expect(credential).toMatchObject({
            source: 'chatgpt-session',
            access_token: expect.stringContaining('eyJ'),
            account_id: 'acc_session',
            email: 'user@example.com',
            expired: '2026-09-10T16:41:28.839Z',
            access_token_only: true
        });
    });

    test('auto-detects ChatGPT session format', () => {
        expect(detectCodexImportSource({
            accessToken: 'token',
            user: { email: 'user@example.com' },
            account: { id: 'acc' }
        })).toBe('chatgpt-session');
    });
});
