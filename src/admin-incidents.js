import { credentials, $, esc, showToast, formatDate, relativeTime, setLoading, apiRequest, openModal, closeModal, confirmDelete } from "./admin-shared.js";

let incidents = [];
let expandedTimelines = new Set();

// API

export async function fetchIncidents() {
	const data = await apiRequest("GET", `/v1/admin/incidents?status_page_id=${encodeURIComponent(credentials.statusPageId)}`);
	incidents = data.incidents || [];
	return incidents;
}

async function fetchIncidentDetail(id) {
	return await apiRequest("GET", `/v1/admin/incidents/${encodeURIComponent(id)}`);
}

async function createIncident(payload) {
	return await apiRequest("POST", `/v1/admin/incidents`, payload);
}

async function updateIncident(id, payload) {
	return await apiRequest("PUT", `/v1/admin/incidents/${encodeURIComponent(id)}`, payload);
}

async function deleteIncident(id) {
	return await apiRequest("DELETE", `/v1/admin/incidents/${encodeURIComponent(id)}`);
}

async function addIncidentUpdate(incidentId, payload) {
	return await apiRequest("POST", `/v1/admin/incidents/${encodeURIComponent(incidentId)}/updates`, payload);
}

async function deleteIncidentUpdate(incidentId, updateId) {
	return await apiRequest("DELETE", `/v1/admin/incidents/${encodeURIComponent(incidentId)}/updates/${encodeURIComponent(updateId)}`);
}

// Refresh

async function refreshIncidents() {
	setLoading("btn-refresh-incidents", true);
	try {
		await fetchIncidents();
		renderIncidents();
		showToast("Incidents refreshed.");
	} catch (err) {
		showToast("Refresh failed: " + err.message, true);
	} finally {
		setLoading("btn-refresh-incidents", false);
	}
}

// Render

function getFilteredIncidents() {
	const statusFilter = $("#filter-incident-status").value;
	const severityFilter = $("#filter-incident-severity").value;
	let filtered = [...incidents];

	if (statusFilter) {
		filtered = filtered.filter((i) => i.status === statusFilter);
	}
	if (severityFilter) {
		filtered = filtered.filter((i) => i.severity === severityFilter);
	}

	filtered.sort((a, b) => {
		const aResolved = a.status === "resolved" ? 1 : 0;
		const bResolved = b.status === "resolved" ? 1 : 0;
		if (aResolved !== bResolved) return aResolved - bResolved;
		return new Date(b.updated_at) - new Date(a.updated_at);
	});

	return filtered;
}

export function renderIncidents() {
	const container = $("#incidents-list");
	const filtered = getFilteredIncidents();

	if (filtered.length === 0) {
		container.innerHTML = `
			<div class="empty-state">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
					<line x1="12" y1="9" x2="12" y2="13"/>
					<line x1="12" y1="17" x2="12.01" y2="17"/>
				</svg>
				<h3>No incidents found</h3>
				<p>${incidents.length === 0 ? "No incidents exist for this status page yet." : "No incidents match the current filters."}</p>
			</div>
		`;
		return;
	}

	container.innerHTML = filtered.map((inc) => renderIncidentCard(inc)).join("");
	bindIncidentEvents(container);
}

function renderIncidentCard(inc) {
	const isExpanded = expandedTimelines.has(inc.id);
	const monitors =
		inc.affected_monitors && inc.affected_monitors.length > 0
			? `<div class="item-monitors">${inc.affected_monitors.map((m) => `<span class="monitor-tag">${esc(m)}</span>`).join("")}</div>`
			: "";

	const timeline = isExpanded
		? `<div class="item-timeline" id="inc-timeline-${esc(inc.id)}"><div style="text-align:center; padding: 16px; color: var(--text-subtle);">Loading timeline...</div></div>`
		: "";

	const timelineToggleLabel = isExpanded ? "Hide Timeline" : "Show Timeline";
	const timelineToggleClass = isExpanded ? "timeline-toggle open" : "timeline-toggle";

	const suppressLabel = inc.suppress_notifications ? `<span class="incident-suppress-badge">Notifications suppressed</span>` : "";

	return `
		<div class="item-card" data-item-id="${esc(inc.id)}">
			<div class="item-card-header">
				<div class="item-card-info">
					<h3>${esc(inc.title)}</h3>
					<div class="item-meta">
						<span class="status-badge status-${inc.status}">${inc.status}</span>
						<span class="severity-badge severity-${inc.severity}">${inc.severity}</span>
						${suppressLabel}
						<span class="item-meta-text">Created ${formatDate(inc.created_at)}</span>
						${inc.resolved_at ? `<span class="item-meta-text">· Resolved ${formatDate(inc.resolved_at)}</span>` : `<span class="item-meta-text">· Updated ${relativeTime(inc.updated_at)}</span>`}
					</div>
				</div>
				<div class="config-card-actions">
					<button class="btn btn-sm btn-secondary" data-action="add-inc-update" data-id="${esc(inc.id)}" title="Add timeline update">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
						</svg>
						Update
					</button>
					<button class="btn btn-sm btn-secondary" data-action="edit-incident" data-id="${esc(inc.id)}" title="Edit incident metadata">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
							<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
						</svg>
					</button>
					<button class="btn btn-sm btn-secondary" data-action="delete-incident" data-id="${esc(inc.id)}" data-title="${esc(inc.title)}" title="Delete incident" style="color: var(--status-down);">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="3 6 5 6 21 6"/>
							<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
						</svg>
					</button>
				</div>
			</div>
			${monitors}
			<button class="${timelineToggleClass}" data-action="toggle-inc-timeline" data-id="${esc(inc.id)}">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="6 9 12 15 18 9"/>
				</svg>
				<span>${timelineToggleLabel}</span>
			</button>
			${timeline}
		</div>
	`;
}

