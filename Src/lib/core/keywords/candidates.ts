// 키워드 파이프라인 ①② : 프로젝트 문장에서 키워드 후보(명사·명사구)를 넉넉하게 뽑는다.
// AI 를 부르지 않는다. 형태소 분석기 없이 규칙으로 처리하므로 후보는 일부러 많이 뽑고,
// 뒤 단계(임베딩 관련도 · 사전 · AI 검증)에서 줄인다. "처음에 빠진 키워드는 뒤에서 되살릴 수 없다"

import type { Sentence } from "../types.ts";

export interface Candidate {
  /** 비교용 표현 (NFC · 영문 소문자 · 공백 하나). 사전·캐시의 열쇠 */
  surface: string;
  /** 화면·AI 에 보여 줄 표현 (처음 나온 모양) */
  display: string;
  /** 나온 문장 ID (등장 순서) */
  sids: string[];
  count: number;
}

/** 뜻이 거의 없는 말. 여기에 걸리면 AI 에 보내지 않고 버린다 (사람이 관리하는 유일한 목록, 짧게 유지) */
export const STOPWORDS = new Set([
  "이번", "저번", "다음", "처음", "마지막", "오늘", "어제", "내일", "이후", "이전", "당시", "요즘",
  "진행", "관련", "활동", "프로젝트", "내용", "부분", "정도", "경우", "때문", "생각", "느낌", "사람", "우리", "저희",
  "모두", "각자", "서로", "하나", "가지", "여러", "다양", "통해", "위해", "대한", "대해", "같은", "다른", "모든",
  "그리고", "그래서", "하지만", "그런데", "또한", "그러나", "그냥", "정말", "너무", "매우", "아주", "조금", "많이",
  "이것", "그것", "저것", "여기", "거기", "이런", "그런", "저런", "어떤", "무엇", "누구", "언제", "어디",
  "시간", "이야기", "부탁", "확인", "준비", "시작", "마무리", "정리", "결정", "계획",
  "내가", "제가", "나는", "저는", "우리가", "우리는", "팀원", "팀원들", "아닌", "아니라", "따라", "위주", "실제", "기반", "자신", "본인",
  "대해서", "위해서", "대하여", "위하여", "관하여", "관한", "위한", "통한", "따른", "의한", "인한", "이러", "각종", "기타", "가장", "전반", "필요", "중요", "바탕", "토대",
]);

/** 끝이 '가' 인 사람·직업 명사 (조사 '가' 로 자르지 않는다) */
const NOUN_GA = /(전문|예술|기업|활동|작곡|정치|평론|소설|건축|사업|투자|번역|작사|음악|미술|전략|분석|기획|연구|운동|봉사|창업|애호|사진|만화|요리|교육|평)가$/u;
/** 끝이 '이' 인 명사 (조사 '이' 로 자르지 않는다) */
const NOUN_I = /(고양|놀|차|종|사|높|길|넓|깊|나|아|어린|오|거머|멀|두께|기러|쓰레|돌멩)이$/u;
/** 끝이 '고'·'서' 인 두 글자 명사 (동사 활용으로 보지 않는다) */
const NOUN_2 = new Set(["사고", "광고", "보고", "최고", "창고", "원고", "참고", "재고", "경고", "신고", "공고", "투고", "기고", "금고", "문서", "순서", "부서", "도서", "질서", "증서", "엽서", "학교", "비교", "연고", "자료", "결과", "효과", "성과", "학과", "교과", "회의", "정의", "토의", "강의", "합의", "논의", "주의", "동의", "문의", "건의", "협의", "모의", "의의", "진로", "경로", "도로", "회로", "통로", "마을", "가을", "하늘"]);
/** 끝이 '로' 인 명사 (조사 '로' 로 자르지 않는다) */
const NOUN_RO = /(회로|경로|진로|도로|통로|미로|항로|선로|활로|수로|철로|공로|기로|산로|하로)$/u;
/** 두 글자 말의 끝 글자가 이것이면 동사 활용이거나 '한 글자 명사 + 조사' 로 보고 뺀다 (묻는, 빼고, 받아, 등에, 간의 …) */
const VERB_2_END = /[는은을를고아서며니던든라져워쳐에의]$/u;

