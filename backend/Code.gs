/**
 * Happiness Hub v2 — Google Apps Script Backend
 * Everything via GET — no CORS issues, no auth blocks
 */

const CONFIG = {
  SPREADSHEET_ID: "1NhJ6GobyokHQRsgWA-_BOuIKJyUJ81a-vH8QMr-P1w4",
  DRIVE_FOLDER_ID: "1I-Kdz4gglxD-7A__SLNE4YH2grDMohep",
  SESSION_SECRET: "hh_secret_2025",
};

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = p.action;
    if (!action) return jsonResponse({ success: false, error: "No action specified" });
    const result = route(action, p, e);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ success: false, error: err.message || "Server error" });
  }
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function route(action, p, e) {
  switch (action) {
    case "getProducts":       return getProducts(p);
    case "getProduct":        return getProduct(p.id);
    case "trackOrder":        return trackOrder(p);
    case "getSettings":       return getSettings();
    case "agentLogin":        return agentLogin(p);
    case "getAgentOrders":    return getAgentOrders(p);
    case "submitOrder":       return submitOrder(p);
    case "sellerLogin":       return sellerLogin(p);
    case "getSellerOrders":   return getSellerOrders(p);
    case "updateOrderStatus": return updateOrderStatus(p);
    case "getAdminDashboard": return getAdminDashboard();
    case "addProduct":        return addProduct(p);
    case "updateProduct":     return updateProduct(p);
    case "deleteProduct":     return deleteProduct(p);
    case "addAgent":          return addAgent(p);
    case "updateAgent":       return updateAgent(p);
    case "addSeller":         return addSeller(p);
    case "getAgents":         return getAgents();
    case "getSellers":        return getSellers();
    case "getAllOrders":      return getAllOrders();
    case "uploadFile":        return uploadFile(p);
    default: return { success: false, error: "Unknown action: " + action };
  }
}

// ── SHEET HELPERS ───────────────────────────────────────────

function getSheet(name) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); initSheetHeaders(sheet, name); }
  return sheet;
}

function initSheetHeaders(sheet, name) {
  const headers = {
    Products: ["product_id","title","link","cashback_amount","image_url","sold_by","policy","category","description","deadline","tags","featured","stock_status","instructions","badge_text","status","created_at","seller_id"],
    Orders: ["order_id","buyer_name","buyer_whatsapp","product_id","product_title","amazon_order_id","screenshot_url","notes","agent_id","seller_id","status","cashback_amount","cashback_proof_url","seller_notes","submitted_at","updated_at"],
    Agents: ["agent_id","name","password","email","whatsapp","commission_rate","total_orders","total_commission","status","created_at"],
    Sellers: ["seller_id","name","password","email","whatsapp","store_name","status","created_at"],
    Settings: ["key","value"],
    Activity_Logs: ["log_id","timestamp","actor_id","actor_type","action","details"],
  };
  if (headers[name]) sheet.appendRow(headers[name]);
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function findRowIndex(sheet, colIndex, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]) === String(value)) return i + 1;
  }
  return -1;
}

function generateId(prefix) {
  return prefix + "_" + Utilities.getUuid().replace(/-/g, "").substring(0, 12);
}

function now() { return new Date().toISOString(); }

function hashPassword(password) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password));
}

function createToken(actor_id, actor_type) {
  return Utilities.base64Encode(actor_id + ":" + actor_type + ":" + CONFIG.SESSION_SECRET);
}

// ── PRODUCTS ────────────────────────────────────────────────

