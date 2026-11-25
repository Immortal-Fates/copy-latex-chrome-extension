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

	function injectMathJaxPageScript() {
		// 1. 如果已经由 MAIN world 原生注入，直接退出
		if (document.documentElement?.dataset?.copyLatexMathjaxInjected === 'true') {
			return;
		}

		// 2. 如果页面上根本没有任何 MathJax 相关元素，不要尝试向 DOM 插入 script，彻底避免触发 Trusted Types 或 CSP
		const hasMathJaxElements = !!document.querySelector?.(
			'mjx-container, script[src*="mathjax"], script[type*="mathjax"], script[type*="math/tex"]'
		);
		if (!hasMathJaxElements) {
			return;
		}

		// 3. Fallback 降级机制（仅在不支持 MAIN world 且有 MathJax 时）
		try {
			const root = document.head || document.documentElement;
			if (!root) return;

			let scriptUrl;
			const rawUrl = browser.runtime.getURL('content/injected/mathjax-bridge.js');

			if (window.trustedTypes) {
				if (typeof window.trustedTypes.createPolicy === 'function') {
					try {
						const policy =
							window.__copyLatexPolicy ||
							window.trustedTypes.createPolicy('copy-latex', {
								createScriptURL: (s) => s,
							});
						window.__copyLatexPolicy = policy;
						scriptUrl = policy.createScriptURL(rawUrl);
					} catch (_) {
						// 网站 CSP 限制不允许创建该 policy，直接退出，绝不给 script.src 赋 string
						return;
					}
				} else {
					return;
				}
			} else {
				scriptUrl = rawUrl;
			}

			if (!scriptUrl) return;

			const script = document.createElement('script');
			script.src = scriptUrl;
			root.appendChild(script);
			script.remove();
		} catch (_) {
			// 静默处理所有异常
		}
	}

	injectMathJaxPageScript();

  // Listen for messages from the injected page script to receive LaTeX code (in case of MathJax v3 and v4)
	window.addEventListener('message', (event) => {
		if (event.source !== window) return;
		if (event.data && event.data.type === 'CopyLaTeX_MathJaxV3') {
			ns.state.lastMathJaxV3Latex = event.data.latex;
			if (event.data.mjxId) {
				ns.state.mathJaxV3LatexById[event.data.mjxId] = event.data.latex;
				window.__mathJaxV3LatexById[event.data.mjxId] = event.data.latex;
			}
			window.__lastMathJaxV3Latex = event.data.latex;
		}
	});

	let hideTimeout = null;

	function cancelHideOverlay() {
		if (hideTimeout) {
			clearTimeout(hideTimeout);
			hideTimeout = null;
		}
	}

	function scheduleHideOverlay(delay = 120) {
		if (hideTimeout) return;
		hideTimeout = setTimeout(() => {
			hideTimeout = null;
			const currentTarget = ns.state.currentTarget;
			if (currentTarget) {
				currentTarget.classList.remove('hoverlatex-hover');
				ns.state.currentTarget = null;
			}
			ns.output.hideOverlay();
		}, delay);
	}

	function showOverlayForTarget(target, tex, mode = 'inline') {
		cancelHideOverlay();
		if (ns.state.currentTarget === target && ns.state.overlay?.dataset.tex === tex) {
			const overlay = ns.state.overlay;
			if (overlay && !overlay.classList.contains('visible')) {
				overlay.classList.add('visible');
			}
			return;
		}
		if (ns.state.currentTarget && ns.state.currentTarget !== target) {
			ns.state.currentTarget.classList.remove('hoverlatex-hover');
		}
		ns.state.currentTarget = target;
		target.classList.add('hoverlatex-hover');
		ns.output.showOverlay(target, tex, mode);
	}

	function handleHover(e) {
		if (e.target?.closest?.('.hoverlatex-overlay')) {
			cancelHideOverlay();
			return;
		}

		if (ns.detect.isWikipedia()) {
			const wikipediaTex = ns.detect.findWikipediaTex(e.target);
			if (wikipediaTex) {
				showOverlayForTarget(e.target, wikipediaTex, ns.detect.getDisplayMode(e.target));
				return;
			}
		}

		const katex = ns.detect.findKaTeXElementFromEventTarget(e);
		if (katex) {
			const tex = ns.detect.findAnnotationTex(katex);
			if (tex) {
				showOverlayForTarget(katex, tex, ns.detect.getDisplayMode(katex));
				return;
			}
		}

		const mathCodeEl = ns.detect.findMathCodeElementFromEventTarget(e);
		if (mathCodeEl) {
			const tex = ns.detect.findMathCodeTex(mathCodeEl);
			if (tex) {
				showOverlayForTarget(mathCodeEl, tex, ns.detect.getDisplayMode(mathCodeEl));
				return;
			}
		}

		const dataMathEl = ns.detect.findElementFromEvent(e, '[data-math], [data-tex], .ztext-math');
		if (dataMathEl) {
			const tex = ns.detect.findDataMathTex(dataMathEl);
			if (tex) {
				showOverlayForTarget(dataMathEl, tex, ns.detect.getDisplayMode(dataMathEl));
				return;
			}
		}

		const mjxContainer = ns.detect.findElementFromEvent(e, 'mjx-container');
		if (mjxContainer) {
			const tex = ns.detect.findMathJaxV3Tex(mjxContainer);
			if (tex) {
				showOverlayForTarget(mjxContainer, tex, ns.detect.getDisplayMode(mjxContainer));
				return;
			}
		}

		const mathJaxDisplay = ns.detect.findElementFromEvent(
			e,
			'.MathJax_Display, .MJXc-display, .MathJax_SVG_Display'
		);
		const mathJaxInline = ns.detect.findElementFromEvent(
			e,
			'.MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML, .MathJax_SVG'
		);
		if (mathJaxDisplay || mathJaxInline) {
			const mathElement = mathJaxDisplay || mathJaxInline;
			const tex = ns.detect.findMathJaxTex(mathElement);
			if (tex) {
				showOverlayForTarget(mathElement, tex, ns.detect.getDisplayMode(mathElement));
			}
		}
	}

	document.addEventListener('mouseover', handleHover, { capture: true });

	document.addEventListener('mouseout', (e) => {
		const currentTarget = ns.state.currentTarget;
		if (!currentTarget) return;

		const related = e.relatedTarget;
		if (related instanceof Element && related.closest?.('.hoverlatex-overlay')) {
			cancelHideOverlay();
			return;
		}

		const stillInsideTarget =
			(related instanceof Node && currentTarget.contains(related)) === true;
		if (stillInsideTarget) {
			if (typeof e.clientX === 'number' && typeof e.clientY === 'number' && ns.detect?.isCursorNearVisual) {
				if (!ns.detect.isCursorNearVisual(currentTarget, e, 24)) {
					scheduleHideOverlay(80);
				} else {
					cancelHideOverlay();
				}
			}
			return;
		}

		const movingIntoKaTeX = ns.detect.findKaTeXElementFromEventTarget(related);
		if (movingIntoKaTeX) {
			cancelHideOverlay();
			return;
		}

		if (
			related?.closest?.('[data-math], [data-tex], .ztext-math') ||
			related?.closest?.('mjx-container') ||
			related?.closest?.('.MathJax_Display, .MJXc-display, .MathJax_SVG_Display') ||
			related?.closest?.('.MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML, .MathJax_SVG')
		) {
			cancelHideOverlay();
			return;
		}

		if (
			ns.detect.isWikipedia() &&
			related?.tagName === 'IMG' &&
			(related?.classList.contains('mwe-math') ||
				related?.classList.contains('mwe-math-fallback-image-inline') ||
				related?.classList.contains('mwe-math-fallback-image-display'))
		) {
			cancelHideOverlay();
			return;
		}

		scheduleHideOverlay(120);
	});

	document.addEventListener('mousemove', (e) => {
		const currentTarget = ns.state.currentTarget;
		if (!currentTarget) return;
		if (e.target?.closest?.('.hoverlatex-overlay')) {
			cancelHideOverlay();
			return;
		}
		if (ns.detect?.isCursorNearVisual) {
			if (ns.detect.isCursorNearVisual(currentTarget, e, 24)) {
				cancelHideOverlay();
			} else {
				scheduleHideOverlay(80);
			}
		}
	}, { passive: true });

	function shouldHandleGesture(e) {
		if (typeof e.button === 'number' && e.button !== 0) return false;
		return true;
	}

	function tryCopyTex(tex, mode = 'inline') {
		if (!tex || !tex.trim()) return false;
		const trimmed = tex.trim();
		const now = Date.now();
		if (ns.state.lastCopiedTex === trimmed && now - ns.state.lastCopyGestureTs < 700) return true;
		ns.state.lastCopyGestureTs = now;
		ns.state.lastCopiedTex = trimmed;
		ns.output.copyLatex(trimmed, mode);
		return true;
	}

	function handleCopyGesture(e) {
		if (!shouldHandleGesture(e)) return;

		const overlay = ns.state.overlay;
		if (overlay && overlay.classList.contains('visible') && e.target?.closest?.('.hoverlatex-overlay')) {
			const tex = overlay.dataset.tex;
			if (tex) tryCopyTex(tex, overlay.dataset.mode || 'inline');
			return;
		}

		if (ns.detect.isWikipedia()) {
			const wikipediaTex = ns.detect.findWikipediaTex(e.target);
			if (wikipediaTex) {
				tryCopyTex(wikipediaTex, ns.detect.getDisplayMode(e.target));
				return;
			}
		}

		const katex = ns.detect.findKaTeXElementFromEventTarget(e);
		if (katex) {
			const tex = ns.detect.findAnnotationTex(katex);
			if (tex) {
				tryCopyTex(tex, ns.detect.getDisplayMode(katex));
				return;
			}
		}

		const mathCodeEl = ns.detect.findMathCodeElementFromEventTarget(e);
		if (mathCodeEl) {
			const tex = ns.detect.findMathCodeTex(mathCodeEl);
			if (tex) {
				tryCopyTex(tex, ns.detect.getDisplayMode(mathCodeEl));
				return;
			}
		}

		const dataMathEl = ns.detect.findElementFromEvent(e, '[data-math], [data-tex], .ztext-math');
		if (dataMathEl) {
			const tex = ns.detect.findDataMathTex(dataMathEl);
			if (tex) {
				tryCopyTex(tex, ns.detect.getDisplayMode(dataMathEl));
				return;
			}
		}

		const mjxContainer = ns.detect.findElementFromEvent(e, 'mjx-container');
		if (mjxContainer) {
			const tex = ns.detect.findMathJaxV3Tex(mjxContainer);
			if (tex) {
				tryCopyTex(tex, ns.detect.getDisplayMode(mjxContainer));
				return;
			}
		}

		const mathJaxDisplay = ns.detect.findElementFromEvent(
			e,
			'.MathJax_Display, .MJXc-display, .MathJax_SVG_Display'
		);
		const mathJaxInline = ns.detect.findElementFromEvent(
			e,
			'.MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML, .MathJax_SVG'
		);
		if (mathJaxDisplay || mathJaxInline) {
			const mathElement = mathJaxDisplay || mathJaxInline;
			const tex = ns.detect.findMathJaxTex(mathElement);
			if (tex) {
				tryCopyTex(tex, ns.detect.getDisplayMode(mathElement));
				return;
			}
		}
	}

	document.addEventListener('pointerdown', (e) => handleCopyGesture(e), { capture: true });
	document.addEventListener('click', (e) => handleCopyGesture(e), { capture: true });
	// Intercept Cmd+C / Ctrl+C: auto-copy as Markdown when selection contains math
	
	window.addEventListener('copy', (e) => {
	    const selection = window.getSelection();
	    if (!selection || selection.rangeCount === 0) return;

	    document.dispatchEvent(new CustomEvent('CopyLaTeX_HydrateMathJaxV3'));

	    const container = document.createElement('div');
	    for (let i = 0; i < selection.rangeCount; i++) {
        container.appendChild(selection.getRangeAt(i).cloneContents());
	    }
	
	    const hasMath = container.querySelector(
	        '.katex, .katex-mathml, .katex-html, [data-math], [data-tex], .ztext-math, mjx-container, math, ' +
	        '.MathJax_Display, .MJXc-display, .MathJax_SVG_Display, .MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML, .MathJax_SVG, ' +
	        'img.mwe-math, img.mwe-math-fallback-image-inline, img.mwe-math-fallback-image-display'
	    );
	    const hasTextLatex = typeof globalThis.containsTextLatex === 'function' &&
	        globalThis.containsTextLatex(container);
	    const hasTable = !!container.querySelector('table, tr, td, th');

	    if (!hasMath && !hasTextLatex && !hasTable) return;
	
	    const html = container.innerHTML;
	    if (typeof globalThis.convertHtmlToMarkdownText === 'function') {
	        const markdown = globalThis.convertHtmlToMarkdownText(html);
	        if (markdown && e.clipboardData) {
	            e.preventDefault();
	            e.clipboardData.setData('text/plain', markdown);
	            e.stopImmediatePropagation();
	        }
	    }
	}, { capture: true });

})();
