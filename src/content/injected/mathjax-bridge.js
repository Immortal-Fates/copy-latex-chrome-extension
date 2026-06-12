// Simple and secure script. Read and understand it yourself.
// This injection is necessary for using the MathJax API
// There is no other way to obtain the LaTeX code for MathJax v3 and v4.

(function() {
	var mathjax = window.MathJax;
	var version = mathjax && mathjax.version ? mathjax.version : null;
	if (!mathjax || !(version && (version.startsWith('3') || version.startsWith('4')))) {
		return;
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
		if (typeof MathJax !== 'undefined' && MathJax.startup && MathJax.startup.document && MathJax.startup.document.math) {
			let current = MathJax.startup.document.math.list;
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
				if (current === MathJax.startup.document.math.list) break;
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

	publishAllContainers(document);

	document.addEventListener('CopyLaTeX_HydrateMathJaxV3', function() {
		publishAllContainers(document);
	}, true);

	const observer = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			mutation.addedNodes.forEach((node) => {
				if (!(node instanceof Element)) return;
				if (node.matches('mjx-container')) publishLatexForContainer(node);
				publishAllContainers(node);
			});
		});
	});
	observer.observe(document.documentElement, { childList: true, subtree: true });

	document.addEventListener('mouseover', function(e) {
		const mjx = e.target.closest('mjx-container');
		if (mjx) {
			publishLatexForContainer(mjx);
		}
	}, true);

	document.addEventListener('click', function(e) {
		const mjx = e.target.closest('mjx-container');
		if (mjx) {
			publishLatexForContainer(mjx);
		}
	}, true);
})();
