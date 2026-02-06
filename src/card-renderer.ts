import { MarkdownRenderChild } from 'obsidian';
import { resolveDynamicText, scopeCSS } from './utils';
import type MyPlugin from './main';

export interface CardData {
	title?: string;
	desc?: string;
	picture?: string;
	action?: string;
	color?: string;
	textColor?: string;
	if?: string;
}

export class CardBlockRenderer extends MarkdownRenderChild {
	private injectedStyleTags: HTMLStyleElement[] = [];
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(containerEl: HTMLElement, private source: string, private plugin: MyPlugin) {
		super(containerEl);
	}

	onload() {
		this.render();
		const debouncedRender = () => {
			if (this.debounceTimer) clearTimeout(this.debounceTimer);
			this.debounceTimer = setTimeout(() => this.render(), 100);
		};
		this.registerEvent(this.plugin.app.vault.on("create", debouncedRender));
		this.registerEvent(this.plugin.app.vault.on("delete", debouncedRender));
		this.registerEvent(this.plugin.app.vault.on("rename", debouncedRender));
		if (this.source.includes("${")) {
			this.registerEvent(this.plugin.app.vault.on("modify", debouncedRender));
		}
	}

	onunload() {
		this.injectedStyleTags.forEach(tag => tag.remove());
		this.injectedStyleTags = [];
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
	}

