import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  ShieldCheck, ShieldAlert, ShieldX, Activity, MapPin, Clock, Smartphone,
  AlertTriangle, ChevronRight, FileText, Users, LogOut, RefreshCw, Eye,
  Camera, CameraOff, ScanFace, Lock, Fingerprint, Stethoscope, ClipboardList,
  CalendarCheck, Scale, Info, X, GitBranch, TimerReset, UserPlus, Gauge,
  Cloud, Wifi, Download, ScanEye, Layers, Sparkles, HeartPulse,
} from "lucide-react";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
`;

/* ---------------------------------------------------------------------- */
/* DATA MODEL                                                              */
/* ---------------------------------------------------------------------- */

const ROLES = [
  { id: "patient", label: "Patient", group: "patient", Icon: Users },
  { id: "receptionist", label: "Receptionist", group: "staff", Icon: ClipboardList },
  { id: "nurse", label: "Nurse", group: "staff", Icon: Activity },
  { id: "doctor", label: "Doctor", group: "staff", Icon: Stethoscope },
  { id: "admin", label: "System Admin", group: "staff", Icon: Lock },
];

// Six weighted risk signals. Weights are documented here so the reasoning
// is auditable in the case study, not hidden in a magic number.
const FACTORS = [
  { key: "device", label: "Device fingerprint", icon: Smartphone, weight: 22 },
  { key: "location", label: "Network / location", icon: MapPin, weight: 18 },
  { key: "time", label: "Time-of-day pattern", icon: Clock, weight: 8 },
  { key: "biometric", label: "Facial match confidence", icon: ScanFace, weight: 30 },
  { key: "behavioral", label: "Interaction rhythm", icon: Fingerprint, weight: 12 },
  { key: "frequency", label: "Login frequency baseline", icon: TimerReset, weight: 10 },
];

function computeScan(anomalous, attemptNumber) {
  if (anomalous) {
    return {
      device: { pass: false, detail: "Unrecognised device fingerprint" },
      location: { pass: false, detail: "Login from atypical network region" },
      time: { pass: true, detail: "03:14 — outside normal shift hours", warn: true },
      biometric: { pass: true, detail: `${91 - attemptNumber * 3}% match`, value: 91 - attemptNumber * 3 },
      behavioral: { pass: false, detail: "Cursor/typing rhythm deviates from baseline" },
      frequency: { pass: true, detail: "3rd attempt in 4 minutes", warn: true },
      failedAttempts: attemptNumber,
    };
  }
  return {
    device: { pass: true, detail: "Matches enrolled workstation" },
    location: { pass: true, detail: "Hospital internal network" },
    time: { pass: true, detail: "09:42 — within normal hours" },
    biometric: { pass: true, detail: "98% match", value: 98 },
    behavioral: { pass: true, detail: "Consistent with enrolled baseline" },
    frequency: { pass: true, detail: "Typical for this user" },
    failedAttempts: 0,
  };
}

function scoreFromScan(scan) {
  let risk = 0;
  if (!scan.device.pass) risk += 22;
  if (!scan.location.pass) risk += 18;
  if (scan.time.warn) risk += 6;
  if (scan.biometric.value < 95) risk += (95 - scan.biometric.value) * 0.55;
  if (!scan.behavioral.pass) risk += 12;
  if (scan.frequency.warn) risk += 6;
  risk += scan.failedAttempts * 5;
  return Math.min(100, Math.round(risk));
}

function verdictFromScore(score) {
  if (score <= 25) return { tier: "low", label: "Access granted", color: "var(--safe)", Icon: ShieldCheck };
  if (score <= 60) return { tier: "medium", label: "Step-up MFA required", color: "var(--caution)", Icon: ShieldAlert };
  return { tier: "high", label: "Access denied — flagged for review", color: "var(--danger)", Icon: ShieldX };
}

const LOG_SEED = [
  { user: "N. Peiris", role: "Receptionist", time: "08:12", score: 6, verdict: "Granted" },
  { user: "T. Bandara", role: "Nurse", time: "07:58", score: 14, verdict: "Granted" },
  { user: "Dr. S. Wickrama", role: "Doctor", time: "07:41", score: 9, verdict: "Granted" },
  { user: "Unknown device", role: "Admin", time: "03:14", score: 82, verdict: "Denied" },
  { user: "R. Fernando", role: "Patient", time: "21:03", score: 22, verdict: "Granted" },
];

const RISK_TREND = [12, 18, 9, 34, 15, 61, 11]; // last 7 days, avg daily risk
const VERDICT_DIST = [
  { label: "Granted", value: 118, color: "var(--safe)" },
  { label: "Step-up", value: 21, color: "var(--caution)" },
  { label: "Denied", value: 6, color: "var(--danger)" },
];

const VERSION_LOG = [
  {
    v: "V1",
    focus: "Single-factor face toggle",
    feedbackSource: "Pilot test — 2 receptionists, 1 patient",
    feedback: "\u201cFeels like it's just checking a checkbox, not really me.\u201d — reception staff felt a single pass/fail face check gave no confidence it was secure for patient records.",
    change: "Added a visible multi-factor breakdown (device, location, time) instead of one binary check.",
  },
  {
    v: "V2",
    focus: "Multi-factor risk score, single role type",
    feedbackSource: "Pilot test — ward nurse, IT lead",
    feedback: "\u201cA nurse and a system admin should not see the same risk tolerance.\u201d — IT lead flagged that treating all staff identically ignored real access-control needs.",
    change: "Introduced role-based access control (Doctor / Nurse / Receptionist / Admin / Patient) with role-specific dashboards.",
  },
  {
    v: "V3",
    focus: "RBAC added, no lockout or session control",
    feedbackSource: "Pilot test — hospital IT security policy review",
    feedback: "\u201cWhat stops someone just retrying the scan until they get lucky?\u201d — reviewer pointed out repeated attempts had no consequence.",
    change: "Added account lockout after 3 high-risk attempts, session idle timeout, and an audit-log dashboard for admins.",
  },
  {
    v: "Final",
    focus: "Full platform",
    feedbackSource: "Combined feedback + self-review against Unit 47 ethics criteria",
    feedback: "Testers wanted to understand what happens to their face data, not just be scanned by it.",
    change: "Added an explicit enrolment step (separate from login), an Ethics & Legal panel explaining data handling limits, and this version-iteration record.",
  },
];

// Low-fidelity wireframe stand-ins for Activity 2's requirement to show
// initial wireframes and how end-user feedback reshaped them.
const WIREFRAMES = [
  {
    stage: "Initial wireframe",
    note: "Single 'Scan face' button, one pass/fail result. Reception staff testing this said it gave no visibility into *why* a login was accepted or blocked.",
    blocks: [
      { x: 30, y: 10, w: 140, h: 90, label: "camera" },
      { x: 30, y: 110, w: 140, h: 24, label: "scan button" },
      { x: 30, y: 144, w: 140, h: 20, label: "pass / fail" },
    ],
  },
  {
    stage: "Revised wireframe",
    note: "Added a visible factor breakdown and numeric risk score after feedback that opaque pass/fail felt untrustworthy for patient data.",
    blocks: [
      { x: 30, y: 10, w: 140, h: 80, label: "camera + gauge" },
      { x: 30, y: 98, w: 140, h: 14, label: "factor 1" },
      { x: 30, y: 114, w: 140, h: 14, label: "factor 2" },
      { x: 30, y: 130, w: 140, h: 14, label: "factor 3" },
      { x: 30, y: 150, w: 140, h: 16, label: "verdict banner" },
    ],
  },
  {
    stage: "Final layout",
    note: "Added role selector above the scan card and moved admin/ops tools (audit log, ethics, iterations) into a persistent session bar once RBAC was introduced.",
    blocks: [
      { x: 20, y: 6, w: 160, h: 18, label: "role selector" },
      { x: 20, y: 30, w: 160, h: 70, label: "camera + gauge" },
      { x: 20, y: 104, w: 160, h: 40, label: "factor breakdown" },
      { x: 20, y: 148, w: 160, h: 16, label: "verdict + CTA" },
    ],
  },
];

// Simulated IoT ward sensor feed + cloud sync status, standing in for the
// brief's IoT / Cloud Computing trend coverage.
const IOT_SEED = [
  { device: "Ward 3 · Vitals monitor 04", metric: "HR 88 bpm", status: "ok" },
  { device: "Ward 3 · Vitals monitor 06", metric: "SpO2 94%", status: "warn" },
  { device: "Cold chain sensor · Pharmacy", metric: "4.1°C", status: "ok" },
  { device: "Imaging archive sync", metric: "Cloud sync 2 min ago", status: "ok" },
];

const PATIENT_RECORDS = [
  {
    name: "R. Fernando",
    note: "Post-op review due. Wound site healing within expected range at day 6.",
    aiInsight: "AI triage note: vitals trend stable over last 48h; no anomaly flags raised.",
    risk: "Low",
  },
  {
    name: "M. Silva",
    note: "Chest X-ray taken 09:10 for suspected mild pneumonia; awaiting radiologist sign-off.",
    aiInsight: "AI imaging placeholder: pattern consistent with lower-lobe opacity — flagged for radiologist review, not an automated diagnosis.",
    risk: "Medium",
  },
  {
    name: "K. Jayasuriya",
    note: "Routine follow-up for hypertension management, medication unchanged.",
    aiInsight: "AI triage note: BP readings within controlled range across last 3 visits.",
    risk: "Low",
  },
];

const ETHICS_SECTIONS = [
  {
    title: "Consent & data minimisation",
    body: "Enrolment is a distinct, explicit step — a user must knowingly opt in before any facial data is captured, separate from ordinary login. In this prototype no image or descriptor is ever transmitted or persisted outside the browser session; a production system would store only an irreversible mathematical template, never a raw image, and would let a patient withdraw consent and delete their template on request.",
  },
  {
    title: "Bias & fairness",
    body: "Facial recognition systems have documented, measurable accuracy gaps across skin tone, age and gender (independently verified by NIST's Face Recognition Vendor Test program). A hospital deployment must include human review for borderline scores and cannot rely on the algorithm alone — reflected here by the \u2018step-up verification\u2019 tier rather than a hard binary decision.",
  },
  {
    title: "Legal compliance",
    body: "Biometric data is classified as \u2018special category\u2019 personal data under most data-protection regimes (e.g. UK/EU GDPR Art. 9, and Sri Lanka's Personal Data Protection Act No. 9 of 2022), requiring explicit consent, a documented lawful basis, and breach-notification duties. Storing raw biometric templates insecurely, or without a retention/deletion policy, is itself a compliance failure independent of the app's accuracy.",
  },
  {
    title: "Social impact",
    body: "Faster, friction-light authentication can meaningfully improve care access for patients who struggle with passwords (elderly patients, low digital literacy). The flip side: patients without a reliable camera, a visible face (medical dressings, certain disabilities), or who distrust biometric collection need a non-biometric fallback path to avoid excluding them from care.",
  },
  {
    title: "Economic factors",
    body: "Reduced helpdesk load from password resets and faster clinician login are real, measurable savings; against this sits the upfront cost of secure template storage infrastructure, staff training, and ongoing compliance auditing — costs a hospital IT budget must plan for, not just the software licence.",
  },
  {
    title: "Overcoming the challenges",
    body: "Mitigations reflected (at least conceptually) in this prototype: multi-factor scoring so no single signal is a single point of failure; a manual fallback (PIN/ID card) for anyone biometrics fail; account lockout to blunt brute-force retry attacks; and an audit log so every access decision is reviewable, not a black box.",
  },
];

/* ---------------------------------------------------------------------- */
/* SMALL VISUAL COMPONENTS                                                 */
/* ---------------------------------------------------------------------- */

function GaugeRing({ score, color }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, score) / 100;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
      <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={c} strokeDashoffset={c - pct * c} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.4s ease" }} />
    </svg>
  );
}

function MiniBarChart({ data, color }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 64 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{
            width: "100%", height: Math.max(4, (v / max) * 52), borderRadius: 4,
            background: v > 45 ? "var(--danger)" : v > 25 ? "var(--caution)" : color,
            transition: "height 0.6s ease",
          }} />
          <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 9, color: "var(--text-muted)" }}>
            {["M", "T", "W", "T", "F", "S", "S"][i]}
          </span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  let offset = 0;
  const r = 44, c = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width="110" height="110" viewBox="0 0 110 110" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="55" cy="55" r={r} fill="none" stroke="var(--line)" strokeWidth="14" />
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * c;
          const el = (
            <circle key={i} cx="55" cy="55" r={r} fill="none" stroke={d.color} strokeWidth="14"
              strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset}
              style={{ transition: "stroke-dashoffset 0.6s ease" }} />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.map((d) => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Inter, sans-serif", fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
            <span style={{ color: "var(--text-muted)" }}>{d.label}</span>
            <span style={{ color: "var(--text)", fontFamily: "IBM Plex Mono, monospace" }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScanFactorRow({ factor, result, revealed }) {
  const Icon = factor.icon;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
      opacity: revealed ? 1 : 0, transform: revealed ? "translateY(0)" : "translateY(4px)",
      transition: "opacity 0.35s ease, transform 0.35s ease", borderBottom: "1px solid var(--line)",
    }}>
      <Icon size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "var(--text)", flex: 1 }}>
        {factor.label}
        <span style={{ color: "var(--text-muted)", fontSize: 10.5, marginLeft: 6 }}>w{factor.weight}</span>
      </span>
      {revealed && result && (
        <span style={{
          fontFamily: "IBM Plex Mono, monospace", fontSize: 11.5,
          color: result.warn ? "var(--caution)" : result.pass ? "var(--safe)" : "var(--danger)",
          textAlign: "right", maxWidth: 190,
        }}>
          {result.detail}
        </span>
      )}
    </div>
  );
}

function Panel({ children, style }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, ...style }}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* MODALS                                                                   */
/* ---------------------------------------------------------------------- */

function ModalShell({ title, Icon, onClose, children, wide }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(5,10,16,0.72)", display: "grid",
      placeItems: "center", zIndex: 50, padding: 20,
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: wide ? 640 : 480, maxHeight: "84vh", overflowY: "auto",
          background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon size={18} color="var(--accent)" />
            <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 17, fontWeight: 600, color: "var(--text)", margin: 0 }}>
              {title}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EthicsModal({ onClose }) {
  return (
    <ModalShell title="Ethics, Legal & Economic Considerations" Icon={Scale} onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {ETHICS_SECTIONS.map((s) => (
          <div key={s.title}>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13.5, fontWeight: 600, color: "var(--accent)", marginBottom: 4 }}>
              {s.title}
            </div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "var(--text)", lineHeight: 1.55, margin: 0 }}>
              {s.body}
            </p>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

function Wireframe({ wf }) {
  return (
    <div>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 12.5, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
        {wf.stage}
      </div>
      <svg width="200" height="180" viewBox="0 0 200 180" style={{ background: "#08131F", borderRadius: 8, border: "1px solid var(--line)" }}>
        {wf.blocks.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="4" fill="none" stroke="var(--text-muted)" strokeDasharray="3 3" />
            <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 3} textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily="IBM Plex Mono, monospace">
              {b.label}
            </text>
          </g>
        ))}
      </svg>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>{wf.note}</p>
    </div>
  );
}

function VersionLogModal({ onClose }) {
  const [tab, setTab] = useState("iterations"); // iterations | wireframes

  return (
    <ModalShell title="Development History" Icon={GitBranch} onClose={onClose} wide>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { id: "iterations", label: "Iterations", Icon: GitBranch },
          { id: "wireframes", label: "Wireframes", Icon: Layers },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8,
              border: `1px solid ${tab === t.id ? "var(--accent)" : "var(--line)"}`,
              background: tab === t.id ? "rgba(78,157,224,0.12)" : "transparent",
              color: tab === t.id ? "var(--text)" : "var(--text-muted)",
              fontFamily: "Inter, sans-serif", fontSize: 12.5, cursor: "pointer",
            }}
          >
            <t.Icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "iterations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {VERSION_LOG.map((v) => (
            <Panel key={v.v} style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "var(--accent)",
                  border: "1px solid var(--accent)", borderRadius: 6, padding: "2px 7px",
                }}>{v.v}</span>
                <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  {v.focus}
                </span>
              </div>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px", lineHeight: 1.5 }}>
                <strong style={{ color: "var(--text)" }}>End-user feedback</strong> ({v.feedbackSource}): {v.feedback}
              </p>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "var(--safe)", margin: 0, lineHeight: 1.5 }}>
                → {v.change}
              </p>
            </Panel>
          ))}
        </div>
      )}

      {tab === "wireframes" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 }}>
          {WIREFRAMES.map((wf) => <Wireframe key={wf.stage} wf={wf} />)}
        </div>
      )}
    </ModalShell>
  );
}

/* ---------------------------------------------------------------------- */
/* ENROLLMENT FLOW                                                          */
/* ---------------------------------------------------------------------- */

function EnrollScreen({ onDone, onCancel }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("patient");
  const [captures, setCaptures] = useState(0);
  const [camStatus, setCamStatus] = useState("idle");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  const requestCamera = useCallback(async () => {
    setCamStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamStatus("live");
    } catch {
      setCamStatus("denied");
    }
  }, []);

  const capture = () => {
    if (captures < 3) setCaptures((c) => c + 1);
  };

  return (
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "36px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
          Suwa Setha Hospital · Enrolment
        </div>
        <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 22, fontWeight: 600, color: "var(--text)", margin: 0 }}>
          Enrol a new biometric identity
        </h1>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 }}>
          This is a deliberate, explicit consent step — separate from everyday login — before any facial
          data is captured.
        </p>
      </div>

      <Panel style={{ marginBottom: 16 }}>
        <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "var(--text-muted)" }}>Full name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. A. Ryazan"
          style={{
            width: "100%", marginTop: 6, marginBottom: 14, padding: "9px 10px", borderRadius: 8,
            border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)",
            fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box",
          }}
        />
        <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "var(--text-muted)" }}>Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{
            width: "100%", marginTop: 6, marginBottom: 4, padding: "9px 10px", borderRadius: 8,
            border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)",
            fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none",
          }}
        >
          {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </Panel>

      <Panel>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div style={{ position: "relative", width: 130, height: 130 }}>
            <div style={{ width: 130, height: 130, borderRadius: "50%", border: "2px solid var(--line)", overflow: "hidden", background: "#08131F" }}>
              <video ref={videoRef} muted playsInline style={{
                width: "100%", height: "100%", objectFit: "cover",
                display: camStatus === "live" ? "block" : "none", transform: "scaleX(-1)",
              }} />
            </div>
            {camStatus !== "live" && (
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                {camStatus === "denied" ? <CameraOff size={30} color="var(--caution)" /> : <Camera size={34} color="var(--text-muted)" />}
              </div>
            )}
          </div>
        </div>

        {camStatus !== "live" && camStatus !== "denied" && (
          <button onClick={requestCamera} style={btnPrimary}>
            {camStatus === "requesting" ? "Requesting camera…" : "Enable camera"}
          </button>
        )}

        {camStatus === "denied" && (
          <p style={{ textAlign: "center", fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, color: "var(--text-muted)" }}>
            Camera blocked in this sandbox — capture buttons still simulate the flow.
          </p>
        )}

        {(camStatus === "live" || camStatus === "denied") && (
          <>
            <div style={{ display: "flex", gap: 6, justifyContent: "center", margin: "14px 0" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: captures > i ? "var(--safe)" : "var(--line)", transition: "background 0.3s ease",
                }} />
              ))}
            </div>
            <p style={{ textAlign: "center", fontFamily: "Inter, sans-serif", fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
              {captures < 3 ? `Capture angle ${captures + 1} of 3 — turn head slightly each time (liveness check)` : "3 captures complete — descriptor ready to enrol"}
            </p>
            {captures < 3 ? (
              <button onClick={capture} style={btnPrimary}>Capture frame {captures + 1}</button>
            ) : (
              <button
                disabled={!name}
                onClick={() => { stopCamera(); onDone({ name, role }); }}
                style={{ ...btnPrimary, opacity: name ? 1 : 0.5, cursor: name ? "pointer" : "not-allowed" }}
              >
                Save enrolment
              </button>
            )}
          </>
        )}
      </Panel>

      <button onClick={() => { stopCamera(); onCancel(); }} style={{ ...btnGhost, marginTop: 12 }}>
        Cancel and return to login
      </button>
    </div>
  );
}

const btnPrimary = {
  width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: "var(--accent)",
  color: "#08131F", fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
};
const btnGhost = {
  width: "100%", padding: "10px 0", borderRadius: 10, border: "1px solid var(--line)", background: "transparent",
  color: "var(--text-muted)", fontFamily: "Inter, sans-serif", fontSize: 13, cursor: "pointer",
};

/* ---------------------------------------------------------------------- */
/* AUTH SCREEN                                                              */
/* ---------------------------------------------------------------------- */

function AuthScreen({ onGranted, onEnroll, enrolledNames }) {
  const [role, setRole] = useState("patient");
  const [anomalous, setAnomalous] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | scanning | result | locked
  const [revealCount, setRevealCount] = useState(0);
  const [scan, setScan] = useState(null);
  const [score, setScore] = useState(0);
  const [camStatus, setCamStatus] = useState("idle");
  const [highRiskStreak, setHighRiskStreak] = useState(0);
  const [lockCountdown, setLockCountdown] = useState(0);
  const [detectorSupport, setDetectorSupport] = useState("checking"); // checking | native | unsupported
  const [liveFaceSeen, setLiveFaceSeen] = useState(false);
  const timers = useRef([]);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const detectLoopRef = useRef(null);

  useEffect(() => {
    // Feature-detect the browser's native Shape Detection API. This is a real,
    // built-in capability (no model download) that can confirm a face is
    // physically present in frame — it does NOT identify or match a person.
    // Identity matching in this prototype remains simulated; see the note
    // in the scan factor list and the Ethics & Legal panel.
    if (typeof window !== "undefined" && "FaceDetector" in window) {
      try {
        detectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        setDetectorSupport("native");
      } catch {
        setDetectorSupport("unsupported");
      }
    } else {
      setDetectorSupport("unsupported");
    }
  }, []);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    if (phase !== "locked" || lockCountdown <= 0) return;
    const t = setTimeout(() => setLockCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, lockCountdown]);

  useEffect(() => {
    if (phase === "locked" && lockCountdown === 0) {
      setPhase("idle");
      setHighRiskStreak(0);
    }
  }, [phase, lockCountdown]);

  const requestCamera = useCallback(async () => {
    setCamStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      setCamStatus("live");
    } catch { setCamStatus("denied"); }
  }, []);

  useEffect(() => {
    if (phase !== "scanning" || camStatus !== "live" || detectorSupport !== "native") return;
    detectLoopRef.current = setInterval(async () => {
      if (!videoRef.current || !detectorRef.current) return;
      try {
        const faces = await detectorRef.current.detect(videoRef.current);
        setLiveFaceSeen(faces && faces.length > 0);
      } catch {
        // Detection can throw on some frames/browsers — fail silently and keep trying.
      }
    }, 350);
    return () => clearInterval(detectLoopRef.current);
  }, [phase, camStatus, detectorSupport]);

  const startScan = useCallback(async () => {
    if (phase === "locked") return;
    clearTimers();
    setLiveFaceSeen(false);
    await requestCamera();
    const s = computeScan(anomalous, highRiskStreak + 1);
    if (detectorSupport === "native") {
      s.biometric = {
        ...s.biometric,
        detail: `${s.biometric.detail} · presence confirmed by native detector`,
      };
    }
    setScan(s);
    setPhase("scanning");
    setRevealCount(0);
    setScore(0);

    FACTORS.forEach((f, i) => {
      const t = setTimeout(() => setRevealCount(i + 1), 300 * (i + 1));
      timers.current.push(t);
    });

    const finalScore = scoreFromScan(s);
    const t2 = setTimeout(() => {
      setScore(finalScore);
      stopCamera();
      setCamStatus("idle");
      const v = verdictFromScore(finalScore);
      if (v.tier === "high") {
        const nextStreak = highRiskStreak + 1;
        setHighRiskStreak(nextStreak);
        if (nextStreak >= 3) {
          setPhase("locked");
          setLockCountdown(15);
          return;
        }
      } else {
        setHighRiskStreak(0);
      }
      setPhase("result");
    }, 300 * (FACTORS.length + 1));
    timers.current.push(t2);
  }, [anomalous, requestCamera, stopCamera, phase, highRiskStreak, detectorSupport]);

  const verdict = phase === "result" ? verdictFromScore(score) : null;

  return (
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "36px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
          Suwa Setha Hospital · Secure Access
        </div>
        <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 22, fontWeight: 600, color: "var(--text)", margin: 0 }}>
          AI-Driven Biometric Authentication
        </h1>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: "var(--text-muted)", marginTop: 6 }}>
          {enrolledNames.length} identities enrolled this session
        </p>
        <p style={{
          fontFamily: "IBM Plex Mono, monospace", fontSize: 10, marginTop: 6,
          color: detectorSupport === "native" ? "var(--safe)" : "var(--text-muted)",
        }}>
          {detectorSupport === "checking" && "Checking face-presence detection support…"}
          {detectorSupport === "native" && "Live face-presence check: native browser FaceDetector API"}
          {detectorSupport === "unsupported" && "Live face-presence check unsupported in this browser — using simulated result"}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 20 }}>
        {ROLES.map((r) => (
          <button
            key={r.id}
            onClick={() => { setRole(r.id); setPhase("idle"); clearTimers(); }}
            title={r.label}
            style={{
              padding: "10px 0", borderRadius: 8,
              border: `1px solid ${role === r.id ? "var(--accent)" : "var(--line)"}`,
              background: role === r.id ? "rgba(78,157,224,0.12)" : "transparent",
              color: role === r.id ? "var(--text)" : "var(--text-muted)",
              cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            }}
          >
            <r.Icon size={15} />
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 9.5 }}>{r.label.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      <Panel style={{ borderRadius: 16, padding: 28 }}>
        {phase === "locked" ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <ShieldX size={40} color="var(--danger)" style={{ marginBottom: 10 }} />
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
              Account locked
            </div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "var(--text-muted)", margin: "8px 0 0" }}>
              3 consecutive high-risk attempts detected. Locked for security review.
            </p>
            <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 24, color: "var(--danger)", marginTop: 14 }}>
              {lockCountdown}s
            </div>
            <p style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, color: "var(--text-muted)", marginTop: 10 }}>
              In production: this would require IT/security desk unlock, not a timer.
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <button onClick={startScan} disabled={phase === "scanning"} aria-label="Start facial scan" style={{
                position: "relative", width: 140, height: 140, display: "grid", placeItems: "center",
                background: "none", border: "none", cursor: phase === "scanning" ? "default" : "pointer",
                overflow: "hidden", borderRadius: "50%",
              }}>
                {phase === "result" ? (
                  <GaugeRing score={score} color={verdict.color} />
                ) : (
                  <div style={{ position: "absolute", width: 140, height: 140, borderRadius: "50%", border: "2px solid var(--line)", overflow: "hidden", background: "#08131F" }}>
                    <video ref={videoRef} muted playsInline style={{
                      width: "100%", height: "100%", objectFit: "cover",
                      display: camStatus === "live" ? "block" : "none", transform: "scaleX(-1)",
                    }} />
                  </div>
                )}
                <div style={{ position: "absolute", display: "grid", placeItems: "center" }}>
                  {phase !== "result" ? (
                    camStatus === "live" ? (
                      <div style={{
                        width: 96, height: 96, borderRadius: "50%",
                        border: `2px solid ${phase === "scanning" ? "var(--accent)" : "var(--line)"}`,
                        animation: phase === "scanning" ? "pulse 1s ease-in-out infinite" : "none",
                      }} />
                    ) : camStatus === "denied" ? (
                      <CameraOff size={40} color="var(--caution)" />
                    ) : (
                      <Camera size={44} color={camStatus === "requesting" ? "var(--accent)" : "var(--text-muted)"}
                        style={{ animation: camStatus === "requesting" ? "pulse 1s ease-in-out infinite" : "none" }} />
                    )
                  ) : (
                    <div style={{ textAlign: "center" }}>
                      <verdict.Icon size={30} color={verdict.color} />
                      <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 20, fontWeight: 600, color: verdict.color, marginTop: 2 }}>
                        {score}
                      </div>
                    </div>
                  )}
                </div>
              </button>
            </div>

            <p aria-live="polite" style={{ textAlign: "center", fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 6px" }}>
              {phase === "idle" && "Tap to allow camera access and begin authentication"}
              {phase === "scanning" && camStatus === "live" && "Hold still — evaluating identity signals…"}
              {phase === "scanning" && camStatus === "requesting" && "Requesting camera access…"}
              {phase === "scanning" && camStatus === "denied" && "Camera unavailable — continuing with simulated scan"}
              {phase === "result" && "Weighted risk score (0 = trusted, 100 = high risk)"}
            </p>
            {phase === "scanning" && camStatus === "live" && detectorSupport === "native" && (
              <p style={{ textAlign: "center", fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, color: liveFaceSeen ? "var(--safe)" : "var(--caution)", margin: "0 0 6px" }}>
                <ScanEye size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
                {liveFaceSeen ? "Face detected in frame" : "No face detected — move into frame"}
              </p>
            )}
            {highRiskStreak > 0 && phase !== "scanning" && (
              <p style={{ textAlign: "center", fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, color: "var(--caution)", margin: "0 0 12px" }}>
                {highRiskStreak}/3 high-risk attempts before lockout
              </p>
            )}
            <div style={{ marginBottom: 12 }} />

            {phase !== "idle" && (
              <div style={{ marginBottom: 18 }}>
                {FACTORS.map((f, i) => (
                  <ScanFactorRow key={f.key} factor={f} result={scan?.[f.key]} revealed={revealCount > i} />
                ))}
              </div>
            )}

            {phase === "result" && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10,
                background: `${verdict.color}15`, border: `1px solid ${verdict.color}40`, marginBottom: 16,
              }}>
                <verdict.Icon size={18} color={verdict.color} style={{ flexShrink: 0 }} />
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                  {verdict.label}
                </span>
              </div>
            )}

            {phase === "result" && verdict.tier !== "high" && (
              <button onClick={() => onGranted(role)} style={{ ...btnPrimary, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                Continue to dashboard <ChevronRight size={15} />
              </button>
            )}
            {phase === "result" && verdict.tier === "high" && (
              <button onClick={startScan} style={{ ...btnGhost, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <RefreshCw size={14} /> Retry authentication
              </button>
            )}
          </>
        )}
      </Panel>

      <label style={{
        display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontFamily: "IBM Plex Mono, monospace",
        fontSize: 11.5, color: "var(--text-muted)", cursor: "pointer", userSelect: "none",
      }}>
        <input type="checkbox" checked={anomalous} onChange={(e) => { setAnomalous(e.target.checked); setPhase("idle"); clearTimers(); }} style={{ accentColor: "var(--danger)" }} />
        Demo mode: simulate suspicious login attempt
      </label>

      <button onClick={onEnroll} style={{ ...btnGhost, marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <UserPlus size={14} /> Enrol a new biometric identity
      </button>

      <style>{`
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.7; } }
      `}</style>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* DASHBOARD                                                                */
/* ---------------------------------------------------------------------- */

function SessionBar({ role, secondsLeft, onLogout, onEthics, onVersions }) {
  const roleObj = ROLES.find((r) => r.id === role);
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24,
      paddingBottom: 18, borderBottom: "1px solid var(--line)", flexWrap: "wrap", gap: 12,
    }}>
      <div>
        <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
          Suwa Setha Hospital
        </div>
        <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 20, fontWeight: 600, color: "var(--text)", margin: 0 }}>
          {roleObj.label} Console
        </h1>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 5, fontFamily: "IBM Plex Mono, monospace", fontSize: 11,
          color: secondsLeft < 15 ? "var(--danger)" : "var(--text-muted)", border: "1px solid var(--line)",
          borderRadius: 8, padding: "6px 10px",
        }}>
          <TimerReset size={13} /> Session {secondsLeft}s
        </div>
        <button onClick={onVersions} style={iconBtn}><GitBranch size={13} /> Iterations</button>
        <button onClick={onEthics} style={iconBtn}><Scale size={13} /> Ethics & legal</button>
        <button onClick={onLogout} style={iconBtn}><LogOut size={13} /> Sign out</button>
      </div>
    </div>
  );
}

const iconBtn = {
  display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--line)", background: "transparent", color: "var(--text-muted)",
  fontFamily: "Inter, sans-serif", fontSize: 12, cursor: "pointer",
};

function StatCard({ label, value, Icon, warn }) {
  return (
    <Panel style={{ flex: 1, minWidth: 130 }}>
      <Icon size={16} color={warn ? "var(--caution)" : "var(--accent)"} />
      <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 22, fontWeight: 600, color: "var(--text)", marginTop: 8 }}>{value}</div>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: "var(--text-muted)" }}>{label}</div>
    </Panel>
  );
}

function AdminDashboard() {
  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Logins today" value="142" Icon={Users} />
        <StatCard label="Flagged attempts" value="3" Icon={AlertTriangle} warn />
        <StatCard label="Avg. risk score" value="14.7" Icon={Gauge} />
        <StatCard label="Active lockouts" value="1" Icon={Lock} warn />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 12, marginBottom: 20 }}>
        <Panel>
          <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>
            Average risk score — last 7 days
          </div>
          <MiniBarChart data={RISK_TREND} color="var(--accent)" />
        </Panel>
        <Panel>
          <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>
            Verdict distribution
          </div>
          <DonutChart data={VERDICT_DIST} />
        </Panel>
      </div>
      <Panel style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Cloud size={15} color="var(--accent)" />
          <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            IoT ward sensors &amp; cloud sync
          </span>
        </div>
        {IOT_SEED.map((d, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
            borderBottom: i < IOT_SEED.length - 1 ? "1px solid var(--line)" : "none",
          }}>
            <Wifi size={13} color={d.status === "warn" ? "var(--caution)" : "var(--text-muted)"} />
            <span style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "var(--text)" }}>{d.device}</span>
            <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11.5, color: d.status === "warn" ? "var(--caution)" : "var(--text-muted)" }}>{d.metric}</span>
          </div>
        ))}
        <p style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 9.5, color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}>
          Simulated feed — represents where real IoT ward devices and a cloud data-sync service would report in.
        </p>
      </Panel>

      <Panel style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Access audit log</span>
          <button
            onClick={() => {
              const header = "user,role,time,score,verdict\n";
              const rows = LOG_SEED.map((r) => `${r.user},${r.role},${r.time},${r.score},${r.verdict}`).join("\n");
              const blob = new Blob([header + rows], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "suwa-setha-audit-log.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
            aria-label="Export audit log as CSV"
            style={{ ...iconBtn, padding: "6px 10px" }}
          >
            <Download size={12} /> Export CSV
          </button>
        </div>
        {LOG_SEED.map((row, i) => {
          const color = row.score > 65 ? "var(--danger)" : row.score > 30 ? "var(--caution)" : "var(--safe)";
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 18px",
              borderBottom: i < LOG_SEED.length - 1 ? "1px solid var(--line)" : "none",
            }}>
              <div style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 13, color: "var(--text)" }}>{row.user}</div>
              <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "var(--text-muted)", width: 90 }}>{row.role}</div>
              <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11.5, color: "var(--text-muted)", width: 55 }}>{row.time}</div>
              <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, color, width: 30, textAlign: "right" }}>{row.score}</div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 500, color, background: `${color}18`, padding: "3px 9px", borderRadius: 999, width: 60, textAlign: "center" }}>
                {row.verdict}
              </div>
            </div>
          );
        })}
      </Panel>
    </>
  );
}

function DoctorDashboard() {
  const [selected, setSelected] = useState(PATIENT_RECORDS[0].name);
  const patient = PATIENT_RECORDS.find((p) => p.name === selected);

  return (
    <>
      <Panel style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <Stethoscope size={20} color="var(--accent)" />
        <div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Verified via biometric authentication</div>
          <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Clinical record access · session trusted</div>
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 12 }}>
        <Panel style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", fontFamily: "Space Grotesk, sans-serif", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            Patient list
          </div>
          {PATIENT_RECORDS.map((p) => (
            <button
              key={p.name}
              onClick={() => setSelected(p.name)}
              aria-pressed={selected === p.name}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "11px 14px",
                background: selected === p.name ? "rgba(78,157,224,0.12)" : "transparent",
                border: "none", borderBottom: "1px solid var(--line)", cursor: "pointer",
              }}
            >
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "var(--text)" }}>{p.name}</div>
              <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, color: p.risk === "Medium" ? "var(--caution)" : "var(--safe)", marginTop: 2 }}>
                Clinical risk flag: {p.risk}
              </div>
            </button>
          ))}
        </Panel>

        <Panel>
          <FileText size={17} color="var(--accent)" />
          <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 15, fontWeight: 600, color: "var(--text)", marginTop: 10 }}>{patient.name}</div>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>{patient.note}</p>

          <div style={{
            marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(78,157,224,0.08)",
            border: "1px solid rgba(78,157,224,0.3)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Sparkles size={13} color="var(--accent)" />
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600, color: "var(--accent)" }}>AI Diagnostic Assistant</span>
            </div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "var(--text)", margin: 0, lineHeight: 1.5 }}>{patient.aiInsight}</p>
            <p style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 9.5, color: "var(--text-muted)", marginTop: 8 }}>
              Simulated output for demo purposes — a real deployment would route imaging through a
              clinically validated model with radiologist sign-off, never an automated diagnosis.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}

function NurseDashboard() {
  const queue = [
    { bed: "Ward 3 · Bed 4", patient: "R. Fernando", vitals: "BP 118/76 · HR 72", flag: false },
    { bed: "Ward 3 · Bed 6", patient: "M. Silva", vitals: "BP 142/91 · HR 98", flag: true },
    { bed: "Ward 2 · Bed 1", patient: "K. Jayasuriya", vitals: "BP 121/80 · HR 68", flag: false },
  ];
  return (
    <Panel style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Vitals monitoring queue</span>
      </div>
      {queue.map((q, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: i < queue.length - 1 ? "1px solid var(--line)" : "none" }}>
          <div style={{ width: 110, fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "var(--text-muted)" }}>{q.bed}</div>
          <div style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 13, color: "var(--text)" }}>{q.patient}</div>
          <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11.5, color: q.flag ? "var(--caution)" : "var(--text-muted)" }}>{q.vitals}</div>
          {q.flag && <AlertTriangle size={14} color="var(--caution)" />}
        </div>
      ))}
    </Panel>
  );
}

function ReceptionistDashboard() {
  const appts = [
    { time: "09:30", patient: "R. Fernando", clinician: "Dr. Wickrama", status: "Checked in" },
    { time: "10:00", patient: "M. Silva", clinician: "Dr. Perera", status: "Waiting" },
    { time: "10:30", patient: "K. Jayasuriya", clinician: "Dr. Wickrama", status: "Scheduled" },
  ];
  return (
    <Panel style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8 }}>
        <CalendarCheck size={15} color="var(--accent)" />
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Today's appointments</span>
      </div>
      {appts.map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: i < appts.length - 1 ? "1px solid var(--line)" : "none" }}>
          <div style={{ width: 50, fontFamily: "IBM Plex Mono, monospace", fontSize: 12, color: "var(--text-muted)" }}>{a.time}</div>
          <div style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 13, color: "var(--text)" }}>{a.patient}</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: "var(--text-muted)" }}>{a.clinician}</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "var(--accent)", background: "rgba(78,157,224,0.12)", padding: "3px 9px", borderRadius: 999 }}>{a.status}</div>
        </div>
      ))}
    </Panel>
  );
}

function PatientDashboard() {
  return (
    <>
      <Panel style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <ShieldCheck size={20} color="var(--safe)" />
        <div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Verified via biometric authentication</div>
          <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Risk score 22 · session trusted</div>
        </div>
      </Panel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { title: "My records", desc: "View summary results, prescriptions and visit history", Icon: FileText },
          { title: "Appointments", desc: "Upcoming visits with Suwa Setha specialists", Icon: Users },
          { title: "Recent access", desc: "Every time your record has been viewed or accessed", Icon: Eye },
          { title: "Security", desc: "Manage biometric enrolment and trusted devices", Icon: ShieldCheck },
        ].map((c) => (
          <Panel key={c.title}>
            <c.Icon size={17} color="var(--accent)" />
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text)", marginTop: 10 }}>{c.title}</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>{c.desc}</div>
          </Panel>
        ))}
      </div>
    </>
  );
}

function Dashboard({ role, onLogout }) {
  const [secondsLeft, setSecondsLeft] = useState(90);
  const [showEthics, setShowEthics] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) { onLogout(true); return; }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, onLogout]);

  const resetTimer = () => setSecondsLeft(90);

  return (
    <div onClick={resetTimer} onKeyDown={resetTimer} style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      <SessionBar role={role} secondsLeft={secondsLeft} onLogout={() => onLogout(false)} onEthics={() => setShowEthics(true)} onVersions={() => setShowVersions(true)} />
      {role === "admin" && <AdminDashboard />}
      {role === "doctor" && <DoctorDashboard />}
      {role === "nurse" && <NurseDashboard />}
      {role === "receptionist" && <ReceptionistDashboard />}
      {role === "patient" && <PatientDashboard />}
      {showEthics && <EthicsModal onClose={() => setShowEthics(false)} />}
      {showVersions && <VersionLogModal onClose={() => setShowVersions(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* ROOT                                                                     */
/* ---------------------------------------------------------------------- */

export default function SuwaSethaBiometricSecurity() {
  const [view, setView] = useState("auth"); // auth | enroll | dashboard
  const [role, setRole] = useState("patient");
  const [enrolled, setEnrolled] = useState([]);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)", fontFamily: "Inter, sans-serif",
      ["--bg"]: "#0D1B2A", ["--surface"]: "#16283B", ["--line"]: "#28405A", ["--text"]: "#E8EEF3",
      ["--text-muted"]: "#8FA3B8", ["--accent"]: "#4E9DE0", ["--safe"]: "#2FBF8F",
      ["--caution"]: "#E8A33D", ["--danger"]: "#E85D5D", position: "relative",
    }}>
      <style>{FONT_IMPORT}</style>
      <style>{`
        button:focus-visible, input:focus-visible, select:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>

      {toast && (
        <div style={{
          position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 60,
          background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10,
          padding: "10px 16px", fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "var(--text)",
          display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}>
          <Info size={14} color="var(--accent)" /> {toast}
        </div>
      )}

      {view === "auth" && (
        <AuthScreen
          enrolledNames={enrolled}
          onGranted={(r) => { setRole(r); setView("dashboard"); }}
          onEnroll={() => setView("enroll")}
        />
      )}
      {view === "enroll" && (
        <EnrollScreen
          onCancel={() => setView("auth")}
          onDone={({ name }) => {
            setEnrolled((e) => [...e, name]);
            setToast(`${name} enrolled — return to login to authenticate`);
            setView("auth");
          }}
        />
      )}
      {view === "dashboard" && (
        <Dashboard
          role={role}
          onLogout={(timedOut) => {
            setView("auth");
            if (timedOut) setToast("Session expired after 90s of inactivity — signed out automatically");
          }}
        />
      )}
    </div>
  );
}
