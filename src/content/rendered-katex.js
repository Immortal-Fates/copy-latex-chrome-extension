(() => {
	const ns = (window.CopyLatex = window.CopyLatex || {});

	function escapeLatexText(text) {
		return text.replace(/[\\{}$&#_%]/g, (char) => `\\${char}`);
	}

	function normalizeLatexText(text) {
		return text.replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
	}

	function mapLatexSymbol(text) {
		const symbols = {
			'\uE020': '',
			'\u0338': '',
			'{': '\\{',
			'}': '\\}',
			'#': '\\#',
			'∈': '\\in',
			'∉': '\\notin',
			'∋': '\\ni',
			'∌': '\\not\\ni',
			'≠': '\\ne',
			'≈': '\\approx',
			'≅': '\\cong',
			'≡': '\\equiv',
			'≤': '\\le',
			'≥': '\\ge',
			'≪': '\\ll',
			'≫': '\\gg',
			'⋅': '\\cdot',
			'×': '\\times',
			'÷': '\\div',
			'±': '\\pm',
			'∓': '\\mp',
			'−': '-',
			'→': '\\to',
			'↔': '\\leftrightarrow',
			'←': '\\leftarrow',
			'↦': '\\mapsto',
			'⇒': '\\Rightarrow',
			'⇐': '\\Leftarrow',
			'⇔': '\\Leftrightarrow',
			'⟹': '\\Longrightarrow',
			'⟸': '\\Longleftarrow',
			'⟺': '\\Longleftrightarrow',
			'⟶': '\\longrightarrow',
			'⟵': '\\longleftarrow',
			'⟷': '\\longleftrightarrow',
			'∞': '\\infty',
			'∅': '\\emptyset',
			'∑': '\\sum',
			'∏': '\\prod',
			'∫': '\\int',
			'√': '\\sqrt',
			'∂': '\\partial',
			'∇': '\\nabla',
			'⊂': '\\subset',
			'⊆': '\\subseteq',
			'⊊': '\\subsetneq',
			'⊏': '\\sqsubset',
			'⊑': '\\sqsubseteq',
			'⊄': '\\nsubset',
			'⊈': '\\nsubseteq',
			'⊃': '\\supset',
			'⊇': '\\supseteq',
			'⊋': '\\supsetneq',
			'⊐': '\\sqsupset',
			'⊒': '\\sqsupseteq',
			'⊅': '\\nsupset',
			'⊉': '\\nsupseteq',
			'⊲': '\\triangleleft',
			'⊳': '\\triangleright',
			'⊴': '\\trianglelefteq',
			'⊵': '\\trianglerighteq',
			'∪': '\\cup',
			'∩': '\\cap',
			'⊎': '\\uplus',
			'⊔': '\\sqcup',
			'⊓': '\\sqcap',
			'⋯': '\\cdots',
			'⋮': '\\vdots',
			'⋱': '\\ddots',
			'⋰': '\\iddots',
			'∀': '\\forall',
			'∃': '\\exists',
			'π': '\\pi',
			'Π': '\\Pi',
			'α': '\\alpha',
			'β': '\\beta',
			'γ': '\\gamma',
			'Γ': '\\Gamma',
			'δ': '\\delta',
			'Δ': '\\Delta',
			'ε': '\\varepsilon',
			'θ': '\\theta',
			'λ': '\\lambda',
			'μ': '\\mu',
			'σ': '\\sigma',
			'Σ': '\\Sigma',
			'φ': '\\phi',
			'Φ': '\\Phi',
			'ψ': '\\psi',
			'Ψ': '\\Psi',
			'ω': '\\omega',
			'Ω': '\\Omega',
		};

		if (/[\uE020\u0338]/.test(text)) {
			const baseText = text.replace(/[\uE020\u0338]/g, '');
			const baseTex = Array.from(baseText).map((char) => symbols[char] || char).join('');
			return mapNegatedLatex(baseTex) || baseTex;
		}

		return Array.from(text).map((char) => symbols[char] || char).join('');
	}

	function hasNotOverlay(el) {
		return Array.from(el.querySelectorAll('.overlay, .mord, .mrel, .mbin')).some((child) => {
			if (child === el) return false;
			return /[\uE020\u0338/∕]/.test(child.textContent || '');
		});
	}

	function mapNegatedLatex(baseTex) {
		const negated = {
			'\\in': '\\notin',
			'∈': '\\notin',
			'=': '\\ne',
			'\\subset': '\\nsubset',
			'\\subseteq': '\\nsubseteq',
			'\\supset': '\\nsupset',
			'\\supseteq': '\\nsupseteq',
		};
		return negated[baseTex] || null;
	}

	const latexOperatorNames = new Set([
		'arccos',
		'arcsin',
		'arctan',
		'arg',
		'cos',
		'cosh',
		'cot',
		'coth',
		'csc',
		'deg',
		'det',
		'dim',
		'exp',
		'gcd',
		'hom',
		'inf',
		'ker',
		'lg',
		'lim',
		'liminf',
		'limsup',
		'ln',
		'log',
		'max',
		'min',
		'Pr',
		'sec',
		'sin',
		'sinh',
		'sup',
		'tan',
		'tanh',
	]);

	function extractRenderedKaTeXTex(katexEl) {
		const html = katexEl.querySelector('.katex-html') || katexEl;
		const tex = extractKaTeXChildren(html);
		return normalizeLatexText(tex) || null;
	}

	function appendLatex(output, next) {
		if (!next) return output;
		if (/\\[A-Za-z]+$/.test(output) && /^[A-Za-z]/.test(next)) {
			return `${output} ${next}`;
		}
		return output + next;
	}

	function isTableContainerCandidate(el) {
		return (
			el.classList?.contains('mord') ||
			el.classList?.contains('minner') ||
			el.classList?.contains('mop') ||
			el.classList?.contains('mrel')
		);
	}

	function extractKaTeXChildren(el, options = {}) {
		if (!options.skipMatrix && isTableContainerCandidate(el) && el.querySelector?.('.mtable')) {
			const cases = extractCases(el);
			if (cases) return cases;
			const matrix = extractMatrix(el);
			if (matrix) return matrix;
		}

		let output = '';
		for (const child of el.childNodes) {
			if (child.nodeType === Node.TEXT_NODE) {
				output = appendLatex(output, mapLatexSymbol(child.textContent || ''));
				continue;
			}
			if (!(child instanceof Element)) continue;
			if (options.skipOverlay && child.classList.contains('overlay')) continue;
			if (options.skipRoot && child.classList.contains('root')) continue;
			if (child.classList.contains('strut') || child.classList.contains('pstrut')) continue;
			if (child.classList.contains('vlist-s')) continue;

			if (child.classList.contains('msupsub')) {
				output = appendLatex(output, extractSupSub(child));
				continue;
			}

			output = appendLatex(output, extractKaTeXElement(child, options));
		}
		return output;
	}

	function extractSupSub(el) {
		const scripts = Array.from(el.querySelectorAll('.sizing')).map((scriptEl) => {
			const tex = normalizeLatexText(extractKaTeXChildren(scriptEl));
			const positioned = scriptEl.closest('span[style*="top:"]');
			const top = positioned ? getStyleTop(positioned) : null;
			const pstrutHeight = positioned ? getStyleHeight(positioned.querySelector('.pstrut')) : null;
			return { tex, top, pstrutHeight };
		}).filter((script) => script.tex);

		if (!scripts.length) return '';
		if (scripts.length === 1) {
			const belowBaseline = isScriptBelowBaseline(scripts[0]);
			if (belowBaseline !== null) return belowBaseline ? `_{${scripts[0].tex}}` : `^{${scripts[0].tex}}`;
			return isSubscriptOnly(el) ? `_{${scripts[0].tex}}` : `^{${scripts[0].tex}}`;
		}

		scripts.sort(compareScriptTop);
		return `^{${scripts[0].tex}}_{${scripts[scripts.length - 1].tex}}`;
	}

	function getStyleTop(el) {
		const match = String(el.getAttribute('style') || '').match(/top:\s*(-?\d+(?:\.\d+)?)em/);
		return match ? Number(match[1]) : null;
	}

	function getStyleHeight(el) {
		const match = String(el?.getAttribute('style') || '').match(/height:\s*(\d+(?:\.\d+)?)em/);
		return match ? Number(match[1]) : null;
	}

	function isScriptBelowBaseline(script) {
		if (script.top === null || script.pstrutHeight === null) return null;
		return script.top + script.pstrutHeight > 0;
	}

	function compareScriptTop(a, b) {
		if (a.top === null && b.top === null) return 0;
		if (a.top === null) return 1;
		if (b.top === null) return -1;
		return a.top - b.top;
	}

	function extractPositionedParts(el) {
		return Array.from(el.querySelectorAll('span[style*="top:"]')).map((partEl) => {
			const top = getStyleTop(partEl);
			if (top === null) return null;
			if (partEl.querySelector('.frac-line')) return null;
			const tex = normalizeLatexText(extractKaTeXChildren(partEl));
			if (!tex) return null;
			return { tex, top, isScript: Boolean(partEl.querySelector('.sizing')) };
		}).filter(Boolean).sort((a, b) => a.top - b.top);
	}

	function extractFrac(el) {
		const parts = extractPositionedParts(el);
		if (parts.length < 2) return null;
		return `\\frac{${parts[0].tex}}{${parts[parts.length - 1].tex}}`;
	}

	function extractXArrow(el) {
		const labels = extractPositionedParts(el).filter((part) => {
			return !/^(\\to|\\leftarrow|\\rightarrow|→|←)$/.test(part.tex);
		});
		if (!labels.length) return '\\to';
		if (labels.length === 1) return `\\xrightarrow{${labels[0].tex}}`;
		return `\\xrightarrow[${labels[labels.length - 1].tex}]{${labels[0].tex}}`;
	}

	function extractLargeOperator(el) {
		const opSymbol = el.querySelector('.op-symbol');
		if (!opSymbol) return null;

		const operator = normalizeLatexText(mapLatexSymbol(opSymbol.textContent || ''));
		if (!operator) return null;

		const scripts = Array.from(el.querySelectorAll('.sizing')).map((scriptEl) => {
			const tex = normalizeLatexText(extractKaTeXChildren(scriptEl));
			const positioned = scriptEl.closest('span[style*="top:"]');
			const top = positioned ? getStyleTop(positioned) : null;
			const pstrutHeight = positioned ? getStyleHeight(positioned.querySelector('.pstrut')) : null;
			return { tex, top, pstrutHeight };
		}).filter((script) => script.tex);

		if (!scripts.length) return operator;
		if (scripts.length === 1) {
			const belowBaseline = isScriptBelowBaseline(scripts[0]);
			if (belowBaseline !== null) {
				return belowBaseline ? `${operator}_{${scripts[0].tex}}` : `${operator}^{${scripts[0].tex}}`;
			}
			return isSubscriptOnly(el) ? `${operator}_{${scripts[0].tex}}` : `${operator}^{${scripts[0].tex}}`;
		}

		scripts.sort(compareScriptTop);
		const sup = scripts[0]?.tex;
		const sub = scripts[scripts.length - 1]?.tex;

		let output = operator;
		if (sub) output += `_{${sub}}`;
		if (sup) output += `^{${sup}}`;
		return output;
	}

	function extractBraceAnnotation(el) {
		if (!el.querySelector('svg') || el.classList.contains('sqrt') || el.querySelector('.sqrt')) return null;

		const parts = extractPositionedParts(el);
		const scripts = parts.filter((part) => part.isScript);
		const bases = parts.filter((part) => !part.isScript);
		if (!scripts.length || !bases.length) return null;

		const base = bases.reduce((best, part) => {
			return !best || part.tex.length > best.tex.length ? part : best;
		}, null);
		const script = scripts.reduce((best, part) => {
			return !best || Math.abs(part.top - base.top) > Math.abs(best.top - base.top) ? part : best;
		}, null);
		if (!base || !script) return null;

		const command = script.top > base.top ? '\\underbrace' : '\\overbrace';
		const marker = script.top > base.top ? '_' : '^';
		return `${command}{${base.tex}}${marker}{${script.tex}}`;
	}

	function extractSqrt(el, options = {}) {
		const root = el.querySelector(':scope > .root') || el.querySelector('.root');
		const radicand = normalizeLatexText(extractKaTeXChildren(el, { ...options, skipRoot: true }));
		if (!radicand) return null;

		const index = root ? normalizeLatexText(extractKaTeXChildren(root)) : '';
		return index ? `\\sqrt[${index}]{${radicand}}` : `\\sqrt{${radicand}}`;
	}

	function hasLeftBrace(el) {
		return Array.from(el.querySelectorAll('.mopen, .delimsizing, .delimcenter, svg')).some((braceEl) => {
			const text = braceEl.textContent || '';
			const className = typeof braceEl.className === 'string' ? braceEl.className : braceEl.getAttribute('class') || '';
			return text.includes('{') || className.includes('brace');
		});
	}

	function hasRightBrace(el) {
		return Array.from(el.querySelectorAll('.mclose, .delimsizing, .delimcenter, svg')).some((braceEl) => {
			const text = braceEl.textContent || '';
			const className = typeof braceEl.className === 'string' ? braceEl.className : braceEl.getAttribute('class') || '';
			return text.includes('}') || className.includes('brace');
		});
	}

	function extractTableRows(el) {
		const table = el.querySelector('.mtable');
		if (!table) return null;

		const columns = Array.from(table.children).filter((child) => {
			return Array.from(child.classList).some((className) => className.startsWith('col-align-'));
		});
		if (!columns.length) return null;

		const rowsByTop = new Map();
		columns.forEach((column, columnIndex) => {
			const cells = Array.from(column.querySelectorAll('span[style*="top:"]')).filter((cell) => {
				if (!cell.parentElement?.classList.contains('vlist') || !cell.querySelector('.pstrut')) return false;
				let ancestor = cell.parentElement;
				while (ancestor && ancestor !== column) {
					if (ancestor.matches?.('span[style*="top:"]')) return false;
					ancestor = ancestor.parentElement;
				}
				return true;
			});

			cells.forEach((cell) => {
				const top = getStyleTop(cell);
				if (top === null) return;
				const rowKey = String(top);
				const row = rowsByTop.get(rowKey) || [];
				row[columnIndex] = normalizeLatexText(extractKaTeXChildren(cell));
				rowsByTop.set(rowKey, row);
			});
		});

		const rows = Array.from(rowsByTop.entries()).sort((a, b) => Number(a[0]) - Number(b[0])).map((entry) => {
			return entry[1].map((cell) => cell || '').join(' & ');
		}).filter((row) => row.trim());

		if (!rows.length) return null;
		return rows;
	}

	function extractCases(el) {
		if (!el.querySelector('.mtable') || !hasLeftBrace(el) || hasRightBrace(el)) return null;

		const rows = extractTableRows(el);
		if (!rows) return null;
		return `\\begin{cases}\n${rows.join(' ' + '\\\\' + '\n')}\n\\end{cases}`;
	}

	function getMatrixEnvironment(el) {
		const openText = Array.from(el.querySelectorAll('.mopen, .delimsizing, .delimcenter')).map((openEl) => {
			return openEl.textContent || '';
		}).join('');
		const closeText = Array.from(el.querySelectorAll('.mclose, .delimsizing, .delimcenter')).map((closeEl) => {
			return closeEl.textContent || '';
		}).join('');

		if (openText.includes('(') && closeText.includes(')')) return 'pmatrix';
		if (openText.includes('[') && closeText.includes(']')) return 'bmatrix';
		if (openText.includes('{') && closeText.includes('}')) return 'Bmatrix';
		if (openText.includes('‖') || closeText.includes('‖')) return 'Vmatrix';
		if (openText.includes('|') || closeText.includes('|')) return 'vmatrix';
		return 'matrix';
	}

	function extractMatrix(el) {
		if (!el.querySelector('.mtable')) return null;
		if (hasLeftBrace(el) && !hasRightBrace(el)) return null;

		const rows = extractTableRows(el);
		if (!rows) return null;

		const environment = getMatrixEnvironment(el);
		return `\\begin{${environment}}\n${rows.join(' ' + '\\\\' + '\n')}\n\\end{${environment}}`;
	}

	function isSubscriptOnly(el) {
		const heights = Array.from(el.querySelectorAll('.vlist')).map((vlist) => {
			return parseFloat(vlist.style.height || '0') || 0;
		});
		if (!heights.length) return false;
		return Math.max(...heights) < 0.4;
	}

	function extractKaTeXElement(el, options = {}) {
		if (options.skipOverlay && el.classList.contains('overlay')) return '';
		if (options.skipOverlay && /^[\/∕\uE020\u0338]+$/.test(el.textContent || '')) return '';
		if (el.classList.contains('overlay')) return '';
		if (!options.skipOverlay && hasNotOverlay(el)) {
			const baseTex = normalizeLatexText(extractKaTeXChildren(el, { skipOverlay: true })).replace(/[\/∕]/g, '');
			const negated = mapNegatedLatex(baseTex);
			if (negated) return negated;
		}

		if (el.classList.contains('mspace')) return '';
		if (el.classList.contains('mop')) {
			const largeOperator = extractLargeOperator(el);
			if (largeOperator) return largeOperator;

			const operator = normalizeLatexText(extractKaTeXChildren(el));
			if (/^[A-Za-z]+$/.test(operator)) {
				return latexOperatorNames.has(operator) ? `\\${operator}` : `\\operatorname{${operator}}`;
			}
		}
		if (el.classList.contains('mfrac')) return extractFrac(el) || '';
		if (el.classList.contains('x-arrow')) return extractXArrow(el);
		if (el.classList.contains('sqrt')) return extractSqrt(el, options) || '';
		const cases = extractCases(el);
		if (cases) return cases;
		const matrix = extractMatrix(el);
		if (matrix) return matrix;
		const braceAnnotation = extractBraceAnnotation(el);
		if (braceAnnotation) return braceAnnotation;
		if (el.classList.contains('mathbb')) return `\\mathbb{${extractKaTeXChildren(el)}}`;
		if (el.classList.contains('mathcal')) return `\\mathcal{${extractKaTeXChildren(el)}}`;
		if (el.classList.contains('mathfrak')) return `\\mathfrak{${extractKaTeXChildren(el)}}`;
		if (el.classList.contains('mathbf')) return `\\mathbf{${extractKaTeXChildren(el)}}`;
		if (el.classList.contains('mathit')) return `\\mathit{${extractKaTeXChildren(el)}}`;
		if (el.classList.contains('text')) return `\\text{${escapeLatexText(el.textContent || '')}}`;
		if (el.children.length === 0) return mapLatexSymbol(el.textContent || '');

		return extractKaTeXChildren(el, options);
	}

	ns.renderedKaTeX = {
		extractRenderedKaTeXTex,
	};
})();
