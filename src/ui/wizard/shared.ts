import { App, FuzzySuggestModal, getIconIds, setIcon, TFile, Command, FuzzyMatch } from "obsidian";

export interface ButtonConfig {
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

export class IconSuggesterModal extends FuzzySuggestModal<string> {
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

export class CommandSuggesterModal extends FuzzySuggestModal<Command> {
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

export class FileSuggesterModal extends FuzzySuggestModal<TFile> {
    constructor(app: App, private onChoose: (file: TFile) => void) { super(app); }
    getItems(): TFile[] { return this.app.vault.getFiles(); }
    getItemText(item: TFile): string { return item.path; }
    onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent): void { this.onChoose(item); }
}

export function resolveResourcePath(app: App, path: string): string {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    const file = app.metadataCache.getFirstLinkpathDest(path, "");
    if (file instanceof TFile) return app.vault.adapter.getResourcePath(file.path);
    return path;
}
