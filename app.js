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
const ONESIGNAL_REST_KEY = "grrf5hsueuanuuuscnyrmaisd"; 

let session = null;
let databasePedidos = new Map();
let composerBlocks = [{ modeloCodigo: "", descricao: "" }]; // Inicializa vazio para digitação livre

function $(id) { return document.getElementById(id); }

// ==========================================
// NOTIFICAÇÕES CORRIGIDAS (ONESIGNAL V16)
// ==========================================

async function vincularUsuarioOneSignal() {
  if (!session) return;
  try {
    if (typeof OneSignal !== "undefined") {
      if (session.perfil === "dono") {
        await OneSignal.User.addTag("identificador", `dono_${session.nome}`);
        console.log(`[OneSignal] Tag configurada: dono_${session.nome}`);
      } else {
        await OneSignal.User.addTag("identificador", "expedicao");
        console.log(`[OneSignal] Tag configurada: expedicao`);
      }
    }
  } catch (e) { console.error("[OneSignal Tag Error]", e); }
}

async function ativarNotificacoes() {
  try {
    if (typeof OneSignal === "undefined") {
      alert("Aguarde o carregamento do sistema de notificações e tente novamente.");
      return;
    }
    
    // Força checagem limpa de permissão para evitar o travamento de AppID incorreto do cache
    if (OneSignal.Notifications.permission === "granted") {
      await vincularUsuarioOneSignal();
      alert("✅ Tudo certo! As notificações já estão ativadas para este aparelho.");
      return;
    }

    await OneSignal.Slidedown.promptPush();
    await vincularUsuarioOneSignal();
  } catch (e) {
    console.error("[OneSignal SDK Error]", e);
  }
}

async function enviarPushOneSignal(chaveTag, valorTag, titulo, message) {
  try {
    const urlProxy = "https://cors-anywhere.herokuapp.com/";
    const urlOneSignal = "https://onesignal.com/api/v1/notifications";

    const payload = {
      app_id: ONESIGNAL_APP_ID,
      headings: { "en": titulo, "pt": titulo },
      contents: { "en": message, "pt": message },
      filters: [{ "field": "tag", "key": chaveTag, "relation": "=", "value": valorTag }]
    };

    let response;
    try {
      response = await fetch(urlOneSignal, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Authorization": `Basic ${ONESIGNAL_REST_KEY}`
        },
        body: JSON.stringify(payload)
      });
    } catch (corsError) {
      response = await fetch(urlProxy + urlOneSignal, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Authorization": `Basic ${ONESIGNAL_REST_KEY}`,
          "X-Requested-With": "XMLHttpRequest"
        },
        body: JSON.stringify(payload)
      });
    }
    const resultado = await response.json();
    console.log("[OneSignal API Response]", resultado);
  } catch (error) { console.error("[Push Exception]", error); }
}

// ==========================================
// CORE DO SISTEMA (CONVERSÃO DE DADOS NATAL DO FIREBASE)
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

function showLogin() {
  $("loginScreen").style.display = "flex";
  $("dashboardDono").style.display = "none";
  $("dashboardExpedicao").style.display = "none";
  mudarCamposPerfil();
}

function showDashboard() {
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
  if (typeof OneSignal !== "undefined" && OneSignal.Notifications.permission === "granted") {
    vincularUsuarioOneSignal();
  }
}

function mudarCamposPerfil() {
  const perfil = $("perfilLogin").value;
  $("boxSelecionarNome").style.display = (perfil === "dono") ? "block" : "none";
}

