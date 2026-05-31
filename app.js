import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getMessaging,
  getToken,
  onMessage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyAB09oj91RuaytI8AIfFrXc1mYESnGPr9o",
  authDomain: "sistema-soubela.firebaseapp.com",
  projectId: "sistema-soubela",
  storageBucket: "sistema-soubela.firebasestorage.app",
  messagingSenderId: "625696420183",
  appId: "1:625696420183:web:7d264c60c9d2fd4cbcce12"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const messaging = getMessaging(app);
const pedidosRef = collection(db, "pedidos");

const SESSION_KEY = "sistema_sou_bela_sessao_v13";
const TOKEN_KEY = "sistema_sou_bela_fcm_token_v1";
const VAPID_KEY = "BBI6UqpLddFpOVjDHyb29d5qe8xPSXjX38rDRI46ZM6LKS1LZUyjNJYhIl8z0_suwYoYKjQPkmo-l8pGRzqrhwA";

const STATUS = {
  "nao-visualizado": { label: "Não visualizado", cls: "nao-visualizado", chip: "red" },
  "visualizado": { label: "Visualizado", cls: "visualizado", chip: "yellow" },
  "em-separacao": { label: "Em separação", cls: "em-separacao", chip: "blue" },
  "falta-peca": { label: "Falta peça", cls: "falta-peca", chip: "yellow" },
  "separado": { label: "Separado", cls: "separado", chip: "green" }
};

const MODEL_GROUPS = [
  {
    title: "Linha principal",
    items: [
      { id: "001", label: "001 - Reforçado Liso" },
      { id: "002", label: "002 - Sutiã Reforçado Renda" },
      { id: "003", label: "003 - Sutiã Nadador" },
      { id: "007", label: "007 - Sutiã Solteirinho Liso" },
      { id: "008", label: "008 - Solteirinho de Renda" },
      { id: "009", label: "009 - Sutiã Confort" },
      { id: "REF0013", label: "REF: Conjunto De Liguinha 0013" }
    ]
  },
  {
    title: "Linha Plus Size",
    items: [
      { id: "004", label: "004 - Sutiã Plus De Renda" },
      { id: "005", label: "005 - Sutiã Plus Size Poliéster" },
      { id: "005.2", label: "005.2 - Sutiã Plus Poliéster c/Renda" },
      { id: "006", label: "006 - Sutiã Plus Size Poliamida" },
      { id: "PLUSCONJ", label: "Conjunto De Plus Size" }
    ]
  }
];

const MODEL_MAP = new Map(
  MODEL_GROUPS.flatMap(group => group.items.map(item => [item.id, { ...item, group: group.title }]))
);

const $ = (id) => document.getElementById(id);

let session = loadSession();
let pedidos = [];
let editandoId = null;
let filtroExpedicao = "pendentes";
let initialized = false;
let prevMap = new Map();
let orderBlocks = [createBlock("001")];
let pickerOpen = false;
let selectedExpeditionOrderId = null;

