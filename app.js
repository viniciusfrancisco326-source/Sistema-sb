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

const MODEL_OPTIONS = [
  { group: "Linha base", value: "001", label: "001 - Reforçado Liso" },
  { group: "Linha base", value: "002", label: "002 - Sutiã Reforçado Renda" },
  { group: "Linha base", value: "003", label: "003 - Sutiã Nadador" },
  { group: "Linha base", value: "007", label: "007 - Sutiã Solteirinho Liso" },
  { group: "Linha base", value: "008", label: "008 - Solteirinho de Renda" },
  { group: "Linha base", value: "009", label: "009 - Sutiã Confort" },
  { group: "Linha base", value: "REF-LINGERIE", label: "REF: Conjunto de Lingerie" },
  { group: "Linha base", value: "REF-0013", label: "REF: Conjunto de Liguinha 0013" },
  { group: "Linha Plus Size", value: "004-PLUS", label: "004 - Sutiã Plus De Renda" },
  { group: "Linha Plus Size", value: "005-PLUS-POLIESTER", label: "005 - Sutiã Plus Size Poliéster" },
  { group: "Linha Plus Size", value: "005.2-PLUS-POLIESTER-C-RENDA", label: "005.2 - Sutiã Plus Poliéster c/Renda" },
  { group: "Linha Plus Size", value: "006-PLUS-POLIAMIDA", label: "006 - Sutiã Plus Size Poliamida" },
  { group: "Linha Plus Size", value: "CONJUNTO-PLUS-SIZE", label: "Conjunto De Plus Size" }
];

const $ = (id) => document.getElementById(id);

let session = loadSession();
let pedidos = [];
let editandoId = null;
let initialized = false;
let prevMap = new Map();
let expandedOrders = new Set();
let composerBlocks = [{ modeloCodigo: "001", descricao: "" }];
let composerCounter = 0;

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
function statusClass(s) { return STATUS[s]?.cls || "nao-visualizado"; }
function chipClass(s) { return STATUS[s]?.chip || "gray"; }
function statusLabel(s) { return STATUS[s]?.label || s || ""; }
function isPending(s) { return s !== "separado"; }
function isCollapsedStatus(s) { return s === "separado"; }
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
    try { new Notification(title, { body, icon: "Sou Bela -logo (3).png" }); } catch {}
  }
}

