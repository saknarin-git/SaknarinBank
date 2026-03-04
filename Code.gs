// ==========================================
// ส่วนที่ 1: การตั้งค่าเริ่มต้นและความปลอดภัย (Security Core)
// ==========================================

const SESSION_TIMEOUT = 3600; // 1 ชั่วโมง (วินาที)
const OTP_TIMEOUT = 900;      // 15 นาที (วินาที)
const MAX_OTP_ATTEMPTS = 5;

/** 
 * ฟังก์ชันสร้างรหัสผ่านแบบ HMAC-SHA256 และ Salt
 * (เนื่องจาก GAS ไม่มี bcrypt/argon2 โดยตรง จึงใช้ HMAC เป็นส่วนเสริม)
 */
function hashPassword(password, salt) {
  const secretKey = "saknarin_bank_secret_key"; // ในการทำงานจริงควรแยกเก็บ
  const rawHash = Utilities.computeHmacSignature(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt), secretKey);
  return Utilities.base64Encode(rawHash) + ':' + salt;
}

function verifyPassword(password, storedHashWithSalt) {
  try {
    const parts = storedHashWithSalt.split(':');
    if (parts.length !== 2) return false;
    const salt = parts[1];
    const testHash = hashPassword(password, salt);
    return testHash === storedHashWithSalt;
  } catch (e) { return false; }
}

function generateSalt(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let salt = '';
  for (let i = 0; i < length; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return salt;
}

/** 
 * ระบบ Session โดยใช้ CacheService (ป้องกัน Broken Access Control)
 */
function createSession(userInfo) {
  const token = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  cache.put(token, JSON.stringify(userInfo), SESSION_TIMEOUT);
  return token;
}

function validateSession(token, requiredRoles = []) {
  if (!token) return { valid: false, message: 'กรุณาเข้าสู่ระบบ' };
  
  const cache = CacheService.getScriptCache();
  const sessionData = cache.get(token);
  
  if (!sessionData) return { valid: false, message: 'Session หมดอายุหรือไม่มีสิทธิ์ (Unauthorized)' };
  
  const user = JSON.parse(sessionData);
  
  if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
    return { valid: false, message: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ (Forbidden)' };
  }
  
  return { valid: true, userId: user.userId, username: user.username, role: user.role, email: user.email };
}

/** 
 * ฟังก์ชันค้นหาแถวโดยใช้ Search (ป้องกัน Row Index Injection)
 */
function findRowById(sheet, id, column = 1) {
  const range = sheet.getRange(1, column, sheet.getLastRow());
  const finder = range.createTextFinder(id).matchEntireCell(true).findNext();
  return finder ? finder.getRow() : null;
}

function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  let usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) {
    usersSheet = ss.insertSheet('Users');
    usersSheet.appendRow(['UserID', 'Username', 'PasswordHash', 'Email', 'Role', 'Status', 'CreatedAt']);
    usersSheet.setFrozenRows(1);
    const adminPass = hashPassword('admin1234', generateSalt()); 
    usersSheet.appendRow(['U001', 'admin', adminPass, 'admin@saknarin.com', 'Admin', 'Active', new Date()]);
  }

  let logsSheet = ss.getSheetByName('Logs');
  if (!logsSheet) {
    logsSheet = ss.insertSheet('Logs');
    logsSheet.appendRow(['Timestamp', 'Username', 'Action', 'Details']);
    logsSheet.setFrozenRows(1);
  }

  protectAllSheets(ss);
  setupStaffSystem();
  setupPaymentSystem();
  
  Logger.log('ตั้งค่าระบบฐานข้อมูล Saknarin สำเร็จแล้ว!');
}

function protectAllSheets(ss) {
  const sheets = ss.getSheets();
  const me = Session.getEffectiveUser();
  sheets.forEach(sheet => {
    let protection = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
    if (!protection) protection = sheet.protect().setDescription('ล็อคระบบโดย Saknarin');
    protection.removeEditors(protection.getEditors());
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
    protection.addEditor(me);
  });
}

function systemLog(username, action, details) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logsSheet = ss.getSheetByName('Logs');
  if (logsSheet) logsSheet.appendRow([new Date(), username, action, details]);
}


