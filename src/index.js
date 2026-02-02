/**
 * Uptime Monitor Website - Main JavaScript
 */

// DOM Elements
const header = document.getElementById("header");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileMenu = document.getElementById("mobileMenu");
const protocolsRing = document.getElementById("protocolsRing");

/**
 * Header scroll effect
 */
function initHeaderScroll() {
	let lastScroll = 0;

	window.addEventListener("scroll", () => {
		const currentScroll = window.pageYOffset;

		if (currentScroll > 50) {
			header.classList.add("scrolled");
		} else {
			header.classList.remove("scrolled");
		}

		lastScroll = currentScroll;
	});
}

/**
 * Mobile menu toggle
 */
function initMobileMenu() {
	if (!mobileMenuBtn || !mobileMenu) return;

	mobileMenuBtn.addEventListener("click", () => {
		mobileMenu.classList.toggle("active");

		// Update aria-expanded
		const isExpanded = mobileMenu.classList.contains("active");
		mobileMenuBtn.setAttribute("aria-expanded", isExpanded);
	});

	// Close menu when clicking on a link
	const mobileLinks = mobileMenu.querySelectorAll("a");
	mobileLinks.forEach((link) => {
		link.addEventListener("click", () => {
			mobileMenu.classList.remove("active");
			mobileMenuBtn.setAttribute("aria-expanded", false);
		});
	});
}

/**
 * Smooth scroll for anchor links
 */
function initSmoothScroll() {
	document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
		anchor.addEventListener("click", function (e) {
			e.preventDefault();
			const target = document.querySelector(this.getAttribute("href"));
			if (target) {
				target.scrollIntoView({
					behavior: "smooth",
					block: "start",
				});
			}
		});
	});
}

/**
 * Intersection Observer for fade-in animations
 */
function initScrollAnimations() {
	const observerOptions = {
		root: null,
		rootMargin: "0px",
		threshold: 0.1,
	};

	const observer = new IntersectionObserver((entries) => {
		entries.forEach((entry) => {
			if (entry.isIntersecting) {
				entry.target.classList.add("visible");
				observer.unobserve(entry.target);
			}
		});
	}, observerOptions);

	document.querySelectorAll(".fade-in").forEach((el) => {
		observer.observe(el);
	});
}

/**
 * Position protocol nodes in a circular layout
 */
function initProtocolsRing() {
	if (!protocolsRing) return;

	const protocols = protocolsRing.querySelectorAll(".protocol-node");
	const total = protocols.length;

	// Get ring dimensions
	const ringRect = protocolsRing.getBoundingClientRect();
	const ringWidth = protocolsRing.offsetWidth;
	const ringHeight = protocolsRing.offsetHeight;

	// Calculate radius based on container size
	const radius = Math.min(ringWidth, ringHeight) * 0.35;
	const centerX = ringWidth / 2;
	const centerY = ringHeight / 2;

	protocols.forEach((node, index) => {
		const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
		const x = centerX + radius * Math.cos(angle) - 32; // 32 = half node width
		const y = centerY + radius * Math.sin(angle) - 32; // 32 = half node height

		node.style.left = `${x}px`;
		node.style.top = `${y}px`;
	});
}

/**
 * Handle window resize for responsive elements
 */
function initResizeHandler() {
	let resizeTimeout;

	window.addEventListener("resize", () => {
		clearTimeout(resizeTimeout);
		resizeTimeout = setTimeout(() => {
			initProtocolsRing();
		}, 250);
	});
}

/**
 * Initialize all features
 */
function init() {
	initHeaderScroll();
	initMobileMenu();
	initSmoothScroll();
	initScrollAnimations();
	initProtocolsRing();
	initResizeHandler();
}

// Run on DOM ready
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", init);
} else {
	init();
}
