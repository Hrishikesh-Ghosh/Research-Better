const API_BASE = "/api";

const state = {
  selectedPaperId:  null,
  uploadedPaperId:  null,
  citations:        [],
  activeStyle:      "APA",
  paperTitle:       "",
};

/* DOM refs */
const paperSelect    = document.getElementById("paper-select");
const fileInput      = document.getElementById("file-input");
const uploadTrigger  = document.getElementById("upload-trigger");
const fileBadge      = document.getElementById("file-badge");
const badgeFileName  = document.getElementById("badge-filename");
const removeFileBtn  = document.getElementById("remove-file");
const btnGenerate    = document.getElementById("btn-generate");
const resultsBox     = document.getElementById("results-box");
const paperTitleEl   = document.getElementById("results-paper-title");
const citationsMeta  = document.getElementById("citations-meta");
const citationList   = document.getElementById("citation-list");
const btnExportWord  = document.getElementById("btn-export-word");
const btnExportPdf   = document.getElementById("btn-export-pdf");
const placeholder    = document.getElementById("state-placeholder");
const toast          = document.getElementById("toast");
const fmtBtns        = document.querySelectorAll(".fmt-btn");

/* Init */
async function init() {
  try {
    const res  = await fetch(`${API_BASE}/citations/papers`);
    const data = await res.json();
    paperSelect.innerHTML = `<option value="">Select a paper…</option>
      <option value="__upload__">📂 Upload new PDF…</option>`;
    if (data.length) {
      const div = document.createElement("option");
      div.disabled = true; div.textContent = "── Saved papers ──";
      paperSelect.appendChild(div);
      data.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id; opt.textContent = p.title || p.filename;
        paperSelect.appendChild(opt);
      });
    }
  } catch { /* backend not running */ }
}

/* Format tab selection */
fmtBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    fmtBtns.forEach(b => { b.classList.remove("active"); b.setAttribute("aria-pressed","false"); });
    btn.classList.add("active");
    btn.setAttribute("aria-pressed","true");
    state.activeStyle = btn.dataset.fmt;
  });
});

/* Paper select */
paperSelect.addEventListener("change", () => {
  const val = paperSelect.value;
  if (val === "__upload__") { paperSelect.value = ""; fileInput.click(); return; }
  state.selectedPaperId = val ? parseInt(val) : null;
  state.uploadedPaperId = null;
  fileBadge.classList.remove("visible");
});

uploadTrigger.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    showToast("Only PDF files are supported.", "error"); fileInput.value = ""; return;
  }
  await uploadFile(file);
});

removeFileBtn.addEventListener("click", () => {
  state.uploadedPaperId = null;
  fileBadge.classList.remove("visible");
  fileInput.value = ""; paperSelect.value = "";
});

