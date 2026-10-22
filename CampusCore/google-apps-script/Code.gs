/**
 * CAMPUS CORE — PRODUCTION GOOGLE APPS SCRIPT ATTENDANCE INTEGRATION
 * 
 * Hardware Endpoint: doGet(e) receives RFID card scans from hardware scanners.
 * Live Google Sheet: 1CLlTz9hZ3IdChuTO9gx4Fusf5CspohMhyqn3Pwar_xw
 * Sheet Name: Attendance
 * Columns: UID, Name, Role, Date, Entry Time, Exit Time, Status
 */

const SPREADSHEET_ID = "1CLlTz9hZ3IdChuTO9gx4Fusf5CspohMhyqn3Pwar_xw";
const SHEET_NAME = "Attendance";
const HEADERS = ["UID", "Name", "Role", "Date", "Entry Time", "Exit Time", "Status"];

// ================= CAMPUS CORE BACKEND SYNC CONFIG =================
const CAMPUS_CORE_CONFIG = {
  // Update this with your deployed domain, ngrok tunnel, or local reverse proxy
  // Must be a PUBLICLY reachable HTTPS URL. Google's servers cannot reach "localhost",
  // so leave this empty unless the backend is deployed; the backend pulls the sheet instead.
  BACKEND_WEBHOOK_URL: "",
  // Must match INTEGRATION_WEBHOOK_SECRET in the backend .env. Do not commit real values.
  WEBHOOK_SECRET: "",
  BATCH_SIZE: 50,
  ENABLE_REALTIME_SYNC: true
};

/**
 * Main Web App Entry Point:
 * Handles both Hardware Scans (uid, name, role, type, date, time)
 * and Campus Core Sync requests (action=export)
 */
