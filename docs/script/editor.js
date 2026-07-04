/**
 * Editor — WYSIWYG 编辑器核心
 * 管理 contenteditable 容器，处理输入/键盘/粘贴/格式化
 * 依赖 Markdown（解析/序列化）和 Config（读取配置）
 */
class Editor {

    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
        this.el = null;          // contenteditable div
        this.textarea = null;    // 源码 textarea
        this.mode = 'wysiwyg';
        this.onContentChange = null; // 回调，由 App 注入
        // ↓ 新增：历史栈
        this._history = [];
        this._historyIdx = -1;
        this._historyTimer = null;
        this._observer = null;
        this._gutter = null;
    }

    /* ═══════════════════════════════════════════
       初始化
       ═══════════════════════════════════════════ */

    init() {
        // 创建 DOM 结构
        const wrap = document.createElement('div');
        wrap.className = 'editor-wrap';

        this.el = document.createElement('div');
        this.el.className = 'editor-content';
        this.el.setAttribute('contenteditable', 'true');
        this.el.setAttribute('spellcheck', 'false');
        this.el.setAttribute('data-placeholder', '开始输入 Markdown...');

        this.textarea = document.createElement('textarea');
        this.textarea.className = 'editor-source';
        this.textarea.setAttribute('placeholder', '输入 Markdown 源码...');
        this.textarea.hidden = true;

        wrap.appendChild(this.el);
        wrap.appendChild(this.textarea);
        this.container.appendChild(wrap);

        this._bindEvents();
        this._initLineNumbers();
        this.applyStyles();

        // 初始化历史快照
        this._history = [this.el.innerHTML];
        this._historyIdx = 0;

        // 监听 DOM 变化，自动记录快照
        this._observer = new MutationObserver(() => {
            clearTimeout(this._historyTimer);
            this._historyTimer = setTimeout(() => this._saveSnapshot(), 300);
        });
        this._observer.observe(this.el, { childList: true, subtree: true, characterData: true });
    }

    _initLineNumbers() {
        const wrap = this.el.parentElement;
        wrap.style.display = 'flex';

        this._gutter = document.createElement('div');
        this._gutter.className = 'editor-gutter';
        wrap.insertBefore(this._gutter, this.el);
        this.el.style.flex = '1';

        this._updateLineNumbers();
        this.el.addEventListener('scroll', () => {
            this._gutter.scrollTop = this.el.scrollTop;
        });

        // 监听内容变化更新行号
        this._lineObserver = new MutationObserver(() => this._updateLineNumbers());
        this._lineObserver.observe(this.el, { childList: true, subtree: true, characterData: true });
    }

    _updateLineNumbers() {
        if (!this._gutter || this.mode !== 'wysiwyg') return;
        const blocks = this.el.querySelectorAll('.block');
        let html = '';
        for (let i = 0; i < blocks.length; i++) {
            html += '<div class="gutter-line">' + (i + 1) + '</div>';
        }
        this._gutter.innerHTML = html;
    }

    /* ═══════════════════════════════════════════
       内容操作（外部 API）
       ═══════════════════════════════════════════ */

    /** 获取当前 Markdown 文本 */
    getContent() {
        if (this.mode === 'markdown') return this.textarea.value;
        return Markdown.serialize(this.el);
    }

    /** 从 Markdown 文本加载内容 */
    setContent(md) {
        const blocks = Markdown.parse(md);
        this._renderBlocks(blocks);
        this._notifyChange();
        // ↓ 新增：重置历史栈
        this._history = [this.el.innerHTML];
        this._historyIdx = 0;
        this._notifyChange();
    }

    /** 获取原始 HTML（用于无损存储） */
    getHTML() {
        return this.el ? this.el.innerHTML : '';
    }

    /** 从 HTML 直接加载（用于从存储恢复，无解析损耗） */
    setHTML(html) {
        if (html && html.trim()) {
            this.el.innerHTML = html;
        } else {
            this.el.innerHTML = '<div class="block p" data-type="p" data-id="' + Markdown.genId() + '"><br></div>';
        }
        this._history = [this.el.innerHTML];
        this._historyIdx = 0;
        this._notifyChange();
    }

    //? 不知道是不是幻觉 原本没有这个方法
    destroy() {
        if (this._observer) this._observer.disconnect();  // ← 新增
        this._unbindEvents();
        this.container.innerHTML = '';
    }

    /** 将解析后的 blocks 渲染到编辑器 DOM */
    _renderBlocks(blocks) {
        this.el.innerHTML = '';
        blocks.forEach(b => this.el.appendChild(this._createBlockEl(b)));
    }

    /** 根据 BlockDescriptor 创建 DOM 元素 */
    _createBlockEl(block) {
        // 列表类型（ul/ol）：需要子容器
        if (block.type === 'ul' || block.type === 'ol') {
            const wrap = document.createElement('div');
            wrap.className = 'block ' + block.type;
            wrap.dataset.type = block.type;
            wrap.dataset.id = block.id;
            const items = block.children || [];
            items.forEach(item => {
                const li = document.createElement('div');
                li.className = 'li';
                li.dataset.type = 'li';
                li.dataset.id = item.id;
                li.innerHTML = item.content;
                wrap.appendChild(li);
            });
            if (items.length === 0) {
                const li = document.createElement('div');
                li.className = 'li';
                li.dataset.type = 'li';
                li.innerHTML = '';
                wrap.appendChild(li);
            }
            return wrap;
        }

        // 代码块
        if (block.type === 'code') {
            const pre = document.createElement('pre');
            pre.className = 'block code';
            pre.dataset.type = 'code';
            pre.dataset.id = block.id;
            if (block.attrs.lang) pre.dataset.lang = block.attrs.lang;
            const code = document.createElement('code');
            code.textContent = block.raw || '';
            pre.appendChild(code);
            return pre;
        }

        // 分割线
        if (block.type === 'hr') {
            const div = document.createElement('div');
            div.className = 'block hr';
            div.dataset.type = 'hr';
            div.dataset.id = block.id;
            div.innerHTML = '<hr>';
            return div;
        }

        // 图片
        if (block.type === 'figure') {
            const div = document.createElement('div');
            div.className = 'block figure';
            div.dataset.type = 'figure';
            div.dataset.id = block.id;
            const img = document.createElement('img');
            img.src = block.attrs.src || '';
            img.alt = block.attrs.alt || '';
            div.appendChild(img);
            return div;
        }

        // 通用块：h1-h6, p, blockquote
        const div = document.createElement('div');
        div.className = 'block ' + block.type;
        div.dataset.type = block.type;
        div.dataset.id = block.id;
        div.innerHTML = block.content;
        return div;
    }

    focus() { this.el.focus(); }

    /** 保存当前快照到历史栈 */
    _saveSnapshot() {
        const html = this.el.innerHTML;
        if (this._historyIdx >= 0 && this._history[this._historyIdx] === html) return;
        // 截断 redo 栈
        this._history.length = this._historyIdx + 1;
        this._history.push(html);
        this._historyIdx = this._history.length - 1;
        if (this._history.length > 50) {
            this._history.shift();
            this._historyIdx--;
        }
    }

    /** 撤销 */
    undo() {
        if (this._historyIdx <= 0) return;
        clearTimeout(this._historyTimer);
        this._historyIdx--;
        this.el.innerHTML = this._history[this._historyIdx];
        this.el.focus();
        this._notifyChange();
    }

    /** 重做 */
    redo() {
        if (this._historyIdx >= this._history.length - 1) return;
        clearTimeout(this._historyTimer);
        this._historyIdx++;
        this.el.innerHTML = this._history[this._historyIdx];
        this.el.focus();
        this._notifyChange();
    }

    /* ═══════════════════════════════════════════
       输入处理
       ═══════════════════════════════════════════ */

    _handleInput() {
        const block = this._currentBlock();
        if (!block) { this._notifyChange(); return; }

        const text = block.textContent;

        // 块级检测
        const hit = Markdown.detectType(text);
        if (hit) {
            this._consumeAndTransform(block, hit);
            this._notifyChange();
            return;
        }

        // 行内检测
        const sel = window.getSelection();
        if (sel && sel.rangeCount && sel.focusNode && sel.focusNode.nodeType === Node.TEXT_NODE) {
            this._tryInline(sel.focusNode, sel.focusOffset);
        }

        this._notifyChange();
    }

    _handleKeydown(e) {
        // 快捷键分发
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'z': e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return;
                case 'y': e.preventDefault(); this.redo(); return;
                case 'b': e.preventDefault(); document.execCommand('bold'); return;
                case 'i': e.preventDefault(); document.execCommand('italic'); return;
                case '`': e.preventDefault(); this._wrapInline('code'); return;
                case 'k': e.preventDefault(); this._insertLink(); return;
                case 's': e.preventDefault(); return; // 由 App 拦截
                case '1': e.preventDefault(); this._toHeading('h1'); return;
                case '2': e.preventDefault(); this._toHeading('h2'); return;
                case '3': e.preventDefault(); this._toHeading('h3'); return;
            }
            if (e.shiftKey) {
                switch (e.key.toLowerCase()) {
                    case 'x': e.preventDefault(); document.execCommand('strikeThrough'); return;
                }
            }
        }

        switch (e.key) {
            case 'Enter': this._handleEnter(e); break;
            case 'Backspace': this._handleBackspace(e); break;
            case 'Tab': this._handleTab(e); break;
        }
    }

    _handleClick(e) {
        const link = e.target.closest('a');
        if (!link) return;

        if (e.ctrlKey || e.metaKey) {
            // Ctrl+点击：打开链接
            e.preventDefault();
            window.open(link.href, '_blank');
        } else {
            // 普通点击：进入编辑模式
            e.preventDefault();
            const text = link.textContent;
            const url = link.href;
            const mdText = '[' + text + '](' + url + ')';
            const textNode = document.createTextNode(mdText);
            link.replaceWith(textNode);
            // 光标放到文本末尾
            this._setCursorIn(textNode, mdText.length);
        }
    }

    /* ── Enter 处理 ── */

    _handleEnter(e) {
        const block = this._currentBlock();
        if (!block) return;
        const type = block.dataset.type;

        // 代码块中：换行
        if (type === 'code') {
            e.preventDefault();
            this._saveSnapshot();
            document.execCommand('insertLineBreak');
            return;
        }

        // 列表中
        if (type === 'li') {
            e.preventDefault();
            this._saveSnapshot();
            const text = block.textContent.trim();
            // 空列表项 → 退出列表，转段落
            if (!text) {
                const list = block.parentElement;
                const p = document.createElement('div');
                p.className = 'block p';
                p.dataset.type = 'p';
                p.dataset.id = Markdown.genId();
                p.innerHTML = '<br>';
                list.after(p);
                block.remove();
                // 如果列表空了，移除列表
                if (list.children.length === 0) list.remove();
                this._setCursorIn(p, 0);
                this._notifyChange();
                return;
            }
            // 非空 → 新建同级 li
            // const li = document.createElement('div');
            // li.className = 'li';
            // li.dataset.type = 'li';
            // li.dataset.id = Markdown.genId();
            // li.innerHTML = '<br>';
            // block.after(li);
            // this._setCursorIn(li, 0);
            // ── 替换为 ──
            const sel = window.getSelection();
            const r = sel.getRangeAt(0);
            const afterR = document.createRange();
            afterR.selectNodeContents(block);
            afterR.setStart(r.startContainer, r.startOffset);
            const afterFrag = afterR.extractContents();

            const li = document.createElement('div');
            li.className = 'li';
            li.dataset.type = 'li';
            li.dataset.id = Markdown.genId();
            li.appendChild(afterFrag.childNodes.length > 0 ? afterFrag : document.createElement('br'));
            block.after(li);
            if (!block.innerHTML.trim()) block.innerHTML = '<br>';
            this._setCursorIn(li, 0);

            this._notifyChange();
            return;
        }

        // 引用中
        if (type === 'blockquote') {
            const text = block.textContent.trim();
            if (!text) {
                e.preventDefault();
                this._saveSnapshot();
                this._transformBlock(block, 'p', '<br>');
                this._notifyChange();
                return;
            }
            // 非空引用 → 让浏览器处理换行
            // 
            // ── 替换为 ──
            e.preventDefault();
            this._saveSnapshot();
            const sel = window.getSelection();
            const r = sel.getRangeAt(0);
            const afterR = document.createRange();
            afterR.selectNodeContents(block);
            afterR.setStart(r.startContainer, r.startOffset);
            const afterFrag = afterR.extractContents();

            const bq = document.createElement('div');
            bq.className = 'block blockquote';
            bq.dataset.type = 'blockquote';
            bq.dataset.id = Markdown.genId();
            bq.appendChild(afterFrag.childNodes.length > 0 ? afterFrag : document.createElement('br'));
            block.after(bq);
            if (!block.innerHTML.trim()) block.innerHTML = '<br>';
            this._setCursorIn(bq, 0);
            this._notifyChange();
            return;
        }

        // 默认：新建空段落
        // e.preventDefault();
        // const newBlock = document.createElement('div');
        // newBlock.className = 'block p';
        // newBlock.dataset.type = 'p';
        // newBlock.dataset.id = Markdown.genId();
        // newBlock.innerHTML = '<br>';
        // block.after(newBlock);
        // this._setCursorIn(newBlock, 0);
        // this._notifyChange();
        // ── 替换为 ──
        e.preventDefault();
        const sel = window.getSelection();
        const r = sel.getRangeAt(0);
        const afterR = document.createRange();
        afterR.selectNodeContents(block);
        afterR.setStart(r.startContainer, r.startOffset);
        const afterFrag = afterR.extractContents();

        const newBlock = document.createElement('div');
        newBlock.className = 'block p';
        newBlock.dataset.type = 'p';
        newBlock.dataset.id = Markdown.genId();
        newBlock.appendChild(afterFrag.childNodes.length > 0 ? afterFrag : document.createElement('br'));
        block.after(newBlock);
        if (!block.innerHTML.trim()) block.innerHTML = '<br>';
        this._setCursorIn(newBlock, 0);
        this._notifyChange();
    }

    /* ── Backspace 处理 ── */

    _handleBackspace(e) {
        const block = this._currentBlock();
        if (!block) return;

        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;

        // 检查光标是否在块开头
        const range = sel.getRangeAt(0);
        if (range.startOffset !== 0) return;

        // 判断是否真正是块的起始文本位置
        const firstText = this._firstTextNode(block);
        if (firstText && range.startContainer !== firstText) return;

        const type = block.dataset.type;

        // 列表项 → 降为段落
        if (type === 'li') {
            e.preventDefault();
            this._saveSnapshot();
            const list = block.parentElement;
            const content = block.innerHTML;
            const p = document.createElement('div');
            p.className = 'block p';
            p.dataset.type = 'p';
            p.dataset.id = Markdown.genId();
            p.innerHTML = content || '<br>';
            list.before(p);
            block.remove();
            if (list.children.length === 0) list.remove();
            this._setCursorIn(p, 0);
            this._notifyChange();
            return;
        }

        // 非段落类型 → 降为段落
        if (type !== 'p') {
            e.preventDefault();
            this._saveSnapshot();
            const content = block.innerHTML;
            this._transformBlock(block, 'p', content || '<br>');
            this._notifyChange();
            return;
        }

        // 段落 → 与前一个块合并
        const prev = block.previousElementSibling;
        if (prev && prev.classList.contains('block')) {
            e.preventDefault();
            this._saveSnapshot();
            const prevType = prev.dataset.type;
            // 不与代码块、hr 合并
            if (prevType === 'code' || prevType === 'hr') return;

            const prevLastText = this._lastTextNode(prev);
            const curHTML = block.innerHTML;

            // 将当前内容追加到前块
            if (curHTML && curHTML !== '<br>') {
                prev.innerHTML += curHTML;
            }

            // 移除当前块
            block.remove();

            // 光标移到合并点
            if (prevLastText) {
                this._setCursorIn(prevLastText, prevLastText.textContent.length);
            } else {
                this._setCursorIn(prev, prev.childNodes.length);
            }
            this._notifyChange();
        }
    }

    /* ── Tab 处理 ── */

    _handleTab(e) {
        e.preventDefault();
        const block = this._currentBlock();
        if (!block) return;

        // 代码块中：插入制表符
        if (block.dataset.type === 'code') {
            document.execCommand('insertText', false, '\t');
            return;
        }

        // 其他：插入空格
        const size = parseInt(Config.get('editor.tabSize')) || 2;
        document.execCommand('insertText', false, ' '.repeat(size));
    }

    /* ── 粘贴处理 ── */

    // _handlePaste(e) {
    //     const items = e.clipboardData && e.clipboardData.items;
    //     if (!items) return;

    //     // 检查是否有图片
    //     for (const item of items) {
    //         if (item.type.startsWith('image/')) {
    //             e.preventDefault();
    //             const file = item.getAsFile();
    //             this._handleImageFile(file);
    //             return;
    //         }
    //     }
    //     // 纯文本/HTML 粘贴：让浏览器处理
    // }

    _handlePaste(e) {
        const cd = e.clipboardData;
        if (!cd) return;

        // 有图片文件 → 走原有 base64 逻辑
        for (const item of cd.items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                this._handleImageFile(item.getAsFile());
                return;
            }
        }

        // 其余一律：阻止默认 → 取纯文本 → 当 Markdown 解析
        e.preventDefault();
        const text = cd.getData('text/plain');
        if (!text) return;

        this._saveSnapshot();
        this._insertParsedMarkdown(text);
        this._notifyChange();
    }

    _insertParsedMarkdown(text) {
        const currentBlock = this._currentBlock();
        if (!currentBlock) return;
        const isEmpty = !currentBlock.textContent.trim();

        // 用现有 Markdown 解析器把文本解析为 block 数组
        const blocks = Markdown.parse(text);
        if (blocks.length === 0) return;

        if (isEmpty) {
            // 当前块为空 → 用第一个解析结果替换当前块
            const firstEl = this._createBlockEl(blocks[0]);
            currentBlock.replaceWith(firstEl);
            let ref = firstEl;
            for (let i = 1; i < blocks.length; i++) {
                const el = this._createBlockEl(blocks[i]);
                ref.after(el);
                ref = el;
            }
            this._setCursorIn(ref, ref.childNodes.length);
        } else {
            // 当前块有内容 → 光标处插入第一块的行内内容
            document.execCommand('insertHTML', false, blocks[0].content || '');
            // 剩余块插入到当前块后面
            let ref = currentBlock;
            for (let i = 1; i < blocks.length; i++) {
                const el = this._createBlockEl(blocks[i]);
                ref.after(el);
                ref = el;
            }
            if (blocks.length > 1) {
                this._setCursorIn(ref, ref.childNodes.length);
            }
        }
    }

    /* ═══════════════════════════════════════════
       块级操作
       ═══════════════════════════════════════════ */

    /** 获取光标所在的 .block 元素 */
    _currentBlock() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        let node = sel.focusNode;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        while (node && node !== this.el) {
            if (node.classList && node.classList.contains('block')) return node;
            node = node.parentElement;
        }
        return null;
    }

    /** 消费前缀并转换块类型 */
    _consumeAndTransform(block, hit) {
        this._saveSnapshot();
        // 代码块特殊处理：toggle 行为
        if (hit.type === 'code' && block.dataset.type === 'code') {
            // 如果当前已在代码块中且输入 ``` → 结束代码块
            return;
        }

        // 消费前缀：从文本开头删除 prefix
        const textNode = this._firstTextNode(block);
        if (textNode) {
            const text = textNode.textContent;
            const prefixLen = hit.prefix.length;
            if (text.length >= prefixLen) {
                textNode.textContent = text.slice(prefixLen);
            }
        }

        // 转换块类型
        if (hit.type === 'ul' || hit.type === 'ol') {
            // 转为列表
            const content = block.innerHTML;
            const list = document.createElement('div');
            list.className = 'block ' + hit.type;
            list.dataset.type = hit.type;
            list.dataset.id = block.dataset.id || Markdown.genId();
            const li = document.createElement('div');
            li.className = 'li';
            li.dataset.type = 'li';
            li.innerHTML = content || '<br>';
            list.appendChild(li);
            block.replaceWith(list);
            this._setCursorIn(li, li.childNodes.length);
        } else if (hit.type === 'hr') {
            block.className = 'block hr';
            block.dataset.type = 'hr';
            block.innerHTML = '<hr>';
            // 在 hr 后面新建空段落
            const p = document.createElement('div');
            p.className = 'block p';
            p.dataset.type = 'p';
            p.dataset.id = Markdown.genId();
            p.innerHTML = '<br>';
            block.after(p);
            this._setCursorIn(p, 0);
        } else if (hit.type === 'code') {
            const lang = hit.lang || '';
            const pre = document.createElement('pre');
            pre.className = 'block code';
            pre.dataset.type = 'code';
            pre.dataset.id = block.dataset.id || Markdown.genId();
            if (lang) pre.dataset.lang = lang;
            const code = document.createElement('code');
            code.textContent = hit.content || '';
            pre.appendChild(code);
            block.replaceWith(pre);
            this._setCursorIn(code, code.textContent.length);
        } else {
            this._transformBlock(block, hit.type, hit.content);
        }
    }

    /** 改变块类型，保留/设置内容 */
    _transformBlock(block, newType, content) {
        block.className = 'block ' + newType;
        block.dataset.type = newType;
        if (typeof content === 'string') {
            block.innerHTML = content;
        }
        this._setCursorIn(block, block.childNodes.length);
    }

    /** 工具栏调用：转为标题 */
    _toHeading(level) {
        this._saveSnapshot();
        const block = this._currentBlock();
        if (!block) return;
        const type = block.dataset.type;
        // 如果已是同级标题 → 降回段落
        if (type === level) {
            this._transformBlock(block, 'p', block.innerHTML);
        } else {
            this._transformBlock(block, level, block.innerHTML);
        }
        this._notifyChange();
    }

    /** 工具栏调用：转为引用 */
    _toQuote() {
        this._saveSnapshot();
        const block = this._currentBlock();
        if (!block) return;
        const type = block.dataset.type;
        if (type === 'blockquote') {
            this._transformBlock(block, 'p', block.innerHTML);
        } else {
            this._transformBlock(block, 'blockquote', block.innerHTML);
        }
        this._notifyChange();
    }

    /** 工具栏调用：转为列表 */
    _toList(listType) {
        this._saveSnapshot();
        const block = this._currentBlock();
        if (!block) return;
        const type = block.dataset.type;

        // 已是同类型列表 → 退出为段落
        if (type === listType) {
            const content = block.innerHTML;
            // 取第一个 li 的内容
            const firstLi = block.querySelector('.li');
            const inner = firstLi ? firstLi.innerHTML : content;
            this._transformBlock(block, 'p', inner);
            this._notifyChange();
            return;
        }

        // 转为列表
        const content = block.innerHTML;
        const list = document.createElement('div');
        list.className = 'block ' + listType;
        list.dataset.type = listType;
        list.dataset.id = block.dataset.id || Markdown.genId();
        const li = document.createElement('div');
        li.className = 'li';
        li.dataset.type = 'li';
        li.innerHTML = content || '<br>';
        list.appendChild(li);
        block.replaceWith(list);
        this._setCursorIn(li, li.childNodes.length);
        this._notifyChange();
    }

    /** 工具栏调用：插入分割线 */
    _insertHR() {
        this._saveSnapshot();
        const block = this._currentBlock();
        if (!block) return;
        const hr = document.createElement('div');
        hr.className = 'block hr';
        hr.dataset.type = 'hr';
        hr.dataset.id = Markdown.genId();
        hr.innerHTML = '<hr>';
        block.after(hr);
        const p = document.createElement('div');
        p.className = 'block p';
        p.dataset.type = 'p';
        p.dataset.id = Markdown.genId();
        p.innerHTML = '<br>';
        hr.after(p);
        this._setCursorIn(p, 0);
        this._notifyChange();
    }

    /* ═══════════════════════════════════════════
       行内格式化
       ═══════════════════════════════════════════ */

    applyBold() { document.execCommand('bold'); this._notifyChange(); }
    applyItalic() { document.execCommand('italic'); this._notifyChange(); }
    applyStrike() { document.execCommand('strikeThrough'); this._notifyChange(); }

    applyCode() { this._wrapInline('code'); this._notifyChange(); }

    applyLink(url) {
        if (!url) return;
        const sel = window.getSelection();
        const text = sel.toString() || '链接';
        const a = document.createElement('a');
        a.href = url;
        a.textContent = text;
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(a);
        this._setCursorAfter(a);
        this._notifyChange();
    }

    applyImage(url, alt) {
        if (!url) return;
        document.execCommand('insertHTML', false,
            '<img src="' + Markdown._esc(url) + '" alt="' + Markdown._esc(alt || '') + '">');
        this._notifyChange();
    }

    /** 用指定行内标签包裹选区 */
    _wrapInline(tag) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return;
        const range = sel.getRangeAt(0);
        // 不跨块包裹
        if (range.startContainer.parentElement.closest('.block') !==
            range.endContainer.parentElement.closest('.block')) return;

        const wrapper = document.createElement(tag);
        try {
            range.surroundContents(wrapper);
        } catch {
            // 如果选区包含部分元素节点，surroundContents 会抛错
            // 降级：用 extractContents
            const contents = range.extractContents();
            wrapper.appendChild(contents);
            range.insertNode(wrapper);
        }
        // 移动光标到元素之后
        sel.collapseToEnd();
    }

    /** _insertLink：弹窗输入 URL */
    _insertLink() {
        const url = prompt('链接 URL:', 'https://');
        if (url) this.applyLink(url);
    }

    /** 实时行内语法检测 */
    // _tryInline(node, offset) {
    //     const text = node.textContent;
    //     const before = text.slice(0, offset);

    //     // 匹配模式：从光标前的文本中寻找完整的行内标记
    //     // **text** 模式
    //     const boldMatch = before.match(/\*\*([^*]+)\*\*$/);
    //     if (boldMatch) {
    //         this._applyInlineMatch(node, before, boldMatch, 'strong');
    //         return;
    //     }

    //     // *text* 模式（排除 **）
    //     const italicMatch = before.match(/(?<!\*)\*([^*]+)\*(?!\*)/);
    //     if (italicMatch) {
    //         this._applyInlineMatch(node, before, italicMatch, 'em');
    //         return;
    //     }

    //     // `code` 模式
    //     const codeMatch = before.match(/`([^`]+)`$/);
    //     if (codeMatch) {
    //         this._applyInlineMatch(node, before, codeMatch, 'code');
    //         return;
    //     }

    //     // ~~text~~ 模式
    //     const strikeMatch = before.match(/~~([^~]+)~~$/);
    //     if (strikeMatch) {
    //         this._applyInlineMatch(node, before, strikeMatch, 'del');
    //         return;
    //     }

    //     // [text](url) 模式
    //     const linkMatch = before.match(/$$([^$$]+)\]$$([^)]+)$$$/);
    //     if (linkMatch) {
    //         this._applyLinkMatch(node, before, linkMatch);
    //         return;
    //     }
    // }

    _tryInline(node, offset) {
        const block = this._currentBlock();
        if (!block || block.dataset.type === 'code') return;

        // 用整个块的文本做匹配，避免文本节点分割导致匹配失败
        const fullText = block.textContent;
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const preRange = document.createRange();
        preRange.selectNodeContents(block);
        preRange.setEnd(range.startContainer, range.startOffset);
        const cursorPos = preRange.toString().length;
        const before = fullText.slice(0, cursorPos);

        // 图片（必须在链接之前检测）
        const imgMatch = before.match(/!$$([^$$]*)\]$$([^)]+)$$$/);
        if (imgMatch) {
            this._replacePattern(block, imgMatch[0], () => {
                const img = document.createElement('img');
                img.src = imgMatch[2];
                img.alt = imgMatch[1] || '';
                return img;
            });
            return;
        }

        // 链接（排除图片的 ! 前缀）
        const linkMatch = before.match(/(?<!!)$$([^$$]+)\]$$([^)]+)$$$/);
        if (linkMatch) {
            this._replacePattern(block, linkMatch[0], () => {
                const a = document.createElement('a');
                a.href = linkMatch[2];
                a.textContent = linkMatch[1];
                return a;
            });
            return;
        }

        // 粗体
        const boldMatch = before.match(/\*\*([^*]+)\*\*$/);
        if (boldMatch) { this._replacePattern(block, boldMatch[0], () => { const e = document.createElement('strong'); e.textContent = boldMatch[1]; return e; }); return; }

        // 斜体
        const italicMatch = before.match(/(?<!\*)\*([^*]+)\*(?!\*)/);
        if (italicMatch) { this._replacePattern(block, italicMatch[0], () => { const e = document.createElement('em'); e.textContent = italicMatch[1]; return e; }); return; }

        // 行内代码
        const codeMatch = before.match(/`([^`]+)`$/);
        if (codeMatch) { this._replacePattern(block, codeMatch[0], () => { const e = document.createElement('code'); e.textContent = codeMatch[1]; return e; }); return; }

        // 删除线
        const strikeMatch = before.match(/~~([^~]+)~~$/);
        if (strikeMatch) { this._replacePattern(block, strikeMatch[0], () => { const e = document.createElement('del'); e.textContent = strikeMatch[1]; return e; }); return; }
    }

    // /** 通用行内匹配替换 */
    // _applyInlineMatch(node, before, match, tag) {
    //     const fullMatch = match[0];
    //     const inner = match[1];
    //     const matchStart = before.length - fullMatch.length;

    //     // 拆分文本节点
    //     const after = node.textContent.slice(node.textContent.indexOf(fullMatch, matchStart) + fullMatch.length);
    //     const beforeText = node.textContent.slice(0, matchStart);

    //     const parent = node.parentElement;
    //     const el = document.createElement(tag);
    //     el.textContent = inner;

    //     // 重建 DOM
    //     const beforeNode = document.createTextNode(beforeText);
    //     const afterNode = document.createTextNode(after);

    //     parent.insertBefore(beforeNode, node);
    //     parent.insertBefore(el, node);
    //     parent.insertBefore(afterNode, node);
    //     parent.removeChild(node);

    //     // 光标移到格式化元素之后
    //     this._setCursorIn(afterNode, 0);
    // }

    // /** 链接匹配替换 */
    // _applyLinkMatch(node, before, match) {
    //     const fullMatch = match[0];
    //     const text = match[1];
    //     const url = match[2];
    //     const matchStart = before.length - fullMatch.length;
    //     const after = node.textContent.slice(node.textContent.indexOf(fullMatch, matchStart) + fullMatch.length);
    //     const beforeText = node.textContent.slice(0, matchStart);

    //     const parent = node.parentElement;
    //     const a = document.createElement('a');
    //     a.href = url;
    //     a.textContent = text;

    //     const beforeNode = document.createTextNode(beforeText);
    //     const afterNode = document.createTextNode(after);

    //     parent.insertBefore(beforeNode, node);
    //     parent.insertBefore(a, node);
    //     parent.insertBefore(afterNode, node);
    //     parent.removeChild(node);

    //     this._setCursorIn(afterNode, 0);
    // }

    /**
 * 在块内查找 pattern 文本，替换为 createElement() 返回的元素
 * 正确处理文本节点跨节点分割的情况
 */
    _replacePattern(block, pattern, createElement) {
        const fullText = block.textContent;
        const idx = fullText.lastIndexOf(pattern);
        if (idx === -1) return;

        // 遍历文本节点，找到 pattern 起始位置所在的节点
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        let node, acc = 0, startNode = null, startOff = 0;
        while ((node = walker.nextNode())) {
            if (acc + node.textContent.length > idx) {
                startNode = node;
                startOff = idx - acc;
                break;
            }
            acc += node.textContent.length;
        }
        if (!startNode) return;

        // 在起始点拆分
        const afterStart = startNode.splitText(startOff);

        // 找结束点（可能跨越多个文本节点）
        let remaining = pattern.length;
        let endNode = afterStart;
        let endOff = Math.min(remaining, afterStart.textContent.length);
        remaining -= endOff;
        while (remaining > 0 && endNode.nextSibling) {
            const next = endNode.nextSibling;
            if (next.nodeType === Node.TEXT_NODE) {
                if (next.textContent.length >= remaining) { endNode = next; endOff = remaining; remaining = 0; }
                else { remaining -= next.textContent.length; endNode = next; }
            } else { break; }
        }

        // 用 Range 裁出匹配区域，替换为新元素
        const r = document.createRange();
        r.setStart(afterStart, 0);
        r.setEnd(endNode, endOff);
        r.deleteContents();
        const el = createElement();
        r.insertNode(el);
        this._setCursorAfter(el);
    }

    _setCursorAfter(el) {
        const sel = window.getSelection();
        const r = document.createRange();
        r.setStartAfter(el);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
    }

    /* ═══════════════════════════════════════════
       图片处理
       ═══════════════════════════════════════════ */

    _handleImageFile(file) {
        if (!file || !file.type.startsWith('image/')) return;

        const maxSize = parseInt(Config.get('media.maxImageSize')) * 1024 * 1024;
        if (file.size > maxSize) {
            showToast('图片超过最大限制 (' + Config.get('media.maxImageSize') + ' MB)');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            let dataUrl = reader.result;
            // 压缩检查
            if (Config.get('media.autoCompress') && file.size > 1024 * 1024) {
                this._compressImage(dataUrl, (compressed) => {
                    this._insertImageDataUrl(compressed);
                });
            } else {
                this._insertImageDataUrl(dataUrl);
            }
        };
        reader.readAsDataURL(file);
    }

    /** Canvas 压缩图片 */
    _compressImage(dataUrl, callback) {
        const maxDim = parseInt(Config.get('media.maxDimension')) || 1920;
        const quality = parseFloat(Config.get('media.imageQuality')) || 0.8;
        const img = new Image();
        img.onload = () => {
            let w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) {
                const ratio = Math.min(maxDim / w, maxDim / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            callback(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = dataUrl;
    }

    /** 在光标处插入 base64 图片 */
    _insertImageDataUrl(dataUrl) {
        // 存储到 LS
        const hash = Storage.PREFIX + 'img_' + this._simpleHash(dataUrl);
        Storage.set(hash, dataUrl);

        // 用 DOM API 直接插入（避免 execCommand 对长 URL 的兼容问题）
        const block = this._currentBlock();
        if (!block) return;

        const figure = document.createElement('div');
        figure.className = 'block figure';
        figure.dataset.type = 'figure';
        figure.dataset.id = Markdown.genId();
        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = 'image';
        figure.appendChild(img);

        const p = document.createElement('div');
        p.className = 'block p';
        p.dataset.type = 'p';
        p.dataset.id = Markdown.genId();
        p.innerHTML = '<br>';

        block.after(figure);
        figure.after(p);
        this._setCursorIn(p, 0);
        this._notifyChange();
    }

    /* ═══════════════════════════════════════════
       视图切换
       ═══════════════════════════════════════════ */

    switchToMarkdown() {
        this.textarea.value = this.getContent();
        this.el.hidden = true;
        this.textarea.hidden = false;
        this.textarea.style.display = '';
        this.mode = 'markdown';
        if (this._gutter) this._gutter.style.display = 'none';
    }

    switchToWysiwyg() {
        const md = this.textarea.value;
        this.setContent(md);
        this.textarea.hidden = true;
        this.el.hidden = false;
        this.mode = 'wysiwyg';
        if (this._gutter) this._gutter.style.display = '';
    }

    /* ═══════════════════════════════════════════
       样式应用
       ═══════════════════════════════════════════ */

    applyStyles() {
        const root = document.documentElement;
        const ff = Config.get('editor.fontFamily');
        const fontMap = { system: 'var(--font-sans)', serif: 'var(--font-serif)', mono: 'var(--font-mono)' };
        root.style.setProperty('--editor-font', fontMap[ff] || 'var(--font-sans)');
        root.style.setProperty('--editor-line-height', Config.get('editor.lineHeight'));
        root.style.setProperty('--h1-size', Config.get('heading.h1Size') + 'px');
        root.style.setProperty('--h2-size', Config.get('heading.h2Size') + 'px');
        root.style.setProperty('--h3-size', Config.get('heading.h3Size') + 'px');

        const maxW = Config.get('editor.maxWidth');
        root.style.setProperty('--editor-max-width', maxW === '100%' ? '100%' : maxW + 'px');

        if (this.el) {
            this.el.style.fontSize = Config.get('editor.fontSize') + 'px';
            this.el.style.wordWrap = Config.get('editor.wordWrap') ? 'break-word' : 'normal';
            this.el.setAttribute('spellcheck', Config.get('editor.spellCheck') ? 'true' : 'false');
        }
    }

    /* ═══════════════════════════════════════════
       工具方法
       ═══════════════════════════════════════════ */

    _notifyChange() {
        if (this.onContentChange) this.onContentChange(this.getContent());
    }

    _firstTextNode(el) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        return walker.nextNode();
    }

    _lastTextNode(el) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let last = null, node;
        while ((node = walker.nextNode())) last = node;
        return last;
    }

    _setCursorIn(node, offset) {
        const sel = window.getSelection();
        const range = document.createRange();
        if (node.nodeType === Node.TEXT_NODE) {
            range.setStart(node, Math.min(offset, node.textContent.length));
        } else {
            range.setStart(node, Math.min(offset, node.childNodes.length));
        }
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    _simpleHash(str) {
        let h = 0;
        for (let i = 0; i < Math.min(str.length, 1000); i++) {
            h = ((h << 5) - h + str.charCodeAt(i)) | 0;
        }
        return Math.abs(h).toString(36);
    }

    _bindEvents() {
        this.el.addEventListener('input', () => this._handleInput());
        this.el.addEventListener('keydown', (e) => this._handleKeydown(e));
        this.el.addEventListener('paste', (e) => this._handlePaste(e));
        this.textarea.addEventListener('input', () => this._notifyChange());
        this.el.addEventListener('click', (e) => this._handleClick(e));
    }
}