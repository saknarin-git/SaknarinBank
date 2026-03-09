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
    try {
        const safeUsername = String(username).trim();
        if (!safeUsername) return Utils.response(false, 'กรุณาระบุ Username');

        // Rate Limiting
        AuthService.checkRateLimit(safeUsername);

        const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.AUTH);
        if (!sheet) throw new Error('ไม่พบฐานข้อมูลผู้ใช้งานในระบบ');

        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return Utils.response(false, 'ไม่พบ Username หรือรหัสผ่านไม่ถูกต้อง');

        // Build O(1) user index (Fix #10)
        const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
        DatabaseEngine.buildUserIndex(data);

        const userRow = DatabaseEngine.Query.getUserByUsername(safeUsername);

        if (!userRow) return Utils.response(false, 'ไม่พบ Username หรือรหัสผ่านไม่ถูกต้อง');
        
        // User data mapping
        const user = { 
            id: userRow[0], 
            username: userRow[1], 
            hash: userRow[2], 
            email: userRow[3], 
            role: userRow[4], 
            status: userRow[5] 
        };
        
        if (user.status !== 'Active') return Utils.response(false, 'บัญชีของคุณถูกระงับการใช้งาน');
        
        // Check password via Service
        const parts = user.hash.split(':');
        if (parts.length === 2) {
            const expectedHash = parts[0];
            const salt = parts[1];
            
            const testHash = AuthService.hashPassword(password, salt);
            
            if (testHash === expectedHash) {
                AuthService.clearRateLimit(safeUsername);
                const token = AuthService.createSession(user);
                Utils.logMessage('INFO', 'LOGIN', 'เข้าสู่ระบบสำเร็จ', user.username);
                Utils.flushLogs();
                return Utils.response(true, 'เข้าสู่ระบบสำเร็จ', { user, token });
            }
        }
        
        Utils.flushLogs();
        return Utils.response(false, 'รหัสผ่านไม่ถูกต้อง');

    } catch (err) {
        Utils.flushLogs();
        return Utils.response(false, err.message);
    }
}

function logoutUser(token) {
    try {
        AuthService.destroySession(token);
        return Utils.response(true, 'ออกจากระบบสำเร็จ');
    } catch (err) {
        return Utils.response(false, err.message);
    }
}

function restoreSession(token) {
    try {
        const session = AuthService.validateSession(token, [CONFIG.ROLES.ADMIN, CONFIG.ROLES.STAFF, CONFIG.ROLES.MEMBER]);
        return Utils.response(true, 'Session valid', { 
            valid: true, 
            user: { 
                id: session.id,
                username: session.username, 
                role: session.role 
            } 
        });
    } catch(err) {
        return Utils.response(false, err.message);
    }
}

function registerUser(username, password, email) {
    try {
        return UserService.registerUser(username, password, email);
    } catch (err) {
        return Utils.response(false, err.message);
    }
}

function generateAndSendOTP(email) {
    try {
        return UserService.generateAndSendOTP(email);
    } catch (err) {
        return Utils.response(false, err.message);
    }
}

function verifyOTPAndResetPassword(email, otp, newPassword) {
    try {
        return UserService.verifyOTPAndResetPassword(email, otp, newPassword);
    } catch (err) {
        return Utils.response(false, err.message);
    }
}

function updateUserEmail(token, newEmail) {
    try {
        return UserService.updateUserEmail(token, newEmail);
    } catch (err) {
        return Utils.response(false, err.message);
    }
}

function changeUserPassword(token, oldPassword, newPassword) {
    try {
        return UserService.changeUserPassword(token, oldPassword, newPassword);
    } catch (err) {
        return Utils.response(false, err.message);
    }
}

/**
 * ====================================
 * STAFF ROUTING (Staff Dashboard)
 * ====================================
 */

function getStaffMemberDirectory(token) {
    try {
        return StaffService.getStaffMemberDirectoryPage(token, 1, 500, ""); 
    } catch (err) {
        return Utils.response(false, err.message);
    }
}

function searchMemberForPayment(token, memberNo) {
    try {
        return StaffService.searchMemberForPayment(token, memberNo);
    } catch (err) {
        return Utils.response(false, err.message);
    }
}

// Fixed empty processPayment to call Service layer
function processPayment(token, payload) {
    try {
        return PaymentService.processPayment(token, payload);
    } catch(err) {
        return Utils.response(false, err.message);
    }
}

// Removed duplicated logic, routes to processPayment
function savePaymentTransaction(token, payload) {
    return processPayment(token, payload);
}

function getRecentTransactions(token) {
    try {
        const txs = PaymentService.getRecentTransactions(token);
        return Utils.response(true, 'ดึงข้อมูลสำเร็จ', txs);
    } catch(err) {
        return Utils.response(false, err.message);
    }
}

function addLoanMember(token, data) {
    try {
        return LoanService.addLoanMember(token, data);
    } catch (err) {
        return Utils.response(false, err.message);
    }
}

function getNextLoanInfo() {
    try {
        return LoanService.getNextLoanInfo();
    } catch (err) {
        return Utils.response(false, err.message);
    }
}

function getDailyReportData(token) {
    try {
        const session = AuthService.validateSession(token, [CONFIG.ROLES.STAFF, CONFIG.ROLES.ADMIN]);
        
        DatabaseEngine.init();
        const txs = PaymentRepository.getRecentTransactions(100); 
        
        let principalPaid = 0;
        let interestPaid = 0;
        let totalPaid = 0;

        txs.forEach(tx => {
            principalPaid += Number(tx.principal) || 0;
            interestPaid += Number(tx.interest) || 0;
            totalPaid += Number(tx.total) || 0;
        });

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
    } catch(err) {
        return Utils.response(false, err.message);
    }
}

/**
 * ====================================
 * ADMIN ROUTING (Admin Dashboard)
 * ====================================
 */

function getAdminDashboardData(token) {
    try {
        return AdminService.getAdminDashboardData(token);
    } catch (err) {
        return Utils.response(false, err.message);
    }
}

function updateUserRole(token, targetUserId, newRole) {
    try {
        return AdminService.updateUserRole(token, targetUserId, newRole);
    } catch (err) {
        return Utils.response(false, err.message);
    }
}

function toggleUserStatus(token, targetUserId, currentStatus) {
    try {
        return AdminService.toggleUserStatus(token, targetUserId, currentStatus);
    } catch (err) {
        return Utils.response(false, err.message);
    }
}

/**
 * ====================================
 * MEMBER ROUTING (Member Dashboard)
 * ====================================
 */
function getMemberLoanData(token) {
    try {
        const session = AuthService.validateSession(token, [CONFIG.ROLES.MEMBER]);
        
        DatabaseEngine.init();

        const contracts = ContractRepository.getContractsByMemberNo(session.username); 
        const allTx = PaymentRepository.getRecentTransactions(500); 
        const myTx = allTx.filter(tx => String(tx.memberNo) === String(session.username)).slice(0, 5);

        return Utils.response(true, 'ดึงข้อมูลสำเร็จ', {
            loans: contracts,
            transactions: myTx
        });
    } catch(err) {
        return Utils.response(false, err.message);
    }
}