function doGet(e) {
  const p = (e && e.parameter) || {};

  // Support on-demand export for Campus Core backend pull
  if (p.action === "export") {
    // Export is disabled unless a secret is configured, so attendance data is never public.
    if (!CAMPUS_CORE_CONFIG.WEBHOOK_SECRET || p.secret !== CAMPUS_CORE_CONFIG.WEBHOOK_SECRET) {
      return jsonResponse({ success: false, message: "Unauthorized: Invalid sync secret" });
    }
    return exportAttendanceData(p.gid);
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    return handleRequest(e);
  } catch (error) {
    return jsonResponse({ success: false, message: error.message });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function handleRequest(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange("D:F").setNumberFormat("@"); // keep date/time as plain text
  }

  const p = (e && e.parameter) || {};
  const uid  = (p.uid  || "").trim();
  const name = (p.name || "").trim();
  const role = (p.role || "").trim().toUpperCase();
  const type = (p.type || "").trim().toUpperCase();
  const date = (p.date || "").trim();
  const time = (p.time || "").trim();

  if (!uid || !name || !role || !type || !date || !time) {
    return jsonResponse({ success: false, message: "Missing required parameters" });
  }
  if (!["STUDENT", "LECTURER"].includes(role)) {
    return jsonResponse({ success: false, message: "Role must be STUDENT or LECTURER" });
  }
  if (!["ENTRY", "EXIT"].includes(type)) {
    return jsonResponse({ success: false, message: "Type must be ENTRY or EXIT" });
  }

  // Find the LATEST row for this UID on this date
  let row = -1;
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const rec = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
    for (let i = rec.length - 1; i >= 0; i--) {
      if (rec[i][0] === uid && rec[i][3] === date) { row = i + 2; break; }
    }
  }

  // Student is "inside" if the latest row has an entry but no exit
  const exitTime = row === -1 ? "" : sheet.getRange(row, 6).getDisplayValue();
  const inside = row !== -1 && !exitTime;

  if (type === "ENTRY") {
    if (inside) {
      return jsonResponse({
        success: false,
        message: "Already inside. Exit must be recorded first",
        nextAction: "EXIT"
      });
    }
    // New session = new row
    sheet.appendRow([uid, name, role, date, time, "", "PRESENT"]);
    SpreadsheetApp.flush();
    const newRowIndex = sheet.getLastRow();

    // Asynchronously or safely forward to Campus Core
    forwardToCampusCore({
      "UID": uid,
      "Name": name,
      "Role": role,
      "Date": date,
      "Entry Time": time,
      "Exit Time": "",
      "Status": "PRESENT",
      "source_row_id": "row_" + newRowIndex + "_" + uid
    });

    return jsonResponse({ success: true, message: "ENTRY recorded", nextAction: "EXIT" });
  }

  // EXIT
  if (!inside) {
    return jsonResponse({
      success: false,
      message: "No open ENTRY found. Scan for ENTRY first",
      nextAction: "ENTRY"
    });
  }

  const entryTimeRecorded = sheet.getRange(row, 5).getDisplayValue();
  sheet.getRange(row, 6).setValue(time);
  sheet.getRange(row, 7).setValue("COMPLETED");
  SpreadsheetApp.flush();

  // Forward update to Campus Core
  forwardToCampusCore({
    "UID": uid,
    "Name": name,
    "Role": role,
    "Date": date,
    "Entry Time": entryTimeRecorded,
    "Exit Time": time,
    "Status": "COMPLETED",
    "source_row_id": "row_" + row + "_" + uid
  });

  return jsonResponse({ success: true, message: "EXIT recorded", nextAction: "ENTRY" });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Safe forwarder to Campus Core API.
 * Any networking issue is caught and logged so hardware scanners never block or error.
 */
function forwardToCampusCore(record) {
  if (!CAMPUS_CORE_CONFIG.ENABLE_REALTIME_SYNC || !CAMPUS_CORE_CONFIG.BACKEND_WEBHOOK_URL) {
    return;
  }

  try {
    const payload = {
      records: [record],
      source: "APPS_SCRIPT_HARDWARE_EVENT"
    };

    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "X-Integration-Secret": CAMPUS_CORE_CONFIG.WEBHOOK_SECRET,
        "Authorization": "Bearer " + CAMPUS_CORE_CONFIG.WEBHOOK_SECRET
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    UrlFetchApp.fetch(CAMPUS_CORE_CONFIG.BACKEND_WEBHOOK_URL, options);
  } catch (err) {
    Logger.log("Campus Core Sync warning (hardware scan preserved in sheet): " + err.toString());
  }
}

/**
 * Custom Menu inside Google Sheets spreadsheet UI
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Campus Core Sync')
    .addItem('Sync All Rows Now', 'syncAllRows')
    .addItem('Test API Connection', 'testConnection')
    .addToUi();
}

/**
 * Bulk sync all rows from the Attendance sheet to Campus Core
 */
function syncAllRows() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert("No attendance records found to sync.");
    return;
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 7);
  const rows = range.getDisplayValues();
  const records = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const uid = String(r[0] || "").trim();
    if (!uid) continue;

    records.push({
      "UID": uid,
      "Name": String(r[1] || "").trim(),
      "Role": String(r[2] || "").trim(),
      "Date": String(r[3] || "").trim(),
      "Entry Time": String(r[4] || "").trim(),
      "Exit Time": String(r[5] || "").trim(),
      "Status": String(r[6] || "").trim(),
      "source_row_id": "row_" + (i + 2) + "_" + uid
    });
  }

  let totalSent = 0;
  for (let b = 0; b < records.length; b += CAMPUS_CORE_CONFIG.BATCH_SIZE) {
    const batch = records.slice(b, b + CAMPUS_CORE_CONFIG.BATCH_SIZE);
    try {
      const options = {
        method: "post",
        contentType: "application/json",
        headers: {
          "X-Integration-Secret": CAMPUS_CORE_CONFIG.WEBHOOK_SECRET,
          "Authorization": "Bearer " + CAMPUS_CORE_CONFIG.WEBHOOK_SECRET
        },
        payload: JSON.stringify({ records: batch, source: "APPS_SCRIPT_BULK" }),
        muteHttpExceptions: true
      };
      UrlFetchApp.fetch(CAMPUS_CORE_CONFIG.BACKEND_WEBHOOK_URL, options);
      totalSent += batch.length;
    } catch (e) {
      Logger.log("Batch sync error: " + e.toString());
    }
  }

  SpreadsheetApp.getUi().alert("Campus Core Sync Complete!\nSynchronized " + totalSent + " records.");
}

/**
 * Connection diagnostic test
 */
function testConnection() {
  try {
    const options = {
      method: "get",
      muteHttpExceptions: true
    };
    const res = UrlFetchApp.fetch(CAMPUS_CORE_CONFIG.BACKEND_WEBHOOK_URL.replace("/attendance", "/health"), options);
    SpreadsheetApp.getUi().alert("Campus Core Health Response: " + res.getContentText());
  } catch (err) {
    SpreadsheetApp.getUi().alert("Could not reach Campus Core: " + err.toString());
  }
}

/**
 * Returns the worksheet exactly as displayed (for the Campus Core backend pull).
 * Reads the worksheet whose gid is requested (default 0 = the Google Form response sheet),
 * returning the real header row and every row with its sheet row number.
 */
function exportAttendanceData(gid) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const wanted = String(gid === undefined || gid === null || gid === "" ? "0" : gid);
  const sheet = ss.getSheets().filter(function (s) { return String(s.getSheetId()) === wanted; })[0];
  if (!sheet) {
    return jsonResponse({ success: false, message: "No worksheet with gid " + wanted });
  }
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) {
    return jsonResponse({ success: true, sheetName: sheet.getName(), headers: [], rows: [] });
  }
  const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    rows.push({ row: i + 1, values: values[i] });
  }
  return jsonResponse({ success: true, sheetName: sheet.getName(), headers: values[0], rows: rows });
}
