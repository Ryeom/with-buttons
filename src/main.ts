import {
	Plugin, TFile, Notice, setIcon,
	MarkdownRenderChild, App
} from 'obsidian';
import {
	ViewUpdate, ViewPlugin, DecorationSet, Decoration,
	EditorView, WidgetType
} from "@codemirror/view";
import { DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab } from "./settings";
import FileSuggest from './file-suggest';
import ActionSuggest from './action-suggest';
import SettingSuggest from 'setting-suggest';

interface CardData {
	title?: string;
	desc?: string;
	picture?: string;
	action?: string;
	color?: string;
	textColor?: string;
	if?: string;
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();
		this.registerEditorSuggest(new FileSuggest(this.app));
		this.registerEditorSuggest(new ActionSuggest(this.app));
		this.registerEditorSuggest(new SettingSuggest(this.app));
		this.registerEditorExtension(this.buildLivePreviewPlugin());

		this.registerMarkdownPostProcessor((el, ctx) => {
			const codes = el.querySelectorAll("code");
			codes.forEach((codeEl) => {
				const text = codeEl.innerText.trim();
				if (text.startsWith("[!") && text.endsWith("!]")) {
					ctx.addChild(new InlineButtonChild(codeEl as HTMLElement, this));
				}
			});
		});

		this.registerMarkdownCodeBlockProcessor("card-buttons", (source, el, ctx) => {
			const child = new CardBlockRenderer(el, source, this);
			ctx.addChild(child);
		});
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	async handleAction(actionString: string) {
		console.log("With Buttons: Handling action:", actionString);
		const parts = actionString.split("|").map(s => s.trim());
		const type = parts[0];
		if (!type) return;

		const val1 = parts[1] ?? "";
		const val2 = parts[2] ?? val1;

		switch (type) {
			case "url":
				if (!val1) return;
				const mobileScheme = parts[2];
				const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
				const finalDesktopUrl = val1.startsWith("http") ? val1 : `https://${val1}`;
				if (isMobileDevice && mobileScheme) {
					let appOpened = false;
					const onVisibilityChange = () => { if (document.visibilityState === "hidden") appOpened = true; };
					document.addEventListener("visibilitychange", onVisibilityChange, { once: true });
					window.location.href = mobileScheme;
					setTimeout(() => {
						document.removeEventListener("visibilitychange", onVisibilityChange);
						if (!appOpened) window.open(finalDesktopUrl);
					}, 500);
				} else { window.open(finalDesktopUrl); }
				break;
			case "copy":
				if (!val2) return;
				await navigator.clipboard.writeText(val2);
				new Notice(`복사되었습니다: ${val2}`);
				break;
			case "command":
				if (!val2) return;
				const success = (this.app as any).commands.executeCommandById(val2);
				if (!success) {
					new Notice(`명령어 실행 실패: '${val2}' ID를 확인해주세요.`);
					console.warn(`With Buttons: Command '${val2}' not found.`);
				}
				break;
			case "open":
				if (!val2) return;
				await this.app.workspace.openLinkText(val2, "", true);
				break;
			case "search":
				if (!val2) return;
				const searchPlugin = (this.app as any).internalPlugins.getPluginById("global-search");
				if (searchPlugin) searchPlugin.instance.openGlobalSearch(val2);
				break;
			case "create":
				if (!val1) return;
				const rawArgs = parts.slice(2).join("|");
				this.createNewFileFromTemplate(val1, rawArgs);
				break;
			case "js":
				if (!val2) return;
				try {
					const obsidian = require('obsidian');
					new Function('app', 'Notice', 'obsidian', val2)(this.app, Notice, obsidian);
				} catch (e) {
					new Notice("JS 실행 오류 (콘솔 확인)");
					console.error("JS Action Error:", e);
				}
				break;
			case "toggle":
				const prop = val1;
				if (!prop) return;
				const file = val2 && val2 !== prop ? this.app.metadataCache.getFirstLinkpathDest(val2, "") : this.app.workspace.getActiveFile();
				if (file instanceof TFile) {
					this.app.fileManager.processFrontMatter(file, (fm) => {
						const cur = fm[prop];
						fm[prop] = cur === true ? false : true; // Toggle logic (undefined/null becomes true)
					});
				} else {
					new Notice("파일을 찾을 수 없습니다.");
				}
				break;
			default:
				new Notice(`알 수 없는 액션: ${type}`);
		}
	}
	async createNewFileFromTemplate(tPath: string, rawArgs: string = "") {
		try {
			const tFile = this.app.metadataCache.getFirstLinkpathDest(tPath, "");
			if (!tFile || !(tFile instanceof TFile)) {
				new Notice("템플릿 탐색 실패");
				return;
			}
			let content = await this.app.vault.read(tFile);

			let newProps: any = {};
			if (rawArgs.trim().startsWith("{")) {
				try {
					newProps = JSON.parse(rawArgs);
				} catch {
					new Notice("JSON 형식 오류");
					return;
				}
			} else if (rawArgs.trim().length > 0) {
				newProps = { tags: rawArgs.split(",").map(t => t.trim()) };
			}

			if (Object.keys(newProps).length > 0) content = this.mergeYaml(content, newProps);

			const now = new Date();
			const dateStr = `${now.getFullYear()}년 ${String(now.getMonth() + 1).padStart(2, '0')}월 ${String(now.getDate()).padStart(2, '0')}일`;
			const timeStr = `${String(now.getHours()).padStart(2, '0')}시 ${String(now.getMinutes()).padStart(2, '0')}분 ${String(now.getSeconds()).padStart(2, '0')}초 생성`;
			let base = `무제 ${dateStr} ${timeStr}`;
			let finalPath = `${base}.md`;
			let counter = 1;
			while (await this.app.vault.adapter.exists(finalPath)) finalPath = `${base} (${counter++}).md`;

			const nFile = await this.app.vault.create(finalPath, content);
			await this.app.workspace.getLeaf('tab').openFile(nFile);
			new Notice("병합 완료");
		} catch {
			new Notice("생성 실패");
		}
	}

