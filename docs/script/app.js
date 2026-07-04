/**
 * App — 应用入口与协调器
 * 初始化所有模块，建立事件桥接，处理文件操作
 * 持有 Editor、Toolbar、Settings 的引用
 */
class App {
    constructor() {
        this.editor = null;
        this.toolbar = null;
        this.settings = null;
        this.saveTimer = null;
        this._saveDebounce = null;
    }

    init() {
        // ── 第 1 层：配置系统 ──
        Config.init();
        Theme.init();

        // ── 第 2 层：编辑器 ──
        this.editor = new Editor('#editor-area');
        this.editor.onContentChange = (c) => this._onChange(c);
        this.editor.init();

        // ── 第 3 层：工具栏 ──
        this.toolbar = new Toolbar('#toolbar', (a) => this._action(a));
        this.toolbar.render();
        this.toolbar.updateMode(this.editor.mode);
        this.toolbar.updateThemeBtn(Theme.get());

        // ── 第 4 层：加载文档 ──
        this._loadDoc();

        // ── 第 5 层：状态栏初始化 ──
        StatusBar.updateStorage();

        // ── 第 6 层：自动保存 + 全局事件 ──
        this._startAutoSave();
        this._bindGlobal();
        // ↓ 新增：注册配置变更回调
        Config._onChange = (path, val) => this._onConfigChange(path, val);
    }

    /* ═══════════════════════════════════════════
       文档生命周期
       ═══════════════════════════════════════════ */

    _loadDoc() {
        const content = Storage.get('doc_content');
        if (content) {
            this.editor.setContent(content);
        } else {
            this.editor.setContent(App.WELCOME);
        }
        StatusBar.updateCounts(this.editor.getContent());
    }

    // _loadDoc() {
    //     const content = Storage.get('doc_content');
    //     if (!content) {
    //         this.editor.setContent(App.WELCOME);
    //         StatusBar.updateCounts(this.editor.getContent());
    //         return;
    //     }
    //     // 内容包含 data-type → HTML 格式，直接恢复 DOM
    //     if (typeof content === 'string' && content.includes('data-type')) {
    //         this.editor.setHTML(content);
    //     } else {
    //         this.editor.setContent(content);
    //     }
    //     StatusBar.updateCounts(this.editor.getContent());
    // }

    save() {
        StatusBar.updateSave('保存中...');
        const content = this.editor.getContent();
        Storage.set('doc_content', content);
        Storage.set('doc_meta', {
            updatedAt: Date.now(),
            chars: Markdown.strip(content).length,
            lines: content.split('\n').length
        });
        StatusBar.updateSave('已保存✓');
        StatusBar.updateStorage();
    }

    // save() {
    //     StatusBar.updateSave('保存中...');
    //     if (this.editor.mode === 'wysiwyg') {
    //         Storage.set('doc_content', this.editor.getHTML());
    //     } else {
    //         Storage.set('doc_content', this.editor.textarea.value);
    //     }
    //     const md = this.editor.mode === 'wysiwyg'
    //         ? this.editor.getContent()
    //         : this.editor.textarea.value;
    //     Storage.set('doc_meta', {
    //         updatedAt: Date.now(),
    //         chars: Markdown.strip(md).length,
    //         lines: md.split('\n').length
    //     });
    //     StatusBar.updateSave('已保存 ✓');
    //     StatusBar.updateStorage();
    // }

    _onChange(content) {
        StatusBar.updateCounts(content);
        // 新增：实时缓存派生文件名
        this._cachedFilename = this._deriveFilename(content);
        // 防抖自动保存（输入时实时触发，但不立即写 LS）
        if (Config.get('general.autoSave')) {
            clearTimeout(this._saveDebounce);
            this._saveDebounce = setTimeout(() => this.save(),
                (Config.get('general.autoSaveInterval') || 5) * 1000);
        }
    }

    _startAutoSave() {
        if (this.saveTimer) clearInterval(this.saveTimer);
        if (Config.get('general.autoSave')) {
            const ms = (Config.get('general.autoSaveInterval') || 5) * 1000;
            this.saveTimer = setInterval(() => this.save(), ms);
        }
    }

