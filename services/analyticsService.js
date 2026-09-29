/**
 * Analytics page (`#page-analytics`) — live numbers from Firestore.
 *
 * Replaces the old hardcoded "July 2024 / ₹71,000 / 8 / 68% / 72%" figures with:
 *   Revenue        -> sum of approved payments in the selected range
 *   New Students   -> students whose createdAt falls in the range
 *   Avg Occupancy  -> seats with status "Occupied" / total seats (current)
 *   Attendance     -> unique students who checked in during the range
 *   Bar chart      -> approved revenue for the last 6 months
 *   Plan split     -> active students grouped by planName
 *
 * Range tabs: This Month | Last Month | Quarter.
 * Works on every page that contains `#page-analytics` (admin/manager/index/...).
 */
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase.js";

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BAR_COLORS = ["var(--accent-emerald)", "var(--accent-violet)", "var(--accent-blue)",
  "var(--accent-amber)", "var(--accent-teal)", "var(--danger)"];

const pad = n => String(n).padStart(2, "0");
const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inr = n => "₹" + Math.round(n).toLocaleString("en-IN");
const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let rangeKey = "month";
let cache = null;          // { payments, students, seats, attendance, at }
let rendering = false;

/** Timestamp | {seconds} | ISO string | "YYYY-MM-DD" -> local Date (or null) */
function toDate(v) {
  if (v == null || v === "") return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v === "object" && typeof v.seconds === "number") return new Date(v.seconds * 1000);
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Normalise any date-ish value to a comparable local "YYYY-MM-DD" string. */
function dateKey(v) {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = toDate(v);
  return d ? dateStr(d) : "";
}

function monthLabel(y, m) {
  const d = new Date(y, m, 1);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** Range bounds + the equivalent preceding period, as local date strings. */
function rangeBounds(key) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  let s, e, ps, pe, label, prevLabel, unit;

  if (key === "last") {
    s = new Date(y, m - 1, 1); e = new Date(y, m, 0);
    ps = new Date(y, m - 2, 1); pe = new Date(y, m - 1, 0);
    label = monthLabel(y, m - 1); prevLabel = monthLabel(y, m - 2); unit = "month";
  } else if (key === "quarter") {
    const q = Math.floor(m / 3);
    s = new Date(y, q * 3, 1); e = new Date(y, q * 3 + 3, 0);
    ps = new Date(y, q * 3 - 3, 1); pe = new Date(y, q * 3, 0);
    label = `Q${q + 1} ${y}`;
    const pd = new Date(y, q * 3 - 3, 1);
    prevLabel = `Q${Math.floor(pd.getMonth() / 3) + 1} ${pd.getFullYear()}`;
    unit = "quarter";
  } else {                                    // this month (default)
    s = new Date(y, m, 1); e = new Date(y, m + 1, 0);
    ps = new Date(y, m - 1, 1); pe = new Date(y, m, 0);
    label = monthLabel(y, m); prevLabel = monthLabel(y, m - 1); unit = "month";
  }

  return {
    start: dateStr(s), end: dateStr(e),
    prevStart: dateStr(ps), prevEnd: dateStr(pe),
    label, prevLabel, unit,
    // 6 calendar months ending with the range's final month (for the bar chart)
    endMonth: { y: e.getFullYear(), m: e.getMonth() },
  };
}

/** Each collection is read independently so one denied read can't blank the page. */
async function loadData(force) {
  if (cache && !force && Date.now() - cache.at < 30000) return cache;
  const grab = name => getDocs(collection(db, name))
    .then(s => s.docs.map(d => d.data()))
    .catch(err => { console.warn(`[analytics] cannot read "${name}":`, err.message); return null; });

  const [payments, students, seats, attendance] = await Promise.all([
    grab("payments"), grab("students"), grab("seats"), grab("attendance"),
  ]);
  cache = { payments, students, seats, attendance, at: Date.now() };
  return cache;
}

function sumApprovedIn(payments, from, to) {
  if (!payments) return 0;
  return payments.reduce((total, p) => {
    if (p.status !== "approved" && p.status !== "Completed") return total;
    const d = dateKey(p.paymentDate || p.date || p.createdAt);
    return d && d >= from && d <= to ? total + (Number(p.amount) || 0) : total;
  }, 0);
}

