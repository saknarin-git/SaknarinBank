/**
 * 📂 AdminService.gs
 * Business logic for Admin operations.
 */
const AdminService = (() => {

    function getAdminDashboardData(token) {
        try {
            AuthService.validateSession(token, [CONFIG.ROLES.ADMIN]);
            
            const sheet = SpreadsheetApp.getActive().getSheetByName('Users');
            const data = sheet.getDataRange().getValues();
            
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
            
            return Utils.response(true, 'ดึงข้อมูลสำเร็จ', {
                stats: { total: totalUsers, active: activeUsers, banned: bannedUsers },
                users: userList
            });

        } catch(error) {
            return Utils.response(false, error.message);
        }
    }

    function updateUserRole(token, targetUserId, newRole) {
        try {
            const session = AuthService.validateSession(token, [CONFIG.ROLES.ADMIN]);
            const sheet = SpreadsheetApp.getActive().getSheetByName('Users');
            
            const range = sheet.getRange(1, 1, sheet.getLastRow());
            const finder = range.createTextFinder(targetUserId).matchEntireCell(true).findNext();
            
            if(!finder) throw new Error('ไม่พบข้อมูลผู้ใช้');
            
            const row = finder.getRow();
            sheet.getRange(row, 5).setValue(newRole); // Role column
            
            Utils.logMessage('INFO', 'UPDATE_ROLE', `เปลี่ยนสิทธิ์ผู้ใช้ ${targetUserId} เป็น ${newRole}`, session.username);
            
            return Utils.response(true, 'เปลี่ยนสิทธิ์สำเร็จ');

        } catch(error) {
            return Utils.response(false, error.message);
        }
    }

    function toggleUserStatus(token, targetUserId, currentStatus) {
        try {
            const session = AuthService.validateSession(token, [CONFIG.ROLES.ADMIN]);
            const sheet = SpreadsheetApp.getActive().getSheetByName('Users');
            
            const range = sheet.getRange(1, 1, sheet.getLastRow());
            const finder = range.createTextFinder(targetUserId).matchEntireCell(true).findNext();
            
            if(!finder) throw new Error('ไม่พบข้อมูลผู้ใช้');
            
            const row = finder.getRow();
            const newStatus = currentStatus === 'Active' ? 'Banned' : 'Active';
            sheet.getRange(row, 6).setValue(newStatus); // Status column
            
            Utils.logMessage('INFO', 'TOGGLE_STATUS', `เปลี่ยนสถานะผู้ใช้ ${targetUserId} เป็น ${newStatus}`, session.username);
            
            return Utils.response(true, `อัปเดตสถานะเป็น ${newStatus}`);

        } catch(error) {
            return Utils.response(false, error.message);
        }
    }

    return {
        getAdminDashboardData,
        updateUserRole,
        toggleUserStatus
    };

})();
