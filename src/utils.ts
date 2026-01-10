import { App, Notice, TFile } from "obsidian";

export async function createNewFileFromTemplate(app: App, tPath: string, rawArgs: string = "") {
    try {
        const tFile = app.metadataCache.getFirstLinkpathDest(tPath, "");
        if (!tFile || !(tFile instanceof TFile)) {
            new Notice("템플릿 탐색 실패");
            return;
        }
        let content = await app.vault.read(tFile);

        let newProps: any = {};
        if (rawArgs.trim().startsWith("{")) {
            try {
                newProps = JSON.parse(rawArgs);
            } catch {
                new Notice("JSON 형식 오류");
                return;
            }
        } else if (rawArgs.trim().length > 0) {
            newProps = { tags: rawArgs.split(",").map(t => t.trim()) };
        }

        if (Object.keys(newProps).length > 0) content = mergeYaml(content, newProps);

        const now = new Date();
        const dateStr = `${now.getFullYear()}년 ${String(now.getMonth() + 1).padStart(2, '0')}월 ${String(now.getDate()).padStart(2, '0')}일`;
        const timeStr = `${String(now.getHours()).padStart(2, '0')}시 ${String(now.getMinutes()).padStart(2, '0')}분 ${String(now.getSeconds()).padStart(2, '0')}초 생성`;
        let base = `무제 ${dateStr} ${timeStr}`;
        let finalPath = `${base}.md`;
        let counter = 1;
        while (await app.vault.adapter.exists(finalPath)) finalPath = `${base} (${counter++}).md`;

        const nFile = await app.vault.create(finalPath, content);
        await app.workspace.getLeaf('tab').openFile(nFile);
        new Notice("병합 완료");
    } catch (e) {
        console.error(e);
        new Notice("생성 실패");
    }
}

export function mergeYaml(content: string, props: any) {
    if (content.startsWith("---")) {
        const parts = content.split("---");
        const yamlPart = parts[1];
        if (yamlPart && parts.length >= 3) {
            let yamlLines = yamlPart.split("\n").filter(l => l.trim() !== "");
            for (const [key, value] of Object.entries(props)) {
                const idx = yamlLines.findIndex(l => l.trim().startsWith(`${key}:`));
                if (idx !== -1) {
                    if (Array.isArray(value)) yamlLines.splice(idx + 1, 0, ...value.map(v => `  - ${v}`));
                    else yamlLines[idx] = `${key}: ${value}`;
                } else {
                    if (Array.isArray(value)) { yamlLines.push(`${key}:`); yamlLines.push(...value.map(v => `  - ${v}`)); }
                    else yamlLines.push(`${key}: ${value}`);
                }
            }
            parts[1] = "\n" + yamlLines.join("\n") + "\n";
            return parts.join("---");
        }
    } else {
        let newYaml = "---\n";
        for (const [key, value] of Object.entries(props)) {
            if (Array.isArray(value)) newYaml += `${key}:\n${value.map(v => `  - ${v}`).join("\n")}\n`;
            else newYaml += `${key}: ${value}\n`;
        }
        return newYaml + "---\n\n" + content;
    }
    return content;
}
