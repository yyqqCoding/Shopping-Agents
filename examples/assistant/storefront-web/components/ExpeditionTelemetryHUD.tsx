"use client";

import { useEffect, useState, useRef } from "react";

interface Waypoint {
  id: string;
  name: string;
  elev: number;
  coord: string;
}

const WAYPOINTS: Waypoint[] = [
  { id: "hero", name: "山间日出", elev: 1860, coord: "29°42'N" },
  { id: "journeys", name: "松针小径", elev: 1420, coord: "31°14'N" },
  { id: "how-it-works", name: "战术工坊", elev: 1150, coord: "30°45'N" },
  { id: "featured", name: "精选装备", elev: 840, coord: "30°18'N" },
  { id: "departure", name: "出征营地", elev: 480, coord: "30°10'N" },
];

export function ExpeditionTelemetryHUD() {
  const [elev, setElev] = useState(1860);
  const [activeWaypoint, setActiveWaypoint] = useState(0);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [visible, setVisible] = useState(false);
  const [bearing, setBearing] = useState(42);
  const frameRef = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        const scrollY = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll <= 0) return;

        const p = Math.min(1, Math.max(0, scrollY / maxScroll));
        setScrollPercent(Math.round(p * 100));
        setVisible(scrollY > 120);

        // Interpolate elevation: 1860m at top down to 480m at bottom
        const currentElev = Math.round(1860 - p * (1860 - 480));
        setElev(currentElev);

        // Dynamic bearing rotation simulation
        setBearing(Math.round(42 + p * 128));

        // Determine active waypoint
        const idx = Math.min(
          WAYPOINTS.length - 1,
          Math.floor(p * WAYPOINTS.length)
        );
        setActiveWaypoint(idx);
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const scrollToWaypoint = (id: string) => {
    if (id === "hero") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    }
  };

  if (!visible) return null;

  return (
    <aside
      className="expedition-hud"
      aria-label="海拔与远征遥测数据"
    >
      <div className="hud-capsule">
        {/* Top: Dynamic Compass Bearing */}
        <div className="hud-compass-row">
          <div className="hud-compass-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              style={{ transform: `rotate(${bearing}deg)` }}
            >
              <polygon points="12,2 15,12 12,10 9,12" fill="var(--marker)" />
              <polygon points="12,22 15,12 12,10 9,12" fill="var(--ink-soft)" />
            </svg>
          </div>
          <span className="hud-bearing-text">{bearing}° NNE</span>
          <span className="hud-status-dot" aria-hidden="true" />
        </div>

        {/* Center: Elevation Metric Display */}
        <div className="hud-metric-row">
          <span className="hud-metric-label">CURRENT ELEV</span>
          <div className="hud-metric-value">
            <span className="hud-plus">+</span>
            <span className="hud-num">{elev.toLocaleString("zh-CN")}</span>
            <span className="hud-unit">M</span>
          </div>
        </div>

        {/* Vertical Descent Progress Gauge */}
        <div className="hud-gauge" aria-hidden="true">
          <div className="hud-gauge-track">
            <div
              className="hud-gauge-fill"
              style={{ height: `${scrollPercent}%` }}
            />
          </div>
          <div className="hud-waypoints-list">
            {WAYPOINTS.map((wp, i) => (
              <button
                key={wp.id}
                type="button"
                className={`hud-wp-node ${i === activeWaypoint ? "is-active" : ""}`}
                onClick={() => scrollToWaypoint(wp.id)}
                title={`跳转至 ${wp.name} (+${wp.elev}M)`}
              >
                <span className="wp-dot" />
                <span className="wp-tooltip">{wp.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom: Current Waypoint Coordinates */}
        <div className="hud-coords-row">
          <span className="hud-coord-name">{WAYPOINTS[activeWaypoint].name}</span>
          <span className="hud-coord-val">{WAYPOINTS[activeWaypoint].coord}</span>
        </div>

        {/* Quick Back to Summit Button */}
        <button
          type="button"
          className="hud-summit-btn"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          title="回返顶峰"
          aria-label="回返顶峰"
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M10 15V5M5 10l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
