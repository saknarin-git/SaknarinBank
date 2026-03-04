/**
 * 📂 Code.gs
 * API Gateway -> Single Entry Point for frontend google.script.run calls.
 * Routes all logic to Domain Services.
 */

// UI Entry Point
function doGet(e) {
    return HtmlService.createTemplateFromFile('Index')
        .evaluate()
        .setTitle('Saknarin Bank Enterprise')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ====================================
 * USER & AUTH ROUTING
 * ====================================
 */

function loginUser(username, password) {
    // Moved login logic to a local function here for simplicity, or it could be in AuthService
    const sheet = SpreadsheetApp.getActive().getSheetByName('Users');
    const range = sheet.getRange("B:B");
    const finder = range.createTextFinder(username).matchEntireCell(true).findNext();
    
    if (!finder) return Utils.response(false, 'ไม่พบ Username หรือรหัสผ่านไม่ถูกต้อง');
    
    const row = finder.getRow();
    const data = sheet.getRange(row, 1, 1, 6).getValues()[0];
    
    // User data mapping
    const user = { id: data[0], username: data[1], hash: data[2], email: data[3], role: data[4], status: data[5] };
    
    if (user.status !== 'Active') return Utils.response(false, 'บัญชีของคุณถูกระงับการใช้งาน');
    
    // Check password
    const parts = user.hash.split(':');
    if (parts.length === 2) {
        const testHash = AuthService.hashPassword(password, parts[1]);
        if (testHash === user.hash.split(':')[0]) { // Match the base64 part
            const token = AuthService.createSession(user);
            Utils.logMessage('INFO', 'LOGIN', 'เข้าสู่ระบบสำเร็จ', user.username);
            return Utils.response(true, 'เข้าสู่ระบบสำเร็จ', { user, token });
        }
    }
    return Utils.response(false, 'รหัสผ่านไม่ถูกต้อง');
}

function logoutUser(token) {
    AuthService.destroySession(token);
    return Utils.response(true, 'ออกจากระบบสำเร็จ');
}

function processPayment(token, contractId, principal, interest) {
    // Used by standard POST or custom calls
}

/**
 * ====================================
 * STAFF ROUTING (Staff Dashboard)
 * ====================================
 */

function getStaffMemberDirectory(token) {
    return StaffService.getStaffMemberDirectoryPage(token, 1, 500, ""); // Fetch first 500 for simplicity UI
}

function searchMemberForPayment(token, memberNo) {
    return StaffService.searchMemberForPayment(token, memberNo);
}

function savePaymentTransaction(token, payload) {
    return PaymentService.processPayment(token, payload);
}

function getRecentTransactions(token) {
    return PaymentService.getRecentTransactions(token);
}

function getDailyReportData(token) {
    // Forwarding to PaymentRepository for daily report
    try {
        const session = AuthService.validateSession(token, [CONFIG.ROLES.STAFF, CONFIG.ROLES.ADMIN]);
        const txs = PaymentRepository.getRecentTransactions(100); 
        
        let principalPaid = 0;
        let interestPaid = 0;
        let totalPaid = 0;

        txs.forEach(tx => {
            principalPaid += Number(tx.principal) || 0;
            interestPaid += Number(tx.interest) || 0;
            totalPaid += Number(tx.total) || 0;
        });

        // Hardcode brought/carried for demonstration or calculate from ContractRepo
        return Utils.response(true, 'Success', {
            reportDate: Utils.formatDateTime(new Date()),
            summary: {
                broughtForward: 0,
                principalPaid,
                interestPaid,
                totalPaid,
                carriedForward: 0
            },
            transactions: txs
        });
    } catch(e) {
        return Utils.response(false, e.message);
    }
}

/**
 * ====================================
 * ADMIN ROUTING (Admin Dashboard)
 * ====================================
 */

function getAdminDashboardData(token) {
    return AdminService.getAdminDashboardData(token);
}

function updateUserRole(token, targetUserId, newRole) {
    return AdminService.updateUserRole(token, targetUserId, newRole);
}

function toggleUserStatus(token, targetUserId, currentStatus) {
    return AdminService.toggleUserStatus(token, targetUserId, currentStatus);
}
