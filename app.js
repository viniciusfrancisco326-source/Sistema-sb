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

const SESSION_KEY = "sistema_sou_bela_sessao_v15"; 
// ==========================================
// CREDENCIAIS OFICIAIS DO ONESIGNAL
// ==========================================
const ONESIGNAL_APP_ID = "000b8540-c342-4950-8ab0-797bbc3e7313"; 
const ONESIGNAL_REST_API_KEY = "grrf5hsueuanuuuscnyrmaisd"; 

let session = null;
let databasePedidos = new Map();
let composerBlocks = [{ modeloCodigo: "", descricao: "" }];
let oneSignalSubmitedError = false;

function $(id) { return document.getElementById(id); }

// ==========================================
// INICIALIZAÇÃO COM ISOLAMENTO DE ERRO DO ONESIGNAL
// ==========================================
if (typeof window !== "undefined") {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal) {
    try {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecure: true,
        serviceWorkerPath: "OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/Sistema-sb/" },
      });
    } catch(err) {
      oneSignalSubmitedError = true;
      console.log("[OneSignal Bypassed] Erro de cache ou AppID inválido isolado.", err);
    }
  });
}

async function vincularUsuarioOneSignal() {
  if (!session) return;
  try {
    if (typeof OneSignal !== "undefined" && OneSignal.User) {
      if (session.perfil === "dono") {
        await OneSignal.User.addTag("identificador", `dono_${session.nome}`);
      } else {
        await OneSignal.User.addTag("identificador", "expedicao");
      }
    }
  } catch (e) { console.error(e); }
}

async function ativarNotificacoes() {
  if (oneSignalSubmitedError) {
    alert("⚠️ Não foi possível ativar. O OneSignal recusou o AppID configurado no código. Verifique se o ID está correto no painel do OneSignal.");
    return;
  }
  try {
    if (typeof OneSignal === "undefined") {
      alert("O sistema de notificações ainda está carregando. Tente novamente em alguns segundos.");
      return;
    }
    await OneSignal.Slidedown.promptPush();
    await vincularUsuarioOneSignal();
    alert("Pedido de ativação enviado!");
  } catch (e) { 
    console.error(e); 
    alert("Erro ao abrir a solicitação de notificações.");
  }
}


// FUNÇÃO ATUALIZADA: Agora o Make.com cuida do envio monitorando o Firebase
async function enviarPushOneSignal(chaveTag, valorTag, titulo, message) {
  // O Make.com agora detecta as mudanças no banco e envia o push automaticamente.
  // Deixamos esta função vazia para evitar erros de CORS no navegador.
  console.log(`📡 [Automação] O Firebase foi atualizado. O Make.com enviará o push: "${titulo}" -> ${message}`);
}

// ==========================================
// LOGICA DE SESSÃO E AUXILIARES
// ==========================================
function getLocalDateTime() {
  const now = new Date();
  const offset = -3;
  const localTime = new Date(now.getTime() + offset * 60 * 60 * 1000);
  const dateStr = localTime.toISOString().split('T')[0].split('-').reverse().join('/');
  const timeStr = localTime.toISOString().split('T')[1].substring(0, 5);
  return { date: dateStr, time: timeStr };
}

function checkSession() {
  const cached = localStorage.getItem(SESSION_KEY);
  if (cached) {
    session = JSON.parse(cached);
    showDashboard();
  } else {
    showLogin();
  }
}

// Garante o vínculo das tags mesmo que o usuário faça login após o carregamento da página
async function showDashboard() {
  $("loginScreen").style.display = "none";
  if (session.perfil === "dono") {
    $("dashboardDono").style.display = "block";
    $("dashboardExpedicao").style.display = "none";
    $("lblDonoNome").innerText = session.nome;
    renderPedidosDono();
  } else {
    $("dashboardDono").style.display = "none";
    $("dashboardExpedicao").style.display = "block";
    renderPedidosExp();
  }
  // Tenta sincronizar a tag do usuário assim que ele entra no Dashboard
  setTimeout(vincularUsuarioOneSignal, 2000);
}

