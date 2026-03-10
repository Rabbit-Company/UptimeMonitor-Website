import { credentials, $, esc, showToast, formatDate, relativeTime, setLoading, apiRequest, openModal, closeModal, confirmDelete } from "./admin-shared.js";

let maintenances = [];
let expandedTimelines = new Set();

// API

export async function fetchMaintenances() {
	const data = await apiRequest("GET", `/v1/admin/maintenances?status_page_id=${encodeURIComponent(credentials.statusPageId)}`);
	maintenances = data.maintenances || [];
	return maintenances;
}

async function fetchMaintenanceDetail(id) {
	return await apiRequest("GET", `/v1/admin/maintenances/${encodeURIComponent(id)}`);
}

async function createMaintenance(payload) {
	return await apiRequest("POST", `/v1/admin/maintenances`, payload);
}

async function updateMaintenance(id, payload) {
	return await apiRequest("PUT", `/v1/admin/maintenances/${encodeURIComponent(id)}`, payload);
}

async function deleteMaintenance(id) {
	return await apiRequest("DELETE", `/v1/admin/maintenances/${encodeURIComponent(id)}`);
}

async function addMaintenanceUpdate(maintenanceId, payload) {
	return await apiRequest("POST", `/v1/admin/maintenances/${encodeURIComponent(maintenanceId)}/updates`, payload);
}

async function deleteMaintenanceUpdate(maintenanceId, updateId) {
	return await apiRequest("DELETE", `/v1/admin/maintenances/${encodeURIComponent(maintenanceId)}/updates/${encodeURIComponent(updateId)}`);
}

// Refresh

async function refreshMaintenances() {
	setLoading("btn-refresh-maintenances", true);
	try {
		await fetchMaintenances();
		renderMaintenances();
		showToast("Maintenances refreshed.");
	} catch (err) {
		showToast("Refresh failed: " + err.message, true);
	} finally {
		setLoading("btn-refresh-maintenances", false);
	}
}

// Helpers

function formatMaintenanceWindow(start, end) {
	if (!start || !end) return "";
	const s = new Date(start);
	const e = new Date(end);
	const sameDay = s.toDateString() === e.toDateString();
	const dateOpts = { month: "short", day: "numeric", year: "numeric" };
	const timeOpts = { hour: "2-digit", minute: "2-digit" };

	if (sameDay) {
		return `${s.toLocaleDateString(undefined, dateOpts)} ${s.toLocaleTimeString(undefined, timeOpts)} – ${e.toLocaleTimeString(undefined, timeOpts)}`;
	}
	return `${s.toLocaleString(undefined, { ...dateOpts, ...timeOpts })} – ${e.toLocaleString(undefined, { ...dateOpts, ...timeOpts })}`;
}

// Render

function getFilteredMaintenances() {
	const statusFilter = $("#filter-maint-status").value;
	let filtered = [...maintenances];

	if (statusFilter) {
		filtered = filtered.filter((m) => m.status === statusFilter);
	}

	const statusOrder = { in_progress: 0, scheduled: 1, completed: 2, cancelled: 3 };
	filtered.sort((a, b) => {
		const aOrder = statusOrder[a.status] ?? 9;
		const bOrder = statusOrder[b.status] ?? 9;
		if (aOrder !== bOrder) return aOrder - bOrder;
		return new Date(b.updated_at) - new Date(a.updated_at);
	});

	return filtered;
}

export function renderMaintenances() {
	const container = $("#maintenances-list");
	const filtered = getFilteredMaintenances();

	if (filtered.length === 0) {
		container.innerHTML = `
			<div class="empty-state">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
				</svg>
				<h3>No maintenances found</h3>
				<p>${maintenances.length === 0 ? "No maintenances exist for this status page yet." : "No maintenances match the current filter."}</p>
			</div>
		`;
		return;
	}

	container.innerHTML = filtered.map((m) => renderMaintenanceCard(m)).join("");
	bindMaintenanceEvents(container);
}