    /* ═══════════════════════════════════════════
       动作分发
       ═══════════════════════════════════════════ */

    _action(name) {
        const isWysiwyg = this.editor.mode === 'wysiwyg';

        // ── 编辑动作（仅 WYSIWYG 模式）──
        if (isWysiwyg) {
            this.editor.el.focus();
            switch (name) {
                case 'bold': this.editor.applyBold(); return;
                case 'italic': this.editor.applyItalic(); return;
                case 'strike': this.editor.applyStrike(); return;
                case 'code': this.editor.applyCode(); return;
                case 'link': this.editor._insertLink(); return;
                case 'image': this._handleImageAction(); return;
                case 'h1': this.editor._toHeading('h1'); return;
                case 'h2': this.editor._toHeading('h2'); return;
                case 'h3': this.editor._toHeading('h3'); return;
                case 'quote': this.editor._toQuote(); return;
                case 'ul': this.editor._toList('ul'); return;
                case 'ol': this.editor._toList('ol'); return;
                case 'hr': this.editor._insertHR(); return;
                case 'undo': this.editor.undo(); return;
                case 'redo': this.editor.redo(); return;
            }
        }

        // ── 通用动作 ──
        switch (name) {
            case 'import': this._doImport(); break;
            case 'exportMD': this._doExportMD(); break;
            case 'exportHTML': this._doExportHTML(); break;
            case 'copy': this._doCopy(); break;
            case 'viewWysiwyg': this._switchMode('wysiwyg'); break;
            case 'viewMarkdown': this._switchMode('markdown'); break;
            case 'themeToggle': Theme.toggle(); this.toolbar.updateThemeBtn(Theme.get()); break;
            case 'settings': this._openSettings(); break;
        }
    }

