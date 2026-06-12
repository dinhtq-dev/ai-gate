import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, '../static/app');
const files = fs.readdirSync(appDir).filter(f => f.endsWith('.js'));

const fallbackPattern = /\s*\|\|\s*'[^']*[\u4e00-\u9fff][^']*'/g;
const fallbackPatternDq = /\s*\|\|\s*"[^"]*[\u4e00-\u9fff][^"]*"/g;
const ternaryZh = /\(t\('common\.info'\) === 'Info' \? 'Unknown' : '[^']*'\)/g;

for (const file of files) {
    const filePath = path.join(appDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    content = content.replace(fallbackPattern, '');
    content = content.replace(fallbackPatternDq, '');
    content = content.replace(ternaryZh, "t('common.unknown')");
    if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log('Stripped fallbacks:', file);
    }
}
