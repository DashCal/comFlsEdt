/**
 * ui.js — 界面组件
 * Toolbar:  工具栏渲染与状态管理
 * Settings: 设置弹窗（Schema 驱动自动生成）
 * StatusBar: 状态栏更新函数
 * showToast: Toast 通知
 */

/* ═══════════════════════════════════════════════════════
   Toolbar — 工具栏
   ═══════════════════════════════════════════════════════ */

class Toolbar {
    constructor(selector, onAction) {
        this.container = document.querySelector(selector);
        this.onAction = onAction;
    }

    render() {
        this.container.innerHTML = `
        <div class="toolbar-row">
        <div class="toolbar-group">
                <span class="fe-logo-word">
                <i style="display:inline-block;width:1rem;height:1rem;">
                    <svg xmlns=" http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 229 229" overflow="hidden">
                        <g transform="translate(1 1)">
                            <rect x="0" y="0" width="227" height="227" fill="#FFFFFF" fill-opacity="0" />
                            <rect x="113" y="113" width="114" height="114" fill="#002060" />
                            <path d="M0 227 73.312 0 153.688 0 227 227Z" fill="#0070C0" fill-rule="evenodd"
                                transform="matrix(1 -1.22465e-16 -1.22465e-16 -1 2.44442e-14 227)" />
                            <rect x="113" y="0" width="114" height="113" fill="#002060" />
                        </g>
                    </svg>
                </i>
                FlashEdit</span>
        </div>
            <span class="toolbar-sep"></span>
        <div class="toolbar-group">
                <button class="toolbar-btn" data-action="undo" title="撤销 (Ctrl+Z)"><i data-lucide="undo-2"></i></button>
                <button class="toolbar-btn" data-action="redo" title="重做 (Ctrl+Y)"><i data-lucide="redo-2"></i></button>
            </div>
            <span class="toolbar-sep"></span>
            <div class="toolbar-group">
                <button class="toolbar-btn" data-action="h1" title="标题 1">H1</button>
                <button class="toolbar-btn" data-action="h2" title="标题 2">H2</button>
                <button class="toolbar-btn" data-action="h3" title="标题 3">H3</button>
            </div>
            <span class="toolbar-sep"></span>
            <div class="toolbar-group">
                <button class="toolbar-btn" data-action="bold" title="加粗 (Ctrl+B)"><i data-lucide="bold"></i></button>
                <button class="toolbar-btn" data-action="italic" title="斜体 (Ctrl+I)"><i data-lucide="italic"></i></button>
                <button class="toolbar-btn" data-action="strike" title="删除线 (Ctrl+Shift+X)"><i data-lucide="strikethrough"></i></button>
                <button class="toolbar-btn" data-action="code" title="行内代码 (Ctrl+\`)"><i data-lucide="code"></i></button>
            </div>
            <span class="toolbar-sep"></span>
            <div class="toolbar-group">
                <button class="toolbar-btn" data-action="quote" title="引用"><i data-lucide="quote"></i></button>
                <button class="toolbar-btn" data-action="ul" title="无序列表"><i data-lucide="list"></i></button>
                <button class="toolbar-btn" data-action="ol" title="有序列表"><i data-lucide="list-ordered"></i></button>
            </div>
            <span class="toolbar-sep"></span>
            <div class="toolbar-group">
                <button class="toolbar-btn" data-action="link" title="链接 (Ctrl+K)"><i data-lucide="link"></i></button>
                <button class="toolbar-btn" data-action="image" title="图片"><i data-lucide="image"></i></button>
                <button class="toolbar-btn" data-action="hr" title="分割线"><i data-lucide="minus"></i></button>
            </div>
            <span class="toolbar-spacer"></span>
            <div class="toolbar-group">
                <button class="toolbar-btn toolbar-btn-text" data-action="import" title="导入 .md"><i data-lucide="folder-open"></i><span>导入</span></button>
                <button class="toolbar-btn toolbar-btn-text" data-action="exportMD" title="导出 .md"><i data-lucide="download"></i><span>MD</span></button>
                <button class="toolbar-btn toolbar-btn-text" data-action="exportHTML" title="导出 .html"><i data-lucide="file-text"></i><span>HTML</span></button>
                <button class="toolbar-btn toolbar-btn-text" data-action="copy" title="复制 Markdown (Ctrl+Shift+C)"><i data-lucide="clipboard-copy"></i><span>复制</span></button>
            </div>
        </div>
        <div class="toolbar-row">
            <div class="view-toggle">
                <button class="view-btn active" data-action="viewWysiwyg">实时渲染</button>
                <button class="view-btn" data-action="viewMarkdown">Markdown</button>
            </div>
            <span class="toolbar-spacer"></span>
            <button class="toolbar-btn theme-btn" data-action="themeToggle" title="切换主题">☀</button>
            <button class="toolbar-btn" data-action="settings" title="设置 (Ctrl+,)"><i data-lucide="settings"></i></button>
        </div>`;

        // 绑定按钮点击
        this.container.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                if (btn.disabled) return;
                // 视图切换特殊处理
                if (action === 'viewWysiwyg') { this.onAction('viewWysiwyg'); return; }
                if (action === 'viewMarkdown') { this.onAction('viewMarkdown'); return; }
                this.onAction(action);
            });
        });

        // 渲染 Lucide 图标
        if (window.lucide) lucide.createIcons({ nodes: [this.container] });
    }

    updateMode(mode) {
        this.container.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active',
                (mode === 'wysiwyg' && btn.dataset.action === 'viewWysiwyg') ||
                (mode === 'markdown' && btn.dataset.action === 'viewMarkdown')
            );
        });
    }

    setDisabled(actions, disabled) {
        actions.forEach(action => {
            const btn = this.container.querySelector(`[data-action="${action}"]`);
            if (btn) btn.disabled = disabled;
        });
    }

    updateThemeBtn(theme) {
        const btn = this.container.querySelector('.theme-btn');
        if (btn) btn.textContent = theme === 'dark' ? '☾' : '☀';
    }
}


