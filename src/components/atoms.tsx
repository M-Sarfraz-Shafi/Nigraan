import type { CSSProperties, ReactNode } from "react";
import { S } from "../styles";

export function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value?: string | null;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      style={{
        border: `1px solid ${S.border}`,
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 13,
        background: "#fff",
        color: S.text,
        outline: "none",
        cursor: "pointer",
        width: "100%",
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Badge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 20,
        backgroundColor: color + "18",
        color,
      }}
    >
      {children}
    </span>
  );
}

export function IconBtn({
  onClick,
  children,
  title,
}: {
  onClick: (e: React.MouseEvent) => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: 4,
        borderRadius: 6,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: S.textSec,
        display: "flex",
        alignItems: "center",
        transition: "background 0.12s, color 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = S.primaryLight;
        e.currentTarget.style.color = S.primary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = S.textSec;
      }}
    >
      {children}
    </button>
  );
}

export function Btn({
  onClick,
  children,
  variant = "primary",
  style: st = {},
}: {
  onClick: (e: React.MouseEvent) => void;
  children: ReactNode;
  variant?: "primary" | "danger" | "secondary";
  style?: CSSProperties;
}) {
  const base: CSSProperties =
    variant === "primary"
      ? { background: S.primary, color: "#fff", border: "none", boxShadow: "0 1px 2px rgba(37,99,235,0.3)" }
      : variant === "danger"
        ? { background: "transparent", color: "#ef4444", border: "none" }
        : { background: "#fff", color: S.text, border: `1px solid ${S.border}` };
  const hover: CSSProperties =
    variant === "primary"
      ? { background: S.primaryDark }
      : variant === "danger"
        ? { background: "#fef2f2" }
        : { background: S.borderLight };
  return (
    <button
      onClick={onClick}
      style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "background 0.12s", ...base, ...st }}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, hover)}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, base, st)}
    >
      {children}
    </button>
  );
}

export function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  style: st = {},
  onKeyDown,
  onBlur,
}: {
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  style?: CSSProperties;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      style={{
        border: `1px solid ${S.border}`,
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 13,
        outline: "none",
        width: "100%",
        color: S.text,
        ...st,
      }}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: 11,
        fontWeight: 600,
        color: S.textSec,
        marginBottom: 4,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}
    >
      {children}
    </label>
  );
}

export function Card({ children, style: st = {} }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...S.card, ...st }}>{children}</div>;
}

export const Plus = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const Trash = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m-1 0v12a2 2 0 01-2 2H9a2 2 0 01-2-2V6h10z" />
  </svg>
);
export const Edit = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
export const ChevR = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path d="M9 18l6-6-6-6" />
  </svg>
);
export const ChevD = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const Camera = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);
export const XIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
