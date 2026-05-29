const API_BASE = "/api";

/* ── State ── */
const state = {
  selectedPaperId:  null,
  uploadedPaperId:  null,
  uploadedFileName: null,
};

/* ── DOM refs ── */
const paperSelect   = document.getElementById("paper-select");
const fileInput     = document.getElementById("file-input");
const uploadTrigger = document.getElementById("upload-trigger");
const fileBadge     = document.getElementById("file-badge");
const badgeFileName = document.getElementById("badge-filename");
const removeFileBtn = document.getElementById("remove-file");
const btnGenerate   = document.getElementById("btn-generate");
const resultsBox    = document.getElementById("results-box");
const paperTitle    = document.getElementById("results-paper-title");
const ideasSubtitle = document.getElementById("ideas-subtitle");
const ideasGrid     = document.getElementById("ideas-grid");
const btnExport     = document.getElementById("btn-export");
const placeholder   = document.getElementById("state-placeholder");
const toast         = document.getElementById("toast");

/* ── Init: load existing papers into dropdown ── */
async function init() {
  try {
    const res  = await fetch(`${API_BASE}/ideas/papers`);
    const data = await res.json();

    paperSelect.innerHTML = `<option value="">Select a paper…</option>
      <option value="__upload__">📂 Upload new PDF…</option>`;

    if (data.length) {
      const divider = document.createElement("option");
      divider.disabled = true;
      divider.textContent = "── Saved papers ──";
      paperSelect.appendChild(divider);
      data.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.title || p.filename;
        paperSelect.appendChild(opt);
      });
    }
  } catch {
    paperSelect.innerHTML = `<option value="">Select a paper…</option>
      <option value="__upload__">📂 Upload new PDF…</option>`;
  }
}

/* ── Events ── */
paperSelect.addEventListener("change", () => {
  const val = paperSelect.value;
  if (val === "__upload__") {
    paperSelect.value = "";
    fileInput.click();
    return;
  }
  state.selectedPaperId  = val ? parseInt(val) : null;
  state.uploadedPaperId  = null;
  state.uploadedFileName = null;
  fileBadge.classList.remove("visible");
});

uploadTrigger.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    showToast("Only PDF files are supported.", "error");
    fileInput.value = "";
    return;
  }
  await uploadFile(file);
});

removeFileBtn.addEventListener("click", () => {
  state.uploadedPaperId  = null;
  state.uploadedFileName = null;
  fileBadge.classList.remove("visible");
  fileInput.value   = "";
  paperSelect.value = "";
});

btnGenerate.addEventListener("click", handleGenerate);
btnExport.addEventListener("click", () => window.print());

/* ── Upload ── */
async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  showToast("Uploading PDF…");
  btnGenerate.disabled = true;

  try {
    const res  = await fetch(`${API_BASE}/ideas/upload`, { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) { showToast(data.error || "Upload failed.", "error"); return; }

    state.uploadedPaperId  = data.paper_id;
    state.uploadedFileName = data.filename;
    state.selectedPaperId  = null;
    paperSelect.value      = "";

    badgeFileName.textContent = data.filename;
    fileBadge.classList.add("visible");

    const opt = document.createElement("option");
    opt.value = data.paper_id;
    opt.textContent = data.title || data.filename;
    paperSelect.appendChild(opt);

    showToast("PDF uploaded successfully!", "success");
  } catch {
    showToast("Could not connect to server.", "error");
  } finally {
    btnGenerate.disabled = false;
    fileInput.value = "";
  }
}

/* ── Generate ── */
async function handleGenerate() {
  const paperId = state.uploadedPaperId || state.selectedPaperId;
  if (!paperId) {
    showToast("Please select or upload a paper first.", "error");
    return;
  }

  btnGenerate.classList.add("loading");
  btnGenerate.disabled = true;
  resultsBox.classList.remove("visible");
  placeholder.style.display = "none";
  showToast("Generating research ideas, please wait…");

  try {
    const res  = await fetch(`${API_BASE}/ideas/generate/${paperId}`, { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Idea generation failed.", "error");
      placeholder.style.display = "";
      return;
    }

    renderResults(data);
    showToast("Ideas generated!", "success");

  } catch {
    showToast("Could not connect to server.", "error");
    placeholder.style.display = "";
  } finally {
    btnGenerate.classList.remove("loading");
    btnGenerate.disabled = false;
  }
}

/* ── Render ── */
function renderResults(data) {
  paperTitle.textContent  = data.title || "Research Paper";
  ideasSubtitle.textContent = `${(data.ideas || []).length} future research directions generated`;

  renderIdeas(data.ideas || []);
  resultsBox.classList.add("visible");
  resultsBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderIdeas(ideas) {
  ideasGrid.innerHTML = "";

  if (!ideas.length) {
    ideasGrid.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:24px 0;grid-column:1/-1;">
      No ideas could be generated. Try a paper with clear findings and methodology.</p>`;
    return;
  }

  ideas.forEach(idea => {
    const typeCls  = `badge-${(idea.type || "extension").toLowerCase()}`;
    const diffCls  = `badge-${(idea.difficulty || "medium").toLowerCase()}`;

    const card = document.createElement("div");
    card.className = "idea-card";
    card.innerHTML = `
      <div class="idea-top">
        <span class="idea-num">${idea.id}</span>
        <div class="idea-badges">
          <span class="badge ${typeCls}">${escHtml(idea.type || "Extension")}</span>
          <span class="badge ${diffCls}">${escHtml(idea.difficulty || "Medium")}</span>
        </div>
      </div>
      <p class="idea-title">${escHtml(idea.title || "Research Idea")}</p>
      <p class="idea-description">${escHtml(idea.description || "")}</p>`;

    ideasGrid.appendChild(card);
  });
}

/* ── Toast ── */
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

init();