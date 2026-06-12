import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vi = JSON.parse(fs.readFileSync(path.join(__dirname, '../static/app/locales/vi-VN.json'), 'utf8'));

const componentsDir = path.join(__dirname, '../static/components');
const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.html')).map(f => path.join(componentsDir, f));

function applyI18n(html) {
    return html.replace(/<([^>\s]+)([^>]*)\sdata-i18n="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g, (match, tag, before, key, after, inner) => {
        if (!vi[key] || tag.includes('/')) return match;
        const text = vi[key];
        if (text.includes('<')) {
            return `<${tag}${before} data-i18n="${key}"${after}>${text}</${tag}>`;
        }
        const iconMatch = inner.match(/^(\s*<i[^>]*><\/i>\s*)/);
        if (iconMatch) {
            return `<${tag}${before} data-i18n="${key}"${after}>${iconMatch[1]}${text}</${tag}>`;
        }
        return `<${tag}${before} data-i18n="${key}"${after}>${text}</${tag}>`;
    });
}

for (const file of files) {
    let html = fs.readFileSync(file, 'utf8');
    const updated = applyI18n(html);
    if (updated !== html) {
        fs.writeFileSync(file, updated);
        console.log('Fixed', path.basename(file));
    }
}
