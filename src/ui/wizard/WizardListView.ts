import { ButtonConfig } from "./shared";
import { Setting } from "obsidian";
import MyPlugin from "../../main";
import { renderCardButton } from "../../renderer";
import { CardWizardModal } from "./WizardModal";

// Avoid Circular Dependency by passing modal instance logic or using interface?
// For now, importing WizardModal just for type might be circular if WizardModal imports this.
// Better to define an interface or pass properties.
// Let's assume passed callbacks and simple state for now, but WizardModal needs to be imported to access methods? 
// Actually, `this.modal.render()` is called. 
// Let's define the props explicitly.

export class WizardListView {
    constructor(
        private modal: CardWizardModal,
        private plugin: MyPlugin,
        private buttons: ButtonConfig[]
    ) { }

    render(container: HTMLElement) {
        // Scrollable Wrapper for List View
        const scrollWrapper = container.createEl("div");
        scrollWrapper.style.overflowY = "auto";
        scrollWrapper.style.padding = "10px";
        scrollWrapper.style.flex = "1";

        // --- Global Settings Bar (Top) ---
        const settingBar = scrollWrapper.createEl("div");
        settingBar.style.background = "var(--background-secondary)";
        settingBar.style.padding = "10px";
        settingBar.style.borderRadius = "8px";
        settingBar.style.marginBottom = "20px";
        settingBar.style.display = "flex";
        settingBar.style.gap = "20px";
        settingBar.style.alignItems = "center";
        settingBar.style.flexWrap = "wrap";

        // 1. Style
        const styleDiv = settingBar.createEl("div");
        styleDiv.createEl("span", { text: "스타일: " }).style.fontWeight = "bold";
        const styleSelect = styleDiv.createEl("select");
        styleSelect.style.marginLeft = "5px";
        styleSelect.createEl("option", { text: "기본값 (Default)", value: "" });
        Object.keys(this.plugin.settings.customStyles).forEach(id => {
            const opt = styleSelect.createEl("option");
            opt.value = id; opt.text = id;
            if (this.modal.styleId === id) opt.selected = true;
        });
        styleSelect.onchange = () => { this.modal.styleId = styleSelect.value; this.modal.render(); };

        // 2. Direction (4-Way)
        const dirDiv = settingBar.createEl("div");
        dirDiv.createEl("span", { text: "레이아웃: " }).style.fontWeight = "bold";
        const dirSelect = dirDiv.createEl("select");
        dirSelect.style.marginLeft = "5px";
        dirSelect.createEl("option", { text: "이미지 위 (Top)", value: "top" });
        dirSelect.createEl("option", { text: "이미지 아래 (Bottom)", value: "bottom" });
        dirSelect.createEl("option", { text: "이미지 왼쪽 (Left)", value: "left" });
        dirSelect.createEl("option", { text: "이미지 오른쪽 (Right)", value: "right" });
        dirSelect.value = this.modal.direction;
        dirSelect.onchange = () => { this.modal.direction = dirSelect.value as any; this.modal.render(); };

        // 3. Aspect Ratio (V3.8)
        const ratioDiv = settingBar.createEl("div");
        ratioDiv.createEl("span", { text: "비율: " }).style.fontWeight = "bold";
        const ratioSelect = ratioDiv.createEl("select");
        ratioSelect.style.marginLeft = "5px";
        ratioSelect.createEl("option", { text: "자동 (Auto/Content)", value: "auto" });
        ratioSelect.createEl("option", { text: "1:1 (정사각형)", value: "1/1" });
        ratioSelect.createEl("option", { text: "16:9 (와이드)", value: "16/9" });
        ratioSelect.createEl("option", { text: "4:3 (일반)", value: "4/3" });
        ratioSelect.createEl("option", { text: "3:4 (포스터)", value: "3/4" });
        ratioSelect.createEl("option", { text: "2:1 (파노라마)", value: "2/1" });
        ratioSelect.value = this.modal.ratio;
        ratioSelect.onchange = () => { this.modal.ratio = ratioSelect.value; this.modal.render(); };

        // 4. Image Ratio Slider
        const imgRatioDiv = settingBar.createEl("div");
        imgRatioDiv.style.display = "flex"; imgRatioDiv.style.alignItems = "center"; imgRatioDiv.style.gap = "10px";
        imgRatioDiv.createEl("span", { text: "이미지 영역: " }).style.fontWeight = "bold";

        const ratioSlider = imgRatioDiv.createEl("input");
        ratioSlider.type = "range";
        ratioSlider.min = "10";
        ratioSlider.max = "90";
        ratioSlider.step = "5";
        ratioSlider.value = this.modal.imgRatio.toString();

        const ratioValue = imgRatioDiv.createEl("span", { text: `${this.modal.imgRatio}%` });
        ratioValue.style.minWidth = "40px";

        ratioSlider.oninput = () => {
            const val = parseInt(ratioSlider.value);
            ratioValue.setText(`${val}%`);

            // Re-select grid to be safe (though closure variable should work)
            const gridEl = scrollWrapper.querySelector(".card-buttons-wizard-preview") as HTMLElement;
            if (!gridEl) return;

            // Update CSS Variable for Fixed Mode (handled by CSS or renderer logic in strict sense)
            gridEl.style.setProperty("--img-ratio", `${val}%`);

            // Manual DOM update for Immediate Feedback
            const isColumn = (this.modal.direction === "top" || this.modal.direction === "bottom");
            const isAuto = (!this.modal.ratio || this.modal.ratio === "auto");

            const imgAreas = gridEl.querySelectorAll(".card-img-area");
            imgAreas.forEach((el) => {
                const area = el as HTMLElement;
                if (isColumn) {
                    if (isAuto) {
                        // Formula: ratio = imgRatio / textRatio
                        // imgRatio = val. textRatio = 100 - val.
                        if (val >= 95) {
                            area.style.height = "auto"; area.style.aspectRatio = "10"; // Max out
                        } else if (val <= 5) {
                            area.style.height = "auto"; area.style.aspectRatio = "0.1"; // Min out
                        } else {
                            const ratioVal = val / (100 - val);
                            area.style.height = "auto";
                            area.style.aspectRatio = `${ratioVal * 1.5}`; // 1.5 correction factor
                        }
                    } else {
                        // Fixed Mode
                        area.style.height = `${val}%`;
                        // Reset auto props
                        area.style.aspectRatio = "";
                    }
                    area.style.width = "100%";
                } else {
                    // Row Mode
                    area.style.width = `${val}%`;
                    area.style.height = "100%";
                    area.style.aspectRatio = "";
                }
            });
        };
        ratioSlider.onchange = () => {
            this.modal.imgRatio = parseInt(ratioSlider.value);
            // No need to full render if we updated DOM, but calling render ensures consistency
            // this.modal.render(); 
            // Actually, keep render on change to ensure state is perfectly synced and any side effects run
            // But if it flickers, maybe remove it. For now, let's trust the oninput update and just save state.
            // But wait, renderCardButton recreates elements. If we don't render, next time something triggers render it will look right.
            // Let's call render() to be safe, user won't notice on mouse up.
            this.modal.render();
        };

        // --- Visual Grid ---
        const h3 = scrollWrapper.createEl("h3", { text: "버튼 미리보기 (클릭하여 편집)" });
        h3.style.marginBottom = "10px";

        const grid = scrollWrapper.createEl("div");
        grid.addClass("card-buttons-wizard-preview");
        if (this.modal.styleId) grid.setAttribute(`data-style-${this.modal.styleId}`, "");
        grid.style.setProperty("--img-ratio", `${this.modal.imgRatio}%`);

        // Layout Logic: Grid with Strict Auto Rows to prevent Overlap
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(200px, 1fr))`;
        grid.style.gap = "20px";
        grid.style.marginBottom = "20px";
        grid.style.gridAutoRows = "minmax(min-content, max-content)";
        grid.style.alignItems = "start"; // Vertical alignment top

        // Render Buttons using Helper
        this.buttons.forEach((btn, idx) => {
            const wrapper = grid.createEl("div");
            wrapper.style.minWidth = "0";

            // Re-implement renderCardPreview logic here or import?
            // Since logic is in WizardModal (or should be shared), we can import RenderCardButton.
            // But we need to map config.

            const layoutConfig = {
                styleId: this.modal.styleId,
                direction: this.modal.direction,
                imgRatio: this.modal.imgRatio,
                ratio: this.modal.ratio,
                palettes: this.plugin.settings.palettes
            };
            const cardBtnConfig = {
                title: btn.title, desc: btn.desc, icon: btn.icon, color: btn.color,
                picture: btn.picture, action: btn.action, actionType: btn.actionType, arg1: btn.arg1
            };

            renderCardButton(cardBtnConfig, wrapper, layoutConfig, this.plugin.app, {
                onDelete: () => { this.buttons.splice(idx, 1); this.modal.render(); },
                onClick: () => { this.modal.editingIndex = idx; this.modal.render(); }
            });
        });

        // Add New Card
        const addCard = grid.createEl("div");
        addCard.style.border = "2px dashed var(--background-modifier-border)";
        addCard.style.borderRadius = "8px";

        // Height constraints for add card
        if (this.modal.ratio !== "auto") {
            addCard.style.aspectRatio = this.modal.ratio;
        } else {
            if (this.modal.direction === "top" || this.modal.direction === "bottom") {
                addCard.style.minHeight = "240px";
                addCard.style.height = "auto";
            } else {
                addCard.style.height = "120px";
            }
        }

        addCard.style.display = "flex"; addCard.style.alignItems = "center"; addCard.style.justifyContent = "center";
        addCard.style.cursor = "pointer"; addCard.style.opacity = "0.7";
        addCard.onmouseover = () => addCard.style.opacity = "1";
        addCard.onmouseout = () => addCard.style.opacity = "0.7";

        const addText = addCard.createEl("div", { text: "+ 버튼 추가" });
        addText.style.fontWeight = "bold"; addText.style.fontSize = "1.2em";

        addCard.onclick = () => {
            this.buttons.push({
                title: "새 버튼", desc: "", icon: "", color: "", picture: "", actionType: "command", action: ""
            });
            this.modal.editingIndex = this.buttons.length - 1;
            this.modal.render();
        };

        // --- Footer ---
        const footer = container.createEl("div");
        footer.style.display = "flex"; footer.style.justifyContent = "flex-end"; footer.style.gap = "10px";
        footer.style.flexShrink = "0"; footer.style.borderTop = "1px solid var(--background-modifier-border)";
        footer.style.padding = "10px"; footer.style.background = "var(--background-primary)";

        new Setting(footer)
            .addButton(btn => btn.setButtonText("취소").onClick(() => this.modal.close()))
            .addButton(btn => btn.setButtonText("⚡️ 적용").setCta().onClick(() => {
                this.modal.submit();
                this.modal.close();
            }));
    }
}
