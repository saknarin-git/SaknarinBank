/**
 * 📂 PaymentService.gs
 * Business logic for processing payments. Uses LockService for atomic updates.
 */
const PaymentService = (() => {

    /**
     * Processes a payment transaction atomically.
     * @param {string} token 
     * @param {object} payload 
     * @returns {object} Success or failure response
     */
    function processPayment(token, payload) {
        // Validate session first outside the lock
        let session;
        try {
            session = AuthService.validateSession(token, [CONFIG.ROLES.STAFF, CONFIG.ROLES.ADMIN]);
        } catch (error) {
            return Utils.response(false, error.message);
        }

        const lock = LockService.getScriptLock();
        
        try {
            // Wait up to 30 seconds for concurrent processes to finish
            const lockAcquired = lock.waitLock(30000);
            if (!lockAcquired) {
                return Utils.response(false, 'ระบบกำลังประมวลผลธุรกรรมอื่น กรุณาลองใหม่ (System Busy)');
            }

            const { memberNo, contractNo, principalPaid = 0, interestPaid = 0, totalPaid = 0, note = '' } = payload;
            
            if (totalPaid <= 0 && principalPaid === 0 && interestPaid === 0) {
                throw new Error('ยอดชำระไม่ถูกต้อง');
            }

            // 1. Fetch current contract state inside the lock
            const contracts = ContractRepository.getContractsByMemberNo(memberNo);
            const contract = contracts.find(c => c.contractNo === contractNo);

            if (!contract) {
                throw new Error('ไม่พบข้อมูลสัญญา หรือ สัญญาถูกปิดไปแล้ว');
            }

            if (principalPaid > contract.balance) {
                throw new Error(`ชำระเงินต้น (${principalPaid}) เกินยอดยกมา (${contract.balance})`);
            }

            // 2. Calculate new balance
            const newBalance = contract.balance - principalPaid;

            // 3. Log the transaction
            const txId = Utils.generateUUID();
            const timestamp = formatDateTime(new Date());

            const txRecord = {
                txId,
                timestamp: new Date(),
                memberNo,
                contractNo,
                fullName: contract.fullName,
                principalPaid,
                interestPaid,
                totalPaid,
                balanceAfter: newBalance,
                staffName: session.username || 'Staff',
                note
            };

            PaymentRepository.insertPayment(txRecord);

            // 4. Update the contract balance
            ContractRepository.updateContractBalance(contract.rowIndex, newBalance);

            // 5. Construct Passbook receipt view
            const passbook = {
                date: timestamp,
                principal: principalPaid,
                interest: interestPaid,
                balance: newBalance,
                note: note || '-'
            };

            return Utils.response(true, 'บันทึกสำเร็จ', { passbook });

        } catch (error) {
            Utils.logMessage('ERROR', 'PROCESS_PAYMENT_FAIL', error.message, session.username);
            return Utils.response(false, error.message);
        } finally {
            // Always release lock
            lock.releaseLock();
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
            const txs = PaymentRepository.getRecentTransactions(CONFIG.MAX_RECENT_TX);
            return txs; // Return raw array to match existing UI expectation, or wrapped in response
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
