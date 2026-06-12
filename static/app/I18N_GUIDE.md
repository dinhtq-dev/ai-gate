# Hướng dẫn i18n

Dự án hỗ trợ **Tiếng Việt (vi-VN)** và **English (en-US)**. Chuyển ngôn ngữ bằng nút 🌐 ở góc phải header.

- Mặc định: `vi-VN`
- File dịch chính: `static/app/locales/vi-VN.json` → build thành `vi-VN.js`
- File dịch phụ: `static/app/i18n.js` (khối `en-US`)

## Thêm / sửa bản dịch

1. Sửa `static/app/locales/vi-VN.json`
2. Chạy: `node scripts/generate-vi-locale-js.mjs`
3. Nếu cần bản tiếng Anh, thêm key tương ứng trong `i18n.js` (`en-US`)

## Markup

```html
<span data-i18n="nav.dashboard">Tổng quan</span>
<input data-i18n-placeholder="login.passwordPlaceholder" placeholder="...">
```

## API JS

```javascript
import { t, setLanguage, getCurrentLanguage } from './i18n.js';
t('dashboard.uptime');
t('access.empty.key', { error: '...' });
```