	private mergeYaml(content: string, props: any) {
		if (content.startsWith("---")) {
			const parts = content.split("---");
			const yamlPart = parts[1];
			if (yamlPart && parts.length >= 3) {
				let yamlLines = yamlPart.split("\n").filter(l => l.trim() !== "");
				for (const [key, value] of Object.entries(props)) {
					const idx = yamlLines.findIndex(l => l.trim().startsWith(`${key}:`));
					if (idx !== -1) {
						if (Array.isArray(value)) yamlLines.splice(idx + 1, 0, ...value.map(v => `  - ${v}`));
						else yamlLines[idx] = `${key}: ${value}`;
					} else {
						if (Array.isArray(value)) { yamlLines.push(`${key}:`); yamlLines.push(...value.map(v => `  - ${v}`)); }
						else yamlLines.push(`${key}: ${value}`);
					}
				}
				parts[1] = "\n" + yamlLines.join("\n") + "\n";
				return parts.join("---");
			}
		} else {
			let newYaml = "---\n";
			for (const [key, value] of Object.entries(props)) {
				if (Array.isArray(value)) newYaml += `${key}:\n${value.map(v => `  - ${v}`).join("\n")}\n`;
				else newYaml += `${key}: ${value}\n`;
			}
			return newYaml + "---\n\n" + content;
		}
		return content;
	}

	buildLivePreviewPlugin() {
		const plugin = this;
		return ViewPlugin.fromClass(class {
			decorations: DecorationSet;
			constructor(view: EditorView) { this.decorations = this.buildDecorations(view); }
			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged || update.selectionSet) {
					this.decorations = this.buildDecorations(update.view);
				}
			}
			buildDecorations(view: EditorView) {
				const decorations: any[] = [];
				const regex = /`\[!(.*?)!\]`/g;
				const text = view.state.doc.toString();
				const selection = view.state.selection.main;
				let match;
				while ((match = regex.exec(text)) !== null) {
					const start = match.index;
					const end = start + match[0].length;
					if (selection.from >= start && selection.to <= end) continue;
					const content = match[1];
					if (content) {
						decorations.push(Decoration.replace({ widget: new InlineButtonWidget(content, plugin) }).range(start, end));
					}
				}
				return Decoration.set(decorations, true);
			}
		}, { decorations: v => v.decorations });
	}

	resolveImagePath(p: string) {
		const f = this.app.metadataCache.getFirstLinkpathDest(p, "");
		return f instanceof TFile ? this.app.vault.adapter.getResourcePath(f.path) : (p.startsWith("http") ? p : "");
	}

	parseSection(s: string) {
		const r: any = {};
		s.split("\n").forEach(l => {
			const i = l.indexOf(":");
			if (i !== -1) r[l.substring(0, i).trim()] = l.substring(i + 1).trim();
		});
		return r as CardData;
	}

	async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
	async saveSettings() { await this.saveData(this.settings); }
}

