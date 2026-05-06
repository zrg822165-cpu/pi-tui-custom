import { performance } from "node:perf_hooks";

export class TerminalPatchWriter {
    write(terminal, buffer) {
        const start = performance.now();
        terminal.write(buffer);
        return {
            writeMs: performance.now() - start,
            bytes: buffer.length,
        };
    }
}
