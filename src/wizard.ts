import { App, Modal, Setting, Notice, TextAreaComponent, getIconIds, setIcon, FuzzySuggestModal, TFile, Command, FuzzyMatch } from "obsidian";
import MyPlugin from "./main";

interface ButtonConfig {
    title: string;
    desc: string;
    icon: string;
    color: string;
    picture: string;
    actionType: 'url' | 'command' | 'open' | 'search' | 'create' | 'toggle' | 'copy' | 'js';
    action: string;
    arg1?: string;
    arg2?: string;
}

// --- Suggesters ---

class IconSuggesterModal extends FuzzySuggestModal<string> {
    constructor(app: App, private onChoose: (icon: string) => void) {
        super(app);
    }
    getItems(): string[] { return getIconIds(); }
    getItemText(item: string): string { return item; }
    renderSuggestion(match: FuzzyMatch<string>, el: HTMLElement) {
        const iconId = match.item;
        el.style.display = "flex"; el.style.alignItems = "center"; el.style.gap = "10px";
        const iconContainer = el.createEl("div");
        iconContainer.style.width = "20px"; iconContainer.style.height = "20px";
        setIcon(iconContainer, iconId);
        el.createEl("span", { text: iconId });
    }
    onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void { this.onChoose(item); }
}

class CommandSuggesterModal extends FuzzySuggestModal<Command> {
    constructor(app: App, private onChoose: (cmd: Command) => void) { super(app); }
    getItems(): Command[] { return (this.app as any).commands.listCommands(); }
    getItemText(item: Command): string { return item.name; }
    renderSuggestion(match: FuzzyMatch<Command>, el: HTMLElement) {
        const cmd = match.item;
        const div = el.createEl("div");
        const nameEl = div.createEl("div", { text: cmd.name });
        nameEl.style.fontWeight = "bold";
        const idEl = div.createEl("div", { text: cmd.id });
        idEl.style.fontSize = "0.8em"; idEl.style.opacity = "0.7";
    }
    onChooseItem(item: Command, evt: MouseEvent | KeyboardEvent): void { this.onChoose(item); }
}

class FileSuggesterModal extends FuzzySuggestModal<TFile> {
    constructor(app: App, private onChoose: (file: TFile) => void) { super(app); }
    getItems(): TFile[] { return this.app.vault.getFiles(); }
    getItemText(item: TFile): string { return item.path; }
    onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent): void { this.onChoose(item); }
}

function resolveResourcePath(app: App, path: string): string {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    const file = app.metadataCache.getFirstLinkpathDest(path, "");
    if (file instanceof TFile) return app.vault.adapter.getResourcePath(file.path);
    return path;
}


export class CardWizardModal extends Modal {
    private styleId: string = "";
    private direction: "top" | "bottom" | "left" | "right" = "top";
    private imgRatio: number = 60;
    private ratio: string = "auto"; // V3.8: Global Aspect Ratio (e.g. 1/1, 16/9, or auto)

    private buttons: ButtonConfig[] = [];
    private plugin: MyPlugin;
    private onSubmit: (result: string) => void;

    private editingIndex: number | null = null;

    // V3.7: State to prevent full re-render flickering
    private isEditorView: boolean = false;