function renderIncidentTimeline(incidentId, updates) {
	const container = $(`#inc-timeline-${CSS.escape(incidentId)}`);
	if (!container) return;

	if (!updates || updates.length === 0) {
		container.innerHTML = `<p style="color: var(--text-subtle); font-size: 0.875rem;">No timeline updates.</p>`;
		return;
	}

	const sorted = [...updates].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

	container.innerHTML = `
		<div class="timeline-header">
			<h4>Timeline (${sorted.length})</h4>
			<button class="btn btn-sm btn-secondary" data-action="add-inc-update" data-id="${esc(incidentId)}">
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
				<div class="timeline-entry-dot ${u.status}"></div>
				<div class="timeline-entry-content">
					<div class="timeline-entry-head">
						<span class="timeline-entry-status ${u.status}">${u.status}</span>
						<span class="timeline-entry-time">${formatDate(u.created_at)}</span>
					</div>
					<p class="timeline-entry-message">${esc(u.message)}</p>
				</div>
				<div class="timeline-entry-actions">
					<button class="btn-icon" data-action="delete-inc-update" data-incident-id="${esc(incidentId)}" data-update-id="${esc(u.id)}" title="Delete this update">
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

	// Bind timeline events
	container.querySelectorAll('[data-action="add-inc-update"]').forEach((btn) => {
		btn.addEventListener("click", () => openIncidentUpdateModal(btn.dataset.id));
	});
	container.querySelectorAll('[data-action="delete-inc-update"]').forEach((btn) => {
		btn.addEventListener("click", () => {
			confirmDelete("Are you sure you want to delete this timeline update? This cannot be undone.", async () => {
				try {
					await deleteIncidentUpdate(btn.dataset.incidentId, btn.dataset.updateId);
					showToast("Timeline update deleted.");
					await loadAndRenderIncidentTimeline(btn.dataset.incidentId);
					await fetchIncidents();
					renderIncidents();
					if (expandedTimelines.has(btn.dataset.incidentId)) {
						loadAndRenderIncidentTimeline(btn.dataset.incidentId);
					}
				} catch (err) {
					showToast("Delete failed: " + err.message, true);
				}
			});
		});
	});
}

async function loadAndRenderIncidentTimeline(incidentId) {
	try {
		const detail = await fetchIncidentDetail(incidentId);
		renderIncidentTimeline(incidentId, detail.updates || []);
	} catch (err) {
		const container = $(`#inc-timeline-${CSS.escape(incidentId)}`);
		if (container) {
			container.innerHTML = `<p style="color: var(--status-down); font-size: 0.875rem;">Failed to load timeline: ${esc(err.message)}</p>`;
		}
	}
}

// Events

function bindIncidentEvents(container) {
	container.querySelectorAll('[data-action="toggle-inc-timeline"]').forEach((btn) => {
		btn.addEventListener("click", () => {
			const id = btn.dataset.id;
			if (expandedTimelines.has(id)) {
				expandedTimelines.delete(id);
			} else {
				expandedTimelines.add(id);
			}
			renderIncidents();
			if (expandedTimelines.has(id)) {
				loadAndRenderIncidentTimeline(id);
			}
		});
	});

	container.querySelectorAll('[data-action="add-inc-update"]').forEach((btn) => {
		btn.addEventListener("click", () => openIncidentUpdateModal(btn.dataset.id));
	});

	container.querySelectorAll('[data-action="edit-incident"]').forEach((btn) => {
		btn.addEventListener("click", () => openEditIncidentModal(btn.dataset.id));
	});

	container.querySelectorAll('[data-action="delete-incident"]').forEach((btn) => {
		btn.addEventListener("click", () => {
			const title = btn.dataset.title;
			confirmDelete(`Are you sure you want to delete the incident "${title}" and all its timeline updates? This cannot be undone.`, async () => {
				try {
					await deleteIncident(btn.dataset.id);
					expandedTimelines.delete(btn.dataset.id);
					await fetchIncidents();
					renderIncidents();
					showToast("Incident deleted.");
				} catch (err) {
					showToast("Delete failed: " + err.message, true);
				}
			});
		});
	});
}

