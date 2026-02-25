let credentials = { url: "", token: "", statusPageId: "" };
let incidents = [];
let expandedTimelines = new Set();
let pendingDeleteCallback = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function esc(str) {
	if (typeof str !== "string") return str;
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function showToast(msg, error = false) {
	const t = $("#toast");
	t.textContent = msg;
	t.className = "toast" + (error ? " error" : "");
	requestAnimationFrame(() => t.classList.add("show"));
	setTimeout(() => t.classList.remove("show"), 5000);
}

function formatDate(iso) {
	if (!iso) return "—";
	const d = new Date(iso);
	return d.toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function relativeTime(iso) {
	if (!iso) return "";
	const diff = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	return `${days}d ago`;
}

function setLoading(btnId, loading) {
	const btn = typeof btnId === "string" ? $(`#${btnId}`) : btnId;
	if (!btn) return;
	btn.classList.toggle("loading", loading);
}

async function apiRequest(method, path, body = null) {
	const url = credentials.url.replace(/\/+$/, "") + path;
	const headers = {
		Authorization: `Bearer ${credentials.token}`,
	};
	if (body !== null) {
		headers["Content-Type"] = "application/json";
	}
	const res = await fetch(url, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});

	if (!res.ok) {
		const errBody = await res.json().catch(() => ({}));
		const detail = errBody.details ? (Array.isArray(errBody.details) ? errBody.details.join(", ") : errBody.details) : errBody.error || `HTTP ${res.status}`;
		throw new Error(detail);
	}

	return res.json();
}

async function fetchIncidents() {
	const data = await apiRequest("GET", `/v1/admin/incidents?status_page_id=${encodeURIComponent(credentials.statusPageId)}`);
	return data.incidents || [];
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

async function addTimelineUpdate(incidentId, payload) {
	return await apiRequest("POST", `/v1/admin/incidents/${encodeURIComponent(incidentId)}/updates`, payload);
}

async function deleteTimelineUpdate(incidentId, updateId) {
	return await apiRequest("DELETE", `/v1/admin/incidents/${encodeURIComponent(incidentId)}/updates/${encodeURIComponent(updateId)}`);
}

//  Credential Persistence

function saveCredentials() {
	if ($("#remember-credentials").checked) {
		localStorage.setItem(
			"incident-mgr-creds",
			JSON.stringify({
				url: credentials.url,
				token: credentials.token,
				statusPageId: credentials.statusPageId,
			}),
		);
	}
}

function loadSavedCredentials() {
	try {
		const saved = JSON.parse(localStorage.getItem("incident-mgr-creds"));
		if (saved) {
			$("#server-url").value = saved.url || "";
			$("#admin-token").value = saved.token || "";
			$("#status-page-id").value = saved.statusPageId || "";
		}
	} catch {
		/* ignore */
	}
}

function clearSavedCredentials() {
	localStorage.removeItem("incident-mgr-creds");
}

//  Connection

async function connect() {
	const url = $("#server-url").value.trim();
	const token = $("#admin-token").value.trim();
	const spId = $("#status-page-id").value.trim();

	if (!url || !token || !spId) {
		showToast("Please fill in all connection fields.", true);
		return;
	}

	credentials = { url, token, statusPageId: spId };
	setLoading("btn-connect", true);

	try {
		incidents = await fetchIncidents();
		saveCredentials();
		updateConnectionBadge(true);
		$("#incidents-panel").style.display = "block";
		renderIncidents();
		showToast(`Connected! Found ${incidents.length} incident(s).`);
	} catch (err) {
		updateConnectionBadge(false);
		showToast("Connection failed: " + err.message, true);
	} finally {
		setLoading("btn-connect", false);
	}
}

function updateConnectionBadge(connected) {
	const badge = $("#connection-status");
	badge.textContent = connected ? "Connected" : "Disconnected";
	badge.className = "badge " + (connected ? "badge-connected" : "badge-disconnected");
}

//  Refresh

async function refresh() {
	setLoading("btn-refresh", true);
	try {
		incidents = await fetchIncidents();
		renderIncidents();
		showToast("Incidents refreshed.");
	} catch (err) {
		showToast("Refresh failed: " + err.message, true);
	} finally {
		setLoading("btn-refresh", false);
	}
}

//  Render Incidents

function getFilteredIncidents() {
	const statusFilter = $("#filter-status").value;
	const severityFilter = $("#filter-severity").value;
	let filtered = [...incidents];

	if (statusFilter) {
		filtered = filtered.filter((i) => i.status === statusFilter);
	}
	if (severityFilter) {
		filtered = filtered.filter((i) => i.severity === severityFilter);
	}

	// Sort: active first (by updated_at desc), resolved last
	filtered.sort((a, b) => {
		const aResolved = a.status === "resolved" ? 1 : 0;
		const bResolved = b.status === "resolved" ? 1 : 0;
		if (aResolved !== bResolved) return aResolved - bResolved;
		return new Date(b.updated_at) - new Date(a.updated_at);
	});

	return filtered;
}

function renderIncidents() {
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
				<button class="btn btn-primary" onclick="openCreateModal()">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10"/>
						<line x1="12" y1="8" x2="12" y2="16"/>
						<line x1="8" y1="12" x2="16" y2="12"/>
					</svg>
					Create First Incident
				</button>
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
			? `<div class="incident-monitors">${inc.affected_monitors.map((m) => `<span class="monitor-tag">${esc(m)}</span>`).join("")}</div>`
			: "";

	// We don't have updates in the list response (Incident vs IncidentWithUpdates),
	// so we render a placeholder that loads on expand.
	const timeline = isExpanded
		? `<div class="incident-timeline" id="timeline-${esc(inc.id)}"><div style="text-align:center; padding: 16px; color: var(--text-subtle);">Loading timeline...</div></div>`
		: "";

	const timelineToggleLabel = isExpanded ? "Hide Timeline" : "Show Timeline";
	const timelineToggleClass = isExpanded ? "timeline-toggle open" : "timeline-toggle";

	return `
		<div class="incident-card" data-incident-id="${esc(inc.id)}">
			<div class="incident-card-header">
				<div class="incident-card-info">
					<h3>${esc(inc.title)}</h3>
					<div class="incident-meta">
						<span class="status-badge status-${inc.status}">${inc.status}</span>
						<span class="severity-badge severity-${inc.severity}">${inc.severity}</span>
						<span class="incident-meta-text">Created ${formatDate(inc.created_at)}</span>
						${inc.resolved_at ? `<span class="incident-meta-text">· Resolved ${formatDate(inc.resolved_at)}</span>` : `<span class="incident-meta-text">· Updated ${relativeTime(inc.updated_at)}</span>`}
					</div>
				</div>
				<div class="config-card-actions">
					<button class="btn btn-sm btn-secondary" data-action="add-update" data-id="${esc(inc.id)}" title="Add timeline update">
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
			<button class="${timelineToggleClass}" data-action="toggle-timeline" data-id="${esc(inc.id)}">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="6 9 12 15 18 9"/>
				</svg>
				<span>${timelineToggleLabel}</span>
			</button>
			${timeline}
		</div>
	`;
}

function renderTimeline(incidentId, updates) {
	const container = $(`#timeline-${CSS.escape(incidentId)}`);
	if (!container) return;

	if (!updates || updates.length === 0) {
		container.innerHTML = `<p style="color: var(--text-subtle); font-size: 0.875rem;">No timeline updates.</p>`;
		return;
	}

	// Show newest first
	const sorted = [...updates].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

	container.innerHTML = `
		<div class="timeline-header">
			<h4>Timeline (${sorted.length})</h4>
			<button class="btn btn-sm btn-secondary" data-action="add-update" data-id="${esc(incidentId)}">
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
					<button class="btn-icon" data-action="delete-update" data-incident-id="${esc(incidentId)}" data-update-id="${esc(u.id)}" title="Delete this update">
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
	container.querySelectorAll('[data-action="add-update"]').forEach((btn) => {
		btn.addEventListener("click", () => openUpdateModal(btn.dataset.id));
	});
	container.querySelectorAll('[data-action="delete-update"]').forEach((btn) => {
		btn.addEventListener("click", () => {
			confirmDelete("Are you sure you want to delete this timeline update? This cannot be undone.", async () => {
				try {
					await deleteTimelineUpdate(btn.dataset.incidentId, btn.dataset.updateId);
					showToast("Timeline update deleted.");
					await loadAndRenderTimeline(btn.dataset.incidentId);
					// Refresh incident list to get updated status
					incidents = await fetchIncidents();
					// Re-render but keep timeline expanded
					renderIncidents();
					if (expandedTimelines.has(btn.dataset.incidentId)) {
						loadAndRenderTimeline(btn.dataset.incidentId);
					}
				} catch (err) {
					showToast("Delete failed: " + err.message, true);
				}
			});
		});
	});
}

async function loadAndRenderTimeline(incidentId) {
	try {
		const detail = await fetchIncidentDetail(incidentId);
		renderTimeline(incidentId, detail.updates || []);
	} catch (err) {
		const container = $(`#timeline-${CSS.escape(incidentId)}`);
		if (container) {
			container.innerHTML = `<p style="color: var(--status-down); font-size: 0.875rem;">Failed to load timeline: ${esc(err.message)}</p>`;
		}
	}
}

function bindIncidentEvents(container) {
	// Toggle timeline
	container.querySelectorAll('[data-action="toggle-timeline"]').forEach((btn) => {
		btn.addEventListener("click", () => {
			const id = btn.dataset.id;
			if (expandedTimelines.has(id)) {
				expandedTimelines.delete(id);
			} else {
				expandedTimelines.add(id);
			}
			renderIncidents();
			// Load timeline data if expanded
			if (expandedTimelines.has(id)) {
				loadAndRenderTimeline(id);
			}
		});
	});

	// Add update
	container.querySelectorAll('[data-action="add-update"]').forEach((btn) => {
		btn.addEventListener("click", () => openUpdateModal(btn.dataset.id));
	});

	// Edit incident
	container.querySelectorAll('[data-action="edit-incident"]').forEach((btn) => {
		btn.addEventListener("click", () => openEditModal(btn.dataset.id));
	});

	// Delete incident
	container.querySelectorAll('[data-action="delete-incident"]').forEach((btn) => {
		btn.addEventListener("click", () => {
			const title = btn.dataset.title;
			confirmDelete(`Are you sure you want to delete the incident "${title}" and all its timeline updates? This cannot be undone.`, async () => {
				try {
					await deleteIncident(btn.dataset.id);
					expandedTimelines.delete(btn.dataset.id);
					incidents = await fetchIncidents();
					renderIncidents();
					showToast("Incident deleted.");
				} catch (err) {
					showToast("Delete failed: " + err.message, true);
				}
			});
		});
	});
}

function openModal(id) {
	$(`#${id}`).classList.add("open");
}

function closeModal(id) {
	$(`#${id}`).classList.remove("open");
}

// Create modal
function openCreateModal() {
	$("#modal-title").textContent = "New Incident";
	$("#edit-incident-id").value = "";
	$("#incident-title").value = "";
	$("#incident-status").value = "investigating";
	$("#incident-severity").value = "major";
	$("#incident-monitors").value = "";
	$("#incident-message").value = "";
	$("#initial-message-group").style.display = "";
	$("#btn-save-incident span").textContent = "Create Incident";
	// Enable status field for creation
	$("#incident-status").disabled = false;
	openModal("incidentModal");
}

// Edit modal (metadata only, no status change via PUT)
async function openEditModal(id) {
	const inc = incidents.find((i) => i.id === id);
	if (!inc) return;

	$("#modal-title").textContent = "Edit Incident";
	$("#edit-incident-id").value = id;
	$("#incident-title").value = inc.title;
	$("#incident-severity").value = inc.severity;
	$("#incident-monitors").value = (inc.affected_monitors || []).join(", ");
	// Status can't be changed via PUT, only via timeline updates
	$("#incident-status").value = inc.status;
	$("#incident-status").disabled = true;
	// Hide initial message for edits
	$("#initial-message-group").style.display = "none";
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
			const payload = { title, severity, affected_monitors };
			await updateIncident(id, payload);
			showToast("Incident updated.");
		} else {
			const status = $("#incident-status").value;
			const message = $("#incident-message").value.trim();
			if (!message) {
				showToast("Initial message is required.", true);
				setLoading("btn-save-incident", false);
				return;
			}
			const payload = {
				status_page_id: credentials.statusPageId,
				title,
				status,
				severity,
				message,
				affected_monitors: affected_monitors.length > 0 ? affected_monitors : undefined,
			};
			await createIncident(payload);
			showToast("Incident created.");
		}

		closeModal("incidentModal");
		incidents = await fetchIncidents();
		renderIncidents();
	} catch (err) {
		showToast((isEdit ? "Update" : "Create") + " failed: " + err.message, true);
	} finally {
		setLoading("btn-save-incident", false);
	}
}

