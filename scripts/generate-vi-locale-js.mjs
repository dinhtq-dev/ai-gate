import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vi = JSON.parse(fs.readFileSync(path.join(__dirname, '../static/app/locales/vi-VN.json'), 'utf8'));
const lines = ['// Vietnamese locale (auto-generated from vi-VN.json)', 'export default {'];

for (const [key, value] of Object.entries(vi)) {
    const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n');
    lines.push(`    '${key}': '${escaped}',`);
}

lines.push('};');
lines.push('');
fs.writeFileSync(path.join(__dirname, '../static/app/locales/vi-VN.js'), lines.join('\n'));
console.log('Generated vi-VN.js with', Object.keys(vi).length, 'keys');