/* Upload */
async function uploadFile(file) {
  const fd = new FormData(); fd.append("file", file);
  showToast("Uploading PDF…"); btnGenerate.disabled = true;
  try {
    const res  = await fetch(`${API_BASE}/citations/upload`, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Upload failed.", "error"); return; }
    state.uploadedPaperId = data.paper_id;
    state.selectedPaperId = null;
    paperSelect.value = "";
    badgeFileName.textContent = data.filename;
    fileBadge.classList.add("visible");
    const opt = document.createElement("option");
    opt.value = data.paper_id; opt.textContent = data.title || data.filename;
    paperSelect.appendChild(opt);
    showToast("PDF uploaded!", "success");
  } catch { showToast("Could not connect to server.", "error"); }
  finally { btnGenerate.disabled = false; fileInput.value = ""; }
}

/* Generate */
btnGenerate.addEventListener("click", async () => {
  const paperId = state.uploadedPaperId || state.selectedPaperId;
  if (!paperId) { showToast("Please select or upload a paper first.", "error"); return; }

  btnGenerate.classList.add("loading"); btnGenerate.disabled = true;
  resultsBox.classList.remove("visible");
  placeholder.style.display = "none";
  showToast(`Extracting ${state.activeStyle} citations, please wait…`);

  try {
    const res  = await fetch(`${API_BASE}/citations/generate/${paperId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style: state.activeStyle }),
    });
    const data = await res.json();

    if (!res.ok) {
    const msg = data.error || "Extraction failed.";
    showToast(msg, "error");
    placeholder.style.display = "";
    return;
}

    state.citations   = data.citations || [];
    state.paperTitle  = data.title || "Research Paper";
    renderResults(data);
    showToast(`Found ${state.citations.length} citation(s) in ${state.activeStyle}!`, "success");

  } catch {
    showToast("Request failed: " + err.message, "error");
    placeholder.style.display = "";
  } finally {
    btnGenerate.classList.remove("loading"); btnGenerate.disabled = false;
  }
});

/* Render */
function renderResults(data) {
  paperTitleEl.textContent = data.title || "Research Paper";

  if (data.warning) {
    showToast(data.warning, "error");
  }

  const missingCount = state.citations.filter(c => c.has_missing_fields).length;
  citationsMeta.textContent = `${state.citations.length} reference(s) · ${data.style} style`
    + (missingCount ? ` · ⚠ ${missingCount} with missing fields` : "");

  citationList.innerHTML = "";
  if (!state.citations.length) {
    citationList.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:24px 0;">
      No references section found in this paper. It may use footnotes or inline citations instead.</p>`;
  } else {
    state.citations.forEach(c => buildCard(c));
  }

  resultsBox.classList.add("visible");
  resultsBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildCard(c) {
  const card = document.createElement("div");
  card.className = "citation-card";

  // Strip the [FORMATTING FAILED] prefix — the raw text is still usable
  const displayText = (c.formatted || c.raw || "N/A")
    .replace(/^\[FORMATTING FAILED\]\s*/, "");

  // Store clean text for copying
  c._cleanText = displayText;

  card.innerHTML = `
    <div class="citation-header">
      <span class="citation-num">${c.id}</span>
      <div class="citation-content">
        <div class="citation-formatted">${escHtml(displayText)}</div>
        ${c.has_missing_fields
          ? `<span class="citation-missing-badge">⚠ Some fields may be incomplete</span>`
          : ""}
        <button class="copy-btn" onclick="copyFormatted(${c.id})">📋 Copy</button>
      </div>
    </div>`;

  citationList.appendChild(card);
}

/* Copy single citation */
window.copyFormatted = function(id) {
  const c = state.citations.find(x => x.id === id);
  if (!c) return;
  const text = c._cleanText || (c.formatted || c.raw || "").replace(/^\[FORMATTING FAILED\]\s*/, "");
  navigator.clipboard.writeText(text).then(() => {
    // find the button inside this card by id
    const cards = document.querySelectorAll(".citation-card");
    const btn = cards[id - 1]?.querySelector(".copy-btn");
    if (btn) {
      btn.textContent = "✓ Copied!"; btn.classList.add("copied");
      setTimeout(() => { btn.textContent = "📋 Copy"; btn.classList.remove("copied"); }, 2000);
    }
  }).catch(() => showToast("Copy failed.", "error"));
};

/* Export to Word using docx.js from CDN */
btnExportWord.addEventListener("click", () => {
  if (!state.citations.length) { showToast("No citations to export.", "error"); return; }

  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;

  const paras = [
    new Paragraph({
      text: `${state.paperTitle} — ${state.activeStyle} Citations`,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: "" }),
    ...state.citations.map(c =>
      new Paragraph({
        children: [
          new TextRun({
            text: c.has_missing_fields ? `[${c.id}] ⚠ ${c.formatted}` : `[${c.id}] ${c.formatted}`,
            font: "Times New Roman",
            size: 24,
          })
        ],
        spacing: { after: 160 },
      })
    )
  ];

  const doc = new Document({ sections: [{ children: paras }] });

  Packer.toBlob(doc).then(blob => {
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `citations_${state.activeStyle}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Word document downloaded!", "success");
  });
});

/* Export PDF */
btnExportPdf.addEventListener("click", () => window.print());

/* Toast */
let toastTimer;
function showToast(msg, type = "") {
  toast.textContent = msg;
  toast.className = "toast show" + (type ? ` ${type}` : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3400);
}

function escHtml(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

init();