function renderMaintenanceCard(m) {
	const isExpanded = expandedTimelines.has(m.id);
	const monitors =
		m.affected_monitors && m.affected_monitors.length > 0
			? `<div class="item-monitors">${m.affected_monitors.map((mon) => `<span class="monitor-tag">${esc(mon)}</span>`).join("")}</div>`
			: "";

	const timeline = isExpanded
		? `<div class="item-timeline" id="maint-timeline-${esc(m.id)}"><div style="text-align:center; padding: 16px; color: var(--text-subtle);">Loading timeline...</div></div>`
		: "";

	const timelineToggleLabel = isExpanded ? "Hide Timeline" : "Show Timeline";
	const timelineToggleClass = isExpanded ? "timeline-toggle open" : "timeline-toggle";

	const suppressLabel = m.suppress_notifications ? `<span class="maint-suppress-badge">Notifications suppressed</span>` : "";

	return `
		<div class="item-card" data-item-id="${esc(m.id)}">
			<div class="item-card-header">
				<div class="item-card-info">
					<h3>${esc(m.title)}</h3>
					<div class="item-meta">
						<span class="status-badge maint-status-${m.status}">${m.status.replace("_", " ")}</span>
						<span class="item-meta-text">${formatMaintenanceWindow(m.scheduled_start, m.scheduled_end)}</span>
					</div>
					<div class="item-meta" style="margin-top: 4px;">
						${suppressLabel}
						${m.completed_at ? `<span class="item-meta-text">Completed ${formatDate(m.completed_at)}</span>` : `<span class="item-meta-text">Updated ${relativeTime(m.updated_at)}</span>`}
					</div>
				</div>
				<div class="config-card-actions">
					<button class="btn btn-sm btn-secondary" data-action="add-maint-update" data-id="${esc(m.id)}" title="Add timeline update">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
						</svg>
						Update
					</button>
					<button class="btn btn-sm btn-secondary" data-action="edit-maintenance" data-id="${esc(m.id)}" title="Edit maintenance metadata">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
							<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
						</svg>
					</button>
					<button class="btn btn-sm btn-secondary" data-action="delete-maintenance" data-id="${esc(m.id)}" data-title="${esc(m.title)}" title="Delete maintenance" style="color: var(--status-down);">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="3 6 5 6 21 6"/>
							<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
						</svg>
					</button>
				</div>
			</div>
			${monitors}
			<button class="${timelineToggleClass}" data-action="toggle-maint-timeline" data-id="${esc(m.id)}">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="6 9 12 15 18 9"/>
				</svg>
				<span>${timelineToggleLabel}</span>
			</button>
			${timeline}
		</div>
	`;
}

function renderMaintenanceTimeline(maintId, updates) {
	const container = $(`#maint-timeline-${CSS.escape(maintId)}`);
	if (!container) return;

	if (!updates || updates.length === 0) {
		container.innerHTML = `<p style="color: var(--text-subtle); font-size: 0.875rem;">No timeline updates.</p>`;
		return;
	}

	const sorted = [...updates].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

	container.innerHTML = `
		<div class="timeline-header">
			<h4>Timeline (${sorted.length})</h4>
			<button class="btn btn-sm btn-secondary" data-action="add-maint-update" data-id="${esc(maintId)}">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
				</svg>
				Add Update
			</button>
		</div>
		${sorted
			.map(
				(u) => `
			<div class="timeline-entry">
				<div class="timeline-entry-dot maint-${u.status}"></div>
				<div class="timeline-entry-content">
					<div class="timeline-entry-head">
						<span class="timeline-entry-status maint-${u.status}">${u.status.replace("_", " ")}</span>
						<span class="timeline-entry-time">${formatDate(u.created_at)}</span>
					</div>
					<p class="timeline-entry-message">${esc(u.message)}</p>
				</div>
				<div class="timeline-entry-actions">
					<button class="btn-icon" data-action="delete-maint-update" data-maintenance-id="${esc(maintId)}" data-update-id="${esc(u.id)}" title="Delete this update">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--status-down)" stroke-width="2">
							<polyline points="3 6 5 6 21 6"/>
							<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
						</svg>
					</button>
				</div>
			</div>
		`,
			)
			.join("")}
	`;

	container.querySelectorAll('[data-action="add-maint-update"]').forEach((btn) => {
		btn.addEventListener("click", () => openMaintenanceUpdateModal(btn.dataset.id));
	});
	container.querySelectorAll('[data-action="delete-maint-update"]').forEach((btn) => {
		btn.addEventListener("click", () => {
			confirmDelete("Are you sure you want to delete this timeline update? This cannot be undone.", async () => {
				try {
					await deleteMaintenanceUpdate(btn.dataset.maintenanceId, btn.dataset.updateId);
					showToast("Timeline update deleted.");
					await loadAndRenderMaintenanceTimeline(btn.dataset.maintenanceId);
					await fetchMaintenances();
					renderMaintenances();
					if (expandedTimelines.has(btn.dataset.maintenanceId)) {
						loadAndRenderMaintenanceTimeline(btn.dataset.maintenanceId);
					}
				} catch (err) {
					showToast("Delete failed: " + err.message, true);
				}
			});
		});
	});
}

