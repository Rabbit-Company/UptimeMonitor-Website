import PasswordGenerator from "@rabbit-company/password-generator";
import TOML from "smol-toml";

let config = {
	clickhouse: { url: "" },
	server: {},
	logger: {},
	missingPulseDetector: {},
	selfMonitoring: {},
	monitors: [],
	groups: [],
	status_pages: [],
	notifications: { channels: {} },
	PulseMonitors: [],
};

function uid() {
	return crypto.randomUUID();
}

function token() {
	return PasswordGenerator.generate(50, true, true, false);
}

function esc(str) {
	if (typeof str !== "string") return str;
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function updateCardTitle(input) {
	const card = input.closest(".config-card");
	if (card) {
		const h3 = card.querySelector(".config-card-title h3");
		if (h3) h3.textContent = input.value || "Unnamed";
	}
}

function resolvePath(path) {
	const parts = path.split(".");
	let cur = config;
	for (let i = 0; i < parts.length - 1; i++) {
		const k = parts[i];
		if (cur[k] === undefined) cur[k] = {};
		cur = cur[k];
	}
	return { parent: cur, key: parts[parts.length - 1] };
}

function ensurePath(path) {
	const parts = path.split(".");
	let cur = config;
	for (const k of parts) {
		if (cur[k] === undefined) cur[k] = {};
		cur = cur[k];
	}
}

function showToast(msg, error = false) {
	const t = document.getElementById("toast");
	t.textContent = msg;
	t.className = "toast" + (error ? " error" : "");
	requestAnimationFrame(() => t.classList.add("show"));
	setTimeout(() => t.classList.remove("show"), 3000);
}

document.getElementById("tabs").addEventListener("click", (e) => {
	const tab = e.target.closest(".tab");
	if (!tab) return;
	document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
	document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
	tab.classList.add("active");
	document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
});

window.addEventListener("scroll", () => {
	document.getElementById("header").classList.toggle("scrolled", window.pageYOffset > 50);
});

document.getElementById("mobileMenuBtn")?.addEventListener("click", () => {
	document.getElementById("mobileMenu").classList.toggle("active");
});

document.getElementById("fileInput").addEventListener("change", async (e) => {
	const file = e.target.files[0];
	if (!file) return;
	try {
		const text = await file.text();
		parseTOML(text);
		showToast("Configuration imported successfully!");
	} catch (err) {
		showToast("Failed to parse TOML: " + err.message, true);
	}
	e.target.value = "";
});

function parseTOML(text) {
	config = TOML.parse(text);
	if (!config.monitors) config.monitors = [];
	if (!config.groups) config.groups = [];
	if (!config.status_pages) config.status_pages = [];
	if (!config.notifications) config.notifications = { channels: {} };
	if (!config.notifications.channels) config.notifications.channels = {};
	if (!config.PulseMonitors) config.PulseMonitors = [];
	loadConfigToUI();
}

function loadConfigToUI() {
	document.getElementById("ch-url").value = config.clickhouse?.url || "";
	document.getElementById("srv-port").value = config.server?.port || "";
	document.getElementById("srv-proxy").value = config.server?.proxy || "";
	document.getElementById("srv-reloadToken").value = config.server?.reloadToken || "";
	document.getElementById("log-level").value = config.logger?.level ?? "";
	document.getElementById("mpd-interval").value = config.missingPulseDetector?.interval || "";
	document.getElementById("sm-enabled").checked = config.selfMonitoring?.enabled || false;
	document.getElementById("sm-id").value = config.selfMonitoring?.id || "";
	document.getElementById("sm-interval").value = config.selfMonitoring?.interval || "";
	document.getElementById("sm-backfill").checked = config.selfMonitoring?.backfillOnRecovery || false;
	document.getElementById("sm-latencyStrategy").value = config.selfMonitoring?.latencyStrategy || "last-known";

	renderMonitors();
	renderGroups();
	renderStatusPages();
	renderNotifications();
	renderPulseMonitors();
	updateBadges();
}

function updateBadges() {
	document.getElementById("badge-monitors").textContent = config.monitors.length;
	document.getElementById("badge-groups").textContent = config.groups.length;
	document.getElementById("badge-statuspages").textContent = config.status_pages.length;
	document.getElementById("badge-notifications").textContent = Object.keys(config.notifications?.channels || {}).length;
	document.getElementById("badge-pulsemonitors").textContent = config.PulseMonitors.length;
}

function readGeneralFromUI() {
	const url = document.getElementById("ch-url").value.trim();
	config.clickhouse = { url };

	const port = document.getElementById("srv-port").value;
	const proxy = document.getElementById("srv-proxy").value;
	const reloadToken = document.getElementById("srv-reloadToken").value.trim();
	config.server = {};
	if (port) config.server.port = Number(port);
	if (proxy) config.server.proxy = proxy;
	if (reloadToken) config.server.reloadToken = reloadToken;

	const logLevel = document.getElementById("log-level").value;
	config.logger = {};
	if (logLevel !== "") config.logger.level = Number(logLevel);

	const mpdInterval = document.getElementById("mpd-interval").value;
	config.missingPulseDetector = {};
	if (mpdInterval) config.missingPulseDetector.interval = Number(mpdInterval);

	const smEnabled = document.getElementById("sm-enabled").checked;
	const smId = document.getElementById("sm-id").value.trim();
	const smInterval = document.getElementById("sm-interval").value;
	const smBackfill = document.getElementById("sm-backfill").checked;
	const smStrategy = document.getElementById("sm-latencyStrategy").value;
	config.selfMonitoring = {};
	if (smEnabled) config.selfMonitoring.enabled = true;
	if (smId) config.selfMonitoring.id = smId;
	if (smInterval) config.selfMonitoring.interval = Number(smInterval);
	if (smBackfill) config.selfMonitoring.backfillOnRecovery = true;
	if (smStrategy && smStrategy !== "last-known") config.selfMonitoring.latencyStrategy = smStrategy;
	else if (smEnabled) config.selfMonitoring.latencyStrategy = smStrategy;
}

function addMonitor() {
	config.monitors.push({
		id: uid(),
		name: "",
		token: token(),
		interval: 30,
		maxRetries: 0,
		resendNotification: 0,
	});
	renderMonitors();
	updateBadges();
}

function removeMonitor(idx) {
	config.monitors.splice(idx, 1);
	renderMonitors();
	updateBadges();
}

function renderMonitors() {
	const container = document.getElementById("monitors-list");
	if (config.monitors.length === 0) {
		container.innerHTML = `
<div class="empty-state">
<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
<h3>No Monitors</h3>
<p>Add monitors to track your services.</p>
</div>`;
		return;
	}
	container.innerHTML = config.monitors.map((m, i) => renderMonitorCard(m, i)).join("");
	bindCollapsibles(container);
	bindDynamicEvents(container);
}

function renderMonitorCard(m, idx) {
	const groupOptions = config.groups.map((g) => `<option value="${g.id}" ${m.groupId === g.id ? "selected" : ""}>${g.name || g.id}</option>`).join("");
	const pulseProtocols = ["http", "ws", "tcp", "udp", "icmp", "smtp", "imap", "mysql", "mssql", "postgresql", "redis"];
	const currentProtocol = m.pulse ? Object.keys(m.pulse)[0] || "" : "";

	return `
<div class="config-card" data-monitor-idx="${idx}">
<div class="config-card-header">
<div class="config-card-title">
<h3>${m.name || "Unnamed Monitor"}</h3>
<span class="badge mono">${m.id || ""}</span>
</div>
<div class="config-card-actions">
<button class="btn-icon danger" data-action="remove-monitor" data-idx="${idx}" title="Delete">
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
</button>
</div>
</div>
<div class="form-grid">
<div class="form-group">
<label class="form-label">ID <span class="required">*</span></label>
<input class="form-input mono" type="text" value="${m.id || ""}" data-bind="monitors.${idx}.id" data-rerender="monitors" />
</div>
<div class="form-group">
<label class="form-label">Name <span class="required">*</span></label>
<input class="form-input" type="text" value="${esc(m.name || "")}" data-bind="monitors.${idx}.name" data-update-title />
</div>
<div class="form-group">
<label class="form-label">Token <span class="required">*</span></label>
<input class="form-input mono" type="text" value="${esc(m.token || "")}" data-bind="monitors.${idx}.token" />
</div>
<div class="form-group">
<label class="form-label">Interval (seconds) <span class="required">*</span></label>
<input class="form-input" type="number" value="${m.interval ?? ""}" min="1" data-bind="monitors.${idx}.interval" data-type="number" />
</div>
<div class="form-group">
<label class="form-label">Max Retries <span class="required">*</span></label>
<input class="form-input" type="number" value="${m.maxRetries ?? ""}" min="0" data-bind="monitors.${idx}.maxRetries" data-type="number" />
<span class="form-hint">0 = mark down immediately</span>
</div>
<div class="form-group">
<label class="form-label">Resend Notification <span class="required">*</span></label>
<input class="form-input" type="number" value="${m.resendNotification ?? ""}" min="0" data-bind="monitors.${idx}.resendNotification" data-type="number" />
<span class="form-hint">0 = never resend</span>
</div>
<div class="form-group">
<label class="form-label">Group</label>
<select class="form-select" data-bind="monitors.${idx}.groupId" data-empty-undefined>
	<option value="">None</option>
	${groupOptions}
</select>
</div>
<div class="form-group">
<label class="form-label">Notification Channels</label>
${renderTagsInput(`mon-nc-${idx}`, m.notificationChannels || [], "monitors", idx, "notificationChannels")}
</div>
<div class="form-group">
<label class="form-label">PulseMonitor Agents</label>
${renderTagsInput(`mon-pm-${idx}`, m.pulseMonitors || [], "monitors", idx, "pulseMonitors")}
</div>
</div>

<!-- Custom Metrics -->
<button class="collapsible-trigger" type="button">
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
Custom Metrics
</button>
<div class="collapsible-content">
${[1, 2, 3]
	.map((n) => {
		const cm = m[`custom${n}`] || {};
		return `
<div class="form-section-title">Custom Metric ${n}</div>
<div class="form-grid">
	<div class="form-group">
		<label class="form-label">ID</label>
		<input class="form-input mono" type="text" value="${esc(cm.id || "")}" data-bind="monitors.${idx}.custom${n}.id" data-ensure="monitors.${idx}.custom${n}" />
	</div>
	<div class="form-group">
		<label class="form-label">Name</label>
		<input class="form-input" type="text" value="${esc(cm.name || "")}" data-bind="monitors.${idx}.custom${n}.name" data-ensure="monitors.${idx}.custom${n}" />
	</div>
	<div class="form-group">
		<label class="form-label">Unit</label>
		<input class="form-input" type="text" value="${esc(cm.unit || "")}" data-bind="monitors.${idx}.custom${n}.unit" data-ensure="monitors.${idx}.custom${n}" placeholder="e.g. MB, %, conn" />
	</div>
</div>`;
	})
	.join("")}
</div>

<!-- Pulse Configuration -->
<button class="collapsible-trigger" type="button">
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
Pulse Configuration (PulseMonitor)
</button>
<div class="collapsible-content">
<div class="form-grid">
<div class="form-group">
	<label class="form-label">Protocol</label>
	<select class="form-select" data-action="set-pulse-protocol" data-idx="${idx}">
		<option value="">None</option>
		${pulseProtocols.map((p) => `<option value="${p}" ${currentProtocol === p ? "selected" : ""}>${p.toUpperCase()}</option>`).join("")}
	</select>
</div>
</div>
<div id="pulse-fields-${idx}">
${renderPulseFields(idx, m.pulse)}
</div>
</div>
</div>`;
}

function setPulseProtocol(idx, protocol) {
	if (!protocol) {
		delete config.monitors[idx].pulse;
	} else {
		config.monitors[idx].pulse = { [protocol]: {} };
	}
	const container = document.getElementById(`pulse-fields-${idx}`);
	container.innerHTML = renderPulseFields(idx, config.monitors[idx].pulse);
	bindDynamicEvents(container);
}

function renderPulseFields(idx, pulse) {
	if (!pulse) return "";
	const proto = Object.keys(pulse)[0];
	if (!proto) return "";
	const p = pulse[proto] || {};

	const fields = {
		http: [
			{ key: "method", label: "Method", type: "select", options: ["GET", "POST", "HEAD"], val: p.method },
			{ key: "url", label: "URL", type: "text", val: p.url, full: true },
			{ key: "timeout", label: "Timeout (s)", type: "number", val: p.timeout },
		],
		ws: [
			{ key: "url", label: "URL", type: "text", val: p.url, full: true },
			{ key: "timeout", label: "Timeout (s)", type: "number", val: p.timeout },
		],
		tcp: [
			{ key: "host", label: "Host", type: "text", val: p.host },
			{ key: "port", label: "Port", type: "number", val: p.port },
			{ key: "timeout", label: "Timeout (s)", type: "number", val: p.timeout },
		],
		udp: [
			{ key: "host", label: "Host", type: "text", val: p.host },
			{ key: "port", label: "Port", type: "number", val: p.port },
			{ key: "timeout", label: "Timeout (s)", type: "number", val: p.timeout },
			{ key: "payload", label: "Payload", type: "text", val: p.payload },
		],
		icmp: [
			{ key: "host", label: "Host", type: "text", val: p.host },
			{ key: "timeout", label: "Timeout (s)", type: "number", val: p.timeout },
		],
		smtp: [{ key: "url", label: "URL", type: "text", val: p.url, full: true }],
		imap: [
			{ key: "server", label: "Server", type: "text", val: p.server },
			{ key: "port", label: "Port", type: "number", val: p.port },
			{ key: "username", label: "Username", type: "text", val: p.username },
			{ key: "password", label: "Password", type: "text", val: p.password },
		],
		mysql: [
			{ key: "url", label: "URL", type: "text", val: p.url, full: true },
			{ key: "timeout", label: "Timeout (s)", type: "number", val: p.timeout },
		],
		mssql: [
			{ key: "url", label: "URL", type: "text", val: p.url, full: true },
			{ key: "timeout", label: "Timeout (s)", type: "number", val: p.timeout },
		],
		postgresql: [
			{ key: "url", label: "URL", type: "text", val: p.url, full: true },
			{ key: "timeout", label: "Timeout (s)", type: "number", val: p.timeout },
		],
		redis: [
			{ key: "url", label: "URL", type: "text", val: p.url, full: true },
			{ key: "timeout", label: "Timeout (s)", type: "number", val: p.timeout },
		],
	};

	const fieldSet = fields[proto] || [];
	return `<div class="form-grid" style="margin-top:12px">
${fieldSet
	.map((f) => {
		const fullClass = f.full ? " full-width" : "";
		const bindPath = `monitors.${idx}.pulse.${proto}.${f.key}`;
		if (f.type === "select") {
			return `<div class="form-group${fullClass}">
	<label class="form-label">${f.label}</label>
	<select class="form-select" data-bind="${bindPath}">
		${f.options.map((o) => `<option value="${o}" ${f.val === o ? "selected" : ""}>${o}</option>`).join("")}
	</select>
</div>`;
		}
		return `<div class="form-group${fullClass}">
<label class="form-label">${f.label}</label>
<input class="form-input${f.type === "text" ? " mono" : ""}" type="${f.type}" value="${esc(f.val ?? "")}"
	data-bind="${bindPath}" ${f.type === "number" ? 'data-type="number"' : ""} />
</div>`;
	})
	.join("")}
</div>`;
}

function addGroup() {
	config.groups.push({
		id: uid(),
		name: "",
		strategy: "percentage",
		degradedThreshold: 50,
		interval: 60,
		resendNotification: 0,
	});
	renderGroups();
	updateBadges();
}

function removeGroup(idx) {
	config.groups.splice(idx, 1);
	renderGroups();
	updateBadges();
}

function renderGroups() {
	const container = document.getElementById("groups-list");
	if (config.groups.length === 0) {
		container.innerHTML = `
<div class="empty-state">
<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
<h3>No Groups</h3>
<p>Groups let you organize monitors hierarchically.</p>
</div>`;
		return;
	}
	container.innerHTML = config.groups
		.map((g, i) => {
			const parentOptions = config.groups
				.filter((_, j) => j !== i)
				.map((p) => `<option value="${p.id}" ${g.parentId === p.id ? "selected" : ""}>${p.name || p.id}</option>`)
				.join("");
			return `
<div class="config-card">
<div class="config-card-header">
<div class="config-card-title">
	<h3>${g.name || "Unnamed Group"}</h3>
	<span class="badge mono">${g.id || ""}</span>
</div>
<div class="config-card-actions">
	<button class="btn-icon danger" data-action="remove-group" data-idx="${i}" title="Delete">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
	</button>
</div>
</div>
<div class="form-grid">
<div class="form-group">
	<label class="form-label">ID <span class="required">*</span></label>
	<input class="form-input mono" type="text" value="${g.id || ""}" data-bind="groups.${i}.id" />
</div>
<div class="form-group">
	<label class="form-label">Name <span class="required">*</span></label>
	<input class="form-input" type="text" value="${esc(g.name || "")}" data-bind="groups.${i}.name" data-update-title />
</div>
<div class="form-group">
	<label class="form-label">Strategy <span class="required">*</span></label>
	<select class="form-select" data-bind="groups.${i}.strategy">
		<option value="any-up" ${g.strategy === "any-up" ? "selected" : ""}>any-up</option>
		<option value="all-up" ${g.strategy === "all-up" ? "selected" : ""}>all-up</option>
		<option value="percentage" ${g.strategy === "percentage" ? "selected" : ""}>percentage</option>
	</select>
</div>
<div class="form-group">
	<label class="form-label">Degraded Threshold (%) <span class="required">*</span></label>
	<input class="form-input" type="number" value="${g.degradedThreshold ?? ""}" min="0" max="100" data-bind="groups.${i}.degradedThreshold" data-type="number" />
</div>
<div class="form-group">
	<label class="form-label">Interval (seconds) <span class="required">*</span></label>
	<input class="form-input" type="number" value="${g.interval ?? ""}" min="1" data-bind="groups.${i}.interval" data-type="number" />
</div>
<div class="form-group">
	<label class="form-label">Resend Notification</label>
	<input class="form-input" type="number" value="${g.resendNotification ?? ""}" min="0" data-bind="groups.${i}.resendNotification" data-type="number" />
</div>
<div class="form-group">
	<label class="form-label">Parent Group</label>
	<select class="form-select" data-bind="groups.${i}.parentId" data-empty-undefined>
		<option value="">None</option>
		${parentOptions}
	</select>
</div>
<div class="form-group">
	<label class="form-label">Notification Channels</label>
	${renderTagsInput(`grp-nc-${i}`, g.notificationChannels || [], "groups", i, "notificationChannels")}
</div>
</div>
</div>`;
		})
		.join("");
	bindDynamicEvents(container);
}

function addStatusPage() {
	config.status_pages.push({
		id: uid(),
		name: "",
		slug: "",
		items: [],
	});
	renderStatusPages();
	updateBadges();
}

function removeStatusPage(idx) {
	config.status_pages.splice(idx, 1);
	renderStatusPages();
	updateBadges();
}

function renderStatusPages() {
	const container = document.getElementById("statuspages-list");
	if (config.status_pages.length === 0) {
		container.innerHTML = `
<div class="empty-state">
<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
<h3>No Status Pages</h3>
<p>Status pages display the health of your monitors and groups.</p>
</div>`;
		return;
	}
	container.innerHTML = config.status_pages
		.map(
			(sp, i) => `
<div class="config-card">
<div class="config-card-header">
<div class="config-card-title">
	<h3>${sp.name || "Unnamed Status Page"}</h3>
	<span class="badge mono">/${sp.slug || "..."}</span>
</div>
<div class="config-card-actions">
	<button class="btn-icon danger" data-action="remove-statuspage" data-idx="${i}" title="Delete">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
	</button>
</div>
</div>
<div class="form-grid">
<div class="form-group">
	<label class="form-label">ID <span class="required">*</span></label>
	<input class="form-input mono" type="text" value="${sp.id || ""}" data-bind="status_pages.${i}.id" />
</div>
<div class="form-group">
	<label class="form-label">Name <span class="required">*</span></label>
	<input class="form-input" type="text" value="${esc(sp.name || "")}" data-bind="status_pages.${i}.name" data-update-title />
</div>
<div class="form-group">
	<label class="form-label">Slug <span class="required">*</span></label>
	<input class="form-input mono" type="text" value="${esc(sp.slug || "")}" data-bind="status_pages.${i}.slug" placeholder="lowercase-with-hyphens" />
	<span class="form-hint">URL path: /v1/status/{slug}</span>
</div>
<div class="form-group">
	<label class="form-label">Password</label>
	<input class="form-input" type="text" value="${esc(sp.password || "")}" data-bind="status_pages.${i}.password" data-empty-undefined placeholder="Optional (min 8 chars)" />
</div>
<div class="form-group full-width">
	<label class="form-label">Items (Monitor/Group IDs) <span class="required">*</span></label>
	${renderTagsInput(`sp-items-${i}`, sp.items || [], "status_pages", i, "items")}
</div>
</div>
</div>
`,
		)
		.join("");
	bindDynamicEvents(container);
}

function addNotificationChannel() {
	const id = uid();
	if (!config.notifications) config.notifications = { channels: {} };
	if (!config.notifications.channels) config.notifications.channels = {};
	config.notifications.channels[id] = {
		id: id,
		name: "",
		enabled: true,
	};
	renderNotifications();
	updateBadges();
}

function removeNotificationChannel(key) {
	delete config.notifications.channels[key];
	renderNotifications();
	updateBadges();
}

function renderNotifications() {
	const container = document.getElementById("notifications-list");
	const channels = config.notifications?.channels || {};
	const keys = Object.keys(channels);

	if (keys.length === 0) {
		container.innerHTML = `
<div class="empty-state">
<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
<h3>No Notification Channels</h3>
<p>Configure Discord, Email, or Ntfy notifications.</p>
</div>`;
		return;
	}

	container.innerHTML = keys
		.map((key) => {
			const ch = channels[key];
			return `
<div class="config-card">
<div class="config-card-header">
<div class="config-card-title">
	<h3>${ch.name || "Unnamed Channel"}</h3>
	<span class="badge mono">${ch.id || key}</span>
</div>
<div class="config-card-actions">
	<button class="btn-icon danger" data-action="remove-notification" data-key="${key}" title="Delete">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
	</button>
</div>
</div>
<div class="form-grid">
<div class="form-group">
	<label class="form-label">ID <span class="required">*</span></label>
	<input class="form-input mono" type="text" value="${esc(ch.id || key)}" data-action="update-channel-id" data-key="${key}" />
</div>
<div class="form-group">
	<label class="form-label">Name <span class="required">*</span></label>
	<input class="form-input" type="text" value="${esc(ch.name || "")}" data-bind="notifications.channels.${key}.name" data-update-title />
</div>
<div class="form-group">
	<label class="form-label">Description</label>
	<input class="form-input" type="text" value="${esc(ch.description || "")}" data-bind="notifications.channels.${key}.description" data-empty-undefined />
</div>
<div class="form-group">
	<label class="form-check">
		<input type="checkbox" ${ch.enabled ? "checked" : ""} data-bind="notifications.channels.${key}.enabled" data-type="boolean" />
		<span class="form-check-label">Enabled</span>
	</label>
</div>
</div>

<!-- Discord -->
<hr class="form-divider"/>
<div class="form-section-title">Discord</div>
<div class="form-grid">
<div class="form-group">
	<label class="form-check">
		<input type="checkbox" ${ch.discord?.enabled ? "checked" : ""} data-bind="notifications.channels.${key}.discord.enabled" data-type="boolean" data-ensure="notifications.channels.${key}.discord" />
		<span class="form-check-label">Enable Discord</span>
	</label>
</div>
<div class="form-group full-width">
	<label class="form-label">Webhook URL</label>
	<input class="form-input mono" type="text" value="${esc(ch.discord?.webhookUrl || "")}" placeholder="https://discord.com/api/webhooks/..."
		data-bind="notifications.channels.${key}.discord.webhookUrl" data-ensure="notifications.channels.${key}.discord" />
</div>
<div class="form-group">
	<label class="form-label">Username</label>
	<input class="form-input" type="text" value="${esc(ch.discord?.username || "")}" placeholder="Uptime Bot"
		data-bind="notifications.channels.${key}.discord.username" data-ensure="notifications.channels.${key}.discord" data-empty-undefined />
</div>
<div class="form-group">
	<label class="form-label">Avatar URL</label>
	<input class="form-input mono" type="text" value="${esc(ch.discord?.avatarUrl || "")}"
		data-bind="notifications.channels.${key}.discord.avatarUrl" data-ensure="notifications.channels.${key}.discord" data-empty-undefined />
</div>
</div>

<!-- Email -->
<hr class="form-divider"/>
<div class="form-section-title">Email (SMTP)</div>
<div class="form-grid">
<div class="form-group">
	<label class="form-check">
		<input type="checkbox" ${ch.email?.enabled ? "checked" : ""} data-bind="notifications.channels.${key}.email.enabled" data-type="boolean" data-ensure="notifications.channels.${key}.email" />
		<span class="form-check-label">Enable Email</span>
	</label>
</div>
<div class="form-group">
	<label class="form-label">From</label>
	<input class="form-input" type="text" value="${esc(ch.email?.from || "")}" placeholder='"Uptime Monitor" <alerts@example.com>'
		data-bind="notifications.channels.${key}.email.from" data-ensure="notifications.channels.${key}.email" />
</div>
<div class="form-group">
	<label class="form-label">To (comma-separated)</label>
	<input class="form-input" type="text" value="${(ch.email?.to || []).join(", ")}"
		data-bind="notifications.channels.${key}.email.to" data-type="csv" data-ensure="notifications.channels.${key}.email" />
</div>
<div class="form-group">
	<label class="form-label">SMTP Host</label>
	<input class="form-input mono" type="text" value="${esc(ch.email?.smtp?.host || "")}"
		data-bind="notifications.channels.${key}.email.smtp.host" data-ensure="notifications.channels.${key}.email.smtp" />
</div>
<div class="form-group">
	<label class="form-label">SMTP Port</label>
	<input class="form-input" type="number" value="${ch.email?.smtp?.port || ""}"
		data-bind="notifications.channels.${key}.email.smtp.port" data-type="number" data-ensure="notifications.channels.${key}.email.smtp" />
</div>
<div class="form-group">
	<label class="form-check">
		<input type="checkbox" ${ch.email?.smtp?.secure ? "checked" : ""} data-bind="notifications.channels.${key}.email.smtp.secure" data-type="boolean" data-ensure="notifications.channels.${key}.email.smtp" />
		<span class="form-check-label">Use TLS (secure)</span>
	</label>
</div>
<div class="form-group">
	<label class="form-label">SMTP User</label>
	<input class="form-input" type="text" value="${esc(ch.email?.smtp?.user || "")}"
		data-bind="notifications.channels.${key}.email.smtp.user" data-ensure="notifications.channels.${key}.email.smtp" />
</div>
<div class="form-group">
	<label class="form-label">SMTP Password</label>
	<input class="form-input" type="password" value="${esc(ch.email?.smtp?.pass || "")}"
		data-bind="notifications.channels.${key}.email.smtp.pass" data-ensure="notifications.channels.${key}.email.smtp" />
</div>
</div>

<!-- Ntfy -->
<hr class="form-divider"/>
<div class="form-section-title">Ntfy</div>
<div class="form-grid">
<div class="form-group">
	<label class="form-check">
		<input type="checkbox" ${ch.ntfy?.enabled ? "checked" : ""} data-bind="notifications.channels.${key}.ntfy.enabled" data-type="boolean" data-ensure="notifications.channels.${key}.ntfy" />
		<span class="form-check-label">Enable Ntfy</span>
	</label>
</div>
<div class="form-group">
	<label class="form-label">Server</label>
	<input class="form-input mono" type="text" value="${esc(ch.ntfy?.server || "")}" placeholder="https://ntfy.sh"
		data-bind="notifications.channels.${key}.ntfy.server" data-ensure="notifications.channels.${key}.ntfy" />
</div>
<div class="form-group">
	<label class="form-label">Topic</label>
	<input class="form-input mono" type="text" value="${esc(ch.ntfy?.topic || "")}"
		data-bind="notifications.channels.${key}.ntfy.topic" data-ensure="notifications.channels.${key}.ntfy" />
</div>
<div class="form-group">
	<label class="form-label">Token</label>
	<input class="form-input mono" type="text" value="${esc(ch.ntfy?.token || "")}" placeholder="Optional"
		data-bind="notifications.channels.${key}.ntfy.token" data-ensure="notifications.channels.${key}.ntfy" data-empty-undefined />
</div>
</div>
</div>`;
		})
		.join("");
	bindDynamicEvents(container);
}

function addPulseMonitor() {
	config.PulseMonitors.push({
		id: uid(),
		name: "",
		token: token(),
	});
	renderPulseMonitors();
	updateBadges();
}

function removePulseMonitor(idx) {
	config.PulseMonitors.splice(idx, 1);
	renderPulseMonitors();
	updateBadges();
}

function renderPulseMonitors() {
	const container = document.getElementById("pulsemonitors-list");
	if (config.PulseMonitors.length === 0) {
		container.innerHTML = `
<div class="empty-state">
<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
<h3>No PulseMonitors</h3>
<p>PulseMonitor agents perform distributed health checks from multiple regions.</p>
</div>`;
		return;
	}
	container.innerHTML = config.PulseMonitors.map(
		(pm, i) => `
<div class="config-card">
<div class="config-card-header">
<div class="config-card-title">
	<h3>${pm.name || "Unnamed PulseMonitor"}</h3>
	<span class="badge mono">${pm.id || ""}</span>
</div>
<div class="config-card-actions">
	<button class="btn-icon danger" data-action="remove-pulsemonitor" data-idx="${i}" title="Delete">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
	</button>
</div>
</div>
<div class="form-grid">
<div class="form-group">
	<label class="form-label">ID <span class="required">*</span></label>
	<input class="form-input mono" type="text" value="${esc(pm.id || "")}" data-bind="PulseMonitors.${i}.id" />
</div>
<div class="form-group">
	<label class="form-label">Name <span class="required">*</span></label>
	<input class="form-input" type="text" value="${esc(pm.name || "")}" data-bind="PulseMonitors.${i}.name" data-update-title />
</div>
<div class="form-group">
	<label class="form-label">Token <span class="required">*</span></label>
	<input class="form-input mono" type="text" value="${esc(pm.token || "")}" data-bind="PulseMonitors.${i}.token" />
</div>
</div>
</div>
`,
	).join("");
	bindDynamicEvents(container);
}

function renderTagsInput(id, values, section, idx, prop) {
	const tags = (values || [])
		.map(
			(v) =>
				`<span class="tag">${esc(v)}<button class="tag-remove" data-action="remove-tag" data-section="${section}" data-idx="${idx}" data-prop="${prop}" data-value="${esc(v)}">&times;</button></span>`,
		)
		.join("");
	return `<div class="tags-display" data-action="focus-tag-input">
${tags}
<input class="tags-input" type="text" placeholder="Type and press Enter" id="${id}"
data-action="tag-keydown" data-section="${section}" data-idx="${idx}" data-prop="${prop}" />
</div>`;
}

function addTag(section, idx, prop, value) {
	const item = config[section][idx];
	if (!item[prop]) item[prop] = [];
	if (!item[prop].includes(value)) item[prop].push(value);
	reRenderSection(section);
}

function removeTag(section, idx, prop, value) {
	const item = config[section][idx];
	if (item[prop]) item[prop] = item[prop].filter((v) => v !== value);
	reRenderSection(section);
}

function reRenderSection(section) {
	if (section === "monitors") renderMonitors();
	else if (section === "groups") renderGroups();
	else if (section === "status_pages") renderStatusPages();
}

function exportConfig() {
	readGeneralFromUI();
	const toml = TOML.stringify(config);

	const blob = new Blob([toml], { type: "text/plain" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "config.toml";
	a.click();
	URL.revokeObjectURL(url);
	showToast("Configuration exported as config.toml");
}

function resetConfig() {
	if (!confirm("Reset all configuration? This cannot be undone.")) return;
	config = {
		clickhouse: { url: "" },
		server: {},
		logger: {},
		missingPulseDetector: {},
		selfMonitoring: {},
		monitors: [],
		groups: [],
		status_pages: [],
		notifications: { channels: {} },
		PulseMonitors: [],
	};
	loadConfigToUI();
	showToast("Configuration reset");
}

function loadExample() {
	const example = `# Uptime Monitor - Example Configuration

[clickhouse]
url = "http://uptime_user:uptime_password@clickhouse:8123/uptime_monitor"

[server]
port = 3000
proxy = "direct"

[logger]
level = 4

[missingPulseDetector]
interval = 5

[selfMonitoring]
enabled = true
id = "self-monitor"
interval = 3
backfillOnRecovery = true
latencyStrategy = "last-known"

# PulseMonitor Agents
[[PulseMonitors]]
id = "US-WEST-1"
name = "US West (Oregon)"
token = "tk_pulse_us_west_secret"

[[PulseMonitors]]
id = "EU-CENTRAL-1"
name = "EU Central (Frankfurt)"
token = "tk_pulse_eu_central_secret"

# Monitors
[[monitors]]
id = "api-prod"
name = "Production API"
token = "tk_prod_api_abc123"
interval = 30
maxRetries = 2
resendNotification = 12
groupId = "production"
notificationChannels = ["critical"]
pulseMonitors = ["US-WEST-1", "EU-CENTRAL-1"]

[monitors.pulse.http]
method = "GET"
url = "https://api.example.com/health"
timeout = 10

[[monitors]]
id = "game-server"
name = "Game Server"
token = "tk_game_server"
interval = 10
maxRetries = 0
resendNotification = 0
groupId = "production"

[monitors.custom1]
id = "players"
name = "Player Count"
unit = "players"

[monitors.custom2]
id = "tps"
name = "Ticks Per Second"
unit = "TPS"

[monitors.custom3]
id = "memory"
name = "Memory Usage"
unit = "MB"

[[monitors]]
id = "db-primary"
name = "Primary Database"
token = "tk_db_primary"
interval = 15
maxRetries = 1
resendNotification = 6
groupId = "infrastructure"
notificationChannels = ["critical"]
pulseMonitors = ["US-WEST-1"]

[monitors.pulse.postgresql]
url = "postgresql://monitor:pass@db.example.com:5432/production"
timeout = 5

[[monitors]]
id = "redis-cache"
name = "Redis Cache"
token = "tk_redis"
interval = 10
maxRetries = 0
resendNotification = 0
groupId = "infrastructure"
pulseMonitors = ["US-WEST-1"]

[monitors.pulse.redis]
url = "redis://redis.example.com:6379"
timeout = 3

# Groups
[[groups]]
id = "production"
name = "Production Services"
strategy = "percentage"
degradedThreshold = 50
interval = 60
resendNotification = 12
notificationChannels = ["critical"]

[[groups]]
id = "infrastructure"
name = "Infrastructure"
strategy = "all-up"
degradedThreshold = 0
interval = 60
resendNotification = 6
notificationChannels = ["critical", "ops-team"]

# Status Pages
[[status_pages]]
id = "public"
name = "Public Status"
slug = "status"
items = ["production", "infrastructure"]

[[status_pages]]
id = "internal"
name = "Internal Dashboard"
slug = "internal"
items = ["production", "infrastructure"]
password = "internal-secret-123"

# Notifications
[notifications.channels.critical]
id = "critical"
name = "Critical Alerts"
description = "High-priority production alerts"
enabled = true

[notifications.channels.critical.discord]
enabled = true
webhookUrl = "https://discord.com/api/webhooks/123456789/abcdefgh"
username = "Uptime Bot"

[notifications.channels.critical.email]
enabled = true
from = '"Uptime Monitor" <alerts@example.com>'
to = ["admin@example.com", "oncall@example.com"]

[notifications.channels.critical.email.smtp]
host = "smtp.gmail.com"
port = 465
secure = true
user = "alerts@example.com"
pass = "your-app-password"

[notifications.channels.ops-team]
id = "ops-team"
name = "Ops Team"
enabled = true

[notifications.channels.ops-team.ntfy]
enabled = true
server = "https://ntfy.sh"
topic = "my-uptime-alerts"
`;
	parseTOML(example);
	showToast("Example configuration loaded!");
}

function bindCollapsibles(container) {
	container.querySelectorAll(".collapsible-trigger").forEach((trigger) => {
		trigger.addEventListener("click", () => {
			trigger.classList.toggle("open");
			trigger.nextElementSibling.classList.toggle("open");
		});
	});
}

function handleBind(el) {
	const path = el.dataset.bind;
	if (!path) return;

	if (el.dataset.ensure) {
		ensurePath(el.dataset.ensure);
	}

	const { parent, key } = resolvePath(path);
	const dataType = el.dataset.type;
	const emptyUndefined = el.hasAttribute("data-empty-undefined");

	let value;
	if (dataType === "boolean") {
		value = el.checked;
	} else if (dataType === "number") {
		value = el.value === "" ? undefined : Number(el.value);
	} else if (dataType === "csv") {
		value = el.value
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
	} else {
		value = el.value;
	}

	if (emptyUndefined && (value === "" || value === undefined)) {
		delete parent[key];
	} else {
		parent[key] = value;
	}

	if (el.hasAttribute("data-update-title")) {
		updateCardTitle(el);
	}

	if (el.dataset.rerender) {
		reRenderSection(el.dataset.rerender);
	}
}

function bindDynamicEvents(container) {
	// data-bind: change events for inputs, selects, checkboxes
	container.querySelectorAll("[data-bind]").forEach((el) => {
		el.addEventListener("change", () => handleBind(el));
	});

	// Focus tag input when clicking tags-display area
	container.querySelectorAll('[data-action="focus-tag-input"]').forEach((el) => {
		el.addEventListener("click", () => {
			const input = el.querySelector("input");
			if (input) input.focus();
		});
	});

	// Enter key to add tag
	container.querySelectorAll('[data-action="tag-keydown"]').forEach((el) => {
		el.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				const val = el.value.trim();
				if (!val) return;
				addTag(el.dataset.section, el.dataset.idx, el.dataset.prop, val);
			}
		});
	});

	// Remove tag buttons
	container.querySelectorAll('[data-action="remove-tag"]').forEach((el) => {
		el.addEventListener("click", () => {
			removeTag(el.dataset.section, el.dataset.idx, el.dataset.prop, el.dataset.value);
		});
	});

	// Pulse protocol selector
	container.querySelectorAll('[data-action="set-pulse-protocol"]').forEach((el) => {
		el.addEventListener("change", () => {
			setPulseProtocol(Number(el.dataset.idx), el.value);
		});
	});

	// Update notification channel ID
	container.querySelectorAll('[data-action="update-channel-id"]').forEach((el) => {
		el.addEventListener("change", () => {
			const ch = config.notifications.channels[el.dataset.key];
			if (ch) ch.id = el.value;
		});
	});
}

document.body.addEventListener("click", (e) => {
	const btn = e.target.closest("[data-action]");
	if (!btn) return;

	const action = btn.dataset.action;
	const idx = btn.dataset.idx !== undefined ? Number(btn.dataset.idx) : undefined;

	switch (action) {
		case "import-toml":
			document.getElementById("fileInput").click();
			break;
		case "load-example":
			loadExample();
			break;
		case "reset-config":
			resetConfig();
			break;
		case "export-toml":
			exportConfig();
			break;
		case "add-monitor":
			addMonitor();
			break;
		case "add-group":
			addGroup();
			break;
		case "add-statuspage":
			addStatusPage();
			break;
		case "add-notification":
			addNotificationChannel();
			break;
		case "add-pulsemonitor":
			addPulseMonitor();
			break;
		case "remove-monitor":
			removeMonitor(idx);
			break;
		case "remove-group":
			removeGroup(idx);
			break;
		case "remove-statuspage":
			removeStatusPage(idx);
			break;
		case "remove-notification":
			removeNotificationChannel(btn.dataset.key);
			break;
		case "remove-pulsemonitor":
			removePulseMonitor(idx);
			break;
	}
});

loadConfigToUI();