function getProducts(params) {
  const sheet = getSheet("Products");
  let products = sheetToObjects(sheet);
  products = products.filter(p => p.status === "Active" || p.status === "");
  if (params.category && params.category !== "all") {
    products = products.filter(p => p.category === params.category);
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    products = products.filter(p =>
      (p.title || "").toLowerCase().includes(q) ||
      (p.tags || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q)
    );
  }
  products.sort((a, b) => {
    const af = a.featured === true || a.featured === "TRUE";
    const bf = b.featured === true || b.featured === "TRUE";
    if (af && !bf) return -1;
    if (!af && bf) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  const allP = sheetToObjects(sheet).filter(p => p.status === "Active" || p.status === "");
  const categories = [...new Set(allP.map(p => p.category).filter(Boolean))];
  return { success: true, products, categories, total: products.length };
}

function getProduct(id) {
  if (!id) return { success: false, error: "Product ID required" };
  const products = sheetToObjects(getSheet("Products"));
  const product = products.find(p => p.product_id === id);
  if (!product) return { success: false, error: "Product not found" };
  return { success: true, product };
}

// ── TRACKING ────────────────────────────────────────────────

function trackOrder(params) {
  const whatsapp = params.whatsapp;
  const order_id = params.order_id;
  if (!whatsapp && !order_id) return { success: false, error: "Provide WhatsApp number or Order ID" };
  const orders = sheetToObjects(getSheet("Orders"));
  let results = [];
  if (order_id) {
    results = orders.filter(o =>
      String(o.order_id).toLowerCase() === String(order_id).toLowerCase() ||
      String(o.amazon_order_id).toLowerCase() === String(order_id).toLowerCase()
    );
  } else if (whatsapp) {
    const clean = whatsapp.replace(/\D/g, "");
    results = orders.filter(o => String(o.buyer_whatsapp).replace(/\D/g, "") === clean);
  }
  if (results.length === 0) return { success: false, error: "No orders found" };
  results = results.map(o => ({
    order_id: o.order_id,
    product_title: o.product_title,
    amazon_order_id: o.amazon_order_id,
    status: o.status,
    cashback_amount: o.cashback_amount,
    cashback_proof_url: o.cashback_proof_url,
    seller_notes: o.seller_notes,
    submitted_at: o.submitted_at,
    updated_at: o.updated_at,
  }));
  return { success: true, orders: results };
}

function getSettings() {
  const rows = sheetToObjects(getSheet("Settings"));
  const settings = {};
  rows.forEach(r => { if (r.key) settings[r.key] = r.value; });
  return { success: true, settings };
}

// ── AGENT ───────────────────────────────────────────────────

function agentLogin(p) {
  const agent_id = p.agent_id, password = p.password;
  if (!agent_id || !password) return { success: false, error: "ID and password required" };
  const agents = sheetToObjects(getSheet("Agents"));
  const agent = agents.find(a => a.agent_id === agent_id);
  if (!agent) return { success: false, error: "Invalid credentials" };
  if (agent.status === "Disabled") return { success: false, error: "Account disabled" };
  const hashed = hashPassword(password);
  if (agent.password !== hashed && agent.password !== password) return { success: false, error: "Invalid credentials" };
  const token = createToken(agent_id, "agent");
  logActivity(agent_id, "agent", "login", { agent_id });
  return { success: true, token, agent: { agent_id: agent.agent_id, name: agent.name, email: agent.email, commission_rate: agent.commission_rate } };
}

function getAgentOrders(p) {
  const actor_id = p.actor_id;
  if (!actor_id) return { success: false, error: "Missing agent ID" };
  let orders = sheetToObjects(getSheet("Orders"));
  orders = orders.filter(o => o.agent_id === actor_id);
  orders.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === "Pending").length,
    completed: orders.filter(o => o.status === "Cashback Sent").length,
    total_cashback: orders.filter(o => o.status === "Cashback Sent").reduce((sum, o) => sum + (parseFloat(o.cashback_amount) || 0), 0),
  };
  return { success: true, orders, stats };
}