async function loadAndRenderMaintenanceTimeline(maintId) {
	try {
		const detail = await fetchMaintenanceDetail(maintId);
		renderMaintenanceTimeline(maintId, detail.updates || []);
	} catch (err) {
		const container = $(`#maint-timeline-${CSS.escape(maintId)}`);
		if (container) {
			container.innerHTML = `<p style="color: var(--status-down); font-size: 0.875rem;">Failed to load timeline: ${esc(err.message)}</p>`;
		}
	}
}

// Events

function bindMaintenanceEvents(container) {
	container.querySelectorAll('[data-action="toggle-maint-timeline"]').forEach((btn) => {
		btn.addEventListener("click", () => {
			const id = btn.dataset.id;
			if (expandedTimelines.has(id)) {
				expandedTimelines.delete(id);
			} else {
				expandedTimelines.add(id);
			}
			renderMaintenances();
			if (expandedTimelines.has(id)) {
				loadAndRenderMaintenanceTimeline(id);
			}
		});
	});

	container.querySelectorAll('[data-action="add-maint-update"]').forEach((btn) => {
		btn.addEventListener("click", () => openMaintenanceUpdateModal(btn.dataset.id));
	});

	container.querySelectorAll('[data-action="edit-maintenance"]').forEach((btn) => {
		btn.addEventListener("click", () => openEditMaintenanceModal(btn.dataset.id));
	});

	container.querySelectorAll('[data-action="delete-maintenance"]').forEach((btn) => {
		btn.addEventListener("click", () => {
			const title = btn.dataset.title;
			confirmDelete(`Are you sure you want to delete the maintenance "${title}" and all its timeline updates? This cannot be undone.`, async () => {
				try {
					await deleteMaintenance(btn.dataset.id);
					expandedTimelines.delete(btn.dataset.id);
					await fetchMaintenances();
					renderMaintenances();
					showToast("Maintenance deleted.");
				} catch (err) {
					showToast("Delete failed: " + err.message, true);
				}
			});
		});
	});
}

// Modals

