import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA4rhVuIrwCaoGKpyy4WXD-HFAJrKt_yNw",
  authDomain: "progamari-salon.firebaseapp.com",
  projectId: "progamari-salon",
  storageBucket: "progamari-salon.firebasestorage.app",
  messagingSenderId: "377623505017",
  appId: "1:377623505017:web:c919b0a0b9068e92604ca8"
};

const MONTHS_RO = ["Ianuarie","Februarie","Martie","Aprilie","Mai","Iunie","Iulie","August","Septembrie","Octombrie","Noiembrie","Decembrie"];
const SERVICES = [
  { name: "Manichiură cu oja semipermanentă / gel pe unghia naturală", price: 80 },
  { name: "Întreținere gel mărimea 1-2", price: 100 },
  { name: "Întreținere gel mărimea 3-4", price: 120 },
  { name: "Construcție gel mărimea 1-2", price: 130 },
  { name: "Construcție gel mărimea 3-4", price: 160 },
  { name: "Demontat + curățat", price: 50 },
  { name: "Personalizat", price: "" },
];

function pad(n) { return n.toString().padStart(2, "0"); }
function dateKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function timeToMinutes(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function minutesToTime(mins) { return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`; }
function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

const EMPTY_ICON = `<svg class="empty-glyph" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9V6.5a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5V9"/><rect x="6.5" y="9" width="11" height="12.5" rx="3"/><line x1="9.5" y1="12.5" x2="9.5" y2="18"/></svg>`;

function todayDateKey() {
  const today = new Date();
  return dateKey(today.getFullYear(), today.getMonth(), today.getDate());
}
function dateFromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function shiftDateKey(key, days) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
}
function agendaDateLabel(key) {
  const label = new Intl.DateTimeFormat("ro-RO", { weekday: "long", day: "numeric", month: "long" }).format(dateFromKey(key));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function durationLabel(minutes) {
  const value = Number(minutes) || 0;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (hours && rest) return `${hours}h ${rest} min`;
  if (hours) return `${hours}h`;
  return `${rest} min`;
}

let db = null;
let appointments = [];
let year = new Date().getFullYear();
let month = new Date().getMonth();
let selectedDate = null;
let expandedClient = null;
let editingId = null;
let editingSurface = null;
let formDate = null;
let agendaDate = todayDateKey();
let calendarMode = localStorage.getItem("calendarViewMode") === "calendar" ? "calendar" : "today";
let prefillClient = null;
let clientSearchQuery = "";
let expenses = [];
let expFormOpen = false;
let expYear = new Date().getFullYear();
let expMonth = new Date().getMonth();

const els = {
  errorBanner: document.getElementById("errorBanner"),
  setupBanner: document.getElementById("setupBanner"),
  statCount: document.getElementById("statCount"),
  statRevenue: document.getElementById("statRevenue"),
  monthLabel: document.getElementById("monthLabel"),
  calGrid: document.getElementById("calGrid"),
  dayCard: document.getElementById("dayCard"),
  todayAgenda: document.getElementById("todayAgenda"),
  calendarMonthView: document.getElementById("calendarMonthView"),
  showToday: document.getElementById("showToday"),
  showCalendar: document.getElementById("showCalendar"),
  clientListInner: document.getElementById("clientListInner"),
  statsWrap: document.getElementById("statsWrap"),
  tabCalendar: document.getElementById("tabCalendar"),
  tabClients: document.getElementById("tabClients"),
  tabStats: document.getElementById("tabStats"),
  viewCalendar: document.getElementById("view-calendar"),
  viewClients: document.getElementById("view-clients"),
  viewStats: document.getElementById("view-stats"),
  tabExpenses: document.getElementById("tabExpenses"),
  viewExpenses: document.getElementById("view-expenses"),
  expensesWrap: document.getElementById("expensesWrap"),
  navAddBtn: document.getElementById("navAddBtn"),
};

const primaryViews = {
  calendar: { tab: els.tabCalendar, view: els.viewCalendar },
  clients: { tab: els.tabClients, view: els.viewClients },
  stats: { tab: els.tabStats, view: els.viewStats },
  expenses: { tab: els.tabExpenses, view: els.viewExpenses },
};

const SPLASH_MIN_MS = 400;
const splashStartedAt = Date.now();
let splashHidden = false;
function hideSplash() {
  if (splashHidden) return;
  splashHidden = true;
  const splash = document.getElementById("splash");
  if (!splash) return;
  const elapsed = Date.now() - splashStartedAt;
  const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
  setTimeout(() => {
    splash.classList.add("hide");
    setTimeout(() => splash.remove(), 400);
  }, wait);
}
setTimeout(hideSplash, 3000);

function activateView(name) {
  if (name !== "clients" && expandedClient !== null) {
    expandedClient = null;
    document.body.classList.remove("client-profile-open");
    const search = document.getElementById("clientSearch");
    if (search) search.hidden = false;
    renderClients();
  }
  Object.entries(primaryViews).forEach(([viewName, item]) => {
    const isActive = viewName === name;
    item.tab.classList.toggle("active", isActive);
    item.tab.setAttribute("aria-pressed", String(isActive));
    item.view.classList.toggle("active", isActive);
  });
  if (name === "stats") {
    requestAnimationFrame(() => {
      const scrollEl = document.getElementById("weekChartScroll");
      if (scrollEl) scrollEl.scrollLeft = scrollEl.scrollWidth;
    });
  }
}

if (firebaseConfig.apiKey.startsWith("PASTE_")) {
  els.setupBanner.classList.add("show");
  hideSplash();
} else {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    onSnapshot(collection(db, "appointments"), (snap) => {
      appointments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
      hideSplash();
    }, (err) => {
      console.error(err);
      showError(true);
      hideSplash();
    });
    onSnapshot(collection(db, "expenses"), (snap) => {
      expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderExpenses();
    }, (err) => {
      console.error(err);
      showError(true);
    });
  } catch (e) {
    console.error(e);
    els.setupBanner.classList.add("show");
    hideSplash();
  }
}

function showError(show) { els.errorBanner.classList.toggle("show", show); }

async function saveAppointment(data, id) {
  if (!db) return;
  try {
    if (id) await updateDoc(doc(db, "appointments", id), data);
    else await addDoc(collection(db, "appointments"), data);
    showError(false);
  } catch (e) { console.error(e); showError(true); }
}
async function removeAppointment(id) {
  if (!db) return;
  try { await deleteDoc(doc(db, "appointments", id)); showError(false); }
  catch (e) { console.error(e); showError(true); }
}
async function saveExpense(data) {
  if (!db) return;
  try { await addDoc(collection(db, "expenses"), data); showError(false); }
  catch (e) { console.error(e); showError(true); }
}
async function removeExpense(id) {
  if (!db) return;
  try { await deleteDoc(doc(db, "expenses", id)); showError(false); }
  catch (e) { console.error(e); showError(true); }
}

function apptsByDay() {
  const map = {};
  for (const a of appointments) {
    (map[a.date] ||= []).push(a);
  }
  for (const k in map) map[k].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  return map;
}

function monthStats() {
  const prefix = `${year}-${pad(month + 1)}`;
  const inMonth = appointments.filter(a => a.date.startsWith(prefix));
  const now = new Date();
  const currentTodayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let revenuePast = 0;
  let revenueTotal = 0;
  let countPast = 0;
  for (const a of inMonth) {
    const costValue = Number(a.cost) || 0;
    revenueTotal += costValue;
    if (a.date < currentTodayKey) {
      revenuePast += costValue;
      countPast++;
    } else if (a.date === currentTodayKey) {
      if (timeToMinutes(a.time) <= currentMinutes) {
        revenuePast += costValue;
        countPast++;
      }
    }
  }
  return { count: inMonth.length, countPast, revenuePast, revenueTotal };
}

function clientsList() {
  const map = {};
  for (const a of appointments) {
    const key = a.client.trim().toLowerCase();
    (map[key] ||= { name: a.client.trim(), visits: [], total: 0 });
    map[key].visits.push(a);
    map[key].total += Number(a.cost) || 0;
  }
  const list = Object.values(map);
  for (const c of list) c.visits.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  list.sort((a, b) => a.name.localeCompare(b.name, "ro"));
  return list;
}

function firstVisitIdsSet() {
  const set = new Set();
  for (const c of clientsList()) {
    const earliest = c.visits[c.visits.length - 1];
    if (earliest) set.add(earliest.id);
  }
  return set;
}

function newClientsThisMonth() {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  let count = 0;
  for (const c of clientsList()) {
    const firstDate = c.visits.reduce((min, v) => (v.date < min ? v.date : min), c.visits[0].date);
    if (firstDate.startsWith(prefix)) count++;
  }
  return count;
}

function retentionRate() {
  const now = new Date();
  const curPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevPrefix = `${prevD.getFullYear()}-${pad(prevD.getMonth() + 1)}`;
  const all = clientsList();
  const prevClients = all.filter(c => c.visits.some(v => v.date.startsWith(prevPrefix)));
  if (prevClients.length === 0) return null;
  const retained = prevClients.filter(c => c.visits.some(v => v.date.startsWith(curPrefix)));
  return { pct: Math.round((retained.length / prevClients.length) * 100), base: prevClients.length, retained: retained.length };
}

function revenueByMonth(monthsBack = 6) {
  const now = new Date();
  const series = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const prefix = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const monthAppointments = appointments.filter(a => a.date.startsWith(prefix));
    const total = monthAppointments.reduce((s, a) => s + (Number(a.cost) || 0), 0);
    series.push({ label: MONTHS_RO[d.getMonth()].slice(0, 3), total, appointmentCount: monthAppointments.length, isCurrent: d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() });
  }
  return series;
}

