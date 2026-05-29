const API_BASE = "/api";

/* ── State ── */
// slots[0] and slots[1] always exist; slots[2] added by "+" button
const slots = [
  { paperId: null, el: null, fileInput: null, badge: null },
  { paperId: null, el: null, fileInput: null, badge: null },
];

const MAX_PAPERS = 3;

/* ── DOM refs ── */
const selectorsRow  = document.getElementById("selectors-row");
const btnAddPaper   = document.getElementById("btn-add-paper");
const btnCompare    = document.getElementById("btn-compare");
const tableSection  = document.getElementById("table-section");
const compareTable  = document.getElementById("compare-table");
const recommendation = document.getElementById("recommendation");
const recTitle      = document.getElementById("rec-title");
const recReason     = document.getElementById("rec-reason");
const btnExport     = document.getElementById("btn-export");
const placeholder   = document.getElementById("state-placeholder");
const toast         = document.getElementById("toast");

/*Init — populate dropdowns from DB*/
async function init() {
  // Wire up the two default selectors
  slots[0].el        = document.getElementById("select-0");
  slots[0].fileInput = document.getElementById("file-input-0");
  slots[0].badge     = document.getElementById("badge-0");

  slots[1].el        = document.getElementById("select-1");
  slots[1].fileInput = document.getElementById("file-input-1");
  slots[1].badge     = document.getElementById("badge-1");

  wireSlot(0);
  wireSlot(1);
  wireUploadBtn(0);
  wireUploadBtn(1);

  await populateDropdowns();
}

/*Fetch existing papers from DB*/
async function populateDropdowns() {
  let options = `<option value="">Select a paper…</option>
                 <option value="__upload__">📂 Upload new PDF…</option>`;
  try {
    const res  = await fetch(`${API_BASE}/compare/papers`);
    const data = await res.json();
    if (data.length) {
      options += `<option disabled>── Saved papers ──</option>`;
      data.forEach(p => {
        options += `<option value="${p.id}">${escHtml(p.title || p.filename)}</option>`;
      });
    }
  } catch { /* backend not running yet */ }

  slots.forEach(slot => {
    if (slot.el) slot.el.innerHTML = options;
  });
}

/*Wire a selector slot*/
function wireSlot(idx) {
  const slot = slots[idx];

  slot.el.addEventListener("change", () => {
    const val = slot.el.value;
    if (val === "__upload__") {
      slot.el.value = "";
      slot.fileInput.click();
      return;
    }
    slot.paperId = val ? parseInt(val) : null;
    slot.badge.classList.remove("visible");
  });

  slot.fileInput.addEventListener("change", async () => {
    const file = slot.fileInput.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Only PDF files are supported.", "error");
      slot.fileInput.value = "";
      return;
    }
    await uploadForSlot(idx, file);
  });

  // Badge remove button
  const rmBtn = slot.badge.querySelector(".rm");
  if (rmBtn) {
    rmBtn.addEventListener("click", () => {
      slot.paperId = null;
      slot.fileInput.value = "";
      slot.badge.classList.remove("visible");
      slot.el.value = "";
    });
  }
}

function wireUploadBtn(idx) {
  const btn = document.getElementById(`upload-btn-${idx}`);
  if (btn) btn.addEventListener("click", () => slots[idx].fileInput.click());
}

