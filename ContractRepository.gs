/**
 * 📂 ContractRepository.gs
 * Data access layer for Loan Contracts. 
 */
const ContractRepository = (() => {

    function getSheet() {
        return SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.CONTRACTS);
    }

    /**
     * Retrieves all contracts related to a specific member ID or Member Number
     * @param {string} memberNo 
     * @returns {Array} Array of contract objects
     */
    function getContractsByMemberNo(memberNo) {
        const sheet = getSheet();
        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return [];

        // To avoid getDataRange, we assume memberNo is column 2 (B)
        // Find all matching rows using textFinder or an optimized range pull
        const finder = sheet.getRange('B:B').createTextFinder(memberNo).matchEntireCell(true).findAll();
        
        if (!finder || finder.length === 0) return [];

        let contracts = [];
        for (let cell of finder) {
            const row = cell.getRow();
            if (row === 1) continue;

            const rowData = sheet.getRange(row, 1, 1, 15).getValues()[0];
            // Format: [id, memberNo, contractNo, fullName, loanAmount, balance, status, missedMonths...]
            contracts.push({
                rowIndex: row,
                id: rowData[0],
                memberNo: rowData[1],
                contractNo: rowData[2],
                fullName: rowData[3],
                loanAmount: Number(rowData[4]) || 0,
                balance: Number(rowData[5]) || 0,
                status: rowData[6],
                missedMonths: Number(rowData[7]) || 0,
            });
        }
        
        // Filter to active contracts only
        return contracts.filter(c => c.status !== 'Closed');
    }

    /**
     * Updates the balance of a specific contract
     * @param {number} rowIndex 
     * @param {number} newBalance 
     */
    function updateContractBalance(rowIndex, newBalance) {
        const sheet = getSheet();
        // Assuming balance is in column 6 (F)
        sheet.getRange(rowIndex, 6).setValue(newBalance);
        // If balance hits 0, auto close
        if (newBalance <= 0) {
            sheet.getRange(rowIndex, 7).setValue('Closed'); // Status column (G)
        }
    }

    return { 
        getSheet,
        getContractsByMemberNo,
        updateContractBalance
    };

})();
