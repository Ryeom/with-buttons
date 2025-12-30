import {
    App, TFile,
    Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo
} from 'obsidian';

export default class FileSuggest extends EditorSuggest<TFile> {
    constructor(app: App) { super(app); }

    onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        const sub = line.substring(0, cursor.ch);
        const match = sub.match(/(open|create|picture)\s*[:|]\s*([^:|]*)$/);

        if (match && match[2] !== undefined) {
            return {
                start: { line: cursor.line, ch: sub.lastIndexOf(match[2] ?? "") },
                end: cursor,
                query: match[2]
            };
        }
        return null;
    }

    getSuggestions(context: EditorSuggestContext): TFile[] {
        const query = context.query.toLowerCase();
        const line = context.editor.getLine(context.start.line).substring(0, context.start.ch);

        if (line.includes('picture')) {
            return this.app.vault.getFiles().filter(f =>
                ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(f.extension.toLowerCase()) &&
                f.path.toLowerCase().includes(query)
            );
        }

        return this.app.vault.getMarkdownFiles().filter(f =>
            f.path.toLowerCase().includes(query)
        );
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        const isImage = !['md'].includes(file.extension.toLowerCase());
        el.createEl("div", { text: file.basename + (isImage ? `.${file.extension}` : ""), cls: "file-suggestion-title" });
        el.createEl("small", { text: file.path, attr: { style: "display: block; font-size: 0.8em; opacity: 0.6;" } });
    }

    selectSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent): void {
        const context = this.context;
        if (context) {
            context.editor.replaceRange(file.path, context.start, context.end);
        }
    }
}