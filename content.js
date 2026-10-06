(() => {
	"use strict";
	if (globalThis.__siteIntentLoaded) return;
	globalThis.__siteIntentLoaded = true;
	const api = browser;
	const core = IntentCore;
	const t = text => IntentI18n.t(text, current?.config.language);
	let current = null;
	let host = null;
	let root = null;
	let mountedMode = null;
	let timerId = null;
	let checking = false;
	let countdownCheck = "";
	let dragPosition = null;
	let previousFocus = null;
	let mountPending = false;

	const styles = `
		:host { all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; color-scheme: light !important; }
		* { box-sizing: border-box; }
		.shell { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #192725; font-size: 16px; line-height: 1.5; }
		.backdrop { position: fixed; inset: 0; width: auto; max-width: none; height: auto; max-height: none; margin: 0; border: 0; place-items: center; padding: 20px; overflow-y: auto; background: rgba(15, 29, 27, .65); backdrop-filter: blur(8px); pointer-events: auto; }
		.backdrop[open] { display: grid; }
		.backdrop::backdrop { background: transparent; }
		.card { width: min(490px, 100%); margin: auto; padding: 32px; border: 1px solid #dce4de; border-radius: 24px; background: #fbfaf6; box-shadow: 0 28px 90px #0004; }
		.brand { display: flex; align-items: center; gap: 8px; margin-bottom: 22px; color: #53716b; font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
		.dot { width: 9px; height: 9px; border-radius: 50%; background: #2b7865; }
		h1 { margin: 0 0 6px; font-size: 28px; line-height: 1.2; font-weight: 700; letter-spacing: -.04em; }
		.site { margin: 0 0 24px; color: #64746d; overflow-wrap: anywhere; }
		label { display: block; margin: 18px 0 8px; font-size: 14px; font-weight: 650; }
		textarea, input { display: block; width: 100%; border: 1px solid #cbd8d0; border-radius: 10px; background: white; color: #192725; padding: 12px 14px; font: inherit; }
		textarea { min-height: 86px; resize: vertical; }
		input { appearance: auto; }
		textarea:focus, input:focus, button:focus-visible { outline: 3px solid #8bc2b1; outline-offset: 2px; }
		button { cursor: pointer; border: 0; border-radius: 10px; padding: 12px 16px; font: inherit; font-size: 14px; font-weight: 650; }
		button:disabled { opacity: .6; cursor: wait; }
		.quick { display: flex; gap: 8px; margin-top: 10px; }
		.quick button { padding: 6px 12px; background: #eaf0e9; color: #496259; }
		.start { width: 100%; margin-top: 20px; color: white; background: #246650; }
		.start:hover { background: #184d3b; }
		.note { margin: 14px 0 0; color: #64746d; font-size: 12px; }
		.error { color: #a72c36; font-size: 13px; margin: 10px 0 0; }
		.settings { display: block; margin: 14px auto 0; padding: 5px 8px; background: transparent; color: #63776e; font-size: 12px; }
		.reminder { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(350px, calc(100vw - 24px)); padding: 16px 22px; border: 1px solid #c7d3cd; border-radius: 18px; color: #eef8f0; background: #203c34; box-shadow: 0 8px 32px #0002; text-align: center; pointer-events: auto; cursor: grab; touch-action: none; user-select: none; opacity: var(--intent-opacity, .4); transition: opacity .2s, background .2s; }
		.reminder:hover, .reminder:focus-within, .reminder:active { opacity: 1; }
		.reminder:active { cursor: grabbing; }
		.reminder:focus-visible { outline: 3px solid #8bc2b1; outline-offset: 3px; }
		.reminder.warning { opacity: 1; background: #b32b3a; border-color: #cb4754; color: white; }
		.timer { direction: ltr; unicode-bidi: isolate; font-size: 40px; line-height: 1.1; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.04em; }
		.task { margin-top: 10px; font-size: 23px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; white-space: pre-wrap; max-height: 180px; overflow-y: auto; }
		.caption { margin-top: 8px; font-size: 10px; opacity: .75; }
		.end-session { width: 100%; margin-top: 12px; padding: 8px 10px; background: #eef8f0; color: #203c34; font-size: 12px; }
		.reminder .error { color: #fff; }
		:host([dir="rtl"]) .brand, :host([dir="rtl"]) h1 { letter-spacing: normal; }
		@media (max-width: 520px) { .card { padding: 24px; } h1 { font-size: 24px; } }
		@media (prefers-reduced-motion: reduce) { .reminder { transition: none; } }
	`;
	function createHost() {
		if (host?.isConnected) return true;
		if (!document.documentElement) return false;
		host = document.createElement("div");
		host.id = "site-intent-extension";
		root = host.attachShadow({mode: "closed"});
		const style = document.createElement("style");
		style.textContent = styles;
		root.append(style);
		document.documentElement.append(host);
		mountedMode = null;
		return true;
	}
	function clearUI() {
		if (timerId) clearInterval(timerId);
		timerId = null;
		host?.remove();
		host = null;
		root = null;
		mountedMode = null;
		if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
		previousFocus = null;
	}
	function shell() {
		root.querySelector(".shell")?.remove();
		const element = document.createElement("div");
		element.className = "shell";
		root.append(element);
		return element;
	}
	async function send(message) {
		const result = await api.runtime.sendMessage(message);
		if (!result?.ok) throw new Error(result?.error || t("The extension did not respond. Reload the page."));
		return result;
	}
	function showForm() {
		if (mountedMode === "form") { IntentI18n.localize(root, current.config.language); host.lang = current.config.language; host.dir = current.config.language === "ar" ? "rtl" : "ltr"; return; }
		mountedMode = "form";
		if (timerId) clearInterval(timerId);
		timerId = null;
		previousFocus = document.activeElement;
		const element = shell();
		// All dynamic user data is inserted with textContent/value, never HTML.
		element.innerHTML = `
			<dialog class="backdrop" aria-labelledby="intent-heading">
				<section class="card">
					<div class="brand"><span class="dot"></span> <span data-i18n="Why am I here?">Why am I here?</span></div>
					<h1 id="intent-heading"><span data-i18n="Browse with a purpose.">Browse with a purpose.</span></h1>
					<p class="site" dir="ltr"></p>
					<form>
						<label for="intent-task"><span data-i18n="What do you want to do on this site?">What do you want to do on this site?</span></label>
						<textarea id="intent-task" dir="auto" required maxlength="300" placeholder="For example, learn a new language or study a subject" data-i18n-placeholder="For example, learn a new language or study a subject"></textarea>
						<label for="intent-minutes"><span data-i18n="How much time do you want to spend on your goal?">How much time do you want to spend on your goal?</span></label>
						<input id="intent-minutes" type="number" min="0.1" max="1440" step="any" required aria-describedby="intent-minutes-note">
						<div class="quick"><button type="button" data-minutes="5"><span data-i18n="5 min">5 min</span></button><button type="button" data-minutes="15"><span data-i18n="15 min">15 min</span></button><button type="button" data-minutes="30"><span data-i18n="30 min">30 min</span></button></div>
						<p class="note" id="intent-minutes-note"><span data-i18n="Time in minutes. When it ends, all tabs of this site and its subdomains close in every window. Save your work first.">Time in minutes. When it ends, all tabs of this site and its subdomains close in every window. Save your work first.</span></p>
						<p class="error" role="alert" hidden></p>
						<button class="start" type="submit"><span data-i18n="Start session">Start session</span></button>
					</form>
					<button class="settings" type="button"><span data-i18n="Extension settings">Extension settings</span></button>
				</section>
			</dialog>`;
		root.querySelector(".backdrop").showModal();
		IntentI18n.localize(element, current.config.language);
		host.lang = current.config.language; host.dir = current.config.language === "ar" ? "rtl" : "ltr";
		root.querySelector(".site").textContent = current.site;
		const minutes = root.querySelector("#intent-minutes");
		minutes.value = current.config.defaultMinutes;
		for (const button of root.querySelectorAll("[data-minutes]")) {
			button.addEventListener("click", () => { minutes.value = button.dataset.minutes; });
		}
		root.querySelector(".settings").addEventListener("click", () => send({type: "OPEN_SETTINGS"}).catch(() => {}));
		root.querySelector("form").addEventListener("submit", async event => {
			event.preventDefault();
			IntentSound.unlock().catch(() => {});
			const button = root.querySelector(".start");
			const errorBox = root.querySelector(".error");
			const task = root.querySelector("#intent-task").value;
			const duration = minutes.value;
			button.disabled = true;
			try { applyState(await send({type: "START_SESSION", task, minutes: duration})); }
			catch (error) { errorBox.textContent = t(error.message); errorBox.hidden = false; button.disabled = false; }
		});
		// Keep keyboard navigation inside the form while it is open.
		element.addEventListener("keydown", event => {
			if (event.key !== "Tab") return;
			const controls = [...root.querySelectorAll("textarea, input, button")].filter(control => !control.disabled);
			const first = controls[0];
			const last = controls[controls.length - 1];
			if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last.focus(); }
			else if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first.focus(); }
		});
		root.querySelector("#intent-task").focus({preventScroll: true});
	}
	function positionReminder(block) {
		if (!dragPosition) return;
		const x = Math.max(block.offsetWidth / 2 + 8, Math.min(window.innerWidth - block.offsetWidth / 2 - 8, dragPosition.x));
		const y = Math.max(block.offsetHeight / 2 + 8, Math.min(window.innerHeight - block.offsetHeight / 2 - 8, dragPosition.y));
		block.style.left = `${x}px`;
		block.style.top = `${y}px`;
	}
	function savePosition(block) {
		const bounds = block.getBoundingClientRect();
		dragPosition = {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2};
		send({type: "SAVE_POSITION", position: dragPosition}).catch(console.error);
	}
	function showReminder() {
		if (mountedMode !== "timer") {
			mountedMode = "timer";
			const element = shell();
			element.innerHTML = `<div class="reminder" tabindex="0" role="group" aria-label="Goal and time remaining. Drag to move, or use the arrow keys." data-i18n-label="Goal and time remaining. Drag to move, or use the arrow keys."><div class="timer" role="timer" aria-live="off"></div><div class="task" dir="auto"></div><div class="caption"></div><button class="end-session" type="button" data-i18n="Force end session">Force end session</button><p class="error" role="alert" hidden></p></div>`;
			const block = root.querySelector(".reminder");
			const endButton = block.querySelector(".end-session");
			endButton.addEventListener("click", async () => {
				endButton.disabled = true;
				const error = block.querySelector(".error");
				error.hidden = true;
				try { applyState(await send({type: "END_SESSION"})); }
				catch (failure) {
					error.textContent = t(failure.message);
					error.hidden = false;
					endButton.disabled = false;
				}
			});
			let drag = null;
			block.addEventListener("pointerdown", event => {
				if (event.button !== 0 || event.target.closest("button")) return;
				const bounds = block.getBoundingClientRect();
				drag = {x: event.clientX, y: event.clientY, centerX: bounds.x + bounds.width / 2, centerY: bounds.y + bounds.height / 2};
				block.setPointerCapture(event.pointerId);
			});
			block.addEventListener("pointermove", event => {
				if (!drag) return;
				dragPosition = {x: drag.centerX + event.clientX - drag.x, y: drag.centerY + event.clientY - drag.y};
				positionReminder(block);
			});
			block.addEventListener("pointerup", () => { if (drag) { drag = null; savePosition(block); } });
			block.addEventListener("pointercancel", () => { if (drag) { drag = null; savePosition(block); } });
			block.addEventListener("keydown", event => {
				if (event.target !== block) return;
				const deltas = {ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12]};
				if (!deltas[event.key]) return;
				event.preventDefault();
				const bounds = block.getBoundingClientRect();
				dragPosition = {x: bounds.x + bounds.width / 2 + deltas[event.key][0], y: bounds.y + bounds.height / 2 + deltas[event.key][1]};
				positionReminder(block);
				savePosition(block);
			});
			positionReminder(block);
			if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
			previousFocus = null;
			if (timerId) clearInterval(timerId);
			timerId = setInterval(tick, 250);
		}
		IntentI18n.localize(root, current.config.language);
		host.lang = current.config.language; host.dir = current.config.language === "ar" ? "rtl" : "ltr";
		root.querySelector(".task").textContent = current.session.task;
		root.querySelector(".reminder").style.setProperty("--intent-opacity", current.config.opacity);
		tick();
		positionReminder(root.querySelector(".reminder"));
	}
	async function checkDeadline() {
		if (checking) return;
		checking = true;
		try { applyState(await send({type: "CHECK_DEADLINE"})); }
		catch { /* The browser alarm remains the authoritative fallback. */ }
		finally { checking = false; }
	}
	function tick() {
		if (!current?.session || !root) return;
		if (!host?.isConnected) { render(); return; }
		const remaining = current.session.endsAt - Date.now();
		const warning = remaining <= current.config.warningSeconds * 1000;
		root.querySelector(".timer").textContent = core.formatTime(remaining);
		root.querySelector(".reminder").classList.toggle("warning", warning);
		root.querySelector(".caption").textContent = remaining <= 0 ? t("Time is up · closing tabs") : warning ? t("All tabs of this site will close soon") : t("Drag to move");
		const seconds = Math.ceil(remaining / 1000);
		const key = `${current.session.endsAt}:${seconds}`;
		if (seconds >= 1 && seconds <= 10 && countdownCheck !== key) {
			countdownCheck = key;
			checkDeadline();
		}
		if (remaining <= 0 || (warning && !current.session.warned)) checkDeadline();
	}
	function render() {
		if (!current?.site) { clearUI(); return; }
		if (!createHost()) {
			if (!mountPending) {
				mountPending = true;
				document.addEventListener("DOMContentLoaded", () => { mountPending = false; render(); }, {once: true});
			}
			return;
		}
		if (current.session) showReminder();
		else showForm();
	}
	function applyState(state) {
		if (state.stale) return;
		current = state;
		dragPosition = state.reminderPosition || null;
		render();
	}
	api.runtime.onMessage.addListener(message => {
		if (message.type === "STATE") applyState(message.state);
		if (message.type === "PLAY_END" && current?.config.sound) return IntentSound.play("end").catch(() => {});
		if (message.type === "PLAY_WARNING" && current?.config.sound) IntentSound.play("warning").catch(() => {});
		if (message.type === "PLAY_TICK" && current?.config.sound && current?.session?.endsAt > Date.now()) IntentSound.play("tick").catch(() => {});
	});
	window.addEventListener("resize", () => { const block = root?.querySelector(".reminder"); if (block) positionReminder(block); });
	document.addEventListener("visibilitychange", () => { if (!document.hidden) checkDeadline(); });
	window.addEventListener("pageshow", () => send({type: "GET_STATE"}).then(applyState).catch(() => {}));
	send({type: "GET_STATE"}).then(applyState).catch(() => {});
})();
