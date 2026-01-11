import { App, PluginSettingTab, Setting, Modal, TextAreaComponent, TextComponent, Notice } from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	aspectRatioWidth: number;
	aspectRatioHeight: number;
	customStyles: Record<string, string>;
	palettes: Record<string, string>;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	aspectRatioWidth: 5,
	aspectRatioHeight: 4,
	customStyles: {},
	palettes: {
		"Primary": "#007bff",
		"Danger": "#dc3545",
		"Success": "#28a745",
		"Warning": "#ffc107"
	}
}

export class CSSEditModal extends Modal {
	private styleTag: HTMLStyleElement | null = null;
	private previewContainer: HTMLElement | null = null;
	private textArea: TextAreaComponent | null = null;
	private idInput: TextComponent | null = null; // New ID Input
	private imgRatio: number = 60;
	private showImage: boolean = true;
	private styleId: string;

	constructor(app: App, initialId: string, private initialCSS: string, private onSave: (newId: string, css: string) => void) {
		super(app);
		this.styleId = initialId;
	}

	onOpen() {
		const { contentEl } = this;
		this.modalEl.style.width = "90vw";
		this.modalEl.style.maxWidth = "1100px";
		this.modalEl.style.height = "85vh";

		contentEl.createEl("h2", { text: "🎨 테마 스타일 편집 (Visual Builder)" });

		const container = contentEl.createEl("div");
		container.style.display = "flex";
		container.style.gap = "20px";
		container.style.height = "calc(100% - 130px)"; // Adjusted height for top header

		// Left: Live Preview & Controls
		const leftPane = container.createEl("div");
		leftPane.style.flex = "1";
		leftPane.style.display = "flex";
		leftPane.style.flexDirection = "column";

		leftPane.createEl("h4", { text: "Live Preview", cls: "setting-item-name" });

		// Preview Window
		const previewWrapper = leftPane.createEl("div");
		previewWrapper.style.flex = "1";
		previewWrapper.style.backgroundColor = "var(--background-primary)";
		previewWrapper.style.padding = "20px";
		previewWrapper.style.borderRadius = "8px";
		previewWrapper.style.border = "1px solid var(--background-modifier-border)";
		previewWrapper.style.overflow = "auto";
		previewWrapper.style.display = "flex";
		previewWrapper.style.justifyContent = "center";
		previewWrapper.style.alignItems = "center";

		this.previewContainer = previewWrapper.createEl("div", { cls: "card-buttons-container" });
		this.previewContainer.setAttribute("data-style-preview", "");
		this.previewContainer.style.width = "200px"; // Default smaller size for preview

		// Controls Area
		const controls = leftPane.createEl("div");
		controls.style.marginTop = "20px";
		controls.style.padding = "10px";
		controls.style.backgroundColor = "var(--background-secondary)";
		controls.style.borderRadius = "8px";

		new Setting(controls)
			.setName("이미지 표시")
			.addToggle(t => t
				.setValue(this.showImage)
				.onChange(v => {
					this.showImage = v;
					this.refreshPreviewDOM();
				}));

		const ratioSetting = new Setting(controls)
			.setName(`이미지 비율 (${this.imgRatio}%)`)
			.addSlider(s => s
				.setLimits(0, 100, 5)
				.setValue(this.imgRatio)
				.onChange(v => {
					this.imgRatio = v;
					ratioSetting.setName(`이미지 비율 (${v}%)`);
					this.refreshPreviewDOM();
				}));

		// Right: ID Input & Editor
		const rightPane = container.createEl("div");
		rightPane.style.flex = "1";
		rightPane.style.display = "flex";
		rightPane.style.flexDirection = "column";
		rightPane.style.borderLeft = "1px solid var(--background-modifier-border)";
		rightPane.style.paddingLeft = "20px";

		// ID Input Field (New)
		const idContainer = rightPane.createEl("div");
		idContainer.style.marginBottom = "10px";
		new Setting(idContainer)
			.setName("스타일 ID")
			.setDesc("이 ID를 [card] 블록의 style 속성에 사용합니다.")
			.addText(text => {
				this.idInput = text;
				text.setValue(this.styleId)
					.setPlaceholder("my-style")
					.onChange(val => this.styleId = val.trim());
				text.inputEl.style.width = "100%";
			});

		// Quick Palette Bar
		const paletteContainer = rightPane.createEl("div");

		// Header for Palette
		const pHeader = paletteContainer.createEl("div");
		pHeader.style.display = "flex";
		pHeader.style.justifyContent = "space-between";
		pHeader.style.alignItems = "center";
		pHeader.style.marginBottom = "5px";
		pHeader.createEl("small", { text: "🎨 퀵 팔레트 (클릭하여 복사)", cls: "setting-item-description" });

		// Scrollable Bar
		const paletteBar = paletteContainer.createEl("div");
		paletteBar.style.display = "flex";
		paletteBar.style.gap = "8px";
		paletteBar.style.overflowX = "auto";
		paletteBar.style.padding = "5px 2px";
		paletteBar.style.marginBottom = "10px";
		paletteBar.style.borderBottom = "1px solid var(--background-modifier-border)";

		// Hide scrollbar logic (optional, but cleaner)
		paletteBar.style.setProperty("-ms-overflow-style", "none");
		paletteBar.style.setProperty("scrollbar-width", "none");

		// Access settings via app or pass plugin instance. 
		// Since we only passed 'app', we need to retrieve the plugin instance or settings.
		// NOTE: CSSEditModal doesn't have direct access to 'plugin' instance yet.
		// However, we can access it via app.plugins if needed, OR better, pass 'settings' to constructor.
		// For now, let's try to get it from the app since we are inside a plugin.
		// Actually, let's just use the known settings shape if possible, or pass it.
		// To adhere to strict TS, best to pass `plugin` to Modal.
		// But I will use a safe cast for now to avoid changing constructor signature too much unless necessary.
		const plugin = (this.app as any).plugins.getPlugin("with-buttons");
		const palettes = plugin?.settings?.palettes || {};

		Object.entries(palettes).forEach(([name, color]) => {
			const item = paletteBar.createEl("div");
			item.style.flex = "0 0 auto"; // No shrinking
			item.style.cursor = "pointer";
			item.style.display = "flex";
			item.style.flexDirection = "column";
			item.style.alignItems = "center";
			item.style.gap = "2px";
			item.title = `클릭하면 '${color}' 복사`;

			// Color Circle
			const circle = item.createEl("div");
			circle.style.width = "24px";
			circle.style.height = "24px";
			circle.style.borderRadius = "50%";
			circle.style.backgroundColor = color as string;
			circle.style.border = "1px solid var(--background-modifier-border)";

			// Name Label
			const label = item.createEl("div", { text: name });
			label.style.fontSize = "10px";
			label.style.maxWidth = "60px";
			label.style.overflow = "hidden";
			label.style.textOverflow = "ellipsis";
			label.style.whiteSpace = "nowrap";
			label.style.color = "var(--text-muted)";

			item.addEventListener("click", () => {
				navigator.clipboard.writeText(color as string);
				new Notice(`색상 복사완료: ${color}`);
			});
		});

		rightPane.createEl("h4", { text: "CSS Editor", cls: "setting-item-name" });
		this.textArea = new TextAreaComponent(rightPane);
		this.textArea.inputEl.style.width = "100%";
		this.textArea.inputEl.style.height = "100%";
		this.textArea.inputEl.style.fontFamily = "monospace";
		this.textArea.inputEl.style.fontSize = "12px";
		this.textArea.setValue(this.initialCSS);
		this.textArea.inputEl.oninput = () => this.updatePreviewStyles();

		// Create Live Style Tag
		this.styleTag = document.head.createEl("style", { attr: { id: "live-css-preview" } });

		this.refreshPreviewDOM();
		this.updatePreviewStyles();

		const buttonContainer = contentEl.createEl("div");
		buttonContainer.style.marginTop = "20px";
		buttonContainer.style.display = "flex";
		buttonContainer.style.justifyContent = "flex-end";
		buttonContainer.style.gap = "10px";

		new Setting(buttonContainer)
			.addButton(btn => btn
				.setButtonText("저장하기")
				.setCta()
				.onClick(() => {
					if (!this.styleId) {
						new Notice("스타일 ID를 입력해주세요.");
						return;
					}
					this.onSave(this.styleId, this.textArea!.getValue());
					this.close();
				}))
			.addButton(btn => btn
				.setButtonText("취소")
				.onClick(() => this.close()));
	}

