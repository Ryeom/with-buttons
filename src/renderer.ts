
import { App, setIcon, TFile } from "obsidian";

export interface CardButtonConfig {
    title: string;
    desc: string;
    icon: string;
    color: string;
    picture: string;
    actionType?: string;
    action: string;
    arg1?: string; // Optional (e.g., mobile URL or JSON arg)
}

export interface CardLayoutConfig {
    styleId: string;
    direction: "top" | "bottom" | "left" | "right";
    imgRatio: number; // 10-90
    ratio: string;    // "auto", "1/1", "16/9"
    palettes: Record<string, string>;
}

/**
 * Shared helper to resolve resource path for images.
 */
export function resolveResourcePath(app: App, path: string): string {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    const file = app.metadataCache.getFirstLinkpathDest(path, "");
    if (file instanceof TFile) return app.vault.adapter.getResourcePath(file.path);
    return path;
}

/**
 * Core function to render a single Card Button.
 * Used by:
 * 1. Wizard (Preview)
 * 2. Main (Block Renderer)
 */
export function renderCardButton(
    btn: CardButtonConfig,
    container: HTMLElement,
    layout: CardLayoutConfig,
    app: App,
    callbacks?: {
        onDelete?: () => void,
        onClick?: () => void
    }
): HTMLElement {
    const card = container.createEl("div");
    card.className = "card-item card-btn";

    // Base Styling
    if (!layout.styleId) {
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

    // Direction Logic
    if (layout.direction === "top") card.style.flexDirection = "column";
    else if (layout.direction === "bottom") card.style.flexDirection = "column-reverse";
    else if (layout.direction === "left") card.style.flexDirection = "row";
    else if (layout.direction === "right") card.style.flexDirection = "row-reverse";

    const isColumn = (layout.direction === "top" || layout.direction === "bottom");
    const isAuto = (!layout.ratio || layout.ratio === "auto");

    // 1. Container Sizing
    if (!isAuto) {
        // FIXED RATIO MODE
        card.style.aspectRatio = layout.ratio;
        card.style.height = "auto";
        card.style.width = "100%"; // Fill Grid Cell
    } else {
        // AUTO MODE (Content Driven)
        card.style.height = "100%";
        if (isColumn && !layout.styleId) {
            card.style.minHeight = "200px";
        } else if (!isColumn) {
            card.style.height = "160px";
        }
    }

    let bgColor = layout.palettes[btn.color] || btn.color;

    // 2. Image Area
    const imgArea = card.createEl("div");
    imgArea.className = "card-img-area";
    imgArea.style.flexShrink = "0";

    if (isColumn) {
        imgArea.style.width = "100%";
        if (!isAuto) {
            // Fixed Mode: Percent Height
            imgArea.style.height = `${layout.imgRatio}%`;
        } else {
            // Auto Mode: Dynamic Aspect Ratio based on Slider (V3.9.1 Fix)
            // Map 10-90 range to aspect ratio. 50% = 1/1. 
            // Formula: ratio = imgRatio / (100 - imgRatio) * adjustment?
            // Simple split logic: ratio = img / text.
            const ratioVal = layout.imgRatio / (100 - layout.imgRatio);
            // Multiplier to make it feel natural (60% -> ~1.77 for 16:9)
            // 60/40 = 1.5. 
            imgArea.style.height = "auto";
            imgArea.style.aspectRatio = `${ratioVal * 2.5}`; // 2.5 factor for wider default (V4.2 User Feedback)
        }
    } else {
        // Row Layout (Left/Right)
        imgArea.style.height = "100%";
        imgArea.style.width = `${layout.imgRatio}%`;
    }

    // V3.9.1 Fix: Apply card color to image area if set (looks better for icon-only cards)
    const hasContent = !!(btn.picture || btn.icon);
    const hasColor = !!bgColor;

    imgArea.style.background = bgColor || "var(--interactive-accent)";

    // Only reduce opacity if there is NO content AND NO custom color
    if (!hasContent && !hasColor) {
        imgArea.style.opacity = "0.7";
    } else {
        imgArea.style.opacity = "1"; // Reset for re-renders
    }

    imgArea.style.display = "flex";
    imgArea.style.alignItems = "center";
    imgArea.style.justifyContent = "center";
    imgArea.style.color = "#fff";
    imgArea.style.backgroundSize = "cover";
    imgArea.style.backgroundPosition = "center";

    if (btn.picture) {
        const src = resolveResourcePath(app, btn.picture);
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
        if (!layout.styleId) infoArea.style.background = "var(--background-secondary)";
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

    // Optional: Delete Button (Edit Mode)
    if (callbacks && callbacks.onDelete) {
        const delBtn = card.createEl("div", { text: "❌" });
        delBtn.style.position = "absolute"; delBtn.style.top = "5px"; delBtn.style.right = "5px";
        delBtn.style.cursor = "pointer"; delBtn.style.background = "rgba(0,0,0,0.5)";
        delBtn.style.borderRadius = "50%"; delBtn.style.width = "24px"; delBtn.style.height = "24px";
        delBtn.style.textAlign = "center"; delBtn.style.lineHeight = "24px"; delBtn.style.zIndex = "10";
        delBtn.onclick = (e) => { e.stopPropagation(); callbacks.onDelete?.(); };
    }

    // Click Handler
    if (callbacks && callbacks.onClick) {
        card.onclick = callbacks.onClick;
    }

    return card;
}
