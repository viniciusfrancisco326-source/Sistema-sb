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

// ==========================================
// CREDENCIAIS DO SEU FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCowmhL0Iy3R-dkyLy2uJG-HyHYbnQV3cY",
  authDomain: "sistema-sb-expedicao.firebaseapp.com",
  projectId: "sistema-sb-expedicao",
  storageBucket: "sistema-sb-expedicao.firebasestorage.app",
  messagingSenderId: "440742684804",
  appId: "1:440742684804:web:3832473a00978511683ad1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const pedidosRef = collection(db, "pedidos");

const SESSION_KEY = "sistema_sou_bela_sessao_v13";
const ONESIGNAL_APP_ID = "000b8540-c342-4450-8ab0-797bbc3e7313"; 

let session = null;
let databasePedidos = new Map();
let composerBlocks = [{ modeloCodigo: "001", descricao: "" }];
let editandoId = null;

const $ = id => document.getElementById(id);

// Carregar sessão existente
try {
  const saved = localStorage.getItem(SESSION_KEY);
  if (saved) session = JSON.parse(saved);
} catch (e) { console.error(e); }

function salvarSessao(perfil, nome) {
  session = { perfil, nome };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  renderAll();
}

// ==========================================
// INTEGRAÇÃO DO ONESIGNAL
// ==========================================
async function vincularUsuarioOneSignal() {
  if (!session) return;
  try {
    window.OneSignal = window.OneSignal || [];
    window.OneSignal.push(async function() {
      await window.OneSignal.User.addTag("usuario_perfil", session.perfil);
      if (session.perfil === "dono") {
        await window.OneSignal.User.addTag("usuario_nome", session.nome);
      }
    });
  } catch (e) { console.error(e); }
}

async function ativarNotificacoes() {
  try {
    window.OneSignal = window.OneSignal || [];
    window.OneSignal.push(async function() {
      await window.OneSignal.Slidedown.promptPush();
      await vincularUsuarioOneSignal();
    });
  } catch (e) { console.error(e); }
}

async function enviarPushOneSignal(tagKey, tagValue, titulo, mensagem) {
  console.log(`[Push] Enviando para ${tagKey}=${tagValue}: ${titulo} - ${mensagem}`);
}

// ==========================================
// RENDERIZAÇÃO: PAINEL DE VENDAS (DONOS)
// ==========================================
function renderAll() {
  if (!session) {
    $("loginScreen").classList.remove("hidden");
    $("appDono").classList.add("hidden");
    $("appExpedicao").classList.add("hidden");
    return;
  }

  $("loginScreen").classList.add("hidden");
  vincularUsuarioOneSignal();

  if (session.perfil === "dono") {
    $("appDono").classList.remove("hidden");
    $("appExpedicao").classList.add("hidden");
    $("nomeSessaoDono").textContent = `Logado como: ${session.nome}`;
    $("nomePedidosDono").textContent = session.nome;
    renderPedidosDono();
  } else {
    $("appDono").classList.add("hidden");
    $("appExpedicao").classList.remove("hidden");
    renderPedidosExp();
  }
}