function showLogin() {
  $("loginScreen").style.display = "flex";
  $("dashboardDono").style.display = "none";
  $("dashboardExpedicao").style.display = "none";
  mudarCamposPerfil();
}

function mudarCamposPerfil() {
  const perfil = $("perfilLogin").value;
  $("boxSelecionarNome").style.display = (perfil === "dono") ? "block" : "none";
}

function renderPedidoComposer() {
  const container = $("pedidoComposerBlocks");
  container.innerHTML = "";
  composerBlocks.forEach((block, index) => {
    const row = document.createElement("div");
    row.className = "composer-row";
    row.innerHTML = `
      <div class="field" style="width: 160px;">
        <input type="text" class="input-modelo" placeholder="Modelo (Ex: 001)" value="${block.modeloCodigo || ''}" data-index="${index}">
      </div>
      <div class="field flex-1">
        <input type="text" class="input-desc" placeholder="Ex: 5 P, 10 M, 5 G cor azul" value="${block.descricao || ''}" data-index="${index}">
      </div>
      ${composerBlocks.length > 1 ? `<button type="button" class="btn-remove-row" data-index="${index}">✕</button>` : ""}
    `;
    container.appendChild(row);
  });

  document.querySelectorAll(".input-modelo").forEach(el => {
    el.addEventListener("input", (e) => {
      const idx = parseInt(e.target.getAttribute("data-index"));
      composerBlocks[idx].modeloCodigo = e.target.value;
    });
  });

  document.querySelectorAll(".input-desc").forEach(el => {
    el.addEventListener("input", (e) => {
      const idx = parseInt(e.target.getAttribute("data-index"));
      composerBlocks[idx].descricao = e.target.value;
    });
  });

  document.querySelectorAll(".btn-remove-row").forEach(el => {
    el.addEventListener("click", (e) => {
      const idx = parseInt(e.target.getAttribute("data-index"));
      composerBlocks.splice(idx, 1);
      renderPedidoComposer();
    });
  });
}

function extrairDetalhesDoPedido(p) {
  let HTML = "";
  if (Array.isArray(p.itens) && p.itens.length > 0) {
    p.itens.forEach(it => {
      if(it.modeloCodigo || it.descricao) {
        HTML += `<div class="item-badge" style="background:#fff; border:1px solid #e5e7eb; padding:6px; border-radius:8px; margin-bottom:4px; font-size:13px; color:#1f2430 !important;"><strong>Mod. ${it.modeloCodigo || 'Não informado'}:</strong> ${it.descricao || ''}</div>`;
      }
    });
  } else if (p.modeloCodigo || p.descricao) {
    HTML += `<div class="item-badge" style="background:#fff; border:1px solid #e5e7eb; padding:6px; border-radius:8px; margin-bottom:4px; font-size:13px; color:#1f2430 !important;"><strong>Mod. ${p.modeloCodigo || 'Não informado'}:</strong> ${p.descricao || ''}</div>`;
  }
  return HTML || `<div class="item-badge" style="color:#ef4444; font-weight:bold;">⚠️ Nenhum detalhe de peça registrado.</div>`;
}

