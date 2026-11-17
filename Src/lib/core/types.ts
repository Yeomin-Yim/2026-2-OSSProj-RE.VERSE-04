// RE:Cord 계산 로직 공통 타입. DB의 JSON 필드 모양과 같다 (supabase/README.md 참고).

export type TagGroup = "topic" | "method" | "output" | "tool";
export type Source = "rule" | "ai" | "student";

export interface RuleDict {
  version: string;
  exclude_default: string[];
  exclude_applies_to: TagGroup[];
  changes?: string[];
  tags: Record<string, { label: string; group: TagGroup; patterns: string[]; note?: string }>;
}

export interface Sentence {
  sid: string; // "N11·V1·S2"
  n: number;
  text: string;
  hash: string;
  page?: number;
  entry_date?: string;
}

export interface Tag {
  code: string;
  sid: string;
  matched: string;
  removed?: boolean; // 학생이 지운 태그 (source=student 행에서만)
}

/** 프로젝트 한 개의 병합된 태그: 태그 코드 → 근거 문장 ID 목록 */
export interface ProjectTags {
  id: string;
  tags: Map<string, string[]>;
}

export interface Relation {
  a: string;
  b: string;
  score: number;
  shared: string[];
  evidence: Record<string, string[]>;
}

export interface Profile {
  id: string;
  weights: Record<string, number>; // {태그 코드: 1~3}
}

export interface Recommendation {
  profile_id: string;
  score: number;
  breadth: number;
  depth: number;
  depth_project_id: string | null;
  cells: { tag: string; weight: number; hits: Record<string, string[]> }[];
}
