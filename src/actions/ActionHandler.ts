
import { App, Notice, TFile, Command, Modal, Setting } from "obsidian";

/**
 * Interface for any action type (Command, URL, File Open, etc.)
 */
export interface ActionStrategy {
    id: string; // "url", "command", "open"
    name: string; // "Web Link", "Obsidian Command"

    /**
     * Executes the action.
     * @param app Obsidian App instance
     * @param param The primary parameter (e.g. URL, Command ID)
     * @param arg1 Optional extra argument (e.g. Mobile URL, JSON args)
     */
    execute(app: App, param: string, arg1?: string): Promise<void> | void;

    /**
     * Render settings UI for this action in the Wizard.
     * @param container The settings area container
     * @param currentVal Current primary value
     * @param currentArg Current secondary value
     * @param onChange Callback when values change
     */
    renderSettings(
        container: HTMLElement,
        currentVal: string,
        currentArg: string,
        onChange: (val: string, arg?: string) => void,
        app: App // For suggest modals
    ): void;
}

// --- Concrete Strategies ---

export class CommandAction implements ActionStrategy {
    id = "command";
    name = "명령어 실행 (Command)";

    execute(app: App, param: string) {
        if (!param) return;
        const success = (app as any).commands.executeCommandById(param);
        if (!success) {
            new Notice(`명령어 실행 실패: '${param}' ID를 확인해주세요.`);
            console.warn(`With Buttons: Command '${param}' not found.`);
        }
    }

    renderSettings(container: HTMLElement, currentVal: string, currentArg: string, onChange: (v: string) => void, app: App) {
        const s = new Setting(container).setName("Command ID").addText(t => t.setValue(currentVal).onChange(v => onChange(v)));

        // Command Preview
        const cmd = (app as any).commands.findCommand(currentVal);
        if (cmd) {
            const info = container.createEl("div", { text: `✅ ${cmd.name}` });
            info.style.fontSize = "0.9em"; info.style.color = "var(--text-accent)"; info.style.marginTop = "-10px"; info.style.marginBottom = "10px";
        }

        // Suggester Button
        s.addButton(b => b.setIcon("search").onClick(() => {
            // We need to access CommandSuggesterModal. Ideally it should be exported or passed.
            // For now, we assume the caller handles complex modals or we re-implement a simple one.
            // To simplify refactoring, we'll suggest just Text input for now or better, expose suggesters later.
            new Notice("명령어 ID를 입력하세요.");
        }));
    }
}

export class UrlAction implements ActionStrategy {
    id = "url";
    name = "웹 링크 (URL)";

    execute(app: App, param: string, arg1?: string) {
        if (!param) return;
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const url = param.startsWith("http") ? param : `https://${param}`;

        if (isMobile && arg1) {
            window.location.href = arg1; // Mobile Scheme
            // Fallback logic omitted for brevity, but can be added
        } else {
            window.open(url);
        }
    }

    renderSettings(container: HTMLElement, currentVal: string, currentArg: string, onChange: (v: string, a?: string) => void) {
        new Setting(container).setName("URL").addText(t => t.setPlaceholder("https://...").setValue(currentVal).onChange(v => onChange(v, currentArg)));
        new Setting(container).setName("모바일용 URL (선택)").addText(t => t.setValue(currentArg || "").onChange(v => onChange(currentVal, v)));
    }
}

// ... (Previous Command/URL actions)

export class OpenAction implements ActionStrategy {
    id = "open";
    name = "파일/폴더 열기 (Open)";

    async execute(app: App, param: string) {
        if (!param) return;
        await app.workspace.openLinkText(param, "", true);
    }

    renderSettings(container: HTMLElement, currentVal: string, currentArg: string, onChange: (v: string) => void, app: App) {
        const s = new Setting(container).setName("경로 (Path)").addText(t => t.setValue(currentVal).onChange(v => onChange(v)));
        // Ideally we'd invoke the FileSuggester here
        s.addButton(b => b.setIcon("search").onClick(() => {
            new Notice("파일 경로를 입력하세요.");
        }));
    }
}

