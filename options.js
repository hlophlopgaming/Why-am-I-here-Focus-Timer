"use strict";
const api = browser;
const core = IntentCore;
const $ = selector => document.querySelector(selector);
let language = "en";
const t = text => IntentI18n.t(text, language);
function setLanguage(value) {
 language = core.resolveLanguage(value, api.i18n?.getUILanguage() || globalThis.navigator?.language);
 document.documentElement.lang = language;
 document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
 IntentI18n.localize(document, language);
 renderSessions();
}
let activeSessions = [];
let refreshBusy = false;

function status(message, isError = false) {
	$("#status").textContent = message;
	$("#status").classList.toggle("error", isError);
}
async function send(message) {
	const result = await api.runtime.sendMessage(message);
	if (!result?.ok) throw new Error(result?.error || t("The extension did not respond. Try reloading it."));
	return result;
}
function loadForm(config) {
 $("#language").value = config.language;
 setLanguage(config.language);
	$("#all-sites").checked = config.allSites;
	$("#sites").value = config.sites.join("\n");
	$("#default-minutes").value = config.defaultMinutes;
	$("#warning-seconds").value = config.warningSeconds;
	$("#opacity").value = Math.round(config.opacity * 100);
	$("#opacity-value").textContent = `${Math.round(config.opacity * 100)}%`;
	$("#sound").checked = config.sound;
}
function renderSessions() {
	const container = $("#sessions");
	container.replaceChildren();
	if (!activeSessions.length) {
		const p = document.createElement("p");
		p.className = "hint";
		p.textContent = t("No active sessions yet.");
		container.append(p);
		return;
	}
	for (const session of activeSessions) {
		const row = document.createElement("div");
		row.className = "session";
		const text = document.createElement("div");
		const site = document.createElement("strong");
		site.textContent = session.site;
		site.dir = "ltr";
		const task = document.createElement("p");
		task.textContent = session.task;
		task.dir = "auto";
		const time = document.createElement("time");
		time.dir = "ltr";
		time.textContent = core.formatTime(session.endsAt - Date.now());
		text.append(site, task);
		row.append(text, time);
		container.append(row);
	}
}
async function refresh(initial = false) {
	if (refreshBusy) return;
	refreshBusy = true;
	try {
		const result = await send({type: "GET_SETTINGS"});
		if (initial) loadForm(result.config);
		activeSessions = result.sessions;
		renderSessions();
	} catch (error) { status(t(error.message), true); }
	finally { refreshBusy = false; }
}
$("#all-sites").addEventListener("change", () => {
 if ($("#all-sites").checked && !window.confirm(t("Enable on every website? You will be asked for a goal and a time limit on every website. When time runs out, its tabs will close. Browser settings and internal pages are excluded."))) {
  $("#all-sites").checked = false;
 }
});
$("#language").addEventListener("change", () => { setLanguage($("#language").value); status(""); });
$("#opacity").addEventListener("input", () => { $("#opacity-value").textContent = `${$("#opacity").value}%`; });
$("#settings").addEventListener("submit", async event => {
	event.preventDefault();
	$("#save").disabled = true;
	try {
		const config = core.validateConfig({
			language: $("#language").value,
			allSites: $("#all-sites").checked,
			sites: $("#sites").value,
			defaultMinutes: $("#default-minutes").value,
			warningSeconds: $("#warning-seconds").value,
			opacity: Number($("#opacity").value) / 100,
			sound: $("#sound").checked
		});
		const result = await send({type: "SAVE_SETTINGS", config});
		loadForm(result.config);
		status(t("Saved. Settings now apply to open tabs."));
		await refresh();
	} catch (error) { status(t(error.message), true); }
	finally { $("#save").disabled = false; }
});
$("#test-sound").addEventListener("click", async () => {
	try {
		// Start directly in the click handler to retain the user's activation.
		await IntentSound.play("warning");
		status(t("Sound played."));
	} catch (error) {
		console.error("Site Intent: sound preview failed", error);
		status(`${t("Could not play sound. Check your volume and browser permissions.")} (${error.name}: ${error.message})`, true);
	}
});
for (const [value, label] of Object.entries(core.LANGUAGES)) {
 const option = document.createElement("option");
 option.value = value;
 option.textContent = label;
 $("#language").append(option);
}
setLanguage("auto");
refresh(true);
setInterval(() => { if (!document.hidden) refresh(); }, 2000);
