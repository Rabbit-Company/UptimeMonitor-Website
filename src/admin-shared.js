export let credentials = { url: "", token: "", statusPageId: "" };
let pendingDeleteCallback = null;

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => document.querySelectorAll(sel);

// Helpers

export function esc(str) {
	if (typeof str !== "string") return str;
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function showToast(msg, error = false) {
	const t = $("#toast");
	t.textContent = msg;
	t.className = "toast" + (error ? " error" : "");
	requestAnimationFrame(() => t.classList.add("show"));
	setTimeout(() => t.classList.remove("show"), 5000);
}

export function formatDate(iso) {
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

export function relativeTime(iso) {
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

export function setLoading(btnId, loading) {
	const btn = typeof btnId === "string" ? $(`#${btnId}`) : btnId;
	if (!btn) return;
	btn.classList.toggle("loading", loading);
}

// API

export async function apiRequest(method, path, body = null) {
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

// Credentials

const CRED_KEY = "admin-credentials";

export function saveCredentials() {
	localStorage.setItem(
		CRED_KEY,
		JSON.stringify({
			url: credentials.url,
			token: credentials.token,
			statusPageId: credentials.statusPageId,
		}),
	);
}

export function loadSavedCredentials() {
	try {
		const saved = JSON.parse(localStorage.getItem(CRED_KEY));
		if (saved) {
			$("#server-url").value = saved.url || "";
			$("#admin-token").value = saved.token || "";
			$("#status-page-id").value = saved.statusPageId || "";
		}
	} catch {}
}

export function clearSavedCredentials() {
	localStorage.removeItem(CRED_KEY);
}

export function getSavedCredentials() {
	try {
		return JSON.parse(localStorage.getItem(CRED_KEY));
	} catch {
		return null;
	}
}

// Connection

export function setCredentials(url, token, statusPageId) {
	credentials.url = url;
	credentials.token = token;
	credentials.statusPageId = statusPageId;
}

export function updateConnectionBadge(connected) {
	const badge = $("#connection-status");
	badge.textContent = connected ? "Connected" : "Disconnected";
	badge.className = "badge " + (connected ? "badge-connected" : "badge-disconnected");
}

// Modals

export function openModal(id) {
	$(`#${id}`).classList.add("open");
}

export function closeModal(id) {
	$(`#${id}`).classList.remove("open");
}

export function confirmDelete(message, callback) {
	$("#confirm-message").textContent = message;
	pendingDeleteCallback = callback;
	openModal("confirmModal");
}

export async function executeDelete() {
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
