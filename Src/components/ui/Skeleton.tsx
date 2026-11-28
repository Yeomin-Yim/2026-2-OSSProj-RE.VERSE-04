/**
 * 화면을 불러오는 동안 보여 주는 뼈대 (loading.tsx 에서 쓴다).
 * 실제 화면과 같은 자리에 회색 상자를 둬서, 내용이 들어올 때 화면이 덜컥거리지 않게 한다.
 */
export function Skeleton({ w = "100%", h = 14, r = 8, style }: { w?: number | string; h?: number; r?: number; style?: React.CSSProperties }) {
  return <span className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

/**
 * 화면 로딩: 지금 실제로 하는 일(그 화면의 데이터를 불러오는 중)을 한 줄로 알려 준다 (D008).
 * 서버가 진행률을 주지 않으므로 퍼센트는 보여 주지 않고, 보여 주려고 기다리게 하지도 않는다.
 */
export function LoadingState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="load-state" role="status" aria-live="polite">
      <span className="rc-loader sm" aria-hidden="true"><i /><i /><i /></span>
      <span><b>{message}</b>{sub && <small>{sub}</small>}</span>
    </div>
  );
}

type SceneKind = "projects" | "graph" | "portfolio" | "scraps";

/** 화면마다 다른 장면 일러스트 (CSS 애니메이션만, 진행률 없음) */
function SceneArt({ kind }: { kind: SceneKind }) {
  if (kind === "projects") return (
    <svg viewBox="0 0 220 150" className="scene-art projects" aria-hidden="true">
      <ellipse cx="110" cy="136" rx="78" ry="7" className="sh" />
      <path d="M40 58h44l10 10h86a8 8 0 0 1 8 8v52a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8V66a8 8 0 0 1 8-8z" className="folder-back" />
      <g className="card c1"><rect x="62" y="30" width="62" height="78" rx="7" /><path d="M72 46h34M72 56h42M72 66h28" /></g>
      <g className="card c2"><rect x="92" y="24" width="62" height="78" rx="7" /><path d="M102 40h34M102 50h42M102 60h24" /><circle cx="140" cy="86" r="6" className="dot" /></g>
      <g className="card c3"><rect x="120" y="34" width="62" height="78" rx="7" /><path d="M130 50h34M130 60h42M130 70h30" /></g>
      <path d="M32 84h156v44a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8z" className="folder-front" />
      <rect x="92" y="98" width="36" height="7" rx="3.5" className="tab" />
    </svg>
  );
  if (kind === "graph") return (
    <svg viewBox="0 0 220 150" className="scene-art graph" aria-hidden="true">
      <g className="links"><path d="M110 75L50 40" /><path d="M110 75L172 36" /><path d="M110 75L58 118" /><path d="M110 75L170 112" /><path d="M50 40L172 36" className="l2" /></g>
      <circle cx="50" cy="40" r="11" className="n n1" /><circle cx="172" cy="36" r="9" className="n n2 y" />
      <circle cx="58" cy="118" r="9" className="n n3 y" /><circle cx="170" cy="112" r="11" className="n n4" />
      <circle cx="110" cy="75" r="20" className="core" /><circle cx="110" cy="75" r="20" className="ring" />
    </svg>
  );
  if (kind === "portfolio") return (
    <svg viewBox="0 0 220 150" className="scene-art portfolio" aria-hidden="true">
      <ellipse cx="110" cy="138" rx="60" ry="6" className="sh" />
      <rect x="70" y="14" width="84" height="116" rx="6" className="page2" />
      <rect x="60" y="10" width="84" height="116" rx="6" className="page" />
      <rect x="72" y="22" width="40" height="6" rx="3" className="hd" />
      <rect x="72" y="36" width="60" height="30" rx="4" className="img" />
      <g className="lines"><rect x="72" y="74" width="60" height="4" rx="2" /><rect x="72" y="84" width="52" height="4" rx="2" /><rect x="72" y="94" width="58" height="4" rx="2" /><rect x="72" y="104" width="40" height="4" rx="2" /></g>
      <path d="M150 30l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" className="spark" />
    </svg>
  );
  return (
    <svg viewBox="0 0 220 150" className="scene-art scraps" aria-hidden="true">
      {[[60, 70, 1], [110, 50, 1.4], [160, 76, 1]].map(([x, y, k], i) => (
        <path key={i} className={"star s" + (i + 1)} transform={`translate(${x} ${y}) scale(${k})`} d="M0-16l4.7 9.5 10.5 1.5-7.6 7.4 1.8 10.4L0 7.9l-9.4 4.9 1.8-10.4-7.6-7.4L-4.7-6.5z" />
      ))}
      <rect x="64" y="104" width="92" height="22" rx="11" className="tray" />
    </svg>
  );
}