function submitOrder(p) {
  const agentId = p.actor_id || p.agent_id || "direct";
  const buyer_name = p.buyer_name, buyer_whatsapp = p.buyer_whatsapp, product_id = p.product_id, amazon_order_id = p.amazon_order_id, notes = p.notes;
  if (!buyer_name) return { success: false, error: "Buyer name required" };
  if (!buyer_whatsapp) return { success: false, error: "WhatsApp number required" };
  if (!product_id) return { success: false, error: "Product required" };
  if (!amazon_order_id) return { success: false, error: "Order ID required" };
  const products = sheetToObjects(getSheet("Products"));
  const product = products.find(pr => pr.product_id === product_id);
  if (!product) return { success: false, error: "Product not found" };
  const order_id = generateId("ORD");
  getSheet("Orders").appendRow([
    order_id, buyer_name, buyer_whatsapp, product_id, product.title,
    amazon_order_id, p.screenshot_url || "", notes || "",
    agentId, product.seller_id || "", "Pending", product.cashback_amount,
    "", "", now(), now()
  ]);
  logActivity(agentId, "agent", "submit_order", { order_id, product_id, buyer_whatsapp });
  return { success: true, order_id, message: "Order submitted successfully" };
}

// ── SELLER ──────────────────────────────────────────────────

function sellerLogin(p) {
  const seller_id = p.seller_id, password = p.password;
  if (!seller_id || !password) return { success: false, error: "ID and password required" };
  const sellers = sheetToObjects(getSheet("Sellers"));
  const seller = sellers.find(s => s.seller_id === seller_id);
  if (!seller) return { success: false, error: "Invalid credentials" };
  if (seller.status === "Disabled") return { success: false, error: "Account disabled" };
  const hashed = hashPassword(password);
  if (seller.password !== hashed && seller.password !== password) return { success: false, error: "Invalid credentials" };
  const token = createToken(seller_id, "seller");
  logActivity(seller_id, "seller", "login", { seller_id });
  return { success: true, token, seller: { seller_id: seller.seller_id, name: seller.name, store_name: seller.store_name } };
}

function getSellerOrders(p) {
  const actor_id = p.actor_id;
  if (!actor_id) return { success: false, error: "Missing seller ID" };
  let orders = sheetToObjects(getSheet("Orders"));
  orders = orders.filter(o => o.seller_id === actor_id);
  orders.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  if (p.status) orders = orders.filter(o => o.status === p.status);
  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === "Pending").length,
    delivered: orders.filter(o => o.status === "Delivered").length,
    cashback_sent: orders.filter(o => o.status === "Cashback Sent").length,
    rejected: orders.filter(o => o.status === "Rejected").length,
  };
  return { success: true, orders, stats };
}

function updateOrderStatus(p) {
  const order_id = p.order_id, status = p.status, seller_notes = p.seller_notes, cashback_proof_url = p.cashback_proof_url;
  if (!order_id) return { success: false, error: "Order ID required" };
  const validStatuses = ["Pending","Ordered","Delivered","Cashback Sent","Rejected","Need More Info","PayPal Issue"];
  if (status && !validStatuses.includes(status)) return { success: false, error: "Invalid status" };
  const sheet = getSheet("Orders");
  const rowIndex = findRowIndex(sheet, 0, order_id);
  if (rowIndex === -1) return { success: false, error: "Order not found" };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (status) sheet.getRange(rowIndex, headers.indexOf("status") + 1).setValue(status);
  if (seller_notes) sheet.getRange(rowIndex, headers.indexOf("seller_notes") + 1).setValue(seller_notes);
  if (cashback_proof_url) sheet.getRange(rowIndex, headers.indexOf("cashback_proof_url") + 1).setValue(cashback_proof_url);
  sheet.getRange(rowIndex, headers.indexOf("updated_at") + 1).setValue(now());
  logActivity(p.actor_id, p.actor_type, "update_order_status", { order_id: order_id, status: status });
  return { success: true, message: "Order updated" };
}

// ── ADMIN (open — UI gated client-side) ───────────────────────

