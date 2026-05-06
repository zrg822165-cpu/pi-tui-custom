import { Container, Text } from "@mariozechner/pi-tui";
import { theme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";

export const DEFAULT_MAX_WIDGET_LINES = 10;

function disposeExisting(map, key) {
    const existing = map.get(key);
    existing?.dispose?.();
    map.delete(key);
}

export function createExtensionWidgetComponent(content, options) {
    if (Array.isArray(content)) {
        const container = new Container();
        const maxLines = options.maxLines ?? DEFAULT_MAX_WIDGET_LINES;
        for (const line of content.slice(0, maxLines)) {
            container.addChild(new Text(line, 1, 0));
        }
        if (content.length > maxLines) {
            container.addChild(new Text(options.formatTruncatedText("... (widget truncated)"), 1, 0));
        }
        return container;
    }
    return content(options.ui, options.theme);
}

export function setExtensionWidget(widgetState, key, content, options = {}) {
    const placement = options.placement ?? "aboveEditor";
    disposeExisting(widgetState.above, key);
    disposeExisting(widgetState.below, key);
    if (content === undefined) {
        return;
    }
    const component = createExtensionWidgetComponent(content, options);
    const targetMap = placement === "belowEditor" ? widgetState.below : widgetState.above;
    targetMap.set(key, component);
}

export function setExtensionWidgetForHost(host, key, content, options = {}) {
    const widgetTheme = options.theme ?? theme;
    setExtensionWidget({
        above: host.extensionWidgetsAbove,
        below: host.extensionWidgetsBelow,
    }, key, content, {
        ...options,
        ui: host.ui,
        theme: widgetTheme,
        maxLines: options.maxLines ?? DEFAULT_MAX_WIDGET_LINES,
        formatTruncatedText: options.formatTruncatedText ?? ((text) => widgetTheme.fg("muted", text)),
    });
    host.renderWidgets();
}

export function clearExtensionWidgets(widgetState) {
    for (const widget of widgetState.above.values()) {
        widget.dispose?.();
    }
    for (const widget of widgetState.below.values()) {
        widget.dispose?.();
    }
    widgetState.above.clear();
    widgetState.below.clear();
}

export function clearExtensionWidgetsForHost(host) {
    clearExtensionWidgets({
        above: host.extensionWidgetsAbove,
        below: host.extensionWidgetsBelow,
    });
    host.renderWidgets();
}

export function renderExtensionWidgets(widgetState, rendererHost) {
    rendererHost.setWidgetSlot("aboveEditor", [...widgetState.above.values()], {
        spacerWhenEmpty: true,
        leadingSpacer: true,
    });
    rendererHost.setWidgetSlot("belowEditor", [...widgetState.below.values()], {
        spacerWhenEmpty: false,
        leadingSpacer: false,
    });
}

export function renderExtensionWidgetsForHost(host) {
    renderExtensionWidgets({
        above: host.extensionWidgetsAbove,
        below: host.extensionWidgetsBelow,
    }, host.rendererHost);
    host.ui.requestRender();
}
