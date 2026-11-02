// DB_URL comes from config.js
let studyData = { courses: {} };
let navStack = [];

// Current selection state
let currentCourseId = null;
let currentSubjectId = null;
let currentChapterId = null;
let currentLectureIndex = 0;
let activePlayer = null;

function destroyPlayer() {
  if (activePlayer) { activePlayer.destroy(); activePlayer = null; }
}

/* ---------------- Helpers ---------------- */

function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasValue(v) {
  return typeof v === "string" && v.trim() !== "";
}

// Two-letter code for subject (SC, MA, EN, HI ...)
function subjectInitials(title) {
  const clean = (title || "").trim();
  return (clean ? clean.substring(0, 2) : "--").toUpperCase();
}

function extractYouTubeId(url) {
  if (!url) return "";
  if (window.parseVideoSource) { const p = window.parseVideoSource(url); return p.type === "youtube" ? p.id : ""; }
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regExp);
  return match && match[1] ? match[1] : "";
}

function getYouTubeEmbedUrl(url) {
  const vidId = extractYouTubeId(url);
  if (vidId) {
    return `https://www.youtube.com/embed/${vidId}?rel=0&modestbranding=1&playsinline=1&autoplay=1`;
  }
  return url;
}

// Returns admin thumbnail if given, otherwise the video's own YouTube thumbnail, otherwise ""
function getYouTubeThumb(url, adminThumb) {
  if (hasValue(adminThumb)) return adminThumb;
  const vidId = extractYouTubeId(url);
  return vidId ? `https://img.youtube.com/vi/${vidId}/hqdefault.jpg` : "";
}

function countSubjectFiles(subjectObj) {
  if (!subjectObj || !subjectObj.chapters) return { totalFiles: 0, totalLectures: 0, totalChapters: 0 };
  let totalFiles = 0;
  let totalLectures = 0;
  const chapKeys = Object.keys(subjectObj.chapters);
  chapKeys.forEach(cKey => {
    const chap = subjectObj.chapters[cKey];
    if (chap && chap.lectures) {
      Object.values(chap.lectures).forEach(lec => {
        totalLectures += 1;
        totalFiles += 1;
        if (lec.notesUrl && lec.notesUrl.trim() !== "") totalFiles += 1;
      });
    }
  });
  return { totalFiles, totalLectures, totalChapters: chapKeys.length };
}

/* ---------------- Data ---------------- */

async function loadDatabase() {
  try {
    const res = await fetch(`${DB_URL}/studyPortal.json`);
    const data = await res.json();
    studyData = data && data.courses ? data : { courses: {} };
    renderCoursesView();
  } catch (err) {
    document.getElementById("appView").innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation" style="font-size:32px;color:#FF453A;margin-bottom:10px;"></i>
        <h3>Connection Error</h3>
        <p>Unable to load data from Firebase Realtime Database.</p>
      </div>`;
  }
}

/* ---------------- Navigation ---------------- */

function updateHeader(title, showBack, breadcrumbHtml) {
  destroyPlayer();
  document.getElementById("headerTitle").innerText = title;
  document.getElementById("backBtn").style.display = showBack ? "flex" : "none";
  document.getElementById("breadcrumbBar").innerHTML = breadcrumbHtml || "";
}

function goBack() {
  if (navStack.length > 0) {
    const prevAction = navStack.pop();
    prevAction();
  }
}

function toggleEnroll(courseId, btnEl) {
  let enrolledList = JSON.parse(localStorage.getItem("enrolled_courses") || "[]");
  if (enrolledList.includes(courseId)) {
    enrolledList = enrolledList.filter(id => id !== courseId);
    btnEl.classList.remove("enrolled");
    btnEl.innerHTML = `<i class="fa-solid fa-plus"></i> Enroll`;
  } else {
    enrolledList.push(courseId);
    btnEl.classList.add("enrolled");
    btnEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Enrolled`;
  }
  localStorage.setItem("enrolled_courses", JSON.stringify(enrolledList));
}

/* ---------------- 1. Courses ---------------- */

