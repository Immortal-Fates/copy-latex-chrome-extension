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
		if (!el || el.tagName !== 'IMG') return null;

    // Check if it's a Wikipedia math image
		if (
			el.classList.contains('mwe-math') ||
			el.classList.contains('mwe-math-fallback-image-inline') ||
			el.classList.contains('mwe-math-fallback-image-display')
		) {
			const alt = el.getAttribute('alt');
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

		const dataLatex = mjxContainer.getAttribute('data-copy-latex');
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

		const dataLatex =
			katexEl.getAttribute('data-tex') ||
			katexEl.getAttribute('data-latex') ||
			katexEl.getAttribute('aria-label');
		if (dataLatex && dataLatex.trim()) return dataLatex.trim();

		return extractRenderedKaTeXTex(katexEl);
	}

	function escapeLatexText(text) {
		return text.replace(/[\\{}$&#_%]/g, (char) => `\\${char}`);
	}

	function normalizeLatexText(text) {
		return text.replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
	}

	function extractRenderedKaTeXTex(katexEl) {
		const html = katexEl.querySelector('.katex-html') || katexEl;
		const tex = extractKaTeXChildren(html);
		return normalizeLatexText(tex) || null;
	}

	function extractKaTeXChildren(el) {
		let output = '';
		for (const child of el.childNodes) {
			if (child.nodeType === Node.TEXT_NODE) {
				output += child.textContent || '';
				continue;
			}
			if (!(child instanceof Element)) continue;
			if (child.classList.contains('strut') || child.classList.contains('pstrut')) continue;

			if (child.classList.contains('msupsub')) {
				const script = extractKaTeXScript(child);
				if (script) output += `^{${script}}`;
				continue;
			}

			output += extractKaTeXElement(child);
		}
		return output;
	}

	function extractKaTeXScript(el) {
		const sizing = el.querySelector('.sizing');
		return sizing ? extractKaTeXChildren(sizing) : extractKaTeXChildren(el);
	}

	function extractKaTeXElement(el) {
		if (el.classList.contains('mspace')) {
			const margin = el.style?.marginRight || '';
			if (margin.includes('2em')) return '\\quad ';
			if (margin) return ' ';
			return '';
		}

		if (el.classList.contains('mathbb')) return `\\mathbb{${extractKaTeXChildren(el)}}`;
		if (el.classList.contains('text')) return `\\text{${escapeLatexText(el.textContent || '')}}`;
		if (el.classList.contains('sqrt')) return `\\sqrt{${extractKaTeXChildren(el)}}`;

		return extractKaTeXChildren(el);
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

	function rectContainsPoint(rect, x, y) {
		return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
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
			if (rectContainsPoint(candidate.getBoundingClientRect(), eventOrTarget.clientX, eventOrTarget.clientY)) {
				return candidate;
			}
		}
		return null;
	}

	function findDocumentElementAtPoint(selector, eventOrTarget) {
		if (
			typeof eventOrTarget?.clientX !== 'number' ||
			typeof eventOrTarget?.clientY !== 'number'
		) {
			return null;
		}

		const candidates = document.querySelectorAll(selector);
		let best = null;
		let bestArea = Infinity;

		for (const candidate of candidates) {
			const rect = candidate.getBoundingClientRect();
			if (!rect.width || !rect.height) continue;
			if (!rectContainsPoint(rect, eventOrTarget.clientX, eventOrTarget.clientY)) continue;

			const area = rect.width * rect.height;
			if (area < bestArea) {
				best = candidate;
				bestArea = area;
			}
		}

		return best;
	}

	function findElementFromEvent(eventOrTarget, selector) {
		const elements = [...getEventElements(eventOrTarget), ...getElementsAtPoint(eventOrTarget)];
		for (const el of elements) {
			if (el.matches?.(selector)) return el;
			const closest = el.closest?.(selector);
			if (closest) return closest;
			const descendant = findDescendantAtPoint(el, selector, eventOrTarget);
			if (descendant) return descendant;
		}
		return findDocumentElementAtPoint(selector, eventOrTarget);
	}

	function findKaTeXElementFromEventTarget(target) {
		const pathK = findElementFromEvent(target, '.katex');
		if (pathK) return pathK;

		const katexDisplay = findElementFromEvent(target, '.katex-display');
		return katexDisplay?.querySelector?.('.katex') || null;
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

	function getDisplayMode(el) {
		if (!el) return 'inline';
		if (el.classList?.contains('mwe-math-fallback-image-display')) return 'display';
		if (el.classList?.contains('katex-display')) return 'display';
		if (el.closest?.('.katex-display')) return 'display';
		if (el.tagName === 'MJX-CONTAINER' && el.hasAttribute('display')) return 'display';
		if (el.classList?.contains('MathJax_Display') || el.classList?.contains('MJXc-display')) return 'display';
		if (el.classList?.contains('math-display')) return 'display';
		if (el.hasAttribute?.('data-math') && el.tagName === 'DIV') return 'display';
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
    // Check for MathJax display equations
		const mathJaxDisplay = el.closest?.('.MathJax_Display, .MJXc-display');
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
		const mathJaxInline = el.closest?.('.MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML');
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
		findElementFromEvent,
		getDisplayMode,
		findMathJaxTex,
	};
})();