// 명사 뒤에 붙는 조사. 긴 것부터 맞춘다
const JOSA = [
  "으로부터", "에서부터", "으로써", "으로서", "에서는", "에서도", "에게서", "으로는", "이라는", "이라고", "에서의",
  "에서", "에게", "한테", "부터", "까지", "처럼", "보다", "으로", "로서", "로써", "이나", "이랑", "과의", "와의", "라는", "라고", "에는", "에도", "들을", "들이", "들의", "들은", "들과",
  "이면", "이며", "이고", "이자", "간의",
  "을", "를", "은", "는", "이", "가", "의", "에", "도", "만", "와", "과", "로", "랑", "들",
];
// 명사 끝과 헷갈리기 쉬운 한 글자 조사: 떼고 남은 말이 문서 안 다른 곳에 단독으로 나올 때만 뗀다
//   도: 지도·만족도·속도   과: 학과·효과   만: (드묾)
// '이'·'가' 는 예외 명사 목록(NOUN_I, NOUN_GA)으로 처리하고 뗀다 ("느낌이" → "느낌", "전문가" 는 유지)
const AMBIGUOUS_JOSA = new Set(["도", "만"]);

// "분석했다" → "분석" 처럼 명사 + 하다/되다/시키다 를 명사로 되돌리는 끝말 (긴 것부터)
const HADA = [
  "하였으며", "하였는데", "하였다", "했으며", "했는데", "했었다", "했다고", "했지만", "했으나", "하자고", "하려고", "하기로", "시켰다",
  "했던", "했고", "했다", "한다", "하는", "하고", "하며", "하면", "해서", "하여", "하자", "하던", "시켜", "시킨", "시키는",
  "하기도", "하기는", "하므로", "하므", "하거나", "하기", "하게", "해야", "해보", "할", "함", "해", "한",
  "되었다", "되었고", "됐다", "됐고", "된다", "되는", "되어", "되고", "됨", "된",
];
// 동사·형용사로 끝나는 말(명사로 되돌릴 수 없는 것)은 후보에서 뺀다
const VERB_END = /(다|었|았|겠|습니다|니다|어요|아요|해요|네요|는데|면서|지만|으며|었고|았고|었는데|았는데|려고|도록|으면|니까|자고|고자|기로|더니|다가|어서|아서|여서|져서|워서|라서|어야|아야|었던|았던|는지|져|워|쳐|있는|없는|같은|있고|없고|거나|되지|받지|않지|하지|했|갖춘|원하|만들|만드|느끼|느낄|키우|이끌어|바뀔|올려|배우|다루|나가|여기|재미있게)$/u;

