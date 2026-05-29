

const API_BASE = "/api";

/* ── State ── */
const state = {
  query: "",
  page: 1,
  perPage: 10,
  yearFrom: "",
  yearTo: "",
  pubTypes: [],
  openAccess: false,
  sort: "relevance",
  activeFields: [],
  allFieldsOfStudy: [],
  totalResults: 0,
  totalPages: 1,
  papers: [],
  loading: false,
};

/* ── DOM refs ── */
const searchInput   = document.getElementById("search-input");
const btnGo         = document.getElementById("btn-go");
const yearFromInput = document.getElementById("year-from");
const yearToInput   = document.getElementById("year-to");
const openAccessChk = document.getElementById("open-access");
const sortRadios    = document.querySelectorAll('input[name="sort"]');
const pubTypeChks   = document.querySelectorAll('.pub-type-chk');
const btnApply      = document.getElementById("btn-apply");
const perPageSelect = document.getElementById("per-page");
const cardsGrid     = document.getElementById("cards-grid");
const paginationEl  = document.getElementById("pagination");
const resultsCount  = document.getElementById("results-count");
const tagsContainer = document.getElementById("tags-container");
const modalOverlay  = document.getElementById("modal-overlay");
const modalClose    = document.getElementById("modal-close");
const toast         = document.getElementById("toast");

/*Event listeners*/
btnGo.addEventListener("click", handleSearch);
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") handleSearch(); });
btnApply.addEventListener("click", () => { state.page = 1; fetchResults(); });
perPageSelect.addEventListener("change", () => {
  state.perPage = parseInt(perPageSelect.value);
  state.page = 1;
  fetchResults();
});
modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

/*Search trigger*/
function handleSearch() {
  const q = searchInput.value.trim();
  if (!q) { showToast("Please enter a search query.", "error"); return; }
  state.query = q;
  state.page = 1;
  state.activeFields = [];
  fetchResults();
}

/*Fetch from backend*/
async function fetchResults() {
  if (!state.query) return;

  // Read filter state
  state.yearFrom   = yearFromInput.value.trim();
  state.yearTo     = yearToInput.value.trim();
  state.openAccess = openAccessChk.checked;
  state.sort       = [...sortRadios].find(r => r.checked)?.value || "relevance";
  state.pubTypes   = [...pubTypeChks].filter(c => c.checked).map(c => c.value);
  state.perPage    = parseInt(perPageSelect.value);

  const params = new URLSearchParams({
    q:        state.query,
    page:     state.page,
    per_page: state.perPage,
    sort:     state.sort,
  });

  if (state.yearFrom)  params.set("year_from", state.yearFrom);
  if (state.yearTo)    params.set("year_to",   state.yearTo);
  if (state.openAccess) params.set("open_access", "true");
  if (state.pubTypes.length) params.set("pub_types", state.pubTypes.join(","));
  if (state.activeFields.length) params.set("fields", state.activeFields.join(","));

  setLoading(true);

  try {
    const res  = await fetch(`${API_BASE}/search/?${params}`);
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Search failed. Please try again.", "error");
      renderEmpty("Search failed. Please try again.");
      return;
    }

    state.papers       = data.papers || [];
    state.totalResults = data.pagination.total;
    state.totalPages   = data.pagination.total_pages;
    state.allFieldsOfStudy = data.fields_of_study || [];

    renderCards();
    renderPagination();
    renderFieldTags();
    updateResultsCount();

  } catch (err) {
    console.error(err);
    showToast("Could not connect to the server.", "error");
    renderEmpty("Could not connect to the server.");
  } finally {
    setLoading(false);
  }
}

/*Render helpers*/
function renderCards() {
  cardsGrid.innerHTML = "";

  if (!state.papers.length) {
    renderEmpty("No results found. Try a different query or adjust filters.");
    return;
  }

  state.papers.forEach((paper, idx) => {
    const card = buildCard(paper, idx);
    cardsGrid.appendChild(card);
  });
}

function buildCard(paper, idx) {
  const card = document.createElement("div");
  card.className = "paper-card";
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", `View details for ${paper.title}`);

  const authors = formatAuthors(paper.authors, 3);
  const meta    = formatMeta(paper.year, paper.venue);
  const cites   = paper.citation_count != null
    ? `Cited by <strong>${paper.citation_count.toLocaleString()}</strong>`
    : "";

  card.innerHTML = `
    <span class="card-pub-type">${escHtml(paper.pub_type || "Article")}</span>
    <div class="card-title">${escHtml(paper.title)}</div>
    <div class="card-authors">${escHtml(authors)}</div>
    <div class="card-meta">${escHtml(meta)}</div>
    ${cites ? `<div class="card-citations">${cites}</div>` : ""}
    <div class="card-actions">
      <a href="${escHtml(paper.paper_url || '#')}" target="_blank" rel="noopener"
         onclick="event.stopPropagation()">Preview</a>
      <button onclick="event.stopPropagation(); handleAddToLibrary(${idx})">
        Add to Library
      </button>
    </div>
  `;

  card.addEventListener("click", () => openModal(paper));
  card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") openModal(paper); });

  return card;
}

function renderEmpty(msg) {
  cardsGrid.innerHTML = `
    <div class="state-box">
      <span class="icon">🔍</span>
      <p>${escHtml(msg)}</p>
    </div>`;
}

function updateResultsCount() {
  if (!state.totalResults) {
    resultsCount.textContent = "No results found.";
    return;
  }
  const start = (state.page - 1) * state.perPage + 1;
  const end   = Math.min(state.page * state.perPage, state.totalResults);
  resultsCount.innerHTML =
    `Showing <strong>${start}–${end}</strong> of <strong>${state.totalResults.toLocaleString()}</strong> results for "<strong>${escHtml(state.query)}</strong>"`;
}

