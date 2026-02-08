import {
    App, TFile, setIcon,
    Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo,
} from 'obsidian';

interface ActionKeyword {
    label: string;
    value: string;
    desc: string;
    icon: string;
}

export default class ActionSuggest extends EditorSuggest<ActionKeyword> {
    private actionList: ActionKeyword[] = [
        { label: "url", value: "url | ", desc: "외부 웹사이트 연결 (데스크탑/모바일 대응)", icon: "external-link" },
        { label: "create", value: "create | ", desc: "템플릿 기반 새 파일 생성 및 속성 주입", icon: "plus-square" },
        { label: "open", value: "open | ", desc: "옵시디언 내부 파일 또는 링크 열기", icon: "file-text" },
        { label: "copy", value: "copy | ", desc: "지정한 텍스트를 클립보드에 복사", icon: "copy" },
        { label: "command", value: "command | ", desc: "옵시디언 명령(Command) 실행", icon: "terminal" },
        { label: "search", value: "search | ", desc: "전체 검색창 열기 및 검색어 입력", icon: "search" },
        { label: "js", value: "js | ", desc: "커스텀 자바스크립트 코드 실행", icon: "code-2" },
        { label: "toggle", value: "toggle | ", desc: "프론트매터 속성 true/false 토글", icon: "toggle-left" }
    ];

    constructor(app: App) { super(app); }

    onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        const sub = line.substring(0, cursor.ch);
        const match = sub.match(/action\s*[:|]\s*$/);

        if (match) {
            return {
                start: { line: cursor.line, ch: sub.length },
                end: cursor,
                query: ""
            };
        }
        return null;
    }

    getSuggestions(context: EditorSuggestContext): ActionKeyword[] {
        return this.actionList;
    }

    renderSuggestion(item: ActionKeyword, el: HTMLElement): void {
        el.addClass("action-suggestion-item");

        el.setCssProps({
            "display": "flex",
            "align-items": "center",
            "gap": "10px",
            "padding": "6px 10px"
        });

        const iconContainer = el.createEl("div", { cls: "action-icon" });
        iconContainer.setCssProps({
            "display": "flex",
            "color": "var(--text-accent)"
        });
        setIcon(iconContainer, item.icon);

        const textContainer = el.createEl("div", { cls: "action-content" });
        textContainer.setCssProps({
            "display": "flex",
            "flex-direction": "column"
        });

        const labelEl = textContainer.createEl("div", {
            text: item.label,
            cls: "action-label"
        });
        labelEl.setCssProps({
            "font-weight": "600",
            "font-size": "0.95em",
            "color": "var(--text-normal)"
        });

        const descEl = textContainer.createEl("div", {
            text: item.desc,
            cls: "action-desc"
        });
        descEl.setCssProps({
            "font-size": "0.8em",
            "color": "var(--text-muted)",
            "line-height": "1.2"
        });
    }

    selectSuggestion(item: ActionKeyword, evt: MouseEvent | KeyboardEvent): void {
        const context = this.context;
        if (context) {
            context.editor.replaceRange(item.value, context.start, context.end);
        }
    }
}