// ==========================================
// RENDERIZAÇÃO: PAINEL DO DONO / VENDEDOR
// ==========================================
function renderPedidosDono() {
  if (!session) return;
  const container = $("listaPedidosDono");
  container.innerHTML = "";
  const lista = Array.from(databasePedidos.values())
    .filter(p => p.vendedor === session.nome)
    .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

  if (lista.length === 0) {
    container.innerHTML = `<div class="empty">Nenhum pedido enviado ainda.</div>`;
    return;
  }

  lista.forEach(p => {
    const card = document.createElement("div");
    card.className = `pedido-card status-${p.status}`;
    const statusLimpo = p.status ? p.status.replace("-", " ") : "nao visualizado";

    let editadoTagHtml = p.editadoPor 
      ? `<div class="editado-aviso-box">✏️ Editado por ${p.editadoPor} em ${p.editadoDate} às ${p.editadoTime}</div>` 
      : "";

    // Corrigido para 'pedido-card-conteudo' (ignora a quebra do CSS antigo)
    card.innerHTML = `
      <div class="pedido-header" style="display:flex; justify-content:space-between; align-items:center;">
        <span class="pedido-id">#${p.id.substring(0,6).toUpperCase()}</span>
        <span class="status-indicator-badge badge-${p.status}">${statusLimpo}</span>
      </div>
      <div class="pedido-card-conteudo" style="margin-top:10px;">
        <p><strong>Cliente:</strong> ${p.cliente}</p>
        <p><strong>Destino:</strong> ${p.cidade} - ${p.estado}</p>
        <div class="pedido-itens-list" style="background: rgba(255,255,255,0.5); padding:8px; border-radius:8px; margin-top:8px;">
          ${extrairDetalhesDoPedido(p)}
        </div>
        ${p.obs ? `<p class="obs-text" style="margin-top:8px;"><strong>Obs Geral:</strong> ${p.obs}</p>` : ""}
        ${p.motivoFalta ? `<div class="alteracao-aviso-box" style="background:#fff7ed; border-left:4px solid #f97316; padding:8px; margin-top:8px; border-radius:4px;">⚠️ <strong>Falta comunicada:</strong> ${p.motivoFalta}</div>` : ""}
        ${editadoTagHtml}
      </div>
      <div class="pedido-footer" style="margin-top:10px; display:flex; justify-content:space-between; align-items:center; font-size:11px;">
        <span style="color:#667085;">Enviado: ${p.createdDate || ''} às ${p.createdTime || ''}</span>
        <div style="display:flex; gap:8px;">
          <button class="btn-edit-dono" data-id="${p.id}" style="background:none; border:none; color:var(--info); cursor:pointer; font-weight:700;">Editar</button>
          <button class="btn-delete-dono" data-id="${p.id}" style="background:none; border:none; color:var(--danger); cursor:pointer; font-weight:700;">Excluir</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  document.querySelectorAll(".btn-edit-dono").forEach(el => {
    el.addEventListener("click", (e) => {
      const id = e.target.getAttribute("data-id");
      const p = databasePedidos.get(id);
      if (!p) return;

      $("editPedidoId").value = p.id;
      $("cliente").value = p.cliente || "";
      $("estado").value = p.estado || "CE";
      $("cidade").value = p.cidade || "";
      $("obsPedido").value = p.obs || "";

      if (Array.isArray(p.itens) && p.itens.length > 0) {
        composerBlocks = JSON.parse(JSON.stringify(p.itens));
      } else {
        composerBlocks = [{ modeloCodigo: p.modeloCodigo || "", descricao: p.descricao || "" }];
      }

      renderPedidoComposer();
      $("tituloFormPedido").innerText = `✏️ Editando Pedido #${p.id.substring(0,6).toUpperCase()}`;
      $("btnSubmitPedido").innerText = "Salvar Alterações";
      $("btnCancelarEdicao").style.display = "inline-block";
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  document.querySelectorAll(".btn-delete-dono").forEach(el => {
    el.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-id");
      if (confirm("Você tem certeza de que deseja excluir este pedido permanente do histórico?")) {
        try { await deleteDoc(doc(db, "pedidos", id)); } catch(err) { console.error(err); }
      }
    });
  });
}