/*Pagination*/
function renderPagination() {
  paginationEl.innerHTML = "";
  if (state.totalPages <= 1) return;

  const pages = getPageNumbers(state.page, state.totalPages);

  // Prev button
  const prev = pageBtn("‹ Prev", state.page <= 1, () => goToPage(state.page - 1));
  paginationEl.appendChild(prev);

  pages.forEach(p => {
    if (p === "…") {
      const el = document.createElement("span");
      el.className = "page-ellipsis";
      el.textContent = "…";
      paginationEl.appendChild(el);
    } else {
      const btn = pageBtn(p, false, () => goToPage(p), p === state.page);
      paginationEl.appendChild(btn);
    }
  });

  // Next button
  const next = pageBtn("Next ›", state.page >= state.totalPages, () => goToPage(state.page + 1));
  paginationEl.appendChild(next);
}

function pageBtn(label, disabled, onClick, active = false) {
  const btn = document.createElement("button");
  btn.className = "page-btn" + (active ? " active" : "");
  btn.textContent = label;
  btn.disabled = disabled;
  if (!disabled && !active) btn.addEventListener("click", onClick);
  return btn;
}

function goToPage(p) {
  state.page = p;
  fetchResults();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total-4, total-3, total-2, total-1, total];
  return [1, "…", current-1, current, current+1, "…", total];
}

/*Dynamic field-of-study tags*/
function renderFieldTags() {
  tagsContainer.innerHTML = "";

  if (!state.allFieldsOfStudy.length) {
    tagsContainer.innerHTML = `<span class="tags-placeholder">Search to see fields…</span>`;
    return;
  }

  state.allFieldsOfStudy.forEach(field => {
    const tag = document.createElement("span");
    tag.className = "tag" + (state.activeFields.includes(field) ? " active" : "");
    tag.textContent = field;
    tag.addEventListener("click", () => toggleField(field, tag));
    tagsContainer.appendChild(tag);
  });
}

function toggleField(field, el) {
  if (state.activeFields.includes(field)) {
    state.activeFields = state.activeFields.filter(f => f !== field);
    el.classList.remove("active");
  } else {
    state.activeFields.push(field);
    el.classList.add("active");
  }
  state.page = 1;
  fetchResults();
}

/*Modal*/
function openModal(paper) {
  document.getElementById("modal-pub-type").textContent  = paper.pub_type || "Article";
  document.getElementById("modal-title").textContent     = paper.title;
  document.getElementById("modal-authors").textContent   = formatAuthors(paper.authors);
  document.getElementById("modal-meta").textContent      = formatMeta(paper.year, paper.venue);

  const citesEl = document.getElementById("modal-citations");
  citesEl.textContent = paper.citation_count != null
    ? `Cited by ${paper.citation_count.toLocaleString()}`
    : "";

  const abstractEl = document.getElementById("modal-abstract");
  abstractEl.textContent = paper.abstract || "No abstract available.";

  // Preview link
  const previewBtn = document.getElementById("modal-preview");
  previewBtn.href = paper.paper_url || "#";
  previewBtn.style.display = paper.paper_url ? "" : "none";

  // Add to Library
  const libBtn = document.getElementById("modal-library");
  libBtn.onclick = () => { handleAddToLibraryDirect(paper); closeModal(); };

  modalOverlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modalOverlay.classList.remove("open");
  document.body.style.overflow = "";
}

/*Add to Library*/
function handleAddToLibrary(idx) {
  handleAddToLibraryDirect(state.papers[idx]);
}

async function handleAddToLibraryDirect(paper) {
  if (paper.pdf_url) {
    // Download the PDF
    try {
      showToast("Downloading PDF…");
      const a = document.createElement("a");
      a.href = paper.pdf_url;
      a.download = sanitizeFilename(paper.title) + ".pdf";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast("PDF download started!", "success");
    } catch {
      showToast("Could not download PDF. Saving metadata instead.", "error");
      saveMetadata(paper);
    }
  } else {
    saveMetadata(paper);
  }
}

function saveMetadata(paper) {
  // Save paper metadata as a JSON file
  const blob = new Blob([JSON.stringify(paper, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = sanitizeFilename(paper.title) + "_metadata.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("No PDF available — metadata saved.", "success");
}

/*Loading state*/
function setLoading(on) {
  state.loading = on;
  if (on) {
    cardsGrid.innerHTML = `
      <div class="state-box">
        <div class="spinner"></div>
        <p>Searching…</p>
      </div>`;
    paginationEl.innerHTML = "";
    resultsCount.textContent = "";
  }
}

/*Toast*/
let toastTimer;
function showToast(msg, type = "") {
  toast.textContent = msg;
  toast.className = "toast show" + (type ? ` ${type}` : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3200);
}

/*Utility helpers*/
function formatAuthors(authors, max = null) {
  if (!authors || !authors.length) return "Unknown Authors";
  const list = max && authors.length > max
    ? [...authors.slice(0, max), `+${authors.length - max} more`]
    : authors;
  return list.join(", ");
}

function formatMeta(year, venue) {
  const parts = [];
  if (year)  parts.push(year);
  if (venue) parts.push(venue);
  return parts.join(" · ") || "—";
}

function sanitizeFilename(str) {
  return (str || "paper").replace(/[^a-zA-Z0-9_\-\s]/g, "").replace(/\s+/g, "_").slice(0, 80);
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
