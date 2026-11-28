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

export function PageSkeleton({ title, layout, message = "자료를 불러오고 있어요.", sub }: { title: string; layout: "projects" | "graph" | "cards" | "steps"; message?: string; sub?: string }) {
  return (
    <div className="page" aria-busy="true" aria-label={`${title} 불러오는 중`}>
      <div className="page-head">
        <div>
          <h1 className="title">{title}</h1>
          <LoadingState message={message} sub={sub} />
        </div>
      </div>
      {layout === "projects" && (
        <div className="proj-grid">
          <div className="card panel skel-col">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={44} r={10} />)}</div>
          <div className="card panel skel-col"><Skeleton w="45%" h={20} /><Skeleton w="70%" h={12} />{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={54} r={10} />)}</div>
          <div className="card panel skel-col">{[0, 1, 2].map((i) => <Skeleton key={i} h={70} r={10} />)}</div>
        </div>
      )}
      {layout === "graph" && <div className="card skel-graph"><Skeleton w={160} h={160} r={80} /></div>}
      {layout === "cards" && <div className="skel-cards">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={120} r={12} />)}</div>}
      {layout === "steps" && (
        <div className="card panel skel-col"><Skeleton w="35%" h={18} />{[0, 1, 2].map((i) => <Skeleton key={i} h={80} r={12} />)}</div>
      )}
    </div>
  );
}
