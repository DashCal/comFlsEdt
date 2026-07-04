/**
 * Config Schema — 配置定义（常量，不计入行数预算）
 * 每个字段: type, label, default 必填
 * range  额外: min, max, step, unit
 * select 额外: options: [{value, label}]
 * toggle 额外: description (可选)
 * 所有字段可选: dependsOn (路径，依赖另一个字段的真值)
 */
const CONFIG_SCHEMA = {
    general: {
        title: '常规', icon: '⚙️',
        fields: {
            autoSave: { type: 'toggle', label: '自动保存', description: '内容变化时自动保存到本地存储', default: true },
            autoSaveInterval: { type: 'range', label: '保存间隔', min: 3, max: 60, step: 1, unit: '秒', default: 5, dependsOn: 'general.autoSave' },
            defaultMode: {
                type: 'select', label: '默认模式', default: 'wysiwyg',
                options: [{ value: 'wysiwyg', label: '所见即所得' }, { value: 'markdown', label: 'Markdown 源码' }]
            },
            defaultFilename: { type: 'text', label: '默认文件名', default: 'document' }
        }
    },
    editor: {
        title: '编辑器', icon: '📃',
        fields: {
            fontSize: { type: 'range', label: '字体大小', min: 13, max: 24, step: 1, unit: 'px', default: 16 },
            fontFamily: {
                type: 'select', label: '字体', default: 'system',
                options: [{ value: 'system', label: '无衬线字体' }, { value: 'serif', label: '衬线字体' }, { value: 'mono', label: '等宽字体' }]
            },
            lineHeight: { type: 'range', label: '行高', min: 1.3, max: 2.5, step: 0.1, unit: '', default: 1.8 },
            maxWidth: {
                type: 'select', label: '最大宽度', default: '720',
                options: [{ value: '600', label: '紧凑 600px' }, { value: '720', label: '舒适 720px' }, { value: '860', label: '宽屏 860px' }, { value: '100%', label: '自适应' }]
            },
            tabSize: {
                type: 'select', label: 'Tab 宽度', default: '2',
                options: [{ value: '2', label: '2 空格' }, { value: '4', label: '4 空格' }]
            },
            wordWrap: { type: 'toggle', label: '自动换行', default: true },
            spellCheck: { type: 'toggle', label: '拼写检查', default: false },
            // ↓ 新增
            preserveBlankLines: { type: 'toggle', label: '保留空行', description: '将连续空行作为内容保留，而非 Markdown 标准的段落分隔', default: true }
        }
    },
    heading: {
        title: '标题', icon: 'H',
        fields: {
            h1Size: { type: 'range', label: 'H1 字号', min: 24, max: 48, step: 2, unit: 'px', default: 32 },
            h2Size: { type: 'range', label: 'H2 字号', min: 20, max: 36, step: 2, unit: 'px', default: 26 },
            h3Size: { type: 'range', label: 'H3 字号', min: 18, max: 28, step: 1, unit: 'px', default: 22 },
            headingBold: { type: 'toggle', label: '标题加粗', default: true }
        }
    },
    media: {
        title: '媒体', icon: '🖼️',
        fields: {
            maxImageSize: {
                type: 'select', label: '图片最大', default: '1',
                options: [{ value: '1', label: '1 MB' }, { value: '2', label: '2 MB' }, { value: '3', label: '3 MB' }]
            },
            imageQuality: { type: 'range', label: '压缩质量', min: 0.3, max: 1, step: 0.1, unit: '', default: 0.8 },
            autoCompress: { type: 'toggle', label: '自动压缩', description: '超过 1MB 的图片自动压缩后存储', default: true },
            maxDimension: { type: 'range', label: '最大边长', min: 800, max: 3840, step: 160, unit: 'px', default: 1920 }
        }
    },
    storage: {
        title: '存储', icon: '💾',
        fields: {
            storageWarning: { type: 'range', label: '警告阈值', min: 50, max: 95, step: 5, unit: '%', default: 80 }
        }
    }
};

/**
 * Config — 配置管理器
 * 从 CONFIG_SCHEMA 提取默认值，与 localStorage 中已保存的配置合并
 * 所有路径使用点号分隔：'editor.fontSize'
 * 全 static，全局单例
 */
class Config {
    static _data = {};
    static _onChange = null;  // ← 监控设置是否更改
    /** 初始化：从 LS 加载已保存配置，与 schema defaults 合并 */
    static init() {
        const defaults = Config._defaults(CONFIG_SCHEMA);
        const saved = Storage.get('config') || {};
        Config._data = Config._merge(defaults, saved);
    }

    /** 路径取值：'editor.fontSize' → 16 */
    static get(path) {
        return Config._get(Config._data, path);
    }

    /** 路径设值 + 持久化 */
    static set(path, val) {
        Config._set(Config._data, path, val);
        Storage.set('config', Config._data);
        if (Config._onChange) Config._onChange(path, val);  // ← 设置更改后触发执行新的设置
    }

    /** 返回完整配置的深拷贝 */
    static getAll() {
        return JSON.parse(JSON.stringify(Config._data));
    }

    /** 重置为 schema 默认值 */
    static reset() {
        Config._data = Config._defaults(CONFIG_SCHEMA);
        Storage.set('config', Config._data);
        if (Config._onChange) Config._onChange('*', null);  // ← 新增
    }

    /** 导出为 JSON 字符串 */
    static export() {
        return JSON.stringify(Config._data, null, 2);
    }

    /** 从 JSON 字符串导入，校验后合并 */
    static import(json) {
        try {
            const obj = JSON.parse(json);
            if (typeof obj !== 'object' || obj === null) return false;
            // 只保留 schema 中存在的 key
            const valid = {};
            for (const section in CONFIG_SCHEMA) {
                if (obj[section]) valid[section] = obj[section];
            }
            Config._data = Config._merge(Config._defaults(CONFIG_SCHEMA), valid);
            Storage.set('config', Config._data);
            if (Config._onChange) Config._onChange('*', null);  // ← 新增
            return true;
        } catch { return false; }
    }

    /* ── 内部工具方法 ── */

    /** 遍历 schema 提取所有字段的 default 值 */
    static _defaults(schema) {
        const out = {};
        for (const section in schema) {
            out[section] = {};
            for (const key in schema[section].fields) {
                out[section][key] = schema[section].fields[key].default;
            }
        }
        return out;
    }

    /** 点号路径取值：_get({a:{b:3}}, 'a.b') → 3 */
    static _get(obj, path) {
        return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj);
    }

    /** 点号路径设值 */
    static _set(obj, path, val) {
        const keys = path.split('.');
        const last = keys.pop();
        let cur = obj;
        for (const k of keys) {
            if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
            cur = cur[k];
        }
        cur[last] = val;
    }

    /** 浅合并：defaults 为基础，overrides 覆盖同名字段 */
    static _merge(defaults, overrides) {
        const out = {};
        for (const section in defaults) {
            out[section] = { ...defaults[section], ...(overrides[section] || {}) };
        }
        return out;
    }
}