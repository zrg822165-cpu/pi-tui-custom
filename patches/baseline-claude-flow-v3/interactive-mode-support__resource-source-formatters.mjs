export function getDisplaySourceInfo(sourceInfo) {
    const source = sourceInfo?.source ?? "local";
    const scope = sourceInfo?.scope ?? "project";
    if (source === "local") {
        if (scope === "user") {
            return { label: "user", color: "muted" };
        }
        if (scope === "project") {
            return { label: "project", color: "muted" };
        }
        if (scope === "temporary") {
            return { label: "path", scopeLabel: "temp", color: "muted" };
        }
        return { label: "path", color: "muted" };
    }
    if (source === "cli") {
        return { label: "path", scopeLabel: scope === "temporary" ? "temp" : undefined, color: "muted" };
    }
    const scopeLabel = scope === "user" ? "user" : scope === "project" ? "project" : scope === "temporary" ? "temp" : undefined;
    return { label: source, scopeLabel, color: "accent" };
}

export function getScopeGroup(sourceInfo) {
    const source = sourceInfo?.source ?? "local";
    const scope = sourceInfo?.scope ?? "project";
    if (source === "cli" || scope === "temporary") {
        return "path";
    }
    if (scope === "user") {
        return "user";
    }
    if (scope === "project") {
        return "project";
    }
    return "path";
}

export function isPackageSource(sourceInfo) {
    const source = sourceInfo?.source ?? "";
    return source.startsWith("npm:") || source.startsWith("git:");
}

export function buildScopeGroups(items, options = {}) {
    const getGroup = options.getScopeGroup ?? getScopeGroup;
    const checkPackageSource = options.isPackageSource ?? isPackageSource;
    const groups = {
        user: { scope: "user", paths: [], packages: new Map() },
        project: { scope: "project", paths: [], packages: new Map() },
        path: { scope: "path", paths: [], packages: new Map() },
    };
    for (const item of items) {
        const groupKey = getGroup(item.sourceInfo);
        const group = groups[groupKey];
        const source = item.sourceInfo?.source ?? "local";
        if (checkPackageSource(item.sourceInfo)) {
            const list = group.packages.get(source) ?? [];
            list.push(item);
            group.packages.set(source, list);
        }
        else {
            group.paths.push(item);
        }
    }
    return [groups.project, groups.user, groups.path].filter((group) => group.paths.length > 0 || group.packages.size > 0);
}

export function formatScopeGroups(groups, options) {
    const lines = [];
    for (const group of groups) {
        lines.push(options.formatGroupHeader(group.scope));
        const sortedPaths = [...group.paths].sort((a, b) => a.path.localeCompare(b.path));
        for (const item of sortedPaths) {
            lines.push(options.formatPathLine(options.formatPath(item)));
        }
        const sortedPackages = Array.from(group.packages.entries()).sort(([a], [b]) => a.localeCompare(b));
        for (const [source, items] of sortedPackages) {
            lines.push(options.formatPackageHeader(source));
            const sortedPackagePaths = [...items].sort((a, b) => a.path.localeCompare(b.path));
            for (const item of sortedPackagePaths) {
                lines.push(options.formatPackagePathLine(options.formatPackagePath(item, source)));
            }
        }
    }
    return lines.join("\n");
}

export function formatScopeGroupsForHost(groups, options) {
    return formatScopeGroups(groups, {
        ...options,
        formatGroupHeader: (scope) => `  ${theme.fg("accent", scope)}`,
        formatPathLine: (line) => theme.fg("dim", `    ${line}`),
        formatPackageHeader: (source) => `    ${theme.fg("mdLink", source)}`,
        formatPackagePathLine: (line) => theme.fg("dim", `      ${line}`),
    });
}

export function findSourceInfoForPath(p, sourceInfos) {
    const exact = sourceInfos.get(p);
    if (exact) {
        return exact;
    }
    let current = p;
    while (current.includes("/")) {
        current = current.substring(0, current.lastIndexOf("/"));
        const parent = sourceInfos.get(current);
        if (parent) {
            return parent;
        }
    }
    return undefined;
}

export function formatPathWithSource(p, sourceInfo, options) {
    if (sourceInfo) {
        const shortPath = options.getShortPath(p, sourceInfo);
        const { label, scopeLabel } = getDisplaySourceInfo(sourceInfo);
        const labelText = scopeLabel ? `${label} (${scopeLabel})` : label;
        return `${labelText} ${shortPath}`;
    }
    return options.formatDisplayPath(p);
}

export function formatPathWithSourceForHost(host, p, sourceInfo) {
    return formatPathWithSource(p, sourceInfo, {
        getShortPath: (pathValue, sourceInfoValue) => host.getShortPath(pathValue, sourceInfoValue),
        formatDisplayPath: (pathValue) => host.formatDisplayPath(pathValue),
    });
}

export function formatDiagnostics(diagnostics, sourceInfos, options) {
    const lines = [];
    const collisions = new Map();
    const otherDiagnostics = [];
    for (const d of diagnostics) {
        if (d.type === "collision" && d.collision) {
            const list = collisions.get(d.collision.name) ?? [];
            list.push(d);
            collisions.set(d.collision.name, list);
        }
        else {
            otherDiagnostics.push(d);
        }
    }
    for (const [name, collisionList] of collisions) {
        const first = collisionList[0]?.collision;
        if (!first) {
            continue;
        }
        lines.push(options.formatCollisionHeader(name));
        lines.push(options.formatCollisionWinner(formatPathWithSource(first.winnerPath, findSourceInfoForPath(first.winnerPath, sourceInfos), options)));
        for (const d of collisionList) {
            if (d.collision) {
                lines.push(options.formatCollisionLoser(formatPathWithSource(d.collision.loserPath, findSourceInfoForPath(d.collision.loserPath, sourceInfos), options)));
            }
        }
    }
    for (const d of otherDiagnostics) {
        if (d.path) {
            const formattedPath = formatPathWithSource(d.path, findSourceInfoForPath(d.path, sourceInfos), options);
            lines.push(options.formatDiagnosticPath(d.type, formattedPath));
            lines.push(options.formatDiagnosticMessage(d.type, d.message));
        }
        else {
            lines.push(options.formatDiagnosticOnly(d.type, d.message));
        }
    }
    return lines.join("\n");
}

export function formatDiagnosticsForHost(host, diagnostics, sourceInfos) {
    return formatDiagnostics(diagnostics, sourceInfos, {
        getShortPath: (pathValue, sourceInfoValue) => host.getShortPath(pathValue, sourceInfoValue),
        formatDisplayPath: (pathValue) => host.formatDisplayPath(pathValue),
        formatCollisionHeader: (name) => theme.fg("warning", `  "${name}" collision:`),
        formatCollisionWinner: (formattedPath) => theme.fg("dim", `    ${theme.fg("success", "✓")} ${formattedPath}`),
        formatCollisionLoser: (formattedPath) => theme.fg("dim", `    ${theme.fg("warning", "✗")} ${formattedPath} (skipped)`),
        formatDiagnosticPath: (type, formattedPath) => theme.fg(type === "error" ? "error" : "warning", `  ${formattedPath}`),
        formatDiagnosticMessage: (type, message) => theme.fg(type === "error" ? "error" : "warning", `    ${message}`),
        formatDiagnosticOnly: (type, message) => theme.fg(type === "error" ? "error" : "warning", `  ${message}`),
    });
}
import { theme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";