// ==========================================
// ส่วนที่ 2: ระบบหน้าเว็บและ Authentication
// ==========================================

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Saknarin Bank')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function registerUser(username, password, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  
  // ใช้ TextFinder ค้นหา Username และ Email ซ้ำแบบรวดเร็ว
  if (findRowById(usersSheet, username, 2)) return { success: false, message: 'Username นี้มีผู้ใช้งานแล้ว' };
  if (findRowById(usersSheet, email, 4)) return { success: false, message: 'Email นี้ถูกใช้ลงทะเบียนแล้ว' };
  
  const newUserId = 'U' + new Date().getTime() + Math.floor(Math.random() * 1000);
  const hashedPassword = hashPassword(password, generateSalt());
  
  usersSheet.appendRow([newUserId, username, hashedPassword, email, 'Member', 'Active', new Date()]);
  systemLog(username, 'REGISTER', 'สมัครสมาชิกใหม่สำเร็จ');
  
  return { success: true, message: 'สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ' };
}

function loginUser(username, password) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  
  const row = findRowById(usersSheet, username, 2);
  if (!row) return { success: false, message: 'ไม่พบ Username หรือรหัสผ่านไม่ถูกต้อง' };
  
  const data = usersSheet.getRange(row, 1, 1, 6).getValues()[0];
  const status = data[5];
  const storedHash = data[2];
  
  if (status !== 'Active') return { success: false, message: 'บัญชีของคุณถูกระงับการใช้งาน' };
  
  if (verifyPassword(password, storedHash)) {
    const userInfo = { userId: data[0], username: data[1], email: data[3], role: data[4] };
    const token = createSession(userInfo);
    systemLog(username, 'LOGIN', 'เข้าสู่ระบบสำเร็จ');
    return { success: true, message: 'เข้าสู่ระบบสำเร็จ', user: userInfo, token: token };
  } else {
    systemLog(username, 'LOGIN_FAILED', 'รหัสผ่านไม่ถูกต้อง');
    return { success: false, message: 'รหัสผ่านไม่ถูกต้อง' };
  }
}

/** 
 * ระบบ OTP พร้อม Rate Limit
 */
function generateAndSendOTP(email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  const row = findRowById(usersSheet, email, 4);
  
  if (!row) return { success: false, message: 'ไม่พบอีเมลนี้ในระบบ' };
  const username = usersSheet.getRange(row, 2).getValue();
  
  // Rate Limit โดยใช้ Cache
  const cache = CacheService.getScriptCache();
  const limitKey = "otp_rate_" + email;
  const attempts = Number(cache.get(limitKey) || 0);
  if (attempts >= 3) return { success: false, message: 'คุณขอ OTP บ่อยเกินไป กรุณารอ 15 นาที' };
  
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const otpData = { code: otpCode, email: email, attempts: 0 };
  
  // เก็บ OTP ใน Cache แทน Sheet เพื่อความเร็วและความปลอดภัย
  const otpKey = "otp_" + email;
  cache.put(otpKey, JSON.stringify(otpData), OTP_TIMEOUT);
  cache.put(limitKey, (attempts + 1).toString(), OTP_TIMEOUT);
  
  const subject = 'Saknarin Bank - รหัส OTP สำหรับรีเซ็ตรหัสผ่าน';
  const body = `สวัสดีคุณ ${username},\n\nรหัส OTP ของคุณคือ: ${otpCode}\nรหัสนี้จะหมดอายุในอีก 15 นาที\n\nหากคุณไม่ได้ทำรายการนี้ กรุณาแจ้งผู้ดูแลระบบ`;
  
  MailApp.sendEmail(email, subject, body);
  systemLog(username, 'REQUEST_OTP', `ส่ง OTP ไปยัง ${email}`);
  
  return { success: true, message: 'ส่งรหัส OTP ไปยังอีเมลของคุณแล้ว' };
}