function computeMetrics(data, b) {
  const active = (data.students || []).filter(s => s.status !== "Old" && s.status !== "Inactive");

  // Revenue
  const revenue = sumApprovedIn(data.payments, b.start, b.end);
  const prevRevenue = sumApprovedIn(data.payments, b.prevStart, b.prevEnd);

  // New students (needs createdAt — imported rows without a join date don't count,
  // and "Old"/"Inactive" members are excluded so an import can't look like admissions)
  const studentsCreatedIn = (from, to) => active.reduce((n, s) => {
    const d = dateKey(s.createdAt);
    return d && d >= from && d <= to ? n + 1 : n;
  }, 0);
  const newStudents = studentsCreatedIn(b.start, b.end);
  const prevNewStudents = studentsCreatedIn(b.prevStart, b.prevEnd);

  // Occupancy (current snapshot)
  const seats = data.seats || [];
  const occupied = seats.filter(s => s.status === "Occupied").length;
  const occupancy = seats.length ? Math.round((occupied / seats.length) * 100) : 0;

  // Attendance rate = unique attendees in range / active students
  const attendees = new Set();
  (data.attendance || []).forEach(a => {
    const d = dateKey(a.date);
    if (d && d >= b.start && d <= b.end && a.studentId) attendees.add(a.studentId);
  });
  const attendanceRate = active.length ? Math.min(100, Math.round((attendees.size / active.length) * 100)) : 0;

  // Monthly revenue for the bar chart (6 months ending at the range's last month)
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(b.endMonth.y, b.endMonth.m - i, 1);
    months.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: MONTHS_SHORT[d.getMonth()] });
  }
  const monthly = months.map(mo => ({
    ...mo,
    value: (data.payments || []).reduce((t, p) => {
      if (p.status !== "approved" && p.status !== "Completed") return t;
      const d = dateKey(p.paymentDate || p.date || p.createdAt);
      return d.slice(0, 7) === mo.key ? t + (Number(p.amount) || 0) : t;
    }, 0),
  }));

  // Plan distribution across non-old students
  const planMap = new Map();
  active.forEach(s => {
    const name = s.planName || "No Plan";
    planMap.set(name, (planMap.get(name) || 0) + 1);
  });
  const plans = [...planMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b2) => b2.count - a.count)
    .slice(0, 6);

  return { revenue, prevRevenue, newStudents, prevNewStudents, occupancy, occupied, seatTotal: seats.length, attendees: attendees.size, attendanceRate, monthly, plans, activeCount: active.length };
}

function change(cls, text) {
  return { cls: `metric-change ${cls}`, text };
}

function revenueChange(m, b) {
  if (m.prevRevenue > 0) {
    const pct = Math.round(((m.revenue - m.prevRevenue) / m.prevRevenue) * 100);
    if (pct > 0) return change("positive", `↑ ${pct}% vs ${b.prevLabel}`);
    if (pct < 0) return change("negative", `↓ ${Math.abs(pct)}% vs ${b.prevLabel}`);
    return change("neutral", `Same as ${b.prevLabel}`);
  }
  if (m.revenue > 0) return change("positive", `First revenue in ${b.label}`);
  return change("neutral", `No revenue in ${b.label}`);
}

function studentChange(m, b) {
  const diff = m.newStudents - m.prevNewStudents;
  if (m.prevNewStudents === 0 && m.newStudents === 0) return change("neutral", `No new students in ${b.label}`);
  if (diff > 0) return change("positive", `↑ ${diff} vs ${b.prevLabel}`);
  if (diff < 0) return change("negative", `↓ ${Math.abs(diff)} vs ${b.prevLabel}`);
  return change("neutral", `Same as ${b.prevLabel}`);
}

function renderBars(chart, monthly) {
  if (!chart) return;
  if (!monthly.length) { chart.innerHTML = ""; return; }
  const max = Math.max(...monthly.map(x => x.value), 1);
  chart.innerHTML = monthly.map((x, i) => {
    const pct = x.value > 0 ? Math.max(8, Math.round((x.value / max) * 100)) : 5;
    const active = i === monthly.length - 1 ? " active-bar" : "";
    return `<div class="bar-group">
      <div class="bar${active}" title="${esc(x.label)}: ${inr(x.value)}" style="--h:${pct}%"><span class="bar-label">${esc(x.label)}</span></div>
    </div>`;
  }).join("");
  if (typeof window !== "undefined" && typeof window.animateBars === "function") window.animateBars();
}

