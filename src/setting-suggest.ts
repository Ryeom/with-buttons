import {
    App, TFile, setIcon,
    Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo,
} from 'obsidian';

interface SettingKeyword {
    label: string;
    value: string;
    desc: string;
    icon: string;
}

export default class SettingSuggest extends EditorSuggest<SettingKeyword> {
    private allSettings: SettingKeyword[] = [
        { label: "direction", value: "direction: ", desc: "카드 배치 방향 (vertical / horizontal)", icon: "arrow-up-right" },
        { label: "ratio", value: "ratio: ", desc: "카드 전체 가로세로 비율 (예: 1:1, 16:9)", icon: "maximize" },
        { label: "img-ratio", value: "img-ratio: ", desc: "이미지가 차지하는 비율 (%)", icon: "image" },
        { label: "title-size", value: "title-size: ", desc: "제목 글자 크기 (px)", icon: "type" },
        { label: "desc-size", value: "desc-size: ", desc: "설명 글자 크기 (px)", icon: "align-left" },
        { label: "columns", value: "columns: ", desc: "열 수 지정 (미설정 시 카드 개수)", icon: "columns-3" },
        { label: "style", value: "style: ", desc: "등록된 커스텀 CSS 스타일 ID 적용", icon: "palette" }
    ];

    constructor(app: App) { super(app); }

    onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);

        // 1. 이미 설정이 완료된 줄은 무시
        if (line.includes(":")) return null;

        // 2. 위로 탐색하며 현재 코드 블록의 범위를 확인
        let isInsideSetting = false;
        for (let i = cursor.line - 1; i >= 0; i--) {
            const l = editor.getLine(i);
            if (l.includes("```card-buttons")) {
                break;
            }
            if (l.includes("[setting]")) isInsideSetting = true;
            if (l.includes("[card]")) {
                isInsideSetting = false;
                break;
            }
        }
        if (isInsideSetting) {
            return {
                start: { line: cursor.line, ch: 0 },
                end: { line: cursor.line, ch: line.length },
                query: line.trim()
            };
        }
        return null;
    }

    getSuggestions(context: EditorSuggestContext): SettingKeyword[] {
        const { query, editor, start } = context;
        let blockText = "";
        for (let i = start.line; i >= 0; i--) {
            const l = editor.getLine(i);
            blockText = l + "\n" + blockText;
            if (l.includes("```card-buttons")) break;
        }
        for (let i = start.line + 1; i < editor.lineCount(); i++) {
            const l = editor.getLine(i);
            if (l.includes("```")) break;
            blockText += l + "\n";
        }

        const available = this.allSettings.filter(setting => {
            const regex = new RegExp(`^${setting.label}\\s*:`, "m");
            return !regex.test(blockText);
        });

        if (!query) return available;
        return available.filter(s => s.label.toLowerCase().includes(query.toLowerCase()));
    }

    renderSuggestion(item: SettingKeyword, el: HTMLElement): void {
        el.addClass("setting-suggestion-item");
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.gap = "10px";
        el.style.padding = "6px 12px";

        const iconContainer = el.createEl("div");
        iconContainer.style.color = "var(--text-accent)";
        setIcon(iconContainer, item.icon);

        const textContainer = el.createEl("div");
        textContainer.style.display = "flex";
        textContainer.style.flexDirection = "column";

        textContainer.createEl("div", {
            text: item.label,
            attr: { style: "font-weight: 600; font-size: 0.9em;" }
        });
        textContainer.createEl("small", {
            text: item.desc,
            attr: { style: "opacity: 0.6; font-size: 0.75em;" }
        });
    }

    selectSuggestion(item: SettingKeyword, evt: MouseEvent | KeyboardEvent): void {
        const context = this.context;
        if (context) {
            context.editor.replaceRange(item.value, { line: context.start.line, ch: 0 }, { line: context.start.line, ch: context.editor.getLine(context.start.line).length });
            context.editor.setCursor({ line: context.start.line, ch: item.value.length });
        }
    }
}