function verifyOTPAndResetPassword(email, otpCode, newPassword) {
  const cache = CacheService.getScriptCache();
  const otpKey = "otp_" + email;
  const cachedData = cache.get(otpKey);
  
  if (!cachedData) return { success: false, message: 'รหัส OTP หมดอายุหรือไม่มีอยู่ในระบบ' };
  
  let otpObj = JSON.parse(cachedData);
  
  if (otpObj.code !== otpCode.toString()) {
    otpObj.attempts++;
    if (otpObj.attempts >= MAX_OTP_ATTEMPTS) {
      cache.remove(otpKey);
      return { success: false, message: 'ใส่รหัสผิดเกินจำนวนครั้งที่กำหนด กรุณาขอใหม่' };
    }
    cache.put(otpKey, JSON.stringify(otpObj), OTP_TIMEOUT);
    return { success: false, message: 'รหัส OTP ไม่ถูกต้อง' };
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  const row = findRowById(usersSheet, email, 4);
  
  if (row) {
    const hashedPassword = hashPassword(newPassword, generateSalt());
    usersSheet.getRange(row, 3).setValue(hashedPassword);
    cache.remove(otpKey);
    systemLog(usersSheet.getRange(row, 2).getValue(), 'RESET_PASSWORD', 'รีเซ็ตรหัสผ่านสำเร็จ');
    return { success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ!' };
  }
  
  return { success: false, message: 'ไม่พบผู้ใช้ในระบบ' };
}


// ==========================================
// ส่วนที่ 3: ระบบจัดการของ Admin
// ==========================================

function getAdminDashboardData(token) {
  const auth = validateSession(token, ['Admin']);
  if (!auth.valid) return { success: false, message: auth.message };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  const data = usersSheet.getDataRange().getValues();
  
  let totalUsers = 0, activeUsers = 0, bannedUsers = 0;
  let userList = [];
  
  for (let i = 1; i < data.length; i++) {
    totalUsers++;
    if (data[i][5] === 'Active') activeUsers++;
    if (data[i][5] === 'Banned') bannedUsers++;
    
    userList.push({
      userId: data[i][0],
      username: data[i][1],
      email: data[i][3],
      role: data[i][4],
      status: data[i][5]
    });
  }
  
  return {
    success: true,
    stats: { total: totalUsers, active: activeUsers, banned: bannedUsers },
    users: userList
  };
}

function updateUserRole(token, targetUserId, newRole) {
  const auth = validateSession(token, ['Admin']);
  if (!auth.valid) return { success: false, message: auth.message };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  const row = findRowById(usersSheet, targetUserId);
  
  if (row) {
      usersSheet.getRange(row, 5).setValue(newRole);
      systemLog(auth.username, 'UPDATE_ROLE', `เปลี่ยนสิทธิ์ผู้ใช้ ${targetUserId} เป็น ${newRole}`);
      return { success: true, message: `เปลี่ยนสิทธิ์สำเร็จ` };
  }
  return { success: false, message: 'ไม่พบผู้ใช้ในระบบ' };
}

function toggleUserStatus(token, targetUserId, currentStatus) {
  const auth = validateSession(token, ['Admin']);
  if (!auth.valid) return { success: false, message: auth.message };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  const row = findRowById(usersSheet, targetUserId);
  const newStatus = currentStatus === 'Active' ? 'Banned' : 'Active';
  
  if (row) {
      usersSheet.getRange(row, 6).setValue(newStatus);
      systemLog(auth.username, 'TOGGLE_STATUS', `เปลี่ยนสถานะ ${targetUserId} เป็น ${newStatus}`);
      return { success: true, message: `เปลี่ยนสถานะเป็น ${newStatus} สำเร็จ`, newStatus: newStatus };
  }
  return { success: false, message: 'ไม่พบผู้ใช้ในระบบ' };
}


// ==========================================
// ส่วนที่ 4: การจัดการข้อมูลส่วนตัว (Profile)
// ==========================================

function updateUserEmail(token, newEmail) {
  const auth = validateSession(token);
  if (!auth.valid) return { success: false, message: auth.message };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  
  // ตรวจอีเมลซ้ำที่ไม่ใช่ตัวเอง
  const existingRow = findRowById(usersSheet, newEmail, 4);
  if (existingRow) {
    const existingUserId = usersSheet.getRange(existingRow, 1).getValue();
    if (existingUserId !== auth.userId) return { success: false, message: 'อีเมลนี้ถูกใช้งานโดยบัญชีอื่นแล้ว' };
  }

  const row = findRowById(usersSheet, auth.userId);
  if (row) {
    usersSheet.getRange(row, 4).setValue(newEmail);
    systemLog(auth.username, 'UPDATE_PROFILE', 'อัปเดตอีเมล');
    return { success: true, message: 'อัปเดตอีเมลสำเร็จ', newEmail: newEmail };
  }
  return { success: false, message: 'ไม่พบข้อมูลผู้ใช้งาน' };
}

function changeUserPassword(token, oldPassword, newPassword) {
  const auth = validateSession(token);
  if (!auth.valid) return { success: false, message: auth.message };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  const row = findRowById(usersSheet, auth.userId);

  if (row) {
      const storedHash = usersSheet.getRange(row, 3).getValue();
      if (!verifyPassword(oldPassword, storedHash)) return { success: false, message: 'รหัสผ่านเดิมไม่ถูกต้อง' };
      
      const hashedNewPassword = hashPassword(newPassword, generateSalt());
      usersSheet.getRange(row, 3).setValue(hashedNewPassword);
      systemLog(auth.username, 'CHANGE_PASSWORD', 'เปลี่ยนรหัสผ่าน');
      return { success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' };
  }
  return { success: false, message: 'ไม่พบข้อมูลผู้ใช้งาน' };
}


// ==========================================
// ส่วนที่ 5: ระบบของเจ้าหน้าที่ (Staff) และหน้า Member
// ==========================================

function setupStaffSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let loanSheet = ss.getSheetByName('LoanMembers');
  if (!loanSheet) {
    loanSheet = ss.insertSheet('LoanMembers');
    loanSheet.appendRow(['MemberNo', 'FullName', 'ContractNo', 'LoanAmount', 'Guarantor1', 'Guarantor2', 'CreatedAt', 'Status', 'PrincipalBalance']);
    loanSheet.setFrozenRows(1);
    loanSheet.setFrozenColumns(2); 
    protectAllSheets(ss);
  }
}

function getNextLoanInfo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const loanSheet = ss.getSheetByName('LoanMembers') || ss.insertSheet('LoanMembers');
  const data = loanSheet.getDataRange().getValues();

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const thaiYear = String(now.getFullYear() + 543).slice(-2); 
  const suffix = `/${month}${thaiYear}`; 
  
  let maxRunNo = 0;
  for (let i = 1; i < data.length; i++) {
    const contract = String(data[i][2] || '');
    if (contract.endsWith(suffix)) {
      const runNo = parseInt(contract.split('/')[0], 10);
      if (runNo > maxRunNo) maxRunNo = runNo;
    }
  }
  const nextRunNo = String(maxRunNo + 1).padStart(2, '0');
  return { contractNo: `${nextRunNo}${suffix}` }; 
}

function addLoanMember(token, memberData) {
  const auth = validateSession(token, ['Admin', 'Staff']);
  if(!auth.valid) return { success: false, message: auth.message };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const loanSheet = ss.getSheetByName('LoanMembers');
    
    if (findRowById(loanSheet, memberData.memberNo)) {
      return { success: false, message: `เลขสมาชิก ${memberData.memberNo} มีในระบบแล้ว` };
    }

    const info = getNextLoanInfo();
    loanSheet.appendRow([
      memberData.memberNo, memberData.fullName, info.contractNo, 
      memberData.loanAmount, memberData.guarantor1, memberData.guarantor2, 
      new Date(), 'Active', memberData.loanAmount 
    ]);
    
    // เรียงข้อมูลตามเลขสมาชิก
    const lastRow = loanSheet.getLastRow();
    if (lastRow > 1) {
      loanSheet.getRange(2, 1, lastRow - 1, loanSheet.getLastColumn()).sort({column: 1, ascending: true});
    }
    
    systemLog(auth.username, 'ADD_MEMBER', `เพิ่มสมาชิก: ${memberData.memberNo}`);
    return { success: true, message: 'บันทึกสำเร็จ!' };
  } catch (e) {
    return { success: false, message: 'ระบบไม่ว่าง กรุณาลองใหม่' };
  } finally {
    lock.releaseLock();
  }
}