function renderPedidosDono() {
  const lista = $("listaPedidosDono");
  if (!lista) return;

  const meusPedidos = Array.from(databasePedidos.values())
    .filter(p => p.vendedor === session.nome)
    .sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));

  if (meusPedidos.length === 0) {
    lista.innerHTML = `<div class="empty">Nenhum pedido enviado por você ainda.</div>`;
    if ($("statTotalDono")) $("statTotalDono").textContent = "0";
    if ($("statPendentesDono")) $("statPendentesDono").textContent = "0";
    if ($("statSeparadosDono")) $("statSeparadosDono").textContent = "0";
    return;
  }

  let pendentes = 0;
  let separados = 0;

  lista.innerHTML = meusPedidos.map(p => {
    const isConcluido = p.status === "separado";
    if (isConcluido) separados++; else pendentes++;

    let statusLabel = p.status.replace("-", " ");
    let chipClass = "gray";
    if (p.status === "nao-visualizado") chipClass = "red";
    if (p.status === "visualizado") chipClass = "yellow";
    if (p.status === "em-separacao") chipClass = "blue";
    if (p.status === "falta-peca") chipClass = "red";
    if (p.status === "separado") chipClass = "green";

    const modelosHtml = (p.modelos || []).map(m => `
      <div class="muted-card" style="margin-bottom:6px;">
        <span class="small-label">Modelo: ${m.modeloCodigo}</span>
        <div class="big-value" style="white-space: pre-line; font-size:14px; margin-top:4px;">${m.descricao}</div>
      </div>
    `).join("");

    return `
      <div class="pedido ${p.status}">
        <div class="pedido-body-inner">
          <div class="pedido-head">
            <div>
              <span class="chip ${chipClass}">${statusLabel.toUpperCase()}</span>
              <div class="pedido-meta" style="margin-top:6px;">
                <strong>Cliente:</strong> ${p.cliente} | <strong>Destino:</strong> ${p.cidade}-${p.estado}
              </div>
              <div class="pedido-meta" style="font-size:11px; margin-top:2px;">
                Enviado em: ${p.createdDate || ""} às ${p.createdTime || ""}
              </div>
              ${p.historicoAlteracao ? `<div class="alteracao-aviso-tag">✏️ ${p.historicoAlteracao}</div>` : ""}
            </div>
            <div class="actions" style="margin:0; display: flex; gap: 8px;">
              <button class="btn btn-ghost btn-editar" data-id="${p.id}">✏️ Editar</button>
              <button class="btn btn-danger btn-excluir-pedido" data-id="${p.id}" style="padding: 8px 12px; font-size: 13px;">🗑️ Excluir</button>
            </div>
          </div>
          <div class="pedido-grid">
            <div>${modelosHtml}</div>
            ${p.obs ? `<div class="obsBox"><strong>Observações:</strong>${p.obs}</div>` : ""}
          </div>
        </div>
      </div>
    `;
  }).join("");

  if ($("statTotalDono")) $("statTotalDono").textContent = meusPedidos.length;
  if ($("statPendentesDono")) $("statPendentesDono").textContent = pendentes;
  if ($("statSeparadosDono")) $("statSeparadosDono").textContent = separados;

  document.querySelectorAll(".btn-editar").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const targetBtn = e.target.closest(".btn-editar");
      if (targetBtn) {
        ativarModoEdicao(targetBtn.getAttribute("data-id"));
      }
    });
  });

  document.querySelectorAll(".btn-excluir-pedido").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const targetBtn = e.target.closest(".btn-excluir-pedido");
      if (targetBtn && confirm("Deseja mesmo excluir definitivamente este pedido?")) {
        await deleteDoc(doc(db, "pedidos", targetBtn.getAttribute("data-id")));
      }
    });
  });
}

