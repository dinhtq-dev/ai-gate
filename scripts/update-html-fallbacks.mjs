import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vi = JSON.parse(fs.readFileSync(path.join(__dirname, '../static/app/locales/vi-VN.json'), 'utf8'));

const componentsDir = path.join(__dirname, '../static/components');
const files = [
    ...fs.readdirSync(componentsDir).filter(f => f.endsWith('.html')).map(f => path.join(componentsDir, f)),
    path.join(__dirname, '../static/index.html'),
    path.join(__dirname, '../static/login.html'),
];

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

for (const file of files) {
    let html = fs.readFileSync(file, 'utf8');
    let changed = false;

    html = html.replace(/data-i18n="([^"]+)"([^>]*)>([^<]*)</g, (match, key, attrs, text) => {
        if (!vi[key]) return match;
        const newText = vi[key];
        if (text === newText) return match;
        changed = true;
        return `data-i18n="${key}"${attrs}>${newText}<`;
    });

    html = html.replace(/data-i18n-placeholder="([^"]+)"\s+placeholder="[^"]*"/g, (match, key) => {
        if (!vi[key]) return match;
        changed = true;
        return `data-i18n-placeholder="${key}" placeholder="${vi[key].replace(/"/g, '&quot;')}"`;
    });

    html = html.replace(/data-i18n-title="([^"]+)"\s+title="[^"]*"/g, (match, key) => {
        if (!vi[key]) return match;
        changed = true;
        return `data-i18n-title="${key}" title="${vi[key].replace(/"/g, '&quot;')}"`;
    });

    html = html.replace(/data-i18n-aria-label="([^"]+)"\s+aria-label="[^"]*"/g, (match, key) => {
        if (!vi[key]) return match;
        changed = true;
        return `data-i18n-aria-label="${key}" aria-label="${vi[key].replace(/"/g, '&quot;')}"`;
    });

    if (changed) {
        fs.writeFileSync(file, html);
        console.log('Updated', path.basename(file));
    }
}
