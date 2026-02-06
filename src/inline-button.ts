import { setIcon, MarkdownRenderChild } from 'obsidian';
import { WidgetType } from "@codemirror/view";
import { resolveDynamicText } from './utils';
import type MyPlugin from './main';

function renderInlineButton(el: HTMLElement, content: string, plugin: MyPlugin) {
	const parts = content.split("|").map(p => p.trim());
	const type = parts[0] || "";
	const label = parts[1] || "";
	const value = parts[2] || parts[1] || "";

	const finalLabel = resolveDynamicText(plugin.app, label);
	const iconColor = parts[3] ? resolveDynamicText(plugin.app, parts[3]) : "";
	const bgColor = parts[4] ? resolveDynamicText(plugin.app, parts[4]) : "";

	el.addClass("inline-card-button");
	if (bgColor) el.style.backgroundColor = bgColor;
	const iconMap: Record<string, string> = { copy: "copy", command: "terminal", url: "external-link", open: "file-text", search: "search", create: "plus-square", js: "code-2", toggle: "check-square" };
	const iconId = iconMap[type] || "square-asterisk";
	const iconSpan = el.createEl("span", { cls: "inline-button-icon" });
	setIcon(iconSpan, iconId);
	const textSpan = el.createEl("span", { text: finalLabel || value, cls: "inline-button-text" });
	if (iconColor) { iconSpan.style.color = iconColor; textSpan.style.color = iconColor; }
	const actionString = `${type}|${value}`;
	el.onclick = (e) => { e.preventDefault(); e.stopPropagation(); plugin.handleAction(actionString); };
}

export class InlineButtonWidget extends WidgetType {
	constructor(readonly content: string, readonly plugin: MyPlugin) { super(); }
	toDOM() { const span = document.createElement("span"); renderInlineButton(span, this.content, this.plugin); return span; }
}

export class InlineButtonChild extends MarkdownRenderChild {
	constructor(containerEl: HTMLElement, public plugin: MyPlugin) { super(containerEl); }
	onload() {
		const rawText = this.containerEl.innerText.trim();
		const match = rawText.match(/^\[!(.*)!\]$/);
		if (match && match[1]) {
			this.containerEl.empty();
			this.containerEl.removeClass("cm-inline-code");
			renderInlineButton(this.containerEl, match[1], this.plugin);
		}
	}
}
