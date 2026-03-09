/**
 * 📂 PaymentService.gs
 * Business logic for processing payments. Uses Contract-Level LockService for atomic updates
 * and DatabaseEngine True Transactions.
 */
const PaymentService = (() => {

    /**
     * Sanitizes input to prevent spreadsheet formula injection.
     */
    function _sanitize(str) {
        if (!str) return '';
        const safeStr = String(str).trim();
        // Prevent formula injection
        if (safeStr.startsWith('=') || safeStr.startsWith('+') || safeStr.startsWith('-') || safeStr.startsWith('@')) {
            return "'" + safeStr;
        }
        return safeStr;
    }

    /**
     * Processes a payment transaction atomically.
     * @param {string} token 
     * @param {object} payload 
     * @returns {object} Success or failure response
     */
    function processPayment(token, payload) {
        let session;
        try {
            session = AuthService.validateSession(token, [CONFIG.ROLES.STAFF, CONFIG.ROLES.ADMIN]);
        } catch (error) {
            return Utils.response(false, error.message);
        }

        const { memberNo, contractNo, principalPaid = 0, interestPaid = 0, totalPaid = 0, note = '' } = payload;
        
        // Input sanitization
        const safeMemberNo = _sanitize(memberNo);
        const safeContractNo = _sanitize(contractNo);
        const safeNote = _sanitize(note);
        const safeStaff = _sanitize(session.username);

        // Pre-flight checks
        if (!safeMemberNo || !safeContractNo) {
            return Utils.response(false, 'ข้อมูลเลขสมาชิกหรือเลขสัญญาไม่ครบถ้วน');
        }

        // Validate payment totals (Req #4)
        const pTotal = Number(principalPaid) || 0;
        const pInterest = Number(interestPaid) || 0;
        const pSum = Number(totalPaid) || 0;
        
        if (pTotal + pInterest !== pSum) {
            return Utils.response(false, 'ยอดชำระรวมไม่ตรงกับผลรวมของเงินต้นและดอกเบี้ย');
        }

        if (pSum <= 0) {
            return Utils.response(false, 'ยอดชำระต้องมากกว่า 0');
        }

        // Contract-level locking (Req #2)
        // This allows multiple *different* contracts to be paid simultaneously, 
        // while blocking double-submissions on the *same* contract.
        const lock = LockService.getDocumentLock();
        
        try {
            // waitLock() throws on timeout, does NOT return boolean
            lock.waitLock(15000);

            // Init Memory Engine 
            DatabaseEngine.init();

            // Fetch contract state using optimized lookup (Req #13)
            const contract = DatabaseEngine.Query.getContractById(safeContractNo);

            if (!contract) {
                throw new Error('ไม่พบข้อมูลสัญญา หรือ สัญญาดึงข้อมูลล้มเหลว');
            }
            if (contract.memberNo !== safeMemberNo) {
                throw new Error('เลขสัญญาไม่ตรงกับรหัสสมาชิก');
            }
            if (contract.status === 'CLOSED') {
                throw new Error('สัญญานี้ถูกปิดไปแล้ว (ชำระครบแล้ว)');
            }

            // Prevent negative balances (Req #3)
            const newBalance = contract.balance - pTotal;
            if (newBalance < 0) {
                throw new Error(`ไม่อนุญาตให้ยอดคงเหลือติดลบ ชำระเงินต้น (${pTotal}) เกินยอดยกมา (${contract.balance})`);
            }

            // Auto-close contract (Req #5)
            const newStatus = newBalance === 0 ? 'CLOSED' : contract.status;

            // Log the transaction
            const txId = Utils.generateUUID();
            const timestamp = formatDateTime(new Date());

            const txRecord = {
                txId,
                timestamp: timestamp,
                memberNo: safeMemberNo,
                contractNo: safeContractNo,
                fullName: contract.fullName,
                principalPaid: pTotal,
                interestPaid: pInterest,
                totalPaid: pSum,
                balanceAfter: newBalance,
                staffName: safeStaff,
                note: safeNote
            };

            // Begin TRUE Transaction (Req #1)
            DatabaseEngine.beginTransaction();

            // 1. Update contract balance
            DatabaseEngine.queueContractBalanceUpdate(contract.rowIndex, safeContractNo, newBalance, newStatus);
            
            // 2. Insert payment history
            DatabaseEngine.queuePaymentInsert(txRecord);

            // 3. Commit to sheets
            DatabaseEngine.commit();

            // Audit Logging (Req #15)
            Utils.logMessage('INFO', 'PAYMENT_SUCCESS', `TxID: ${txId} ยอด: ${pSum} สัญญา: ${safeContractNo}`, safeStaff);

            // Construct receipt view
            const passbook = {
                date: timestamp,
                principal: pTotal,
                interest: pInterest,
                balance: newBalance,
                note: safeNote || '-'
            };

            return Utils.response(true, 'บันทึกสำเร็จ', { passbook });

        } catch (error) {
            // Rollback memory if write failed
            DatabaseEngine.rollback();
            
            Utils.logMessage('ERROR', 'PROCESS_PAYMENT_FAIL', error.message, session ? session.username : 'SYSTEM');
            return Utils.response(false, error.message);
        } finally {
            lock.releaseLock();
            Utils.flushLogs();
        }
    }

    /**
     * Retrieves recent transactions for the POS UI
     * @param {string} token 
     * @returns {Array} List of tx objects
     */
    function getRecentTransactions(token) {
        try {
            AuthService.validateSession(token, [CONFIG.ROLES.STAFF, CONFIG.ROLES.ADMIN]);
            DatabaseEngine.init();
            const txs = DatabaseEngine.Query.getRecentPayments(CONFIG.MAX_RECENT_TX || 20);
            return txs; 
        } catch (error) {
            return [];
        }
    }

    // Helper inside PaymentService to ensure exact date format "dd/MM/yyyy HH:mm:ss" bypassing Utils if needed, or use Utils
    function formatDateTime(date) {
        return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    }

    return { 
        processPayment,
        getRecentTransactions
    };

})();
