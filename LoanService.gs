/**
 * 📂 LoanService.gs
 * Domain Service for Staff loan member operations:
 *   - Add new loan member (member + contract)
 *   - Get next auto-increment IDs
 */
const LoanService = (() => {

    /**
     * Returns the next available member number and contract number.
     * @returns {object} Standardized response with { nextMemberNo, nextContractNo }
     */
    function getNextLoanInfo() {
        try {
            const ss = SpreadsheetApp.getActive();

            // --- Next Member Number ---
            const memberSheet = ss.getSheetByName(CONFIG.SHEETS.MEMBERS);
            let nextMemberNo = '1';
            if (memberSheet && memberSheet.getLastRow() >= 2) {
                const memberNos = memberSheet.getRange(2, 1, memberSheet.getLastRow() - 1, 1).getValues();
                let maxNo = 0;
                memberNos.forEach(row => {
                    const num = parseInt(row[0], 10);
                    if (!isNaN(num) && num > maxNo) maxNo = num;
                });
                nextMemberNo = String(maxNo + 1);
            }

            // --- Next Contract Number ---
            const contractSheet = ss.getSheetByName(CONFIG.SHEETS.CONTRACTS);
            let nextContractNo = 'CT-0001';
            if (contractSheet && contractSheet.getLastRow() >= 2) {
                const contractNos = contractSheet.getRange(2, 1, contractSheet.getLastRow() - 1, 1).getValues();
                let maxCT = 0;
                contractNos.forEach(row => {
                    const match = String(row[0]).match(/CT-(\d+)/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > maxCT) maxCT = num;
                    }
                });
                nextContractNo = 'CT-' + String(maxCT + 1).padStart(4, '0');
            }

            return Utils.response(true, 'ดึงข้อมูลสำเร็จ', { nextMemberNo, nextContractNo });

        } catch (err) {
            return Utils.response(false, err.message);
        }
    }

    /**
     * Adds a new loan member: creates a member row and a contract row.
     * @param {string} token - Auth token
     * @param {object} data - { memberNo, fullName, loanAmount, guarantor1, guarantor2 }
     * @returns {object} Standardized response
     */
    function addLoanMember(token, data) {
        try {
            const session = AuthService.validateSession(token, [CONFIG.ROLES.STAFF, CONFIG.ROLES.ADMIN]);

            const memberNo = String(data.memberNo || '').trim();
            const fullName = String(data.fullName || '').trim();
            const loanAmount = Number(data.loanAmount) || 0;
            const guarantor1 = String(data.guarantor1 || '').trim();
            const guarantor2 = String(data.guarantor2 || '').trim();

            // Validation
            if (!memberNo) return Utils.response(false, 'กรุณาระบุเลขสมาชิก');
            if (!fullName) return Utils.response(false, 'กรุณาระบุชื่อ-นามสกุล');
            if (loanAmount <= 0) return Utils.response(false, 'กรุณาระบุวงเงินกู้ที่มากกว่า 0');

            const ss = SpreadsheetApp.getActive();
            const lock = LockService.getDocumentLock();

            try {
                lock.waitLock(15000);

                // --- Insert Member ---
                const memberSheet = ss.getSheetByName(CONFIG.SHEETS.MEMBERS);
                if (!memberSheet) throw new Error('ไม่พบ Sheet สมาชิก');

                // Check duplicate member number
                if (memberSheet.getLastRow() >= 2) {
                    const existingNos = memberSheet.getRange(2, 1, memberSheet.getLastRow() - 1, 1).getValues();
                    for (let i = 0; i < existingNos.length; i++) {
                        if (String(existingNos[i][0]).trim() === memberNo) {
                            // Member already exists — only add a new contract
                            return _addContractOnly(ss, session, memberNo, fullName, loanAmount, guarantor1, guarantor2);
                        }
                    }
                }

                // New member: append row [memberNo, fullName]
                memberSheet.appendRow([memberNo, fullName]);

                // --- Insert Contract ---
                return _addContractOnly(ss, session, memberNo, fullName, loanAmount, guarantor1, guarantor2);

            } finally {
                lock.releaseLock();
            }

        } catch (err) {
            Utils.flushLogs();
            return Utils.response(false, err.message);
        }
    }

    /**
     * Internal: creates a new contract row for an existing member.
     */
    function _addContractOnly(ss, session, memberNo, fullName, loanAmount, guarantor1, guarantor2) {
        const contractSheet = ss.getSheetByName(CONFIG.SHEETS.CONTRACTS);
        if (!contractSheet) throw new Error('ไม่พบ Sheet สัญญา');

        // Generate next contract number
        let nextCT = 'CT-0001';
        if (contractSheet.getLastRow() >= 2) {
            const contractNos = contractSheet.getRange(2, 1, contractSheet.getLastRow() - 1, 1).getValues();
            let maxCT = 0;
            contractNos.forEach(row => {
                const match = String(row[0]).match(/CT-(\d+)/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxCT) maxCT = num;
                }
            });
            nextCT = 'CT-' + String(maxCT + 1).padStart(4, '0');
        }

        const dateNow = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');

        // Contract row: [contractNo, memberNo, fullName, loanAmount, balance, status, date, guarantor1, guarantor2]
        contractSheet.appendRow([
            nextCT,
            memberNo,
            fullName,
            loanAmount,
            loanAmount,    // balance = loanAmount (initial)
            'Active',
            dateNow,
            guarantor1,
            guarantor2
        ]);

        Utils.logMessage('INFO', 'ADD_LOAN_MEMBER', `เพิ่มสมาชิก ${memberNo} (${fullName}) สัญญา ${nextCT} วงเงิน ${loanAmount}`, session.username);
        Utils.flushLogs();

        return Utils.response(true, `บันทึกสำเร็จ! สัญญาเลขที่ ${nextCT}`, {
            contractNo: nextCT,
            memberNo: memberNo
        });
    }

    return {
        getNextLoanInfo,
        addLoanMember
    };

})();