	refreshPreviewDOM() {
		if (!this.previewContainer) return;
		this.previewContainer.empty();

		const card = this.previewContainer.createEl("div", { cls: "card-item" });
		card.style.aspectRatio = "1/1"; // Default square aspect ratio for preview
		card.style.display = "flex";
		card.style.flexDirection = "column";
		card.style.overflow = "hidden"; // Mimic real card behavior

		// 1. Image
		if (this.showImage) {
			const imgContainer = card.createEl("div", { cls: "card-img-container" });
			imgContainer.style.height = `${this.imgRatio}%`;
			imgContainer.style.width = "100%";
			imgContainer.style.backgroundColor = "#ddd";
			imgContainer.style.flexShrink = "0";

			// Placeholder image text
			const placeholder = imgContainer.createEl("div", { text: "IMG", cls: "card-img" });
			placeholder.style.display = "flex";
			placeholder.style.alignItems = "center";
			placeholder.style.justifyContent = "center";
			placeholder.style.height = "100%";
			placeholder.style.width = "100%";
		}

		// 2. Info
		const info = card.createEl("div", { cls: "card-info" });
		info.style.flex = "1";
		// Exact logic from main.ts: if image exists, height is 100 - ratio. Else 100%.
		info.style.height = this.showImage ? `${100 - this.imgRatio}%` : "100%";
		info.style.width = "100%";
		info.style.display = "flex";
		info.style.flexDirection = "column";

		const title = info.createEl("div", { text: "미리보기 제목", cls: "card-title" });
		title.style.fontWeight = "bold";
		title.style.marginBottom = "2px";

		const desc = info.createEl("div", { text: "이곳에 스타일이 즉시 반영됩니다.", cls: "card-desc" });
		desc.style.fontSize = "0.8em";
	}

