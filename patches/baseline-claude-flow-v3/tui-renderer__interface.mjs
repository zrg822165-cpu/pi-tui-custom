/**
 * TuiRenderer protocol.
 *
 * @typedef {Object} TuiRendererActions
 * @property {(text: string, options?: object) => Promise<void>|void} submitInput
 * @property {() => Promise<void>|void} abort
 * @property {() => Promise<void>|void=} newSession
 * @property {(sessionPath: string, options?: object) => Promise<void>|void=} resumeSession
 * @property {(entryId: string, options?: object) => Promise<void>|void=} forkSession
 *
 * @typedef {Object} TuiRenderer
 * @property {(actions: TuiRendererActions) => void} bind
 * @property {() => Promise<void>|void} start
 * @property {() => Promise<void>|void} stop
 * @property {(event: object) => void} dispatch
 * @property {() => object} getSnapshot
 */

export { TUI_RENDERER_PROTOCOL_VERSION, TuiActionType, TuiEventType } from "./events.mjs";

