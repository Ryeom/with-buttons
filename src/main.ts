import { App, Editor, MarkdownView, Modal, Notice, Plugin, TFile, WorkspaceLeaf, setIcon, MarkdownRenderChild, MarkdownPostProcessorContext } from "obsidian";
import {
	ViewUpdate, ViewPlugin, DecorationSet, Decoration,
	EditorView, WidgetType
} from "@codemirror/view";
import { renderCardButton } from "./renderer";
import { DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab } from "./settings";
import { actionRegistry } from "./actions/ActionHandler";
import FileSuggest from './file-suggest';
import ActionSuggest from './action-suggest';
import SettingSuggest from 'setting-suggest';
import { CardWizardModal } from "./ui/wizard/WizardModal";

interface CardData {
	title?: string;
	desc?: string;
	icon?: string;
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

		// Button Wizard Command
		this.addCommand({
			id: 'insert-card-buttons',
			name: '버튼 생성 마법사 (Insert Card Buttons)',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new CardWizardModal(this.app, this, (result) => {
					editor.replaceSelection(result);
				}).open();
			}
		});

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
			const child = new CardBlockRenderer(el, source, this, ctx);
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

		// Strategy Pattern Execution
		const strategy = actionRegistry.get(type);
		if (strategy) {
			let param = val2;
			let arg1: string | undefined = undefined;

			if (type === "url") {
				param = val1;
				arg1 = parts[2];
			} else if (type === "create") {
				param = val1;
				arg1 = parts.slice(2).join("|");
			} else if (type === "toggle") {
				param = val1;
				arg1 = val2;
			}

			await strategy.execute(this.app, param, arg1);
		} else {
			console.warn(`With Buttons: Action '${type}' not supported.`);
			// new Notice(`알 수 없는 액션: ${type}`); // Optional: Silent fail or notify
		}
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
	el.onclick = (e) => { e.preventDefault(); e.stopPropagation(); plugin.handleAction(content); };
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
	constructor(containerEl: HTMLElement, private source: string, private plugin: MyPlugin, private ctx: MarkdownPostProcessorContext) {
		super(containerEl);
	}

	onload() {
		this.render();
		// Register vault events to trigger re-render
		// Debounce render to allow Vault cache to update
		const debouncedRender = () => setTimeout(() => this.render(), 100);
		this.registerEvent(this.plugin.app.vault.on("create", debouncedRender));
		this.registerEvent(this.plugin.app.vault.on("delete", debouncedRender));
		this.registerEvent(this.plugin.app.vault.on("rename", debouncedRender));
		this.registerEvent(this.plugin.app.vault.on("modify", debouncedRender));
	}

	render() {
		this.containerEl.empty();
		const el = this.containerEl;
		el.style.position = "relative"; // For edit button positioning

		// Add Edit Button
		// Only show if we are in a Markdown Source View (Live Preview) to avoid clutter in Reading Mode (which might be desired, but user asked for "Edit Mode only")
		// However, determining exact mode from renderer is tricky. 
		// We will infer it by checking if we can find an editor for this view.
		// Also user requested "Bottom Right".

		const editBtn = el.createEl("div", { cls: "card-buttons-edit" });
		editBtn.style.position = "absolute";
		editBtn.style.bottom = "5px"; editBtn.style.right = "5px"; // Bottom Right
		editBtn.style.top = "auto";
		editBtn.style.zIndex = "20";
		editBtn.style.cursor = "pointer";
		editBtn.style.opacity = "0";
		editBtn.style.transition = "opacity 0.2s";
		setIcon(editBtn, "pencil");
		editBtn.style.background = "var(--background-primary)";
		editBtn.style.padding = "4px";
		editBtn.style.borderRadius = "4px";
		editBtn.style.border = "1px solid var(--background-modifier-border)";
		editBtn.style.display = "none"; // Hidden by default

		// Show only on hover AND if in source mode (we'll check parent class)
		// Actually, just standard hover, but we ensure it's hidden if not appropriate via CSS or JS check
		// User said "only in edit mode".
		// Let's use a simple check: if the container is inside .markdown-source-view
		// We do this check on mouseenter to be sure of current state
		el.addEventListener("mouseenter", () => {
			if (el.closest(".markdown-source-view")) {
				editBtn.style.display = "block";
				setTimeout(() => editBtn.style.opacity = "1", 10);
			}
		});
		el.addEventListener("mouseleave", () => {
			editBtn.style.opacity = "0";
			setTimeout(() => editBtn.style.display = "none", 200);
		});

		// Edit Button Logic
		editBtn.onclick = (e) => {
			e.stopPropagation();
			const modal = new CardWizardModal(this.plugin.app, this.plugin, (newCode) => {
				const sectionInfo = this.ctx.getSectionInfo(this.containerEl);
				if (sectionInfo) {
					const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
					if (view) {
						const editor = view.editor;

						// V3.7.2 Fix: Do NOT strip wrappers. generateCode returns the full block, and replacing the range covers the full block.
						const from = { line: sectionInfo.lineStart, ch: 0 };
						const to = { line: sectionInfo.lineEnd, ch: editor.getLine(sectionInfo.lineEnd).length };
						editor.replaceRange(newCode, from, to);
					}
				}
			});
			modal.importFromSource(this.source);
			modal.open();
		};


		const parts = this.source.split("[card]");
		const firstPart = parts[0] || "";
		const settingSource = firstPart.includes("[setting]") ? firstPart.replace("[setting]", "").trim() : "";
		const cardSections = parts.slice(1).map(s => s.trim()).filter(s => s !== "");

		let localRatio = "1 / 1";
		let titleSize = "14px";
		let descSize = "11px";
		let styleId = "";
		let imgRatioStr = "60";
		let direction = "top"; // Default to Top (Column)
		let gridStr = "";
		let textLayout: "vertical" | "horizontal" = "vertical";
		// Title/Desc Size vars are already declared above (or should be declared once)

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
					if (key === "grid") gridStr = value;
					if (key === "direction") {
						const val = value.toLowerCase();
						direction = (val === "vertical") ? "top" : val;
					}
					if (key === "textlayout") {
						const val = value.toLowerCase();
						textLayout = (val === "horizontal") ? "horizontal" : "vertical";
					}
					if (key === "titlesize") titleSize = value;
					if (key === "descsize") descSize = value;
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
					const oldTag = document.getElementById(`style-tag-${id}`);
					if (oldTag) oldTag.remove();

					const styleTag = document.head.createEl("style", { attr: { id: `style-tag-${id}` } });

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

		// V3.9: Robust Grid Layout
		container.style.display = "grid";

		// Parse Grid (NxM or N*M)
		// N = Rows (primary for limit), M = Cols (primary for layout)
		let cols = 0;
		if (gridStr) {
			const match = gridStr.match(/(\d+)[\*xX](\d+)/);
			if (match && match[1]) {
				cols = parseInt(match[1]); // N is Columns
			}
		}

		if (cols > 0) {
			// Fixed Columns (M)
			// minmax(0, 1fr) ensures proper resizing even with content
			container.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
		} else {
			// Default Auto-Fill
			container.style.gridTemplateColumns = `repeat(auto-fill, minmax(200px, 1fr))`;
		}

		container.style.gridAutoRows = "minmax(min-content, max-content)";
		container.style.gap = "20px";
		container.style.alignItems = "start";
		container.style.padding = "20px"; // V3.9.1 Fix: Prevent shadow clipping

		cardSections.forEach((section) => {
			const data = this.plugin.parseSection(section);

			// Resolve Dynamic Text
			if (data.title) data.title = resolveDynamicText(this.plugin.app, data.title);
			if (data.desc) data.desc = resolveDynamicText(this.plugin.app, data.desc);
			if (data.action) data.action = resolveDynamicText(this.plugin.app, data.action);

			const rawColor = data.color ? resolveDynamicText(this.plugin.app, data.color) : "";
			const rawTextColor = data.textColor ? resolveDynamicText(this.plugin.app, data.textColor) : "";

			const rawIf = data.if ? resolveDynamicText(this.plugin.app, data.if) : "true";
			if (rawIf === "false" || rawIf === "null" || rawIf === "undefined") return;

			// V3.9: Use Shared Renderer
			const layoutConfig = {
				styleId: styleId,
				direction: direction as any,
				imgRatio: imgRatio,
				ratio: localRatio,
				textLayout: textLayout,
				titleSize: titleSize,
				descSize: descSize,
				palettes: this.plugin.settings.palettes
			};

			const btnConfig = {
				title: data.title || "",
				desc: data.desc || "",
				icon: data.icon || "",
				color: rawColor, // Use processed color
				picture: data.picture || "",
				action: data.action || "",
				actionType: "command"
			};

			const cardEl = renderCardButton(
				btnConfig,
				container,
				layoutConfig,
				this.plugin.app,
				{
					onClick: data.action ? () => this.plugin.handleAction(data.action!) : undefined
				}
			);

			// Apply Text Color Override
			if (rawTextColor) cardEl.querySelector(".card-info")?.setAttribute("style", `color: ${rawTextColor} !important`);

			// Mouse Events for Z-Index (Preserve)
			cardEl.addEventListener('mouseenter', () => { cardEl.style.zIndex = "100"; });
			cardEl.addEventListener('mouseleave', () => { cardEl.style.zIndex = "1"; });

		});
	}
}
