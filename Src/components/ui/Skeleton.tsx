/**
 * 화면을 불러오는 동안 보여 주는 뼈대 (loading.tsx 에서 쓴다).
 * 실제 화면과 같은 자리에 회색 상자를 둬서, 내용이 들어올 때 화면이 덜컥거리지 않게 한다.
 */
export function Skeleton({ w = "100%", h = 14, r = 8, style }: { w?: number | string; h?: number; r?: number; style?: React.CSSProperties }) {
  return <span className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

export function PageSkeleton({ title, layout }: { title: string; layout: "projects" | "graph" | "cards" | "steps" }) {
  return (
    <div className="page" aria-busy="true" aria-label={`${title} 불러오는 중`}>
      <div className="page-head">
        <div>
          <h1 className="title">{title}</h1>
          <p className="subtitle loading-dots" role="status">불러오는 중<i /><i /><i /></p>
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
