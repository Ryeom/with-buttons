import {
	App, Plugin, TFile, Notice, setIcon,
	MarkdownPostProcessorContext, MarkdownRenderChild
} from 'obsidian';
import {
	ViewUpdate, ViewPlugin, DecorationSet, Decoration,
	EditorView, WidgetType
} from "@codemirror/view";
import { DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab } from "./settings";

interface CardData {
	title?: string;
	desc?: string;
	icon?: string;
	picture?: string;
	action?: string;
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// [1] 편집 모드(Live Preview) 확장 등록
		this.registerEditorExtension(this.buildLivePreviewPlugin());

		// [2] 읽기 모드 프로세서 등록
		this.registerMarkdownPostProcessor((el, ctx) => {
			const codes = el.querySelectorAll("code");
			codes.forEach((codeEl) => {
				const text = codeEl.innerText.trim();
				if (text.startsWith("[!") && text.endsWith("!]")) {
					ctx.addChild(new InlineButtonChild(codeEl as HTMLElement, this));
				}
			});
		});

		// [3] 카드 대시보드 프로세서 (코드 블록)
		this.registerMarkdownCodeBlockProcessor("card-buttons", (source, el, ctx) => {
			const parts = source.split("[card]");
			const cardSections = parts.slice(1).map(s => s.trim()).filter(s => s !== "");
			const container = el.createEl("div", { cls: "card-buttons-container" });
			container.style.gridTemplateColumns = `repeat(${cardSections.length || 1}, 1fr)`;

			cardSections.forEach((section) => {
				const data = this.parseSection(section);
				const cardEl = container.createEl("div", { cls: "card-item" });
				if (data.picture) {
					const resolvedPath = this.resolveImagePath(data.picture);
					if (resolvedPath) {
						const imgContainer = cardEl.createEl("div", { cls: "card-img-container" });
						imgContainer.createEl("img", { attr: { src: resolvedPath }, cls: "card-img" });
					}
				}
				const infoEl = cardEl.createEl("div", { cls: "card-info" });
				if (data.title) infoEl.createEl("div", { text: data.title, cls: "card-title" });
				if (data.action) {
					cardEl.addClass("is-clickable");
					cardEl.onClickEvent(() => this.handleAction(data.action!));
				}
			});
		});

		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	// --- 편집 모드(Live Preview) 핵심 보정 로직 ---
	buildLivePreviewPlugin() {
		const plugin = this;
		return ViewPlugin.fromClass(class {
			decorations: DecorationSet;
			constructor(view: EditorView) { this.decorations = this.buildDecorations(view); }
			update(update: ViewUpdate) {
				// 문서가 변하거나, 커서(selection)가 이동할 때마다 업데이트
				if (update.docChanged || update.viewportChanged || update.selectionSet) {
					this.decorations = this.buildDecorations(update.view);
				}
			}
			buildDecorations(view: EditorView) {
				const decorations: any[] = [];
				const regex = /`\[!(.*?)!\]`/g;
				const text = view.state.doc.toString();

				// 현재 커서의 위치(들)를 가져옵니다.
				const selection = view.state.selection.main;

				let match;
				while ((match = regex.exec(text)) !== null) {
					const start = match.index;
					const end = start + match[0].length;
					const content = match[1];

					if (content) {
						// 중요: 커서(selection)가 해당 문구 범위(start ~ end) 안에 있는지 확인
						const isCursorInside = selection.from >= start && selection.to <= end;

						if (!isCursorInside) {
							// 커서가 밖에 있을 때만 버튼으로 대체(replace)
							decorations.push(Decoration.replace({
								widget: new InlineButtonWidget(content, plugin),
							}).range(start, end));
						} else {
							// 커서가 안에 있으면 아무 Decoration도 입히지 않음 (원본 텍스트 노출)
						}
					}
				}
				return Decoration.set(decorations, true);
			}
		}, { decorations: v => v.decorations });
	}

	async handleAction(action: string) {
		const parts = action.split("|").map(s => s.trim());
		if (parts.length < 2) return;
		const [type, value] = parts;
		if (!type || !value) return;

		switch (type) {
			case "command": // @ts-ignore
				this.app.commands.executeCommandById(value); break;
			case "copy":
				await navigator.clipboard.writeText(value);
				new Notice("클립보드에 복사되었습니다!"); break;
			case "url":
				window.open(value.startsWith("http") ? value : `https://${value}`); break;
			case "open":
				await this.app.workspace.openLinkText(value, "", true); break;
			default:
				new Notice(`액션: ${type} | ${value}`);
		}
	}

	resolveImagePath(sourcePath: string): string {
		const file = this.app.metadataCache.getFirstLinkpathDest(sourcePath, "");
		if (file instanceof TFile) return this.app.vault.adapter.getResourcePath(file.path);
		return sourcePath.startsWith("http") ? sourcePath : "";
	}

	parseSection(section: string): CardData {
		const result: CardData = {};
		section.split("\n").forEach(line => {
			const splitIdx = line.indexOf(":");
			if (splitIdx !== -1) {
				const key = line.substring(0, splitIdx).trim();
				const value = line.substring(splitIdx + 1).trim();
				const valid: (keyof CardData)[] = ['title', 'desc', 'picture', 'action'];
				if (valid.includes(key as keyof CardData)) result[key as keyof CardData] = value;
			}
		});
		return result;
	}

	loadSettings() { return this.loadData().then(data => this.settings = Object.assign({}, DEFAULT_SETTINGS, data)); }
	saveSettings() { return this.saveData(this.settings); }
}

class InlineButtonWidget extends WidgetType {
	constructor(readonly content: string, readonly plugin: MyPlugin) { super(); }
	toDOM() {
		const parts = this.content.split("|").map(p => p.trim());
		const type = parts[0] || "link";
		const value = parts[1] || "";
		const span = document.createElement("span");
		span.className = "inline-card-button";
		const map: Record<string, string> = { copy: "copy", command: "terminal", url: "external-link", open: "file-text" };
		const iconId = parts[2] || map[type] || "square-asterisk";
		const iconSpan = span.createEl("span", { cls: "inline-button-icon" });
		setIcon(iconSpan, iconId);
		span.createEl("span", { text: value, cls: "inline-button-text" });
		span.onclick = (e) => { e.preventDefault(); e.stopPropagation(); this.plugin.handleAction(`${type}|${value}`); };
		return span;
	}
}

class InlineButtonChild extends MarkdownRenderChild {
	constructor(containerEl: HTMLElement, public plugin: MyPlugin) { super(containerEl); }
	onload() {
		const rawText = this.containerEl.innerText.trim();
		const match = rawText.match(/^\[!(.*)!\]$/);
		if (match && match[1]) {
			const parts = match[1].split("|").map(p => p.trim());
			if (parts.length < 2) return;
			this.containerEl.empty();
			this.containerEl.addClass("inline-card-button");
			this.containerEl.removeClass("cm-inline-code");
			const iconId = parts[2] || ({ copy: "copy", command: "terminal", url: "external-link", open: "file-text" }[parts[0]!] || "square-asterisk");
			setIcon(this.containerEl.createEl("span", { cls: "inline-button-icon" }), iconId);
			this.containerEl.createEl("span", { text: parts[1], cls: "inline-button-text" });
			this.containerEl.onclick = (e) => { e.preventDefault(); e.stopPropagation(); this.plugin.handleAction(`${parts[0]}|${parts[1]}`); };
		}
	}
}