function revenueByWeek() {
  if (appointments.length === 0) return [];
  const getMonday = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day = date.getDay();
    date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
    return date;
  };
  const sorted = appointments.map(a => a.date).sort();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const curMonday = getMonday(todayStr);
  const startMonday = getMonday(sorted[0]);
  const curMondayStr = `${curMonday.getFullYear()}-${pad(curMonday.getMonth()+1)}-${pad(curMonday.getDate())}`;
  const series = [];
  for (let d = new Date(startMonday); d <= curMonday; d.setDate(d.getDate() + 7)) {
    const ws = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const we = new Date(d); we.setDate(we.getDate() + 6);
    const wesStr = `${we.getFullYear()}-${pad(we.getMonth()+1)}-${pad(we.getDate())}`;
    const weekAppointments = appointments.filter(a => a.date >= ws && a.date <= wesStr);
    const total = weekAppointments.reduce((s, a) => s + (Number(a.cost)||0), 0);
    series.push({ label: `${d.getDate()} ${MONTHS_RO[d.getMonth()].slice(0,3)}`, total, appointmentCount: weekAppointments.length, isCurrent: ws === curMondayStr });
  }
  return series;
}

function averageRebookingDays() {
  let totalDays = 0;
  let gapCount = 0;
  for (const c of clientsList()) {
    if (c.visits.length < 2) continue;
    const asc = [...c.visits].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    for (let i = 1; i < asc.length; i++) {
      const d1 = new Date(asc[i - 1].date);
      const d2 = new Date(asc[i].date);
      const days = Math.round((d2 - d1) / 86400000);
      if (days >= 0) { totalDays += days; gapCount++; }
    }
  }
  if (gapCount === 0) return null;
  return { avgDays: Math.round(totalDays / gapCount), gapCount };
}

function topClientsBySpend(limit = 5) {
  return clientsList().sort((a, b) => b.total - a.total).slice(0, limit);
}

function topServicesByCount(limit = 5) {
  const map = {};
  for (const a of appointments) {
    const name = (a.service && a.service.trim()) || "Personalizat";
    (map[name] ||= { name, count: 0, total: 0 });
    map[name].count += 1;
    map[name].total += Number(a.cost) || 0;
  }
  return Object.values(map).sort((a, b) => b.count - a.count).slice(0, limit);
}

function overlaps(dayMap, dateStr, time, duration, ignoreId) {
  const start = timeToMinutes(time), end = start + Number(duration);
  const list = dayMap[dateStr] || [];
  return list.find(a => {
    if (a.id === ignoreId) return false;
    const aStart = timeToMinutes(a.time), aEnd = aStart + Number(a.duration);
    return start < aEnd && aStart < end;
  });
  setupSwipeActions(els.todayAgenda);
}

function dayIntensity(count) {
  if (count === 0) return "";
  if (count === 1) return "c1";
  if (count === 2) return "c2";
  return "c4";
}

function renderAll() {
  const stats = monthStats();
  els.statCount.innerHTML = `${stats.countPast} <span style="display:block; margin-top:2px;">Total la zi</span><div style="margin-top: 6px; border-top: 1px solid #8B7CF62E; padding-top: 6px;">${stats.count} <span style="display:block;">Total în ${MONTHS_RO[month].toLowerCase()}</span></div>`;
  els.statRevenue.innerHTML = `${stats.revenuePast.toFixed(0)} lei <span style="display:block; margin-top:2px;">Total la zi</span><div style="margin-top: 6px; border-top: 1px solid #34D3992E; padding-top: 6px;">${stats.revenueTotal.toFixed(0)} lei <span style="display:block;">Total lunar</span></div>`;
  renderCalendarMode();
  renderTodayAgenda();
  renderCalendar();
  renderDayCard();
  renderClients();
  renderStats();
  renderExpenses();
}

function setCalendarMode(mode) {
  calendarMode = mode;
  localStorage.setItem("calendarViewMode", mode);
  renderAll();
}

function quickAddAppointment() {
  activateView("calendar");
  if (calendarMode === "calendar") {
    if (!selectedDate) {
      const today = new Date();
      selectedDate = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
      year = today.getFullYear();
      month = today.getMonth();
    }
    editingId = "new";
    editingSurface = "calendar";
    formDate = selectedDate;
    renderAll();
  } else {
    calendarMode = "today";
    localStorage.setItem("calendarViewMode", "today");
    selectedDate = agendaDate;
    editingId = "new";
    editingSurface = "today";
    formDate = selectedDate;
    renderAll();
  }
}

function renderCalendarMode() {
  const isTodayMode = calendarMode === "today";
  els.showToday.classList.toggle("active", isTodayMode);
  els.showToday.setAttribute("aria-pressed", String(isTodayMode));
  els.showCalendar.classList.toggle("active", !isTodayMode);
  els.showCalendar.setAttribute("aria-pressed", String(!isTodayMode));
  els.todayAgenda.hidden = !isTodayMode;
  els.calendarMonthView.hidden = isTodayMode;
}

function nextAppointmentAfter(dateStr) {
  return appointments.filter(a => `${a.date} ${a.time}` > dateStr).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0] || null;
}

