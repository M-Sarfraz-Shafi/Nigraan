import { useEffect, useRef } from "react";
import { S } from "../styles";

export interface ContextMenuItem {
  divider?: boolean;
  label?: string;
  icon?: string;
  danger?: boolean;
  action?: () => void;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 100,
        background: "#fff",
        borderRadius: 10,
        boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
        border: `1px solid ${S.border}`,
        padding: "4px 0",
        minWidth: 160,
      }}
    >
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} style={{ height: 1, background: S.borderLight, margin: "4px 0" }} />
        ) : (
          <button
            key={i}
            onClick={() => {
              it.action?.();
              onClose();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "8px 14px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              color: it.danger ? "#ef4444" : S.text,
              textAlign: "left",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>{it.icon}</span>
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