// Timeline update modal
function openUpdateModal(incidentId) {
	const inc = incidents.find((i) => i.id === incidentId);
	$("#update-incident-id").value = incidentId;
	// Pre-select current status or next logical step
	if (inc) {
		const statusFlow = { investigating: "identified", identified: "monitoring", monitoring: "resolved", resolved: "resolved" };
		$("#update-status").value = statusFlow[inc.status] || inc.status;
	}
	$("#update-message").value = "";
	openModal("updateModal");
}

async function saveUpdate() {
	const incidentId = $("#update-incident-id").value;
	const status = $("#update-status").value;
	const message = $("#update-message").value.trim();

	if (!message) {
		showToast("Message is required.", true);
		return;
	}

	setLoading("btn-save-update", true);

	try {
		await addTimelineUpdate(incidentId, { status, message });
		closeModal("updateModal");
		showToast("Timeline update added.");
		incidents = await fetchIncidents();
		renderIncidents();
		// Re-expand and reload timeline if it was open
		if (expandedTimelines.has(incidentId)) {
			loadAndRenderTimeline(incidentId);
		}
	} catch (err) {
		showToast("Failed to add update: " + err.message, true);
	} finally {
		setLoading("btn-save-update", false);
	}
}

// Confirm delete modal
function confirmDelete(message, callback) {
	$("#confirm-message").textContent = message;
	pendingDeleteCallback = callback;
	openModal("confirmModal");
}

