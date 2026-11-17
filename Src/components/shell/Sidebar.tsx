"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Logo, type IconName } from "@/components/ui/Icon";

const NAV: { href: string; icon: IconName; label: string }[] = [
  { href: "/projects", icon: "home", label: "프로젝트 관리" },
  { href: "/graph", icon: "graph", label: "연결 그래프" },
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
          </Link>
        ))}
      </nav>
    </aside>
  );
}