function getAdminDashboard() {
  const orders = sheetToObjects(getSheet("Orders"));
  const products = sheetToObjects(getSheet("Products"));
  const agents = sheetToObjects(getSheet("Agents"));
  const sellers = sheetToObjects(getSheet("Sellers"));
  const today = new Date().toDateString();
  return {
    success: true,
    stats: {
      total_products: products.filter(p => p.status === "Active" || p.status === "").length,
      total_orders: orders.length,
      today_orders: orders.filter(o => new Date(o.submitted_at).toDateString() === today).length,
      total_agents: agents.filter(a => a.status === "Active" || a.status === "").length,
      total_sellers: sellers.filter(s => s.status === "Active" || s.status === "").length,
      pending_orders: orders.filter(o => o.status === "Pending").length,
      cashback_sent: orders.filter(o => o.status === "Cashback Sent").length,
      total_cashback_sent: orders.filter(o => o.status === "Cashback Sent").reduce((sum, o) => sum + (parseFloat(o.cashback_amount) || 0), 0),
    },
    recent_orders: orders.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at)).slice(0, 10),
  };
}

function addProduct(p) {
  const title = p.title, link = p.link, cashback_amount = p.cashback_amount, category = p.category;
  if (!title) return { success: false, error: "Title required" };
  if (!link) return { success: false, error: "Product link required" };
  if (!cashback_amount) return { success: false, error: "Cashback amount required" };
  if (!category) return { success: false, error: "Category required" };
  const product_id = generateId("PRD");
  getSheet("Products").appendRow([
    product_id, title, link, parseFloat(cashback_amount) || 0,
    p.image_url || "", p.sold_by || "", p.policy || "", category,
    p.description || "", p.deadline || "", p.tags || "",
    p.featured === "TRUE" ? "TRUE" : "FALSE", p.stock_status || "Available",
    p.instructions || "", p.badge_text || "", "Active", now(), p.seller_id || ""
  ]);
  logActivity("admin", "admin", "add_product", { product_id: product_id, title: title });
  return { success: true, product_id: product_id, message: "Product added" };
}

function updateProduct(p) {
  const product_id = p.product_id;
  if (!product_id) return { success: false, error: "Product ID required" };
  const sheet = getSheet("Products");
  const rowIndex = findRowIndex(sheet, 0, product_id);
  if (rowIndex === -1) return { success: false, error: "Product not found" };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const updatable = ["title","link","cashback_amount","image_url","sold_by","policy","category","description","deadline","tags","featured","stock_status","instructions","badge_text","status","seller_id"];
  updatable.forEach(function(field) {
    if (p[field] !== undefined && p[field] !== "") {
      const col = headers.indexOf(field) + 1;
      if (col > 0) sheet.getRange(rowIndex, col).setValue(p[field]);
    }
  });
  logActivity("admin", "admin", "update_product", { product_id: product_id });
  return { success: true, message: "Product updated" };
}

function deleteProduct(p) {
  const product_id = p.product_id;
  if (!product_id) return { success: false, error: "Product ID required" };
  const sheet = getSheet("Products");
  const rowIndex = findRowIndex(sheet, 0, product_id);
  if (rowIndex === -1) return { success: false, error: "Product not found" };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.getRange(rowIndex, headers.indexOf("status") + 1).setValue("Deleted");
  logActivity("admin", "admin", "delete_product", { product_id: product_id });
  return { success: true, message: "Product deleted" };
}

function addAgent(p) {
  const agent_id = p.agent_id, name = p.name, password = p.password;
  if (!agent_id || !name || !password) return { success: false, error: "ID, name, and password required" };
  const sheet = getSheet("Agents");
  if (sheetToObjects(sheet).find(a => a.agent_id === agent_id)) return { success: false, error: "Agent ID already exists" };
  sheet.appendRow([agent_id, name, hashPassword(password), p.email || "", p.whatsapp || "", parseFloat(p.commission_rate) || 0, 0, 0, "Active", now()]);
  logActivity("admin", "admin", "add_agent", { agent_id: agent_id, name: name });
  return { success: true, message: "Agent added" };
}

