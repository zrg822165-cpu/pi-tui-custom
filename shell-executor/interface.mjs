/**
 * ShellExecutor protocol.
 *
 * @typedef {Object} ShellRunOptions
 * @property {string=} id Stable execution id. Generated when omitted.
 * @property {string=} cwd Working directory.
 * @property {string[]=} args Process arguments when using a non-shell executor.
 * @property {Record<string, string>=} env Environment.
 * @property {number=} timeout Timeout in seconds.
 * @property {AbortSignal=} signal Abort signal.
 * @property {string=} shellPath Optional shell override.
 *
 * @typedef {Object} ShellStartEvent
 * @property {"start"} type
 * @property {string} id
 * @property {string} command
 * @property {string=} cwd
 *
 * @typedef {Object} ShellChunkEvent
 * @property {"stdout"|"stderr"} type
 * @property {string} id
 * @property {Buffer} chunk
 *
 * @typedef {Object} ShellExitEvent
 * @property {"exit"} type
 * @property {string} id
 * @property {number|null|undefined} exitCode
 * @property {boolean=} timedOut
 * @property {boolean=} aborted
 * @property {boolean=} killed
 *
 * @typedef {Object} ShellErrorEvent
 * @property {"error"} type
 * @property {string} id
 * @property {Error} error
 *
 * @typedef {ShellStartEvent|ShellChunkEvent|ShellExitEvent|ShellErrorEvent} ShellEvent
 *
 * @typedef {Object} ShellExecutor
 * @property {(command: string, options?: ShellRunOptions) => AsyncIterable<ShellEvent>} run
 * @property {(id: string) => Promise<void>|void} abort
 */

export const SHELL_EXECUTOR_PROTOCOL_VERSION = 1;
