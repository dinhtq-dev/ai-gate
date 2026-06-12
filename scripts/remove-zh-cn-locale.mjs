import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const i18nPath = path.join(__dirname, '../static/app/i18n.js');
let content = fs.readFileSync(i18nPath, 'utf8');

const enStart = content.indexOf("    'en-US': {");
const before = content.slice(0, content.indexOf('const translations = {'));
const afterStart = content.indexOf('function detectDefaultLanguage');
const after = content.slice(afterStart);

const enBlockEnd = content.indexOf("'login.loggingIn': 'Logging in...',", enStart);
const enEnd = content.indexOf('}', content.indexOf("'common.unknownPath': 'Unknown Path',", enBlockEnd));
const enBlock = content.slice(enStart, enEnd + 1);

const newTranslations = `const translations = {
    'vi-VN': viVN,
${enBlock}
};`;

const newContent = `${before}${newTranslations}

${after}`;
fs.writeFileSync(i18nPath, newContent);
console.log('Removed zh-CN from i18n.js');
