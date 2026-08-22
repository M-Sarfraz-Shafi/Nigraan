export function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#111827",
        color: "#fff",
        padding: "10px 18px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        zIndex: 200,
      }}
    >
      {message}
    </div>
  );
}