function updateAgent(p) {
  const agent_id = p.agent_id, status = p.status;
  if (!agent_id) return { success: false, error: "Agent ID required" };
  const sheet = getSheet("Agents");
  const rowIndex = findRowIndex(sheet, 0, agent_id);
  if (rowIndex === -1) return { success: false, error: "Agent not found" };
  if (status) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    sheet.getRange(rowIndex, headers.indexOf("status") + 1).setValue(status);
  }
  return { success: true, message: "Agent updated" };
}

function addSeller(p) {
  const name = p.name, password = p.password, store_name = p.store_name;
  if (!name || !password) return { success: false, error: "Name and password required" };
  const seller_id = generateId("SEL");
  getSheet("Sellers").appendRow([seller_id, name, hashPassword(password), p.email || "", p.whatsapp || "", store_name || name, "Active", now()]);
  logActivity("admin", "admin", "add_seller", { seller_id: seller_id, name: name });
  return { success: true, seller_id: seller_id, message: "Seller added" };
}

function getAgents() {
  const agents = sheetToObjects(getSheet("Agents")).map(function(a) {
    return { agent_id: a.agent_id, name: a.name, email: a.email, whatsapp: a.whatsapp, commission_rate: a.commission_rate, total_orders: a.total_orders, total_commission: a.total_commission, status: a.status, created_at: a.created_at };
  });
  return { success: true, agents: agents };
}

function getSellers() {
  const sellers = sheetToObjects(getSheet("Sellers")).map(function(s) {
    return { seller_id: s.seller_id, name: s.name, email: s.email, whatsapp: s.whatsapp, store_name: s.store_name, status: s.status, created_at: s.created_at };
  });
  return { success: true, sellers: sellers };
}

function getAllOrders() {
  const orders = sheetToObjects(getSheet("Orders"));
  orders.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  return { success: true, orders: orders };
}

// ── FILE UPLOAD ─────────────────────────────────────────────

function uploadFile(p) {
  const filename = p.filename, base64data = p.base64data, mimetype = p.mimetype;
  if (!base64data || !filename) return { success: false, error: "File data required" };
  try {
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    const decoded = Utilities.newBlob(Utilities.base64Decode(base64data), mimetype || "image/jpeg", filename);
    const file = folder.createFile(decoded);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { success: true, url: "https://drive.google.com/uc?id=" + file.getId(), file_id: file.getId() };
  } catch (err) {
    return { success: false, error: "Upload failed: " + err.message };
  }
}

// ── LOGGING ─────────────────────────────────────────────────

function logActivity(actor_id, actor_type, action, details) {
  try {
    getSheet("Activity_Logs").appendRow([generateId("LOG"), now(), actor_id || "system", actor_type || "system", action, JSON.stringify(details || {})]);
  } catch (err) { console.error("Log failed:", err.message); }
}

// ── SETUP ───────────────────────────────────────────────────

function setupSheets() {
  const names = ["Products","Orders","Agents","Sellers","Settings","Activity_Logs"];
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  names.forEach(function(name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) { sheet = ss.insertSheet(name); initSheetHeaders(sheet, name); Logger.log("Created: " + name); }
    else { Logger.log("Exists: " + name); }
  });
  const settingsSheet = ss.getSheetByName("Settings");
  const existing = sheetToObjects(settingsSheet).map(r => r.key);
  const defaults = [["site_name","Happiness Hub"],["hero_title","Earn Real Cashback On Every Purchase"],["hero_subtitle","Browse deals, buy through our links, get your money back"],["primary_color","#7c6aff"],["whatsapp_support","+923001234567"],["currency","$"],["currency_symbol","$"]];
  defaults.forEach(function(d) { if (!existing.includes(d[0])) settingsSheet.appendRow(d); });
  Logger.log("Setup complete!");
}
