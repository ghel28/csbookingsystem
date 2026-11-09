const labs = window.LABSPACE_LABS || [];
const RESERVATIONS_KEY = "cs-lab-reservations-v2";
const PROFILE_KEY = "cs-lab-profile-v1";
const activeBookingStatuses = new Set(["pending", "approved", "paid", "checked-in"]);
const elements = {
  form: document.querySelector("#bookingForm"),
  lab: document.querySelector("#bookingLab"),
  date: document.querySelector("#bookingDate"),
  start: document.querySelector("#bookingStart"),
  duration: document.querySelector("#bookingDuration"),
  equipment: document.querySelector("#bookingEquipment"),
  purpose: document.querySelector("#bookingPurpose"),
  name: document.querySelector("#guestName"),
  email: document.querySelector("#guestEmail"),
  course: document.querySelector("#guestCourse"),
  message: document.querySelector("#bookingMessage"),
  formError: document.querySelector("#formError"),
  profileForm: document.querySelector("#accountForm"),
  profileName: document.querySelector("#profileName"),
  profileEmail: document.querySelector("#profileEmail"),
  profileCourse: document.querySelector("#profileCourse"),
  accountError: document.querySelector("#accountError"),
  toast: document.querySelector("#toast"),
};

let reservations = readJson(RESERVATIONS_KEY, []);
let profile = readJson(PROFILE_KEY, null);
let toastTimer;

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function localDateString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
}

function formatTime(value) {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hour, minute));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 3200);
}

function saveReservations() {
  try {
    localStorage.setItem(RESERVATIONS_KEY, JSON.stringify(reservations));
    return true;
  } catch {
    showToast("Could not save. Browser storage may be unavailable.");
    return false;
  }
}

function saveProfile() {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
    return true;
  } catch {
    showToast("Could not save the profile in this browser.");
    return false;
  }
}