function showLoginFields() {
  const el = $("campoDono");
  if (!el) return;
  el.style.display = $("perfilLogin")?.value === "dono" ? "block" : "none";
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
  if (!composerBlocks.length) composerBlocks = [{ modeloCodigo: "001", descricao: "" }];
  renderPedidoComposer();
}
function renderExpedicao() {
  $("loginScreen").classList.add("hidden");
  $("appDono").classList.add("hidden");
  $("appExpedicao").classList.remove("hidden");
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

function modelLabelByValue(value) {
  if (!value) return "";
  return MODEL_OPTIONS.find(m => m.value === value)?.label || value;
}
function renderModelSelect(selected = "001") {
  const groups = {};
  for (const model of MODEL_OPTIONS) {
    if (!groups[model.group]) groups[model.group] = [];
    groups[model.group].push(model);
  }
  return Object.entries(groups).map(([groupName, items]) => `
    <optgroup label="${fmt(groupName)}">
      ${items.map(model => `<option value="${fmt(model.value)}" ${model.value === selected ? "selected" : ""}>${fmt(model.label)}</option>`).join("")}
    </optgroup>
  `).join("");
}

function createModelBlock(data = {}, index = 0) {
  const wrapper = document.createElement("div");
  wrapper.className = "model-block";
  wrapper.dataset.blockId = `model-block-${++composerCounter}`;
  wrapper.innerHTML = `
    <div class="model-block-head">
      <div class="field" style="flex:1">
        <label>Modelo</label>
        <select class="model-select">
          ${renderModelSelect(data.modeloCodigo || "001")}
        </select>
      </div>
      <button type="button" class="remove-model ${composerBlocks.length === 1 ? "hidden" : ""}">Remover</button>
    </div>

    <div class="field">
      <label>Como vai ser o pedido neste modelo</label>
      <textarea class="model-notes" placeholder="Ex: 50 P preto / 100 M azul">${fmt(data.descricao || "")}</textarea>
    </div>

    <div class="model-footer">
      ${index === composerBlocks.length - 1 ? '<button type="button" class="btn btn-ghost add-model-btn">+ Adicionar outro modelo</button>' : ''}
    </div>
  `;
  return wrapper;
}

function syncComposerFromDOM() {
  const blocks = [...document.querySelectorAll("#pedidoBlocos .model-block")];
  composerBlocks = blocks.map(block => {
    const select = block.querySelector(".model-select");
    const textarea = block.querySelector(".model-notes");
    return {
      modeloCodigo: select?.value || "001",
      descricao: (textarea?.value || "").trim()
    };
  });
}

function renderPedidoComposer() {
  const container = $("pedidoBlocos");
  if (!container) return;
  if (!composerBlocks.length) composerBlocks = [{ modeloCodigo: "001", descricao: "" }];

  container.innerHTML = composerBlocks.map((data, index) => createModelBlock(data, index).outerHTML).join("");

  container.querySelectorAll(".model-select").forEach(sel => sel.addEventListener("change", syncComposerFromDOM));
  container.querySelectorAll(".model-notes").forEach(txt => txt.addEventListener("input", syncComposerFromDOM));
}

function formatItemsText(items = []) {
  return items.map(item => {
    const name = item.modeloNome || modelLabelByValue(item.modeloCodigo) || item.modeloCodigo || "";
    const desc = (item.descricao || "").trim();
    return desc ? `${name}\n${desc}` : name;
  }).join("\n\n").trim();
}
function htmlItemsText(items = []) {
  return items.map(item => {
    const name = fmt(item.modeloNome || modelLabelByValue(item.modeloCodigo) || item.modeloCodigo || "");
    const desc = fmt((item.descricao || "").trim()).replace(/\n/g, "<br>");
    return desc ? `<div class="muted-card"><div class="model-tag">${name}</div><div class="model-summary">${desc}</div></div>` : `<div class="muted-card"><div class="model-tag">${name}</div></div>`;
  }).join("");
}
function legacyToItems(pedidoTexto) {
  const raw = String(pedidoTexto || "").trim();
  if (!raw) return [{ modeloCodigo: "001", modeloNome: modelLabelByValue("001"), descricao: "" }];

  const blocks = raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const items = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const first = lines[0] || "";
    const matched = MODEL_OPTIONS.find(m => first.toLowerCase().includes(m.label.toLowerCase()) || first.toLowerCase().includes(m.value.toLowerCase()));
    if (matched && lines.length > 0) {
      items.push({
        modeloCodigo: matched.value,
        modeloNome: matched.label,
        descricao: lines.slice(1).join("\n")
      });
    } else if (lines.length > 1) {
      items.push({
        modeloCodigo: "001",
        modeloNome: modelLabelByValue("001"),
        descricao: lines.join("\n")
      });
    } else {
      items.push({
        modeloCodigo: "001",
        modeloNome: modelLabelByValue("001"),
        descricao: block
      });
    }
  }

  return items.length ? items : [{ modeloCodigo: "001", modeloNome: modelLabelByValue("001"), descricao: raw }];
}
function getPedidoItemsFromOrder(p) {
  if (Array.isArray(p.itensPedido) && p.itensPedido.length) return p.itensPedido;
  return legacyToItems(p.pedidoTexto || "");
}
function pedidoResumo(p) {
  const items = getPedidoItemsFromOrder(p);
  const first = items[0];
  const base = first ? `${first.modeloNome || modelLabelByValue(first.modeloCodigo)}` : "Pedido";
  const extra = items.length > 1 ? ` +${items.length - 1} modelo(s)` : "";
  return `${base}${extra}`;
}
function orderSearchText(p) {
  const items = getPedidoItemsFromOrder(p);
  return [
    p.id, p.dono, p.cliente, p.estado, p.cidade, p.pedidoTexto, p.obsPedido, p.expObs, p.status,
    p.createdDate, p.createdTime, p.updatedDate, p.updatedTime, p.editedBy, p.editedDate, p.editedTime,
    ...items.flatMap(item => [item.modeloCodigo, item.modeloNome, item.descricao])
  ].map(v => String(v ?? "")).join(" ").toLowerCase();
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
    const items = getPedidoItemsFromOrder(p);
    return `
      <div class="pedido ${statusClass(p.status)}">
        <div class="pedido-top">
          <div class="pedido-top-left">
            <div class="pedido-head">
              <div>
                <h3>${fmt(p.cliente || "")}</h3>
                <div class="pedido-meta"><strong>${fmt(p.id)}</strong> • ${fmt(p.dono || "")}</div>
              </div>
              <div class="pedido-meta">
                <div><strong>Enviado em:</strong> ${fmt(fmtCreated(p))}</div>
                <div><strong>Atualizado:</strong> ${fmt(fmtUpdated(p))}</div>
                <div><strong>${fmt(p.estado || "-")} / ${fmt(p.cidade || "-")}</strong></div>
              </div>
            </div>
            <div class="pedido-preview">${fmt(pedidoResumo(p))}</div>
          </div>
          <div class="pedido-top-right">
            <span class="chip ${chipClass(p.status)}">${fmt(statusLabel(p.status))}</span>
          </div>
        </div>
        <div class="pedido-body open">
          <div class="pedido-body-inner">
            <div class="pedido-grid">
              <div class="pedido-compact">
                <div class="muted-card">
                  <div class="small-label">Cliente</div>
                  <div class="big-value">${fmt(p.cliente || "")}</div>
                </div>
                <div class="pedido-subgrid">
                  <div class="muted-card">
                    <div class="small-label">Estado</div>
                    <div class="big-value">${fmt(p.estado || "-")}</div>
                  </div>
                  <div class="muted-card">
                    <div class="small-label">Cidade</div>
                    <div class="big-value">${fmt(p.cidade || "-")}</div>
                  </div>
                </div>
                <div class="muted-card">
                  <div class="small-label">Modelos</div>
                  <div class="model-summary">${fmt(formatItemsText(items)).replace(/\n/g, "<br>")}</div>
                </div>
                ${p.obsPedido ? `<div class="obsBox"><strong>Observação do pedido</strong>${fmt(p.obsPedido).replace(/\n/g, "<br>")}</div>` : ""}
                ${p.expObs ? `<div class="obsBox"><strong>Observação da expedição</strong>${fmt(p.expObs).replace(/\n/g, "<br>")}</div>` : ""}
                ${p.editedBy ? `<div class="obsBox"><strong>Última edição</strong>${fmt(p.editedBy)}<br>${fmt(p.editedDate)} às ${fmt(p.editedTime)}</div>` : ""}
                <div class="status-actions">
                  <button class="btn btn-ghost" onclick="window.editarPedido('${p.id}')">Editar pedido</button>
                  <button class="btn btn-danger" onclick="window.excluirPedido('${p.id}', 'dono')">Excluir pedido</button>
                </div>
                <div class="inline-note">
                  ${p.status === "separado"
                    ? "<strong>Pedido finalizado.</strong>"
                    : "<strong>Pedido pendente.</strong> Ainda pode receber ajuste da expedição."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function filteredExpeditionOrders() {
  const busca = ($("searchExp").value || "").trim().toLowerCase();
  const statusFiltro = $("filterStatus").value || "all";
  let view = pedidos.slice().sort((a, b) => tsToMs(b.createdAtMs) - tsToMs(a.createdAtMs));
  if (statusFiltro !== "all") view = view.filter(p => p.status === statusFiltro);
  if (busca) view = view.filter(p => orderSearchText(p).includes(busca));
  return view;
}

function renderPedidosExp() {
  const lista = $("listaPedidosExp");
  const view = filteredExpeditionOrders();

  if (!view.length) {
    lista.innerHTML = `<div class="empty">Nenhum pedido encontrado com esses filtros.</div>`;
    return;
  }

  lista.innerHTML = view.map(p => {
    const st = p.status || "nao-visualizado";
    const items = getPedidoItemsFromOrder(p);
    const open = expandedOrders.has(p.id) || !isCollapsedStatus(st);
    return `
      <div class="pedido ${statusClass(st)}">
        <button class="pedido-top" type="button" onclick="window.togglePedidoExpedicao('${p.id}')">
          <div class="pedido-top-left">
            <div class="pedido-head">
              <div>
                <h3>${fmt(p.cliente || "")}</h3>
                <div class="pedido-meta"><strong>${fmt(p.id)}</strong> • ${fmt(p.dono || "")}</div>
              </div>
              <div class="pedido-meta">
                <div><strong>Enviado em:</strong> ${fmt(fmtCreated(p))}</div>
                <div><strong>Atualizado:</strong> ${fmt(fmtUpdated(p))}</div>
                <div><strong>${fmt(p.estado || "-")} / ${fmt(p.cidade || "-")}</strong></div>
              </div>
            </div>
            <div class="pedido-preview">${fmt(pedidoResumo(p))}</div>
          </div>
          <div class="pedido-top-right">
            <span class="chip ${chipClass(st)}">${fmt(statusLabel(st))}</span>
            <span class="badge">${open ? "Ocultar" : "Abrir"}</span>
          </div>
        </button>

        <div class="pedido-body ${open ? "open" : ""}" id="body-${p.id}">
          <div class="pedido-body-inner">
            <div class="pedido-grid">
              <div class="pedido-subgrid">
                <div class="muted-card">
                  <div class="small-label">Cliente</div>
                  <div class="big-value">${fmt(p.cliente || "")}</div>
                </div>
                <div class="muted-card">
                  <div class="small-label">Origem</div>
                  <div class="big-value">${fmt(p.estado || "-")} / ${fmt(p.cidade || "-")}</div>
                </div>
              </div>

              <div class="muted-card">
                <div class="small-label">Modelos do pedido</div>
                ${htmlItemsText(items)}
              </div>

              ${p.obsPedido ? `<div class="obsBox"><strong>Observação do pedido</strong>${fmt(p.obsPedido).replace(/\n/g, "<br>")}</div>` : ""}
              ${p.editedBy ? `<div class="obsBox"><strong>Última edição</strong>${fmt(p.editedBy)}<br>${fmt(p.editedDate)} às ${fmt(p.editedTime)}</div>` : ""}

              <div class="detail-box">
                <div class="field">
                  <label><strong>Status do pedido</strong></label>
                  <select id="status-${p.id}" onchange="window.mostrarCampoObs('${p.id}', event)">
                    <option value="nao-visualizado" ${st==="nao-visualizado" ? "selected" : ""}>Não visualizado</option>
                    <option value="visualizado" ${st==="visualizado" ? "selected" : ""}>Visualizado</option>
                    <option value="em-separacao" ${st==="em-separacao" ? "selected" : ""}>Em separação</option>
                    <option value="falta-peca" ${st==="falta-peca" ? "selected" : ""}>Falta peça</option>
                    <option value="separado" ${st==="separado" ? "selected" : ""}>Separado</option>
                  </select>
                </div>

                <div id="obsWrap-${p.id}" style="margin-top:12px; ${st==="separado" ? "display:none;" : ""}">
                  <div class="field">
                    <label><strong>Observações da expedição</strong></label>
                    <textarea id="obs-${p.id}" placeholder="Escreva o recado para o dono.">${fmt(p.expObs || "")}</textarea>
                  </div>
                  <div class="tiny">O campo aparece quando o status é diferente de “Separado”.</div>
                </div>

                <div class="status-actions">
                  <button class="btn btn-primary" onclick="window.atualizarPedido('${p.id}')">Confirmar seleção</button>
                  ${st === "separado" ? `<button class="btn btn-danger" onclick="window.excluirPedido('${p.id}', 'expedicao')">Excluir separado</button>` : ""}
                </div>
              </div>

              <div class="inline-note">
                ${st === "separado"
                  ? "<strong>Pedido finalizado.</strong> Continua aparecendo no histórico até ser excluído."
                  : "<strong>Pedido pendente.</strong> Só será finalizado quando a expedição marcar como separado."}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

window.togglePedidoExpedicao = function(id) {
  if (expandedOrders.has(id)) expandedOrders.delete(id);
  else expandedOrders.add(id);
  renderPedidosExp();
};
window.mostrarCampoObs = function(id, event) {
  if (event) event.stopPropagation();
  const sel = document.getElementById(`status-${id}`);
  const wrap = document.getElementById(`obsWrap-${id}`);
  if (sel && wrap) wrap.style.display = sel.value === "separado" ? "none" : "block";
};
window.atualizarPedido = async function(id) {
  try {
    if (!session || session.perfil !== "expedicao") {
      alert("Você precisa estar logado como Expedição.");
      return;
    }

    const p = pedidos.find(x => x.id === id);
    if (!p) {
      alert("Pedido não encontrado.");
      return;
    }

    const st = document.getElementById(`status-${id}`)?.value || p.status || "nao-visualizado";
    const obs = (document.getElementById(`obs-${id}`)?.value || "").trim();

    if (st === "falta-peca" && !obs) {
      alert("Preencha a observação para informar o que está faltando.");
      return;
    }

    const now = nowParts();

    await updateDoc(doc(db, "pedidos", id), {
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
};
window.editarPedido = function(id) {
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
  $("estado").value = p.estado || "";
  $("cidade").value = p.cidade || "";
  $("obsPedido").value = p.obsPedido || "";
  composerBlocks = getModelBlocksFromOrder(p);
  renderPedidoComposer();
  renderEditBox();
  $("cliente").focus();
};
function getModelBlocksFromOrder(p) {
  if (Array.isArray(p.itensPedido) && p.itensPedido.length) {
    return p.itensPedido.map(item => ({
      modeloCodigo: item.modeloCodigo || "001",
      descricao: item.descricao || ""
    }));
  }
  return legacyToItems(p.pedidoTexto || "");
}
window.excluirPedido = async function(id, origem) {
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
      clearEditMode();
      $("cliente").value = "";
      $("estado").value = "";
      $("cidade").value = "";
      $("obsPedido").value = "";
      composerBlocks = [{ modeloCodigo: "001", descricao: "" }];
      renderPedidoComposer();
    }
  } catch (e) {
    console.error(e);
    alert("Não foi possível excluir o pedido.");
  }
};

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
        if (token) localStorage.setItem(TOKEN_KEY, token);
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

  $("pedidoBlocos").addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    const add = target.closest(".add-model-btn");
    const remove = target.closest(".remove-model");
    if (add) {
      syncComposerFromDOM();
     composerBlocks.push({ modeloCodigo: "", descricao: "" });
      renderPedidoComposer();
      requestAnimationFrame(() => {
        const last = $("pedidoBlocos").querySelector(".model-block:last-child .model-notes");
        if (last) last.focus();
      });
      return;
    }
   if (remove) {
  syncComposerFromDOM();

  const bloco = remove.closest(".model-block");
  const todos = [...document.querySelectorAll("#pedidoBlocos .model-block")];

  const index = todos.indexOf(bloco);

  if (index > -1) {
    composerBlocks.splice(index, 1);
  }

  if (!composerBlocks.length) {
    composerBlocks = [{
      modeloCodigo: "001",
      descricao: ""
    }];
  }

  renderPedidoComposer();
};
    }
  });
  $("pedidoBlocos").addEventListener("input", syncComposerFromDOM);
  $("pedidoBlocos").addEventListener("change", syncComposerFromDOM);

  $("btnEnviarPedido").addEventListener("click", async () => {
    try {
      if (!session || session.perfil !== "dono") {
        alert("Você precisa estar logado como Vendas.");
        return;
      }

      const cliente = $("cliente").value.trim();
      const estado = $("estado").value.trim();
      const cidade = $("cidade").value.trim();
      const obsPedido = $("obsPedido").value.trim();
      syncComposerFromDOM();
     const items = composerBlocks
   .filter(item => item.modeloCodigo)
   .map(item => ({
     modeloCodigo: item.modeloCodigo,
     modeloNome: modelLabelByValue(item.modeloCodigo),
     descricao: (item.descricao || "").trim()
    }));
      if (!cliente || !estado || !cidade) {
        alert("Preencha o cliente, o estado e a cidade.");
        return;
      }

      const validItems = items.filter(item => item.modeloCodigo || item.descricao);
      if (!validItems.length) {
        alert("Adicione ao menos um modelo ao pedido.");
        return;
      }

      const now = nowParts();
      const pedidoTexto = formatItemsText(validItems);

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
          estado,
          cidade,
          itensPedido: validItems,
          pedidoTexto,
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
        clearEditMode();
      } else {
        await addDoc(pedidosRef, {
          dono: session.nome,
          cliente,
          estado,
          cidade,
          itensPedido: validItems,
          pedidoTexto,
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
      }

      $("cliente").value = "";
      $("estado").value = "";
      $("cidade").value = "";
      $("obsPedido").value = "";
      composerBlocks = [{ modeloCodigo: "001", descricao: "" }];
      renderPedidoComposer();
    } catch (e) {
      console.error(e);
      alert(editandoId ? "Não foi possível salvar as alterações." : "Não foi possível enviar o pedido.");
    }
  });

  $("btnCancelarEdicao").addEventListener("click", () => {
    clearEditMode();
    $("cliente").value = "";
    $("estado").value = "";
    $("cidade").value = "";
    $("obsPedido").value = "";
    composerBlocks = [{ modeloCodigo: "001", descricao: "" }];
    renderPedidoComposer();
  });

  $("btnExemplo").addEventListener("click", () => {
    $("cliente").value = "Loja Exemplo";
    $("estado").value = "Ceará";
    $("cidade").value = "Juazeiro do Norte";
    $("obsPedido").value = "Separar com prioridade.";
    composerBlocks = [
      { modeloCodigo: "001", descricao: "50 P preto\n100 M azul" },
      { modeloCodigo: "002", descricao: "20 G branco" }
    ];
    renderPedidoComposer();
  });

  $("searchExp").addEventListener("input", renderPedidosExp);
  $("filterStatus").addEventListener("change", renderPedidosExp);

  $("btnAtivarNotificacoesLogin").addEventListener("click", ativarNotificacoes);
  $("btnAtivarNotificacoesDono").addEventListener("click", ativarNotificacoes);
  $("btnAtivarNotificacoesExp").addEventListener("click", ativarNotificacoes);
}

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
          o.cliente !== n.cliente ||
          o.estado !== n.estado ||
          o.cidade !== n.cidade;

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
renderAll();