	render() {
		this.containerEl.empty();
		this.injectedStyleTags.forEach(tag => tag.remove());
		this.injectedStyleTags = [];
		const el = this.containerEl;
		const parts = this.source.split("[card]");
		const firstPart = parts[0] || "";
		const settingSource = firstPart.includes("[setting]") ? firstPart.replace("[setting]", "").trim() : "";
		const cardSections = parts.slice(1).map(s => s.trim()).filter(s => s !== "");

		let localRatio = "1 / 1";
		let titleSize = "14px";
		let descSize = "11px";
		let styleId = "";
		let imgRatioStr = "60";
		let direction = "vertical";

		if (settingSource) {
			settingSource.split("\n").forEach(line => {
				const separator = line.includes("|") ? "|" : ":";
				if (!line.includes(separator)) return;
				const segments = line.split(separator).map(s => s.trim());
				if (segments.length >= 2) {
					const key = segments[0]?.toLowerCase();
					const value = segments[1] || "";
					if (key === "ratio") localRatio = value.replace(/\s/g, "").replace(":", " / ");
					if (key === "title-size") titleSize = value.endsWith("px") ? value : `${value}px`;
					if (key === "desc-size") descSize = value.endsWith("px") ? value : `${value}px`;
					if (key === "style") styleId = value;
					if (key === "img-ratio") imgRatioStr = value.replace("%", "");
					if (key === "direction") direction = value.toLowerCase();
				}
			});
		}

		const rawRatio = parseInt(imgRatioStr);
		const imgRatio = isNaN(rawRatio) ? 60 : Math.min(Math.max(rawRatio, 0), 100);

		const container = el.createEl("div", { cls: "card-buttons-container" });

		if (styleId) {
			const ids = styleId.split(/\s+/);
			ids.forEach(id => {
				const fullCSS = this.plugin.settings.customStyles[id];
				if (fullCSS) {
					const scopeAttr = `data-style-${id}`;
					container.setAttribute(scopeAttr, "");
					const styleTag = document.head.createEl("style", { attr: { id: `style-tag-${id}` } });
					this.injectedStyleTags.push(styleTag);
					styleTag.textContent = scopeCSS(fullCSS, `div[${scopeAttr}]`);
				}
			});
		}

		container.style.display = "grid";
		container.style.gridTemplateColumns = `repeat(${cardSections.length || 1}, 1fr)`;
		container.style.gap = "10px";

		cardSections.forEach((section) => {
			const data = this.plugin.parseSection(section);

			if (data.title) data.title = resolveDynamicText(this.plugin.app, data.title);
			if (data.desc) data.desc = resolveDynamicText(this.plugin.app, data.desc);
			if (data.action) data.action = resolveDynamicText(this.plugin.app, data.action);

			const rawIf = data.if ? resolveDynamicText(this.plugin.app, data.if) : "true";
			if (rawIf === "false" || rawIf === "null" || rawIf === "undefined") return;

			let rawColor = data.color ? resolveDynamicText(this.plugin.app, data.color) : "";
			const paletteColor = this.plugin.settings.palettes[rawColor];
			if (paletteColor) rawColor = paletteColor;

			let rawTextColor = data.textColor ? resolveDynamicText(this.plugin.app, data.textColor) : "";
			const paletteTextColor = this.plugin.settings.palettes[rawTextColor];
			if (paletteTextColor) rawTextColor = paletteTextColor;

			const cardEl = container.createEl("div", { cls: "card-item" });

			if (rawColor) cardEl.style.backgroundColor = rawColor;
			if (rawTextColor) {
				cardEl.style.color = rawTextColor;
			} else if (rawColor) {
				if (rawColor === "red" || rawColor.startsWith("#ff0000") || rawColor === "#f00") cardEl.style.color = "white";
			}

			const isVertical = direction === "vertical";
			cardEl.style.display = "flex";
			cardEl.style.flexDirection = isVertical ? "column" : "row";
			cardEl.style.setProperty("aspect-ratio", localRatio, "important");
			cardEl.style.overflow = "hidden";

			cardEl.addEventListener('mouseenter', () => { cardEl.style.zIndex = "100"; });
			cardEl.addEventListener('mouseleave', () => { cardEl.style.zIndex = "1"; });

			const rawPic = data.picture || "";
			const isOnlyImage = rawPic.includes("|only");
			const picPath = isOnlyImage ? rawPic.split("|only")[0]?.trim() : rawPic.trim();

			if (picPath) {
				const res = this.plugin.resolveImagePath(picPath);
				if (res) {
					const imgDiv = cardEl.createEl("div", { cls: isOnlyImage ? "card-img-container is-only-image" : "card-img-container" });
					imgDiv.style.flexShrink = "0";

					if (isVertical) {
						imgDiv.style.width = "100%";
						imgDiv.style.height = isOnlyImage ? "100%" : `${imgRatio}%`;
					} else {
						imgDiv.style.width = isOnlyImage ? "100%" : `${imgRatio}%`;
						imgDiv.style.height = "100%";
					}

					imgDiv.style.position = "relative";
					imgDiv.createEl("img", { attr: { src: res }, cls: "card-img" });
					const overlay = imgDiv.createEl("div", { cls: "card-img-overlay" });
					overlay.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 5;";
				}
			}

			if (!isOnlyImage) {
				const infoEl = cardEl.createEl("div", { cls: "card-info" });
				infoEl.style.display = "flex";
				infoEl.style.flexDirection = "column";
				infoEl.style.flexGrow = "1";

				if (isVertical) {
					infoEl.style.width = "100%";
					infoEl.style.height = `${100 - imgRatio}%`;
				} else {
					infoEl.style.width = `${100 - imgRatio}%`;
					infoEl.style.height = "100%";
				}

				if (data.title) {
					const tEl = infoEl.createEl("div", { text: data.title, cls: "card-title" });
					tEl.style.fontSize = titleSize; tEl.style.lineHeight = "1.2"; tEl.style.marginBottom = "2px";
				}
				if (data.desc) {
					const dEl = infoEl.createEl("p", { text: data.desc, cls: "card-desc" });
					dEl.style.fontSize = descSize; dEl.style.lineHeight = "1.2"; dEl.style.margin = "0";
				}
			}

			if (data.action) {
				cardEl.addClass("is-clickable");
				cardEl.onClickEvent(() => this.plugin.handleAction(data.action!));
			}
		});
	}
}