function getDailyReportData(token) {
  const auth = validateSession(token, ['Admin', 'Staff']);
  if(!auth.valid) return { success: false, message: auth.message };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const loanSheet = ss.getSheetByName('LoanMembers');
  const txSheet = ss.getSheetByName('Transactions');
  
  const now = new Date();
  const todayStr = Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM-dd");
  
  let totalOutstanding = 0;
  if (loanSheet) {
    const loanData = loanSheet.getDataRange().getValues();
    for (let i = 1; i < loanData.length; i++) {
       if (loanData[i][7] === 'Active') totalOutstanding += Number(loanData[i][8]) || 0;
    }
  }
  
  let todayTx = [], sumPrincipal = 0, sumInterest = 0, sumTotal = 0;
  if (txSheet) {
    const txData = txSheet.getDataRange().getValues();
    for (let i = 1; i < txData.length; i++) {
       const txDateStr = Utilities.formatDate(new Date(txData[i][1]), "Asia/Bangkok", "yyyy-MM-dd");
       if (txDateStr === todayStr) {
         const prin = Number(txData[i][5]), intVal = Number(txData[i][6]), total = Number(txData[i][7]);
         sumPrincipal += prin; sumInterest += intVal; sumTotal += total;
         todayTx.push({
           time: Utilities.formatDate(new Date(txData[i][1]), "Asia/Bangkok", "HH:mm"),
           memberNo: txData[i][2], name: txData[i][4], principal: prin, interest: intVal,
           remaining: Number(txData[i][8]), note: txData[i][9] || '-'
         });
       }
    }
  }

  return {
    success: true,
    reportDate: Utilities.formatDate(now, "Asia/Bangkok", "dd/MM/yyyy"),
    summary: { broughtForward: totalOutstanding + sumPrincipal, principalPaid: sumPrincipal, interestPaid: sumInterest, totalPaid: sumTotal, carriedForward: totalOutstanding },
    transactions: todayTx
  };
}


