import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	maxCards: number;
	aspectRatioWidth: number;
	aspectRatioHeight: number;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	maxCards: 5,
	aspectRatioWidth: 5,
	aspectRatioHeight: 4
}

export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('최대 카드 개수')
			.setDesc('한 줄에 표시될 카드의 최대 개수를 설정합니다. (기본 5)')
			.addSlider(slider => slider
				.setLimits(1, 10, 1)
				.setValue(this.plugin.settings.maxCards)
				.onChange(async (value) => {
					this.plugin.settings.maxCards = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('카드 가로 비율')
			.addText(text => text
				.setValue(String(this.plugin.settings.aspectRatioWidth))
				.onChange(async (value) => {
					this.plugin.settings.aspectRatioWidth = Number(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('카드 세로 비율')
			.addText(text => text
				.setValue(String(this.plugin.settings.aspectRatioHeight))
				.onChange(async (value) => {
					this.plugin.settings.aspectRatioHeight = Number(value);
					await this.plugin.saveSettings();
				}));
	}
}