// ==========================================
// RENDERIZAÇÃO: SETOR DE EXPEDIÇÃO
// ==========================================
function renderPedidosExp() {
  if (!session) return;
  const container = $("listaPedidosExp");
  container.innerHTML = "";
  const search = $("searchExp").value.toLowerCase();
  const filter = $("filterStatus").value;

  const lista = Array.from(databasePedidos.values())
    .filter(p => {
      const matchSearch = (p.cliente || "").toLowerCase().includes(search) || 
                          (p.vendedor || "").toLowerCase().includes(search) ||
                          (p.cidade || "").toLowerCase().includes(search) ||
                          (p.id || "").toLowerCase().includes(search);
      const matchFilter = filter === "all" || p.status === filter;
      return matchSearch && matchFilter;
    })
    .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

  let total = 0, pendentes = 0, concluidos = 0;
  databasePedidos.forEach(p => {
    total++;
    if (p.status === "separado") concluidos++;
    else if (p.status === "nao-visualizado") pendentes++;
  });
  $("statTotalExp").innerText = total;
  $("statPendExp").innerText = pendentes;
  $("statSepExp").innerText = concluidos;

  if (lista.length === 0) {
    container.innerHTML = `<div class="empty">Nenhum pedido corresponde aos filtros.</div>`;
    return;
  }

  lista.forEach(p => {
    const card = document.createElement("div");
    card.className = `pedido-card status-${p.status}`;
    
    const botaoExcluirHtml = (p.status === "separado") 
      ? `<button class="btn-delete-pedido" data-id="${p.id}" style="background:none; border:none; color:var(--danger); cursor:pointer; font-weight:700;">Excluir</button>`
      : `<span style="font-size:11px; color:#9ca3af;">Exclusão Bloqueada</span>`;

    let editadoTagHtml = p.editadoPor 
      ? `<div class="editado-aviso-box">✏️ Editado por ${p.editadoPor} em ${p.editadoDate} às ${p.editadoTime}</div>` 
      : "";

    // Corrigido para 'pedido-card-conteudo' (ignora a quebra do CSS antigo)
    card.innerHTML = `
      <div class="pedido-header" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <span class="pedido-id" style="font-weight:bold;">#${p.id.substring(0,6).toUpperCase()} (${p.vendedor || 'Sem Nome'})</span>
        <div class="field" style="margin:0;">
          <select class="select-status-update" data-id="${p.id}" style="padding:4px; font-size:12px; border-radius:6px;">
            <option value="nao-visualizado" ${p.status === "nao-visualizado" ? "selected" : ""}>Não visualizado</option>
            <option value="visualizado" ${p.status === "visualizado" ? "selected" : ""}>Visualizado</option>
            <option value="em-separacao" ${p.status === "em-separacao" ? "selected" : ""}>Em separação</option>
            <option value="falta-peca" ${p.status === "falta-peca" ? "selected" : ""}>Falta peça</option>
            <option value="separado" ${p.status === "separado" ? "selected" : ""}>Separado (Concluído)</option>
          </select>
        </div>
      </div>
      <div class="pedido-card-conteudo" style="margin-top:10px;">
        <p><strong>Cliente:</strong> ${p.cliente || ''}</p>
        <p><strong>Destino:</strong> ${p.cidade || ''} - ${p.estado || ''}</p>
        <div class="pedido-itens-list" style="background: rgba(255,255,255,0.5); padding:8px; border-radius:8px; margin-top:8px;">
          ${extrairDetalhesDoPedido(p)}
        </div>
        ${p.obs ? `<p class="obs-text" style="margin-top:8px;"><strong>Obs:</strong> ${p.obs}</p>` : ""}
        ${editadoTagHtml}
        <div class="falta-peca-box" id="boxFalta_${p.id}" style="display: ${p.status === "falta-peca" ? "block" : "none"}; margin-top: 10px;">
          <input type="text" id="inputFalta_${p.id}" placeholder="Descreva o que falta..." value="${p.motivoFalta || ""}" style="padding: 6px; border-radius: 6px; border: 1px solid var(--line); width: 70%; font-size:12px;">
          <button class="btn-salvar-falta" data-id="${p.id}" style="padding: 6px 10px; background: var(--warning); color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:700; font-size:12px;">Salvar</button>
        </div>
      </div>
      <div class="pedido-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:11px; color:#667085;">
        <span>Recebido: ${p.createdDate || ''} às ${p.createdTime || ''}</span>
        ${botaoExcluirHtml}
      </div>
    `;
    container.appendChild(card);
  });

  document.querySelectorAll(".select-status-update").forEach(el => {
    el.addEventListener("change", async (e) => {
      const id = e.target.getAttribute("data-id");
      const novoStatus = e.target.value;
      const localDateTime = getLocalDateTime();
      try {
        if (novoStatus === "falta-peca") {
          $(`boxFalta_${id}`).style.display = "block";
          await updateDoc(doc(db, "pedidos", id), { status: novoStatus, updatedDate: localDateTime.date, updatedTime: localDateTime.time });
        } else {
          if ($(`boxFalta_${id}`)) $(`boxFalta_${id}`).style.display = "none";
          await updateDoc(doc(db, "pedidos", id), { status: novoStatus, motivoFalta: "", updatedDate: localDateTime.date, updatedTime: localDateTime.time });
          const pedidoInfo = databasePedidos.get(id);
          if (pedidoInfo) {
            let msgStatus = `O status do seu pedido mudou para: ${novoStatus.toUpperCase().replace("-", " ")}`;
            if (novoStatus === "separado") msgStatus = `🎉 Seu pedido de ${pedidoInfo.cliente} está SEPARADO e pronto!`;
            await enviarPushOneSignal("identificador", `dono_${pedidoInfo.vendedor}`, "🔄 Status Atualizado", msgStatus);
          }
        }
      } catch (err) { console.error(err); }
    });
  });

  document.querySelectorAll(".btn-salvar-falta").forEach(el => {
    el.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-id");
      const motivo = $(`inputFalta_${id}`).value;
      const localDateTime = getLocalDateTime();
      try {
        await updateDoc(doc(db, "pedidos", id), { motivoFalta: motivo, updatedDate: localDateTime.date, updatedTime: localDateTime.time });
        const pedidoInfo = databasePedidos.get(id);
        if (pedidoInfo) {
          await enviarPushOneSignal("identificador", `dono_${pedidoInfo.vendedor}`, "⚠️ Falta de Peça", `Falta no pedido de ${pedidoInfo.cliente}: ${motivo}`);
        }
        alert("Motivo salvo!");
      } catch (err) { console.error(err); }
    });
  });

  document.querySelectorAll(".btn-delete-pedido").forEach(el => {
    el.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-id");
      const ped = databasePedidos.get(id);
      if (ped && ped.status !== "separado") {
        alert("Ação recusada! Apenas pedidos já Separados podem ser excluídos.");
        return;
      }
      if (confirm("Deseja apagar permanentemente este pedido?")) {
        try { await deleteDoc(doc(db, "pedidos", id)); } catch (err) { console.error(err); }
      }
    });
  });
}