/* ═══════════════════════════════════════════════════════
   Settings — 设置弹窗
   ═══════════════════════════════════════════════════════ */

class Settings {
    constructor() {
        this.overlay = null;
    }

    open() {
        // 创建弹窗
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.innerHTML = `
        <div class="modal-panel">
            <div class="modal-header">
                <h2>设置</h2>
                <button class="modal-close" title="关闭">✕</button>
            </div>
            <div class="modal-body">
                <nav class="modal-sidebar"></nav>
                <div class="modal-content"></div>
            </div>
        </div>`;

        document.body.appendChild(this.overlay);

        // 渲染 Tab 导航
        this._renderSidebar();

        // 默认选中第一个 tab
        const firstTab = Object.keys(CONFIG_SCHEMA)[0];
        this._switchTab(firstTab);

        // 绑定关闭
        this.overlay.querySelector('.modal-close').addEventListener('click', () => this.close());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
        document.addEventListener('keydown', this._escHandler = (e) => {
            if (e.key === 'Escape') this.close();
        });
    }

    close() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        document.removeEventListener('keydown', this._escHandler);
    }

    _renderSidebar() {
        const sidebar = this.overlay.querySelector('.modal-sidebar');
        let html = '';

        for (const id in CONFIG_SCHEMA) {
            const section = CONFIG_SCHEMA[id];
            html += `<button class="modal-tab" data-tab="${id}">
                <span class="modal-tab-icon">${section.icon || '•'}</span>
                ${section.title}
            </button>`;
        }

        html += '<div class="modal-divider"></div>';
        html += `<button class="modal-tab" data-tab="_storage">
            <span class="modal-tab-icon">📦</span> 存储情况
        </button>`;
        html += `<button class="modal-tab" data-tab="_about">
            <span class="modal-tab-icon">ℹ</span> 关于
        </button>`;
        html += '<div class="modal-divider"></div>';
        html += `<button class="modal-tab" data-tab="_export"><span class="modal-tab-icon">📤</span> 导出配置</button>`;
        html += `<button class="modal-tab" data-tab="_import"><span class="modal-tab-icon">📥</span> 导入配置</button>`;
        html += `<button class="modal-tab" data-tab="_reset"><span class="modal-tab-icon">🔄</span> 重置配置</button>`;

        sidebar.innerHTML = html;

        sidebar.querySelectorAll('.modal-tab').forEach(tab => {
            tab.addEventListener('click', () => this._switchTab(tab.dataset.tab));
        });
    }

    _switchTab(tabId) {
        // 更新 tab 高亮
        this.overlay.querySelectorAll('.modal-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tabId);
        });

        const content = this.overlay.querySelector('.modal-content');

        // 特殊 Tab
        if (tabId === '_storage') { content.innerHTML = ''; content.appendChild(this._renderStorage()); return; }
        if (tabId === '_about') { content.innerHTML = ''; content.appendChild(this._renderAbout()); return; }
        if (tabId === '_export') { this._handleExport(); return; }
        if (tabId === '_import') { this._handleImport(); return; }
        if (tabId === '_reset') { this._handleReset(); return; }

        // Schema 驱动的配置 Tab
        const section = CONFIG_SCHEMA[tabId];
        if (!section) return;

        content.innerHTML = `<div class="modal-section-title">${section.title}</div>`;
        for (const key in section.fields) {
            const path = tabId + '.' + key;
            const field = section.fields[key];
            const row = this._renderField(path, field);
            content.appendChild(row);
        }
        this._handleDependsOn(content);
    }

    _renderField(path, field) {
        const row = document.createElement('div');
        row.className = 'setting-row';
        row.dataset.path = path;
        if (field.dependsOn) row.dataset.dependsOn = field.dependsOn;

        // 左侧信息
        const info = document.createElement('div');
        info.className = 'setting-info';
        info.innerHTML = `<div class="setting-label">${field.label}</div>`;
        if (field.description) {
            info.innerHTML += `<div class="setting-desc">${field.description}</div>`;
        }
        row.appendChild(info);

        // 右侧控件
        const control = document.createElement('div');
        control.className = 'setting-control';
        const val = Config.get(path);

        switch (field.type) {
            case 'toggle':
                control.innerHTML = `
                    <label class="toggle-switch">
                        <input type="checkbox" ${val ? 'checked' : ''}>
                        <span class="toggle-track"></span>
                    </label>`;
                control.querySelector('input').addEventListener('change', (e) => {
                    Config.set(path, e.target.checked);
                    this._handleDependsOn(this.overlay.querySelector('.modal-content'));
                });
                break;

            case 'range':
                const display = field.unit ? (val + ' ' + field.unit) : val;
                control.innerHTML = `
                    <div class="range-wrap">
                        <input type="range" min="${field.min}" max="${field.max}" step="${field.step}" value="${val}">
                        <span class="range-value">${display}</span>
                    </div>`;
                const rangeInput = control.querySelector('input');
                const rangeVal = control.querySelector('.range-value');
                rangeInput.addEventListener('input', (e) => {
                    const v = parseFloat(e.target.value);
                    rangeVal.textContent = field.unit ? (v + ' ' + field.unit) : v;
                    Config.set(path, v);
                });
                break;

            case 'select':
                let opts = '';
                (field.options || []).forEach(o => {
                    opts += `<option value="${o.value}" ${String(o.value) === String(val) ? 'selected' : ''}>${o.label}</option>`;
                });
                control.innerHTML = `<div class="select-wrap"><select>${opts}</select></div>`;
                control.querySelector('select').addEventListener('change', (e) => {
                    Config.set(path, e.target.value);
                });
                break;

            case 'text':
                control.innerHTML = `<div class="text-wrap"><input type="text" value="${val || ''}"></div>`;
                control.querySelector('input').addEventListener('change', (e) => {
                    Config.set(path, e.target.value);
                });
                break;
        }

        row.appendChild(control);
        return row;
    }

    /** 处理 dependsOn：如果依赖字段为 false，禁用当前行 */
    _handleDependsOn(container) {
        container.querySelectorAll('[data-depends-on]').forEach(row => {
            const depPath = row.dataset.dependsOn;
            const depVal = Config.get(depPath);
            row.classList.toggle('disabled', !depVal);
        });
    }

    _renderStorage() {
        const frag = document.createElement('div');
        const usage = Storage.usage();
        const fillClass = usage.pct >= 90 ? 'danger' : usage.pct >= parseInt(Config.get('storage.storageWarning')) ? 'warn' : '';

        frag.innerHTML = `
            <div class="modal-section-title">存储空间</div>
            <div class="storage-bar"><div class="storage-fill ${fillClass}" style="width:${Math.max(usage.pct, 1)}%"></div></div>
            <div class="storage-text">已使用 <strong>${Storage.human(usage.used)}</strong> / ${Storage.human(usage.total)}（${usage.pct}%）</div>
            <div class="storage-detail">
                <div class="storage-row"><span class="storage-row-label">文档内容</span><span class="storage-row-value">${Storage.human((Storage.get('doc_content') || '').length * 2)}</span></div>
                <div class="storage-row"><span class="storage-row-label">配置</span><span class="storage-row-value">${Storage.human((Storage.get('config') || '').length * 2 || JSON.stringify(Config.getAll()).length * 2)}</span></div>
                <div class="storage-row"><span class="storage-row-label">图片</span><span class="storage-row-value">${Storage.human(this._calcImageSize())}</span></div>
            </div>
            <div class="storage-actions">
                <button class="storage-btn danger" id="storage-clear">清除全部缓存</button>
            </div>`;

        frag.querySelector('#storage-clear').addEventListener('click', () => {
            if (confirm('确认清除全部缓存？文档内容和配置将被删除。')) {
                Storage.clear();
                location.reload();
            }
        });

        return frag;
    }

    _calcImageSize() {
        let total = 0;
        Storage.keys().filter(k => k.startsWith('img_')).forEach(k => {
            const v = Storage.get(k);
            if (v) total += v.length * 2;
        });
        return total;
    }

    _renderAbout() {
        const frag = document.createElement('div');
        frag.innerHTML = `
            <div class="about-header">
                <div class="about-name">FlashEdit</div>
                <div class="about-version">v0.2.2</div>
                <div class="about-desc">by <a href="https://localwu.com" style="color:inherit; font-weight:600;">LocalWu</a></div>
                <div class="about-desc">一个简洁的 Markdown 富文本编辑器<br>WYSIWYG 实时渲染 · 双主题 · 本地存储</div>
            </div>
            <div class="about-section-title">快捷键</div>
            <div class="shortcut-grid">
                <div class="shortcut-item"><span>加粗</span><span class="shortcut-key">Ctrl+B</span></div>
                <div class="shortcut-item"><span>斜体</span><span class="shortcut-key">Ctrl+I</span></div>
                <div class="shortcut-item"><span>删除线</span><span class="shortcut-key">Ctrl+Shift+X</span></div>
                <div class="shortcut-item"><span>行内代码</span><span class="shortcut-key">Ctrl+\`</span></div>
                <div class="shortcut-item"><span>链接</span><span class="shortcut-key">Ctrl+K</span></div>
                <div class="shortcut-item"><span>标题 1</span><span class="shortcut-key">Ctrl+1</span></div>
                <div class="shortcut-item"><span>标题 2</span><span class="shortcut-key">Ctrl+2</span></div>
                <div class="shortcut-item"><span>标题 3</span><span class="shortcut-key">Ctrl+3</span></div>
                <div class="shortcut-item"><span>保存</span><span class="shortcut-key">Ctrl+S</span></div>
                <div class="shortcut-item"><span>设置</span><span class="shortcut-key">Ctrl+,</span></div>
            </div>`;
        return frag;
    }

    _handleExport() {
        const json = Config.export();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        // 拼接时间戳（月日时分）
        const now = new Date();
        const ts = String(now.getFullYear()) +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');
        a.href = url; a.download = 'flash-edit' + '_' + ts + '.config.json'; a.click();
        URL.revokeObjectURL(url);
        showToast('配置已导出');
    }

    _handleImport() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = () => {
            const reader = new FileReader();
            reader.onload = () => {
                if (Config.import(reader.result)) {
                    showToast('配置已导入');
                    // 刷新当前 tab
                    this._switchTab(Object.keys(CONFIG_SCHEMA)[0]);
                } else {
                    showToast('配置导入失败');
                }
            };
            reader.readAsText(input.files[0]);
        };
        input.click();
    }

    _handleReset() {
        if (confirm('确认重置所有配置为默认值？')) {
            Config.reset();
            showToast('配置已重置');
            this._switchTab(Object.keys(CONFIG_SCHEMA)[0]);
        }
    }
}


/* ═══════════════════════════════════════════════════════
   StatusBar — 状态栏（纯函数更新 DOM）
   ═══════════════════════════════════════════════════════ */

const StatusBar = {
    updateCounts(text) {
        const chars = Markdown.strip(text).length;
        const lines = text ? text.split('\n').length : 0;
        const el1 = document.getElementById('status-chars');
        const el2 = document.getElementById('status-lines');
        if (el1) el1.textContent = chars + ' 字';
        if (el2) el2.textContent = lines + ' 行';
    },

    updateSave(status) {
        const el = document.getElementById('status-saved');
        if (el) el.textContent = status;
    },

    updateStorage() {
        const el = document.getElementById('status-storage');
        if (el) {
            const u = Storage.usage();
            el.textContent = '' + Storage.human(u.used); //底部存储情况展示
        }
    }
};


/* ═══════════════════════════════════════════════════════
   showToast — Toast 通知
   ═══════════════════════════════════════════════════════ */

let _toastTimer = null;

function showToast(msg, duration = 2000) {
    const el = document.getElementById('toast');
    if (!el) return;
    clearTimeout(_toastTimer);
    el.textContent = msg;
    el.classList.add('show');
    _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}
