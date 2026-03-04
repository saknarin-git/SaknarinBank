/**
 * 📂 PaymentRepository.gs
 * Data access layer for Payments. Handles appending transaction logs.
 */
const PaymentRepository = (() => {

    function getSheet() {
        return SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.PAYMENTS);
    }

    /**
     * Records a new payment transaction.
     * @param {object} txData data block
     */
    function insertPayment(txData) {
        const sheet = getSheet();
        // txId, timestamp, memberNo, contractNo, name, principal, interest, total, balanceAfter
        sheet.appendRow([
            txData.txId,
            txData.timestamp,
            txData.memberNo,
            txData.contractNo,
            txData.fullName,
            txData.principalPaid,
            txData.interestPaid,
            txData.totalPaid,
            txData.balanceAfter,
            txData.staffName || 'System',
            txData.note || ''
        ]);
    }

    /**
     * Retrieves recent transactions for rendering the POS recent log
     * @param {number} limit 
     * @returns {Array} Array of transaction objects
     */
    function getRecentTransactions(limit = CONFIG.MAX_RECENT_TX) {
        const sheet = getSheet();
        const lastRow = Math.max(sheet.getLastRow(), 1);
        
        if (lastRow < 2) return [];

        const startRow = Math.max(2, lastRow - limit + 1);
        const actRows = lastRow - startRow + 1;

        if(actRows <= 0) return [];

        const values = sheet.getRange(startRow, 1, actRows, 11).getValues();
        
        let txs = values.map(row => ({
            txId: row[0],
            time: Utils.formatDateTime(row[1]),
            memberNo: row[2],
            contractNo: row[3],
            name: row[4],
            principal: row[5],
            interest: row[6],
            total: row[7],
            balanceAfter: row[8],
            staff: row[9],
            note: row[10]
        }));

        // Reverse to show newest first
        return txs.reverse();
    }

    return { 
        getSheet,
        insertPayment,
        getRecentTransactions
    };

})();