function toLocalDatetimeValue(iso) {
	if (!iso) return "";
	const d = new Date(iso);
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openCreateMaintenanceModal() {
	$("#maint-modal-title").textContent = "Schedule Maintenance";
	$("#edit-maintenance-id").value = "";
	$("#maint-title").value = "";
	$("#maint-status").value = "scheduled";
	$("#maint-status").disabled = false;
	$("#maint-scheduled-start").value = "";
	$("#maint-scheduled-end").value = "";
	$("#maint-monitors").value = "";
	$("#maint-suppress").checked = true;
	$("#maint-message").value = "";
	$("#maint-initial-message-group").style.display = "";
	$("#maint-status-group").style.display = "";
	$("#btn-save-maintenance span").textContent = "Schedule Maintenance";
	openModal("maintenanceModal");
}

function openEditMaintenanceModal(id) {
	const m = maintenances.find((x) => x.id === id);
	if (!m) return;

	$("#maint-modal-title").textContent = "Edit Maintenance";
	$("#edit-maintenance-id").value = id;
	$("#maint-title").value = m.title;
	$("#maint-status").value = m.status;
	$("#maint-status").disabled = true;
	$("#maint-scheduled-start").value = toLocalDatetimeValue(m.scheduled_start);
	$("#maint-scheduled-end").value = toLocalDatetimeValue(m.scheduled_end);
	$("#maint-monitors").value = (m.affected_monitors || []).join(", ");
	$("#maint-suppress").checked = m.suppress_notifications !== false;
	$("#maint-message").value = "";
	$("#maint-initial-message-group").style.display = "none";
	$("#maint-status-group").style.display = "none";
	$("#btn-save-maintenance span").textContent = "Save Changes";
	openModal("maintenanceModal");
}

async function saveMaintenance() {
	const id = $("#edit-maintenance-id").value;
	const isEdit = !!id;

	const title = $("#maint-title").value.trim();
	const scheduledStart = $("#maint-scheduled-start").value;
	const scheduledEnd = $("#maint-scheduled-end").value;
	const monitorsRaw = $("#maint-monitors").value.trim();
	const suppress_notifications = $("#maint-suppress").checked;
	const affected_monitors = monitorsRaw
		? monitorsRaw
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
		: [];

	if (!title) {
		showToast("Title is required.", true);
		return;
	}

	if (!scheduledStart || !scheduledEnd) {
		showToast("Scheduled start and end times are required.", true);
		return;
	}

	const startISO = new Date(scheduledStart).toISOString();
	const endISO = new Date(scheduledEnd).toISOString();

	if (new Date(endISO) <= new Date(startISO)) {
		showToast("End time must be after start time.", true);
		return;
	}

	setLoading("btn-save-maintenance", true);

	try {
		if (isEdit) {
			await updateMaintenance(id, {
				title,
				scheduled_start: startISO,
				scheduled_end: endISO,
				affected_monitors,
				suppress_notifications,
			});
			showToast("Maintenance updated.");
		} else {
			const status = $("#maint-status").value;
			const message = $("#maint-message").value.trim();
			if (!message) {
				showToast("Initial message is required.", true);
				setLoading("btn-save-maintenance", false);
				return;
			}
			await createMaintenance({
				status_page_id: credentials.statusPageId,
				title,
				status,
				scheduled_start: startISO,
				scheduled_end: endISO,
				message,
				affected_monitors: affected_monitors.length > 0 ? affected_monitors : undefined,
				suppress_notifications,
			});
			showToast("Maintenance created.");
		}

		closeModal("maintenanceModal");
		await fetchMaintenances();
		renderMaintenances();
	} catch (err) {
		showToast((isEdit ? "Update" : "Create") + " failed: " + err.message, true);
	} finally {
		setLoading("btn-save-maintenance", false);
	}
}

function openMaintenanceUpdateModal(maintId) {
	const m = maintenances.find((x) => x.id === maintId);
	$("#maint-update-id").value = maintId;
	if (m) {
		const statusFlow = { scheduled: "in_progress", in_progress: "completed", completed: "completed", cancelled: "cancelled" };
		$("#maint-update-status").value = statusFlow[m.status] || m.status;
	}
	$("#maint-update-message").value = "";
	openModal("maintenanceUpdateModal");
}

async function saveMaintenanceUpdate() {
	const maintId = $("#maint-update-id").value;
	const status = $("#maint-update-status").value;
	const message = $("#maint-update-message").value.trim();

	if (!message) {
		showToast("Message is required.", true);
		return;
	}

	setLoading("btn-save-maint-update", true);

	try {
		await addMaintenanceUpdate(maintId, { status, message });
		closeModal("maintenanceUpdateModal");
		showToast("Timeline update added.");
		await fetchMaintenances();
		renderMaintenances();
		if (expandedTimelines.has(maintId)) {
			loadAndRenderMaintenanceTimeline(maintId);
		}
	} catch (err) {
		showToast("Failed to add update: " + err.message, true);
	} finally {
		setLoading("btn-save-maint-update", false);
	}
}

// Init

export function initMaintenanceEvents() {
	$("#btn-new-maintenance").addEventListener("click", openCreateMaintenanceModal);
	$("#btn-refresh-maintenances").addEventListener("click", refreshMaintenances);
	$("#filter-maint-status").addEventListener("change", renderMaintenances);

	$("#btn-close-maint-modal").addEventListener("click", () => closeModal("maintenanceModal"));
	$("#btn-cancel-maint-modal").addEventListener("click", () => closeModal("maintenanceModal"));
	$("#btn-save-maintenance").addEventListener("click", saveMaintenance);

	$("#btn-close-maint-update-modal").addEventListener("click", () => closeModal("maintenanceUpdateModal"));
	$("#btn-cancel-maint-update-modal").addEventListener("click", () => closeModal("maintenanceUpdateModal"));
	$("#btn-save-maint-update").addEventListener("click", saveMaintenanceUpdate);
}