// ==========================================
// ส่วนที่ 6: ระบบรับชำระเงิน (Payment)
// ==========================================

function setupPaymentSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let txSheet = ss.getSheetByName('Transactions');
  if (!txSheet) {
    txSheet = ss.insertSheet('Transactions');
    txSheet.appendRow(['TxID', 'Timestamp', 'MemberNo', 'ContractNo', 'FullName', 'PrincipalPaid', 'InterestPaid', 'TotalPaid', 'RemainingBalance', 'Note', 'Staff']);
    txSheet.setFrozenRows(1);
    protectAllSheets(ss);
  }
}

function searchMemberForPayment(token, memberNo) {
  const auth = validateSession(token, ['Admin', 'Staff']);
  if(!auth.valid) return { success: false, message: auth.message };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const loanSheet = ss.getSheetByName('LoanMembers');
  const data = loanSheet.getDataRange().getValues();

  let contracts = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === memberNo.toString() && data[i][7] === 'Active' && Number(data[i][8]) > 0) {
      contracts.push({ memberNo: data[i][0], fullName: data[i][1], contractNo: data[i][2], balance: Number(data[i][8]), missedMonths: 1 });
    }
  }
  
  if (contracts.length === 0) return { success: false, message: 'ไม่พบยอดหนี้คงเหลือ' };
  return { success: true, contracts: contracts };
}

