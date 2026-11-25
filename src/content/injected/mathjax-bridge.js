// Simple and secure script. Read and understand it yourself.
// This injection is necessary for using the MathJax API
// There is no other way to obtain the LaTeX code for MathJax v3 and v4.

(function() {
	if (window.__copyLatexMathJaxBridgeInjected) return;
	window.__copyLatexMathJaxBridgeInjected = true;

	function markInjected() {
		if (document.documentElement) {
			document.documentElement.dataset.copyLatexMathjaxInjected = 'true';
		}
	}
	markInjected();
	if (!document.documentElement) {
		document.addEventListener('DOMContentLoaded', markInjected, { once: true });
	}

	let nextContainerId = 1;

	function getContainerId(mjxContainer) {
		let id = mjxContainer.getAttribute('data-copy-latex-id') || mjxContainer.getAttribute('ctxtmenu_counter');
		if (!id) {
			id = `mjx-${nextContainerId++}`;
		}
		mjxContainer.setAttribute('data-copy-latex-id', id);
		return id;
	}

	function getLatexForContainer(mjxContainer) {
		const mathjax = window.MathJax;
		if (!mathjax) return null;
		const version = mathjax.version ? String(mathjax.version) : '';
		if (version && !version.startsWith('3') && !version.startsWith('4')) {
			return null;
		}

		if (mathjax.startup && mathjax.startup.document && mathjax.startup.document.math) {
			let current = mathjax.startup.document.math.list;
			const targetHTML = mjxContainer.innerHTML;
			while (current && current.data) {
				const mathItem = current.data;
				if (
					mathItem.typesetRoot &&
					(mathItem.typesetRoot === mjxContainer || mathItem.typesetRoot.innerHTML === targetHTML)
				) {
					if (mathItem.math && typeof mathItem.math === 'string') {
						return mathItem.math.trim();
					}
				}
				current = current.next;
				if (current === mathjax.startup.document.math.list) break;
			}
		}
		return null;
	}

	function publishLatexForContainer(mjxContainer) {
		const latex = getLatexForContainer(mjxContainer);
		if (!latex) return null;

		const mjxId = getContainerId(mjxContainer);
		mjxContainer.setAttribute('data-copy-latex', latex);
		window.postMessage({ type: 'CopyLaTeX_MathJaxV3', latex, mjxId }, '*');
		return latex;
	}

	function publishAllContainers(root) {
		const containers = root.querySelectorAll ? root.querySelectorAll('mjx-container') : [];
		containers.forEach((mjx) => publishLatexForContainer(mjx));
	}

	document.addEventListener('CopyLaTeX_HydrateMathJaxV3', function() {
		publishAllContainers(document);
	}, true);

	document.addEventListener('mouseover', function(e) {
		const mjx = e.target?.closest?.('mjx-container');
		if (mjx) {
			publishLatexForContainer(mjx);
		}
	}, true);

	document.addEventListener('click', function(e) {
		const mjx = e.target?.closest?.('mjx-container');
		if (mjx) {
			publishLatexForContainer(mjx);
		}
	}, true);
})();