// FORMATO COM CAMPO EM BRANCO PARA DIGITAÇÃO LIVRE DO MODELO
function renderPedidoComposer() {
  const container = $("pedidoComposerBlocks");
  container.innerHTML = "";
  composerBlocks.forEach((block, index) => {
    const row = document.createElement("div");
    row.className = "composer-row";
    row.innerHTML = `
      <div class="field" style="width: 160px;">
        <input type="text" class="input-modelo" placeholder="Modelo (Ex: 001)" value="${block.modeloCodigo}" data-index="${index}">
      </div>
      <div class="field flex-1">
        <input type="text" class="input-desc" placeholder="Ex: 5 P, 10 M, 5 G cor azul" value="${block.descricao}" data-index="${index}">
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

// CORRIGIDO: MONTA AS PEÇAS NO COMPORTAMENTO NATIVO DO HISTÓRICO DO FIREBASE
function extrairDetalhesDoPedido(p) {
  let HTML = "";
  if (Array.isArray(p.itens)) {
    p.itens.forEach(it => {
      if(it.modeloCodigo || it.descricao) {
        HTML += `<div class="item-badge"><strong>${it.modeloCodigo || 'Modelo'}:</strong> ${it.descricao || ''}</div>`;
      }
    });
  } else if (p.modeloCodigo || p.descricao) {
    HTML += `<div class="item-badge"><strong>${p.modeloCodigo || 'Modelo'}:</strong> ${p.descricao || ''}</div>`;
  }
  return HTML || `<div class="item-badge" style="color:red;">Sem detalhes cadastrados</div>`;
}

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
    card.innerHTML = `
      <div class="pedido-header">
        <span class="pedido-id">#${p.id.substring(0,6).toUpperCase()}</span>
        <span class="status-indicator">${p.status.toUpperCase().replace("-", " ")}</span>
      </div>
      <div class="pedido-body">
        <p><strong>Cliente:</strong> ${p.cliente}</p>
        <p><strong>Destino:</strong> ${p.cidade} - ${p.estado}</p>
        <div class="pedido-itens-list">${extrairDetalhesDoPedido(p)}</div>
        ${p.obs ? `<p class="obs-text"><strong>Obs:</strong> ${p.obs}</p>` : ""}
        ${p.motivoFalta ? `<div class="alteracao-aviso-box">⚠️ <strong>Falta:</strong> ${p.motivoFalta}</div>` : ""}
      </div>
      <div class="pedido-footer">
        <span>Enviado em: ${p.createdDate} às ${p.createdTime}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderPedidosExp() {
  if (!session) return;
  const container = $("listaPedidosExp");
  container.innerHTML = "";
  const search = $("searchExp").value.toLowerCase();
  const filter = $("filterStatus").value;

  const lista = Array.from(databasePedidos.values())
    .filter(p => {
      const matchSearch = p.cliente.toLowerCase().includes(search) || 
                          p.vendedor.toLowerCase().includes(search) ||
                          p.cidade.toLowerCase().includes(search) ||
                          p.id.toLowerCase().includes(search);
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
    
    // REGRA SOLICITADA: O botão de excluir só aparece se o status for "separado"
    const botaoExcluirHtml = (p.status === "separado") 
      ? `<button class="btn-delete-pedido" data-id="${p.id}" style="background:none; border:none; color:var(--danger); cursor:pointer; font-weight:700;">Excluir</button>`
      : `<span style="font-size:11px; color:var(--muted);">Exclusão Bloqueada (Não Separado)</span>`;

    card.innerHTML = `
      <div class="pedido-header">
        <span class="pedido-id">#${p.id.substring(0,6).toUpperCase()} (${p.vendedor})</span>
        <div class="field" style="margin:0;">
          <select class="select-status-update" data-id="${p.id}">
            <option value="nao-visualizado" ${p.status === "nao-visualizado" ? "selected" : ""}>Não visualizado</option>
            <option value="visualizado" ${p.status === "visualizado" ? "selected" : ""}>Visualizado</option>
            <option value="em-separacao" ${p.status === "em-separacao" ? "selected" : ""}>Em separação</option>
            <option value="falta-peca" ${p.status === "falta-peca" ? "selected" : ""}>Falta peça</option>
            <option value="separado" ${p.status === "separado" ? "selected" : ""}>Separado (Concluído)</option>
          </select>
        </div>
      </div>
      <div class="pedido-body">
        <p><strong>Cliente:</strong> ${p.cliente}</p>
        <p><strong>Destino:</strong> ${p.cidade} - ${p.estado}</p>
        <div class="pedido-itens-list">${extrairDetalhesDoPedido(p)}</div>
        ${p.obs ? `<p class="obs-text"><strong>Obs:</strong> ${p.obs}</p>` : ""}
        <div class="falta-peca-box" id="boxFalta_${p.id}" style="display: ${p.status === "falta-peca" ? "block" : "none"}; margin-top: 10px;">
          <input type="text" id="inputFalta_${p.id}" placeholder="Itens faltando..." value="${p.motivoFalta || ""}" style="padding: 8px; border-radius: 8px; border: 1px solid var(--line); width: 80%; font-size:13px;">
          <button class="btn-salvar-falta" data-id="${p.id}" style="padding: 8px 12px; background: var(--warning); color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:700;">Salvar</button>
        </div>
      </div>
      <div class="pedido-footer">
        <span>Recebido em: ${p.createdDate} às ${p.createdTime}</span>
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
          $(`boxFalta_${id}`).style.display = "none";
          await updateDoc(doc(db, "pedidos", id), { status: novoStatus, motivoFalta: "", updatedDate: localDateTime.date, updatedTime: localDateTime.time });
          const pedidoInfo = databasePedidos.get(id);
          if (pedidoInfo) {
            let msgStatus = `O status do seu pedido mudou para: ${novoStatus.toUpperCase().replace("-", " ")}`;
            if (novoStatus === "separado") msgStatus = `🎉 Seu pedido de ${pedidoInfo.cliente} está SEPARADO e pronto!`;
            await enviarPushOneSignal("identificador", `dono_${pedidoInfo.vendedor}`, "🔄 Status do Pedido Atualizado", msgStatus);
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
          await enviarPushOneSignal("identificador", `dono_${pedidoInfo.vendedor}`, "⚠️ Falta de Peça no Pedido", `Falta no pedido de ${pedidoInfo.cliente}: ${motivo}`);
        }
        alert("Motivo de falta salvo e notificado!");
      } catch (err) { console.error(err); }
    });
  });

  document.querySelectorAll(".btn-delete-pedido").forEach(el => {
    el.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-id");
      const ped = databasePedidos.get(id);
      if (ped && ped.status !== "separado") {
        alert("Ação negada! Apenas pedidos com status 'Separado' podem ser excluídos.");
        return;
      }
      if (confirm("Deseja apagar este pedido concluído?")) {
        try { await deleteDoc(doc(db, "pedidos", id)); } catch (err) { console.error(err); }
      }
    });
  });
}

// ==========================================
// EVENTOS E INTERAÇÃO
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
      if (confirm("Deseja encerrar a sessão?")) {
        localStorage.removeItem(SESSION_KEY);
        session = null;
        showLogin();
      }
    }

    $("formNovoPedido").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!session) return;
      const cliente = $("cliente").value.trim();
      const estado = $("estado").value;
      const city = $("cidade").value.trim();
      const obs = $("obsPedido").value.trim();

      if (!cliente || !city) { alert("Preencha o Nome do Cliente e a Cidade."); return; }
      if (!composerBlocks.some(b => b.descricao.trim() !== "")) { alert("Preencha as especificações de peças do pedido."); return; }

      const localDateTime = getLocalDateTime();
      try {
        await addDoc(pedidosRef, {
          vendedor: session.nome, cliente, estado, cidade: city, obs,
          status: "nao-visualizado", motivoFalta: "", itens: composerBlocks,
          timestamp: serverTimestamp(), createdDate: localDateTime.date, createdTime: localDateTime.time,
          updatedDate: localDateTime.date, updatedTime: localDateTime.time
        });
        await enviarPushOneSignal("identificador", "expedicao", "📦 Novo pedido recebido!", `De ${session.nome} para ${cliente}.`);
        $("cliente").value = ""; $("cidade").value = ""; $("obsPedido").value = "";
        composerBlocks = [{ modeloCodigo: "", descricao: "" }]; 
        renderPedidoComposer();
        alert("Pedido enviado com sucesso!");
      } catch (err) { console.error(err); }
    });

    // SOLICITADO: Preencher Exemplo agora traz por padrão o "001 - Reforçado Liso"
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

onSnapshot(pedidosRef, (snapshot) => {
  const next = new Map();
  snapshot.forEach(d => next.set(d.id, { id: d.id, ...d.data() }));
  databasePedidos = next;
  if (session) {
    if (session.perfil === "dono") renderPedidosDono();
    else renderPedidosExp();
  }
});
