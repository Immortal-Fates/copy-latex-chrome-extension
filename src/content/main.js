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

	async function injectMathJaxPageScript() {
		try {
			const scriptUrl = browser.runtime.getURL('content/injected/mathjax-bridge.js');
			const script = document.createElement('script');
			script.src = scriptUrl;
			document.documentElement.appendChild(script);
		} catch (error) {
			console.error('[Copy LaTeX] Failed to inject MathJax script:', error);
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

	function showOverlayForTarget(target, tex, mode = 'inline') {
		if (ns.state.currentTarget === target && ns.state.overlay?.dataset.tex === tex) return;
		if (ns.state.currentTarget && ns.state.currentTarget !== target) {
			ns.state.currentTarget.classList.remove('hoverlatex-hover');
		}
		ns.state.currentTarget = target;
		target.classList.add('hoverlatex-hover');
		ns.output.showOverlay(target, tex, mode);
	}

	function handleHover(e) {
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

		const dataMathEl = ns.detect.findElementFromEvent(e, '[data-math]');
		if (dataMathEl) {
			const tex = dataMathEl.getAttribute('data-math');
			if (tex && tex.trim()) {
				showOverlayForTarget(dataMathEl, tex.trim(), ns.detect.getDisplayMode(dataMathEl));
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

		const mathJaxDisplay = ns.detect.findElementFromEvent(e, '.MathJax_Display, .MJXc-display');
		const mathJaxInline = ns.detect.findElementFromEvent(e, '.MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML');
		if (mathJaxDisplay || mathJaxInline) {
			const mathElement = mathJaxDisplay || mathJaxInline;
			const tex = ns.detect.findMathJaxTex(mathElement);
			if (tex) {
				showOverlayForTarget(mathElement, tex, ns.detect.getDisplayMode(mathElement));
			}
		}
	}

	document.addEventListener('mouseover', handleHover, { capture: true });
	document.addEventListener('mousemove', handleHover, { capture: true });

	document.addEventListener('mouseout', (e) => {
		const currentTarget = ns.state.currentTarget;
		if (!currentTarget) return;

		const stillInsideTarget =
			(e.relatedTarget instanceof Node && currentTarget.contains(e.relatedTarget)) === true;
		if (stillInsideTarget) return;

		const related = e.relatedTarget;
		const movingIntoOverlay = related?.closest?.('.hoverlatex-overlay');
		if (movingIntoOverlay) return;

		const movingIntoKaTeX = ns.detect.findKaTeXElementFromEventTarget(related);
		if (movingIntoKaTeX) return;

		if (
			related?.closest?.('[data-math]') ||
			related?.closest?.('mjx-container') ||
			related?.closest?.('.MathJax_Display, .MJXc-display') ||
			related?.closest?.('.MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML')
		) {
			return;
		}

		if (
			ns.detect.isWikipedia() &&
			related?.tagName === 'IMG' &&
			(related?.classList.contains('mwe-math') ||
				related?.classList.contains('mwe-math-fallback-image-inline') ||
				related?.classList.contains('mwe-math-fallback-image-display'))
		) {
			return;
		}

		currentTarget.classList.remove('hoverlatex-hover');
		ns.output.hideOverlay();
		ns.state.currentTarget = null;
	});

	function shouldHandleGesture(e) {
		if (typeof e.button === 'number' && e.button !== 0) return false;
		return true;
	}

	function handleCopyGesture(e) {
		if (!shouldHandleGesture(e)) return;

		const overlay = ns.state.overlay;
		if (overlay && overlay.classList.contains('visible') && e.target?.closest?.('.hoverlatex-overlay')) {
			const tex = overlay.dataset.tex;
			if (tex && tex.trim()) ns.output.copyLatex(tex.trim(), overlay.dataset.mode || 'inline');
			return;
		}

		if (ns.detect.isWikipedia()) {
			const wikipediaTex = ns.detect.findWikipediaTex(e.target);
			if (wikipediaTex) {
				ns.output.copyLatex(wikipediaTex, ns.detect.getDisplayMode(e.target));
				return;
			}
		}

		const katex = ns.detect.findKaTeXElementFromEventTarget(e);
		if (katex) {
			const tex = ns.detect.findAnnotationTex(katex);
			if (tex) {
				const now = Date.now();
				if (ns.state.lastCopiedTex === tex && now - ns.state.lastCopyGestureTs < 700) return;
				ns.state.lastCopyGestureTs = now;
				ns.state.lastCopiedTex = tex;
				ns.output.copyLatex(tex, ns.detect.getDisplayMode(katex));
				return;
			}
		}

		const mathCodeEl = ns.detect.findMathCodeElementFromEventTarget(e);
		if (mathCodeEl) {
			const tex = ns.detect.findMathCodeTex(mathCodeEl);
			if (tex) {
				ns.output.copyLatex(tex, ns.detect.getDisplayMode(mathCodeEl));
				return;
			}
		}

		const dataMathEl = ns.detect.findElementFromEvent(e, '[data-math]');
		if (dataMathEl) {
			const tex = dataMathEl.getAttribute('data-math');
			if (tex) {
				ns.output.copyLatex(tex, ns.detect.getDisplayMode(dataMathEl));
				return;
			}
		}

		const mjxContainer = ns.detect.findElementFromEvent(e, 'mjx-container');
		if (mjxContainer) {
			const tex = ns.detect.findMathJaxV3Tex(mjxContainer);
			if (tex) {
				ns.output.copyLatex(tex, ns.detect.getDisplayMode(mjxContainer));
				return;
			}
		}

		const mathJaxDisplay = ns.detect.findElementFromEvent(e, '.MathJax_Display, .MJXc-display');
		const mathJaxInline = ns.detect.findElementFromEvent(e, '.MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML');
		if (mathJaxDisplay || mathJaxInline) {
			const mathElement = mathJaxDisplay || mathJaxInline;
			const tex = ns.detect.findMathJaxTex(mathElement);
			if (tex) ns.output.copyLatex(tex, ns.detect.getDisplayMode(mathElement));
		}
	}

	document.addEventListener('pointerdown', (e) => handleCopyGesture(e), { capture: true });
	document.addEventListener('click', (e) => handleCopyGesture(e), { capture: true });
	// Intercept Cmd+C / Ctrl+C: auto-copy as Markdown when selection contains math
	
	document.addEventListener('copy', (e) => {
	    const selection = window.getSelection();
	    if (!selection || selection.rangeCount === 0) return;

	    document.dispatchEvent(new CustomEvent('CopyLaTeX_HydrateMathJaxV3'));

	    const container = document.createElement('div');
	    for (let i = 0; i < selection.rangeCount; i++) {
        container.appendChild(selection.getRangeAt(i).cloneContents());
	    }
	
	    const hasMath = container.querySelector(
	        '.katex, [data-math], mjx-container, ' +
	        '.MathJax_Display, .MJXc-display, .MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML, ' +
	        'img.mwe-math, img.mwe-math-fallback-image-inline, img.mwe-math-fallback-image-display'
	    );
	
	    if (!hasMath) return;
	
	    const html = container.innerHTML;
	    if (typeof globalThis.convertHtmlToMarkdownText === 'function') {
	        const markdown = globalThis.convertHtmlToMarkdownText(html);
	        if (markdown && e.clipboardData) {
	            e.preventDefault();
	            e.clipboardData.setData('text/plain', markdown);
	        }
	    }
	});

})();