// ==========================================
// RENDERIZAÇÃO: PAINEL DA EXPEDIÇÃO
// ==========================================
function renderPedidosExp() {
  const lista = $("listaPedidosExp");
  if (!lista) return;

  const busca = ($("searchExp")?.value || "").toLowerCase().trim();
  const filtroStatus = $("filterStatus")?.value || "all";

  let listagem = Array.from(databasePedidos.values())
    .sort((a, b) => {
      if (a.status === "nao-visualizado" && b.status !== "nao-visualizado") return -1;
      if (a.status !== "nao-visualizado" && b.status === "nao-visualizado") return 1;
      return (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
    });

  let totalGeral = listagem.length;
  let filaEspera = listagem.filter(p => p.status !== "separado").length;
  let concluidos = listagem.filter(p => p.status === "separado").length;

  if ($("statTotalExp")) $("statTotalExp").textContent = totalGeral;
  if ($("statPendExp")) $("statPendExp").textContent = filaEspera;
  if ($("statSepExp")) $("statSepExp").textContent = concluidos;

  if (filtroStatus !== "all") {
    listagem = listagem.filter(p => p.status === filtroStatus);
  }

  if (busca) {
    listagem = listagem.filter(p => {
      return (p.cliente || "").toLowerCase().includes(busca) ||
             (p.vendedor || "").toLowerCase().includes(busca) ||
             (p.cidade || "").toLowerCase().includes(busca) ||
             (p.modelos || []).some(m => (m.modeloCodigo || "").toLowerCase().includes(busca) || (m.descricao || "").toLowerCase().includes(busca));
    });
  }

  if (listagem.length === 0) {
    lista.innerHTML = `<div class="empty">Nenhum pedido encontrado.</div>`;
    return;
  }

  lista.innerHTML = listagem.map(p => {
    let chipClass = "gray";
    if (p.status === "nao-visualizado") chipClass = "red";
    if (p.status === "visualizado") chipClass = "yellow";
    if (p.status === "em-separacao") chipClass = "blue";
    if (p.status === "falta-peca") chipClass = "red";
    if (p.status === "separado") chipClass = "green";

    const modelosHtml = (p.modelos || []).map(m => `
      <div class="muted-card" style="margin-bottom:6px; background:#fff;">
        <span class="small-label">Modelo: ${m.modeloCodigo}</span>
        <div class="big-value" style="white-space: pre-line; font-size:14px; margin-top:4px;">${m.descricao}</div>
      </div>
    `).join("");

    return `
      <div class="pedido ${p.status}" style="background:#f8fafc;">
        <div class="pedido-body-inner">
          <div class="pedido-head">
            <div style="flex: 1; min-width: 250px;">
              <span class="chip ${chipClass}">${p.status.replace("-"," ").toUpperCase()}</span>
              <h3 style="margin:8px 0 4px 0; font-size:18px;">${p.cliente}</h3>
              <div class="pedido-meta">
                <strong>Vendedor:</strong> ${p.vendedor} | <strong>Destino:</strong> ${p.cidade}-${p.estado}
              </div>
              <div class="pedido-meta" style="font-size:11px; margin-top:2px;">
                Entrada: ${p.createdDate || ""} às ${p.createdTime || ""}
              </div>
              ${p.historicoAlteracao ? `<div class="alteracao-aviso-box">⚠️ Alerta da Expedição: ${p.historicoAlteracao}</div>` : ""}
            </div>
            <div style="display:flex; flex-direction:column; gap:10px; align-items:flex-end;">
              <div class="field" style="margin:0; min-width:160px;">
                <label style="font-size:11px;">MUDAR STATUS:</label>
                <select class="select-status-exp" data-id="${p.id}" style="padding:6px 10px; font-size:13px; border-radius:8px;">
                  <option value="nao-visualizado" ${p.status==="nao-visualizado"?"selected":""}>Não visualizado</option>
                  <option value="visualizado" ${p.status==="visualizado"?"selected":""}>Visualizado</option>
                  <option value="em-separacao" ${p.status==="em-separacao"?"selected":""}>Em separação</option>
                  <option value="falta-peca" ${p.status==="falta-peca"?"selected":""}>Falta peça</option>
                  <option value="separado" ${p.status==="separado"?"selected":""}>Separado</option>
                </select>
              </div>
              ${p.status === "separado" ? `<button class="btn btn-danger btn-excluir-exp" data-id="${p.id}" style="padding: 6px 12px; font-size: 12px; border-radius: 8px;">🗑️ Arquivar/Excluir</button>` : ""}
            </div>
          </div>
          <div class="pedido-grid">
            <div>${modelosHtml}</div>
            ${p.obs ? `<div class="obsBox" style="background:#fff; border-color:#e2e8f0;"><strong>Observações:</strong>${p.obs}</div>` : ""}
          </div>
        </div>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".select-status-exp").forEach(sel => {
    sel.addEventListener("change", async (e) => {
      await atualizarStatusPedido(e.target.getAttribute("data-id"), e.target.value);
    });
  });

  document.querySelectorAll(".btn-excluir-exp").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const targetBtn = e.target.closest(".btn-excluir-exp");
      if (targetBtn && confirm("A expedição deseja remover/excluir este pedido concluído da lista?")) {
        await deleteDoc(doc(db, "pedidos", targetBtn.getAttribute("data-id")));
      }
    });
  });
}

// ==========================================
// AÇÕES E REGRAS DE NEGÓCIO
// ==========================================
async function atualizarStatusPedido(id, novoStatus) {
  try {
    const pedidoAntigo = databasePedidos.get(id);
    const agora = obterDataHoraLocal();
    await updateDoc(doc(db, "pedidos", id), {
      status: novoStatus,
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
      updatedDate: agora.date,
      updatedTime: agora.time
    });
    
    if (pedidoAntigo && pedidoAntigo.status !== novoStatus) {
      await enviarPushOneSignal("usuario_nome", pedidoAntigo.vendedor, "🔄 Status Updated!", `O pedido de ${pedidoAntigo.cliente} mudou para: ${novoStatus.replace("-"," ")}`);
    }
  } catch (e) { console.error(e); }
}

function renderPedidoComposer() {
  const container = $("pedidoBlocos");
  if (!container) return;
  
  container.innerHTML = composerBlocks.map((b, idx) => `
    <div class="model-block" style="margin-top:12px; position:relative;">
      <div class="grid-2">
        <div class="field">
          <label>Código do Modelo</label>
          <input type="text" class="composer-codigo" data-idx="${idx}" value="${b.modeloCodigo}" placeholder="Ex: 001">
        </div>
        <div class="field">
          <label>Grade / Quantidades</label>
          <textarea class="composer-desc" data-idx="${idx}" placeholder="Ex: 10 P, 20 M azul" style="min-height:45px; padding:8px; font-size:13px;">${b.descricao}</textarea>
        </div>
      </div>
      ${composerBlocks.length > 1 ? `<button type="button" class="btn-remove-block" data-idx="${idx}" style="position:absolute; top:-8px; right:-8px; background:#ef4444; color:white; border:none; border-radius:50%; width:22px; height:22px; font-size:11px; cursor:pointer; font-weight:bold;">X</button>` : ""}
    </div>
  `).join("");

  const btnAdd = document.createElement("button");
  btnAdd.type = "button";
  btnAdd.className = "btn btn-ghost";
  btnAdd.style = "margin-top:10px; width:100%; font-size:12px; padding:6px;";
  btnAdd.textContent = "➕ Adicionar Outro Modelo";
  btnAdd.addEventListener("click", () => {
    composerBlocks.push({ modeloCodigo: "", descricao: "" });
    renderPedidoComposer();
  });
  container.appendChild(btnAdd);

  document.querySelectorAll(".composer-codigo").forEach(input => {
    input.addEventListener("input", (e) => {
      composerBlocks[parseInt(e.target.getAttribute("data-idx"))].modeloCodigo = e.target.value;
    });
  });

  document.querySelectorAll(".composer-desc").forEach(txt => {
    txt.addEventListener("input", (e) => {
      composerBlocks[parseInt(e.target.getAttribute("data-idx"))].descricao = e.target.value;
    });
  });

  document.querySelectorAll(".btn-remove-block").forEach(btn => {
    btn.addEventListener("click", (e) => {
      composerBlocks.splice(parseInt(e.target.getAttribute("data-idx")), 1);
      renderPedidoComposer();
    });
  });
}

function ativarModoEdicao(id) {
  const p = databasePedidos.get(id);
  if (!p) return;
  editandoId = id;
  $("cliente").value = p.cliente || "";
  $("estado").value = p.estado || "";
  $("cidade").value = p.cidade || "";
  $("obsPedido").value = p.obs || "";
  composerBlocks = p.modelos && p.modelos.length ? JSON.parse(JSON.stringify(p.modelos)) : [{ modeloCodigo: "", descricao: "" }];
  renderPedidoComposer();

  $("editStatusBox").classList.remove("hidden");
  $("editInfo").textContent = `Editando o pedido de: ${p.cliente}`;
  $("btnEnviarPedido").textContent = "Salvar Alterações";
  $("btnCancelarEdicao").style.display = "inline-block";
  $("appDono").scrollIntoView({ behavior: "smooth" });
}

function clearEditMode() {
  editandoId = null;
  $("editStatusBox").classList.add("hidden");
  $("btnEnviarPedido").textContent = "Enviar pedido";
  $("btnCancelarEdicao").style.display = "none";
}

function obterDataHoraLocal() {
  const agora = new Date();
  const d = String(agora.getDate()).padStart(2, '0');
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const y = ago.getFullYear();
  const brTime = agora.toLocaleTimeString("pt-BR", { hour12: false, hour: '2-digit', minute: '2-digit' });
  return { date: `${d}/${m}/${y}`, time: brTime };
}

// ==========================================
// MONITORAMENTO DE CLIQUES
// ==========================================
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    renderAll();
    renderPedidoComposer();

    $("btnEntrar").addEventListener("click", () => {
      const perfil = $("perfilLogin").value;
      salvarSessao(perfil, perfil === "dono" ? $("nomeDono").value : "Expedição");
    });

    $("perfilLogin").addEventListener("change", (e) => {
      if (e.target.value === "dono") $("campoDono").classList.remove("hidden");
      else $("campoDono").classList.add("hidden");
    });

    $("btnSairDono").addEventListener("click", () => {
      localStorage.removeItem(SESSION_KEY); session = null; clearEditMode(); renderAll();
    });

    $("btnSairExp").addEventListener("click", () => {
      localStorage.removeItem(SESSION_KEY); session = null; renderAll();
    });

    $("btnCancelarEdicao").addEventListener("click", () => {
      clearEditMode(); $("cliente").value = ""; $("estado").value = ""; $("cidade").value = ""; $("obsPedido").value = "";
      composerBlocks = [{ modeloCodigo: "001", descricao: "" }]; renderPedidoComposer();
    });

    $("btnEnviarPedido").addEventListener("click", async () => {
      const cliente = $("cliente").value.trim();
      const estado = $("estado").value.trim();
      const city = $("cidade").value.trim();
      const obs = $("obsPedido").value.trim();

      if (!cliente || !estado || !city) {
        alert("Preencha Cliente, Estado e Cidade!"); return;
      }

      const modelsValidos = composerBlocks.filter(b => b.modeloCodigo.trim() || b.descricao.trim());
      if (modelsValidos.length === 0) {
        alert("Adicione pelo menos um modelo!"); return;
      }

      try {
        const localDateTime = obterDataHoraLocal();

        if (editandoId) {
          const pedAntigo = databasePedidos.get(editandoId);
          let novoStatus = pedAntigo ? pedAntigo.status : "nao-visualizado";
          if (novoStatus === "separado") {
            novoStatus = "nao-visualizado";
          }

          const textoAlteracao = `Alterado por ${session.nome} às ${localDateTime.time} - ${localDateTime.date}`;

          await updateDoc(doc(db, "pedidos", editandoId), {
            cliente, estado, cidade: city, obs, modelos: modelsValidos,
            status: novoStatus,
            historicoAlteracao: textoAlteracao,
            updatedAt: serverTimestamp(),
            updatedAtMs: Date.now(),
            updatedDate: localDateTime.date,
            updatedTime: localDateTime.time
          });
          clearEditMode();
        } else {
          await addDoc(pedidosRef, {
            vendedor: session.nome, cliente, estado, cidade: city, obs, modelos: modelsValidos, status: "nao-visualizado",
            historicoAlteracao: "",
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            createdAtMs: Date.now(), updatedAtMs: Date.now(),
            createdDate: localDateTime.date, createdTime: localDateTime.time,
            updatedDate: localDateTime.date, updatedTime: localDateTime.time
          });

          await enviarPushOneSignal("usuario_perfil", "expedicao", "📦 Novo pedido recebido!", `De ${session.nome} para ${cliente}.`);
        }
        
        $("cliente").value = ""; $("estado").value = ""; $("cidade").value = ""; $("obsPedido").value = "";
        composerBlocks = [{ modeloCodigo: "001", descricao: "" }]; renderPedidoComposer();
      } catch (e) { console.error(e); }
    });

    $("btnExemplo").addEventListener("click", () => {
      $("cliente").value = "Loja Exemplo"; $("estado").value = "CE"; $("cidade").value = "Fortaleza";
      composerBlocks = [{ modeloCodigo: "001", descricao: "10 P preto" }]; renderPedidoComposer();
    });

    $("searchExp").addEventListener("input", renderPedidosExp);
    $("filterStatus").addEventListener("change", renderPedidosExp);
    
    $("btnAtivarNotificacoesLogin").addEventListener("click", ativarNotificacoes);
    $("btnAtivarNotificacoesDono").addEventListener("click", ativarNotificacoes);
    $("btnAtivarNotificacoesExp").addEventListener("click", ativarNotificacoes);
  });
}

onSnapshot(pedidosRef, (snapshot) => {
  const next = new Map();
  snapshot.forEach(d => next.set(d.id, { id: d.id, ...d.data() }));
  databasePedidos = next;
  if (session) {
    if (session.perfil === "dono") renderPedidosDono();
    else renderPedidosExp();
  }
});
