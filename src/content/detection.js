(() => {
	const ns = (window.CopyLatex = window.CopyLatex || {});
	ns.state = ns.state || {
		overlay: null,
		currentTarget: null,
		lastMathJaxV3Latex: null,
		mathJaxV3LatexById: Object.create(null),
		lastCopyGestureTs: 0,
		lastCopiedTex: null,
	};
	ns.state.mathJaxV3LatexById = ns.state.mathJaxV3LatexById || Object.create(null);
	window.__mathJaxV3LatexById = window.__mathJaxV3LatexById || ns.state.mathJaxV3LatexById;

	function isWikipedia() {
		const hostname = window.location.hostname;
		return (
			hostname.endsWith('.wikipedia.org') ||
			hostname === 'www.wikiwand.com' ||
			hostname === 'wikimedia.org' ||
			hostname.endsWith('.wikiversity.org') ||
			hostname.endsWith('.wikibooks.org')
		);
	}

	function findWikipediaTex(el) {
    // Only work on Wikipedia/Wikiwand sites
		if (!isWikipedia()) return null;
		if (!el) return null;

		const img =
			el.tagName === 'IMG'
				? el
				: el.closest?.(
						'img.mwe-math, img.mwe-math-fallback-image-inline, img.mwe-math-fallback-image-display'
				  ) ||
				  el.querySelector?.(
						'img.mwe-math, img.mwe-math-fallback-image-inline, img.mwe-math-fallback-image-display'
				  );
		if (!img) return null;

    // Check if it's a Wikipedia math image
		if (
			img.classList.contains('mwe-math') ||
			img.classList.contains('mwe-math-fallback-image-inline') ||
			img.classList.contains('mwe-math-fallback-image-display')
		) {
			const alt = img.getAttribute('alt');
			if (alt && alt.trim()) {
        // Remove leading '{\displaystyle' and trailing '}'
				const match = alt.trim().match(/^\{\\displaystyle\s*([\s\S]*?)\}$/);
				if (match) return match[1].trim();
				return alt.trim();
			}
		}

		return null;
	}

	function findMathJaxV3Tex(el) {
    // Check for MathJax v3 containers
		const mjxContainer = el?.closest?.('mjx-container');
		if (!mjxContainer) return null;

		const dataLatex =
			mjxContainer.getAttribute('data-copy-latex') ||
			mjxContainer.getAttribute('data-tex') ||
			mjxContainer.closest?.('[data-tex], .ztext-math')?.getAttribute('data-tex');
		if (dataLatex && dataLatex.trim()) return dataLatex.trim();

		const mjxId = mjxContainer.getAttribute('data-copy-latex-id') || mjxContainer.getAttribute('ctxtmenu_counter');
		const latexById = window.__mathJaxV3LatexById || ns.state.mathJaxV3LatexById;
		if (mjxId && latexById?.[mjxId]) return latexById[mjxId];

		if (ns.state.lastMathJaxV3Latex) {
			return ns.state.lastMathJaxV3Latex;
		}

    // Fallback: try to find any associated script elements nearby
		let current = mjxContainer;
		for (let i = 0; i < 5; i++) {  // Check a few siblings
			if (!current.nextElementSibling) break;
			current = current.nextElementSibling;
			if (
				current.tagName === 'SCRIPT' &&
				(current.type === 'math/tex' || current.type === 'math/tex; mode=display')
			) {
				return current.textContent.trim();
			}
		}

		return null;
	}

	function findAnnotationTex(el) {
		const katexEl = el?.closest?.('.katex');
		if (!katexEl) return null;

		const ann = katexEl.querySelector(
			'annotation[encoding="application/x-tex"], annotation[encoding="application/x-latex"], annotation[encoding="application/tex"]'
		);
		if (ann && ann.textContent.trim()) return ann.textContent.trim();

		const hostTex =
			katexEl.closest?.('[data-tex], .ztext-math')?.getAttribute('data-tex') ||
			katexEl.closest?.('[data-math]')?.getAttribute('data-math');
		if (hostTex && hostTex.trim()) return hostTex.trim();

		const dataLatex =
			katexEl.getAttribute('data-tex') ||
			katexEl.getAttribute('data-latex') ||
			katexEl.getAttribute('aria-label');
		if (dataLatex && dataLatex.trim()) return dataLatex.trim();

		return ns.renderedKaTeX?.extractRenderedKaTeXTex(katexEl) || null;
	}

	function getEventElements(eventOrTarget) {
		if (eventOrTarget?.composedPath) {
			return eventOrTarget.composedPath().filter((node) => node instanceof Element);
		}
		return eventOrTarget instanceof Element ? [eventOrTarget] : [];
	}

	function getElementsAtPoint(eventOrTarget) {
		if (
			typeof eventOrTarget?.clientX !== 'number' ||
			typeof eventOrTarget?.clientY !== 'number' ||
			typeof document.elementsFromPoint !== 'function'
		) {
			return [];
		}
		return document.elementsFromPoint(eventOrTarget.clientX, eventOrTarget.clientY);
	}

	function rectContainsPoint(rect, x, y, padding = 8) {
		if (!rect) return false;
		return (
			x >= rect.left - padding &&
			x <= rect.right + padding &&
			y >= rect.top - padding &&
			y <= rect.bottom + padding
		);
	}

	function getVisualBounds(el) {
		if (!(el instanceof Element)) return null;

		// 1. 如果 el 本身就是视觉渲染内容节点
		if (
			el.matches?.(
				'.katex-html, mjx-math, .MathJax_SVG svg, mjx-container:not([display]) svg, .math-content, img.mwe-math, img.mwe-math-fallback-image-inline, img.mwe-math-fallback-image-display'
			)
		) {
			const rect = el.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) return rect;
		}

		// 2. KaTeX: .katex-html 包含了所有可见渲染字符
		const katexHtml = el.querySelector?.('.katex-html');
		if (katexHtml) {
			const rect = katexHtml.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) return rect;
		}

		// 3. MathJax v3/v4: mjx-math (HTML) 或 svg (SVG)
		const mjxMath = el.querySelector?.('mjx-math');
		if (mjxMath) {
			const rect = mjxMath.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) return rect;
		}

		// 4. SVG 呈现（排除隐藏在 .katex-mathml 内的无用 svg）
		const svgs = el.querySelectorAll?.('svg') || [];
		for (const svg of svgs) {
			if (!svg.closest?.('.katex-mathml')) {
				const rect = svg.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0) return rect;
			}
		}

		// 5. 图片公式（Wikipedia 等）
		const img = el.querySelector?.(
			'img.mwe-math, img.mwe-math-fallback-image-inline, img.mwe-math-fallback-image-display, img[src*="equation"], img[src*="latex"]'
		);
		if (img) {
			const rect = img.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) return rect;
		}

		// 6. 其他常见 math-content 容器
		const mathContent = el.querySelector?.('.math-content');
		if (mathContent) {
			const rect = mathContent.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) return rect;
		}

		// 7. MathJax v2 渲染框架 (.mjx-chtml, .MathJax_CHTML, .MathJax)
		const mjx2 = el.querySelector?.('.mjx-chtml, .MathJax_CHTML, .MathJax');
		if (mjx2) {
			const rect = mjx2.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) return rect;
		}

		// 8. 原生 <math>（排除 .katex-mathml 内部的隐藏辅助元素）
		const math = el.querySelector?.('math');
		if (math && !math.closest?.('.katex-mathml')) {
			const rect = math.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) return rect;
		}

		// 9. 单子元素 fallback（非辅助元素）
		if (
			el.children.length === 1 &&
			!el.firstElementChild.matches?.('.katex-mathml, annotation, script, style')
		) {
			const childRect = el.firstElementChild.getBoundingClientRect();
			if (childRect.width > 0 && childRect.height > 0) return childRect;
		}

		// 10. 如果是文本包装的 block，尝试用 Range 获取内部文本实际包围盒
		try {
			const range = document.createRange();
			range.selectNodeContents(el);
			const rangeRect = range.getBoundingClientRect();
			const elRect = el.getBoundingClientRect();
			if (rangeRect.width > 0 && rangeRect.height > 0 && elRect.width > rangeRect.width * 1.15) {
				return rangeRect;
			}
		} catch (_) {}

		return el.getBoundingClientRect();
	}

	function isCursorNearVisual(el, eventOrTarget, threshold = 20) {
		if (typeof eventOrTarget?.clientX !== 'number' || typeof eventOrTarget?.clientY !== 'number') {
			return true;
		}
		if (!(el instanceof Element)) return false;

		const targetNode = eventOrTarget.target instanceof Element ? eventOrTarget.target : null;

		// 核心判定 1：如果鼠标指针直接指向的就是公式的可视渲染部分（或其内部子节点）
		// 说明光标正悬停在公式的文字、符号或图形表面上，100% 在公式上！
		if (targetNode) {
			const visualHit = targetNode.closest?.(
				'.katex-html, mjx-math, .MathJax_SVG svg, mjx-container:not([display]) svg, img.mwe-math, img.mwe-math-fallback-image-inline, img.mwe-math-fallback-image-display, .math-content, .mjx-chtml'
			);
			if (visualHit && (el.contains(visualHit) || visualHit.contains(el))) {
				return true;
			}

			// 如果 targetNode 是 el 内部真正的子元素（而非 el 容器本身），且不是 block 占位容器
			if (
				targetNode !== el &&
				el.contains(targetNode) &&
				!targetNode.matches?.(
					'.katex-display, mjx-container, [display], .MathJax_Display, .MJXc-display, .MathJax_SVG_Display, .ztext-math-block, div[data-math]'
				)
			) {
				const style = window.getComputedStyle(targetNode);
				if (style.display.includes('inline') || targetNode.tagName === 'SPAN') {
					return true;
				}
			}
		}

		// 核心判定 2：如果鼠标指针指向的是外层容器（例如整行的 katex-display, mjx-container[display] 等）
		// 或者光标位于公式字符之间的空隙或边缘
		const rect = getVisualBounds(el);
		if (!rect) return false;

		// 水平容差 20px，垂直容差 16px，确保公式边缘和上下都能轻松触发
		const hThreshold = threshold;
		const vThreshold = Math.max(threshold, 16);

		return (
			eventOrTarget.clientX >= rect.left - hThreshold &&
			eventOrTarget.clientX <= rect.right + hThreshold &&
			eventOrTarget.clientY >= rect.top - vThreshold &&
			eventOrTarget.clientY <= rect.bottom + vThreshold
		);
	}

	function findDescendantAtPoint(root, selector, eventOrTarget) {
		if (
			!(root instanceof Element) ||
			typeof eventOrTarget?.clientX !== 'number' ||
			typeof eventOrTarget?.clientY !== 'number'
		) {
			return null;
		}

		const candidates = root.querySelectorAll?.(selector) || [];
		for (const candidate of candidates) {
			const rect = getVisualBounds(candidate) || candidate.getBoundingClientRect();
			if (rectContainsPoint(rect, eventOrTarget.clientX, eventOrTarget.clientY)) {
				return candidate;
			}
		}
		return null;
	}

	function findElementFromEvent(eventOrTarget, selector) {
		const elements = [...getEventElements(eventOrTarget), ...getElementsAtPoint(eventOrTarget)];
		for (const el of elements) {
			if (el.matches?.(selector)) {
				if (isCursorNearVisual(el, eventOrTarget)) return el;
			}
			const closest = el.closest?.(selector);
			if (closest) {
				if (isCursorNearVisual(closest, eventOrTarget)) return closest;
			}
			const descendant = findDescendantAtPoint(el, selector, eventOrTarget);
			if (descendant) return descendant;
		}
		return null;
	}

	function findKaTeXElementFromEventTarget(target) {
		const pathK = findElementFromEvent(target, '.katex');
		if (pathK) return pathK;

		const katexDisplay = findElementFromEvent(target, '.katex-display');
		if (katexDisplay) {
			const innerKatex = katexDisplay.querySelector?.('.katex');
			if (innerKatex && isCursorNearVisual(innerKatex, target)) {
				return innerKatex;
			}
		}
		return null;
	}

	function findMathCodeElementFromEventTarget(target) {
		return findElementFromEvent(
			target,
			'code.language-math, .math-inline, .math-display, [data-language="math"], [data-code-language="math"]'
		);
	}

	function findMathCodeTex(el) {
		const mathEl = findMathCodeElementFromEventTarget(el);
		const tex = mathEl?.textContent?.trim();
		return tex || null;
	}

	function findDataMathTex(el) {
		const mathEl = el?.closest?.('[data-math], [data-tex], .ztext-math') || el;
		if (!mathEl) return null;
		const tex = mathEl.getAttribute?.('data-math') || mathEl.getAttribute?.('data-tex');
		return tex && tex.trim() ? tex.trim() : null;
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

	function getDisplayMode(el) {
		if (!el) return 'inline';
		if (el.classList?.contains('mwe-math-fallback-image-display')) return 'display';
		if (el.classList?.contains('katex-display') || el.classList?.contains('ztext-math-block')) return 'display';
		if (
			el.closest?.(
				'.katex-display, .MathJax_Display, .MJXc-display, .MathJax_SVG_Display, mjx-container[display]'
			)
		) {
			return 'display';
		}
		if (el.tagName === 'MJX-CONTAINER' && el.hasAttribute('display')) return 'display';
		if (
			el.classList?.contains('MathJax_Display') ||
			el.classList?.contains('MJXc-display') ||
			el.classList?.contains('MathJax_SVG_Display')
		) {
			return 'display';
		}
		if (el.classList?.contains('math-display')) return 'display';
		if ((el.hasAttribute?.('data-math') || el.hasAttribute?.('data-tex')) && el.tagName === 'DIV') {
			return 'display';
		}
		if (
			el.querySelector?.(
				'mjx-container[display], .MathJax_Display, .MJXc-display, .MathJax_SVG_Display, .katex-display, script[type*="mode=display"]'
			)
		) {
			return 'display';
		}
		const dataTex = el.getAttribute?.('data-math') || el.getAttribute?.('data-tex');
		if (isDisplayLatex(dataTex)) return 'display';
		if (el.matches?.('[data-tex], .ztext-math')) {
			const selfStyle = window.getComputedStyle(el);
			return selfStyle.display === 'block' || selfStyle.display === 'flex' ? 'display' : 'inline';
		}
		const parent = el.parentElement;
		if (parent) {
			const parentStyle = window.getComputedStyle(parent);
			if (parentStyle.display === 'block' || parentStyle.display === 'flex' || parentStyle.textAlign === 'center') {
				return 'display';
			}
		}
		return 'inline';
	}

	function findMathJaxTex(el) {
		const hostTex = el.closest?.('[data-tex], .ztext-math')?.getAttribute('data-tex');
		if (hostTex && hostTex.trim()) return hostTex.trim();

    // Check for MathJax display equations
		const mathJaxDisplay = el.closest?.('.MathJax_Display, .MJXc-display, .MathJax_SVG_Display');
		if (mathJaxDisplay) {
      // Look for the script element after the display div
			let sibling = mathJaxDisplay.nextElementSibling;
			while (sibling) {
				if (sibling.tagName === 'SCRIPT' && sibling.type === 'math/tex; mode=display') {
					return sibling.textContent.trim();
				}
				sibling = sibling.nextElementSibling;
			}
		}

    // Check for MathJax inline equations (various formats)
		const mathJaxInline = el.closest?.('.MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML, .MathJax_SVG');
		if (mathJaxInline) {
      // For traditional MathJax elements with IDs
			if (mathJaxInline.id && mathJaxInline.id.includes('MathJax-Element-')) {
        // Look for the script element after the MathJax span
        let sibling = mathJaxInline.nextElementSibling;
				while (sibling) {
					if (sibling.tagName === 'SCRIPT' && sibling.type === 'math/tex') {
						return sibling.textContent.trim();
					}
					sibling = sibling.nextElementSibling;
				}
			}
      
      // For newer MathJax formats (mjx-chtml, MathJax_CHTML)
      // Look for script elements with math/tex type
			let sibling = mathJaxInline.nextElementSibling;
			while (sibling) {
				if (
					sibling.tagName === 'SCRIPT' &&
					(sibling.type === 'math/tex' || sibling.type === 'math/tex; mode=display')
				) {
					return sibling.textContent.trim();
				}
				sibling = sibling.nextElementSibling;
			}
		}

		return null;
	}

	ns.detect = {
		isWikipedia,
		findWikipediaTex,
		findMathJaxV3Tex,
		findAnnotationTex,
		findKaTeXElementFromEventTarget,
		findMathCodeElementFromEventTarget,
		findMathCodeTex,
		findDataMathTex,
		findElementFromEvent,
		getDisplayMode,
		findMathJaxTex,
		getVisualBounds,
		isCursorNearVisual,
	};
})();