export class ToggleAction implements ActionStrategy {
    id = "toggle";
    name = "속성 토글 (Toggle)";

    execute(app: App, param: string, arg1?: string) {
        if (!param) return;
        // Logic to find file and toggle property
        const file = arg1 && arg1 !== param ? app.metadataCache.getFirstLinkpathDest(arg1, "") : app.workspace.getActiveFile();
        if (file instanceof TFile) {
            app.fileManager.processFrontMatter(file, (fm) => {
                const cur = fm[param];
                fm[param] = cur === true ? false : true;
            });
        }
    }

    renderSettings(container: HTMLElement, currentVal: string, currentArg: string, onChange: (v: string, a?: string) => void, app: App) {
        new Setting(container).setName("속성 키 (Property Key)").addText(t => t.setValue(currentVal).onChange(v => onChange(v, currentArg)));
        new Setting(container).setName("파일명 (선택)").addText(t => t.setValue(currentArg || "").onChange(v => onChange(currentVal, v)));
    }
}

export class CopyAction implements ActionStrategy {
    id = "copy";
    name = "복사 (Copy)";

    async execute(app: App, param: string) {
        if (!param) return;
        await navigator.clipboard.writeText(param);
        new Notice(`복사되었습니다: ${param}`);
    }

    renderSettings(container: HTMLElement, currentVal: string, currentArg: string, onChange: (v: string) => void) {
        new Setting(container).setName("복사할 텍스트").addTextArea(t => t.setValue(currentVal).onChange(v => onChange(v)));
    }
}

export class JsAction implements ActionStrategy {
    id = "js";
    name = "자바스크립트 (JS)";

    execute(app: App, param: string) {
        if (!param) return;
        try {
            // Safe(r) execution context
            const obsidian = require('obsidian');
            new Function('app', 'Notice', 'obsidian', param)(app, Notice, obsidian);
        } catch (e) {
            new Notice("JS 실행 오류");
            console.error(e);
        }
    }

    renderSettings(container: HTMLElement, currentVal: string, currentArg: string, onChange: (v: string) => void) {
        new Setting(container).setName("JS 코드").addTextArea(t => {
            t.setValue(currentVal).onChange(v => onChange(v));
            t.inputEl.style.minHeight = "150px";
        });
    }
}

import { createNewFileFromTemplate } from "../utils";

export class CreateAction implements ActionStrategy {
    id = "create";
    name = "템플릿으로 생성 (Create)";

    async execute(app: App, param: string, arg1?: string) {
        if (!param) return;
        await createNewFileFromTemplate(app, param, arg1);
    }

    renderSettings(container: HTMLElement, currentVal: string, currentArg: string, onChange: (v: string, a?: string) => void, app: App) {
        new Setting(container).setName("템플릿 경로").addText(t => t.setValue(currentVal).onChange(v => onChange(v, currentArg)));
        new Setting(container).setName("JSON 인자").addTextArea(t => t.setValue(currentArg || "").onChange(v => onChange(currentVal, v)));
    }
}


export class ActionRegistry {
    private strategies: Record<string, ActionStrategy> = {};

    constructor() {
        this.register(new CommandAction());
        this.register(new UrlAction());
        this.register(new OpenAction());
        this.register(new ToggleAction());
        this.register(new CopyAction());
        this.register(new JsAction());
        this.register(new CreateAction()); // Note: Simplistic implementation
    }

    register(strategy: ActionStrategy) {
        this.strategies[strategy.id] = strategy;
    }

    get(id: string): ActionStrategy | undefined {
        return this.strategies[id];
    }

    getAll(): ActionStrategy[] {
        return Object.values(this.strategies);
    }
}

export const actionRegistry = new ActionRegistry();
