import { App } from 'obsidian';

/**
 * ${...} 플레이스홀더를 Dataview API로 평가한다.
 */
export function resolveDynamicText(app: App, text: string): string {
	if (!text.includes("${")) return text;

	let dv = (app as any).plugins.getPlugin("dataview")?.api;
	if (!dv) dv = (window as any).DataviewAPI;

	if (!dv) {
		console.warn("With Buttons: Dataview API not found. Please ensure Dataview is installed and enabled.");
		return text;
	}

	try {
		return text.replace(/\$\{([\s\S]*?)\}/g, (_, code) => {
			const func = new Function("dv", "app", `try { return ${code}; } catch(e) { console.error("Dynamic Eval Error:", e); return "Err"; }`);
			const result = func(dv, app);
			return String(result ?? "");
		});
	} catch (e) {
		console.error("Dynamic text evaluation failed:", e);
		return text;
	}
}

/**
 * CSS 셀렉터를 특정 scope 속성 하위로 변환한다.
 * 예: .card-item → div[data-style-xxx] .card-item
 */
export function scopeCSS(rawCSS: string, scopeSelector: string): string {
	// @media, @keyframes 등 at-rule 블록 보호: 내부 선택자만 변환
	return rawCSS.replace(/@[\w-]+[^{]*\{([\s\S]*?\})\s*\}/g, (atBlock) => {
		// at-rule 내부의 선택자만 변환
		return atBlock.replace(/([^;{}@]+)(?=\{)/g, (sel) => scopeSelectors(sel, scopeSelector));
	}).replace(/(?<!@[\w-][^{]*)([^;{}@]+)(?=\{)/g, (sel) => {
		// at-rule 밖의 일반 선택자 변환
		return scopeSelectors(sel, scopeSelector);
	});
}

function scopeSelectors(selectors: string, scopeSelector: string): string {
	return selectors.split(",").map(selector => {
		const trimmed = selector.trim();
		if (!trimmed || trimmed.startsWith("@")) return trimmed;
		if (trimmed.includes(".card-buttons-container")) {
			return trimmed.replace(".card-buttons-container", scopeSelector);
		}
		return `${scopeSelector} ${trimmed}`;
	}).join(", ");
}