const TOKEN = /[0-9]*[A-Za-z][A-Za-z0-9+#.]*[A-Za-z0-9+#]|[0-9]*[A-Za-z]|[가-힣]+/gu;

export const MIN_HANGUL = 2;
export const MAX_CANDIDATES = 60;

export function normalizeSurface(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

interface Word { text: string; noun: string | null; /** 앞 단어와 공백으로만 떨어져 있나 (쉼표·가운뎃점이면 false) */ joined: boolean }

/** 문장 하나를 단어로 나누고, 명사로 쓸 수 있는 모양(noun)을 붙인다. noun=null 은 명사구를 끊는 자리 */
function words(text: string, known: Set<string>): Word[] {
  const out: Word[] = [];
  const t = text.normalize("NFC");
  let end = -1;
  for (const m of t.matchAll(TOKEN)) {
    const gap = end < 0 ? "" : t.slice(end, m.index);
    out.push({ text: m[0], noun: toNoun(m[0], known), joined: end >= 0 && /^\s+$/.test(gap) });
    end = m.index! + m[0].length;
  }
  return out;
}

/** 단어 → 명사 모양. 명사가 아니면 null */
export function toNoun(token: string, known: Set<string> = new Set()): string | null {
  if (/^[0-9]*[A-Za-z]/.test(token)) return token.length >= 2 || token === "R" || token === "C" ? token : null;

  // 하다/되다 붙은 말. 남는 말이 한 글자면 하다 활용이 아니다 ("역할", "이해", "제한")
  for (const end of HADA) {
    if (token.length > end.length && token.endsWith(end)) {
      const stem = token.slice(0, -end.length);
      if (stem.length >= MIN_HANGUL) return stem;
      break;
    }
  }
  if (NOUN_2.has(token)) return token;
  // "통계적인", "체계적이고" → "통계적" (꾸밈말. 혼자서는 후보가 아니고 명사구 앞자리로만 쓴다)
  const mod = token.match(/^(.+적)(인|으로|이고|이며|이다)$/u);
  if (mod && mod[1].length >= 3) return mod[1];
  // 조사 떼기
  for (const j of JOSA) {
    if (token.length > j.length && token.endsWith(j)) {
      const stem = token.slice(0, -j.length);
      if (stem.length < MIN_HANGUL) {
        if (j.length >= 2) return null; // "때에는", "위에서" : 한 글자 말 + 조사
        break;
      }
      if (j === "로" && NOUN_RO.test(token)) break; // "전자회로" 를 "전자회"로 자르지 않기
      if (j === "이" && NOUN_I.test(token)) break; // "고양이" 를 "고양"으로 자르지 않기
      if (j === "가" && NOUN_GA.test(token)) break; // "전문가" 를 "전문"으로 자르지 않기
      if (AMBIGUOUS_JOSA.has(j) && !known.has(stem)) break; // "지도" 를 "지"로 … (단독으로 나온 적이 있을 때만)
      if (VERB_END.test(stem) || (stem.length === 2 && VERB_2_END.test(stem) && !NOUN_2.has(stem))) return null;
      return stem;
    }
  }
  if (VERB_END.test(token)) return null;
  if (token.length === 2 && VERB_2_END.test(token)) return null; // 묻는, 빼고, 받아, 풀고
  if (token.length >= 3 && token.endsWith("고")) return null; // 살펴보고, 배우고, 세우고
  return token.length >= MIN_HANGUL ? token : null;
}

/** "구체적", "객관적" 처럼 '-적' 으로 끝나는 꾸밈말: 명사구 앞자리로만 쓰고 혼자서는 후보로 삼지 않는다 */
const MODIFIER = /..적$/u;

/**
 * 문장들에서 후보를 뽑는다: 명사 하나(unigram) + 붙어 나온 명사 두 개(bigram, 예: "데이터 분석").
 * 불용어로 시작하거나 끝나는 명사구는 만들지 않는다. 많이 나온 순서로 최대 MAX_CANDIDATES 개.
 */
export function extractCandidates(sentences: Pick<Sentence, "sid" | "text">[], max = MAX_CANDIDATES): Candidate[] {
  // 조사 없이 단독으로 나온 말 (애매한 조사를 뗄지 판단하는 데 쓴다)
  const bare = new Set<string>();
  for (const s of sentences) for (const m of s.text.normalize("NFC").matchAll(TOKEN)) bare.add(m[0]);

  const found = new Map<string, Candidate>();
  const add = (display: string, sid: string) => {
    const surface = normalizeSurface(display);
    if (STOPWORDS.has(surface)) return;
    const c = found.get(surface);
    if (!c) found.set(surface, { surface, display, sids: [sid], count: 1 });
    else {
      c.count++;
      if (!c.sids.includes(sid)) c.sids.push(sid);
    }
  };

  for (const s of sentences) {
    const ws = words(s.text, bare);
    for (let i = 0; i < ws.length; i++) {
      const a = ws[i].noun;
      if (!a) continue;
      if (!MODIFIER.test(a)) add(a, s.sid);
      const next = ws[i + 1];
      // 두 번째 말은 원래 모양 그대로여야 명사구다 ("데이터 분석을" → "데이터 분석")
      const b = next?.noun;
      const headOk = ws[i].text === a || MODIFIER.test(a); // 앞 말은 조사 없는 모양이거나 '-적' 꾸밈말
      if (b && next.joined && headOk && !STOPWORDS.has(normalizeSurface(a)) && !STOPWORDS.has(normalizeSurface(b))) {
        add(`${a} ${b}`, s.sid);
      }
    }
  }

  const order = [...found.values()];
  return order
    .map((c, i) => ({ c, i }))
    .sort((x, y) => y.c.count - x.c.count || x.i - y.i)
    .slice(0, max)
    .map(({ c }) => c);
}
