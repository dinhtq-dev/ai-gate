import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const content = fs.readFileSync(path.join(__dirname, '../static/app/i18n.js'), 'utf8');
const marker = "'en-US': {";
const start = content.indexOf(marker);
const objStart = start + marker.length - 1;
const loginEnd = content.indexOf("'login.loggingIn': 'Logging in...',", start);
const end = content.indexOf('}', loginEnd);
const objCode = content.slice(objStart, end + 1);
if (!objCode.length) {
    console.error('Failed to extract en-US block');
    process.exit(1);
}
const enUS = (0, eval)('(' + objCode + ')');
const outDir = path.join(__dirname, '../static/app/locales');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'en-US-extracted.json'), JSON.stringify(enUS, null, 2));
console.log('keys:', Object.keys(enUS).length);