/**
 * Evaluates a string containing ${...} placeholders using the Dataview API.
 */
function resolveDynamicText(app: App, text: string): string {
	if (!text.includes("${")) return text;

	// Get Dataview API (Try plugin manager first, then global window object)
	let dv = (app as any).plugins.getPlugin("dataview")?.api;
	if (!dv) {
		dv = (window as any).DataviewAPI;
	}

	if (!dv) {
		console.warn("With Buttons: Dataview API not found. Please ensure Dataview is installed and enabled.");
		return text;
	}

	try {
		// Replace ${code} with the evaluated result
		return text.replace(/\$\{([\s\S]*?)\}/g, (_, code) => {
			// Create a function with 'dv' and 'app' in scope
			const func = new Function("dv", "app", `try { return ${code}; } catch(e) { console.error("Dynamic Eval Error:", e); return "Err"; }`);
			const result = func(dv, app);
			return String(result ?? "");
		});
	} catch (e) {
		console.error("Dynamic text evaluation failed:", e);
		return text;
	}
}

function renderInlineButton(el: HTMLElement, content: string, plugin: MyPlugin) {
	const parts = content.split("|").map(p => p.trim());
	const type = parts[0] || "";
	const label = parts[1] || "";
	const value = parts[2] || parts[1] || "";

	// Resolve dynamic text for Label
	const finalLabel = resolveDynamicText(plugin.app, label);

	// Resolve dynamic colors
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

class InlineButtonWidget extends WidgetType {
	constructor(readonly content: string, readonly plugin: MyPlugin) { super(); }
	toDOM() { const span = document.createElement("span"); renderInlineButton(span, this.content, this.plugin); return span; }
}

class InlineButtonChild extends MarkdownRenderChild {
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
class CardBlockRenderer extends MarkdownRenderChild {
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
		// modify는 동적 텍스트(${...})를 사용하는 카드만 반응
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

					// Scoped CSS Injection (No more forced !important)
					// .card-item -> div[data-style-id] .card-item
					const scopedCSS = fullCSS.replace(/([^;{}]+)(?=\{)/g, (selectors) => {
						return selectors.split(",").map(selector => {
							const trimmed = selector.trim();
							if (trimmed.includes(".card-buttons-container")) {
								return trimmed.replace(".card-buttons-container", `div[${scopeAttr}]`);
							}
							return `div[${scopeAttr}] ${trimmed}`;
						}).join(", ");
					});

					styleTag.textContent = scopedCSS;
				}
			});
		}

		container.style.display = "grid";
		container.style.gridTemplateColumns = `repeat(${cardSections.length || 1}, 1fr)`;
		container.style.gap = "10px";

		cardSections.forEach((section) => {
			const data = this.plugin.parseSection(section);

			// Resolve Dynamic Text
			if (data.title) data.title = resolveDynamicText(this.plugin.app, data.title);
			if (data.desc) data.desc = resolveDynamicText(this.plugin.app, data.desc);
			if (data.action) data.action = resolveDynamicText(this.plugin.app, data.action);

			const rawIf = data.if ? resolveDynamicText(this.plugin.app, data.if) : "true";
			if (rawIf === "false" || rawIf === "null" || rawIf === "undefined") return;

			// Resolve Color from Palette or Raw
			let rawColor = data.color ? resolveDynamicText(this.plugin.app, data.color) : "";
			const paletteColor = this.plugin.settings.palettes[rawColor];
			if (paletteColor) rawColor = paletteColor;

			let rawTextColor = data.textColor ? resolveDynamicText(this.plugin.app, data.textColor) : "";
			const paletteTextColor = this.plugin.settings.palettes[rawTextColor];
			if (paletteTextColor) rawTextColor = paletteTextColor;

			const cardEl = container.createEl("div", { cls: "card-item" });

			// Apply Dynamic Colors
			if (rawColor) cardEl.style.backgroundColor = rawColor;
			if (rawTextColor) {
				cardEl.style.color = rawTextColor;
			} else if (rawColor) {
				// Simple Auto-contrast
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
