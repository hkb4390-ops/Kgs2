/* =========================================================
   HrryPlayer - custom glass player on top of YouTube IFrame API
   - YouTube ke controls/logo/click-through band (shield + controls=0)
   - Play/pause, +-10s, timeline (drag), duration, speed, quality
   - Fullscreen = landscape, exit = portrait (rotate button bhi)
   ========================================================= */
(function () {
  "use strict";

  /* ---------- YouTube API loader (once) ---------- */
  let ytPromise = null;
  function loadYT() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (ytPromise) return ytPromise;
    ytPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prev === "function") prev();
        resolve();
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = () => { ytPromise = null; reject(new Error("YT API load failed")); };
      document.head.appendChild(s);
    });
    return ytPromise;
  }

  /* ---------- helpers ---------- */
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = h ? String(m).padStart(2, "0") : String(m);
    return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
  }
  const QUALITY_LABEL = {
    highres: "4320p", hd2160: "2160p", hd1440: "1440p", hd1080: "1080p",
    hd720: "720p", large: "480p", medium: "360p", small: "240p", tiny: "144p", auto: "Auto"
  };
  function qLabel(q) { return QUALITY_LABEL[q] || q; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* =========================================================
     Player class
     ========================================================= */
  function HrryPlayer(mount, opts) {
    this.mount = mount;
    this.opts = opts || {};
    this.videoId = this.opts.videoId;
    this.title = this.opts.title || "";
    this.poster = this.opts.poster || "";
    this.yt = null;
    this.ready = false;
    this.started = false;
    this.duration = 0;
    this.dragging = false;
    this.hideTimer = null;
    this.tickTimer = null;
    this.tapTimer = null;
    this.lastTap = { t: 0, x: 0 };
    this.speed = 1;
    this.quality = "auto";
    this.pseudoFs = false;
    this._cleanup = [];
    this._build();
    this._init();
  }

  HrryPlayer.prototype._build = function () {
    const m = this.mount;
    m.innerHTML = `
      <div class="hp show-ui" tabindex="0" aria-label="Video player">
        <div class="hp-stage"><div class="hp-yt"></div></div>
        <div class="hp-shield"></div>
        <div class="hp-poster" ${this.poster ? `style="background-image:url('${esc(this.poster)}')"` : ""}>
          <button class="hp-big-play" aria-label="Play video"><i class="fa-solid fa-play"></i></button>
        </div>
        <div class="hp-spinner"></div>
        <div class="hp-flash l"><i class="fa-solid fa-backward"></i>10s</div>
        <div class="hp-flash r"><i class="fa-solid fa-forward"></i>10s</div>

        <div class="hp-ui">
          <div class="hp-top">
            <div class="hp-title">${esc(this.title)}</div>
            <button class="hp-ibtn hp-glass hp-rotate" aria-label="Rotate screen" style="display:none"><i class="fa-solid fa-rotate"></i></button>
          </div>

          <div class="hp-mid">
            <button class="hp-seekbtn hp-glass" data-seek="-10" aria-label="Back 10 seconds"><i class="fa-solid fa-rotate-left"></i><small>10</small></button>
            <button class="hp-playbtn hp-glass hp-toggle" aria-label="Play or pause"><i class="fa-solid fa-play"></i></button>
            <button class="hp-seekbtn hp-glass" data-seek="10" aria-label="Forward 10 seconds"><i class="fa-solid fa-rotate-right"></i><small>10</small></button>
          </div>

          <div class="hp-bottom">
            <div class="hp-timeline-row">
              <span class="hp-time hp-cur">0:00</span>
              <div class="hp-seek" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                <div class="hp-track">
                  <div class="hp-buf"></div>
                  <div class="hp-prog"></div>
                  <div class="hp-thumb"></div>
                </div>
                <div class="hp-tip">0:00</div>
              </div>
              <span class="hp-time hp-dur">0:00</span>
            </div>
            <div class="hp-actions">
              <div class="hp-vol">
                <button class="hp-ibtn hp-glass hp-mute" aria-label="Mute"><i class="fa-solid fa-volume-high"></i></button>
                <input type="range" class="hp-volrange" min="0" max="100" value="100" aria-label="Volume">
              </div>
              <div class="hp-spacer"></div>
              <button class="hp-chip hp-glass hp-speedbtn" aria-label="Playback speed"><i class="fa-solid fa-gauge-high"></i><span>1x</span></button>
              <button class="hp-chip hp-glass hp-qualbtn" aria-label="Video quality"><i class="fa-solid fa-sliders"></i><span>Auto</span></button>
              <button class="hp-ibtn hp-glass hp-fs" aria-label="Fullscreen"><i class="fa-solid fa-expand"></i></button>
            </div>
          </div>
        </div>

        <div class="hp-sheet"></div>
        <div class="hp-error">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:26px;color:#f0b24a"></i>
          <h4>Video chal nahi paaya</h4>
          <p class="hp-errmsg">Link galat ho sakta hai ya video private hai.</p>
          <button class="btn btn-primary hp-retry" style="flex:none;margin-top:6px;padding:8px 18px">Retry</button>
        </div>
      </div>`;
    const root = (this.root = m.querySelector(".hp"));
    const q = (s) => root.querySelector(s);
    this.el = {
      poster: q(".hp-poster"), bigPlay: q(".hp-big-play"), shield: q(".hp-shield"),
      toggle: q(".hp-toggle"), cur: q(".hp-cur"), dur: q(".hp-dur"),
      seek: q(".hp-seek"), prog: q(".hp-prog"), buf: q(".hp-buf"), thumb: q(".hp-thumb"), tip: q(".hp-tip"),
      speedBtn: q(".hp-speedbtn"), qualBtn: q(".hp-qualbtn"), fs: q(".hp-fs"), rotate: q(".hp-rotate"),
      mute: q(".hp-mute"), vol: q(".hp-volrange"), sheet: q(".hp-sheet"), err: q(".hp-error"),
      errMsg: q(".hp-errmsg"), retry: q(".hp-retry"), flashL: q(".hp-flash.l"), flashR: q(".hp-flash.r"),
      ytHost: q(".hp-yt")
    };
  };

  HrryPlayer.prototype._on = function (target, evt, fn, o) {
    target.addEventListener(evt, fn, o);
    this._cleanup.push(() => target.removeEventListener(evt, fn, o));
  };

  HrryPlayer.prototype._init = function () {
    const self = this, el = this.el;

    if (!this.videoId) { this._showError("Ye link YouTube ka nahi hai ya adhura hai."); this._bindUI(); return; }

    this._bindUI();
    loadYT().then(() => {
      if (self.destroyed) return;
      self.yt = new YT.Player(el.ytHost, {
        videoId: self.videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, iv_load_policy: 3,
          playsinline: 1, cc_load_policy: 0, autoplay: 0, origin: location.origin
        },
        events: {
          onReady: () => {
            self.ready = true;
            self.duration = self.yt.getDuration() || 0;
            el.dur.textContent = fmt(self.duration);
            if (self.opts.autoplay) self.play();
          },
          onStateChange: (e) => self._onState(e.data),
          onError: (e) => {
            const code = e.data;
            const msg = (code === 100 || code === 101 || code === 150)
              ? "Ye video private/removed hai ya embed allowed nahi hai."
              : "Video load nahi ho paaya. Internet check karke Retry dabayein.";
            self._showError(msg);
          },
          onPlaybackQualityChange: (e) => { self.quality = e.data; self._refreshChips(); },
          onPlaybackRateChange: (e) => { self.speed = e.data; self._refreshChips(); }
        }
      });
    }).catch(() => self._showError("YouTube player load nahi hua. Internet check karein."));
  };

  /* ---------- state ---------- */
  HrryPlayer.prototype._onState = function (s) {
    const root = this.root, el = this.el;
    root.classList.toggle("buffering", s === 3);
    const playing = s === 1;
    root.classList.toggle("playing", playing);
    const icon = playing ? "fa-pause" : "fa-play";
    el.toggle.innerHTML = `<i class="fa-solid ${icon}"></i>`;
    if (s === 1 || s === 3) {
      if (!this.started) { this.started = true; el.poster.classList.add("hide"); }
      if (!this.duration || this.duration < 1) {
        this.duration = this.yt.getDuration() || 0;
        el.dur.textContent = fmt(this.duration);
      }
      this._startTick();
    }
    if (s === 1) this._autoHide();
    if (s === 2) { this._stopTick(); this._showUI(true); }
    if (s === 0) {
      // end: YouTube ke suggestions na dikhein
      this._stopTick();
      this._showUI(true);
      try { this.yt.seekTo(0, true); this.yt.pauseVideo(); } catch (e) {}
    }
    this._refreshChips();
  };

  HrryPlayer.prototype._startTick = function () {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this._tick(), 250);
  };
  HrryPlayer.prototype._stopTick = function () {
    clearInterval(this.tickTimer); this.tickTimer = null;
  };
  HrryPlayer.prototype._tick = function () {
    if (!this.yt || !this.ready || this.dragging) return;
    const t = this.yt.getCurrentTime() || 0;
    const d = this.yt.getDuration() || this.duration || 0;
    if (d && d !== this.duration) { this.duration = d; this.el.dur.textContent = fmt(d); }
    this._paint(t);
    const f = this.yt.getVideoLoadedFraction ? this.yt.getVideoLoadedFraction() : 0;
    this.el.buf.style.width = (f * 100) + "%";
  };
  HrryPlayer.prototype._paint = function (t) {
    const d = this.duration || 1;
    const pct = Math.min(100, Math.max(0, (t / d) * 100));
    this.el.prog.style.width = pct + "%";
    this.el.thumb.style.left = pct + "%";
    this.el.cur.textContent = fmt(t);
    this.el.seek.setAttribute("aria-valuenow", Math.round(pct));
  };

  /* ---------- actions ---------- */
  HrryPlayer.prototype.play = function () { if (this.yt && this.ready) this.yt.playVideo(); };
  HrryPlayer.prototype.pause = function () { if (this.yt && this.ready) this.yt.pauseVideo(); };
  HrryPlayer.prototype.togglePlay = function () {
    if (!this.yt || !this.ready) return;
    const st = this.yt.getPlayerState();
    if (st === 1 || st === 3) this.pause(); else this.play();
  };
  HrryPlayer.prototype.seekBy = function (delta) {
    if (!this.yt || !this.ready) return;
    const t = Math.min(Math.max(0, this.yt.getCurrentTime() + delta), this.duration || 1e9);
    this.yt.seekTo(t, true);
    this._paint(t);
  };
  HrryPlayer.prototype._flash = function (side) {
    const f = side === "l" ? this.el.flashL : this.el.flashR;
    f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
  };

  /* ---------- UI show/hide ---------- */
  HrryPlayer.prototype._showUI = function (keep) {
    this.root.classList.add("show-ui");
    clearTimeout(this.hideTimer);
    if (!keep) this._autoHide();
  };
  HrryPlayer.prototype._autoHide = function () {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      if (this.root.classList.contains("playing") && !this.el.sheet.classList.contains("open") && !this.dragging) {
        this.root.classList.remove("show-ui");
      }
    }, 3200);
  };

  /* ---------- sheet (speed / quality) ---------- */
  HrryPlayer.prototype._openSheet = function (kind) {
    const sh = this.el.sheet;
    if (sh.classList.contains("open") && sh.dataset.kind === kind) { this._closeSheet(); return; }
    let html = "";
    if (kind === "speed") {
      let rates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
      try { const r = this.yt.getAvailablePlaybackRates(); if (r && r.length) rates = r.filter(x => x >= 0.5 && x <= 2); } catch (e) {}
      html = `<h5>Playback speed</h5>` + rates.map(r =>
        `<button class="hp-opt ${r === this.speed ? "active" : ""}" data-rate="${r}">${r === 1 ? "Normal" : r + "x"}${r === this.speed ? '<i class="fa-solid fa-check hp-tick"></i>' : ""}</button>`
      ).join("");
    } else {
      let levels = [];
      try { levels = this.yt.getAvailableQualityLevels() || []; } catch (e) {}
      levels = levels.filter(l => l !== "auto" && l !== "highres");
      if (!levels.length) levels = ["hd1080", "hd720", "large", "medium", "small", "tiny"];
      const cur = this.quality === "unknown" ? "auto" : this.quality;
      html = `<h5>Video quality</h5>` +
        `<button class="hp-opt ${this._qSel === "auto" || !this._qSel ? "active" : ""}" data-q="auto">Auto${(this._qSel === "auto" || !this._qSel) ? '<i class="fa-solid fa-check hp-tick"></i>' : ""}</button>` +
        levels.map(l => `<button class="hp-opt ${this._qSel === l ? "active" : ""}" data-q="${l}">${qLabel(l)}${this._qSel === l ? '<i class="fa-solid fa-check hp-tick"></i>' : ""}</button>`).join("") +
        `<div class="hp-sheet-note">Network ke hisab se YouTube quality khud badal sakta hai.</div>`;
    }
    sh.innerHTML = html;
    sh.dataset.kind = kind;
    sh.classList.add("open");
    this._showUI(true);
  };
  HrryPlayer.prototype._closeSheet = function () {
    this.el.sheet.classList.remove("open");
    if (this.root.classList.contains("playing")) this._autoHide();
  };
  HrryPlayer.prototype._refreshChips = function () {
    this.el.speedBtn.querySelector("span").textContent = (this.speed === 1 ? "1" : this.speed) + "x";
    const sel = this._qSel;
    this.el.qualBtn.querySelector("span").textContent = !sel || sel === "auto" ? "Auto" : qLabel(sel);
  };

  /* ---------- fullscreen + orientation ---------- */
  HrryPlayer.prototype._isFs = function () {
    return !!(document.fullscreenElement || document.webkitFullscreenElement) || this.pseudoFs;
  };
  HrryPlayer.prototype._lockOrientation = function (type) {
    try {
      if (screen.orientation && screen.orientation.lock) return screen.orientation.lock(type).catch(() => {});
    } catch (e) {}
    return Promise.resolve();
  };
  HrryPlayer.prototype._unlockOrientation = function () {
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
  };
  HrryPlayer.prototype.enterFs = function () {
    const r = this.root;
    const req = r.requestFullscreen || r.webkitRequestFullscreen;
    if (req) {
      const p = req.call(r);
      const after = () => { this._lockOrientation("landscape"); };
      if (p && p.then) p.then(after).catch(() => this._pseudoFs(true)); else after();
    } else {
      this._pseudoFs(true);
    }
  };
  HrryPlayer.prototype.exitFs = function () {
    if (this.pseudoFs) { this._pseudoFs(false); return; }
    const ex = document.exitFullscreen || document.webkitExitFullscreen;
    this._lockOrientation("portrait").then(() => {
      if (ex && (document.fullscreenElement || document.webkitFullscreenElement)) {
        const p = ex.call(document); if (p && p.catch) p.catch(() => {});
      }
      setTimeout(() => this._unlockOrientation(), 400);
    });
  };
  HrryPlayer.prototype._pseudoFs = function (on) {
    // iPhone/Safari jaisi jagah jahan div fullscreen nahi hota
    this.pseudoFs = on;
    this.root.classList.toggle("pseudo-fs", on);
    document.body.style.overflow = on ? "hidden" : "";
    if (on) this._lockOrientation("landscape"); else this._unlockOrientation();
    this._syncFsUI();
  };
  HrryPlayer.prototype._syncFsUI = function () {
    const fs = this._isFs();
    this.el.fs.innerHTML = `<i class="fa-solid ${fs ? "fa-compress" : "fa-expand"}"></i>`;
    this.el.fs.setAttribute("aria-label", fs ? "Exit fullscreen" : "Fullscreen");
    this.el.rotate.style.display = fs ? "flex" : "none";
  };
  HrryPlayer.prototype._rotate = function () {
    const o = screen.orientation && screen.orientation.type;
    const isLand = o ? o.indexOf("landscape") === 0 : window.innerWidth > window.innerHeight;
    this._lockOrientation(isLand ? "portrait" : "landscape");
  };

  /* ---------- error ---------- */
  HrryPlayer.prototype._showError = function (msg) {
    this.el.errMsg.textContent = msg;
    this.el.err.classList.add("show");
  };

  /* ---------- UI bindings ---------- */
  HrryPlayer.prototype._bindUI = function () {
    const self = this, el = this.el, root = this.root;

    el.bigPlay.addEventListener("click", () => { self.play(); });
    el.poster.addEventListener("click", () => { self.play(); });

    el.toggle.addEventListener("click", (e) => { e.stopPropagation(); self.togglePlay(); self._showUI(); });
    root.querySelectorAll("[data-seek]").forEach(b => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const d = parseInt(b.dataset.seek, 10);
      self.seekBy(d); self._flash(d < 0 ? "l" : "r"); self._showUI();
    }));

    // shield: single tap = show/hide UI, double tap left/right = +-10s
    el.shield.addEventListener("click", (e) => {
      if (!self.started) { self.play(); return; }
      if (el.sheet.classList.contains("open")) { self._closeSheet(); return; }
      const rect = root.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const now = Date.now();
      if (now - self.lastTap.t < 280 && Math.abs(x - self.lastTap.x) < 0.25 && (x < 0.38 || x > 0.62)) {
        clearTimeout(self.tapTimer);
        const side = x < 0.5 ? "l" : "r";
        self.seekBy(side === "l" ? -10 : 10); self._flash(side);
        self.lastTap.t = 0;
        return;
      }
      self.lastTap = { t: now, x };
      clearTimeout(self.tapTimer);
      self.tapTimer = setTimeout(() => {
        if (root.classList.contains("show-ui") && root.classList.contains("playing")) root.classList.remove("show-ui");
        else self._showUI();
      }, 260);
    });
    root.addEventListener("mousemove", () => { if (root.classList.contains("playing")) self._showUI(); });

    // timeline (pointer events -> mouse + touch)
    const posToTime = (clientX) => {
      const r = el.seek.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      return { p, t: p * (self.duration || 0) };
    };
    el.seek.addEventListener("pointerdown", (e) => {
      if (!self.ready) return;
      self.dragging = true;
      el.seek.classList.add("drag");
      el.seek.setPointerCapture(e.pointerId);
      const { p, t } = posToTime(e.clientX);
      self._paint(t); el.tip.style.left = (p * 100) + "%"; el.tip.textContent = fmt(t);
      self._showUI(true);
    });
    el.seek.addEventListener("pointermove", (e) => {
      if (!self.dragging) return;
      const { p, t } = posToTime(e.clientX);
      self._paint(t); el.tip.style.left = (p * 100) + "%"; el.tip.textContent = fmt(t);
    });
    const endDrag = (e) => {
      if (!self.dragging) return;
      const { t } = posToTime(e.clientX);
      self.dragging = false;
      el.seek.classList.remove("drag");
      try { self.yt.seekTo(t, true); } catch (err) {}
      self._paint(t);
      self._autoHide();
    };
    el.seek.addEventListener("pointerup", endDrag);
    el.seek.addEventListener("pointercancel", () => { self.dragging = false; el.seek.classList.remove("drag"); });

    // volume
    el.mute.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!self.yt || !self.ready) return;
      if (self.yt.isMuted()) { self.yt.unMute(); } else { self.yt.mute(); }
      el.mute.innerHTML = `<i class="fa-solid ${self.yt.isMuted() ? "fa-volume-xmark" : "fa-volume-high"}"></i>`;
    });
    el.vol.addEventListener("input", () => {
      if (!self.yt || !self.ready) return;
      const v = parseInt(el.vol.value, 10);
      self.yt.setVolume(v);
      if (v === 0) self.yt.mute(); else self.yt.unMute();
      el.mute.innerHTML = `<i class="fa-solid ${v === 0 ? "fa-volume-xmark" : "fa-volume-high"}"></i>`;
    });

    // speed & quality
    el.speedBtn.addEventListener("click", (e) => { e.stopPropagation(); if (self.ready) self._openSheet("speed"); });
    el.qualBtn.addEventListener("click", (e) => { e.stopPropagation(); if (self.ready) self._openSheet("quality"); });
    el.sheet.addEventListener("click", (e) => {
      e.stopPropagation();
      const b = e.target.closest(".hp-opt");
      if (!b) return;
      if (b.dataset.rate) {
        const r = parseFloat(b.dataset.rate);
        self.speed = r; try { self.yt.setPlaybackRate(r); } catch (err) {}
      } else if (b.dataset.q) {
        self._qSel = b.dataset.q;
        try {
          const t = self.yt.getCurrentTime();
          // setPlaybackQuality sirf hint hai; kuch videos pe YouTube ignore kar deta hai
          self.yt.setPlaybackQuality(b.dataset.q);
          if (b.dataset.q !== "auto") {
            // quality change ko jaldi apply karwane ke liye same jagah se reload
            self.yt.loadVideoById({ videoId: self.videoId, startSeconds: t, suggestedQuality: b.dataset.q });
          } else {
            self.yt.loadVideoById({ videoId: self.videoId, startSeconds: t });
          }
          setTimeout(() => { try { self.yt.setPlaybackRate(self.speed); } catch (err) {} }, 600);
        } catch (err) {}
      }
      self._refreshChips();
      self._closeSheet();
    });

    // fullscreen + rotate
    el.fs.addEventListener("click", (e) => { e.stopPropagation(); self._isFs() ? self.exitFs() : self.enterFs(); });
    el.rotate.addEventListener("click", (e) => { e.stopPropagation(); self._rotate(); });
    const onFsChange = () => { self._syncFsUI(); if (!document.fullscreenElement && !document.webkitFullscreenElement) self._unlockOrientation(); };
    this._on(document, "fullscreenchange", onFsChange);
    this._on(document, "webkitfullscreenchange", onFsChange);

    // retry
    el.retry.addEventListener("click", () => {
      el.err.classList.remove("show");
      if (self.yt && self.yt.destroy) { try { self.yt.destroy(); } catch (e) {} }
      self.root.querySelector(".hp-stage").innerHTML = '<div class="hp-yt"></div>';
      self.el.ytHost = self.root.querySelector(".hp-yt");
      self.started = false; self.ready = false;
      self.el.poster.classList.remove("hide");
      self._init();
    });

    // keyboard
    this._on(root, "keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); self.togglePlay(); break;
        case "ArrowRight": case "l": e.preventDefault(); self.seekBy(10); self._flash("r"); break;
        case "ArrowLeft": case "j": e.preventDefault(); self.seekBy(-10); self._flash("l"); break;
        case "f": e.preventDefault(); self._isFs() ? self.exitFs() : self.enterFs(); break;
        case "m": el.mute.click(); break;
        case "Escape": if (self.pseudoFs) self.exitFs(); break;
      }
      self._showUI();
    });
  };

  HrryPlayer.prototype.destroy = function () {
    this.destroyed = true;
    clearInterval(this.tickTimer); clearTimeout(this.hideTimer); clearTimeout(this.tapTimer);
    this._cleanup.forEach(fn => fn());
    this._cleanup = [];
    if (this._isFs()) {
      try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) {}
      document.body.style.overflow = "";
      this._unlockOrientation();
    }
    try { if (this.yt && this.yt.destroy) this.yt.destroy(); } catch (e) {}
    this.yt = null;
  };

  window.HrryPlayer = HrryPlayer;
})();
