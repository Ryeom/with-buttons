import { App, Modal, Notice } from "obsidian";
import MyPlugin from "../../main";
import { ButtonConfig } from "./shared";
import { WizardListView } from "./WizardListView";
import { WizardEditorView } from "./WizardEditorView";
import { CSSEditModal } from "../../settings";

export class CardWizardModal extends Modal {
    public styleId: string = "";
    public direction: "top" | "bottom" | "left" | "right" = "top";
    public imgRatio: number = 60;
    public ratio: string = "auto";
    public grid: string = ""; // V4.1: Grid Dimensions (NxM)
    public textLayout: "vertical" | "horizontal" = "vertical"; // V4.2
    public titleSize: string = ""; // V4.3
    public descSize: string = ""; // V4.3


    public buttons: ButtonConfig[] = [];
    public editingIndex: number | null = null;
    public isEditorView: boolean = false;

    constructor(
        app: App,
        public plugin: MyPlugin,
        private onSubmitCallback: (result: string) => void
    ) {
        super(app);
    }

    onOpen() {
        this.modalEl.style.width = "900px";
        this.modalEl.style.maxWidth = "95vw";
        this.modalEl.style.height = "85vh";
        this.render();
    }

    render() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.style.display = "flex"; contentEl.style.flexDirection = "column"; contentEl.style.height = "100%";

        // ... inside render() ...
        const headerContainer = contentEl.createEl("div");
        headerContainer.style.display = "flex";
        headerContainer.style.justifyContent = "space-between";
        headerContainer.style.alignItems = "center";
        headerContainer.style.flexShrink = "0";
        headerContainer.style.marginBottom = "10px";

        const header = headerContainer.createEl("h2", { text: "🧙‍♂️ 버튼 생성 마법사 (Wizard V4.3)" });
        header.style.margin = "0";

        const styleBtn = headerContainer.createEl("button", { text: "🎨 스타일 편집" });
        styleBtn.onclick = () => {
            const sid = this.styleId || "";
            const css = this.plugin.settings.customStyles[sid] || "";
            new CSSEditModal(this.plugin.app, sid, css, async (newId: string, newCss: string) => {
                // Update Settings
                if (newId !== sid) {
                    if (this.plugin.settings.customStyles[newId]) {
                        // Conflict
                    } else {
                        delete this.plugin.settings.customStyles[sid];
                    }
                    this.styleId = newId;
                }
                this.plugin.settings.customStyles[newId] = newCss;
                await this.plugin.saveSettings();
                this.render(); // Refresh Wizard
            }).open();
        };

        const viewContainer = contentEl.createEl("div");
        viewContainer.style.flex = "1";
        viewContainer.style.overflow = "hidden";
        viewContainer.style.display = "flex";
        viewContainer.style.flexDirection = "column";

        if (this.editingIndex !== null) {
            const btn = this.buttons[this.editingIndex];
            if (btn) {
                this.isEditorView = true;
                new WizardEditorView(this, this.plugin, btn, this.editingIndex).render(viewContainer);
            } else {
                this.editingIndex = null;
                this.isEditorView = false;
                new WizardListView(this, this.plugin, this.buttons).render(viewContainer);
            }
        } else {
            this.isEditorView = false;
            new WizardListView(this, this.plugin, this.buttons).render(viewContainer);
        }
    }

    submit() {
        this.onSubmitCallback(this.generateCode());
    }

    importFromSource(source: string) {
        // Parse settings
        const settingMatch = source.match(/\[setting\]([\s\S]*?)(?=\[card\]|$)/);
        if (settingMatch && settingMatch[1]) {
            const lines = settingMatch[1].split("\n");
            lines.forEach(line => {
                const separator = line.includes("|") ? "|" : ":";
                const parts = line.split(separator);
                if (parts.length < 2) return;
                const key = parts[0]?.trim().toLowerCase();
                const val = parts[1]?.trim();
                if (!key) return;
                if (key === "style") this.styleId = val || "";
                if (key === "direction") {
                    const d = val?.toLowerCase() || "";
                    if (["top", "bottom", "left", "right"].includes(d)) this.direction = d as any;
                }
                if (key === "img-ratio") this.imgRatio = parseInt(val || "60") || 60;
                if (key === "ratio") this.ratio = val || "auto";
                if (key === "grid") this.grid = val || "";
                if (key === "textlayout") this.textLayout = (val === "horizontal") ? "horizontal" : "vertical";
                if (key === "titlesize") this.titleSize = val || "";
                if (key === "descsize") this.descSize = val || "";
            });
        }

        // Parse cards
        const cardMatches = source.split("[card]");
        cardMatches.slice(1).forEach(cardSection => {
            if (!cardSection.trim()) return;
            const btn: ButtonConfig = {
                title: "", desc: "", icon: "", color: "", picture: "",
                actionType: "command", action: "", arg1: ""
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
                        btn.actionType = "command";
                        btn.action = val;
                    }
                }
            });
            this.buttons.push(btn);
        });
    }

    generateCode(): string {
        const parts = [];
        if (this.styleId || this.direction !== "top" || this.imgRatio !== 60 || (this.ratio && this.ratio !== "auto") || this.grid) {
            parts.push("[setting]");
            if (this.styleId) parts.push(`style: ${this.styleId}`);
            if (this.direction) parts.push(`direction: ${this.direction}`);
            if (this.imgRatio !== 60) parts.push(`img-ratio: ${this.imgRatio}%`);
            if (this.ratio && this.ratio !== "auto") parts.push(`ratio: ${this.ratio}`);
            if (this.grid) parts.push(`grid: ${this.grid}`);
            if (this.textLayout === "horizontal") parts.push(`textLayout: horizontal`);
            if (this.titleSize) parts.push(`titleSize: ${this.titleSize}`);
            if (this.descSize) parts.push(`descSize: ${this.descSize}`);

            parts.push("");
        } else {
            if (this.grid) parts.push(`grid: ${this.grid}`);
            if (this.textLayout === "horizontal") parts.push(`textLayout: horizontal`);
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
            if (["url", "create", "toggle"].includes(btn.actionType)) {
                // Format: type|val|arg
                // But wait, existing logic (and ActionHandler) expects:
                // url|url|mobile
                // create|template|args
                // toggle|key|file
                actionStr = `${btn.actionType}|${btn.action}`;
                if (btn.arg1) actionStr += `|${btn.arg1}`;
            } else if (btn.actionType === "copy" || btn.actionType === "js") {
                // copy||text, js||code
                actionStr = `${btn.actionType}||${btn.action}`;
            } else {
                // command, open, search -> command|id
                actionStr = `${btn.actionType}|${btn.action}`;
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