async function executeDelete() {
	if (!pendingDeleteCallback) return;
	setLoading("btn-confirm-delete", true);
	try {
		await pendingDeleteCallback();
	} finally {
		pendingDeleteCallback = null;
		setLoading("btn-confirm-delete", false);
		closeModal("confirmModal");
	}
}

// Connect
$("#btn-connect").addEventListener("click", connect);

// Also connect on Enter in any connection input
["server-url", "admin-token", "status-page-id"].forEach((id) => {
	$(`#${id}`).addEventListener("keydown", (e) => {
		if (e.key === "Enter") connect();
	});
});

// Token visibility toggle
$("#toggle-token").addEventListener("click", () => {
	const input = $("#admin-token");
	input.type = input.type === "password" ? "text" : "password";
});

// New incident
$("#btn-new-incident").addEventListener("click", openCreateModal);

// Refresh
$("#btn-refresh").addEventListener("click", refresh);

// Filters
$("#filter-status").addEventListener("change", renderIncidents);
$("#filter-severity").addEventListener("change", renderIncidents);

// Incident modal
$("#btn-close-modal").addEventListener("click", () => closeModal("incidentModal"));
$("#btn-cancel-modal").addEventListener("click", () => closeModal("incidentModal"));
$("#btn-save-incident").addEventListener("click", saveIncident);