	updatePreviewStyles() {
		if (!this.styleTag || !this.textArea) return;
		const rawCss = this.textArea.getValue();

		// Scope CSS to preview container
		// Replace standard class selectors with scoped versions
		// E.g. .card-item -> div[data-style-preview] .card-item
		const scopedCss = rawCss.replace(/([^;{}]+)(?=\{)/g, (selectors) => {
			return selectors.split(",").map(selector => {
				const trimmed = selector.trim();
				// Avoid scoping self
				if (trimmed.includes(".card-buttons-container")) {
					return trimmed.replace(".card-buttons-container", "div[data-style-preview]");
				}
				return `div[data-style-preview] ${trimmed}`;
			}).join(", ");
		});

		this.styleTag.textContent = scopedCss;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		if (this.styleTag) {
			this.styleTag.remove();
			this.styleTag = null;
		}
	}
}

export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	refreshMarkdownViews() {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType() === "markdown") {
				(leaf.view as any).previewMode?.rerender(true);
			}
		});
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// --- Color Palette Section ---
		containerEl.createEl('h2', { text: '🎨 색상 팔레트 (Color Palette)' });
		containerEl.createEl('p', { text: '버튼 색상에 사용할 이름을 정의합니다. 예: "Primary" -> #007bff' });

		const palettes = this.plugin.settings.palettes;

		new Setting(containerEl)
			.setName('새 색상 추가')
			.addButton(btn => btn
				.setButtonText('+ 추가')
				.setCta()
				.onClick(async () => {
					const newName = `Color ${Object.keys(palettes).length + 1}`;
					palettes[newName] = "#000000";
					await this.plugin.saveSettings();
					this.display();
				}));

		Object.entries(palettes).forEach(([name, color]) => {
			let tempName = name;
			new Setting(containerEl)
				.addColorPicker(cp => cp
					.setValue(color)
					.onChange(async (val) => {
						palettes[name] = val; // Direct update for color picker
						await this.plugin.saveSettings();
					}))
				.addText(text => text
					.setPlaceholder('색상 이름')
					.setValue(name)
					.onChange((val) => {
						tempName = val.trim();
					}))
				.addButton(btn => btn
					.setIcon('check')
					.setTooltip('이름 변경 저장')
					.onClick(async () => {
						if (tempName && tempName !== name) {
							delete palettes[name];
							palettes[tempName] = color;
							await this.plugin.saveSettings();
							this.display();
						}
					}))
				.addButton(btn => btn
					.setIcon('trash')
					.setWarning()
					.onClick(async () => {
						delete palettes[name];
						await this.plugin.saveSettings();
						this.display();
					}));
		});

		// --- Custom Styles Section ---
		containerEl.createEl('h2', { text: '🎨 커스텀 스타일 라이브러리', attr: { style: 'margin-top: 40px;' } });
		containerEl.createEl('p', { text: 'ID를 수정하려면 [편집] 버튼을 누르세요.', cls: 'setting-item-description' });

		new Setting(containerEl)
			.setName('새 테마 추가')
			.addButton(btn => btn
				.setButtonText('+ 추가')
				.setCta()
				.onClick(async () => {
					const newId = `theme_${Date.now()}`;
					this.plugin.settings.customStyles[newId] = defaultCss;
					await this.plugin.saveSettings();
					this.display();

					// V4.3 Auto-Open Editor
					new CSSEditModal(this.app, newId, defaultCss, async (savedId, savedCss) => {
						if (savedId !== newId) {
							if (this.plugin.settings.customStyles[savedId]) {
								new Notice(`'${savedId}' ID가 이미 존재하여 덮어썼습니다.`);
							}
							delete this.plugin.settings.customStyles[newId];
							new Notice(`ID가 '${savedId}'로 변경되었습니다.`);
						} else {
							new Notice("스타일이 저장되었습니다.");
						}
						this.plugin.settings.customStyles[savedId] = savedCss;
						await this.plugin.saveSettings();
						this.refreshMarkdownViews();
						this.display();
					}).open();
				}));

		const styles = this.plugin.settings.customStyles;

		// Cleaned up List View
		Object.entries(styles).forEach(([id, cssContent]) => {
			const setting = new Setting(containerEl)
				.setName(id) // Clean ID display
				.setDesc(`${cssContent.length} chars`) // Simple stat or snippet
				.addButton(btn => btn
					.setButtonText("편집")
					.onClick(() => {
						// Open Modal with Rename capability
						new CSSEditModal(this.app, id, cssContent, async (newId, newCss) => {
							// Update logic
							if (newId !== id) {
								if (styles[newId]) {
									new Notice(`'${newId}' ID가 이미 존재하여 덮어썼습니다.`);
								}
								delete styles[id];
								new Notice(`ID가 '${newId}'로 변경되었습니다.`);
							} else {
								new Notice("스타일이 저장되었습니다.");
							}
							styles[newId] = newCss;
							await this.plugin.saveSettings();
							this.refreshMarkdownViews();
							this.display();
						}).open();
					}))
				.addButton(btn => btn
					.setIcon('trash')
					.setWarning()
					.onClick(async () => {
						delete styles[id];
						await this.plugin.saveSettings();
						this.refreshMarkdownViews();
						this.display();
					}));
		});
	}
}

const defaultCss = `/* 1. [전체 컨테이너] */
.card-buttons-container { }
/* 2. [카드 외곽] */
.card-item { }
/* 3. [호버 액션] */
.card-item:hover { }
/* 4. [이미지 박스] */
.card-img-container { }
/* 5. [정보 영역] */
.card-info { }
/* 6. [제목] */
.card-title { }
/* 7. [설명] */
.card-desc { }
/* 8. [클릭 효과] */
.card-item:active { }`;