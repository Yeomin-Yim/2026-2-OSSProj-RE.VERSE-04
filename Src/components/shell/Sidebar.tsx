"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Logo, type IconName } from "@/components/ui/Icon";

const NAV: { href: string; icon: IconName; label: string }[] = [
  { href: "/projects", icon: "home", label: "프로젝트 관리" },
  { href: "/graph", icon: "graph", label: "연결 그래프" },
  { href: "/scraps", icon: "star", label: "스크랩" },
  { href: "/portfolio", icon: "file", label: "포트폴리오 만들기" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <Link className="logo" href="/projects">
        <span className="logo-row"><Logo />RE:Cord</span>
      </Link>
      <nav className="nav">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={pathname.startsWith(item.href) ? "active" : ""}>
            <Icon name={item.icon} />{item.label}
            <Pending />
          </Link>
        ))}
      </nav>
      <div className="side-foot">RE:Cord 웹 서비스<br />기록은 내 계정에 저장돼요.</div>
    </aside>
  );
}

/** 메뉴를 누른 뒤 다음 화면이 오기 전까지: 그 메뉴 옆 작은 점 + 화면 맨 위 진행 막대 (누른 즉시 반응이 보이게) */
function Pending() {
  const { pending } = useLinkStatus();
  return pending ? (
    <>
      <span className="nav-dot" aria-hidden="true" />
      <span className="route-bar" role="progressbar" aria-label="화면 불러오는 중" />
    </>
  ) : null;
}