    constructor(app: App, plugin: MyPlugin, onSubmit: (result: string) => void) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
    }

    // V3.2: Reverse Parser
    importFromSource(source: string) {
        // Parse settings
        const settingMatch = source.match(/\[setting\]([\s\S]*?)(?=\[card\]|$)/);
        if (settingMatch && settingMatch[1]) {
            const lines = settingMatch[1].split("\n");
            lines.forEach(line => {
                const parts = line.split(":");
                if (parts.length < 2) return;
                const key = parts[0]?.trim().toLowerCase();
                const val = parts[1]?.trim();
                if (!key) return;
                if (key === "style") this.styleId = val || "";
                if (key === "direction") {
                    const d = val?.toLowerCase() || "";
                    if (d === "horizontal") this.direction = "left";
                    else if (d === "vertical") this.direction = "top";
                    else if (["top", "bottom", "left", "right"].includes(d)) this.direction = d as any;
                }
                if (key === "img-ratio") this.imgRatio = parseInt(val || "60") || 60;
                if (key === "ratio") this.ratio = val || "auto"; // V3.8: Import ratio
            });
        }

        // Parse cards
        const cardMatches = source.split("[card]");
        // First element is pre-card (settings), ignore
        cardMatches.slice(1).forEach(cardSection => {
            if (!cardSection.trim()) return;
            const btn: ButtonConfig = {
                title: "", desc: "", icon: "", color: "", picture: "",
                actionType: "command", action: "", arg1: "", arg2: ""
            };

            cardSection.split("\n").forEach(line => {
                const sepIdx = line.indexOf(":");
                if (sepIdx === -1) return;
                const key = line.substring(0, sepIdx).trim().toLowerCase();
                const val = line.substring(sepIdx + 1).trim();

                if (key === "title") btn.title = val;
                if (key === "desc") btn.desc = val;
                if (key === "icon") btn.icon = val;
                if (key === "color") btn.color = val;
                if (key === "picture") btn.picture = val;
                if (key === "action") {
                    const pipeParts = val.split("|");
                    const type = pipeParts[0] ? pipeParts[0].trim() : "";
                    const actionVal = pipeParts[1] ? pipeParts[1].trim() : "";
                    const argVal = pipeParts[2] ? pipeParts[2].trim() : "";

                    if (["url", "command", "open", "search", "create", "toggle", "copy", "js"].includes(type)) {
                        btn.actionType = type as any;
                        btn.action = actionVal;
                        btn.arg1 = argVal;
                    } else {
                        // Fallback
                        btn.actionType = "command";
                        btn.action = val;
                    }
                }
            });
            this.buttons.push(btn);
        });
    }

    onOpen() {
        this.modalEl.style.width = "900px";
        this.modalEl.style.maxWidth = "95vw";
        this.modalEl.style.height = "85vh"; // Global Modal Height
        this.render();
    }

    render() {
        const { contentEl } = this;
        contentEl.empty();

        // V3.7: Main Container with Flex Layout for Scroll Control
        contentEl.style.display = "flex";
        contentEl.style.flexDirection = "column";
        contentEl.style.height = "100%";

        const header = contentEl.createEl("h2", { text: "🧙‍♂️ 버튼 생성 마법사 (Wizard V3.8)" });
        header.style.flexShrink = "0";

        const viewContainer = contentEl.createEl("div");
        viewContainer.style.flex = "1";
        viewContainer.style.overflow = "hidden"; // Manage scroll inside views
        viewContainer.style.display = "flex";
        viewContainer.style.flexDirection = "column";

        if (this.editingIndex !== null) {
            this.isEditorView = true;
            this.renderEditor(viewContainer, this.editingIndex);
        } else {
            this.isEditorView = false;
            this.renderListView(viewContainer);
        }
    }

    // --- Optimized Card Renderer (Shared) ---
    renderCardPreview(btn: ButtonConfig, container: HTMLElement, onDelete?: () => void, onClick?: () => void) {
        const card = container.createEl("div");
        card.className = "card-item card-btn";

        // Base Styling
        if (!this.styleId) {
            card.style.background = "var(--background-primary)";
            card.style.border = "1px solid var(--background-modifier-border)";
            card.style.borderRadius = "8px";
            card.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
        } else {
            card.style.background = ""; card.style.border = ""; card.style.borderRadius = "";
        }

        card.style.position = "relative";
        card.style.cursor = "pointer";
        card.style.overflow = "hidden";
        card.style.display = "flex";

        if (this.direction === "top") card.style.flexDirection = "column";
        else if (this.direction === "bottom") card.style.flexDirection = "column-reverse";
        else if (this.direction === "left") card.style.flexDirection = "row";
        else if (this.direction === "right") card.style.flexDirection = "row-reverse";

        // V3.9: Robust Layout Logic
        const isColumn = (this.direction === "top" || this.direction === "bottom");
        const isAuto = (!this.ratio || this.ratio === "auto");

        // 1. Container Sizing
        if (!isAuto) {
            // FIXED RATIO MODE
            card.style.aspectRatio = this.ratio;
            card.style.height = "auto";
            card.style.width = "100%"; // Fill Grid Cell
        } else {
            // AUTO MODE (Content Driven)
            card.style.height = "100%";
            if (isColumn && !this.styleId) {
                card.style.minHeight = "200px";
            } else if (!isColumn) {
                card.style.height = "160px";
            }
        }

        const palettes = this.plugin.settings.palettes;
        let bgColor = palettes[btn.color] || btn.color;

        // 2. Image Area
        const imgArea = card.createEl("div");
        imgArea.className = "card-img-area";
        imgArea.style.flexShrink = "0";

        // Bug Fix 1: Image Ratio Slider in Auto Mode
        // Map 10-90% slider to logic.
        if (isColumn) {
            imgArea.style.width = "100%";
            if (!isAuto) {
                // Fixed Mode: Percent Height
                imgArea.style.height = `${this.imgRatio}%`;
            } else {
                // Auto Mode: Image needs its own valid height or ratio
                // Using 'aspect-ratio' on image itself helps it stay proportional
                imgArea.style.height = "auto";
                imgArea.style.aspectRatio = "16/9"; // Default nice look
                // Optional: Use slider to scale this aspect ratio? 
                // Let's stick to standard 16/9 for now to solve "whitespace" issue
            }
        } else {
            // Row Layout (Left/Right)
            imgArea.style.height = "100%";
            imgArea.style.width = `${this.imgRatio}%`;
        }

        imgArea.style.background = "var(--interactive-accent)";
        if (!btn.picture && !btn.icon) imgArea.style.opacity = "0.7"; // Empty placeholder

        imgArea.style.display = "flex";
        imgArea.style.alignItems = "center";
        imgArea.style.justifyContent = "center";
        imgArea.style.color = "#fff";
        imgArea.style.backgroundSize = "cover";
        imgArea.style.backgroundPosition = "center";

        if (btn.picture) {
            const src = resolveResourcePath(this.plugin.app, btn.picture);
            if (src) imgArea.style.backgroundImage = `url('${src}')`;
        }

        if (btn.icon) {
            const iconContainer = imgArea.createEl("div");
            setIcon(iconContainer, btn.icon);
            const svg = iconContainer.querySelector("svg");
            if (svg) {
                svg.style.width = "40px"; svg.style.height = "40px";
                if (btn.picture) svg.style.filter = "drop-shadow(0 0 3px rgba(0,0,0,0.8))";
            }
        }

        // 3. Info Area
        const infoArea = card.createEl("div");
        infoArea.style.flex = "1"; // Fill remaining space
        infoArea.style.padding = "10px";

        if (bgColor) {
            infoArea.style.background = bgColor;
            if (["red", "blue", "green", "black", "#000"].includes(bgColor) || bgColor.startsWith("#")) {
                infoArea.style.color = "white";
            } else {
                infoArea.style.color = "var(--text-normal)";
            }
        } else {
            if (!this.styleId) infoArea.style.background = "var(--background-secondary)";
            infoArea.style.color = "var(--text-normal)";
        }

        infoArea.style.display = "flex";
        infoArea.style.flexDirection = "column";
        infoArea.style.justifyContent = "center";
        infoArea.style.overflow = "hidden";

        const title = infoArea.createEl("div", { text: btn.title || "(제목 없음)" });
        title.style.fontSize = "1.1em";
        title.style.fontWeight = "bold";
        title.style.whiteSpace = "nowrap";
        title.style.overflow = "hidden";
        title.style.textOverflow = "ellipsis";
        title.style.marginBottom = "4px";

        if (btn.desc) {
            const desc = infoArea.createEl("div", { text: btn.desc });
            desc.style.fontSize = "0.9em";
            desc.style.opacity = "0.9";
            // Auto Mode: Allow text to expand naturally
            if (isAuto && isColumn) {
                desc.style.whiteSpace = "pre-wrap";
            } else {
                // Fixed Mode: Clamp text
                desc.style.display = "-webkit-box";
                desc.style.webkitLineClamp = "2";
                desc.style.webkitBoxOrient = "vertical";
                desc.style.overflow = "hidden";
            }
        }

        if (onDelete) {
            const delBtn = card.createEl("div", { text: "❌" });
            delBtn.style.position = "absolute"; delBtn.style.top = "5px"; delBtn.style.right = "5px";
            delBtn.style.cursor = "pointer"; delBtn.style.background = "rgba(0,0,0,0.5)";
            delBtn.style.borderRadius = "50%"; delBtn.style.width = "24px"; delBtn.style.height = "24px";
            delBtn.style.textAlign = "center"; delBtn.style.lineHeight = "24px"; delBtn.style.zIndex = "10";
            delBtn.onclick = (e) => { e.stopPropagation(); onDelete(); };
        }

        if (onClick) {
            card.onclick = onClick;
        }

        // V3.9: Final Check for Fixed Height Overlap in Auto Mode
        // If content is huge, card expands. Grid handles this with min-content/masonry-ish behavior (row align start)
        return card;
    }

    renderListView(container: HTMLElement) {
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
            if (this.styleId === id) opt.selected = true;
        });
        styleSelect.onchange = () => { this.styleId = styleSelect.value; this.render(); };

        // 2. Direction (4-Way)
        const dirDiv = settingBar.createEl("div");
        dirDiv.createEl("span", { text: "레이아웃: " }).style.fontWeight = "bold";
        const dirSelect = dirDiv.createEl("select");
        dirSelect.style.marginLeft = "5px";
        dirSelect.createEl("option", { text: "이미지 위 (Top)", value: "top" });
        dirSelect.createEl("option", { text: "이미지 아래 (Bottom)", value: "bottom" });
        dirSelect.createEl("option", { text: "이미지 왼쪽 (Left)", value: "left" });
        dirSelect.createEl("option", { text: "이미지 오른쪽 (Right)", value: "right" });
        dirSelect.value = this.direction;
        dirSelect.onchange = () => { this.direction = dirSelect.value as any; this.render(); };

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
        ratioSelect.value = this.ratio;
        ratioSelect.onchange = () => { this.ratio = ratioSelect.value; this.render(); };

        // 4. Image Ratio Slider
        const imgRatioDiv = settingBar.createEl("div");
        imgRatioDiv.style.display = "flex"; imgRatioDiv.style.alignItems = "center"; imgRatioDiv.style.gap = "10px";
        imgRatioDiv.createEl("span", { text: "이미지 영역: " }).style.fontWeight = "bold";

        const ratioSlider = imgRatioDiv.createEl("input");
        ratioSlider.type = "range";
        ratioSlider.min = "10";
        ratioSlider.max = "90";
        ratioSlider.step = "5";
        ratioSlider.value = this.imgRatio.toString();

        const ratioValue = imgRatioDiv.createEl("span", { text: `${this.imgRatio}%` });
        ratioValue.style.minWidth = "40px";

        ratioSlider.oninput = () => {
            const val = ratioSlider.value;
            ratioValue.setText(`${val}%`);
            const grid = scrollWrapper.querySelector(".card-buttons-wizard-preview") as HTMLElement;
            if (grid) grid.style.setProperty("--img-ratio", `${val}%`);
        };
        ratioSlider.onchange = () => {
            this.imgRatio = parseInt(ratioSlider.value);
        };

        // --- Visual Grid ---
        const h3 = scrollWrapper.createEl("h3", { text: "버튼 미리보기 (클릭하여 편집)" });
        h3.style.marginBottom = "10px";

        const grid = scrollWrapper.createEl("div");
        grid.addClass("card-buttons-wizard-preview");
        if (this.styleId) grid.setAttribute(`data-style-${this.styleId}`, "");
        grid.style.setProperty("--img-ratio", `${this.imgRatio}%`);

        // Layout Logic: Grid with Strict Auto Rows to prevent Overlap
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(200px, 1fr))`;
        grid.style.gap = "20px";
        grid.style.marginBottom = "20px";
        // V3.7.1 Fix: Ensure Grid items don't collapse or overlap vertically
        grid.style.gridAutoRows = "minmax(min-content, max-content)";
        grid.style.alignItems = "start"; // Vertical alignment top

        // Render Buttons using Helper
        this.buttons.forEach((btn, idx) => {
            const wrapper = grid.createEl("div");
            wrapper.style.minWidth = "0";
            this.renderCardPreview(
                btn,
                wrapper,
                () => { this.buttons.splice(idx, 1); this.render(); },
                () => { this.editingIndex = idx; this.render(); }
            );
        });

        // Add New Card
        const addCard = grid.createEl("div");
        addCard.style.border = "2px dashed var(--background-modifier-border)";
        addCard.style.borderRadius = "8px";

        // Height constraints for add card
        if (this.ratio !== "auto") {
            addCard.style.aspectRatio = this.ratio;
        } else {
            if (this.direction === "top" || this.direction === "bottom") {
                addCard.style.minHeight = "240px";
                addCard.style.height = "auto";
            } else {
                addCard.style.height = "120px";
            }
        }

        addCard.style.display = "flex";
        addCard.style.alignItems = "center";
        addCard.style.justifyContent = "center";
        addCard.style.cursor = "pointer";
        addCard.style.opacity = "0.7";
        addCard.onmouseover = () => addCard.style.opacity = "1";
        addCard.onmouseout = () => addCard.style.opacity = "0.7";

        const addText = addCard.createEl("div", { text: "+ 버튼 추가" });
        addText.style.fontWeight = "bold"; addText.style.fontSize = "1.2em";

        addCard.onclick = () => {
            this.buttons.push({
                title: "새 버튼", desc: "", icon: "", color: "", picture: "", actionType: "command", action: ""
            });
            this.editingIndex = this.buttons.length - 1;
            this.render();
        };

        // --- Footer ---
        const footer = container.createEl("div");
        footer.style.display = "flex";
        footer.style.justifyContent = "flex-end";
        footer.style.gap = "10px";
        footer.style.flexShrink = "0";
        footer.style.borderTop = "1px solid var(--background-modifier-border)";
        footer.style.padding = "10px";
        footer.style.background = "var(--background-primary)";

        new Setting(footer)
            .addButton(btn => btn
                .setButtonText("취소")
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText("⚡️ 적용")
                .setCta()
                .onClick(() => {
                    this.onSubmit(this.generateCode());
                    this.close();
                }));
    }

    renderEditor(container: HTMLElement, idx: number) {
        const btn = this.buttons[idx];
        if (!btn) { this.editingIndex = null; this.render(); return; }

        // Settings Header (Fixed)
        const header = container.createEl("div");
        header.style.display = "flex"; header.style.alignItems = "center"; header.style.gap = "10px";
        header.style.padding = "10px"; header.style.borderBottom = "1px solid var(--background-modifier-border)";
        header.style.flexShrink = "0";

        const backBtn = header.createEl("button", { text: "⬅️ 목록으로" });
        backBtn.onclick = () => { this.editingIndex = null; this.render(); };
        const title = header.createEl("h3", { text: `버튼 #${idx + 1} 편집` });
        title.style.margin = "0";

        // --- Live Preview Area (Fixed) ---
        const previewSection = container.createEl("div");
        previewSection.style.background = "var(--background-secondary)";
        previewSection.style.padding = "10px";
        previewSection.style.display = "flex";
        previewSection.style.justifyContent = "center";
        previewSection.style.alignItems = "center";
        previewSection.style.flexShrink = "0";
        previewSection.style.height = "280px"; // Increased height slightly to accommodate ratios

        previewSection.style.setProperty("--img-ratio", `${this.imgRatio}%`);

        // Wrapper for fixed width preview
        const previewWrapper = previewSection.createEl("div");
        previewWrapper.style.width = "250px";
        previewWrapper.style.transform = "scale(1.0)";
        if (this.styleId) previewWrapper.setAttribute(`data-style-${this.styleId}`, "");

        let currentCard: HTMLElement | null = null;

        const refreshPreview = () => {
            if (currentCard) currentCard.remove();
            currentCard = this.renderCardPreview(btn, previewWrapper);
            currentCard.style.cursor = "default";
            currentCard.onclick = null;
            // Ensure Editor preview respects ratio if set, or defaults to valid appearance
            if (this.ratio && this.ratio !== "auto") currentCard.style.aspectRatio = this.ratio;
        };

        refreshPreview();

        // --- Scrollable Options Body ---
        const body = container.createEl("div");
        body.style.display = "flex"; body.style.gap = "20px";
        body.style.flex = "1";
        body.style.overflowY = "auto";
        body.style.padding = "20px";

        const left = body.createEl("div"); left.style.flex = "1";
        const right = body.createEl("div"); right.style.flex = "1";

        // --- Left: Appearance ---
        left.createEl("h4", { text: "외관 (Appearance)" });

        new Setting(left).setName("제목").addText(t => t.setValue(btn.title).onChange(v => { btn.title = v; refreshPreview(); }));
        new Setting(left).setName("설명").addText(t => t.setValue(btn.desc).onChange(v => { btn.desc = v; refreshPreview(); }));

        // Icon
        const iconSetting = new Setting(left).setName("아이콘 (Icon)");
        const iconPreview = iconSetting.controlEl.createEl("div");
        iconPreview.style.width = "24px"; iconPreview.style.height = "24px"; iconPreview.style.marginRight = "10px";

        const updateIconPreview = () => {
            iconPreview.empty();
            if (btn.icon) setIcon(iconPreview, btn.icon);
        };
        updateIconPreview();

        iconSetting.addButton(b => b.setButtonText(btn.icon || "검색...").onClick(() => {
            new IconSuggesterModal(this.plugin.app, (icon) => {
                btn.icon = icon;
                updateIconPreview();
                b.setButtonText(btn.icon);
                refreshPreview();
            }).open();
        }));

        if (btn.icon) {
            iconSetting.addButton(b => b.setIcon("trash").setTooltip("아이콘 삭제").onClick(() => {
                btn.icon = "";
                updateIconPreview();
                this.render();
            }));
        }

        // Picture 
        new Setting(left).setName("이미지 (Picture)").setDesc("URL 또는 내부 링크").addText(t => t.setValue(btn.picture).onChange(v => { btn.picture = v; refreshPreview(); }));

        // Color
        const colorSetting = new Setting(left).setName("색상 (Color)");
        const paletteContainer = colorSetting.controlEl.createEl("div");
        paletteContainer.style.display = "flex"; paletteContainer.style.gap = "5px"; paletteContainer.style.flexWrap = "wrap"; paletteContainer.style.maxWidth = "200px";

        const noneBox = paletteContainer.createEl("div", { text: "X" });
        noneBox.style.width = "20px"; noneBox.style.height = "20px"; noneBox.style.border = "1px solid #ccc"; noneBox.style.cursor = "pointer"; noneBox.style.textAlign = "center";
        noneBox.onclick = () => { btn.color = ""; refreshPreview(); };

        Object.entries(this.plugin.settings.palettes).forEach(([name, hex]) => {
            const swatch = paletteContainer.createEl("div");
            swatch.style.width = "20px"; swatch.style.height = "20px"; swatch.style.backgroundColor = hex; swatch.style.cursor = "pointer"; swatch.title = name;
            swatch.style.border = "1px solid transparent";
            swatch.onclick = () => { btn.color = name; refreshPreview(); };
        });

        // --- Right: Action ---
        right.createEl("h4", { text: "동작 (Logic)" });

        new Setting(right).setName("동작 유형").addDropdown(d => {
            d.addOption("command", "명령어 실행 (Command)");
            d.addOption("url", "웹 링크 (URL)");
            d.addOption("open", "파일/폴더 열기 (Open)");
            d.addOption("search", "검색 (Search)");
            d.addOption("create", "템플릿으로 생성 (Create)");
            d.addOption("toggle", "속성 토글 (Toggle)");
            d.addOption("copy", "복사 (Copy)");
            d.addOption("js", "자바스크립트 (JS)");
            d.setValue(btn.actionType);
            d.onChange(v => {
                btn.actionType = v as any;
                btn.action = "";
                this.render();
            });
        });

        const actionArea = right.createEl("div");
        actionArea.style.background = "var(--background-secondary)";
        actionArea.style.padding = "15px";
        actionArea.style.borderRadius = "8px";

        const addScanButton = (s: Setting, onClick: () => void) => { s.addButton(b => b.setIcon("search").onClick(onClick)); };

        if (btn.actionType === "url") {
            new Setting(actionArea).setName("URL").addText(t => t.setPlaceholder("https://...").setValue(btn.action).onChange(v => btn.action = v));
            new Setting(actionArea).setName("모바일용 URL").addText(t => t.setValue(btn.arg1 || "").onChange(v => btn.arg1 = v));
        } else if (btn.actionType === "command") {
            const s = new Setting(actionArea).setName("Command ID").addText(t => t.setValue(btn.action).onChange(v => {
                btn.action = v;
            }));

            const cmd = (this.plugin.app as any).commands.findCommand(btn.action);
            if (cmd) {
                const info = actionArea.createEl("div", { text: `✅ ${cmd.name}` });
                info.style.fontSize = "0.9em"; info.style.color = "var(--text-accent)"; info.style.marginTop = "-10px"; info.style.marginBottom = "10px";
            }

            addScanButton(s, () => {
                new CommandSuggesterModal(this.plugin.app, (cmd) => { btn.action = cmd.id; this.render(); }).open();
            });
        } else if (btn.actionType === "open") {
            const s = new Setting(actionArea).setName("경로 (Path)").addText(t => t.setValue(btn.action).onChange(v => btn.action = v));
            addScanButton(s, () => { new FileSuggesterModal(this.plugin.app, (f) => { btn.action = f.path; this.render(); }).open(); });
        } else if (btn.actionType === "create") {
            const s = new Setting(actionArea).setName("템플릿 경로").addText(t => t.setValue(btn.action).onChange(v => btn.action = v));
            addScanButton(s, () => { new FileSuggesterModal(this.plugin.app, (f) => { btn.action = f.path; this.render(); }).open(); });
            new Setting(actionArea).setName("JSON 인자").addTextArea(t => t.setValue(btn.arg1 || "").onChange(v => btn.arg1 = v));
        } else if (btn.actionType === "toggle") {
            new Setting(actionArea).setName("속성 키").addText(t => t.setValue(btn.action).onChange(v => btn.action = v));
            const s = new Setting(actionArea).setName("파일명 (선택)").addText(t => t.setValue(btn.arg1 || "").onChange(v => btn.arg1 = v));
            addScanButton(s, () => { new FileSuggesterModal(this.plugin.app, (f) => { btn.arg1 = f.path; this.render(); }).open(); });
        } else if (btn.actionType === "search") {
            new Setting(actionArea).setName("검색어").addText(t => t.setValue(btn.action).onChange(v => btn.action = v));
        } else if (btn.actionType === "copy") {
            new Setting(actionArea).setName("복사할 텍스트").addTextArea(t => t.setValue(btn.action).onChange(v => btn.action = v));
        } else if (btn.actionType === "js") {
            new Setting(actionArea).setName("JS 코드").addTextArea(t => {
                t.setValue(btn.action).onChange(v => btn.action = v);
                t.inputEl.style.minHeight = "150px";
            });
        }
    }

    generateCode(): string {
        const parts = [];
        // Check if any setting is non-default
        if (this.styleId || this.direction !== "top" || this.imgRatio !== 60 || (this.ratio && this.ratio !== "auto")) {
            parts.push("[setting]");
            if (this.styleId) parts.push(`style: ${this.styleId}`);
            if (this.direction) parts.push(`direction: ${this.direction}`);
            if (this.imgRatio !== 60) parts.push(`img-ratio: ${this.imgRatio}%`);
            if (this.ratio && this.ratio !== "auto") parts.push(`ratio: ${this.ratio}`);
            parts.push("");
        }

        this.buttons.forEach(btn => {
            parts.push("[card]");
            if (btn.title) parts.push(`title: ${btn.title}`);
            if (btn.desc) parts.push(`desc: ${btn.desc}`);
            if (btn.icon) parts.push(`icon: ${btn.icon}`);
            if (btn.color) parts.push(`color: ${btn.color}`);
            if (btn.picture) parts.push(`picture: ${btn.picture}`);

            let actionStr = btn.action;
            if (btn.actionType === "url") {
                actionStr = "url|" + btn.action + (btn.arg1 ? "|" + btn.arg1 : "");
            } else if (btn.actionType === "command") {
                actionStr = "command|" + btn.action;
            } else if (btn.actionType === "open") {
                actionStr = "open|" + btn.action;
            } else if (btn.actionType === "search") {
                actionStr = "search|" + btn.action;
            } else if (btn.actionType === "copy") {
                actionStr = "copy||" + btn.action;
            } else if (btn.actionType === "create") {
                actionStr = "create|" + btn.action + (btn.arg1 ? "|" + btn.arg1 : "");
            } else if (btn.actionType === "toggle") {
                actionStr = "toggle|" + btn.action + (btn.arg1 ? "|" + btn.arg1 : "");
            } else if (btn.actionType === "js") {
                actionStr = "js||" + btn.action;
            } else if (btn.actionType === "chatgpt") { // Legacy?
                actionStr = "chatgpt|" + btn.action;
            }

            if (actionStr) parts.push(`action: ${actionStr}`);
            parts.push("");
        });

        return "```card-buttons\n" + parts.join("\n").trim() + "\n```";
    }

    onClose() {
        this.contentEl.empty();
    }
}
