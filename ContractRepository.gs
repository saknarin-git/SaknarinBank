/**
 * 📂 ContractRepository.gs
 * High-Performance Data Access layer for Loan Contracts. 
 */
const ContractRepository = (() => {

    /**
     * Retrieves all contracts related to a specific member Number in O(1) Time
     * @param {string} memberNo 
     * @returns {Array} Array of contract objects
     */
    function getContractsByMemberNo(memberNo) {
        const contracts = DatabaseEngine.Query.getContractsByMemberNo(memberNo) || [];
        // Filter to active contracts only
        return contracts.filter(c => c.status !== 'Closed');
    }

    /**
     * Queues a contract balance update to the DatabaseEngine memory and write cache
     * @param {number} rowIndex 
     * @param {number} newBalance 
     */
    function updateContractBalance(rowIndex, newBalance) {
        // Find contract by rowIndex in Memory
        const contracts = DatabaseEngine.Query.getAllMembers().flatMap(m => DatabaseEngine.Query.getContractsByMemberNo(m.memberNo));
        const contract = contracts.find(c => c.rowIndex === rowIndex);
        
        let newStatus = null;
        if (newBalance <= 0) {
            newStatus = 'CLOSED';
        }

        if (contract) {
             DatabaseEngine.queueContractBalanceUpdate(rowIndex, contract.contractNo, newBalance, newStatus);
        }
    }

    return { 
        getContractsByMemberNo,
        updateContractBalance
    };

})();
