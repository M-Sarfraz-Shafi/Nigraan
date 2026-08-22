import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { S } from "../styles";
import type { ProjectData } from "../domain/types";
import { Btn, IconBtn, Input, Label, Trash, XIcon } from "./atoms";

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 style={{ fontSize: 12, fontWeight: 700, color: S.text, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</h4>
      {children}
    </div>
  );
}

export function SettingsPanel({
  data,
  save,
  onClose,
  onExport,
  onImport,
}: {
  data: ProjectData;
  save: (d: ProjectData) => void;
  onClose: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const [pName, setPName] = useState(data.project.name);
  const [sDate, setSDate] = useState(data.project.startDate);
  const [tDate, setTDate] = useState(data.project.targetReleaseDate || "");
  const [nHD, setNHD] = useState("");
  const [nHN, setNHN] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const hols = data.project.holidays || [];

  const savePrj = () => save({ ...data, project: { ...data.project, name: pName, startDate: sDate, targetReleaseDate: tDate || undefined } });
  const addHol = () => {
    if (!nHD) return;
    save({
      ...data,
      project: {
        ...data.project,
        holidays: [...hols, { date: nHD, name: nHN.trim() || "Holiday" }].sort((a, b) => a.date.localeCompare(b.date)),
      },
    });
    setNHD("");
    setNHN("");
  };
  const rmHol = (d: string) => save({ ...data, project: { ...data.project, holidays: hols.filter((h) => h.date !== d) } });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        backdropFilter: "blur(4px)",
      }}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: `1px solid ${S.border}`,
            position: "sticky",
            top: 0,
            background: "#fff",
            borderRadius: "16px 16px 0 0",
            zIndex: 1,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: 0 }}>Project Settings</h3>
          <IconBtn onClick={onClose}>
            <XIcon />
          </IconBtn>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 28 }}>
          <p style={{ fontSize: 11, color: S.textMuted, margin: "-8px 0 0", background: "#f9fafb", borderRadius: 8, padding: "8px 12px" }}>
            Looking to add or remove someone? That's under <strong>👥 Members</strong> in the sidebar. Looking to add a milestone? That's now created directly from the <strong>📋 Tasks</strong> view.
          </p>
          <Sec title="General">
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 2 }}>
                <Label>Project Name</Label>
                <Input value={pName} onChange={(e) => setPName(e.target.value)} onBlur={savePrj} />
              </div>
              <div style={{ flex: 1 }}>
                <Label>Start Date</Label>
                <Input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} onBlur={savePrj} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <Label>Target Release Date</Label>
              <Input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} onBlur={savePrj} style={{ maxWidth: 200 }} />
              <p style={{ fontSize: 11, color: S.textMuted, marginTop: 6 }}>
                The committed release date — shown as a fixed marker on the Timeline. Separate from the tentative date, which is forecast automatically
                from the current schedule.
              </p>
            </div>
          </Sec>
          <Sec title="Holidays (Global)">
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              {hols.map((h) => (
                <div key={h.date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fffbeb", borderRadius: 8, padding: "6px 12px" }}>
                  <span style={{ fontSize: 12 }}>
                    <span style={{ fontFamily: "monospace", color: "#92400e" }}>{h.date}</span> <span style={{ color: "#78350f" }}>{h.name}</span>
                  </span>
                  <IconBtn onClick={() => rmHol(h.date)}>
                    <Trash />
                  </IconBtn>
                </div>
              ))}
              {hols.length === 0 && <p style={{ fontSize: 12, color: S.textMuted, margin: 0 }}>No holidays</p>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Input type="date" value={nHD} onChange={(e) => setNHD(e.target.value)} style={{ flex: 1 }} />
              <Input value={nHN} onChange={(e) => setNHN(e.target.value)} placeholder="Name" onKeyDown={(e) => e.key === "Enter" && addHol()} style={{ flex: 1 }} />
              <Btn onClick={addHol} style={{ background: "#f59e0b" }}>
                Add
              </Btn>
            </div>
          </Sec>
          <Sec title="Data">
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={onExport} variant="secondary">
                Export JSON
              </Btn>
              <Btn onClick={() => fileInput.current?.click()} variant="secondary">
                Import JSON
              </Btn>
              <input
                ref={fileInput}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImport(f);
                  e.target.value = "";
                }}
              />
            </div>
            <p style={{ fontSize: 11, color: S.textMuted, marginTop: 8 }}>Import replaces all current data with the contents of the file.</p>
          </Sec>
        </div>
      </div>
    </div>
  );
}