function renderCoursesView() {
  navStack = [];
  updateHeader("Study Portal", false, `<i class="fa-solid fa-house"></i> <span>Home / All Courses</span>`);
  const courses = studyData.courses || {};
  const courseKeys = Object.keys(courses);

  if (courseKeys.length === 0) {
    document.getElementById("appView").innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-graduation-cap" style="font-size:40px;color:var(--primary);margin-bottom:12px;"></i>
        <h3>No Courses Published Yet</h3>
        <p style="margin-top:6px;">Add courses, subjects, chapters, and unlisted YouTube lectures from your Admin App.</p>
      </div>`;
    return;
  }

  const enrolledList = JSON.parse(localStorage.getItem("enrolled_courses") || "[]");
  let html = `
    <h2 class="section-heading">Explore Batches & Courses</h2>
    <p class="section-sub">Select your course and start learning with structured chapters & notes</p>
    <div class="grid-cards">
  `;

  courseKeys.forEach(cId => {
    const c = courses[cId];
    const isEnrolled = enrolledList.includes(cId);
    const subjCount = c.subjects ? Object.keys(c.subjects).length : 0;
    const thumbHtml = hasValue(c.thumbnail)
      ? `<img src="${esc(c.thumbnail)}" alt="${esc(c.title || 'Course')}" onerror="this.remove()">`
      : "";

    html += `
      <div class="glass-card">
        <div class="card-thumb-wrap">
          ${thumbHtml}
          <div class="card-badge">${esc(c.name || 'BATCH')}</div>
          <div class="file-count-badge"><i class="fa-solid fa-layer-group"></i> ${subjCount} Subjects</div>
        </div>
        <div class="card-body">
          <div class="course-tag">${esc(c.name || 'Premium Course')}</div>
          <div class="card-title">${esc(c.title || 'Untitled Course')}</div>
          <div class="card-desc">${esc(c.description || 'Complete syllabus coverage with high-quality lectures and chapter-wise PDF study notes.')}</div>
          <div class="btn-row">
            <button class="btn btn-enroll ${isEnrolled ? 'enrolled' : ''}" onclick="toggleEnroll('${cId}', this)">
              <i class="fa-solid ${isEnrolled ? 'fa-circle-check' : 'fa-plus'}"></i>
              ${isEnrolled ? 'Enrolled' : 'Enroll'}
            </button>
            <button class="btn btn-primary" onclick="openSubjectsView('${cId}')">
              Let's Study <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  document.getElementById("appView").innerHTML = html;
}

/* ---------------- 2. Subjects (compact rows) ---------------- */

function openSubjectsView(courseId) {
  navStack.push(() => renderCoursesView());
  currentCourseId = courseId;
  const course = studyData.courses[courseId];
  if (!course) return renderCoursesView();

  updateHeader(
    course.name || "Subjects",
    true,
    `<i class="fa-solid fa-house"></i> Home <i class="fa-solid fa-chevron-right" style="font-size:10px;"></i> <span>${esc(course.title)}</span>`
  );

  const subjects = course.subjects || {};
  const subjKeys = Object.keys(subjects);

  if (subjKeys.length === 0) {
    document.getElementById("appView").innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-folder-open" style="font-size:36px;color:var(--primary);margin-bottom:10px;"></i>
        <h3>No Subjects Found</h3>
        <p>Subjects have not been added to this course yet.</p>
      </div>`;
    return;
  }

  let html = `
    <h2 class="section-heading">${esc(course.title)} - All Subjects</h2>
    <p class="section-sub">Choose a subject to view its chapters and lectures</p>
    <div class="subject-list">
  `;

  subjKeys.forEach(sId => {
    const subj = subjects[sId];
    const counts = countSubjectFiles(subj);
    const initials = subjectInitials(subj.title);

    // Admin ne photo dali ho to photo, warna sirf 2 letters (koi default image nahi)
    const iconInner = hasValue(subj.thumbnail)
      ? `<img src="${esc(subj.thumbnail)}" alt="${esc(subj.title)}" onerror="this.replaceWith(document.createTextNode('${esc(initials)}'))">`
      : esc(initials);

    html += `
      <div class="subject-row" onclick="openChaptersView('${courseId}', '${sId}')">
        <div class="subject-icon">${iconInner}</div>
        <div class="subject-info">
          <div class="subject-name">${esc(subj.title || 'Subject')}</div>
          <div class="subject-meta">${counts.totalChapters} Chapters • ${counts.totalLectures} Lectures</div>
        </div>
        <i class="fa-solid fa-chevron-right subject-arrow"></i>
      </div>
    `;
  });

  html += `</div>`;
  document.getElementById("appView").innerHTML = html;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------------- 3. Chapters ---------------- */

function openChaptersView(courseId, subjectId) {
  navStack.push(() => openSubjectsView(courseId));
  currentCourseId = courseId;
  currentSubjectId = subjectId;

  const course = studyData.courses[courseId];
  const subject = course?.subjects?.[subjectId];
  if (!subject) return openSubjectsView(courseId);

  updateHeader(
    subject.title || "Chapters",
    true,
    `Home <i class="fa-solid fa-chevron-right" style="font-size:10px;"></i> ${esc(course.name)} <i class="fa-solid fa-chevron-right" style="font-size:10px;"></i> <span>${esc(subject.title)}</span>`
  );

  const chapters = subject.chapters || {};
  const chapKeys = Object.keys(chapters);

  if (chapKeys.length === 0) {
    document.getElementById("appView").innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-list-check" style="font-size:36px;color:var(--primary);margin-bottom:10px;"></i>
        <h3>No Chapters Available</h3>
        <p>Chapters will appear here once added from the Admin Panel.</p>
      </div>`;
    return;
  }

  let html = `
    <h2 class="section-heading">${esc(subject.title)} - Chapters</h2>
    <p class="section-sub">Select a chapter to watch auto-numbered lectures (Lec 1, 2, 3...) & read notes</p>
    <div class="chapter-list">
  `;

  chapKeys.forEach((chId, idx) => {
    const chap = chapters[chId];
    const lecCount = chap.lectures ? Object.keys(chap.lectures).length : 0;

    html += `
      <div class="chapter-item" onclick="openLecturesView('${courseId}', '${subjectId}', '${chId}', 0)">
        <div class="chap-left">
          <div class="chap-index">CH ${idx + 1}</div>
          <div class="chap-info">
            <h4>${esc(chap.title || 'Chapter Name')}</h4>
            <p>Tap to view Lec 1 to Lec ${lecCount} & study notes</p>
          </div>
        </div>
        <div class="chap-badge">
          <i class="fa-solid fa-circle-play" style="color:var(--primary);"></i>
          ${lecCount} Lectures
        </div>
      </div>
    `;
  });

  html += `</div>`;
  document.getElementById("appView").innerHTML = html;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------------- 4. Lectures ---------------- */

function getOrderedLectures(chapterObj) {
  if (!chapterObj || !chapterObj.lectures) return [];
  const chapTitle = (chapterObj.title || "Chapter").trim();
  const rawLectures = Object.entries(chapterObj.lectures).map(([id, val]) => ({ id, ...val }));

  rawLectures.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  return rawLectures.map((lec, index) => {
    const lecNumber = index + 1;
    return {
      ...lec,
      lecNumber,
      ChapterTitle: chapTitle,
      autoTitle: `${chapTitle} Lec No. ${lecNumber}`
    };
  });
}

let currentLectures = [];
let currentChapterObj = null;

function notesBtnAttrs(lec) {
  return `onclick="event.stopPropagation(); openNotesModal('${encodeURIComponent(lec.autoTitle)}', '${encodeURIComponent(lec.notesUrl || '')}')"`;
}

// Active lecture ki details (badge, title, notes, external link)
function activeDetailsHtml(lec, chapter) {
  const src = window.parseVideoSource ? window.parseVideoSource(lec.videoUrl) : { type: "none" };
  const extBtn = src.type === "embed" && src.ext
    ? `<a class="ext-btn" href="${esc(src.ext)}" target="_blank" rel="noopener noreferrer" title="Naye tab me kholein"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>`
    : "";
  return `
    <div class="active-lec-meta">
      <div class="lec-pill-row">
        <span class="lec-num-badge">LEC NO. ${lec.lecNumber}</span>
        <span class="lec-chap-tag"><i class="fa-solid fa-bookmark"></i> ${esc(chapter.title)}</span>
      </div>
      <div class="active-lec-title">${esc(lec.autoTitle)}</div>
    </div>
    <div class="active-lec-actions">
      ${extBtn}
      <button class="notes-btn-small" style="padding:10px 16px;font-size:13.5px;" ${notesBtnAttrs(lec)}>
        <i class="fa-solid fa-file-pdf"></i> Notes
      </button>
    </div>`;
}

function lecCardHtml(lec, idx, isPlaying) {
  const thumbUrl = getYouTubeThumb(lec.videoUrl, lec.thumbnail);
  const thumbHtml = thumbUrl
    ? `<img src="${esc(thumbUrl)}" alt="Lec ${lec.lecNumber}" loading="lazy" draggable="false" onerror="this.remove()">`
    : "";
  return `
    <div class="lec-card ${isPlaying ? 'playing' : ''}" data-idx="${idx}" onclick="switchLecture(${idx})">
      <div class="mini-video-frame">
        ${thumbHtml}
        <div class="mini-play-overlay"><i class="fa-solid ${isPlaying ? 'fa-volume-high' : 'fa-play'}"></i></div>
        <div class="mini-lec-badge">Lec ${lec.lecNumber}</div>
      </div>
      <div class="lec-card-body">
        <div class="compact-lec-title">${esc(lec.autoTitle)}</div>
        <button class="notes-btn-small" ${notesBtnAttrs(lec)}>
          <i class="fa-solid fa-book-open"></i> Notes
        </button>
      </div>
    </div>`;
}

function mountLecturePlayer(lec, autoplay) {
  destroyPlayer();
  activePlayer = createLecturePlayer(document.getElementById("hpMount"), {
    url: lec.videoUrl,
    title: lec.autoTitle,
    poster: getYouTubeThumb(lec.videoUrl, lec.thumbnail),
    autoplay: autoplay
  });
}

// Active card ko carousel ke beech me laao (sirf carousel scroll hota hai, page nahi)
function centerActiveCard(smooth) {
  const car = document.getElementById("lecCarousel");
  const card = car && car.querySelector(".lec-card.playing");
  if (!car || !card) return;
  const left = card.offsetLeft - (car.clientWidth - card.offsetWidth) / 2;
  car.scrollTo({ left: Math.max(0, left), behavior: smooth ? "smooth" : "auto" });
}

function scrollLecCarousel(dir) {
  const car = document.getElementById("lecCarousel");
  if (car) car.scrollBy({ left: dir * car.clientWidth * 0.8, behavior: "smooth" });
}

function ensurePlayerVisible() {
  const w = document.querySelector(".player-wrapper");
  if (!w) return;
  const hdr = (document.querySelector("header") || {}).offsetHeight || 0;
  const r = w.getBoundingClientRect();
  if (r.top < hdr - 2 || r.top > window.innerHeight * 0.6) {
    window.scrollTo({ top: Math.max(0, window.scrollY + r.top - hdr - 6), behavior: "smooth" });
  }
}

function openLecturesView(courseId, subjectId, chapterId, activeIdx = 0, autoplay = false) {
  if (currentChapterId !== chapterId) {
    navStack.push(() => {
      currentChapterId = null;
      openChaptersView(courseId, subjectId);
    });
  }

  currentCourseId = courseId;
  currentSubjectId = subjectId;
  currentChapterId = chapterId;

  const course = studyData.courses[courseId];
  const subject = course?.subjects?.[subjectId];
  const chapter = subject?.chapters?.[chapterId];
  if (!chapter) return openChaptersView(courseId, subjectId);

  const lectures = getOrderedLectures(chapter);

  updateHeader(
    chapter.title || "Lectures",
    true,
    `${esc(subject.title)} <i class="fa-solid fa-chevron-right" style="font-size:10px;"></i> <span>${esc(chapter.title)}</span>`
  );

  if (lectures.length === 0) {
    currentLectures = [];
    document.getElementById("appView").innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-video-slash" style="font-size:36px;color:var(--primary);margin-bottom:10px;"></i>
        <h3>No Lectures Uploaded</h3>
        <p>Add video links (YouTube / embed / mp4) to this chapter from the Admin Panel.</p>
      </div>`;
    return;
  }

  activeIdx = Math.min(Math.max(0, activeIdx | 0), lectures.length - 1);
  currentLectureIndex = activeIdx;
  currentLectures = lectures;
  currentChapterObj = chapter;
  const activeLec = lectures[activeIdx];

  const html = `
    <div class="player-wrapper">
      <div class="player-frame" id="hpMount"></div>
      <div class="active-lec-details" id="activeLecDetails">${activeDetailsHtml(activeLec, chapter)}</div>
    </div>

    <div class="playlist-header">
      <span class="playlist-title">All Lectures in ${esc(chapter.title)}</span>
      <span class="playlist-ctrl">
        <span class="playlist-count">${lectures.length} Lectures</span>
        <button class="car-arrow" onclick="scrollLecCarousel(-1)" aria-label="Pichle lectures"><i class="fa-solid fa-chevron-left"></i></button>
        <button class="car-arrow" onclick="scrollLecCarousel(1)" aria-label="Agle lectures"><i class="fa-solid fa-chevron-right"></i></button>
      </span>
    </div>

    <div class="lec-carousel" id="lecCarousel">
      ${lectures.map((lec, idx) => lecCardHtml(lec, idx, idx === activeIdx)).join("")}
    </div>
    <div class="swipe-hint"><i class="fa-solid fa-hand-pointer"></i> Aur lectures ke liye left-right swipe karein</div>
  `;

  destroyPlayer();
  document.getElementById("appView").innerHTML = html;
  window.scrollTo(0, 0);

  mountLecturePlayer(activeLec, autoplay);
  centerActiveCard(false);
}

// Page dobara render nahi hota -> player flicker/gayab nahi hota
function switchLecture(newIndex) {
  if (!currentLectures.length) return;
  if (newIndex === currentLectureIndex && activePlayer) { ensurePlayerVisible(); return; }
  currentLectureIndex = newIndex;
  const lec = currentLectures[newIndex];

  document.getElementById("activeLecDetails").innerHTML = activeDetailsHtml(lec, currentChapterObj);
  document.querySelectorAll("#lecCarousel .lec-card").forEach(card => {
    const on = Number(card.dataset.idx) === newIndex;
    card.classList.toggle("playing", on);
    const ic = card.querySelector(".mini-play-overlay i");
    if (ic) ic.className = "fa-solid " + (on ? "fa-volume-high" : "fa-play");
  });

  mountLecturePlayer(lec, true);
  centerActiveCard(true);
  ensurePlayerVisible();
}

/* ---------------- Notes viewer ---------------- */

function openNotesModal(encodedTitle, encodedUrl) {
  const title = decodeURIComponent(encodedTitle);
  const url = decodeURIComponent(encodedUrl).trim();
  const modal = document.getElementById("notesModal");
  const viewerBody = document.getElementById("notesViewerBody");
  document.getElementById("notesModalTitle").innerText = `${title} - Study Notes`;

  if (!url) {
    viewerBody.innerHTML = `
      <div class="empty-state" style="max-width:450px;margin-top:60px;">
        <i class="fa-solid fa-file-circle-xmark" style="font-size:42px;color:var(--warning);margin-bottom:12px;"></i>
        <h3>Notes Not Uploaded Yet</h3>
        <p style="margin-top:6px;">The admin has not attached a notes link for <b>${esc(title)}</b> yet.</p>
      </div>`;
  } else {
    const isImage = /\.(jpeg|jpg|gif|png|webp)$/i.test(url);
    if (isImage) {
      viewerBody.innerHTML = `<img src="${esc(url)}" style="max-width:100%;border-radius:12px;border:1px solid var(--glass-border);" alt="Lecture Notes">`;
    } else {
      const onlinePdfUrl = url.includes("drive.google.com")
        ? url.replace(/\/view.*$/, "/preview")
        : `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;
      viewerBody.innerHTML = `
        <object data="${esc(onlinePdfUrl)}" type="text/html">
          <embed src="${esc(onlinePdfUrl)}" type="text/html" />
        </object>
      `;
    }
  }

  modal.classList.add("open");
}

function closeNotesModal() {
  document.getElementById("notesModal").classList.remove("open");
  document.getElementById("notesViewerBody").innerHTML = "";
}

/* ---------------- Init ---------------- */
function syncHeaderHeight() {
  const h = document.querySelector("header");
  if (h) document.documentElement.style.setProperty("--hdr-h", h.offsetHeight + "px");
}
window.addEventListener("resize", syncHeaderHeight);
window.addEventListener("orientationchange", syncHeaderHeight);
window.addEventListener("load", syncHeaderHeight);
window.addEventListener("DOMContentLoaded", () => {
  syncHeaderHeight();
  const hd = document.querySelector("header");
  if (hd && window.ResizeObserver) new ResizeObserver(syncHeaderHeight).observe(hd); // font/icons load hone par height badle to bhi sahi rahe
  loadDatabase();
});