function renderTodayAgenda() {
  if (!els.todayAgenda) return;
  const list = apptsByDay()[agendaDate] || [];
  const revenue = list.reduce((sum, appointment) => sum + (Number(appointment.cost) || 0), 0);
  const todayKey = todayDateKey();
  const isToday = agendaDate === todayKey;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nextToday = isToday ? list.find(a => timeToMinutes(a.time) + Number(a.duration || 0) > nowMinutes) : null;
  const isEditingHere = editingId !== null && editingSurface === "today";

  if (isEditingHere) {
    const appointment = editingId === "new" ? null : appointments.find(a => a.id === editingId);
    els.todayAgenda.innerHTML = formHtml(appointment);
    wireForm(() => { editingId = null; editingSurface = null; formDate = null; renderAll(); });
    return;
  }

  const firstVisitIds = firstVisitIdsSet();
  const appointmentsHtml = list.length === 0 ? "" : `<ol class="agenda-list">${list.map(a => {
    const start = timeToMinutes(a.time);
    const end = start + Number(a.duration || 0);
    const isPast = isToday && end <= nowMinutes;
    const isNext = nextToday && nextToday.id === a.id;
    return `<li class="agenda-row swipe-item ${isPast ? "past" : ""} ${isNext ? "next" : ""}"><div class="agenda-time"><strong>${a.time}</strong><span>${minutesToTime(end)}</span></div><div class="agenda-timeline"><span class="tl-dot"></span></div><div class="agenda-appointment"><button class="agenda-appointment-main" type="button" data-agenda-edit="${a.id}"><span class="agenda-client-line"><strong>${escapeHtml(a.client)}</strong><span class="agenda-cost">${Number(a.cost).toFixed(0)} lei</span></span><span class="agenda-service">${escapeHtml(a.service || "Serviciu personalizat")} · ${durationLabel(a.duration)}</span>${a.notes ? `<span class="agenda-notes">${escapeHtml(a.notes)}</span>` : ""}${firstVisitIds.has(a.id) ? `<span class="agenda-new-client">Clientă nouă</span>` : ""}</button></div><div class="swipe-actions"><button class="icon-btn" type="button" data-agenda-edit="${a.id}" aria-label="Editează programarea"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button><button class="icon-btn danger" type="button" data-agenda-delete="${a.id}" aria-label="Șterge programarea"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg></button></div></li>`;
  }).join("")}</ol>`;

  let emptyHtml = "";
  if (list.length === 0) {
    const next = nextAppointmentAfter(`${agendaDate} 23:59`);
    let nextHtml = "";
    if (next) {
      const nextDate = dateFromKey(next.date);
      const nextLabel = new Intl.DateTimeFormat("ro-RO", { weekday: "long", day: "numeric", month: "long" }).format(nextDate);
      nextHtml = `<button class="next-appointment" type="button" data-jump-date="${next.date}"><span>Următoarea programare</span><strong>${nextLabel.charAt(0).toUpperCase() + nextLabel.slice(1)}, ${next.time}</strong><small>${escapeHtml(next.client)} · ${escapeHtml(next.service || "Serviciu personalizat")}</small></button>`;
    }
    emptyHtml = `<div class="agenda-empty">${EMPTY_ICON}<h3>Nicio programare</h3><p>Ziua este liberă.</p></div>${nextHtml}`;
  }

  els.todayAgenda.innerHTML = `<div class="agenda-header"><div class="agenda-date-nav"><button class="nav-btn" type="button" data-agenda-day="-1" aria-label="Ziua precedentă">‹</button><div class="agenda-date-copy"><h2>${agendaDateLabel(agendaDate)}</h2><p>${list.length} ${list.length === 1 ? "programare" : "programări"} · ${revenue.toFixed(0)} lei estimați</p></div><button class="nav-btn" type="button" data-agenda-day="1" aria-label="Ziua următoare">›</button></div>${!isToday ? `<button class="today-return-btn" type="button" data-agenda-today>Azi</button>` : ""}</div>${appointmentsHtml}${emptyHtml}`;

  els.todayAgenda.querySelectorAll("[data-agenda-day]").forEach(button => {
    button.addEventListener("click", () => { agendaDate = shiftDateKey(agendaDate, Number(button.dataset.agendaDay)); selectedDate = agendaDate; renderAll(); });
  });
  els.todayAgenda.querySelector("[data-agenda-today]")?.addEventListener("click", () => { agendaDate = todayKey; selectedDate = agendaDate; renderAll(); });
  els.todayAgenda.querySelectorAll("[data-agenda-add]").forEach(button => {
    button.addEventListener("click", () => { selectedDate = agendaDate; editingId = "new"; editingSurface = "today"; renderTodayAgenda(); });
  });
  els.todayAgenda.querySelectorAll("[data-agenda-edit]").forEach(button => {
    button.addEventListener("click", () => { selectedDate = agendaDate; editingId = button.dataset.agendaEdit; editingSurface = "today"; formDate = agendaDate; renderTodayAgenda(); });
  });
  els.todayAgenda.querySelectorAll("[data-agenda-delete]").forEach(button => {
    button.addEventListener("click", () => showConfirm(button.dataset.agendaDelete));
  });
  els.todayAgenda.querySelector("[data-jump-date]")?.addEventListener("click", event => { agendaDate = event.currentTarget.dataset.jumpDate; selectedDate = agendaDate; renderAll(); });
  setupSwipeActions(els.todayAgenda);
}

