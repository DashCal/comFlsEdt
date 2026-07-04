/**
 * Markdown — 解析与序列化引擎
 * 全 static，零外部依赖
 * parse:       Markdown 文本 → BlockDescriptor[]
 * serialize:   DOM container → Markdown 文本
 * parseInline: 行内 Markdown → HTML 字符串
 * detectType:  单行文本 → 块类型检测
 */
class Markdown {

    /* ═══════════════════════════════════════════
       解析：Markdown 文本 → Block[]
       ═══════════════════════════════════════════ */

    /**
     * 解析完整 Markdown 文本为块数组
     * Block = { id, type, content(行内HTML), raw, attrs }
     */
    static parse(md) {
        if (!md || !md.trim()) return [{ id: Markdown.genId(), type: 'p', content: '', raw: '', attrs: {} }];
        const lines = md.split('\n');
        return Markdown._parseBlocks(lines);
    }

    /** 状态机解析器 */
    static _parseBlocks(lines) {
        const blocks = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            // ── 空行：跳过 ──
            if (!line.trim()) { i++; continue; }

            // ── 零宽空格行：空段落标记 → 创建空 p 块 ──
            // ↓ 原来的无条件识别改为带开关
            if (line.trim() === '\u200B') {
                if (Config.get('editor.preserveBlankLines')) {
                    blocks.push({ id: Markdown.genId(), type: 'p', content: '<br>', raw: '', attrs: {} });
                }
                i++; continue;
            }

            // ── 代码块：``` 开头 ──
            if (line.trimStart().startsWith('```')) {
                const lang = line.trimStart().slice(3).trim();
                const codeLines = [];
                i++;
                while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
                    codeLines.push(lines[i]);
                    i++;
                }
                i++; // 跳过结束的 ```
                blocks.push({
                    id: Markdown.genId(), type: 'code',
                    content: Markdown._esc(codeLines.join('\n')),
                    raw: codeLines.join('\n'),
                    attrs: { lang }
                });
                continue;
            }

