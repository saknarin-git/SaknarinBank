/**
 * 📂 PaymentRepository.gs
 * Fast In-Memory access layer for Payments. Pushes to write queue.
 */
const PaymentRepository = (() => {

    /**
     * Queues a new payment transaction to DatabaseEngine.
     * @param {object} txData data block
     */
    function insertPayment(txData) {
        // Hand off to batch Write Queue
        DatabaseEngine.queuePaymentInsert(txData);
    }

    /**
     * Retrieves recent transactions for rendering the POS recent log
     * @param {number} limit 
     * @returns {Array} Array of transaction objects (Newest first)
     */
    function getRecentTransactions(limit = CONFIG.MAX_RECENT_TX) {
        // Read directly from High-Speed Memory
        let txs = DatabaseEngine.Query.getRecentPayments(limit) || [];

        // Format dates if needed (since DatabaseEngine stores them loosely as read from Sheet)
        // Ensure returning data matches expected API structure
        return txs.map(tx => {
            return {
                ...tx,
                time: Utils.formatDateTime(tx.timestamp)
            };
        });
    }

    return { 
        insertPayment,
        getRecentTransactions
    };

})();