function renderCalendar() {
  els.monthLabel.textContent = `${MONTHS_RO[month]} ${year}`;
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayMap = apptsByDay();
  let html = "";
  for (let i = 0; i < startWeekday; i++) html += `<div class="day-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(year, month, d);
    const count = (dayMap[key] || []).length;
    const intensity = dayIntensity(count);
    const classes = ["day-cell"];
    if (key === todayKey) classes.push("today");
    if (key === selectedDate) classes.push("selected");
    html += `<button class="${classes.join(" ")}" data-day="${d}"><span>${d}</span>${intensity ? `<span class="swatch ${intensity}"></span>` : ""}</button>`;
  }
  els.calGrid.innerHTML = html;
  els.calGrid.querySelectorAll(".day-cell:not(.empty)").forEach(btn => {
    btn.addEventListener("click", () => { selectedDate = dateKey(year, month, Number(btn.dataset.day)); editingId = null; editingSurface = null; formDate = null; renderAll(); });
  });
}

function renderDayCard() {
  if (!selectedDate) {
    els.dayCard.innerHTML = `<div class="empty-state">${EMPTY_ICON}<p class="empty-text">Alege o zi din calendar ca să vezi sau să adaugi o programare.</p></div>`;
    return;
  }
  const [y, m, d] = selectedDate.split("-").map(Number);
  const label = `${d} ${MONTHS_RO[m - 1]} ${y}`;
  const dayMap = apptsByDay();
  const list = dayMap[selectedDate] || [];
  const isEditingHere = editingId !== null && editingSurface === "calendar";
  let bodyHtml;
  if (isEditingHere) {
    bodyHtml = formHtml(editingId === "new" ? null : appointments.find(a => a.id === editingId));
  } else if (list.length === 0) {
    bodyHtml = `<p class="no-appts">Nicio programare în această zi.</p>`;
  } else {
    const firstVisitIds = firstVisitIdsSet();
    bodyHtml = `<ul class="appt-list">${list.map(a => `<li class="appt-item swipe-item"><div class="swipe-content appt-swipe-content"><div class="appt-time">${a.time}–${minutesToTime(timeToMinutes(a.time) + Number(a.duration))}</div><div><div class="appt-client">${escapeHtml(a.client)}${firstVisitIds.has(a.id) ? ` <span class="new-badge">✨ Nouă</span>` : ""}</div>${a.service ? `<div class="appt-service">${escapeHtml(a.service)}</div>` : ""}${a.notes ? `<div class="appt-notes">${escapeHtml(a.notes)}</div>` : ""}</div><div class="appt-cost">${Number(a.cost).toFixed(0)} lei</div></div><div class="swipe-actions"><button class="icon-btn" data-edit="${a.id}" aria-label="Editează"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button><button class="icon-btn danger" data-del="${a.id}" aria-label="Șterge"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg></button></div></li>`).join("")}</ul>`;
  }
  els.dayCard.innerHTML = `<div class="day-card-header"><h2 class="day-card-title">${label}</h2></div>${bodyHtml}`;
  if (!isEditingHere) {
    els.dayCard.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => { editingId = b.dataset.edit; editingSurface = "calendar"; formDate = selectedDate; renderDayCard(); }));
    els.dayCard.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => showConfirm(b.dataset.del)));
  } else {
    wireForm(() => { editingId = null; editingSurface = null; formDate = null; renderDayCard(); });
  }
  setupSwipeActions(els.dayCard);
}

function formHtml(appt) {
  const service = appt ? (SERVICES.find(s => s.name === appt.service) ? appt.service : "Personalizat") : SERVICES[0].name;
  const cost = appt ? appt.cost : SERVICES[0].price;
  const clientValue = appt ? appt.client : (prefillClient || "");
  prefillClient = null;
  const dateValue = appt ? appt.date : (formDate || selectedDate || todayDateKey());
  const isEditing = Boolean(appt);
  const icon = (name) => {
    const paths = {
      client: '<path d="M15.5 20v-1.5a4 4 0 0 0-4-4h-5a4 4 0 0 0-4 4V20M9 10.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/>',
      service: '<path d="M7 2v3M17 2v3M3.5 9h17M5.5 4h13a2 2 0 0 1 2 2v13.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>',
      calendar: '<path d="M7 2v3M17 2v3M3.5 9h17M5.5 4h13a2 2 0 0 1 2 2v13.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>',
      time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
      duration: '<path d="M8 3h8M8 21h8M9 3c0 4 1 6 3 9-2 3-3 5-3 9M15 3c0 4-1 6-3 9 2 3 3 5 3 9"/>',
      price: '<path d="M20 13 13 20a2 2 0 0 1-2.8 0L4 13.8V4h9.8L20 10.2a2 2 0 0 1 0 2.8Z"/><path d="M8.5 8.5h.01"/>',
      notes: '<path d="M5 3.5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z"/><path d="M7 8h10M7 12h7M7 16h5"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
  };

  return `<div class="appointment-modal" role="dialog" aria-modal="true" aria-labelledby="appointmentFormTitle"><div class="appointment-backdrop" aria-hidden="true"></div><form id="apptForm" class="appointment-sheet"><div class="sheet-handle" aria-hidden="true"></div><header class="appointment-sheet-header"><div><h2 id="appointmentFormTitle">${isEditing ? "Editează programarea" : "Programare nouă"}</h2><p>${isEditing ? "Actualizează detaliile programării" : "Adaugă o nouă programare"}</p></div><button type="button" class="sheet-close" id="f_cancel" aria-label="Închide formularul"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header><div class="appointment-sheet-body"><label class="appointment-field appointment-field-full client-picker"><span class="field-icon">${icon("client")}</span><span class="field-copy"><span class="field-label">Client</span><input type="text" id="f_client" value="${escapeHtml(clientValue)}" placeholder="Alege clientul" autocomplete="off" required></span><span class="field-chevron" aria-hidden="true">›</span><ul id="clientSuggestions" class="suggestions-list" style="display:none;"></ul></label><label class="appointment-field appointment-field-full"><span class="field-icon">${icon("service")}</span><span class="field-copy"><span class="field-label">Serviciu</span><select id="f_service">${SERVICES.map(s => `<option value="${escapeHtml(s.name)}" ${s.name === service ? "selected" : ""}>${escapeHtml(s.name)}${s.price !== "" ? ` — ${s.price} lei` : ""}</option>`).join("")}</select></span><span class="field-chevron" aria-hidden="true">›</span></label><div class="appointment-split-card"><label class="appointment-field"><span class="field-icon">${icon("calendar")}</span><span class="field-copy"><span class="field-label">Data</span><input type="date" id="f_date" value="${dateValue}" required></span></label><label class="appointment-field"><span class="field-icon">${icon("time")}</span><span class="field-copy"><span class="field-label">Ora</span><input type="time" id="f_time" value="${appt ? appt.time : "09:00"}" required></span></label></div><div class="appointment-split-card"><label class="appointment-field"><span class="field-icon">${icon("duration")}</span><span class="field-copy"><span class="field-label">Durată (minute)</span><input type="number" id="f_duration" min="15" step="15" value="${appt ? appt.duration : 60}" required></span></label><label class="appointment-field money-field"><span class="field-icon">${icon("price")}</span><span class="field-copy"><span class="field-label">Preț (lei)</span><input type="number" id="f_cost" min="0" step="1" value="${cost}" placeholder="ex: 120"></span></label></div><label class="appointment-field appointment-notes"><span class="field-icon">${icon("notes")}</span><span class="field-copy"><span class="field-label">Notițe <span>(opțional)</span></span><textarea id="f_notes" placeholder="Adaugă o notiță...">${appt ? escapeHtml(appt.notes || "") : ""}</textarea></span></label><div id="f_error" class="appointment-error-slot" aria-live="polite"></div></div><div class="appointment-sheet-footer"><button type="submit" class="save-btn appointment-save-btn">${isEditing ? "Salvează modificarea" : "Salvează programarea"}</button></div></form></div>`;
}

function wireForm(onClose = renderDayCard) {
  const serviceSelect = document.getElementById("f_service");
  const costInput = document.getElementById("f_cost");
  const clientInput = document.getElementById("f_client");
  const suggestionsList = document.getElementById("clientSuggestions");
  const uniqueClients = clientsList().map(c => c.name);
  function renderSuggestions() {
    const val = clientInput.value.toLowerCase();
    const filtered = uniqueClients.filter(c => c.toLowerCase().includes(val));
    if (filtered.length === 0) { suggestionsList.style.display = 'none'; }
    else { suggestionsList.innerHTML = filtered.map(c => `<li class="suggestion-item">${escapeHtml(c)}</li>`).join(''); suggestionsList.style.display = 'block'; }
  }
  clientInput.addEventListener("focus", renderSuggestions);
  clientInput.addEventListener("input", renderSuggestions);
  suggestionsList.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".suggestion-item");
    if (item) { e.preventDefault(); clientInput.value = item.textContent; suggestionsList.style.display = 'none'; }
  });
  serviceSelect.addEventListener("change", () => {
    const svc = SERVICES.find(s => s.name === serviceSelect.value);
    if (svc && svc.price !== "") costInput.value = svc.price;
  });
  document.getElementById("f_cancel").addEventListener("click", () => { editingId = null; editingSurface = null; onClose(); });
  document.getElementById("apptForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("f_error");
    errorEl.innerHTML = "";
    const client = document.getElementById("f_client").value.trim();
    const chosenDate = document.getElementById("f_date").value;
    const time = document.getElementById("f_time").value;
    const duration = Number(document.getElementById("f_duration").value) || 60;
    if (!client) { errorEl.innerHTML = `<div class="form-error">Adaugă numele clientei.</div>`; return; }
    if (!chosenDate) { errorEl.innerHTML = `<div class="form-error">Alege data programării.</div>`; return; }
    if (!time) { errorEl.innerHTML = `<div class="form-error">Alege ora programării.</div>`; return; }
    if (duration <= 0) { errorEl.innerHTML = `<div class="form-error">Durata trebuie să fie mai mare de 0.</div>`; return; }
    const realId = editingId === "new" ? null : editingId;
    const clash = overlaps(apptsByDay(), chosenDate, time, duration, realId);
    if (clash) {
      const clashEnd = minutesToTime(timeToMinutes(clash.time) + Number(clash.duration));
      errorEl.innerHTML = `<div class="form-error">Interval ocupat: ${escapeHtml(clash.client)} are programare ${clash.time}–${clashEnd}.</div>`;
      return;
    }
    const data = { date: chosenDate, time, duration, client, service: document.getElementById("f_service").value, cost: Number(document.getElementById("f_cost").value) || 0, notes: document.getElementById("f_notes").value.trim() };
    await saveAppointment(data, realId);
    selectedDate = chosenDate;
    agendaDate = chosenDate;
    const chosen = dateFromKey(chosenDate);
    year = chosen.getFullYear();
    month = chosen.getMonth();
    showToast(realId ? "✓ Programare actualizată" : "✓ Programare salvată");
    editingId = null;
    editingSurface = null;
    onClose();
  });
}

function clientInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join("") || "C";
}

function clientDateLabel(dateStr) {
  const label = new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric" }).format(dateFromKey(dateStr));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function openClientRebooking(clientName) {
  prefillClient = clientName;
  if (!selectedDate) {
    const today = new Date();
    selectedDate = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
    year = today.getFullYear();
    month = today.getMonth();
  }
  editingId = "new";
  editingSurface = "calendar";
  formDate = selectedDate;
  calendarMode = "calendar";
  localStorage.setItem("calendarViewMode", calendarMode);
  const selected = dateFromKey(selectedDate);
  year = selected.getFullYear();
  month = selected.getMonth();
  activateView("calendar");
  renderAll();
}

function openClientAppointment(appointmentId) {
  const appointment = appointments.find(item => item.id === appointmentId);
  if (!appointment) return;
  selectedDate = appointment.date;
  agendaDate = appointment.date;
  formDate = appointment.date;
  editingId = appointment.id;
  editingSurface = "calendar";
  calendarMode = "calendar";
  localStorage.setItem("calendarViewMode", calendarMode);
  const selected = dateFromKey(appointment.date);
  year = selected.getFullYear();
  month = selected.getMonth();
  activateView("calendar");
  renderAll();
}

function closeClientProfile() {
  expandedClient = null;
  renderClients();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function enableClientProfileSwipe(profile) {
  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let gestureMode = null;
  let gestureActive = false;

  const resetPosition = () => {
    profile.style.transition = "transform 0.18s ease, opacity 0.18s ease";
    profile.style.transform = "";
    profile.style.opacity = "";
  };

  profile.addEventListener("touchstart", event => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    deltaX = 0;
    gestureMode = null;
    gestureActive = true;
    profile.style.transition = "none";
  }, { passive: true });

  profile.addEventListener("touchmove", event => {
    if (!gestureActive || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (gestureMode === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      gestureMode = dx > 0 && Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
    }
    if (gestureMode !== "horizontal") return;

    event.preventDefault();
    deltaX = Math.max(0, dx);
    profile.style.transform = `translateX(${Math.min(deltaX, 180)}px)`;
    profile.style.opacity = String(1 - Math.min(deltaX / 520, 0.22));
  }, { passive: false });

  profile.addEventListener("touchend", () => {
    gestureActive = false;
    if (gestureMode === "horizontal" && deltaX >= 72) {
      profile.style.transition = "transform 0.18s ease, opacity 0.18s ease";
      profile.style.transform = "translateX(100vw)";
      profile.style.opacity = "0";
      setTimeout(closeClientProfile, 170);
      return;
    }
    resetPosition();
  }, { passive: true });

  profile.addEventListener("touchcancel", () => {
    gestureActive = false;
    resetPosition();
  }, { passive: true });
}

function renderClientProfile(client) {
  const search = document.getElementById("clientSearch");
  if (search) search.hidden = true;
  document.body.classList.add("client-profile-open");

  const now = new Date();
  const currentStamp = `${todayDateKey()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const futureVisits = [...client.visits].filter(visit => `${visit.date} ${visit.time}` >= currentStamp).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const nextVisit = futureVisits[0] || null;
  const historyVisits = client.visits;
  const money = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });
  const initials = clientInitials(client.name);

  const nextHtml = nextVisit
    ? `<button type="button" class="client-next-card" data-client-appointment="${nextVisit.id}"><span class="client-next-date">${escapeHtml(clientDateLabel(nextVisit.date))}</span><span class="client-next-time">${escapeHtml(nextVisit.time)}</span><span class="client-next-service">${escapeHtml(nextVisit.service || "Serviciu personalizat")} · ${escapeHtml(durationLabel(nextVisit.duration))}</span>${nextVisit.notes ? `<span class="client-next-note">${escapeHtml(nextVisit.notes)}</span>` : ""}<span class="client-next-price">${money.format(Number(nextVisit.cost) || 0)} lei</span><span class="client-profile-chevron" aria-hidden="true">›</span></button>`
    : `<div class="client-profile-empty"><p>Nu există programări viitoare.</p><button type="button" data-profile-reschedule="${escapeHtml(client.name)}">Programează clienta</button></div>`;

  const historyHtml = historyVisits.length
    ? `<ol class="client-profile-history">${historyVisits.map(visit => `<li><button type="button" class="client-history-row" data-client-appointment="${visit.id}"><span class="client-history-line" aria-hidden="true"></span><span class="client-history-copy"><span class="client-history-date">${escapeHtml(clientDateLabel(visit.date))} · ${escapeHtml(visit.time)}</span><span class="client-history-service">${escapeHtml(visit.service || "Serviciu personalizat")}</span>${visit.notes ? `<span class="client-history-note">${escapeHtml(visit.notes)}</span>` : ""}</span><span class="client-history-price">${money.format(Number(visit.cost) || 0)} lei</span><span class="client-profile-chevron" aria-hidden="true">›</span></button></li>`).join("")}</ol>`
    : `<div class="client-profile-empty compact"><p>Nu există programări în istoric.</p></div>`;

  els.clientListInner.innerHTML = `<article class="client-profile-page"><header class="client-profile-header"><button type="button" class="client-profile-back" data-client-back aria-label="Înapoi la lista de cliente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><span>Profil clientă</span></header><section class="client-profile-hero"><div class="client-avatar" aria-hidden="true">${escapeHtml(initials)}</div><div class="client-profile-identity"><h2>${escapeHtml(client.name)}</h2><p>${client.visits.length} ${client.visits.length === 1 ? "vizită înregistrată" : "vizite înregistrate"}</p></div></section><button type="button" class="client-primary-action" data-profile-reschedule="${escapeHtml(client.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Programare nouă</span></button><section class="client-profile-stats" aria-label="Rezumat clientă"><div class="client-profile-stat"><span class="client-stat-icon purple"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v3M17 2v3M3.5 9h17M5.5 4h13a2 2 0 0 1 2 2v13.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg></span><strong>${client.visits.length}</strong><small>Programări</small></div><div class="client-profile-stat money"><span class="client-stat-icon green"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M8 15h.01"/></svg></span><strong>${money.format(client.total)} lei</strong><small>Total cheltuit</small></div></section><section class="client-profile-section"><div class="client-profile-section-head"><h3>Următoarea programare</h3>${nextVisit ? `<button type="button" data-client-appointment="${nextVisit.id}">Vezi detalii</button>` : ""}</div>${nextHtml}</section><section class="client-profile-section history-section"><div class="client-profile-section-head"><h3>Istoric programări</h3><span>${historyVisits.length}</span></div>${historyHtml}</section></article>`;

  const profile = els.clientListInner.querySelector(".client-profile-page");
  if (profile) enableClientProfileSwipe(profile);
  els.clientListInner.querySelector("[data-client-back]")?.addEventListener("click", closeClientProfile);
  els.clientListInner.querySelectorAll("[data-profile-reschedule]").forEach(button => {
    button.addEventListener("click", () => openClientRebooking(button.dataset.profileReschedule));
  });
  els.clientListInner.querySelectorAll("[data-client-appointment]").forEach(button => {
    button.addEventListener("click", () => openClientAppointment(button.dataset.clientAppointment));
  });
}

