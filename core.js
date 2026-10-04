/* Shared pure logic. No network requests, dependencies or tracking. */
(() => {
	"use strict";
	const LANGUAGES = Object.freeze({en: "English", ru: "Русский", de: "Deutsch", es: "Español", fr: "Français", it: "Italiano", pl: "Polski", zh: "中文（简体）", hi: "हिन्दी", ar: "العربية", pt: "Português", tr: "Türkçe"});
	function resolveLanguage(preference, browserLanguage = "en") {
		if (Object.hasOwn(LANGUAGES, preference)) return preference;
		const base = String(browserLanguage).toLowerCase().split(/[-_]/u)[0];
		return Object.hasOwn(LANGUAGES, base) ? base : "en";
	}
	const DEFAULTS = Object.freeze({
		allSites: false,
		language: "auto",
		sites: [],
		warningSeconds: 120,
		sound: true,
		opacity: 0.4,
		defaultMinutes: 15
	});
	function normalizeSite(value) {
		const input = String(value).trim();
		if (!input || /[\s*]/u.test(input)) throw new Error(`Invalid address: ${input || "empty string"}`);
		let url;
		try { url = new URL(input.includes("://") ? input : `https://${input}`); }
		catch { throw new Error(`Could not recognize address: ${input}`); }
		if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
			throw new Error(`Enter a regular website address: ${input}`);
		}
		const host = url.hostname.toLowerCase().replace(/^www\./u, "").replace(/\.$/u, "");
		if (!host || (!host.includes(".") && host !== "localhost") || host.includes("..")) {
			throw new Error(`Enter a full domain, such as youtube.com: ${input}`);
		}
		return host;
	}
	function matchesSite(url, site) {
		try {
			const parsed = new URL(url);
			if (!["http:", "https:"].includes(parsed.protocol)) return false;
			const host = parsed.hostname.toLowerCase().replace(/\.$/u, "");
			return host === site || host.endsWith(`.${site}`);
		} catch { return false; }
	}
	function parseSites(text) {
		const list = [...new Set(String(text).split(/[\n,;]+/u).map(s => s.trim()).filter(Boolean).map(normalizeSite))];
		// Parent domains already include their children; avoid overlapping timers.
		return list.filter(site => !list.some(other => other !== site && site.endsWith(`.${other}`))).sort();
	}
	function siteForUrl(url, config) {
		try {
			const parsed = new URL(url);
			if (!["http:", "https:"].includes(parsed.protocol)) return null;
			const host = parsed.hostname.toLowerCase().replace(/^www\./u, "").replace(/\.$/u, "");
			// Protected Firefox services must never receive timers or be closed by them.
			const protectedSites = ["accounts.firefox.com", "addons.mozilla.org", "accounts-static.cdn.mozilla.net", "addons.cdn.mozilla.net", "content.cdn.mozilla.net", "support.mozilla.org", "sync.services.mozilla.com"];
			if (protectedSites.some(site => host === site || host.endsWith(`.${site}`))) return null;
			return config.sites.find(site => matchesSite(url, site)) || (config.allSites ? host : null);
		} catch { return null; }
	}
	function validateConfig(input) {
		const warningSeconds = Number(input.warningSeconds);
		const opacity = Number(input.opacity);
		const defaultMinutes = Number(input.defaultMinutes);
		if (!Number.isInteger(warningSeconds) || warningSeconds < 1 || warningSeconds > 600) throw new Error("Warning: enter 1 to 600 seconds.");
		if (!Number.isFinite(opacity) || opacity < 0.15 || opacity > 1) throw new Error("Opacity: enter 15 to 100%.");
		validateMinutes(defaultMinutes);
		return {
			language: Object.hasOwn(LANGUAGES, input.language) ? input.language : "auto",
			allSites: input.allSites === true,
			sites: parseSites(Array.isArray(input.sites) ? input.sites.join("\n") : input.sites),
			warningSeconds, sound: Boolean(input.sound), opacity, defaultMinutes
		};
	}
	function validateMinutes(input) {
		const minutes = Number(input);
		if (!Number.isFinite(minutes) || minutes < 0.1 || minutes > 1440) throw new Error("Enter a time between 0.1 and 1440 minutes.");
		return minutes;
	}
	function formatTime(milliseconds) {
		const total = Math.max(0, Math.ceil(milliseconds / 1000));
		const seconds = String(total % 60).padStart(2, "0");
		const minutes = String(Math.floor(total / 60) % 60).padStart(2, "0");
		return total >= 3600 ? `${Math.floor(total / 3600)}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
	}
	function validPosition(position) {
		return !!position && [position.x, position.y].every(value => Number.isFinite(value) && value >= 0);
	}
	const core = {LANGUAGES, resolveLanguage, validPosition, DEFAULTS, normalizeSite, matchesSite, parseSites, siteForUrl, validateConfig, validateMinutes, formatTime};
	globalThis.IntentCore = core;
	if (typeof module !== "undefined") module.exports = core;
})();