            // ── 标题：# 开头 ──
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                const level = headingMatch[1].length;
                const text = headingMatch[2].trim();
                blocks.push({
                    id: Markdown.genId(), type: 'h' + level,
                    content: Markdown.parseInline(text), raw: text, attrs: {}
                });
                i++; continue;
            }

            // ── 水平线：--- / *** / ___ ──
            if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
                blocks.push({ id: Markdown.genId(), type: 'hr', content: '', raw: '', attrs: {} });
                i++; continue;
            }

            // ── 无序列表：- 或 * 开头 ──
            const ulMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
            if (ulMatch) {
                const items = [];
                while (i < lines.length) {
                    const m = lines[i].match(/^(\s*)[-*]\s+(.+)$/);
                    if (!m) break;
                    items.push(m[2]);
                    i++;
                }
                blocks.push({
                    id: Markdown.genId(), type: 'ul',
                    content: '', raw: '',
                    attrs: {},
                    children: items.map(text => ({
                        id: Markdown.genId(), type: 'li',
                        content: Markdown.parseInline(text), raw: text, attrs: {}
                    }))
                });
                continue;
            }

            // ── 有序列表：数字. 开头 ──
            const olMatch = line.match(/^(\s*)\d+[.)]\s+(.+)$/);
            if (olMatch) {
                const items = [];
                while (i < lines.length) {
                    const m = lines[i].match(/^(\s*)\d+[.)]\s+(.+)$/);
                    if (!m) break;
                    items.push(m[2]);
                    i++;
                }
                blocks.push({
                    id: Markdown.genId(), type: 'ol',
                    content: '', raw: '',
                    attrs: {},
                    children: items.map(text => ({
                        id: Markdown.genId(), type: 'li',
                        content: Markdown.parseInline(text), raw: text, attrs: {}
                    }))
                });
                continue;
            }

            // ── 引用：> 开头 ──
            if (line.match(/^>\s?(.*)$/)) {
                const quoteLines = [];
                while (i < lines.length) {
                    const m = lines[i].match(/^>\s?(.*)$/);
                    if (!m) break;
                    quoteLines.push(m[1]);
                    i++;
                }
                const raw = quoteLines.join('\n');
                blocks.push({
                    id: Markdown.genId(), type: 'blockquote',
                    content: Markdown.parseInline(raw), raw, attrs: {}
                });
                continue;
            }

            // ── 图片独占一行：![alt](url) ──
            const imgMatch = line.trim().match(/^!$$([^$$]*)\]$$([^)]+)$$$/);
            if (imgMatch) {
                blocks.push({
                    id: Markdown.genId(), type: 'figure',
                    content: '', raw: line, attrs: { src: imgMatch[2], alt: imgMatch[1] }
                });
                i++; continue;
            }

            // ── 段落：合并连续非空行 ──
            const pLines = [];
            while (i < lines.length && lines[i].trim() &&
                !lines[i].trimStart().startsWith('```') &&
                !lines[i].match(/^#{1,6}\s/) &&
                !lines[i].match(/^(\s*[-*_]\s*){3,}$/) &&
                !lines[i].match(/^\s*[-*]\s+/) &&
                !lines[i].match(/^\s*\d+[.)]\s+/) &&
                !lines[i].match(/^>\s?/) &&
                !lines[i].trim().match(/^!$$([^$$]*)\]$$([^)]+)$$$/)) {
                pLines.push(lines[i]);
                i++;
            }
            const raw = pLines.join('\n');
            blocks.push({
                id: Markdown.genId(), type: 'p',
                content: Markdown.parseInline(raw), raw, attrs: {}
            });
        }

        return blocks;
    }


    /* ═══════════════════════════════════════════
       行内解析：纯文本 → HTML 字符串
       ═══════════════════════════════════════════ */

    // static parseInline(text) {
    //     if (!text) return '';
    //     let t = Markdown._esc(text);
    //     // 行内代码（内部不处理其他语法）
    //     t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    //     // 图片
    //     t = t.replace(/!$$([^$$]*)\]$$([^)]+)$$/g, '<img src="$2" alt="$1">');
    //     // 链接
    //     t = t.replace(/$$([^$$]+)\]$$([^)]+)$$/g, '<a href="$2">$1</a>');
    //     // 粗斜体 ***text***
    //     t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    //     // 粗体 **text**
    //     t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    //     // 斜体 *text*
    //     t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
    //     // 删除线 ~~text~~
    //     t = t.replace(/~~(.+?)~~/g, '<del>$1</del>');
    //     // 换行
    //     t = t.replace(/\n/g, '<br>');
    //     return t;
    // }

    static parseInline(text) {
        if (!text) return '';
        let t = Markdown._esc(text);
        t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        // 用函数替换，避免 URL 中的 $ 字符被误解析为反向引用
        t = t.replace(/!$$([^$$]*)\]$$([^)]+)$$/g, (m, alt, url) => '<img src="' + url + '" alt="' + alt + '">');
        t = t.replace(/$$([^$$]+)\]$$([^)]+)$$/g, (m, txt, url) => '<a href="' + url + '">' + txt + '</a>');
        t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
        t = t.replace(/~~(.+?)~~/g, '<del>$1</del>');
        t = t.replace(/\n/g, '<br>');
        return t;
    }


    /* ═══════════════════════════════════════════
       序列化：DOM → Markdown 文本
       ═══════════════════════════════════════════ */

    /** 遍历 container 的直接子元素，逐块序列化 */
    static serialize(container) {
        const parts = [];
        for (const el of container.children) {
            const md = Markdown._serBlock(el);
            if (md !== null) parts.push(md);
        }
        // return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        // ↓ 去掉 .replace(/\n{3,}/g, '\n\n')，只保留 trim
        return parts.join('').trim();
    }

    /** 序列化单个块元素 */
    static _serBlock(el) {
        const type = el.dataset.type;
        if (!type) return null;

        switch (type) {
            case 'h1': case 'h2': case 'h3':
            case 'h4': case 'h5': case 'h6': {
                const level = parseInt(type[1]);
                return '#'.repeat(level) + ' ' + Markdown._serInline(el) + '\n\n';
            }
            // case 'p':
            //     return Markdown._serInline(el) + '\n\n';
            case 'p': {
                const text = Markdown._serInline(el);
                if (!text.trim()) {
                    // 开关开启 → 零宽空格标记；关闭 → 正常空段落（会丢失）
                    return Config.get('editor.preserveBlankLines') ? '\u200B\n\n' : '\n\n';
                }
                return text + '\n\n';
            }
            case 'ul': {
                const items = [];
                for (const li of el.querySelectorAll(':scope > .li')) {
                    items.push('- ' + Markdown._serInline(li));
                }
                return items.join('\n') + '\n\n';
            }
            case 'ol': {
                const items = [];
                let idx = 1;
                for (const li of el.querySelectorAll(':scope > .li')) {
                    items.push(idx + '. ' + Markdown._serInline(li));
                    idx++;
                }
                return items.join('\n') + '\n\n';
            }
            case 'blockquote':
                return '> ' + Markdown._serInline(el).replace(/\n/g, '\n> ') + '\n\n';
            case 'code': {
                const lang = el.dataset.lang || '';
                const code = el.querySelector('code');
                const text = code ? code.textContent : el.textContent;
                return '```' + lang + '\n' + text + '\n```\n\n';
            }
            case 'hr':
                return '---\n\n';
            case 'figure': {
                const img = el.querySelector('img');
                if (!img) return null;
                return '![' + (img.alt || '') + '](' + img.src + ')\n\n';
            }
            default:
                return Markdown._serInline(el) + '\n\n';
        }
    }

    /** 序列化行内节点为 Markdown 文本 */
    static _serInline(node) {
        let result = '';
        for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                result += child.textContent;
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const tag = child.tagName.toLowerCase();
                const inner = Markdown._serInline(child);
                switch (tag) {
                    case 'strong': case 'b': result += '**' + inner + '**'; break;
                    case 'em': case 'i': result += '*' + inner + '*'; break;
                    case 'del': case 's': result += '~~' + inner + '~~'; break;
                    case 'code': result += '`' + child.textContent + '`'; break;
                    case 'a': result += '[' + inner + '](' + child.href + ')'; break;
                    case 'img': result += '![' + (child.alt || '') + '](' + child.src + ')'; break;
                    case 'br': result += '\n'; break;
                    default: result += inner;
                }
            }
        }
        return result;
    }


    /* ═══════════════════════════════════════════
       工具方法
       ═══════════════════════════════════════════ */

    /**
     * 检测单行文本的块类型（供 Editor 输入检测用）
     * 返回 { type, content, prefix } 或 null
     */
    static detectType(text) {
        if (!text) return null;
        const t = text;

        // 代码块：``` 可选语言
        const fenceMatch = t.match(/^```(\w*)$/);
        if (fenceMatch) return { type: 'code', content: '', prefix: t, lang: fenceMatch[1] };

        // 标题：1~6 个 # + 空格
        const hMatch = t.match(/^(#{1,6})\s+(.+)$/);
        if (hMatch) return { type: 'h' + hMatch[1].length, content: hMatch[2], prefix: hMatch[1] + ' ' };

        // 无序列表：- 或 * + 空格
        const ulMatch = t.match(/^[-*]\s+(.+)$/);
        if (ulMatch) return { type: 'ul', content: ulMatch[1], prefix: t.match(/^[-*]\s/)[0] };

        // 有序列表：数字. + 空格
        const olMatch = t.match(/^\d+[.)]\s+(.+)$/);
        if (olMatch) return { type: 'ol', content: olMatch[1], prefix: t.match(/^\d+[.)]\s/)[0] };

        // 引用：> + 可选空格
        const qMatch = t.match(/^>\s?(.*)$/);
        if (qMatch) return { type: 'blockquote', content: qMatch[1], prefix: '> ' };

        // 水平线：--- / *** / ___
        if (/^[-*_]{3,}$/.test(t.trim())) return { type: 'hr', content: '', prefix: t };

        return null;
    }

    /** 生成唯一块 ID */
    static genId() {
        return 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    }

    /** 去除 Markdown 行内标记，返回纯文本（用于字数统计） */
    static strip(text) {
        if (!text) return '';
        return text
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`]+`/g, '')
            .replace(/!$$([^$$]*)\]$$[^)]+$$/g, '$1')
            .replace(/$$([^$$]+)\]$$[^)]+$$/g, '$1')
            .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/~~(.+?)~~/g, '$1')
            .replace(/#{1,6}\s/g, '')
            .replace(/[-*]\s/g, '')
            .replace(/>\s/g, '')
            .replace(/---/g, '');
    }

    /** HTML 实体转义 */
    static _esc(t) {
        return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}