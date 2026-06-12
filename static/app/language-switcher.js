// 语言切换器组件
import { setLanguage, getCurrentLanguage, t } from './i18n.js';

const LANG_SHORT_LABELS = {
    'vi-VN': 'VI',
    'en-US': 'EN'
};

const LANG_SWITCH_KEYS = {
    'vi-VN': 'language.switched.vi',
    'en-US': 'language.switched.en'
};

export function getLangShortLabel(lang) {
    return LANG_SHORT_LABELS[lang] || LANG_SHORT_LABELS[getCurrentLanguage()] || 'VI';
}

// 创建语言切换器 HTML
export function createLanguageSwitcher() {
    const currentLang = getCurrentLanguage();
    
    const switcher = document.createElement('div');
    switcher.className = 'language-switcher';
    switcher.innerHTML = `
        <button class="language-btn" id="languageBtn" aria-label="${t('header.menu')}">
            <i class="fas fa-globe"></i>
            <span class="current-lang">${getLangShortLabel(currentLang)}</span>
        </button>
        <div class="language-dropdown" id="languageDropdown">
            <button class="language-option ${currentLang === 'vi-VN' ? 'active' : ''}" data-lang="vi-VN">
                <i class="fas fa-check"></i>
                <span>Tiếng Việt</span>
            </button>
            <button class="language-option ${currentLang === 'en-US' ? 'active' : ''}" data-lang="en-US">
                <i class="fas fa-check"></i>
                <span>English</span>
            </button>
        </div>
    `;
    
    return switcher;
}

// 初始化语言切换器
export function initLanguageSwitcher() {
    const headerControls = document.querySelector('.header-controls');
    if (headerControls) {
        const switcher = createLanguageSwitcher();
        headerControls.appendChild(switcher);
        bindLanguageSwitcherEvents();
    }
}

function bindLanguageSwitcherEvents() {
    const languageBtn = document.getElementById('languageBtn');
    const languageDropdown = document.getElementById('languageDropdown');
    const languageOptions = document.querySelectorAll('.language-option');
    
    if (!languageBtn || !languageDropdown) return;
    
    languageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        languageDropdown.classList.toggle('show');
    });
    
    languageOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const lang = option.getAttribute('data-lang');
            
            setLanguage(lang);
            
            const currentLangSpan = languageBtn.querySelector('.current-lang');
            if (currentLangSpan) {
                currentLangSpan.textContent = getLangShortLabel(lang);
            }
            
            languageOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            
            languageDropdown.classList.remove('show');
            
            const switchKey = LANG_SWITCH_KEYS[lang] || 'language.switched.vi';
            showToast(t('common.success'), t(switchKey), 'success');
        });
    });
    
    document.addEventListener('click', () => {
        languageDropdown.classList.remove('show');
    });
}

function showToast(title, message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(title, message, type);
    } else {
        console.log(`${title}: ${message}`);
    }
}

export default {
    createLanguageSwitcher,
    initLanguageSwitcher,
    getLangShortLabel
};
