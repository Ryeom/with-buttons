import { Plugin, TFile, Notice } from 'obsidian';
import {
	ViewUpdate, ViewPlugin, DecorationSet, Decoration,
	EditorView
} from "@codemirror/view";
import { DEFAULT_SETTINGS, WithButtonsSettings, WithButtonsSettingTab } from "./settings";
import FileSuggest from './file-suggest';
import ActionSuggest from './action-suggest';
import SettingSuggest from './setting-suggest';
import { InlineButtonWidget, InlineButtonChild } from './inline-button';
import { CardBlockRenderer, CardData } from './card-renderer';

export default class WithButtonsPlugin extends Plugin {
	settings: WithButtonsSettings;

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
		this.addSettingTab(new WithButtonsSettingTab(this.app, this));
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
						fm[prop] = cur === true ? false : true;
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
						if (Array.isArray(value)) { yamlLines[idx] = `${key}:`; yamlLines.splice(idx + 1, 0, ...value.map(v => `  - ${v}`)); }
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
				const selection = view.state.selection.main;
				for (const { from, to } of view.visibleRanges) {
					const text = view.state.doc.sliceString(from, to);
					let match;
					while ((match = regex.exec(text)) !== null) {
						const start = from + match.index;
						const end = start + match[0].length;
						if (selection.from >= start && selection.to <= end) continue;
						const content = match[1];
						if (content) {
							decorations.push(Decoration.replace({ widget: new InlineButtonWidget(content, plugin) }).range(start, end));
						}
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
