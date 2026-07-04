/**
 * Theme — 主题管理
 * 两套主题（简洁白 / 代码黑），通过 data-theme 属性 + CSS 变量双重控制
 * 全 static，依赖 Config
 */
class Theme {
    static THEMES = {
        white: {
            label: '简洁白',
            icon: '☀',
            vars: {}
            /* CSS 中 :root / [data-theme="white"] 已定义全部白色变量
               这里仅存放 JS 需要精确覆盖的动态值（来自配置的如 --h1-size 等）
               留空即可，apply() 时由 Editor.applyStyles() 负责动态值 */
        },
        dark: {
            label: '代码黑',
            icon: '☾',
            vars: {}
        }
    };

    static current = 'white';

    /** 初始化：从 Config 读取保存的主题偏好并应用 */
    static init() {
        const saved = Config.get('general.theme');
        Theme.current = (saved === 'dark') ? 'dark' : 'white';
        Theme.apply();
    }

    /** 设置主题并持久化 */
    static set(name) {
        if (!Theme.THEMES[name]) return;
        Theme.current = name;
        Theme.apply();
        Config.set('general.theme', name);
    }

    /** 在两套主题间切换 */
    static toggle() {
        Theme.set(Theme.current === 'white' ? 'dark' : 'white');
    }

    /** 应用当前主题：设置 data-theme 属性 */
    static apply() {
        document.documentElement.setAttribute('data-theme', Theme.current);
    }

    /** 获取当前主题 ID */
    static get() {
        return Theme.current;
    }
}