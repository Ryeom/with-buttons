import { MarkdownRenderChild, setIcon } from 'obsidian';
import { resolveDynamicText, scopeCSS } from './utils';
import type WithButtonsPlugin from './main';

export interface CardData {
	title?: string;
	desc?: string;
	picture?: string;
	icon?: string;
	action?: string;
	color?: string;
	textColor?: string;
	if?: string;
}

export class CardBlockRenderer extends MarkdownRenderChild {
	private activeStyleIds: string[] = [];
	readonly hasDynamicText: boolean;

	constructor(containerEl: HTMLElement, private source: string, private plugin: WithButtonsPlugin) {
		super(containerEl);
		this.hasDynamicText = source.includes("${");
	}

	onload() {
		this.plugin.registerCardRenderer(this);
		this.render();
	}

	onunload() {
		this.plugin.unregisterCardRenderer(this);
		this.releaseStyles();
	}

	private releaseStyles() {
		this.activeStyleIds.forEach(id => this.plugin.releaseStyleTag(id));
		this.activeStyleIds = [];
	}

	render() {
		this.containerEl.empty();
		this.releaseStyles();
		const el = this.containerEl;
		const parts = this.source.split("[card]");
		const firstPart = parts[0] || "";
		const settingSource = firstPart.includes("[setting]") ? firstPart.replace("[setting]", "").trim() : "";
		const cardSections = parts.slice(1).map(s => s.trim()).filter(s => s !== "");

		let localRatio = "";
		let titleSize = "";
		let descSize = "";
		let styleId = "";
		let imgRatioStr = "";
		let direction = "";
		let columns = "";

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
					if (key === "columns") columns = value;
				}
			});
		}

		const container = el.createEl("div", { cls: "card-buttons-container" });

		// CSS 변수 주입 (사용자 설정값이 있을 때만 기본값 오버라이드)
		const colCount = columns ? parseInt(columns) || cardSections.length : cardSections.length;
		container.style.setProperty("--card-columns", String(colCount || 1));
		if (localRatio) container.style.setProperty("--card-ratio", localRatio);
		if (titleSize) container.style.setProperty("--title-size", titleSize);
		if (descSize) container.style.setProperty("--desc-size", descSize);

		const rawRatio = imgRatioStr ? parseInt(imgRatioStr) : 60;
		const imgRatio = isNaN(rawRatio) ? 60 : Math.min(Math.max(rawRatio, 0), 100);

		// data-direction 속성으로 레이아웃 분기
		if (direction === "horizontal") {
			container.setAttribute("data-direction", "horizontal");
		}

		// 커스텀 스타일 주입
		if (styleId) {
			const ids = styleId.split(/\s+/);
			ids.forEach(id => {
				const fullCSS = this.plugin.settings.customStyles[id];
				if (fullCSS) {
					const scopeAttr = `data-style-${id}`;
					container.setAttribute(scopeAttr, "");
					const styleTag = this.plugin.acquireStyleTag(id);
					this.activeStyleIds.push(id);
					styleTag.textContent = scopeCSS(fullCSS, `div[${scopeAttr}]`);
				}
			});
		}

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

			// 동적 색상만 인라인으로 유지
			if (rawColor) cardEl.style.backgroundColor = rawColor;
			if (rawTextColor) {
				cardEl.style.color = rawTextColor;
			} else if (rawColor) {
				if (rawColor === "red" || rawColor.startsWith("#ff0000") || rawColor === "#f00") cardEl.style.color = "white";
			}

			const rawPic = data.picture || "";
			const isOnlyImage = rawPic.includes("|only");
			const picPath = isOnlyImage ? rawPic.split("|only")[0]?.trim() : rawPic.trim();
			const iconId = data.icon?.trim() || "";
			let visualRendered = false;

			if (picPath) {
				const res = this.plugin.resolveImagePath(picPath);
				if (res) {
					const imgDiv = cardEl.createEl("div", { cls: isOnlyImage ? "card-img-container is-only-image" : "card-img-container" });
					// aspect-ratio 안에서 %가 안 먹히므로 flex-grow 비율로 분배
					if (!isOnlyImage) imgDiv.style.flex = `${imgRatio} 0 0`;
					imgDiv.createEl("img", { attr: { src: res }, cls: "card-img" });
					imgDiv.createEl("div", { cls: "card-img-overlay" });
					visualRendered = true;
				}
			} else if (iconId && !isOnlyImage) {
				const iconDiv = cardEl.createEl("div", { cls: "card-icon-container" });
				iconDiv.style.flex = `${imgRatio} 0 0`;
				setIcon(iconDiv, iconId);
				visualRendered = true;
			}

			if (!isOnlyImage) {
				const infoEl = cardEl.createEl("div", { cls: "card-info" });
				if (visualRendered) infoEl.style.flex = `${100 - imgRatio} 0 0`;
				if (data.title) infoEl.createEl("div", { text: data.title, cls: "card-title" });
				if (data.desc) infoEl.createEl("p", { text: data.desc, cls: "card-desc" });
			}

			if (data.action) {
				cardEl.addClass("is-clickable");
				cardEl.onClickEvent(() => this.plugin.handleAction(data.action!));
			}
		});
	}
}