// Update modal
$("#btn-close-update-modal").addEventListener("click", () => closeModal("updateModal"));
$("#btn-cancel-update-modal").addEventListener("click", () => closeModal("updateModal"));
$("#btn-save-update").addEventListener("click", saveUpdate);

// Confirm modal
$("#btn-close-confirm").addEventListener("click", () => closeModal("confirmModal"));
$("#btn-cancel-confirm").addEventListener("click", () => closeModal("confirmModal"));
$("#btn-confirm-delete").addEventListener("click", executeDelete);

// Close modals on overlay click
$$(".modal-overlay").forEach((overlay) => {
	overlay.addEventListener("click", (e) => {
		if (e.target === overlay) overlay.classList.remove("open");
	});
});

// Close modals on Escape
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") {
		$$(".modal-overlay.open").forEach((m) => m.classList.remove("open"));
	}
});

// Header scroll effect
window.addEventListener("scroll", () => {
	$("#header").classList.toggle("scrolled", window.pageYOffset > 50);
});

// Mobile menu
document.getElementById("mobileMenuBtn")?.addEventListener("click", () => {
	document.getElementById("mobileMenu").classList.toggle("active");
});

// Remember checkbox
$("#remember-credentials").addEventListener("change", (e) => {
	if (!e.target.checked) {
		clearSavedCredentials();
	}
});

loadSavedCredentials();
