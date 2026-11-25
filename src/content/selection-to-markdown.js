// Convert HTML to Markdown and copy to clipboard (main function)
// Kept as a classic script (not ESM) for Firefox MV3 compatibility.
// Only exposes `convertAndCopyHtml` on globalThis.

(() => {
  async function convertAndCopyHtml(html) {
    try {
      const markdown = await convertHtmlToLatexMarkdown(html);

      if (!markdown) {
        return { ok: false, error: 'No content' };
      }

      const result = await copyToClipboard(markdown);
      return result;
    } catch (error) {
      console.error('[Copy LaTeX] Error in convertAndCopyHtml:', error);
      return { ok: false, error: String(error) };
    }
  }

  function convertHtmlToMarkdownText(html) {
    return convertHtmlToLatexMarkdown(html);
  }

  const textLatexPattern = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g;
  const blockTags = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'FIELDSET', 'FIGCAPTION',
    'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR',
    'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT',
    'TH', 'THEAD', 'TR', 'UL'
  ]);
  const textLatexBoundaryTags = new Set(['BR', 'WBR']);

  function getTextLatexScope(node, root) {
    let scope = node.parentElement;
    while (scope && scope !== root && !blockTags.has(scope.tagName)) {
      scope = scope.parentElement;
    }
    return scope || root;
  }

  function isTextLatexNode(node) {
    const parent = node.parentElement;
    return parent && !parent.closest('code, pre, script, style, textarea, .latex-marker');
  }

  function resolveTextOffset(nodes, offset, isEnd) {
    let cursor = 0;
    for (const node of nodes) {
      const length = (node.textContent || '').length;
      if (offset < cursor + length || (isEnd && offset === cursor + length)) {
        return { node, offset: offset - cursor };
      }
      cursor += length;
    }
    const node = nodes[nodes.length - 1];
    return { node, offset: (node.textContent || '').length };
  }

  function findTextLatexMatches(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    const groups = [];
    let group = null;
    let scope = null;
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (textLatexBoundaryTags.has(node.tagName)) {
          group = null;
          scope = null;
        }
        continue;
      }
      if (!isTextLatexNode(node)) {
        group = null;
        scope = null;
        continue;
      }

      const nodeScope = getTextLatexScope(node, root);
      if (nodeScope !== scope) {
        group = { nodes: [] };
        groups.push(group);
        scope = nodeScope;
      }
      group.nodes.push(node);
    }

    return groups.flatMap(({ nodes }) => {
      const text = nodes.map((node) => node.textContent || '').join('');
      const matches = [];
      let match;
      while ((match = textLatexPattern.exec(text))) {
        if (match.index > 0 && text[match.index - 1] === '\\') continue;
        matches.push({
          start: resolveTextOffset(nodes, match.index, false),
          end: resolveTextOffset(nodes, textLatexPattern.lastIndex, true),
          latex: match[1] ?? match[2],
          mode: match[1] !== undefined ? 'display' : 'inline',
        });
      }
      textLatexPattern.lastIndex = 0;
      return matches;
    });
  }

  function containsTextLatex(root) {
    return findTextLatexMatches(root).length > 0;
  }

  function createLatexMarker(latex, mode) {
    const normalized = window.CopyLatex?.output?.normalizeLatexInput(latex, mode) || { tex: latex, mode };
    const marker = document.createElement('span');
    marker.className = 'latex-marker';
    marker.textContent = normalized.tex;
    marker.setAttribute('data-latex-mode', normalized.mode);
    return marker;
  }

  function findOrphanKaTeXPart(part) {
    const previous = part.previousElementSibling;
    const next = part.nextElementSibling;
    const expectedClass = part.classList.contains('katex-mathml')
      ? 'katex-html'
      : 'katex-mathml';
    return [previous, next].find((sibling) => {
      return (
        sibling &&
        !sibling.closest('.katex') &&
        sibling.classList.contains(expectedClass)
      );
    }) || null;
  }

  function replaceOrphanKaTeXParts(root) {
    const parts = Array.from(root.querySelectorAll('.katex-mathml, .katex-html')).filter((part) => {
      return !part.closest('.katex');
    });

    parts.forEach((part) => {
      if (!root.contains(part)) return;

      const sibling = findOrphanKaTeXPart(part);
      const sourcePart =
        (part.classList.contains('katex-mathml') && part) ||
        (sibling?.classList.contains('katex-mathml') && sibling);
      const latex =
        (sourcePart && extractLatexFromElement(sourcePart)) ||
        extractLatexFromElement(part) ||
        (sibling && extractLatexFromElement(sibling));
      if (!latex) return;

      const marker = createLatexMarker(latex, getDisplayMode(sourcePart || part));
      if (sibling) sibling.remove();
      part.replaceWith(marker);
    });
  }

  function replaceTextLatexDelimiters(root) {
    findTextLatexMatches(root).reverse().forEach(({ start, end, latex, mode }) => {
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      range.deleteContents();
      range.insertNode(createLatexMarker(latex, mode));
    });
  }

  function removeCitationElements(container) {
    container.querySelectorAll('button').forEach((btn) => btn.remove());
    const citationSelectors = [
      'curation-citation',
      '[data-cite-tag]',
      '[data-citation-layout]',
      '[data-topic-title]',
      '[data-document-id]',
      '[data-doc-chip-type]',
      '.inline-chip',
      '.inline-chip-pill',
      '.citation',
      '[class*="citation"]',
      '[class*="source-chip"]',
      '[class*="grounding-chip"]',
      '[class*="attribution"]',
      '[class*="fact-check"]',
      'sources-carousel',
      'sources-container',
      '.sources-list',
      'citation-container',
      'citation-element',
      'fact-check-badge',
      '[data-testid*="citation"]',
      '[data-test-id*="citation"]',
      'a[href*="google.com/url?"]',
      'sup[class*="citation"]',
    ];
    citationSelectors.forEach((selector) => {
      container.querySelectorAll(selector).forEach((el) => el.remove());
    });
  }

  function normalizeBoldForMarkdown(container) {
    const strongsWithBlocks = Array.from(container.querySelectorAll('strong, b')).filter((el) => {
      return el.querySelector('p, div, ul, ol, blockquote, pre');
    });
    strongsWithBlocks.forEach((strong) => {
      const blocks = Array.from(strong.querySelectorAll('p, div, ul, ol, blockquote, pre'));
      blocks.forEach((block) => {
        const s = document.createElement(strong.tagName);
        while (block.firstChild) s.appendChild(block.firstChild);
        block.appendChild(s);
      });
      while (strong.firstChild) {
        strong.parentNode.insertBefore(strong.firstChild, strong);
      }
      strong.remove();
    });

    const styledEls = Array.from(container.querySelectorAll('[style*="font-weight"], [style*="font:"]'));
    styledEls.forEach((el) => {
      const weight = el.style.fontWeight;
      if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) {
        if (!el.closest('strong, b') && el.tagName !== 'STRONG' && el.tagName !== 'B') {
          const strong = document.createElement('strong');
          while (el.firstChild) strong.appendChild(el.firstChild);
          el.appendChild(strong);
        }
      }
    });

    const boldClassEls = Array.from(container.querySelectorAll('.ql-bold, .font-bold, .bold, [class*="bold"]'));
    boldClassEls.forEach((el) => {
      if (!el.closest('strong, b') && el.tagName !== 'STRONG' && el.tagName !== 'B') {
        const strong = document.createElement('strong');
        while (el.firstChild) strong.appendChild(el.firstChild);
        el.appendChild(strong);
      }
    });

    const strongs = Array.from(container.querySelectorAll('strong, b'));
    strongs.forEach((strong) => {
      const displayMath = strong.querySelector('.latex-marker[data-latex-mode="display"], div[data-math]');
      if (displayMath) {
        const parent = strong.parentNode;
        const cloneAfter = strong.cloneNode(false);
        let found = false;
        const toMove = [];
        for (const child of Array.from(strong.childNodes)) {
          if (child === displayMath || child.contains(displayMath)) {
            found = true;
            continue;
          }
          if (found) {
            toMove.push(child);
          }
        }
        toMove.forEach((c) => cloneAfter.appendChild(c));
        parent.insertBefore(displayMath, strong.nextSibling);
        if (cloneAfter.childNodes.length > 0) {
          parent.insertBefore(cloneAfter, displayMath.nextSibling);
        }
      }
    });

    container.querySelectorAll('strong, b').forEach((strong) => {
      const first = strong.firstChild;
      if (first && first.nodeType === Node.TEXT_NODE) {
        const match = first.nodeValue.match(/^(\s+)/);
        if (match) {
          first.nodeValue = first.nodeValue.slice(match[1].length);
          strong.parentNode.insertBefore(document.createTextNode(match[1]), strong);
        }
      }

      const last = strong.lastChild;
      if (last && last.nodeType === Node.TEXT_NODE) {
        const match = last.nodeValue.match(/(\s+)$/);
        if (match) {
          last.nodeValue = last.nodeValue.slice(0, -match[1].length);
          strong.parentNode.insertBefore(document.createTextNode(match[1]), strong.nextSibling);
        }
      }

      const lastAfterTrim = strong.lastChild;
      if (lastAfterTrim && lastAfterTrim.nodeType === Node.TEXT_NODE) {
        const text = lastAfterTrim.nodeValue || '';
        const match = text.match(/([：:，,、；;]+)$/);
        if (match) {
          const punct = match[1];
          lastAfterTrim.nodeValue = text.slice(0, -punct.length);
          const textNode = document.createTextNode(punct);
          strong.parentNode.insertBefore(textNode, strong.nextSibling);
        }
      }
    });
  }

  function normalizeListsForMarkdown(container) {
    const allLists = Array.from(container.querySelectorAll('ul, ol'));
    allLists.forEach((list) => {
      const items = Array.from(list.children).filter((el) => el.tagName === 'LI');
      const hasIndentAttrs = items.some((li) => {
        return (
          li.hasAttribute('data-indent') ||
          li.hasAttribute('aria-level') ||
          /ql-indent-\d+/.test(li.className)
        );
      });

      if (hasIndentAttrs) {
        const getIndent = (li) => {
          const dataIndent = Number(li.getAttribute('data-indent'));
          if (Number.isInteger(dataIndent) && dataIndent > 0) return dataIndent;
          const ariaLevel = Number(li.getAttribute('aria-level'));
          if (Number.isInteger(ariaLevel) && ariaLevel > 1) return ariaLevel - 1;
          const qlMatch = /ql-indent-(\d+)/.exec(li.className);
          if (qlMatch) return Number(qlMatch[1]);
          return 0;
        };

        const stack = [{ indent: 0, list, lastLi: null }];

        items.forEach((li) => {
          const indent = getIndent(li);

          while (stack.length > 1 && stack[stack.length - 1].indent > indent) {
            stack.pop();
          }

          if (indent > stack[stack.length - 1].indent) {
            const parentLi = stack[stack.length - 1].lastLi;
            if (parentLi) {
              const sublistType =
                li.getAttribute('data-list') === 'bullet'
                  ? 'ul'
                  : li.getAttribute('data-list') === 'ordered'
                  ? 'ol'
                  : list.tagName.toLowerCase() === 'ol'
                  ? 'ol'
                  : 'ul';
              const sublist = document.createElement(sublistType);
              parentLi.appendChild(sublist);
              stack.push({ indent, list: sublist, lastLi: null });
            }
          }

          const current = stack[stack.length - 1];
          current.list.appendChild(li);
          current.lastLi = li;
          li.removeAttribute('data-indent');
          li.removeAttribute('aria-level');
          li.className = li.className.replace(/ql-indent-\d+/g, '').trim();
        });
      }
    });

    container.querySelectorAll('li').forEach((li) => {
      const blockChildren = Array.from(li.children).filter(
        (el) =>
          el.tagName === 'P' ||
          (el.tagName === 'DIV' && !el.querySelector('ul, ol, table, pre, blockquote'))
      );
      blockChildren.forEach((p, idx) => {
        if (
          idx < blockChildren.length - 1 &&
          (p.nextElementSibling?.tagName === 'P' || p.nextElementSibling?.tagName === 'DIV')
        ) {
          const br = document.createElement('br');
          p.parentNode.insertBefore(br, p.nextSibling);
        }
        while (p.firstChild) {
          p.parentNode.insertBefore(p.firstChild, p);
        }
        p.remove();
      });
    });
  }

  function normalizeTablesForMarkdown(container) {
    const orphanCells = Array.from(container.querySelectorAll('td, th')).filter((el) => !el.closest('table'));
    if (orphanCells.length > 0) {
      const orphanTrs = new Set();
      orphanCells.forEach((cell) => {
        const tr = cell.closest('tr');
        if (tr) orphanTrs.add(tr);
      });
      if (orphanTrs.size > 0) {
        const table = document.createElement('table');
        const tbody = document.createElement('tbody');
        table.appendChild(tbody);
        const firstTr = Array.from(orphanTrs)[0];
        firstTr.parentNode?.insertBefore(table, firstTr);
        orphanTrs.forEach((tr) => tbody.appendChild(tr));
      }
    }

    const tables = Array.from(container.querySelectorAll('table'));
    tables.forEach((table) => {
      const structuralElements = [table, ...table.querySelectorAll('thead, tbody, tfoot, tr')];
      structuralElements.forEach((parent) => {
        Array.from(parent.childNodes).forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE && /^\s*$/.test(child.nodeValue || '')) {
            child.remove();
          }
        });
      });

      const allTrs = Array.from(table.querySelectorAll('tr'));
      if (allTrs.length === 0) return;

      let thead = table.querySelector('thead');
      if (!thead) {
        const firstRow = allTrs[0];
        thead = document.createElement('thead');
        table.insertBefore(thead, table.firstChild);
        thead.appendChild(firstRow);

        Array.from(firstRow.children).forEach((cell) => {
          if (cell.tagName === 'TD') {
            const th = document.createElement('th');
            while (cell.firstChild) th.appendChild(cell.firstChild);
            Array.from(cell.attributes).forEach((attr) => th.setAttribute(attr.name, attr.value));
            cell.replaceWith(th);
          }
        });
      } else {
        const headRows = Array.from(thead.querySelectorAll('tr'));
        headRows.forEach((tr) => {
          Array.from(tr.children).forEach((cell) => {
            if (cell.tagName === 'TD') {
              const th = document.createElement('th');
              while (cell.firstChild) th.appendChild(cell.firstChild);
              Array.from(cell.attributes).forEach((attr) => th.setAttribute(attr.name, attr.value));
              cell.replaceWith(th);
            }
          });
        });
      }

      const cells = Array.from(table.querySelectorAll('th, td'));
      cells.forEach((cell) => {
        const markers = Array.from(cell.querySelectorAll('.latex-marker'));
        markers.forEach((m) => {
          m.setAttribute('data-latex-mode', 'inline');
        });
      });
    });
  }

  // Convert HTML to Markdown
  function convertHtmlToLatexMarkdown(html) {
    const container = document.createElement('div');
    // innerHTML usage here is safe: the 'html' parameter comes from trusted sources
    // (user selection on the page), and we immediately process it in a controlled way
    // without executing scripts or injecting external code.
    container.innerHTML = html;

    replaceOrphanKaTeXParts(container);

    // 1) We detect all math elements
    const mathElements = [
      ...Array.from(container.querySelectorAll('[data-math], [data-tex], .ztext-math')),
      ...Array.from(container.querySelectorAll('.katex')),
      ...Array.from(container.querySelectorAll('mjx-container')),
      ...Array.from(container.querySelectorAll('math')),
      ...Array.from(
        container.querySelectorAll(
          '.MathJax_Display, .MJXc-display, .MathJax_SVG_Display, .MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML, .MathJax_SVG'
        )
      ),
      ...Array.from(
        container.querySelectorAll(
          'img.mwe-math, img.mwe-math-fallback-image-inline, img.mwe-math-fallback-image-display'
        )
      ),
    ];

    // 2) Replace math elements with LaTeX markers ($..$ or $$...$$)
    mathElements.forEach((el) => {
      if (!container.contains(el)) return;
      const latex = extractLatexFromElement(el);
      if (!latex) return;

      const displayMode = getDisplayMode(el);

      el.replaceWith(createLatexMarker(latex, displayMode));
    });

    // 2.1) Avoid selecting unicode fallbacks (we already have the LaTeX code)
    // In other works, don't select any element that may contain math/latex content
    container.querySelectorAll('script[type*="math/tex"]').forEach((script) => script.remove());
    container.querySelectorAll('.katex-mathml').forEach((mathml) => mathml.remove());
    container.querySelectorAll('annotation').forEach((ann) => ann.remove());
    container.querySelectorAll('.katex-html, .katex-fallback, mjx-assistive-mml, .MathJax_Preview').forEach((el) => el.remove());
    container.querySelectorAll('semantics').forEach((el) => el.remove());
    replaceTextLatexDelimiters(container);

    // 3) Convert relative URLs to absolute
    container.querySelectorAll('a').forEach((link) => {
      link.setAttribute('href', link.href);
    });
    container.querySelectorAll('img').forEach((img) => {
      img.setAttribute('src', img.src);
    });

    removeCitationElements(container);
    normalizeBoldForMarkdown(container);
    normalizeListsForMarkdown(container);
    normalizeTablesForMarkdown(container);

    // 4) Convert to Markdown using Turndown

    // TURNDOWN LIBRARY AND PLUGIN ORIGINAL SOURCE:
    // Library: https://unpkg.com/turndown/dist/turndown.js
    // Plugin: https://unpkg.com/turndown-plugin-gfm/dist/turndown-plugin-gfm.js

    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    })
      .remove('script')
      .remove('style');

    // Use GFM plugin for tables support
    turndownService.use(turndownPluginGfm.gfm);

    turndownService.addRule('list', {
      filter: ['ul', 'ol'],
      replacement: function (content, node) {
        const parent = node.parentNode;
        if (parent && parent.nodeName === 'LI') {
          return '\n' + content.replace(/^\n+/, '').replace(/\n+$/, '');
        }
        return '\n\n' + content.replace(/^\n+/, '').replace(/\n+$/, '') + '\n\n';
      },
    });

    turndownService.addRule('listItem', {
      filter: 'li',
      replacement: function (content, node, options) {
        const parent = node.parentNode;
        let prefix = '- ';
        if (parent && parent.nodeName === 'OL') {
          const start = parent.getAttribute('start');
          const index = Array.prototype.indexOf.call(parent.children, node);
          prefix = (start ? Number(start) + index : index + 1) + '. ';
        }

        content = content.replace(/^\n+/, '').replace(/\n+$/, '');
        const indent = '  ';
        const lines = content.split('\n');
        const firstLine = lines[0] || '';
        const restLines = lines.slice(1).map((line) => (line.length > 0 ? indent + line : ''));

        let result = prefix + firstLine;
        if (restLines.length > 0) {
          result += '\n' + restLines.join('\n');
        }

        return result + (node.nextSibling ? '\n' : '');
      },
    });

    // Custom rule to preserve LaTeX markers
    turndownService.addRule('latexMarker', {
      filter: (node) => {
        return (
          node.nodeName === 'SPAN' && node.classList && node.classList.contains('latex-marker')
        );
      },
      replacement: (content, node) => {
        const isInsideCell = !!(node.closest && node.closest('th, td'));
        const isDisplay = !isInsideCell && node.getAttribute('data-latex-mode') === 'display';
        let latex = node.textContent || '';
        if (isInsideCell) {
          latex = latex.replace(/\|/g, '\\vert ');
          return `$${latex}$`;
        }
        return isDisplay ? `\n\n$$\n${latex}\n$$\n\n` : `$${latex}$`;
      },
    });

    turndownService.addRule('tableCell', {
      filter: ['th', 'td'],
      replacement: function (content, node) {
        let sanitized = content.replace(/(?<!\\)\|/g, '\\|');
        sanitized = sanitized.replace(/\n+/g, ' ').trim();
        const parent = node.parentNode;
        const cellElements = Array.from(parent ? parent.childNodes : []).filter(
          (n) => n.nodeName === 'TH' || n.nodeName === 'TD'
        );
        const index = cellElements.indexOf(node);
        const prefix = index === 0 ? '| ' : ' ';
        return prefix + sanitized + ' |';
      },
    });

    // innerHTML usage here is safe: we're reading back the DOM structure we created
    // above through controlled manipulation. The container only contains elements we
    // explicitly created or modified, with all scripts removed. This read-only use
    // preserves the exact HTML structure needed for Turndown conversion while maintaining
    // inline vs block equation distinctions (getComputedStyle requires rendered DOM).
    const htmlString = container.innerHTML;
    let markdown = turndownService.turndown(htmlString);

    markdown = markdown.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_, latex) => {
      return `\n\n$$\n${latex.trim()}\n$$\n\n`;
    });
    // Normalize (convert lines with only whitespaces to empty lines)
    markdown = markdown.replace(/^[ \t]+$/gm, '');
    // Then collapse 3 or more newlines to 2 newlines
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    // Then we trim other leading or trailing whitespaces
    markdown = markdown.trim();

    return markdown;
  }

  // Extract LaTeX replicating the logic from detection.js
  // TODO One day: Unify this detection logic using the same as detection.js
  function extractLatexFromElement(el) {
    const copiedLatex = el.getAttribute('data-copy-latex');
    if (copiedLatex && copiedLatex.trim()) return copiedLatex.trim();

    // Wikipedia
    if (el.tagName === 'IMG' && el.classList.contains('mwe-math')) {
      const alt = el.getAttribute('alt');
      if (alt) {
        const match = alt.match(/^\{\\displaystyle\s*([\s\S]*?)\}$/);
        return match && match[1] ? match[1].trim() : alt.trim();
      }
    }

    // KaTeX
    if (el.classList.contains('katex')) {
      const ann = el.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
      if (ann && ann.textContent) return ann.textContent.trim();

      const dataLatex =
        el.getAttribute('data-tex') ||
        el.getAttribute('data-latex') ||
        el.getAttribute('aria-label');
      if (dataLatex && dataLatex.trim()) return dataLatex.trim();

      return window.CopyLatex?.renderedKaTeX?.extractRenderedKaTeXTex(el) || null;
    }

    if (el.classList.contains('katex-mathml')) {
      const annotation = el.querySelector(
        'annotation[encoding="application/x-tex"], annotation[encoding="application/x-latex"], annotation[encoding="application/tex"]'
      );
      return annotation?.textContent?.trim() || null;
    }

    if (el.classList.contains('katex-html')) {
      return window.CopyLatex?.renderedKaTeX?.extractRenderedKaTeXTex(el) || null;
    }

    if (el.hasAttribute('data-math') || el.hasAttribute('data-tex') || el.classList.contains('ztext-math')) {
      const dataMath = el.getAttribute('data-math') || el.getAttribute('data-tex');
      if (dataMath && dataMath.trim()) return dataMath.trim();
    }

    if (el.localName === 'math') {
      const annotation = el.querySelector(
        'annotation[encoding="application/x-tex"], annotation[encoding="application/x-latex"], annotation[encoding="application/tex"]'
      );
      const latex =
        annotation?.textContent ||
        el.getAttribute('alttext') ||
        el.getAttribute('data-tex') ||
        el.getAttribute('data-latex') ||
        el.getAttribute('aria-label') ||
        el.closest?.('[data-tex], .ztext-math')?.getAttribute('data-tex');
      if (latex && latex.trim()) return latex.trim();
    }

    // MathJax v3/v4
    if (el.tagName === 'MJX-CONTAINER') {
      const dataLatex =
        el.getAttribute('data-copy-latex') ||
        el.getAttribute('data-tex') ||
        el.closest?.('[data-tex], .ztext-math')?.getAttribute('data-tex');
      if (dataLatex && dataLatex.trim()) return dataLatex.trim();

      const mjxId = el.getAttribute('data-copy-latex-id') || el.getAttribute('ctxtmenu_counter');
      const latexById = window.__mathJaxV3LatexById;
      if (mjxId && latexById?.[mjxId]) return latexById[mjxId];

      // Fallback to script element
      const sibling = el.nextElementSibling;
      if (sibling && sibling.tagName === 'SCRIPT') {
        const scriptEl = sibling;
        if (scriptEl.type && scriptEl.type.includes('math/tex')) {
          return sibling.textContent?.trim() || null;
        }
      }
    }

    const hostTex = el.closest?.('[data-tex], .ztext-math')?.getAttribute('data-tex');
    if (hostTex && hostTex.trim()) return hostTex.trim();

    // MathJax v2
    const sibling = el.nextElementSibling;
    if (sibling && sibling.tagName === 'SCRIPT') {
      const scriptEl = sibling;
      const type = scriptEl.type;
      if (type === 'math/tex' || type === 'math/tex; mode=display') {
        return sibling.textContent?.trim() || null;
      }
    }

    return null;
  }

  function isDisplayLatex(tex) {
    if (!tex) return false;
    const trimmed = tex.trim();
    return (
      trimmed.startsWith('$$') ||
      trimmed.startsWith('\\[') ||
      /\\\\\s*$/.test(trimmed) ||
      /\\tag\s*\{/.test(trimmed) ||
      /\\begin\s*\{(?:equation|align|aligned|gather|gathered|multline|split|CD|eqnarray)\*?\}/.test(trimmed)
    );
  }

  // Determine if math should be inline or display mode
  function getDisplayMode(el) {
    const copiedMode = el.getAttribute('data-copy-latex-mode');
    if (copiedMode === 'display' || copiedMode === 'inline') return copiedMode;

    // Wikipedia
    if (el.classList.contains('mwe-math-fallback-image-display')) return 'display';

    // MathJax v2
    if (
      el.classList.contains('MathJax_Display') ||
      el.classList.contains('MJXc-display') ||
      el.classList.contains('MathJax_SVG_Display') ||
      el.classList.contains('ztext-math-block')
    ) {
      return 'display';
    }

    // MathJax v3/v4
    if (el.tagName === 'MJX-CONTAINER' && el.hasAttribute('display')) {
      return 'display';
    }

    if (
      el.closest?.(
        '.katex-display, .MathJax_Display, .MJXc-display, .MathJax_SVG_Display, mjx-container[display]'
      )
    ) {
      return 'display';
    }

    if (
      el.querySelector?.(
        'mjx-container[display], .MathJax_Display, .MJXc-display, .MathJax_SVG_Display, .katex-display, script[type*="mode=display"]'
      )
    ) {
      return 'display';
    }

    if (el.localName === 'math') {
      if (el.getAttribute('display') === 'block') return 'display';
    }

    if (
      el.classList.contains('katex') ||
      el.classList.contains('katex-mathml') ||
      el.classList.contains('katex-html')
    ) {
      if (el.parentElement?.classList.contains('katex-display')) {
        return 'display';
      }
    }

    const dataTex =
      el.getAttribute('data-math') ||
      el.getAttribute('data-tex') ||
      el.closest?.('[data-tex], .ztext-math')?.getAttribute('data-tex');
    if (isDisplayLatex(dataTex)) return 'display';

    if (el.hasAttribute('data-math') || el.hasAttribute('data-tex') || el.classList.contains('ztext-math')) {
      return el.tagName === 'DIV' ? 'display' : 'inline';
    }

    return 'inline';
  }

  function annotateMathForSelection(root = document) {
    const mathElements = root.querySelectorAll(
      '.katex, .katex-mathml, .katex-html, [data-math], [data-tex], .ztext-math, mjx-container, math, ' +
      '.MathJax_Display, .MJXc-display, .MathJax_SVG_Display, .MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML, .MathJax_SVG, ' +
      'img.mwe-math, img.mwe-math-fallback-image-inline, img.mwe-math-fallback-image-display'
    );

    mathElements.forEach((el) => {
      const latex = extractLatexFromElement(el);
      if (!latex) return;

      el.setAttribute('data-copy-latex', latex);
      el.setAttribute('data-copy-latex-mode', getDisplayMode(el));
    });
  }

  document.addEventListener('CopyLaTeX_HydrateMathJaxV3', () => {
    annotateMathForSelection(document);
  }, true);

  // Copy text to clipboard with fallback methods
  async function copyToClipboard(text) {
    class KnownFailureError extends Error {}

    // Method 1: Try navigator.clipboard API
    const useClipboardAPI = async (t) => {
      let ret;
      try {
        ret = await navigator.permissions.query({
          name: 'clipboard-write',
          allowWithoutGesture: true,
        });
      } catch (e) {
        if (e instanceof TypeError) {
          // Firefox: clipboard-write is not queryable, just try to write          await navigator.clipboard.writeText(t);
          await navigator.clipboard.writeText(t);
          return true;
        }
        throw e;
      }

      if (ret && ret.state === 'granted') {
        await navigator.clipboard.writeText(t);
        return true;
      }
      throw new KnownFailureError('no permission to call navigator.clipboard API');
    };

    // Method 2: Fallback to textarea + execCommand
    const useOnPageTextarea = async (t) => {
      const textBox = document.createElement('textarea');
      document.body.appendChild(textBox);
      try {
        textBox.value = t;
        textBox.select();
        const result = document.execCommand('Copy');
        if (result) return Promise.resolve(true);
        return Promise.reject(new KnownFailureError('execCommand returned false'));
      } catch (e) {
        return Promise.reject(e);
      } finally {
        if (document.body.contains(textBox)) document.body.removeChild(textBox);
      }
    };

    // Try clipboard API first
    try {
      await useClipboardAPI(text);
      return { ok: true, method: 'navigator_api' };
    } catch (error) {
      if (error instanceof KnownFailureError) {
        console.debug('[Copy LaTeX]', error);
        // Continue to fallback (textarea method)
      } else {
        const err = error;
        console.error('[Copy LaTeX] Clipboard error (navigator_api):', err);
        return { ok: false, error: `${err.name} ${err.message}`, method: 'navigator_api' };
      }
    }

    // Try textarea fallback
    try {
      await useOnPageTextarea(text);
      return { ok: true, method: 'textarea' };
    } catch (error) {
      const err = error;
      console.error('[Copy LaTeX] Clipboard error (textarea):', err);
      return { ok: false, error: `${err.name} ${err.message}`, method: 'textarea' };
    }
  }

  // Expose only the single entrypoint
  globalThis.convertAndCopyHtml = convertAndCopyHtml;
  globalThis.convertHtmlToMarkdownText = convertHtmlToMarkdownText;
  globalThis.containsTextLatex = containsTextLatex;
})();