    _handleImageAction() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = () => {
            if (input.files[0]) this.editor._handleImageFile(input.files[0]);
        };
        input.click();
    }

    /* ═══════════════════════════════════════════
       模式切换
       ═══════════════════════════════════════════ */

    _switchMode(mode) {
        if (this.editor.mode === mode) return;
        if (mode === 'markdown') {
            this.editor.switchToMarkdown();
            this.toolbar.setDisabled(
                ['bold', 'italic', 'strike', 'code', 'h1', 'h2', 'h3', 'quote', 'ul', 'ol', 'hr', 'link', 'image', 'undo', 'redo'], true);
        } else {
            this.editor.switchToWysiwyg();
            this.toolbar.setDisabled(
                ['bold', 'italic', 'strike', 'code', 'h1', 'h2', 'h3', 'quote', 'ul', 'ol', 'hr', 'link', 'image', 'undo', 'redo'], false);
        }
        this.toolbar.updateMode(mode);
        StatusBar.updateCounts(this.editor.getContent());
    }

    /* ═══════════════════════════════════════════
       文件操作
       ═══════════════════════════════════════════ */

    _doImport() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.md,.markdown,.txt';
        input.onchange = () => {
            if (!input.files[0]) return;
            const reader = new FileReader();
            reader.onload = () => {
                this.editor.setContent(reader.result);
                this.save();
                showToast('已导入: ' + input.files[0].name);
            };
            reader.readAsText(input.files[0]);
        };
        input.click();
    }

    _doExportMD() {
        const content = this.editor.getContent();
        this._download(content, this._filename() + '.md', 'text/markdown');
        showToast('已导出 MD 文件');
    }

    _doExportHTML() {
        const md = this.editor.getContent();
        const blocks = Markdown.parse(md);
        let body = '';
        blocks.forEach(b => {
            if (b.type === 'h1') body += '<h1>' + b.content + '</h1>\n';
            else if (b.type === 'h2') body += '<h2>' + b.content + '</h2>\n';
            else if (b.type === 'h3') body += '<h3>' + b.content + '</h3>\n';
            else if (b.type === 'h4') body += '<h4>' + b.content + '</h4>\n';
            else if (b.type === 'h5') body += '<h5>' + b.content + '</h5>\n';
            else if (b.type === 'h6') body += '<h6>' + b.content + '</h6>\n';
            else if (b.type === 'p') body += '<p>' + b.content + '</p>\n';
            else if (b.type === 'blockquote') body += '<blockquote>' + b.content + '</blockquote>\n';
            else if (b.type === 'code') body += '<pre><code' + (b.attrs.lang ? ' class="language-' + b.attrs.lang + '"' : '') + '>' + b.content + '</code></pre>\n';
            else if (b.type === 'hr') body += '<hr>\n';
            else if (b.type === 'figure') body += '<figure><img src="' + (b.attrs.src || '') + '" alt="' + (b.attrs.alt || '') + '"></figure>\n';
            else if (b.type === 'ul') body += '<ul>' + (b.children || []).map(i => '<li>' + i.content + '</li>').join('') + '</ul>\n';
            else if (b.type === 'ol') body += '<ol>' + (b.children || []).map(i => '<li>' + i.content + '</li>').join('') + '</ol>\n';
        });
        const fullHTML = this._wrapHTML(body);
        this._download(fullHTML, this._filename() + '.html', 'text/html');
        showToast('已导出 HTML 文件');
    }

    async _doCopy() {
        const content = this.editor.getContent();
        try {
            await navigator.clipboard.writeText(content);
            showToast('已复制到剪贴板');
        } catch {
            // 降级
            const ta = document.createElement('textarea');
            ta.value = content; document.body.appendChild(ta);
            ta.select(); document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('已复制到剪贴板');
        }
    }

    _download(content, filename, mime) {
        const blob = new Blob(['\uFEFF' + content], { type: mime + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }

    /**
 * 从文档内容派生文件名
 * 1. 找第一个标题（h1>h2>h3>h4>h5>h6）
 * 2. 无标题则取第一段纯文本
 * 3. 去除特殊字符，截断，拼接时间戳
 */
    _deriveFilename(content) {
        if (!content) return 'document';

        const lines = content.split('\n');
        let title = '';

        // 第一步：找所有标题，记录层级和出现顺序
        const headings = [];
        for (const line of lines) {
            const m = line.match(/^(#{1,6})\s+(.+)$/);
            if (m) {
                headings.push({ level: m[1].length, text: m[2].trim() });
            }
        }

        if (headings.length > 0) {
            // 按层级排序（h1最优先），同层级取第一个
            headings.sort((a, b) => a.level - b.level);
            title = headings[0].text;
        } else {
            // 无标题：取第一个非空非特殊行的纯文本
            for (const line of lines) {
                const t = line.trim();
                if (t &&
                    !t.startsWith('#') &&
                    !t.startsWith('```') &&
                    !t.startsWith('>') &&
                    !t.startsWith('---') &&
                    !t.startsWith('- ') &&
                    !t.startsWith('* ') &&
                    !/^\d+\.\s/.test(t)) {
                    title = t;
                    break;
                }
            }
        }

        // 第二步：去除 Markdown 行内标记
        title = Markdown.strip(title);

        // 第三步：去除特殊字符，只保留中文、字母、数字、空格、连字符
        title = title
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')  // 文件系统非法字符
            .replace(/[【】「」《》（）\(\)\[\]\{\}]/g, '') // 括号
            .replace(/[.!@#$%^&+=~`',;。！？、，；·…—]/g, '')  // 标点
            .replace(/\s+/g, ' ')   // 多空格合一
            .trim();

        // 第四步：截断（中文按字符，限制50个字符宽度）
        if (title.length > 50) {
            title = title.slice(0, 20).trim();
        }

        // 第五步：如果为空，使用默认值
        if (!title) title = 'document';

        // 第六步：拼接时间戳（月日时分）
        const now = new Date();
        const ts = String(now.getFullYear()) +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');

        return title + '_' + ts;
    }

    _filename() {
        // 优先使用缓存的派生文件名，其次用配置的默认值
        return this._cachedFilename || Config.get('general.defaultFilename') || 'document';
    }

    _wrapHTML(body) {
        const vars = Theme.get() === 'dark' ? `
            body{background:#0e0e10;color:#e4e4e7}
            code,pre{background:#09090b;color:#cdd6f4}
            a{color:#60a5fa}` : `
            body{background:#fff;color:#1a1a1a}
            code,pre{background:#1e1e2e;color:#cdd6f4}
            a{color:#2563eb}`;
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${this._filename()}</title>
<style>
body{max-width:720px;margin:40px auto;padding:0 24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",sans-serif;font-size:16px;line-height:1.8}
h1{font-size:2em;margin:1.4em 0 .4em}h2{font-size:1.6em;margin:1.2em 0 .35em}h3{font-size:1.3em;margin:1em 0 .3em}
p{margin:.2em 0}blockquote{border-left:3px solid #d1d5db;padding:4px 0 4px 16px;color:#6b7280;margin:.5em 0}
pre{background:#1e1e2e;color:#cdd6f4;border-radius:8px;padding:18px 20px;overflow-x:auto;margin:.8em 0}
pre code{background:none;color:inherit;padding:0;font-size:13.5px}
code{font-family:monospace;font-size:.88em;background:#f1f3f5;color:#d6336c;padding:2px 6px;border-radius:4px}
ul,ol{padding-left:1.6em;margin:.3em 0}li{margin-bottom:.15em}
hr{border:none;border-top:2px solid #e5e7eb;margin:1.6em 0}
img{max-width:100%;border-radius:6px}
a{color:#2563eb;text-decoration:underline}
${vars}</style>
</head>
<body>
${body}
</body>
</html>`;
    }

    /* ═══════════════════════════════════════════
       设置 & 全局事件
       ═══════════════════════════════════════════ */

    _openSettings() {
        this.settings = new Settings();
        this.settings.open();
    }

    _onConfigChange(path, val) {
        // 全量刷新（导入/重置配置时触发）
        if (path === '*') {
            Theme.init();
            this.toolbar.updateThemeBtn(Theme.get());
            this.editor.applyStyles();
            this._startAutoSave();
            return;
        }
        // 编辑器样式相关配置变化
        if (path.startsWith('editor.') || path.startsWith('heading.')) {
            this.editor.applyStyles();
        }
        // 主题切换
        if (path === 'general.theme') {
            Theme.set(val);
            this.toolbar.updateThemeBtn(Theme.get());
        }
        // 自动保存间隔变化
        if (path === 'general.autoSave' || path === 'general.autoSaveInterval') {
            this._startAutoSave();
        }
    }

    _bindGlobal() {
        // 全局快捷键
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === ',') {
                e.preventDefault();
                this._openSettings();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.save();
                showToast('已保存');
            }
        });

        // 页面关闭前保存
        window.addEventListener('beforeunload', () => this.save());
    }
}


/* ═══════════════════════════════════════════════════════
   默认欢迎内容
   ═══════════════════════════════════════════════════════ */

App.WELCOME = `# 欢迎使用 FlashEditor by LocalWu

一个简洁的 Markdown 富文本编辑器。

## 基本功能

在 WYSIWYG 模式下，直接输入 Markdown 语法即可实时渲染：

- 输入 \`# 标题\` 后按空格，自动转为一级标题
- 输入 \`- 列表项\` 后按空格，自动转为无序列表
- 输入 \`> 引用\` 后按空格，自动转为引用块
- 输入 \`\`\` \`\`\` 后回车，进入代码块
- 输入 \`---\` 后回车，插入分割线

**加粗文字**、*斜体文字*、\`行内代码\` 也支持实时渲染。

## 工具栏

顶部工具栏提供常用操作按钮，也支持快捷键：

| 操作 | 快捷键 |
|------|--------|
| 加粗 | Ctrl+B |
| 斜体 | Ctrl+I |
| 链接 | Ctrl+K |
| 保存 | Ctrl+S |
| 设置 | Ctrl+, |

## 主题

点击工具栏右侧的 ☀/☾ 按钮切换 **简洁白** 和 **代码黑** 主题。

## 数据存储

所有内容自动保存到浏览器 localStorage，关闭页面不会丢失。

点击右下角 ⚙ 设置按钮可以查看存储使用情况、调整编辑器配置。

---

*开始编辑吧！试试输入 Markdown 语法...*
`;


/* ═══════════════════════════════════════════════════════
   启动
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    new App().init();
});