// Modals

function openCreateIncidentModal() {
	$("#inc-modal-title").textContent = "New Incident";
	$("#edit-incident-id").value = "";
	$("#incident-title").value = "";
	$("#incident-status").value = "investigating";
	$("#incident-severity").value = "major";
	$("#incident-monitors").value = "";
	$("#incident-suppress").checked = true;
	$("#incident-message").value = "";
	$("#inc-initial-message-group").style.display = "";
	$("#btn-save-incident span").textContent = "Create Incident";
	$("#incident-status").disabled = false;
	openModal("incidentModal");
}

function openEditIncidentModal(id) {
	const inc = incidents.find((i) => i.id === id);
	if (!inc) return;

	$("#inc-modal-title").textContent = "Edit Incident";
	$("#edit-incident-id").value = id;
	$("#incident-title").value = inc.title;
	$("#incident-severity").value = inc.severity;
	$("#incident-monitors").value = (inc.affected_monitors || []).join(", ");
	$("#incident-suppress").checked = inc.suppress_notifications !== false;
	$("#incident-status").value = inc.status;
	$("#incident-status").disabled = true;
	$("#inc-initial-message-group").style.display = "none";
	$("#incident-message").value = "";
	$("#btn-save-incident span").textContent = "Save Changes";
	openModal("incidentModal");
}

async function saveIncident() {
	const id = $("#edit-incident-id").value;
	const isEdit = !!id;

	const title = $("#incident-title").value.trim();
	const severity = $("#incident-severity").value;
	const monitorsRaw = $("#incident-monitors").value.trim();
	const suppress_notifications = $("#incident-suppress").checked;
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

	setLoading("btn-save-incident", true);

	try {
		if (isEdit) {
			await updateIncident(id, { title, severity, affected_monitors, suppress_notifications });
			showToast("Incident updated.");
		} else {
			const status = $("#incident-status").value;
			const message = $("#incident-message").value.trim();
			if (!message) {
				showToast("Initial message is required.", true);
				setLoading("btn-save-incident", false);
				return;
			}
			await createIncident({
				status_page_id: credentials.statusPageId,
				title,
				status,
				severity,
				message,
				affected_monitors: affected_monitors.length > 0 ? affected_monitors : undefined,
				suppress_notifications,
			});
			showToast("Incident created.");
		}

		closeModal("incidentModal");
		await fetchIncidents();
		renderIncidents();
	} catch (err) {
		showToast((isEdit ? "Update" : "Create") + " failed: " + err.message, true);
	} finally {
		setLoading("btn-save-incident", false);
	}
}

function openIncidentUpdateModal(incidentId) {
	const inc = incidents.find((i) => i.id === incidentId);
	$("#inc-update-incident-id").value = incidentId;
	if (inc) {
		const statusFlow = { investigating: "identified", identified: "monitoring", monitoring: "resolved", resolved: "resolved" };
		$("#inc-update-status").value = statusFlow[inc.status] || inc.status;
	}
	$("#inc-update-message").value = "";
	openModal("incidentUpdateModal");
}

async function saveIncidentUpdate() {
	const incidentId = $("#inc-update-incident-id").value;
	const status = $("#inc-update-status").value;
	const message = $("#inc-update-message").value.trim();

	if (!message) {
		showToast("Message is required.", true);
		return;
	}

	setLoading("btn-save-inc-update", true);

	try {
		await addIncidentUpdate(incidentId, { status, message });
		closeModal("incidentUpdateModal");
		showToast("Timeline update added.");
		await fetchIncidents();
		renderIncidents();
		if (expandedTimelines.has(incidentId)) {
			loadAndRenderIncidentTimeline(incidentId);
		}
	} catch (err) {
		showToast("Failed to add update: " + err.message, true);
	} finally {
		setLoading("btn-save-inc-update", false);
	}
}

// Init

export function initIncidentEvents() {
	$("#btn-new-incident").addEventListener("click", openCreateIncidentModal);
	$("#btn-refresh-incidents").addEventListener("click", refreshIncidents);
	$("#filter-incident-status").addEventListener("change", renderIncidents);
	$("#filter-incident-severity").addEventListener("change", renderIncidents);

	$("#btn-close-inc-modal").addEventListener("click", () => closeModal("incidentModal"));
	$("#btn-cancel-inc-modal").addEventListener("click", () => closeModal("incidentModal"));
	$("#btn-save-incident").addEventListener("click", saveIncident);

	$("#btn-close-inc-update-modal").addEventListener("click", () => closeModal("incidentUpdateModal"));
	$("#btn-cancel-inc-update-modal").addEventListener("click", () => closeModal("incidentUpdateModal"));
	$("#btn-save-inc-update").addEventListener("click", saveIncidentUpdate);
}