function setView(name) {
  document.querySelectorAll(".view-section").forEach((section) => {
    const active = section.id === `view-${name}`;
    section.hidden = !active;
    section.classList.toggle("is-visible", active);
  });
  document.querySelectorAll(".nav-link[data-view]").forEach((link) => link.classList.toggle("is-active", link.dataset.view === name));
  if (name === "request") fillProfileFields();
  if (name === "account") fillAccountFields();
  if (name === "pass") renderPasses();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function fillProfileFields() {
  if (!profile) return;
  if (!elements.name.value) elements.name.value = profile.name || "";
  if (!elements.email.value) elements.email.value = profile.email || "";
  if (!elements.course.value) elements.course.value = profile.course || "";
}

function fillAccountFields() {
  elements.profileName.value = profile?.name || "";
  elements.profileEmail.value = profile?.email || "";
  elements.profileCourse.value = profile?.course || "";
}

function setupLabOptions() {
  elements.lab.innerHTML = labs.map((lab) => `<option value="${escapeHtml(lab.id)}">${escapeHtml(lab.name)}</option>`).join("");
  updateEquipmentOptions();
}

function updateEquipmentOptions() {
  const lab = labs.find((item) => item.id === elements.lab.value);
  const current = elements.equipment.value;
  const choices = ["No additional equipment", ...(lab?.equipment || [])];
  elements.equipment.innerHTML = choices.map((name, index) => `<option value="${index === 0 ? "None" : escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  if ([...elements.equipment.options].some((option) => option.value === current)) elements.equipment.value = current;
}

function getLabHours(lab) {
  const match = lab?.hours.match(/(\d{2}):(\d{2})[–-](\d{2}):(\d{2})/);
  if (!match) return { opens: 7, closes: 22 };
  return { opens: Number(match[1]), closes: Number(match[3]) };
}

function updateTimeOptions() {
  const selectedDate = elements.date.value || localDateString();
  const firstHour = selectedDate === localDateString() ? new Date().getHours() + 1 : 7;
  const { opens, closes } = getLabHours(labs.find((item) => item.id === elements.lab.value));
  const startHour = Math.max(opens, firstHour);
  elements.start.innerHTML = "";
  for (let hour = startHour; hour < closes; hour += 1) {
    const value = `${String(hour).padStart(2, "0")}:00`;
    elements.start.add(new Option(formatTime(value), value));
  }
  if (!elements.start.options.length) elements.start.add(new Option("No times left today", ""));
}

function isOverlapping(labId, date, start, duration, exceptId = "") {
  const newStart = Number(start.slice(0, 2)) * 60;
  const newEnd = newStart + Number(duration) * 60;
  return reservations.some((booking) => {
    if (booking.id === exceptId || booking.labId !== labId || booking.date !== date || !activeBookingStatuses.has(booking.status)) return false;
    const oldStart = Number(booking.start.slice(0, 2)) * 60;
    const oldEnd = oldStart + Number(booking.duration) * 60;
    return newStart < oldEnd && newEnd > oldStart;
  });
}

function bookingActions(booking) {
  if (booking.status === "pending") return `<div class="workflow-actions"><span class="demo-note-inline">Approval actions are stored in this browser</span><button class="button button--success button--small" type="button" data-action="approve" data-id="${escapeHtml(booking.id)}">Approve</button><button class="button button--danger button--small" type="button" data-action="reject" data-id="${escapeHtml(booking.id)}">Reject</button></div>`;
  if (booking.status === "rejected") return `<div class="workflow-actions"><p class="rejection-note">${escapeHtml(booking.reviewNote || "The reviewer requested changes. Update the details and resubmit.")}</p><button class="button button--soft button--small" type="button" data-action="edit" data-id="${escapeHtml(booking.id)}">Modify and resubmit</button></div>`;
  if (booking.status === "approved") return `<div class="workflow-actions"><span class="demo-note-inline">Payment provider is not connected · no charge is made</span><button class="button button--primary button--small" type="button" data-action="pay" data-id="${escapeHtml(booking.id)}">Complete payment step</button></div>`;
  if (booking.status === "paid") return `<div class="workflow-actions"><button class="button button--soft button--small" type="button" data-view="pass">Open reservation pass</button></div>`;
  if (booking.status === "checked-in") return `<div class="workflow-actions"><span class="demo-note-inline">Checked in · remember to check out</span><button class="button button--soft button--small" type="button" data-action="checkout" data-id="${escapeHtml(booking.id)}">Check out</button></div>`;
  if (booking.status === "completed") return `<div class="workflow-actions"><span class="demo-note-inline">Lab visit complete</span></div>`;
  return "";
}

function reservationCard(booking) {
  const lab = labs.find((item) => item.id === booking.labId);
  if (!lab) return "";
  const endHour = Number(booking.start.slice(0, 2)) + Number(booking.duration);
  const endTime = `${String(endHour).padStart(2, "0")}:${booking.start.slice(3)}`;
  return `<article class="reservation-card">
    <div class="reservation-card__heading"><div><span class="reservation-category">${escapeHtml(lab.category)}</span><h3>${escapeHtml(lab.name)}</h3><p>${escapeHtml(lab.location)}</p></div><span class="status-pill status-pill--${escapeHtml(booking.status)}">${escapeHtml(statusLabel(booking.status))}</span></div>
    <div class="reservation-details"><span><b>Date</b>${escapeHtml(formatDate(booking.date))}</span><span><b>Time</b>${escapeHtml(formatTime(booking.start))}–${escapeHtml(formatTime(endTime))}</span><span><b>Equipment</b>${escapeHtml(booking.equipment || "None")}</span><span><b>Requester</b>${escapeHtml(booking.name)} · ${escapeHtml(booking.course)}</span></div>
    ${booking.purpose ? `<p class="reservation-purpose"><b>Activity:</b> ${escapeHtml(booking.purpose)}</p>` : ""}${booking.message ? `<p class="reservation-message">“${escapeHtml(booking.message)}”</p>` : ""}${booking.passId ? `<p class="pass-reference">Pass ID: <strong>${escapeHtml(booking.passId)}</strong></p>` : ""}
    ${bookingActions(booking)}</article>`;
}

function statusLabel(status) {
  return ({ pending: "Pending approval", approved: "Approved · payment due", rejected: "Changes requested", paid: "Paid · pass ready", "checked-in": "Checked in", completed: "Completed" })[status] || "Unknown";
}

function renderLabs(container) {
  const today = elements.date.value || localDateString();
  container.innerHTML = labs.map((lab) => {
    const count = reservations.filter((booking) => booking.labId === lab.id && booking.date === today && activeBookingStatuses.has(booking.status)).length;
    const availability = count ? `${count} reservation${count === 1 ? "" : "s"} on selected date` : "No reservations yet";
    return `<article class="lab-card"><div class="lab-card__icon" aria-hidden="true">${escapeHtml(lab.icon)}</div><div class="lab-card__body"><span class="reservation-category">${escapeHtml(lab.category)}</span><h3>${escapeHtml(lab.name)}</h3><p>${escapeHtml(lab.location)}</p><p class="lab-equipment">${escapeHtml(lab.equipment.join(" · "))}</p><span class="availability-label">${escapeHtml(availability)}</span><button class="button button--soft button--small" type="button" data-book-lab="${escapeHtml(lab.id)}">Request this lab →</button></div></article>`;
  }).join("");
}

function renderReservations() {
  const sorted = reservations.slice().sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  document.querySelector("#bookingCount").textContent = String(reservations.length);
  document.querySelector("#dashboardReservations").innerHTML = sorted.length ? sorted.slice(0, 3).map(reservationCard).join("") : emptyState("No booking requests yet", "Start by requesting a Computer Science lab.", "request", "Request a lab");
  document.querySelector("#allReservations").innerHTML = sorted.length ? sorted.map(reservationCard).join("") : emptyState("No reservations yet", "Your submitted requests will appear here.", "request", "Request a lab");
  document.querySelector("#paymentReservations").innerHTML = sorted.filter((booking) => ["approved", "paid"].includes(booking.status)).map(reservationCard).join("") || emptyState("No payments due", "A reservation must be approved before payment.");
  const pending = sorted.filter((booking) => booking.status === "pending").length;
  const approved = sorted.filter((booking) => booking.status === "approved").length;
  const ready = sorted.filter((booking) => ["paid", "checked-in"].includes(booking.status)).length;
  document.querySelector("#dashboardStats").innerHTML = [["Total requests", sorted.length, "Across your reservations"], ["Pending approval", pending, "Awaiting reviewer decision"], ["Payment due", approved, "Approved requests"], ["Passes ready", ready, "Paid reservations"]].map(([label, count, detail]) => `<article class="stat-card"><span>${escapeHtml(label)}</span><strong>${count}</strong><small>${escapeHtml(detail)}</small></article>`).join("");
  document.querySelector("#accountIndicator").textContent = profile ? `Signed in as ${profile.name}` : "Profile not set";
  renderLabs(document.querySelector("#dashboardLabs"));
  renderLabs(document.querySelector("#allLabs"));
  if (!document.querySelector("#view-pass").hidden) renderPasses();
}

function emptyState(title, message, view = "", buttonLabel = "") {
  return `<div class="empty-state"><span aria-hidden="true">◷</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${view ? `<button class="button button--soft" type="button" data-view="${escapeHtml(view)}">${escapeHtml(buttonLabel)}</button>` : ""}</div>`;
}

function renderPasses() {
  const paidBookings = reservations.filter((booking) => ["paid", "checked-in", "completed"].includes(booking.status));
  const container = document.querySelector("#passReservations");
  if (!paidBookings.length) {
    container.innerHTML = emptyState("No reservation passes yet", "Complete the payment step after approval to generate a pass.", "payment", "Go to payment");
    return;
  }
  container.innerHTML = paidBookings.map((booking) => {
    const lab = labs.find((item) => item.id === booking.labId);
    const accessAction = booking.status === "paid"
      ? `<button class="button button--primary" type="button" data-action="checkin" data-id="${escapeHtml(booking.id)}">Check in to lab</button>`
      : booking.status === "checked-in"
        ? `<button class="button button--soft" type="button" data-action="checkout" data-id="${escapeHtml(booking.id)}">Check out of lab</button>`
        : "";
    return `<article class="pass-card"><div class="pass-card__details"><p class="eyebrow">COMPUTER SCIENCE LAB PASS</p><h2>${escapeHtml(lab?.name || "Computer lab")}</h2><p>${escapeHtml(formatDate(booking.date))} · ${escapeHtml(formatTime(booking.start))}</p><p>${escapeHtml(booking.name)} · ${escapeHtml(booking.course)}</p><p class="pass-reference">Pass ID <strong>${escapeHtml(booking.passId || booking.id)}</strong></p><span class="status-pill status-pill--${escapeHtml(booking.status)}">${escapeHtml(statusLabel(booking.status))}</span><div class="pass-actions">${accessAction}</div></div><div class="qr-wrap"><canvas class="pass-qr" data-qr="${escapeHtml(booking.passId || booking.id)}" aria-label="QR code for reservation pass"></canvas><span class="qr-hint">Scan at lab access point</span></div></article>`;
  }).join("");
  container.querySelectorAll("canvas[data-qr]").forEach((canvas) => {
    const hint = canvas.parentElement.querySelector(".qr-hint");
    if (window.QRCode?.toCanvas) {
      window.QRCode.toCanvas(canvas, canvas.dataset.qr, { width: 176, margin: 1, color: { dark: "#1c3550", light: "#ffffff" } }, (error) => {
        if (error) {
          canvas.replaceWith(document.createTextNode(canvas.dataset.qr));
          hint.textContent = "QR unavailable; show the pass ID to staff.";
        }
      });
    } else {
      const fallback = document.createElement("span");
      fallback.className = "qr-fallback";
      fallback.textContent = `Pass ${canvas.dataset.qr}`;
      canvas.replaceWith(fallback);
      hint.textContent = "QR unavailable; show the pass ID to staff.";
    }
  });
}

function submitBooking(event) {
  event.preventDefault();
  const data = {
    labId: elements.lab.value,
    date: elements.date.value,
    start: elements.start.value,
    duration: Number(elements.duration.value),
    equipment: elements.equipment.value,
    purpose: elements.purpose.value.trim(),
    name: elements.name.value.trim(),
    email: elements.email.value.trim(),
    course: elements.course.value.trim(),
    message: elements.message.value.trim(),
  };
  const lab = labs.find((item) => item.id === data.labId);
  let error = "";
  if (!lab || !data.name || !data.email || !data.course) error = "Enter your name, school email, and Computer Science course/year level.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) error = "Enter a valid school email address.";
  else if (!data.date || data.date < localDateString()) error = "Choose today or a future date.";
  else if (!data.start) error = "There are no booking times left for this date.";
  else if (Number(data.start.slice(0, 2)) + data.duration > getLabHours(lab).closes) error = `Choose a shorter duration so the booking ends by ${formatTime(`${String(getLabHours(lab).closes).padStart(2, "0")}:00`)}.`;
  else if (data.date === localDateString() && Number(data.start.slice(0, 2)) <= new Date().getHours()) error = "Choose a time slot that has not passed.";
  else if (isOverlapping(data.labId, data.date, data.start, data.duration)) error = "That lab and time slot already has a reservation request. Choose another slot.";
  if (error) {
    elements.formError.textContent = error;
    elements.formError.hidden = false;
    return;
  }
  elements.formError.hidden = true;
  const reservation = { ...data, id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`, status: "pending", createdAt: new Date().toISOString() };
  reservations.push(reservation);
  if (!saveReservations()) {
    reservations = reservations.filter((item) => item.id !== reservation.id);
    return;
  }
  elements.form.reset();
  elements.date.min = localDateString();
  elements.date.value = localDateString();
  updateTimeOptions();
  updateEquipmentOptions();
  renderReservations();
  setView("reservations");
  showToast("Request submitted. It is now pending approval.");
}

function updateReservation(id, update) {
  const index = reservations.findIndex((booking) => booking.id === id);
  if (index < 0) return;
  const previous = reservations[index];
  reservations[index] = { ...previous, ...update };
  if (!saveReservations()) reservations[index] = previous;
  renderReservations();
}

function handleAction(action, id) {
  const booking = reservations.find((item) => item.id === id);
  if (!booking) return;
  if (action === "approve" && booking.status === "pending") {
    updateReservation(id, { status: "approved", reviewedAt: new Date().toISOString() });
    showToast("Approval recorded. The payment step is now available.");
  } else if (action === "reject" && booking.status === "pending") {
    const note = window.prompt("Add a short reason or change request for the student:", "Please update the request details and resubmit.");
    if (note === null) return;
    updateReservation(id, { status: "rejected", reviewNote: note.trim() || "Please update the request details and resubmit." });
    showToast("Request returned to the requester for changes.");
  } else if (action === "pay" && booking.status === "approved") {
    const passId = `CS-${Date.now().toString(36).toUpperCase()}`;
    updateReservation(id, { status: "paid", passId, paidAt: new Date().toISOString() });
    showToast("Payment step recorded. Reservation pass generated.");
    setView("pass");
  } else if (action === "checkin" && booking.status === "paid") {
    updateReservation(id, { status: "checked-in", checkedInAt: new Date().toISOString() });
    showToast("Check-in recorded for the lab visit.");
  } else if (action === "checkout" && booking.status === "checked-in") {
    updateReservation(id, { status: "completed", checkedOutAt: new Date().toISOString() });
    showToast("Check-out recorded. Booking complete.");
  } else if (action === "edit" && booking.status === "rejected") {
    elements.lab.value = booking.labId;
    elements.date.value = booking.date;
    updateTimeOptions();
    elements.start.value = booking.start;
    elements.duration.value = String(booking.duration);
    updateEquipmentOptions();
    elements.equipment.value = booking.equipment;
    elements.purpose.value = booking.purpose || "";
    elements.name.value = booking.name;
    elements.email.value = booking.email;
    elements.course.value = booking.course;
    elements.message.value = booking.message || "";
    setView("request");
    showToast("Update the request and submit it again for review.");
  }
}

function saveAccount(event) {
  event.preventDefault();
  const nextProfile = { name: elements.profileName.value.trim(), email: elements.profileEmail.value.trim(), course: elements.profileCourse.value.trim() };
  if (!nextProfile.name || !nextProfile.course || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextProfile.email)) {
    elements.accountError.textContent = "Add your name, valid school email, and Computer Science course/year level.";
    elements.accountError.hidden = false;
    return;
  }
  profile = nextProfile;
  if (!saveProfile()) return;
  elements.accountError.hidden = true;
  document.querySelector("#accountIndicator").textContent = `Signed in as ${profile.name}`;
  fillProfileFields();
  showToast("Profile details saved in this browser.");
}

function initialize() {
  const today = localDateString();
  elements.date.min = today;
  elements.date.value = today;
  setupLabOptions();
  updateTimeOptions();
  fillAccountFields();
  fillProfileFields();
  renderReservations();
  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      setView(viewButton.dataset.view);
      return;
    }
    const labButton = event.target.closest("[data-book-lab]");
    if (labButton) {
      elements.lab.value = labButton.dataset.bookLab;
      updateEquipmentOptions();
      setView("request");
      return;
    }
    const actionButton = event.target.closest("[data-action][data-id]");
    if (actionButton) handleAction(actionButton.dataset.action, actionButton.dataset.id);
  });
  elements.form.addEventListener("submit", submitBooking);
  elements.lab.addEventListener("change", () => {
    updateEquipmentOptions();
    updateTimeOptions();
  });
  elements.date.addEventListener("change", updateTimeOptions);
  elements.profileForm.addEventListener("submit", saveAccount);
  document.querySelector("#clearProfileButton").addEventListener("click", () => {
    profile = null;
    saveProfile();
    fillAccountFields();
    document.querySelector("#accountIndicator").textContent = "Profile not set";
    showToast("Profile details cleared.");
  });
}

initialize();