const TIPS: Record<SceneKind, string[]> = {
  projects: ["한 번 올린 기록은 연결 그래프와 포트폴리오에서 다시 쓰여요.", "빠진 항목만 한 번에 2개까지 물어볼게요.", "거꾸로캠퍼스 회고록 PDF도 그대로 가져올 수 있어요."],
  graph: ["추천은 합격·취업 가능성이 아니라 기록과의 관련성이에요.", "노드를 누르면 근거가 된 내 기록을 볼 수 있어요.", "진로가 정해지지 않아도 둘러볼 수 있어요."],
  portfolio: ["초안은 내 기록 문장을 근거로 채워져요.", "직접 고친 문장은 다시 채워도 그대로 남아요.", "미리보기 화면이 그대로 PDF로 저장돼요."],
  scraps: ["그래프에서 ☆를 누르면 여기에 모여요.", "스크랩한 학과·공고는 언제든 다시 열 수 있어요.", "마감이 지난 공고는 원문에서 꼭 확인하세요."],
};

/**
 * 화면 로딩 장면: 그 화면이 실제로 불러오는 것을 제목으로 알리고, 장면 일러스트와 도움말을 보여 준다.
 * 진행률은 서버가 주지 않으므로 표시하지 않는다 (D008). 도움말은 CSS 로만 바뀐다.
 */
export function LoadingScene({ kind, message, sub }: { kind: SceneKind; message: string; sub?: string }) {
  return (
    <div className={"load-scene " + kind} role="status" aria-live="polite">
      <div className="scene-stage"><SceneArt kind={kind} /></div>
      <div className="scene-text">
        <b>{message}</b>
        {sub && <span>{sub}</span>}
        <div className="scene-tips" aria-hidden="true">{TIPS[kind].map((t) => <i key={t}>{t}</i>)}</div>
      </div>
    </div>
  );
}

export function PageSkeleton({ title, layout, message = "자료를 불러오고 있어요.", sub, scene }: { title: string; layout: "projects" | "graph" | "cards" | "steps"; message?: string; sub?: string; scene?: SceneKind }) {
  return (
    <div className="page" aria-busy="true" aria-label={`${title} 불러오는 중`}>
      <div className="page-head">
        <div>
          <h1 className="title">{title}</h1>
          {!scene && <LoadingState message={message} sub={sub} />}
        </div>
      </div>
      {scene && <LoadingScene kind={scene} message={message} sub={sub} />}
      {layout === "projects" && (
        <div className={"proj-grid" + (scene ? " skel-faded" : "")}>
          <div className="card panel skel-col">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={44} r={10} />)}</div>
          <div className="card panel skel-col"><Skeleton w="45%" h={20} /><Skeleton w="70%" h={12} />{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={54} r={10} />)}</div>
          <div className="card panel skel-col">{[0, 1, 2].map((i) => <Skeleton key={i} h={70} r={10} />)}</div>
        </div>
      )}
      {layout === "graph" && <div className={"card skel-graph" + (scene ? " skel-faded" : "")}><Skeleton w={160} h={160} r={80} /></div>}
      {layout === "cards" && <div className={"skel-cards" + (scene ? " skel-faded" : "")}>{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={120} r={12} />)}</div>}
      {layout === "steps" && (
        <div className={"card panel skel-col" + (scene ? " skel-faded" : "")}><Skeleton w="35%" h={18} />{[0, 1, 2].map((i) => <Skeleton key={i} h={80} r={12} />)}</div>
      )}
    </div>
  );
}
