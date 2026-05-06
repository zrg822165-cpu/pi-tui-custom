export class SearchQueryBuilder {
    buildRipgrepArgs({ pattern, searchPath, glob, ignoreCase, literal }) {
        const args = ["--json", "--line-number", "--color=never", "--hidden"];
        if (ignoreCase)
            args.push("--ignore-case");
        if (literal)
            args.push("--fixed-strings");
        if (glob)
            args.push("--glob", glob);
        args.push("--", pattern, searchPath);
        return args;
    }
    buildFdArgs({ pattern, searchPath, limit }) {
        const args = [
            "--glob",
            "--color=never",
            "--hidden",
            "--no-require-git",
            "--max-results",
            String(limit),
        ];
        let effectivePattern = pattern;
        if (pattern.includes("/")) {
            args.push("--full-path");
            if (!pattern.startsWith("/") && !pattern.startsWith("**/") && pattern !== "**") {
                effectivePattern = `**/${pattern}`;
            }
        }
        args.push("--", effectivePattern, searchPath);
        return args;
    }
}
