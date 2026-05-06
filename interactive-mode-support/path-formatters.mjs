import * as os from "node:os";
import * as path from "node:path";
import { parseGitUrl } from "../node_modules/@mariozechner/pi-coding-agent/dist/utils/git.js";
import { getMarkdownTheme } from "../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js";

export function getMarkdownThemeWithSettings(host) {
    return {
        ...getMarkdownTheme(),
        codeBlockIndent: host.settingsManager.getCodeBlockIndent(),
    };
}

export function formatDisplayPath(p) {
    const home = os.homedir();
    let result = p;
    if (result.startsWith(home)) {
        result = `~${result.slice(home.length)}`;
    }
    return result;
}

export function formatExtensionDisplayPath(p) {
    return formatDisplayPath(p).replace(/\/index\.ts$/, "").replace(/\/index\.js$/, "");
}

export function formatContextPath(cwd, p) {
    const absolutePath = path.isAbsolute(p) ? path.resolve(p) : path.resolve(cwd, p);
    const relativePath = path.relative(cwd, absolutePath);
    const isInsideCwd = relativePath === "" ||
        (!relativePath.startsWith("..") &&
            !relativePath.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relativePath));
    if (isInsideCwd) {
        return relativePath || ".";
    }
    return formatDisplayPath(absolutePath);
}

export function formatContextPathForHost(host, p) {
    return formatContextPath(path.resolve(host.sessionStore.getCwd()), p);
}

export function getAutocompleteSourceTag(sourceInfo) {
    if (!sourceInfo) {
        return undefined;
    }
    const scopePrefix = sourceInfo.scope === "user" ? "u" : sourceInfo.scope === "project" ? "p" : "t";
    const source = sourceInfo.source.trim();
    if (source === "auto" || source === "local" || source === "cli") {
        return scopePrefix;
    }
    if (source.startsWith("npm:")) {
        return `${scopePrefix}:${source}`;
    }
    const gitSource = parseGitUrl(source);
    if (gitSource) {
        const ref = gitSource.ref ? `@${gitSource.ref}` : "";
        return `${scopePrefix}:git:${gitSource.host}/${gitSource.path}${ref}`;
    }
    return scopePrefix;
}

export function getShortPath(fullPath, sourceInfo, isPackageSource) {
    const baseDir = sourceInfo?.baseDir;
    if (baseDir && isPackageSource(sourceInfo)) {
        const relativePath = path.relative(path.resolve(baseDir), path.resolve(fullPath));
        if (relativePath &&
            relativePath !== "." &&
            !relativePath.startsWith("..") &&
            !relativePath.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relativePath)) {
            return relativePath.replace(/\\/g, "/");
        }
    }
    const source = sourceInfo?.source ?? "";
    const npmMatch = fullPath.match(/node_modules\/(@?[^/]+(?:\/[^/]+)?)\/(.*)/);
    if (npmMatch && source.startsWith("npm:")) {
        return npmMatch[2];
    }
    const gitMatch = fullPath.match(/git\/[^/]+\/[^/]+\/(.*)/);
    if (gitMatch && source.startsWith("git:")) {
        return gitMatch[1];
    }
    return formatDisplayPath(fullPath);
}

export function getCompactPathLabel(resourcePath, sourceInfo, isPackageSource) {
    const shortPath = getShortPath(resourcePath, sourceInfo, isPackageSource);
    const normalizedPath = shortPath.replace(/\\/g, "/");
    const segments = normalizedPath.split("/").filter((segment) => segment.length > 0 && segment !== "~");
    if (segments.length > 0) {
        return segments[segments.length - 1];
    }
    return shortPath;
}

export function getCompactPackageSourceLabel(sourceInfo) {
    const source = sourceInfo?.source ?? "";
    if (source.startsWith("npm:")) {
        return source.slice("npm:".length) || source;
    }
    const gitSource = parseGitUrl(source);
    if (gitSource) {
        return gitSource.path || source;
    }
    return source;
}

export function getCompactExtensionLabel(resourcePath, sourceInfo, isPackageSource) {
    if (!isPackageSource(sourceInfo)) {
        return getCompactPathLabel(resourcePath, sourceInfo, isPackageSource);
    }
    const sourceLabel = getCompactPackageSourceLabel(sourceInfo);
    if (!sourceLabel) {
        return getCompactPathLabel(resourcePath, sourceInfo, isPackageSource);
    }
    const shortPath = getShortPath(resourcePath, sourceInfo, isPackageSource).replace(/\\/g, "/");
    const packagePath = shortPath.startsWith("extensions/") ? shortPath.slice("extensions/".length) : shortPath;
    const parsedPath = path.posix.parse(packagePath);
    if (parsedPath.name === "index") {
        return !parsedPath.dir || parsedPath.dir === "." ? sourceLabel : `${sourceLabel}:${parsedPath.dir}`;
    }
    return `${sourceLabel}:${packagePath}`;
}

export function getCompactDisplayPathSegments(resourcePath) {
    return formatDisplayPath(resourcePath)
        .replace(/\\/g, "/")
        .split("/")
        .filter((segment) => segment.length > 0 && segment !== "~");
}

export function getCompactNonPackageExtensionLabel(resourcePath, index, allPaths) {
    const segments = allPaths[index]?.segments;
    if (!segments || segments.length === 0) {
        return getCompactPathLabel(resourcePath);
    }
    for (let segmentCount = 1; segmentCount <= segments.length; segmentCount += 1) {
        const candidate = segments.slice(-segmentCount).join("/");
        const isUnique = allPaths.every((item, itemIndex) => {
            if (itemIndex === index) {
                return true;
            }
            return item.segments.slice(-segmentCount).join("/") !== candidate;
        });
        if (isUnique) {
            return candidate;
        }
    }
    return segments.join("/");
}

export function getCompactExtensionLabels(extensions, isPackageSource) {
    const nonPackageExtensions = extensions
        .map((extension) => {
        const segments = getCompactDisplayPathSegments(extension.path);
        const lastSegment = segments[segments.length - 1];
        if (segments.length > 1 && (lastSegment === "index.ts" || lastSegment === "index.js")) {
            segments.pop();
        }
        return {
            path: extension.path,
            sourceInfo: extension.sourceInfo,
            segments,
        };
    })
        .filter((extension) => !isPackageSource(extension.sourceInfo));
    return extensions.map((extension) => {
        if (isPackageSource(extension.sourceInfo)) {
            return getCompactExtensionLabel(extension.path, extension.sourceInfo, isPackageSource);
        }
        const nonPackageIndex = nonPackageExtensions.findIndex((item) => item.path === extension.path);
        if (nonPackageIndex === -1) {
            return getCompactPathLabel(extension.path, extension.sourceInfo, isPackageSource);
        }
        return getCompactNonPackageExtensionLabel(extension.path, nonPackageIndex, nonPackageExtensions);
    });
}

export function getShortPathForHost(host, fullPath, sourceInfo) {
    return getShortPath(fullPath, sourceInfo, (info) => host.isPackageSource(info));
}

export function getCompactPathLabelForHost(host, resourcePath, sourceInfo) {
    return getCompactPathLabel(resourcePath, sourceInfo, (info) => host.isPackageSource(info));
}

export function getCompactExtensionLabelForHost(host, resourcePath, sourceInfo) {
    return getCompactExtensionLabel(resourcePath, sourceInfo, (info) => host.isPackageSource(info));
}

export function getCompactExtensionLabelsForHost(host, extensions) {
    return getCompactExtensionLabels(extensions, (info) => host.isPackageSource(info));
}
