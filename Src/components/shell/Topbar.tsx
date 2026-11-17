"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/app/login/actions";
import { Icon } from "@/components/ui/Icon";

interface Props {
  userName: string;
  projects: { id: string; title: string; topic: string | null }[];
}

export function Topbar({ userName, projects }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const bar = useRef<HTMLElement>(null);

  // 바깥을 누르면 검색 결과와 메뉴를 닫는다
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!bar.current?.contains(e.target as Node)) { setQuery(""); setMenuOpen(false); }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const q = query.trim().toLowerCase();
  const hits = q ? projects.filter((p) => (p.title + " " + (p.topic ?? "")).toLowerCase().includes(q)) : [];

  return (
    <header className="topbar" ref={bar}>
      <div className="search">
        <Icon name="search" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="프로젝트 검색"
          autoComplete="off"
          aria-label="검색"
        />
        {q && (
          <div className="search-pop">
            {hits.length === 0 && <div className="empty">찾은 결과가 없어요.</div>}
            {hits.length > 0 && <h6>프로젝트</h6>}
            {hits.map((p) => (
              <button key={p.id} onClick={() => { setQuery(""); router.push(`/projects/${p.id}`); }}>
                <Icon name="home" />{p.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="user">
        <button className="user-btn" onClick={() => setMenuOpen((open) => !open)}>
          <span className="avatar">{userName.charAt(0)}</span>
          <span className="nm">{userName}님</span>
          <Icon name="chevD" />
        </button>
        {menuOpen && (
          <div className="menu">
            <button onClick={() => logout()}><Icon name="user" />로그아웃</button>
          </div>
        )}
      </div>
    </header>
  );
}