/*Upload PDF for a specific slot*/
async function uploadForSlot(idx, file) {
  const slot = slots[idx];
  const formData = new FormData();
  formData.append("file", file);

  showToast("Uploading PDF…");

  try {
    const res  = await fetch(`${API_BASE}/compare/upload`, { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) { showToast(data.error || "Upload failed.", "error"); return; }

    slot.paperId = data.paper_id;
    slot.el.value = "";

    // Show badge
    slot.badge.querySelector(".fname").textContent = data.filename;
    slot.badge.classList.add("visible");

    // Add to all dropdowns
    slots.forEach(s => {
      if (s.el) {
        const opt = document.createElement("option");
        opt.value = data.paper_id;
        opt.textContent = data.title || data.filename;
        s.el.appendChild(opt);
      }
    });

    showToast("PDF uploaded!", "success");
  } catch {
    showToast("Could not connect to server.", "error");
  } finally {
    slot.fileInput.value = "";
  }
}

/*Add third paper slot*/
btnAddPaper.addEventListener("click", () => {
  if (slots.length >= MAX_PAPERS) return;

  const idx = slots.length;  // will be 2

  // Build selector HTML
  const group = document.createElement("div");
  group.className = "selector-group";
  group.id = `group-${idx}`;
  group.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <span class="selector-label">Paper ${idx + 1}</span>
      <button class="btn-remove-paper" id="remove-${idx}" title="Remove">✕</button>
    </div>
    <div class="selector-inner">
      <select id="select-${idx}" aria-label="Select paper ${idx + 1}"></select>
      <span class="selector-arrow">▾</span>
      <button class="btn-upload-inline" id="upload-btn-${idx}" title="Upload PDF">📂</button>
    </div>
    <div class="file-badge" id="badge-${idx}">
      <span>📄</span>
      <span class="fname"></span>
      <button class="rm" aria-label="Remove">✕</button>
    </div>
    <input type="file" id="file-input-${idx}" accept=".pdf" />
  `;

  // Insert before the "+" button
  selectorsRow.insertBefore(group, btnAddPaper);

  // Register slot
  slots.push({
    paperId:   null,
    el:        document.getElementById(`select-${idx}`),
    fileInput: document.getElementById(`file-input-${idx}`),
    badge:     document.getElementById(`badge-${idx}`),
  });

  // Populate new dropdown with same options as others
  const existing = slots[0].el.innerHTML;
  slots[idx].el.innerHTML = existing;

  wireSlot(idx);
  wireUploadBtn(idx);

  // Wire remove button
  document.getElementById(`remove-${idx}`).addEventListener("click", () => {
    group.remove();
    slots.splice(idx, 1);
    btnAddPaper.classList.remove("hidden");
  });

  // Hide "+" if at max
  if (slots.length >= MAX_PAPERS) btnAddPaper.classList.add("hidden");
});

/*Compare*/
btnCompare.addEventListener("click", handleCompare);

async function handleCompare() {
  const paperIds = slots.map(s => s.paperId).filter(Boolean);

  if (paperIds.length < 2) {
    showToast("Please select at least 2 papers to compare.", "error");
    return;
  }

  // Check for duplicates
  if (new Set(paperIds).size !== paperIds.length) {
    showToast("Please select different papers for each slot.", "error");
    return;
  }

  btnCompare.classList.add("loading");
  btnCompare.disabled = true;
  tableSection.classList.remove("visible");
  recommendation.classList.remove("visible");
  placeholder.style.display = "none";
  showToast("Comparing papers, please wait…");

  try {
    const res  = await fetch(`${API_BASE}/compare/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ paper_ids: paperIds }),
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Comparison failed.", "error");
      placeholder.style.display = "";
      return;
    }

    renderTable(data);
    renderRecommendation(data);
    showToast("Comparison complete!", "success");

  } catch {
    showToast("Could not connect to server.", "error");
    placeholder.style.display = "";
  } finally {
    btnCompare.classList.remove("loading");
    btnCompare.disabled = false;
  }
}

/*Render comparison table*/
const ROWS = [
  { key: "year",          label: "Year"          },
  { key: "method",        label: "Method"        },
  { key: "dataset",       label: "Dataset"       },
  { key: "accuracy",      label: "Accuracy"      },
  { key: "precision",     label: "Precision"     },
  { key: "training_time", label: "Training Time" },
  { key: "contribution",  label: "Contribution"  },
];

function renderTable(data) {
  const papers = data.papers || [];
  const recommended = data.recommended_index ?? -1;

  let html = "<thead><tr><th>Feature</th>";
  papers.forEach(p => {
    html += `<th>${escHtml(p.title)}</th>`;
  });
  html += "</tr></thead><tbody>";

  ROWS.forEach(row => {
    html += `<tr><td>${row.label}</td>`;
    papers.forEach((p, i) => {
      const val      = p[row.key] || "N/A";
      const isWinner = i === recommended && _isMetric(row.key);
      html += `<td class="${isWinner ? "winner" : ""}">${escHtml(val)}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody>";
  compareTable.innerHTML = html;
  tableSection.classList.add("visible");
  tableSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function _isMetric(key) {
  return ["accuracy", "precision", "training_time", "contribution"].includes(key);
}

/*Render recommendation banner*/
function renderRecommendation(data) {
  const papers = data.papers || [];
  const idx    = data.recommended_index ?? 0;
  const paper  = papers[idx];

  if (!paper) return;

  recTitle.textContent  = paper.title;
  recReason.textContent = data.recommendation_reason || "";
  recommendation.classList.add("visible");
}

/*Export*/
btnExport.addEventListener("click", () => window.print());

/*Toast*/
let toastTimer;
function showToast(msg, type = "") {
  toast.textContent = msg;
  toast.className = "toast show" + (type ? ` ${type}` : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3400);
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Boot*/
init();