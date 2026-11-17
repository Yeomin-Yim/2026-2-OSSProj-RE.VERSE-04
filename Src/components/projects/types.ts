import type { CheckKey, TagGroup } from "@/lib/core/index.ts";
import type { Overview, ProjectRow, RecordView } from "@/lib/server/projects";

export type { Overview, ProjectRow, RecordView };

export type Checks = Record<CheckKey, boolean>;
export type Guide = { key: CheckKey; question: string; hint: string; action: "edit" | "answer" | "upload"; cta: string };
export type TagInfo = Record<string, { label: string; group: TagGroup }>;
export type TabKey = "files" | "overview" | "log" | "result";
