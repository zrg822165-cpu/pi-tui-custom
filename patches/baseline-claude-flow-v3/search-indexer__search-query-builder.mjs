import { runRustCoreValue, runRustShadow } from "../../rust-core-shadow/runner.mjs";

function runSearchCore(op, input) {
    return runRustCoreValue({ commandEnv: "PI_SEARCH_CORE_COMMAND", op, input });
}

export class SearchQueryBuilder {
    buildRipgrepArgs({ pattern, searchPath, glob, ignoreCase, literal }) {
        const input = { pattern, searchPath, glob, ignoreCase, literal };
        const rust = runSearchCore("buildRipgrepArgs", input);
        if (rust.ok) {
            return rust.value;
        }
        const args = ["--json", "--line-number", "--color=never", "--hidden"];
        if (ignoreCase)
            args.push("--ignore-case");
        if (literal)
            args.push("--fixed-strings");
        if (glob)
            args.push("--glob", glob);
        args.push("--", pattern, searchPath);
        runRustShadow({
            name: "search.buildRipgrepArgs",
            commandEnv: "PI_SEARCH_CORE_COMMAND",
            op: "buildRipgrepArgs",
            input,
            jsValue: args,
        });
        return args;
    }
    buildFdArgs({ pattern, searchPath, limit }) {
        const input = { pattern, searchPath, limit };
        const rust = runSearchCore("buildFdArgs", input);
        if (rust.ok) {
            return rust.value;
        }
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
        runRustShadow({
            name: "search.buildFdArgs",
            commandEnv: "PI_SEARCH_CORE_COMMAND",
            op: "buildFdArgs",
            input,
            jsValue: args,
        });
        return args;
    }
}
