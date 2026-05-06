import { NoticeStore } from "./notice-store.mjs";

export function createNoticeStore(host) {
    return new NoticeStore(host);
}