function uid() {
  if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `b_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createBlock(modelId = "001", texto = "") {
  return { uid: uid(), modelId, texto };
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
}

function saveSession() {
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function fmt(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(str) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function statusClass(s) { return STATUS[s]?.cls || "nao-visualizado"; }
function chipClass(s) { return STATUS[s]?.chip || "gray"; }
function statusLabel(s) { return STATUS[s]?.label || s || ""; }
function isPending(s) { return s !== "separado"; }

function tsToMs(v) {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const d = Date.parse(v);
    return Number.isFinite(d) ? d : 0;
  }
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return 0;
}

function nowParts() {
  const d = new Date();
  return {
    date: d.toLocaleDateString("pt-BR"),
    time: d.toLocaleTimeString("pt-BR")
  };
}

function fmtCreated(p) {
  return p.createdDate && p.createdTime ? `${p.createdDate} às ${p.createdTime}` : (p.createdDate || "-");
}

function fmtUpdated(p) {
  return p.updatedDate && p.updatedTime ? `${p.updatedDate} às ${p.updatedTime}` : (p.updatedDate || "-");
}

function notify(title, body) {
  if (Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "Sou Bela -logo (3).png" });
    } catch {
      // sem fallback visível para não quebrar a interface
    }
  }
}

function showLoginFields() {
  $("campoDono").style.display = $("perfilLogin").value === "dono" ? "block" : "none";
}

function renderLogin() {
  $("loginScreen").classList.remove("hidden");
  $("appDono").classList.add("hidden");
  $("appExpedicao").classList.add("hidden");
}

function renderDono() {
  $("loginScreen").classList.add("hidden");
  $("appDono").classList.remove("hidden");
  $("appExpedicao").classList.add("hidden");
  $("nomeSessaoDono").textContent = `Logado como: ${session.nome}`;
  $("nomeSidebarDono").textContent = session.nome;
  $("nomePedidosDono").textContent = session.nome;
  renderStats();
  renderPedidosDono();
  renderEditBox();
  if ($("pedidoBlocks") && $("pedidoBlocks").contains(document.activeElement)) {
    renderPedidoPreviewOnly();
    renderPicker();
  } else {
    renderPedidoComposer();
  }
}

function renderExpedicao() {
  $("loginScreen").classList.add("hidden");
  $("appDono").classList.add("hidden");
  $("appExpedicao").classList.remove("hidden");
  $("btnPendentes").className = filtroExpedicao === "pendentes" ? "btn btn-primary" : "btn btn-ghost";
  $("btnTodos").className = filtroExpedicao === "todos" ? "btn btn-primary" : "btn btn-ghost";
  renderStats();
  renderPedidosExp();
}

function renderAll() {
  if (!session) return renderLogin();
  if (session.perfil === "dono") return renderDono();
  return renderExpedicao();
}

function renderStats() {
  if (session?.perfil === "dono") {
    const meus = pedidos.filter(p => p.dono === session.nome);
    $("statTotalDono").textContent = meus.length;
    $("statPendentesDono").textContent = meus.filter(p => isPending(p.status)).length;
    $("statSeparadosDono").textContent = meus.filter(p => p.status === "separado").length;
  }
  if (session?.perfil === "expedicao") {
    $("statTotalExp").textContent = pedidos.length;
    $("statPendExp").textContent = pedidos.filter(p => isPending(p.status)).length;
    $("statSepExp").textContent = pedidos.filter(p => p.status === "separado").length;
  }
}

function clearEditMode() {
  editandoId = null;
  $("btnEnviarPedido").textContent = "Enviar pedido";
  $("btnCancelarEdicao").style.display = "none";
  $("editStatusBox").classList.add("hidden");
  $("editInfo").textContent = "";
}

function renderEditBox() {
  if (!editandoId) {
    $("editStatusBox").classList.add("hidden");
    return;
  }
  const p = pedidos.find(x => x.id === editandoId);
  if (!p) {
    clearEditMode();
    return;
  }
  $("editStatusBox").classList.remove("hidden");
  $("editInfo").innerHTML =
    `Editando o pedido <strong>${fmt(p.id)}</strong>.<br>` +
    `Criado em ${fmt(fmtCreated(p))}.` +
    (p.editedBy ? `<br><span class="edit-badge">Última edição: ${fmt(p.editedBy)} — ${fmt(p.editedDate)} às ${fmt(p.editedTime)}</span>` : "");
  $("btnEnviarPedido").textContent = "Salvar alterações";
  $("btnCancelarEdicao").style.display = "inline-flex";
}

function getModelLabel(modelId) {
  return MODEL_MAP.get(modelId)?.label || String(modelId || "").trim();
}

function getModelGroup(modelId) {
  return MODEL_MAP.get(modelId)?.group || "Outros";
}

function createLabelToIdMap() {
  const map = new Map();
  for (const [id, item] of MODEL_MAP.entries()) {
    map.set(normalizeText(item.label), id);
  }
  return map;
}

const LABEL_TO_ID = createLabelToIdMap();

function inferModelIdFromHeading(line) {
  const normalized = normalizeText(line);

  for (const [id, item] of MODEL_MAP.entries()) {
    const itemNorm = normalizeText(item.label);
    if (normalized === itemNorm) return id;
    if (normalized === normalizeText(item.label.replace(/^0+/, ""))) return id;
  }

  const codeMatch = String(line).trim().match(/^(\d{3}(?:\.\d+)?)\s*-\s*(.+)$/i);
  if (codeMatch) {
    const code = codeMatch[1].trim();
    const rest = codeMatch[2].trim();
    for (const [id, item] of MODEL_MAP.entries()) {
      if (normalizeText(item.label).startsWith(normalizeText(`${code} - ${rest}`))) return id;
    }
    if (LABEL_TO_ID.has(normalizeText(`${code} - ${rest}`))) return LABEL_TO_ID.get(normalizeText(`${code} - ${rest}`));
    if (LABEL_TO_ID.has(normalized)) return LABEL_TO_ID.get(normalized);
  }

  if (normalized.startsWith("ref: conjunto de liguinha 0013")) return "REF0013";
  if (normalized === normalizeText("Conjunto De Plus Size")) return "PLUSCONJ";
  return null;
}

function isHeadingLine(line) {
  if (!line) return false;
  const trimmed = String(line).trim();
  if (!trimmed) return false;

  if (inferModelIdFromHeading(trimmed)) return true;
  if (/^linha plus size:?$/i.test(trimmed)) return false;
  if (/^linha principal:?$/i.test(trimmed)) return false;
  if (/^\d{3}(?:\.\d+)?\s*-\s*/.test(trimmed)) return true;
  if (/^ref:\s*/i.test(trimmed)) return true;
  if (LABEL_TO_ID.has(normalizeText(trimmed))) return true;
  return false;
}

function parsePedidoTextToBlocks(text) {
  const raw = String(text ?? "").replace(/\r/g, "");
  if (!raw.trim()) return [];

  const lines = raw.split("\n");
  const blocks = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    const texto = current.lines.join("\n").trim();
    if (current.modelId || texto) {
      blocks.push({
        uid: uid(),
        modelId: current.modelId || "001",
        texto
      });
    }
    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (!trimmed.trim()) {
      if (current) current.lines.push("");
      continue;
    }

    if (isHeadingLine(trimmed)) {
      const inferred = inferModelIdFromHeading(trimmed);
      pushCurrent();
      current = { modelId: inferred || "001", lines: [trimmed] };
      // A linha de cabeçalho não deve ficar dentro do texto do modelo em duplicidade
      current.lines = [];
      continue;
    }

    if (!current) {
      current = { modelId: "001", lines: [] };
    }
    current.lines.push(trimmed);
  }

  pushCurrent();
  return blocks.filter(b => b.texto.length > 0 || b.modelId);
}

function getPedidoBlocksFromPedido(p) {
  if (Array.isArray(p?.pedidoItens) && p.pedidoItens.length) {
    return p.pedidoItens.map(item => createBlock(
      item.modelId || inferModelIdFromHeading(item.titulo) || "001",
      item.texto || item.content || item.grade || ""
    ));
  }
  const parsed = parsePedidoTextToBlocks(p?.pedidoTexto || "");
  if (parsed.length) return parsed;
  return [createBlock("001", p?.pedidoTexto || "")];
}

function setOrderBlocks(blocks) {
  const next = Array.isArray(blocks) && blocks.length ? blocks : [createBlock("001")];
  orderBlocks = next.map(b => ({
    uid: b.uid || uid(),
    modelId: b.modelId || "001",
    texto: b.texto || ""
  }));
  renderPedidoComposer();
}

function renderModelOptions(selectedId) {
  const options = MODEL_GROUPS.map(group => {
    const inner = group.items.map(item => {
      const selected = item.id === selectedId ? "selected" : "";
      return `<option value="${fmt(item.id)}" ${selected}>${fmt(item.label)}</option>`;
    }).join("");
    return `<optgroup label="${fmt(group.title)}">${inner}</optgroup>`;
  }).join("");
  return options;
}

function renderPicker() {
  const picker = $("modeloPicker");
  if (!pickerOpen) {
    picker.classList.add("hidden");
    picker.innerHTML = "";
    $("btnEscolherModelo").textContent = "Escolher outro modelo";
    $("btnEscolherModelo").setAttribute("aria-expanded", "false");
    return;
  }

  picker.classList.remove("hidden");
  $("btnEscolherModelo").textContent = "Fechar modelos";
  $("btnEscolherModelo").setAttribute("aria-expanded", "true");

  picker.innerHTML = `
    <div class="model-picker-header">
      <div>
        <strong>Escolher outro modelo</strong>
        <div class="tiny">Clique no modelo para adicionar um novo bloco ao pedido.</div>
      </div>
      <span class="mini-badge">${orderBlocks.length} bloco(s) no pedido</span>
    </div>
    ${MODEL_GROUPS.map(group => `
      <div class="model-group">
        <h5>${fmt(group.title)}</h5>
        <div class="model-picker-grid">
          ${group.items.map(item => `
            <button type="button" class="model-btn" data-add-model="${fmt(item.id)}">
              <strong>${fmt(item.label)}</strong>
              <span>Adicionar ao pedido</span>
            </button>
          `).join("")}
        </div>
      </div>
    `).join("")}
  `;
}

function renderPedidoPreviewOnly() {
  const preview = $("pedidoPreview");
  const count = $("pedidoPreviewCount");
  const total = orderBlocks.length;
  count.textContent = `${total} ${total === 1 ? "modelo" : "modelos"}`;

  preview.innerHTML = orderBlocks.length
    ? orderBlocks.map((block, index) => {
        const label = getModelLabel(block.modelId);
        const texto = String(block.texto || "").trim();
        return `
          <div class="preview-item">
            <strong>${index + 1}. ${fmt(label)}</strong>
            <pre>${fmt(texto || "Sem detalhes preenchidos ainda.")}</pre>
          </div>
        `;
      }).join("")
    : `<div class="preview-empty">Adicione um modelo para ver a prévia aqui.</div>`;
}

function renderPedidoComposer() {
  const blocksWrap = $("pedidoBlocks");

  blocksWrap.innerHTML = orderBlocks.map((block, index) => {
    const label = getModelLabel(block.modelId);
    return `
      <article class="order-block ${index === 0 ? "primary" : ""}" data-block="${fmt(block.uid)}">
        <div class="order-block-head">
          <div class="order-title-row">
            <span class="order-index">${index + 1}</span>
            <div class="order-model">
              <label>Modelo</label>
              <select data-model-select="${fmt(block.uid)}">
                ${renderModelOptions(block.modelId)}
              </select>
            </div>
          </div>
          <div class="builder-actions" style="margin-top:0">
            ${index === 0 ? `<span class="mini-badge">Modelo inicial</span>` : `<button type="button" class="btn btn-ghost btn-mini" data-remove-block="${fmt(block.uid)}">Remover</button>`}
          </div>
        </div>

        <div class="field">
          <label>Grade / detalhes do modelo</label>
          <textarea data-block-text="${fmt(block.uid)}" placeholder="Escreva a grade, cores, tamanhos e detalhes deste modelo...">${fmt(block.texto)}</textarea>
        </div>

        <div class="tiny">Será enviado como <strong>${fmt(label)}</strong>.</div>
      </article>
    `;
  }).join("");

  if (!orderBlocks.length) {
    blocksWrap.innerHTML = `<div class="empty">Nenhum modelo adicionado.</div>`;
  }

  renderPedidoPreviewOnly();
  renderPicker();
}

function buildPedidoTextoFromBlocks(blocks) {
  return blocks
    .map(block => {
      const label = getModelLabel(block.modelId);
      const texto = String(block.texto || "").trim();
      return texto ? `${label}\n${texto}` : label;
    })
    .join("\n\n")
    .trim();
}

function normalizeOrderItems(blocks) {
  return blocks.map((block, index) => ({
    ordem: index + 1,
    uid: block.uid,
    modelId: block.modelId,
    titulo: getModelLabel(block.modelId),
    grupo: getModelGroup(block.modelId),
    texto: String(block.texto || "").trim()
  }));
}

function renderPedidoBlocksPreviewInCard(p) {
  const items = getPedidoItemsForDisplay(p);
  if (!items.length) {
    return `<div class="pedido-text">${fmt(p.pedidoTexto || "")}</div>`;
  }
  return `
    <div class="pedido-text">
      ${items.map((item, index) => `
        <div class="model-line">
          <div class="dot"></div>
          <div>
            <strong>${fmt(item.titulo || `Modelo ${index + 1}`)}</strong>
            <div>${fmt(item.texto || "Sem detalhes.")}</div>
          </div>
        </div>
        ${index < items.length - 1 ? '<div style="height:10px"></div>' : ''}
      `).join("")}
    </div>
  `;
}

function getPedidoItemsForDisplay(p) {
  if (Array.isArray(p?.pedidoItens) && p.pedidoItens.length) {
    return p.pedidoItens.map((item, index) => ({
      ordem: item.ordem || index + 1,
      titulo: item.titulo || getModelLabel(item.modelId) || `Modelo ${index + 1}`,
      texto: item.texto || item.content || item.grade || ""
    }));
  }

  const blocks = parsePedidoTextToBlocks(p?.pedidoTexto || "");
  if (blocks.length) {
    return blocks.map((block, index) => ({
      ordem: index + 1,
      titulo: getModelLabel(block.modelId),
      texto: block.texto
    }));
  }

  const raw = String(p?.pedidoTexto || "").trim();
  if (!raw) return [];
  return [{ ordem: 1, titulo: "Pedido", texto: raw }];
}

function renderPedidosDono() {
  const lista = $("listaPedidosDono");
  const meus = pedidos
    .filter(p => p.dono === session.nome)
    .sort((a, b) => tsToMs(b.createdAtMs) - tsToMs(a.createdAtMs));

  if (!meus.length) {
    lista.innerHTML = `<div class="empty">Nenhum pedido enviado ainda por <strong>${fmt(session.nome)}</strong>.</div>`;
    return;
  }

  lista.innerHTML = meus.map(p => {
    const items = getPedidoItemsForDisplay(p);
    const snippet = items.map(item => `${item.titulo}\n${item.texto}`).join("\n\n");
    return `
      <div class="pedido ${statusClass(p.status)}">
        <div class="pedido-head">
          <div>
            <h3>${fmt(p.cliente || "")}</h3>
            <div class="pedido-meta"><strong>${fmt(p.id)}</strong> • ${fmt(p.dono || "")}</div>
          </div>
          <div class="pedido-meta">
            <div><strong>Enviado em:</strong> ${fmt(fmtCreated(p))}</div>
            <div><strong>Atualizado:</strong> ${fmt(fmtUpdated(p))}</div>
          </div>
        </div>

        ${items.length ? `
          <div class="pedido-text">
            ${items.map((item, index) => `
              <div class="model-line">
                <div class="dot"></div>
                <div>
                  <strong>${fmt(item.titulo)}</strong>
                  <div>${fmt(item.texto || "")}</div>
                </div>
              </div>
              ${index < items.length - 1 ? '<div style="height:10px"></div>' : ''}
            `).join("")}
          </div>
        ` : `<div class="pedido-text">${fmt(p.pedidoTexto || "")}</div>`}

        ${p.obsPedido ? `<div class="obsBox"><strong>Observação do pedido</strong>${fmt(p.obsPedido).replace(/\n/g, "<br>")}</div>` : ""}
        ${p.expObs ? `<div class="obsBox"><strong>Observação da expedição</strong>${fmt(p.expObs).replace(/\n/g, "<br>")}</div>` : ""}
        ${p.editedBy ? `<div class="obsBox"><strong>Última edição</strong>${fmt(p.editedBy)}<br>${fmt(p.editedDate)} às ${fmt(p.editedTime)}</div>` : ""}

        <span class="chip ${chipClass(p.status)}">${fmt(statusLabel(p.status))}</span>

        <div class="status-actions">
          <button class="btn btn-ghost" data-edit-order="${fmt(p.id)}">Editar pedido</button>
          <button class="btn btn-danger" data-delete-order="${fmt(p.id)}" data-origin="dono">Excluir pedido</button>
        </div>

        <div class="inline-note">
          ${p.status === "separado"
            ? "<strong>Pedido finalizado.</strong>"
            : "<strong>Pedido pendente.</strong> Ainda pode receber ajuste da expedição."}
        </div>
      </div>
    `;
  }).join("");
}

function filteredExpeditionOrders() {
  const busca = ($("searchExp").value || "").trim().toLowerCase();
  const statusFiltro = $("filterStatus").value || "all";
  let view = pedidos.slice().sort((a, b) => tsToMs(b.createdAtMs) - tsToMs(a.createdAtMs));

  if (filtroExpedicao === "pendentes") {
    view = view.filter(p => p.status !== "separado");
  }
  if (statusFiltro !== "all") {
    view = view.filter(p => p.status === statusFiltro);
  }
  if (busca) {
    view = view.filter(p => {
      const items = getPedidoItemsForDisplay(p);
      const itemText = items.map(i => `${i.titulo} ${i.texto}`).join(" ");
      const text = [
        p.id, p.dono, p.cliente, p.pedidoTexto, itemText, p.obsPedido, p.expObs, p.status,
        p.createdDate, p.createdTime, p.updatedDate, p.updatedTime, p.editedBy, p.editedDate, p.editedTime
      ].map(v => String(v ?? "")).join(" ").toLowerCase();
      return text.includes(busca);
    });
  }
  return view;
}

function renderPedidosExp() {
  const lista = $("listaPedidosExp");
  const view = filteredExpeditionOrders();

  if (!view.length) {
    lista.innerHTML = `<div class="empty">Nenhum pedido encontrado com esses filtros.</div>`;
    selectedExpeditionOrderId = null;
    renderDetalheExpedicao();
    return;
  }

  if (!selectedExpeditionOrderId || !view.some(p => p.id === selectedExpeditionOrderId)) {
    selectedExpeditionOrderId = view[0].id;
  }

  lista.innerHTML = view.map(p => {
    const st = p.status || "nao-visualizado";
    const items = getPedidoItemsForDisplay(p);
    const firstItem = items[0];
    const extraCount = Math.max(0, items.length - 1);
    const snippet = firstItem
      ? `${firstItem.titulo}${firstItem.texto ? `\n${firstItem.texto.slice(0, 140)}${firstItem.texto.length > 140 ? "..." : ""}` : ""}${extraCount ? `\n+ ${extraCount} modelo(s) a mais` : ""}`
      : String(p.pedidoTexto || "").slice(0, 180);
    return `
      <div class="order-card ${selectedExpeditionOrderId === p.id ? "active" : ""}" data-order-card="${fmt(p.id)}">
        <div class="order-card-top">
          <div>
            <h4>${fmt(p.cliente || "Sem cliente")}</h4>
            <div class="order-card-meta"><strong>${fmt(p.id)}</strong> • ${fmt(p.dono || "")}</div>
          </div>
          <span class="chip ${chipClass(st)}">${fmt(statusLabel(st))}</span>
        </div>

        <div class="order-card-snippet">${fmt(snippet || "Sem detalhes do pedido.")}</div>

        <div class="order-card-actions">
          <button class="btn btn-primary btn-mini" data-select-order="${fmt(p.id)}">Ver detalhes</button>
        </div>
      </div>
    `;
  }).join("");

  renderDetalheExpedicao();
}

function renderDetalheExpedicao() {
  const empty = $("detalheExpVazio");
  const content = $("detalheExpConteudo");
  const p = pedidos.find(x => x.id === selectedExpeditionOrderId);

  if (!p) {
    empty.classList.remove("hidden");
    content.classList.add("hidden");
    content.innerHTML = "";
    return;
  }

  empty.classList.add("hidden");
  content.classList.remove("hidden");

  const st = p.status || "nao-visualizado";
  const items = getPedidoItemsForDisplay(p);

  content.innerHTML = `
    <div class="detail-content">
      <div class="detail-summary">
        <div>
          <div class="tiny">Cliente</div>
          <h4>${fmt(p.cliente || "Sem cliente")}</h4>
          <div class="detail-meta">
            <strong>${fmt(p.id)}</strong> • ${fmt(p.dono || "")}<br>
            <strong>Enviado:</strong> ${fmt(fmtCreated(p))}<br>
            <strong>Atualizado:</strong> ${fmt(fmtUpdated(p))}
          </div>
        </div>
        <span class="chip ${chipClass(st)}">${fmt(statusLabel(st))}</span>
      </div>

      <div class="detail-section">
        <h5>Modelos do pedido</h5>
        <div class="detail-blocks">
          ${items.length ? items.map((item, index) => `
            <div class="detail-block">
              <div class="detail-block-head">
                <strong>${fmt(item.titulo || `Modelo ${index + 1}`)}</strong>
                <span class="mini-badge">${index + 1}</span>
              </div>
              <div class="detail-pre">${fmt(item.texto || "Sem detalhes.")}</div>
            </div>
          `).join("") : `<div class="empty">Este pedido não tem blocos estruturados.</div>`}
        </div>
      </div>

      ${p.obsPedido ? `
        <div class="detail-section">
          <h5>Observação do pedido</h5>
          <div class="obsBox" style="margin-top:0">${fmt(p.obsPedido).replace(/\n/g, "<br>")}</div>
        </div>
      ` : ""}

      ${p.editedBy ? `
        <div class="detail-section">
          <h5>Última edição</h5>
          <div class="tiny"><strong>${fmt(p.editedBy)}</strong><br>${fmt(p.editedDate)} às ${fmt(p.editedTime)}</div>
        </div>
      ` : ""}

      <div class="detail-section">
        <h5>Status da expedição</h5>
        <div class="detail-controls">
          <div class="field">
            <label for="statusDetalheExp">Atualize o status</label>
            <select id="statusDetalheExp">
              <option value="nao-visualizado" ${st === "nao-visualizado" ? "selected" : ""}>Não visualizado</option>
              <option value="visualizado" ${st === "visualizado" ? "selected" : ""}>Visualizado</option>
              <option value="em-separacao" ${st === "em-separacao" ? "selected" : ""}>Em separação</option>
              <option value="falta-peca" ${st === "falta-peca" ? "selected" : ""}>Falta peça</option>
              <option value="separado" ${st === "separado" ? "selected" : ""}>Separado</option>
            </select>
          </div>

          <div class="field" id="obsWrapDetalheExp" style="${st === "separado" ? "display:none" : "display:flex"}">
            <label for="obsDetalheExp">Observações da expedição</label>
            <textarea id="obsDetalheExp" placeholder="Escreva o recado para o dono.">${fmt(p.expObs || "")}</textarea>
            <div class="tiny">O campo aparece quando o status é diferente de “Separado”.</div>
          </div>

          <div class="detail-actions">
            <button class="btn btn-primary" id="btnConfirmarDetalheExp">Confirmar seleção</button>
            ${st === "separado" ? `<button class="btn btn-danger" id="btnExcluirDetalheExp">Excluir separado</button>` : ""}
          </div>
        </div>
      </div>
    </div>
  `;

  $("statusDetalheExp").addEventListener("change", () => {
    const sel = $("statusDetalheExp");
    const wrap = $("obsWrapDetalheExp");
    if (!sel || !wrap) return;
    wrap.style.display = sel.value === "separado" ? "none" : "flex";
  });

  $("btnConfirmarDetalheExp").addEventListener("click", () => atualizarPedidoSelecionado());
  const excluirBtn = $("btnExcluirDetalheExp");
  if (excluirBtn) excluirBtn.addEventListener("click", () => excluirPedidoSelecionado());
}

function applyBlockChange(uidBlock, field, value) {
  orderBlocks = orderBlocks.map(block => block.uid === uidBlock ? { ...block, [field]: value } : block);
  renderPedidoComposer();
}

function addModelBlock(modelId) {
  if (!MODEL_MAP.has(modelId)) return;
  const existsIndex = orderBlocks.findIndex(block => block.modelId === modelId);
  if (existsIndex >= 0) {
    const el = document.querySelector(`[data-block="${orderBlocks[existsIndex].uid}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.animate([
        { boxShadow: "0 0 0 0 rgba(214,51,132,.0)" },
        { boxShadow: "0 0 0 6px rgba(214,51,132,.12)" },
        { boxShadow: "0 0 0 0 rgba(214,51,132,.0)" }
      ], { duration: 700 });
    }
    return;
  }
  orderBlocks = [...orderBlocks, createBlock(modelId, "")];
  renderPedidoComposer();
  requestAnimationFrame(() => {
    const block = orderBlocks[orderBlocks.length - 1];
    const el = document.querySelector(`[data-block="${block.uid}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const textarea = el.querySelector("textarea");
      if (textarea) textarea.focus();
    }
  });
}

async function atualizarPedidoSelecionado() {
  try {
    if (!session || session.perfil !== "expedicao") {
      alert("Você precisa estar logado como Expedição.");
      return;
    }

    const p = pedidos.find(x => x.id === selectedExpeditionOrderId);
    if (!p) {
      alert("Pedido não encontrado.");
      return;
    }

    const st = $("statusDetalheExp")?.value || p.status || "nao-visualizado";
    const obs = ($("obsDetalheExp")?.value || "").trim();

    if (st === "falta-peca" && !obs) {
      alert("Preencha a observação para informar o que está faltando.");
      return;
    }

    const now = nowParts();

    await updateDoc(doc(db, "pedidos", p.id), {
      status: st,
      expObs: st === "separado" ? "" : obs,
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
      updatedDate: now.date,
      updatedTime: now.time
    });
  } catch (e) {
    console.error(e);
    alert("Não foi possível atualizar o pedido.");
  }
}

async function excluirPedidoSelecionado() {
  try {
    if (!session || session.perfil !== "expedicao") {
      alert("Você precisa estar logado como Expedição.");
      return;
    }
    const p = pedidos.find(x => x.id === selectedExpeditionOrderId);
    if (!p) {
      alert("Pedido não encontrado.");
      return;
    }
    if ((p.status || "") !== "separado") {
      alert("A expedição só pode excluir pedidos que já foram separados.");
      return;
    }
    if (!confirm("Tem certeza que deseja excluir este pedido?")) return;
    await deleteDoc(doc(db, "pedidos", p.id));
  } catch (e) {
    console.error(e);
    alert("Não foi possível excluir o pedido.");
  }
}

function loadOrderIntoComposer(p) {
  const blocks = getPedidoBlocksFromPedido(p);
  orderBlocks = blocks.length ? blocks : [createBlock("001")];
  renderPedidoComposer();
}

function clearComposer() {
  editandoId = null;
  $("cliente").value = "";
  $("obsPedido").value = "";
  orderBlocks = [createBlock("001")];
  renderPedidoComposer();
  clearEditMode();
}

function validateOrderBlocks() {
  if (!orderBlocks.length) return "Adicione pelo menos um modelo ao pedido.";
  for (const [index, block] of orderBlocks.entries()) {
    if (!String(block.texto || "").trim()) {
      return `Preencha a grade do modelo ${index + 1} (${getModelLabel(block.modelId)}).`;
    }
  }
  return "";
}

function setupEvents() {
  $("perfilLogin").addEventListener("change", showLoginFields);

  $("btnEntrar").addEventListener("click", () => {
    session = $("perfilLogin").value === "dono"
      ? { perfil: "dono", nome: $("nomeDono").value }
      : { perfil: "expedicao", nome: "Expedição" };
    saveSession();
    renderAll();
  });

  $("btnSairDono").addEventListener("click", () => {
    session = null;
    saveSession();
    renderAll();
  });

  $("btnSairExp").addEventListener("click", () => {
    session = null;
    saveSession();
    renderAll();
  });

  $("btnEscolherModelo").addEventListener("click", () => {
    pickerOpen = !pickerOpen;
    renderPedidoComposer();
  });

  $("btnLimparModelos").addEventListener("click", () => {
    orderBlocks = [createBlock("001")];
    renderPedidoComposer();
  });

  $("pedidoBlocks").addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    const uidBlock = target.getAttribute("data-block-text");
    if (!uidBlock) return;
    orderBlocks = orderBlocks.map(block => block.uid === uidBlock ? { ...block, texto: target.value } : block);
    renderPedidoPreviewOnly();
  });

  $("pedidoBlocks").addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const uidBlock = target.getAttribute("data-model-select");
    if (!uidBlock) return;
    orderBlocks = orderBlocks.map(block => block.uid === uidBlock ? { ...block, modelId: target.value } : block);
    renderPedidoComposer();
  });

  $("pedidoBlocks").addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const removeUid = target.getAttribute("data-remove-block");
    if (removeUid) {
      if (orderBlocks.length === 1) {
        orderBlocks = [createBlock("001")];
      } else {
        orderBlocks = orderBlocks.filter(block => block.uid !== removeUid);
      }
      renderPedidoComposer();
      return;
    }
  });

  $("modeloPicker").addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-add-model]") : null;
    if (!target) return;
    const modelId = target.getAttribute("data-add-model");
    if (!modelId) return;
    addModelBlock(modelId);
  });

  $("btnEnviarPedido").addEventListener("click", async () => {
    try {
      if (!session || session.perfil !== "dono") {
        alert("Você precisa estar logado como Vendas.");
        return;
      }

      const cliente = $("cliente").value.trim();
      const obsPedido = $("obsPedido").value.trim();

      if (!cliente) {
        alert("Preencha o cliente.");
        return;
      }

      const blockError = validateOrderBlocks();
      if (blockError) {
        alert(blockError);
        return;
      }

      const pedidoItens = normalizeOrderItems(orderBlocks);
      const pedidoTexto = buildPedidoTextoFromBlocks(orderBlocks);
      const now = nowParts();

      if (editandoId) {
        const p = pedidos.find(x => x.id === editandoId);
        if (!p) {
          alert("Pedido não encontrado.");
          clearEditMode();
          return;
        }
        if (p.dono !== session.nome) {
          alert("Você só pode editar os seus próprios pedidos.");
          clearEditMode();
          return;
        }

        await updateDoc(doc(db, "pedidos", editandoId), {
          cliente,
          pedidoTexto,
          pedidoItens,
          obsPedido,
          status: "nao-visualizado",
          expObs: "",
          editedBy: session.nome,
          editedDate: now.date,
          editedTime: now.time,
          editedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
          updatedAtMs: Date.now(),
          updatedDate: now.date,
          updatedTime: now.time
        });

        notify("Pedido editado", `Pedido ${p.id} alterado por ${session.nome}.`);
        clearComposer();
      } else {
        await addDoc(pedidosRef, {
          dono: session.nome,
          cliente,
          pedidoTexto,
          pedidoItens,
          obsPedido,
          status: "nao-visualizado",
          expObs: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          createdDate: now.date,
          createdTime: now.time,
          updatedDate: now.date,
          updatedTime: now.time,
          editedBy: "",
          editedDate: "",
          editedTime: "",
          editedAtMs: 0
        });
        clearComposer();
      }
    } catch (e) {
      console.error(e);
      alert(editandoId ? "Não foi possível salvar as alterações." : "Não foi possível enviar o pedido.");
    }
  });

  $("btnCancelarEdicao").addEventListener("click", () => {
    clearComposer();
  });

  $("btnExemplo").addEventListener("click", () => {
    $("cliente").value = "Loja Exemplo";
    $("obsPedido").value = "Separar com prioridade.";
    orderBlocks = [
      createBlock("001", "50 P preto\n100 M azul"),
      createBlock("002", "20 G branco\n15 M chocolate"),
      createBlock("005.2", "10 M preto c/ renda\n5 G rosê")
    ];
    renderPedidoComposer();
  });

  $("btnPendentes").addEventListener("click", () => {
    filtroExpedicao = "pendentes";
    renderExpedicao();
  });

  $("btnTodos").addEventListener("click", () => {
    filtroExpedicao = "todos";
    renderExpedicao();
  });

  $("searchExp").addEventListener("input", renderPedidosExp);
  $("filterStatus").addEventListener("change", renderPedidosExp);

  $("btnAtivarNotificacoesLogin").addEventListener("click", ativarNotificacoes);
  $("btnAtivarNotificacoesDono").addEventListener("click", ativarNotificacoes);
  $("btnAtivarNotificacoesExp").addEventListener("click", ativarNotificacoes);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    const editId = target.getAttribute("data-edit-order");
    if (editId) {
      editarPedido(editId);
      return;
    }

    const deleteId = target.getAttribute("data-delete-order");
    const origin = target.getAttribute("data-origin");
    if (deleteId && origin) {
      excluirPedido(deleteId, origin);
      return;
    }

    const selectOrder = target.getAttribute("data-select-order");
    if (selectOrder) {
      selectedExpeditionOrderId = selectOrder;
      renderPedidosExp();
      const card = document.querySelector(`[data-order-card="${CSS.escape(selectOrder)}"]`);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
  });
}

function editarPedido(id) {
  const p = pedidos.find(x => x.id === id);
  if (!session || session.perfil !== "dono") {
    alert("Você precisa estar logado como Vendas.");
    return;
  }
  if (!p || p.dono !== session.nome) {
    alert("Você só pode editar os seus próprios pedidos.");
    return;
  }

  editandoId = id;
  $("cliente").value = p.cliente || "";
  $("obsPedido").value = p.obsPedido || "";
  loadOrderIntoComposer(p);
  renderEditBox();
  $("cliente").focus();
}

async function excluirPedido(id, origem) {
  try {
    const p = pedidos.find(x => x.id === id);
    if (!p) {
      alert("Pedido não encontrado.");
      return;
    }

    if (origem === "dono") {
      if (!session || session.perfil !== "dono") {
        alert("Você precisa estar logado como Vendas.");
        return;
      }
      if (p.dono !== session.nome) {
        alert("Você só pode excluir os seus próprios pedidos.");
        return;
      }
    }

    if (origem === "expedicao") {
      if (!session || session.perfil !== "expedicao") {
        alert("Você precisa estar logado como Expedição.");
        return;
      }
      if ((p.status || "") !== "separado") {
        alert("A expedição só pode excluir pedidos que já foram separados.");
        return;
      }
    }

    if (!confirm("Tem certeza que deseja excluir este pedido?")) return;

    await deleteDoc(doc(db, "pedidos", id));

    if (editandoId === id) {
      clearComposer();
    }
  } catch (e) {
    console.error(e);
    alert("Não foi possível excluir o pedido.");
  }
}

async function ativarNotificacoes() {
  try {
    if (!("Notification" in window)) {
      alert("Seu navegador não suporta notificações.");
      return;
    }

    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      alert("Permissão de notificação negada.");
      return;
    }

    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: reg
        });
        if (token) {
          localStorage.setItem(TOKEN_KEY, token);
        }
      } catch (err) {
        console.warn("Erro ao registrar service worker/FCM:", err);
      }
    }

    alert("Notificações ativadas neste navegador.");
  } catch (err) {
    console.error(err);
    alert("Não foi possível ativar as notificações.");
  }
}

onMessage(messaging, (payload) => {
  const title = payload?.notification?.title || "Atualização do pedido";
  const body = payload?.notification?.body || "Você recebeu uma atualização.";
  notify(title, body);
});

onSnapshot(pedidosRef, (snapshot) => {
  const next = new Map();
  const changes = snapshot.docChanges().map(c => ({
    type: c.type,
    id: c.doc.id,
    data: { id: c.doc.id, ...c.doc.data() }
  }));

  snapshot.forEach(d => next.set(d.id, { id: d.id, ...d.data() }));
  pedidos = [...next.values()];
  renderAll();

  if (selectedExpeditionOrderId && !pedidos.some(p => p.id === selectedExpeditionOrderId)) {
    selectedExpeditionOrderId = pedidos[0]?.id || null;
  }

  if (initialized) {
    for (const ch of changes) {
      const n = ch.data;
      const o = prevMap.get(ch.id);

      if (ch.type === "added") {
        notify("Novo pedido", `${n.cliente || "Pedido novo"} enviado por ${n.dono || ""}.`);
      } else if (ch.type === "modified" && o) {
        const statusChanged = o.status !== n.status;
        const editChanged =
          o.editedAtMs !== n.editedAtMs ||
          o.pedidoTexto !== n.pedidoTexto ||
          o.obsPedido !== n.obsPedido ||
          o.cliente !== n.cliente;

        if (statusChanged) {
          notify("Status atualizado", `${n.cliente || "Pedido"} agora está: ${statusLabel(n.status)}.`);
        } else if (editChanged) {
          notify("Pedido editado", `${n.cliente || "Pedido"} foi alterado por ${n.editedBy || "alguém"}.`);
        }
      }
    }
  }

  prevMap = next;
  initialized = true;
});

setupEvents();
showLoginFields();
renderPedidoComposer();
renderAll();