function renderPlanDist(box, plans) {
  if (!box) return;
  if (!plans.length) {
    box.innerHTML = `<div style="font-size:13px; color:var(--text-muted); padding:0.5rem 0;">No students yet — plan split appears once students are added.</div>`;
    return;
  }
  const max = Math.max(...plans.map(p => p.count), 1);
  box.innerHTML = plans.map((p, i) => `
    <div class="dist-row">
      <div class="dist-label" title="${esc(p.name)}" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.name)}</div>
      <div class="dist-bar-wrap"><div class="dist-bar" style="width:${Math.round((p.count / max) * 100)}%; background:${BAR_COLORS[i % BAR_COLORS.length]}"></div></div>
      <div class="dist-val">${p.count}</div>
    </div>`).join("");
}

function setMetric(card, value, chg) {
  const v = card.querySelector(".metric-value");
  const c = card.querySelector(".metric-change");
  if (v) v.textContent = value;
  if (c) { c.textContent = chg.text; c.className = chg.cls; }
}

async function renderAnalytics() {
  const page = document.getElementById("page-analytics");
  if (!page || rendering) return;
  rendering = true;

  const b = rangeBounds(rangeKey);
  const subtitle = page.querySelector(".page-subtitle");
  if (subtitle) subtitle.textContent = `${b.label} performance overview`;

  page.querySelectorAll(".metric-card").forEach(card => {
    const v = card.querySelector(".metric-value");
    if (v) v.textContent = "…";            // never leave the old hardcoded figures visible
  });

  try {
    const data = await loadData(false);
    const m = computeMetrics(data, b);

    page.querySelectorAll(".metric-card").forEach(card => {
      const label = (card.querySelector(".metric-label") || {}).textContent || "";
      if (/revenue/i.test(label)) setMetric(card, inr(m.revenue), revenueChange(m, b));
      else if (/new student/i.test(label)) setMetric(card, String(m.newStudents), studentChange(m, b));
      else if (/occup/i.test(label)) {
        setMetric(card, `${m.occupancy}%`,
          m.seatTotal ? change("neutral", `${m.occupied} of ${m.seatTotal} seats occupied`)
                      : change("neutral", "No seats configured"));
      } else if (/attendance/i.test(label)) {
        setMetric(card, `${m.attendanceRate}%`,
          !m.activeCount ? change("neutral", "No active students")
            : m.attendees ? change("neutral", `${m.attendees} students checked in`)
              : change("neutral", "No check-ins in this period"));
      }
    });

    renderBars(page.querySelector(".bar-chart"), m.monthly);
    const legend = page.querySelector(".chart-legend");
    if (legend) {
      const peak = Math.max(...m.monthly.map(x => x.value), 0);
      legend.innerHTML = `<span class="legend-box emerald"></span> Revenue · peak ${inr(peak)}`;
    }
    renderPlanDist(page.querySelector(".plan-dist"), m.plans);
  } catch (err) {
    console.warn("[analytics] render failed:", err);
    page.querySelectorAll(".metric-value").forEach(v => { v.textContent = "—"; });
    page.querySelectorAll(".metric-change").forEach(c => { c.textContent = "Could not load Firestore data"; c.className = "metric-change neutral"; });
  } finally {
    rendering = false;
  }
}

let initialized = false;
export const initAnalyticsUI = () => {
  if (initialized) return;
  const page = document.getElementById("page-analytics");
  if (!page) return;                       // page not present on this screen
  initialized = true;

  page.querySelectorAll(".filter-tabs .filter-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const t = tab.textContent.trim().toLowerCase();
      rangeKey = t.includes("last") ? "last" : t.includes("quarter") ? "quarter" : "month";
      renderAnalytics();
    });
  });

  window.__renderAnalytics = renderAnalytics;   // called by navigate("analytics")
  renderAnalytics();                            // prime the page with real numbers
};

// Auto-init when this module lands on a page without firebase-entry wiring
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(initAnalyticsUI, 0));
} else {
  setTimeout(initAnalyticsUI, 0);
}
