/**
 * Storage — localStorage 封装
 * 所有 key 以 'mded_' 为前缀隔离，所有操作 try-catch 防御
 * 全 static 方法，无需实例化
 */
class Storage {
    static PREFIX = 'flash-edit_';
    static TOTAL = 5 * 1024 * 1024; // 5MB 估算上限

    /** 读取值，失败返回 null */
    static get(key) {
        try {
            const raw = localStorage.getItem(Storage.PREFIX + key);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    /** 写入值，成功返回 true */
    static set(key, val) {
        try {
            localStorage.setItem(Storage.PREFIX + key, JSON.stringify(val));
            return true;
        } catch { return false; }
    }

    /** 删除指定 key */
    static remove(key) {
        try { localStorage.removeItem(Storage.PREFIX + key); } catch { }
    }

    /** 列出所有本应用的 key（不含前缀） */
    static keys() {
        const result = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k.startsWith(Storage.PREFIX)) {
                result.push(k.slice(Storage.PREFIX.length));
            }
        }
        return result;
    }

    /** 清除本应用全部数据 */
    static clear() {
        Storage.keys().forEach(k => localStorage.removeItem(Storage.PREFIX + k));
    }

    /** 计算本应用存储用量 */
    static usage() {
        let used = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k.startsWith(Storage.PREFIX)) {
                const v = localStorage.getItem(k);
                used += (k.length + (v ? v.length : 0)) * 2; // UTF-16
            }
        }
        return { used, total: Storage.TOTAL, pct: Math.round(used / Storage.TOTAL * 100) };
    }

    /** 字节数 → 人类可读字符串 */
    static human(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }
}