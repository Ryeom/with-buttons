import { ButtonConfig, IconSuggesterModal } from "./shared";
import { Setting, setIcon } from "obsidian";
import MyPlugin from "../../main";
import { renderCardButton } from "../../renderer";
import { CardWizardModal } from "./WizardModal";
import { actionRegistry } from "../../actions/ActionHandler";

export class WizardEditorView {
    constructor(
        private modal: CardWizardModal,
        private plugin: MyPlugin,
        private btn: ButtonConfig,
        private idx: number
    ) { }

    render(container: HTMLElement) {
        // Settings Header (Fixed)
        const header = container.createEl("div");
        header.style.display = "flex"; header.style.alignItems = "center"; header.style.gap = "10px";
        header.style.padding = "10px"; header.style.borderBottom = "1px solid var(--background-modifier-border)";
        header.style.flexShrink = "0";

        const backBtn = header.createEl("button", { text: "⬅️ 목록으로" });
        backBtn.onclick = () => { this.modal.editingIndex = null; this.modal.render(); };
        const title = header.createEl("h3", { text: `버튼 #${this.idx + 1} 편집` });
        title.style.margin = "0";

        // --- Live Preview Area (Fixed) ---
        const previewSection = container.createEl("div");
        previewSection.style.background = "var(--background-secondary)";
        previewSection.style.padding = "10px";
        previewSection.style.display = "flex";
        previewSection.style.justifyContent = "center";
        previewSection.style.alignItems = "center";
        previewSection.style.flexShrink = "0";
        previewSection.style.height = "280px";

        previewSection.style.setProperty("--img-ratio", `${this.modal.imgRatio}%`);

        // Wrapper for fixed width preview
        const previewWrapper = previewSection.createEl("div");
        previewWrapper.style.width = "250px";
        previewWrapper.style.transform = "scale(1.0)";
        if (this.modal.styleId) previewWrapper.setAttribute(`data-style-${this.modal.styleId}`, "");

        let currentCard: HTMLElement | null = null;

        const refreshPreview = () => {
            if (currentCard) currentCard.remove();

            const layoutConfig = {
                styleId: this.modal.styleId, direction: this.modal.direction,
                imgRatio: this.modal.imgRatio, ratio: this.modal.ratio,
                palettes: this.plugin.settings.palettes
            };
            const cardBtnConfig = { ...this.btn }; // copy

            currentCard = renderCardButton(cardBtnConfig, previewWrapper, layoutConfig, this.plugin.app);
            currentCard.style.cursor = "default";
            currentCard.onclick = null;
            if (this.modal.ratio && this.modal.ratio !== "auto") currentCard.style.aspectRatio = this.modal.ratio;
        };

        refreshPreview();

        // --- Scrollable Options Body ---
        const body = container.createEl("div");
        body.style.display = "flex"; body.style.gap = "20px";
        body.style.flex = "1";
        body.style.overflowY = "auto";
        body.style.minHeight = "0"; // V3.9.1 Fix: Prevent overflow
        body.style.padding = "20px";

        const left = body.createEl("div"); left.style.flex = "1"; left.style.minWidth = "0"; // Prevent flex item blowout
        const right = body.createEl("div"); right.style.flex = "1"; right.style.minWidth = "0";

        // --- Left: Appearance ---
        left.createEl("h4", { text: "외관 (Appearance)" });

        new Setting(left).setName("제목").addText(t => t.setValue(this.btn.title).onChange(v => { this.btn.title = v; refreshPreview(); }));
        new Setting(left).setName("설명").addText(t => t.setValue(this.btn.desc).onChange(v => { this.btn.desc = v; refreshPreview(); }));

        // Icon
        const iconSetting = new Setting(left).setName("아이콘 (Icon)");
        const iconPreview = iconSetting.controlEl.createEl("div");
        iconPreview.style.width = "24px"; iconPreview.style.height = "24px"; iconPreview.style.marginRight = "10px";

        const updateIconPreview = () => {
            iconPreview.empty();
            if (this.btn.icon) setIcon(iconPreview, this.btn.icon);
        };
        updateIconPreview();

        iconSetting.addButton(b => b.setButtonText(this.btn.icon || "검색...").onClick(() => {
            new IconSuggesterModal(this.plugin.app, (icon) => {
                this.btn.icon = icon;
                updateIconPreview();
                b.setButtonText(this.btn.icon);
                refreshPreview();
            }).open();
        }));

        if (this.btn.icon) {
            iconSetting.addButton(b => b.setIcon("trash").setTooltip("아이콘 삭제").onClick(() => {
                this.btn.icon = "";
                updateIconPreview();
                this.modal.render();
            }));
        }

        // Picture 
        new Setting(left).setName("이미지 (Picture)").setDesc("URL 또는 내부 링크").addText(t => t.setValue(this.btn.picture).onChange(v => { this.btn.picture = v; refreshPreview(); }));

        // Color
        const colorSetting = new Setting(left).setName("색상 (Color)");
        const paletteContainer = colorSetting.controlEl.createEl("div");
        paletteContainer.style.display = "flex"; paletteContainer.style.gap = "5px"; paletteContainer.style.flexWrap = "wrap"; paletteContainer.style.maxWidth = "200px";

        const noneBox = paletteContainer.createEl("div", { text: "X" });
        noneBox.style.width = "20px"; noneBox.style.height = "20px"; noneBox.style.border = "1px solid #ccc"; noneBox.style.cursor = "pointer"; noneBox.style.textAlign = "center";
        noneBox.onclick = () => { this.btn.color = ""; refreshPreview(); };

        Object.entries(this.plugin.settings.palettes).forEach(([name, hex]) => {
            const swatch = paletteContainer.createEl("div");
            swatch.style.width = "20px"; swatch.style.height = "20px"; swatch.style.backgroundColor = hex; swatch.style.cursor = "pointer"; swatch.title = name;
            swatch.style.border = "1px solid transparent";
            swatch.onclick = () => { this.btn.color = name; refreshPreview(); };
        });

        // --- Right: Action ---
        right.createEl("h4", { text: "동작 (Logic)" });

        new Setting(right).setName("동작 유형").addDropdown(d => {
            const strategies = actionRegistry.getAll();
            strategies.forEach(s => d.addOption(s.id, s.name));
            d.setValue(this.btn.actionType);
            d.onChange(v => {
                this.btn.actionType = v as any;
                this.btn.action = ""; // Reset value on type change
                this.btn.arg1 = "";
                this.modal.render(); // Re-render to show correct settings
            });
        });

        const actionArea = right.createEl("div");
        actionArea.style.background = "var(--background-secondary)";
        actionArea.style.padding = "15px";
        actionArea.style.borderRadius = "8px";

        // V4: Use Strategy Pattern for Settings
        const strategy = actionRegistry.get(this.btn.actionType);
        if (strategy) {
            strategy.renderSettings(
                actionArea,
                this.btn.action,
                this.btn.arg1 || "",
                (val, arg) => {
                    this.btn.action = val;
                    if (arg !== undefined) this.btn.arg1 = arg;
                },
                this.plugin.app
            );
        } else {
            actionArea.createEl("div", { text: "선택된 동작이 없습니다." });
        }
    }
}
