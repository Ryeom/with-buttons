import { App, Plugin, TFile, Notice } from 'obsidian';
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

		this.registerMarkdownCodeBlockProcessor("card-buttons", (source, el, ctx) => {
			const parts = source.split("[card]");
			const firstPart = parts[0] || ""; // undefined 방지

			const settingSource = firstPart.includes("[setting]")
				? firstPart.replace("[setting]", "").trim()
				: "";

			const cardSections = parts.slice(1).map(s => s.trim()).filter(s => s !== "");

			let localRatio = `${this.settings.aspectRatioWidth} / ${this.settings.aspectRatioHeight}`;
			let maxPerRow = this.settings.maxCards;

			if (settingSource) {
				settingSource.split("\n").forEach(line => {
					if (!line.includes("|")) return;
					const [key, value] = line.split("|").map(s => s.trim());
					if (!key || !value) return;

					if (key.toLowerCase() === "ratio") localRatio = value.replace(":", " / ");
					if (key.toLowerCase() === "row") maxPerRow = Number(value) || maxPerRow;
				});
			}

			const container = el.createEl("div", { cls: "card-buttons-container" });
			const finalCards = cardSections.slice(0, maxPerRow);

			container.style.gridTemplateColumns = `repeat(${finalCards.length}, 1fr)`;

			finalCards.forEach((section) => {
				const data = this.parseSection(section);
				const cardEl = container.createEl("div", { cls: "card-item" });

				cardEl.style.aspectRatio = localRatio;

				const imgContainer = cardEl.createEl("div", { cls: "card-img-container" });
				if (data.picture) {
					const resolvedPath = this.resolveImagePath(data.picture);
					if (resolvedPath) {
						imgContainer.createEl("img", {
							attr: { src: resolvedPath },
							cls: "card-img"
						});
					}
				}

				const infoEl = cardEl.createEl("div", { cls: "card-info" });
				if (data.title) infoEl.createEl("div", { text: data.title, cls: "card-title" });

				if (data.desc && finalCards.length <= 3) {
					infoEl.createEl("p", { text: data.desc, cls: "card-desc" });
				}

				if (data.action) {
					cardEl.addClass("is-clickable");
					cardEl.onClickEvent(() => this.handleAction(data.action!));
				}
			});
		});

		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	resolveImagePath(sourcePath: string): string {
		const file = this.app.metadataCache.getFirstLinkpathDest(sourcePath, "");
		if (file instanceof TFile) return this.app.vault.adapter.getResourcePath(file.path);
		return sourcePath.startsWith("http") ? sourcePath : "";
	}

	parseSection(section: string): CardData {
		const lines = section.split("\n");
		const result: CardData = {};
		lines.forEach(line => {
			const colonIndex = line.indexOf(":");
			if (colonIndex !== -1) {
				const key = line.substring(0, colonIndex).trim();
				const value = line.substring(colonIndex + 1).trim();
				const validKeys: (keyof CardData)[] = ['title', 'desc', 'icon', 'picture', 'action'];
				if (validKeys.includes(key as keyof CardData)) {
					result[key as keyof CardData] = value;
				}
			}
		});
		return result;
	}

	async handleAction(action: string) {
		const [type, value] = action.split("|").map(s => s.trim());
		if (!type || !value) return;

		switch (type) {
			case "url":
				window.open(value.startsWith("http") ? value : `https://${value}`);
				break;
			case "open":
				await this.app.workspace.openLinkText(value, "", true);
				break;
			case "create":
				this.createNewFileFromTemplate(value);
				break;
			default:
				new Notice(`알 수 없는 액션: ${type}`);
		}
	}

	async createNewFileFromTemplate(templatePath: string) {
		try {
			const templateFile = this.app.metadataCache.getFirstLinkpathDest(templatePath, "");
			const content = templateFile instanceof TFile ? await this.app.vault.read(templateFile) : "";

			const fileName = `무제 ${Date.now()}.md`;
			const newFile = await this.app.vault.create(fileName, content);
			await this.app.workspace.getLeaf(true).openFile(newFile);
			new Notice("새 메모가 생성되었습니다.");
		} catch (e: any) {
			new Notice(e.message?.includes("exists") ? "이미 파일이 존재합니다." : "생성 오류 발생");
		}
	}

	onunload() { }
	async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
	async saveSettings() { await this.saveData(this.settings); }
}