function savePaymentTransaction(token, payload) {
  const auth = validateSession(token, ['Admin', 'Staff']);
  if(!auth.valid) return { success: false, message: auth.message };

  if (payload.principalPaid < 0 || payload.interestPaid < 0 || (payload.principalPaid + payload.interestPaid) <= 0) {
      return { success: false, message: 'ยอดชำระไม่ถูกต้อง' };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000); 
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const loanSheet = ss.getSheetByName('LoanMembers');
    
    // ค้นหาแถวแบบเจาะจง Member + Contract
    const data = loanSheet.getDataRange().getValues();
    let row = -1;
    for(let i=1; i<data.length; i++) {
      if (data[i][0].toString() === payload.memberNo.toString() && data[i][2] === payload.contractNo) {
        row = i + 1; break;
      }
    }
    
    if (row === -1) return { success: false, message: 'ไม่พบสัญญา' };

    const currentBalance = Number(loanSheet.getRange(row, 9).getValue());
    if (currentBalance < payload.principalPaid) return { success: false, message: 'ชำระเกิน!' };

    const newBalance = currentBalance - payload.principalPaid;
    const txID = Utilities.getUuid(); // ป้องกัน Collision
    const today = new Date();

    loanSheet.getRange(row, 9).setValue(newBalance);
    if (newBalance <= 0) loanSheet.getRange(row, 8).setValue('Closed');

    const txSheet = ss.getSheetByName('Transactions');
    txSheet.appendRow([txID, today, payload.memberNo, payload.contractNo, payload.fullName, payload.principalPaid, payload.interestPaid, payload.totalPaid, newBalance, payload.note || '-', auth.username]);

    return { success: true, passbook: { date: Utilities.formatDate(today, "Asia/Bangkok", "dd/MM/yyyy"), principal: payload.principalPaid, interest: payload.interestPaid, balance: newBalance, note: payload.note } };
  } catch (e) {
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}

function getRecentTransactions(token) {
  const auth = validateSession(token, ['Admin', 'Staff']);
  if (!auth.valid) return [];

  const txSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Transactions');
  if (!txSheet) return [];
  
  const data = txSheet.getRange(Math.max(1, txSheet.getLastRow() - 20), 1, Math.min(21, txSheet.getLastRow()), 8).getValues();
  let recent = [];
  for (let i = data.length - 1; i > 0; i--) {
    recent.push({
      time: Utilities.formatDate(new Date(data[i][1]), "Asia/Bangkok", "HH:mm"),
      memberNo: data[i][2], name: data[i][4], principal: data[i][5], interest: data[i][6], total: data[i][7]
    });
  }
  return recent;
}


// ==========================================
// ส่วนที่ 7: ระบบของสมาชิก (Member View)
// ==========================================

function getMemberLoanData(token) {
  const auth = validateSession(token, ['Member', 'Admin', 'Staff']);
  if (!auth.valid) return { success: false, message: auth.message };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const loanSheet = ss.getSheetByName('LoanMembers');
  const txSheet = ss.getSheetByName('Transactions');
  
  // ค้นหาข้อมูลสมาชิก (อิงตามชื่อผู้ใช้หรือรหัสสมาชิก)
  // หมายเหตุ: ในระบบจริงควรผูก UserID กับ MemberNo
  // สมมติในที่นี้ Username ของ Member คือ MemberNo
  const memberNo = auth.username; 
  
  let loans = [];
  if (loanSheet) {
    const data = loanSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === memberNo.toString()) {
        loans.push({
          contractNo: data[i][2],
          loanAmount: data[i][3],
          balance: data[i][8],
          status: data[i][7]
        });
      }
    }
  }

  let transactions = [];
  if (txSheet) {
     const data = txSheet.getDataRange().getValues();
     for (let i = data.length - 1; i > 0 && transactions.length < 10; i--) {
       if (data[i][2].toString() === memberNo.toString()) {
         transactions.push({
           date: Utilities.formatDate(new Date(data[i][1]), "Asia/Bangkok", "dd/MM/yyyy"),
           principal: data[i][5],
           interest: data[i][6],
           balance: data[i][8]
         });
       }
     }
  }

  return { success: true, loans: loans, transactions: transactions };
}

function getStaffMemberDirectory(token) {
  const auth = validateSession(token, ['Admin', 'Staff']);
  if (!auth.valid) return { success: false, message: auth.message };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const loanSheet = ss.getSheetByName('LoanMembers');
  if (!loanSheet) return { success: true, members: [] };

  const data = loanSheet.getDataRange().getValues();
  let members = [];
  for (let i = 1; i < data.length; i++) {
    members.push({
      memberNo: data[i][0],
      fullName: data[i][1],
      contractNo: data[i][2],
      loanAmount: data[i][3],
      status: data[i][7],
      balance: data[i][8]
    });
  }

  return { success: true, members: members };
}