function renderClients() {
  const allClients = clientsList();
  const search = document.getElementById("clientSearch");
  if (expandedClient !== null) {
    const client = allClients.find(item => item.name === expandedClient);
    if (client) {
      renderClientProfile(client);
      return;
    }
    expandedClient = null;
  }

  document.body.classList.remove("client-profile-open");
  if (search) search.hidden = false;
  const q = clientSearchQuery.trim().toLowerCase();
  const clients = q ? allClients.filter(c => c.name.toLowerCase().includes(q)) : allClients;
  if (allClients.length === 0) {
    els.clientListInner.innerHTML = `<div class="empty-state">${EMPTY_ICON}<p class="empty-text">Nicio clientă înregistrată încă. Adaugă o programare din Calendar.</p></div>`;
    return;
  }
  if (clients.length === 0) {
    els.clientListInner.innerHTML = `<p class="no-appts">Nicio clientă găsită pentru „${escapeHtml(clientSearchQuery)}".</p>`;
    return;
  }
  els.clientListInner.innerHTML = `<ul class="client-list">${clients.map(c => `<li class="client-card"><button class="client-row" data-client="${escapeHtml(c.name)}"><div><div class="appt-client">${escapeHtml(c.name)}</div><div class="client-meta">${c.visits.length} ${c.visits.length === 1 ? "vizită" : "vizite"}</div></div><div class="client-total">${c.total.toFixed(0)} lei</div><div class="client-chevron">›</div></button></li>`).join("")}</ul>`;
  els.clientListInner.querySelectorAll("[data-client]").forEach(button => {
    button.addEventListener("click", () => {
      expandedClient = button.dataset.client;
      renderClients();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

let statsSubTab = "revenue";

function renderStats() {
  const subTabsHtml = `<div class="stats-subtabs"><button class="subtab-btn ${statsSubTab === "revenue" ? "active" : ""}" data-substat="revenue">Încasări</button><button class="subtab-btn ${statsSubTab === "clients" ? "active" : ""}" data-substat="clients">Cliente</button><button class="subtab-btn ${statsSubTab === "services" ? "active" : ""}" data-substat="services">Servicii</button></div>`;
  let content = "";
  if (statsSubTab === "revenue") content = renderRevenueSection();
  else if (statsSubTab === "clients") content = renderClientsStatsSection();
  else content = renderServicesStatsSection();
  els.statsWrap.innerHTML = subTabsHtml + content;
  els.statsWrap.querySelectorAll("[data-substat]").forEach(btn => { btn.addEventListener("click", () => { statsSubTab = btn.dataset.substat; renderStats(); }); });
  const scrollEl = document.getElementById("weekChartScroll");
  if (scrollEl) scrollEl.scrollLeft = scrollEl.scrollWidth;
}

function renderRevenueSection() {
  const series = revenueByMonth(6);
  const maxVal = Math.max(1, ...series.map(s => s.total));
  const chartHtml = `<div class="card"><div class="stats-card-title">Încasări — ultimele 6 luni</div><div class="chart-row">${series.map(s => `<div class="chart-col"><div class="chart-value">${s.total > 0 ? s.total.toFixed(0) : ""}</div><div class="chart-bar-wrap"><div class="chart-bar ${s.isCurrent ? "current" : ""}" style="height: ${maxVal > 0 ? Math.max(4, (s.total / maxVal) * 100) : 4}%"></div></div><div class="chart-count">${s.appointmentCount}</div><div class="chart-label">${s.label}</div></div>`).join("")}</div></div>`;
  const weekSeries = revenueByWeek();
  const weekMax = Math.max(1, ...weekSeries.map(s => s.total));
  const weekChartHtml = weekSeries.length === 0 ? '' : `<div class="card"><div class="stats-card-title">Încăsări — pe săptămâni</div><div class="week-chart-scroll" id="weekChartScroll"><div class="week-chart-inner">${weekSeries.map(s => `<div class="chart-col"><div class="chart-value">${s.total > 0 ? s.total.toFixed(0) : ""}</div><div class="chart-bar-wrap"><div class="chart-bar ${s.isCurrent ? "current" : ""}" style="height: ${weekMax > 0 ? Math.max(4, (s.total / weekMax) * 100) : 4}%"></div></div><div class="chart-count">${s.appointmentCount}</div><div class="chart-label">${s.label}</div></div>`).join("")}</div></div></div>`;
  const totalClients = clientsList().length;
  const totalAppts = appointments.length;
  const summaryHtml = `<div class="card"><div class="stats-card-title">Rezumat general</div><div style="display:flex; gap:12px; margin-top:4px;"><div style="flex:1; text-align:center; background:#1C1A26; border-radius:12px; padding:16px 10px;"><div style="font-family:'Fraunces',serif; font-size:32px; font-weight:700; color:#8B7CF6; line-height:1;">${totalClients}</div><div style="font-size:12.5px; color:#A79FBD; margin-top:6px;">Cliente unice</div></div><div style="flex:1; text-align:center; background:#1C1A26; border-radius:12px; padding:16px 10px;"><div style="font-family:'Fraunces',serif; font-size:32px; font-weight:700; color:#34D399; line-height:1;">${totalAppts}</div><div style="font-size:12.5px; color:#A79FBD; margin-top:6px;">Programări totale</div></div></div></div>`;
  return summaryHtml + chartHtml + weekChartHtml;
}

function newClientsByMonth(monthsBack = 12) {
  const allClients = clientsList();
  const now = new Date();
  const series = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const prefix = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    let count = 0;
    for (const c of allClients) {
      const firstDate = c.visits.reduce((min, v) => (v.date < min ? v.date : min), c.visits[0].date);
      if (firstDate.startsWith(prefix)) count++;
    }
    series.push({ label: MONTHS_RO[d.getMonth()].slice(0, 3), count, isCurrent: d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() });
  }
  return series;
}

function renderNewClientsChart() {
  const series = newClientsByMonth(6);
  const maxVal = Math.max(1, ...series.map(s => s.count));
  return `<div class="card"><div class="stats-card-title">Cliente noi — ultimele 6 luni</div><div class="chart-row new-clients-chart">${series.map(s => `<div class="chart-col"><div class="chart-value">${s.count > 0 ? s.count : ""}</div><div class="chart-bar-wrap"><div class="chart-bar ${s.isCurrent ? "current" : ""}" style="height: ${Math.max(4, (s.count / maxVal) * 100)}%"></div></div><div class="chart-count">${s.count}</div><div class="chart-label">${s.label}</div></div>`).join("")}</div></div>`;
}

function renderClientsStatsSection() {
  const top = topClientsBySpend(5);
  const newCount = newClientsThisMonth();
  const retention = retentionRate();
  const rebooking = averageRebookingDays();
  const highlightsHtml = `<div class="card"><div class="stats-card-title">Cliente — luna aceasta</div><div style="display:flex; gap:12px; margin-top:4px;"><div style="flex:1; text-align:center; background:#1C1A26; border-radius:12px; padding:16px 10px;"><div style="font-family:'Fraunces',serif; font-size:32px; font-weight:700; color:#8B7CF6; line-height:1;">${newCount}</div><div style="font-size:12.5px; color:#A79FBD; margin-top:6px;">Cliente noi</div></div><div style="flex:1; text-align:center; background:#1C1A26; border-radius:12px; padding:16px 10px;"><div style="font-family:'Fraunces',serif; font-size:32px; font-weight:700; color:#34D399; line-height:1;">${retention === null ? "—" : retention.pct + "%"}</div><div style="font-size:12.5px; color:#A79FBD; margin-top:6px;">Rată de retenție</div></div></div>${retention !== null ? `<div style="font-size:11.5px; color:#8B84A0; margin-top:10px;">${retention.retained} din ${retention.base} cliente care au fost la programare luna trecută au revenit și luna asta.</div>` : `<div style="font-size:11.5px; color:#8B84A0; margin-top:10px;">Nu sunt suficiente date din luna trecută pentru a calcula retenția.</div>`}</div>`;
  const topHtml = top.length === 0 ? `<div class="card"><div class="stats-card-title">Top 5 cliente</div><p class="no-appts">Nicio clientă înregistrată încă.</p></div>` : `<div class="card"><div class="stats-card-title">Top 5 cliente — după total cheltuit</div><ul class="rank-list">${top.map((c, i) => `<li class="rank-item"><div class="rank-num">${i + 1}</div><div><div class="rank-name">${escapeHtml(c.name)}</div><div class="rank-meta">${c.visits.length} ${c.visits.length === 1 ? "vizită" : "vizite"}</div></div><div class="rank-total">${c.total.toFixed(0)} lei</div></li>`).join("")}</ul></div>`;
  const rebookingHtml = `<div class="card"><div class="stats-card-title">Durată medie de reprogramare</div><div style="text-align:center; background:#1C1A26; border-radius:12px; padding:18px 10px; margin-top:4px;"><div style="font-family:'Fraunces',serif; font-size:32px; font-weight:700; color:#8B7CF6; line-height:1;">${rebooking === null ? "—" : rebooking.avgDays + " zile"}</div><div style="font-size:12.5px; color:#A79FBD; margin-top:6px;">În medie, o clientă revine la programare</div></div>${rebooking !== null ? `<div style="font-size:11.5px; color:#8B84A0; margin-top:10px;">Calculat din ${rebooking.gapCount} intervale între vizite consecutive, la clientele cu minimum 2 programări.</div>` : `<div style="font-size:11.5px; color:#8B84A0; margin-top:10px;">Nu sunt încă suficiente cliente cu minimum 2 programări pentru a calcula media.</div>`}</div>`;
  return highlightsHtml + renderNewClientsChart() + topHtml + rebookingHtml;
}

function renderServicesStatsSection() {
  const topServices = topServicesByCount(5);
  return topServices.length === 0 ? `<div class="card"><div class="stats-card-title">Top 5 servicii</div><p class="no-appts">Nicio programare înregistrată încă.</p></div>` : `<div class="card"><div class="stats-card-title">Top 5 servicii — după popularitate</div><ul class="rank-list">${topServices.map((s, i) => `<li class="rank-item"><div class="rank-num">${i + 1}</div><div><div class="rank-name">${escapeHtml(s.name)}</div><div class="rank-meta">${s.count} ${s.count === 1 ? "rezervare" : "rezervări"}</div></div><div class="rank-total">${s.total.toFixed(0)} lei</div></li>`).join("")}</ul></div>`;
}

function renderExpenses() {
  if (!els.expensesWrap) return;
  const prefix = `${expYear}-${pad(expMonth + 1)}`;
  const monthItems = expenses.filter(e => e.date.startsWith(prefix)).sort((a, b) => b.date.localeCompare(a.date));
  const totalExpenses = monthItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalRevenue = appointments.filter(a => a.date.startsWith(prefix)).reduce((s, a) => s + (Number(a.cost) || 0), 0);
  const profit = totalRevenue - totalExpenses;
  const profitClass = profit >= 0 ? 'profit-positive' : 'profit-negative';
  const profitSign = profit >= 0 ? '+' : '';
  const yearPrefix = `${expYear}-`;
  const yearExpenses = expenses.filter(e => e.date.startsWith(yearPrefix)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const yearRevenue = appointments.filter(a => a.date.startsWith(yearPrefix)).reduce((s, a) => s + (Number(a.cost) || 0), 0);
  const yearProfit = yearRevenue - yearExpenses;
  const yearProfitClass = yearProfit >= 0 ? 'profit-positive' : 'profit-negative';
  const yearProfitSign = yearProfit >= 0 ? '+' : '';
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
  els.expensesWrap.innerHTML = `<div class="card"><div class="exp-nav"><button class="nav-btn" id="expPrevMonth">‹</button><div class="month-label">${MONTHS_RO[expMonth]} ${expYear}</div><button class="nav-btn" id="expNextMonth">›</button></div></div><div class="card"><div class="stats-card-title">Rezumat ${MONTHS_RO[expMonth].toLowerCase()} ${expYear}</div><div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:4px;"><div style="flex:1; min-width:90px; text-align:center; background:#1C1A26; border-radius:12px; padding:14px 8px;"><div style="font-family:'Fraunces',serif; font-size:20px; font-weight:700; color:#34D399; line-height:1;">${totalRevenue.toFixed(0)} lei</div><div style="font-size:12px; color:#A79FBD; margin-top:5px;">Încăsări</div></div><div style="flex:1; min-width:90px; text-align:center; background:#1C1A26; border-radius:12px; padding:14px 8px;"><div style="font-family:'Fraunces',serif; font-size:20px; font-weight:700; color:#F1616B; line-height:1;">${totalExpenses.toFixed(0)} lei</div><div style="font-size:12px; color:#A79FBD; margin-top:5px;">Cheltuieli</div></div><div style="flex:1; min-width:90px; text-align:center; background:#1C1A26; border-radius:12px; padding:14px 8px;"><div style="font-family:'Fraunces',serif; font-size:20px; font-weight:700; line-height:1;" class="${profitClass}">${profitSign}${profit.toFixed(0)} lei</div><div style="font-size:12px; color:#A79FBD; margin-top:5px;">Profit net</div></div></div></div><div class="card"><div class="stats-card-title">Total ${expYear}</div><div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:4px;"><div style="flex:1; min-width:90px; text-align:center; background:#1C1A26; border-radius:12px; padding:14px 8px;"><div style="font-family:'Fraunces',serif; font-size:20px; font-weight:700; color:#F1616B; line-height:1;">${yearExpenses.toFixed(0)} lei</div><div style="font-size:12px; color:#A79FBD; margin-top:5px;">Cheltuieli totale</div></div><div style="flex:1; min-width:90px; text-align:center; background:#1C1A26; border-radius:12px; padding:14px 8px;"><div style="font-family:'Fraunces',serif; font-size:20px; font-weight:700; line-height:1;" class="${yearProfitClass}">${yearProfitSign}${yearProfit.toFixed(0)} lei</div><div style="font-size:12px; color:#A79FBD; margin-top:5px;">Profit total</div></div></div></div><div class="card">${expFormOpen ? `<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;"><div class="stats-card-title" style="margin:0;">Adaugă cheltuială</div><button type="button" class="icon-btn" id="expFormClose" aria-label="Închide"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><form id="expForm" style="display:flex; flex-direction:column; gap:12px; margin-top:4px;"><label class="field">Articol / descriere<input type="text" id="exp_item" placeholder="ex: Gel UV, pensule, folie..." autocomplete="off" required></label><div class="form-row"><label class="field">Sumă (lei)<input type="number" id="exp_amount" min="0.01" step="0.01" placeholder="ex: 85" required></label><label class="field">Data<input type="date" id="exp_date" value="${todayStr}" required></label></div><div id="exp_error"></div><button type="submit" class="save-btn" style="width:100%">+ Adaugă cheltuială</button></form>` : `<button type="button" class="save-btn" id="expFormOpenBtn" style="width:100%">+ Adaugă cheltuială</button>`}</div>${monthItems.length === 0 ? `<div class="card"><p class="no-appts">Nicio cheltuială în ${MONTHS_RO[expMonth].toLowerCase()} ${expYear}.</p></div>` : `<div class="card"><div class="stats-card-title">Cheltuieli — ${MONTHS_RO[expMonth].toLowerCase()} ${expYear}</div><ul style="list-style:none; display:flex; flex-direction:column; gap:8px; margin-top:4px;">${monthItems.map(e => { const parts = e.date.split('-').map(Number); return `<li class="exp-item"><div class="exp-date">${parts[2]} ${MONTHS_RO[parts[1]-1].slice(0,3)}</div><div class="exp-name">${escapeHtml(e.item)}</div><div class="exp-amount">${Number(e.amount).toFixed(0)} lei</div><button class="icon-btn danger" data-delexp="${e.id}" aria-label="Şterge"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg></button></li>`; }).join('')}</ul></div>` }`;
  document.getElementById("expPrevMonth").addEventListener("click", () => { if (expMonth === 0) { expMonth = 11; expYear -= 1; } else expMonth -= 1; renderExpenses(); });
  document.getElementById("expNextMonth").addEventListener("click", () => { if (expMonth === 11) { expMonth = 0; expYear += 1; } else expMonth += 1; renderExpenses(); });
  if (expFormOpen) {
    document.getElementById("expForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const item = document.getElementById("exp_item").value.trim();
      const amount = Number(document.getElementById("exp_amount").value);
      const date = document.getElementById("exp_date").value;
      const errEl = document.getElementById("exp_error");
      errEl.innerHTML = "";
      if (!item) { errEl.innerHTML = `<div class="form-error">Adaugă descrierea articolului.</div>`; return; }
      if (!amount || amount <= 0) { errEl.innerHTML = `<div class="form-error">Adaugă o sumă validă.</div>`; return; }
      if (!date) { errEl.innerHTML = `<div class="form-error">Selectează data.</div>`; return; }
      await saveExpense({ item, amount, date });
      expFormOpen = false;
      showToast("✓ Cheltuială adăugată");
    });
    document.getElementById("expFormClose").addEventListener("click", () => { expFormOpen = false; renderExpenses(); });
  } else {
    document.getElementById("expFormOpenBtn").addEventListener("click", () => { expFormOpen = true; renderExpenses(); });
  }
  els.expensesWrap.querySelectorAll("[data-delexp]").forEach(btn => { btn.addEventListener("click", () => showConfirmExpense(btn.dataset.delexp)); });
}

function showConfirmExpense(id) {
  const overlay = document.getElementById("confirmOverlay");
  document.querySelector(".confirm-title").textContent = "Ştergi cheltuiala?";
  overlay.style.display = "flex";
  document.getElementById("confirmOk").onclick = async () => { overlay.style.display = "none"; document.querySelector(".confirm-title").textContent = "Ştergi programarea?"; await removeExpense(id); };
  document.getElementById("confirmCancel").onclick = () => { overlay.style.display = "none"; document.querySelector(".confirm-title").textContent = "Ştergi programarea?"; };
  overlay.onclick = (e) => { if (e.target === overlay) { overlay.style.display = "none"; document.querySelector(".confirm-title").textContent = "Ştergi programarea?"; } };
}

document.addEventListener("click", (e) => {
  const list = document.getElementById("clientSuggestions");
  const input = document.getElementById("f_client");
  if (list && input && e.target !== input && !list.contains(e.target)) { list.style.display = 'none'; }
});
document.getElementById("prevMonth").addEventListener("click", () => { if (month === 0) { month = 11; year -= 1; } else month -= 1; renderAll(); });
document.getElementById("nextMonth").addEventListener("click", () => { if (month === 11) { month = 0; year += 1; } else month += 1; renderAll(); });
els.showToday.addEventListener("click", () => { agendaDate = todayDateKey(); selectedDate = agendaDate; editingId = null; editingSurface = null; setCalendarMode("today"); });
els.showCalendar.addEventListener("click", () => { const date = dateFromKey(agendaDate); year = date.getFullYear(); month = date.getMonth(); selectedDate = agendaDate; editingId = null; editingSurface = null; setCalendarMode("calendar"); });
document.getElementById("clientSearch").addEventListener("input", (e) => { clientSearchQuery = e.target.value; renderClients(); });
els.tabCalendar.addEventListener("click", () => activateView("calendar"));
els.tabClients.addEventListener("click", () => activateView("clients"));
els.tabStats.addEventListener("click", () => activateView("stats"));
els.tabExpenses.addEventListener("click", () => activateView("expenses"));
if (els.navAddBtn) els.navAddBtn.addEventListener("click", quickAddAppointment);

function showConfirm(id) {
  const overlay = document.getElementById("confirmOverlay");
  overlay.style.display = "flex";
  document.getElementById("confirmOk").onclick = async () => { overlay.style.display = "none"; await removeAppointment(id); };
  document.getElementById("confirmCancel").onclick = () => { overlay.style.display = "none"; };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = "none"; };
}

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById("successToast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

function setupSwipeActions(root = document) {
  const rows = root.querySelectorAll(".swipe-item");

  rows.forEach(row => {
    if (row.dataset.swipeReady === "1") return;
    row.dataset.swipeReady = "1";

    let startX = 0;
    let startY = 0;

    row.addEventListener("touchstart", (e) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    }, { passive: true });

    row.addEventListener("touchend", (e) => {
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;

      document.querySelectorAll(".swipe-item.open").forEach(item => {
        if (item !== row) item.classList.remove("open");
      });

      if (dx < 0) row.classList.add("open");
      else row.classList.remove("open");
    }, { passive: true });
  });
}


renderAll();