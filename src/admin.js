import {
	$,
	$$,
	credentials,
	showToast,
	setLoading,
	apiRequest,
	saveCredentials,
	loadSavedCredentials,
	clearSavedCredentials,
	getSavedCredentials,
	setCredentials,
	updateConnectionBadge,
	closeModal,
	executeDelete,
} from "./admin-shared.js";

import { fetchIncidents, renderIncidents, initIncidentEvents } from "./admin-incidents.js";
import { fetchMaintenances, renderMaintenances, initMaintenanceEvents } from "./admin-maintenances.js";

// Connection

async function connect() {
	const url = $("#server-url").value.trim();
	const token = $("#admin-token").value.trim();
	const spId = $("#status-page-id").value.trim();

	if (!url || !token || !spId) {
		showToast("Please fill in all connection fields.", true);
		return;
	}

	setCredentials(url, token, spId);
	setLoading("btn-connect", true);

	try {
		await apiRequest("GET", `/v1/admin/incidents?status_page_id=${encodeURIComponent(credentials.statusPageId)}`);
		saveCredentials();
		updateConnectionBadge(true);
		showConnectedUI();
		await loadAllData();
		showToast(`Connected to status page "${spId}".`);
	} catch (err) {
		updateConnectionBadge(false);
		showToast("Connection failed: " + err.message, true);
	} finally {
		setLoading("btn-connect", false);
	}
}

function disconnect() {
	clearSavedCredentials();
	setCredentials("", "", "");
	$("#server-url").value = "";
	$("#admin-token").value = "";
	$("#status-page-id").value = "";
	updateConnectionBadge(false);
	showDisconnectedUI();
	showToast("Disconnected. Credentials cleared.");
}

function showConnectedUI() {
	$("#connection-card").style.display = "none";
	$("#admin-panel").style.display = "block";
	$("#connected-sp-id").textContent = credentials.statusPageId;
}

function showDisconnectedUI() {
	$("#admin-panel").style.display = "none";
	$("#connection-card").style.display = "";
}

async function loadAllData() {
	try {
		await fetchIncidents();
		renderIncidents();
	} catch (err) {
		console.error("Failed to load incidents:", err);
	}
	try {
		await fetchMaintenances();
		renderMaintenances();
	} catch (err) {
		console.error("Failed to load maintenances:", err);
	}
}

// Auto-connect

async function tryAutoConnect() {
	const saved = getSavedCredentials();
	if (!saved || !saved.url || !saved.token || !saved.statusPageId) return;

	$("#server-url").value = saved.url;
	$("#admin-token").value = saved.token;
	$("#status-page-id").value = saved.statusPageId;
	setCredentials(saved.url, saved.token, saved.statusPageId);

	try {
		await apiRequest("GET", `/v1/admin/incidents?status_page_id=${encodeURIComponent(credentials.statusPageId)}`);
		updateConnectionBadge(true);
		showConnectedUI();
		await loadAllData();
	} catch {
		updateConnectionBadge(false);
		showDisconnectedUI();
	}
}

// Tabs

function switchTab(tab) {
	$$(".admin-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
	$$(".admin-tab-panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${tab}`));
}

// Init

// Connection
$("#btn-connect").addEventListener("click", connect);

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

// Disconnect
$("#btn-disconnect").addEventListener("click", disconnect);

// Tabs
$$(".admin-tab").forEach((tab) => {
	tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

// Confirm modal (shared)
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

// Init module-specific event listeners
initIncidentEvents();
initMaintenanceEvents();

// Load saved credentials and try auto-connect
loadSavedCredentials();
tryAutoConnect();