function resetForm() {
  $("editPedidoId").value = "";
  $("cliente").value = "";
  $("cidade").value = "";
  $("obsPedido").value = "";
  $("tituloFormPedido").innerText = "📦 Enviar Novo Pedido";
  $("btnSubmitPedido").innerText = "Enviar para Expedição";
  $("btnCancelarEdicao").style.display = "none";
  composerBlocks = [{ modeloCodigo: "", descricao: "" }];
  renderPedidoComposer();
}

// ==========================================
// CAPTURA DOS EVENTOS DO DOM
// ==========================================
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    checkSession();
    renderPedidoComposer();

    $("perfilLogin").addEventListener("change", mudarCamposPerfil);

    $("btnAddModelRow").addEventListener("click", () => {
      composerBlocks.push({ modeloCodigo: "", descricao: "" });
      renderPedidoComposer();
    });

    $("btnCancelarEdicao").addEventListener("click", resetForm);

    $("btnEntrar").addEventListener("click", () => {
      const perfil = $("perfilLogin").value;
      const nome = (perfil === "dono") ? $("nomeVendedorSelect").value : "Expedição";
      session = { nome, perfil };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      showDashboard();
    });

    $("btnSairDono").addEventListener("click", logout);
    $("btnSairExp").addEventListener("click", logout);

    function logout() {
      if (confirm("Deseja fechar o sistema?")) {
        localStorage.removeItem(SESSION_KEY);
        session = null;
        showLogin();
      }
    }

    $("formNovoPedido").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!session) return;

      const idExistente = $("editPedidoId").value;
      const cliente = $("cliente").value.trim();
      const estado = $("estado").value;
      const city = $("cidade").value.trim();
      const obs = $("obsPedido").value.trim();

      if (!cliente || !city) { alert("Preencha o Nome do Cliente e a Cidade."); return; }
      
      const temPreenchido = composerBlocks.some(b => (b.modeloCodigo || "").trim() !== "" || (b.descricao || "").trim() !== "");
      if (!temPreenchido) { alert("Informe pelo menos um modelo ou descrição de peça."); return; }

      const localDateTime = getLocalDateTime();
      const primeiroBloco = composerBlocks[0] || { modeloCodigo: "", descricao: "" };

      if (idExistente) {
        try {
          await updateDoc(doc(db, "pedidos", idExistente), {
            cliente, estado, cidade: city, obs,
            status: "nao-visualizado",
            modeloCodigo: primeiroBloco.modeloCodigo,
            descricao: primeiroBloco.descricao,
            itens: composerBlocks,
            editadoPor: session.nome,
            editadoDate: localDateTime.date,
            editadoTime: localDateTime.time,
            updatedDate: localDateTime.date,
            updatedTime: localDateTime.time
          });

          await enviarPushOneSignal("identificador", "expedicao", "✏️ Pedido Alterado!", `O pedido de ${cliente} foi modificado por ${session.nome}.`);
          resetForm();
          alert("Pedido atualizado com sucesso e retornado para Fila!");
        } catch(err) { console.error(err); }

      } else {
        try {
          await addDoc(pedidosRef, {
            vendedor: session.nome, cliente, estado, cidade: city, obs,
            status: "nao-visualizado", motivoFalta: "", 
            modeloCodigo: primeiroBloco.modeloCodigo,
            descricao: primeiroBloco.descricao,
            itens: composerBlocks,                   
            timestamp: serverTimestamp(), 
            createdDate: localDateTime.date, createdTime: localDateTime.time,
            updatedDate: localDateTime.date, updatedTime: localDateTime.time
          });
          
          await enviarPushOneSignal("identificador", "expedicao", "📦 Novo pedido!", `De ${session.nome} para ${cliente}.`);
          resetForm();
          alert("Pedido enviado com sucesso para a Expedição!");
        } catch (err) { console.error(err); }
      }
    });

    $("btnExemplo").addEventListener("click", () => {
      $("cliente").value = "Loja Exemplo"; $("cidade").value = "Fortaleza";
      composerBlocks = [{ modeloCodigo: "001 - Reforçado Liso", descricao: "10 P preto, 10 M rosa" }]; 
      renderPedidoComposer();
    });

    $("searchExp").addEventListener("input", renderPedidosExp);
    $("filterStatus").addEventListener("change", renderPedidosExp);
    
    $("btnAtivarNotificacoesLogin").addEventListener("click", ativarNotificacoes);
    $("btnAtivarNotificacoesDono").addEventListener("click", ativarNotificacoes);
    $("btnAtivarNotificacoesExp").addEventListener("click", ativarNotificacoes);
  });
}

// OUVINTE EM TEMPO REAL DO BANCO
onSnapshot(pedidosRef, (snapshot) => {
  const next = new Map();
  snapshot.forEach(d => next.set(d.id, { id: d.id, ...d.data() }));
  databasePedidos = next;
  if (session) {
    if (session.perfil === "dono") renderPedidosDono();
    else renderPedidosExp();
  }
});
