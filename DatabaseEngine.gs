/**
 * 📂 DatabaseEngine.gs
 * High-Performance In-Memory Database Architecture.
 * Loads all required data into global memory once per execution.
 * Provides O(1) indexed lookups and a batch WriteQueue to minimize Spreadsheet API calls.
 */
const DatabaseEngine = (() => {

    // -------------------------------------------------------------
    // IN-MEMORY STORAGE
    // -------------------------------------------------------------
    const storage = {
        members: [],    
        contracts: [],  
        payments: []    
    };

    // -------------------------------------------------------------
    // O(1) INDEXES
    // -------------------------------------------------------------
    const index = {
        membersByNo: {},        
        contractsById: {},      
        contractsByMemberNo: {},
        usersByUsername: {}      // O(1) login lookup index
    };

    // -------------------------------------------------------------
    // TRANSACTION QUEUE
    // -------------------------------------------------------------
    let writeQueue = {
        contractUpdates: {}, // rowIndex -> { colIndex: newValue, ... }
        paymentInserts: []   // Array of arrays
    };
    
    // Backup state for rollback
    let snapshot = null;
    let _inTransaction = false;
    let isInitialized = false;

    /**
     * Reads a full sheet range efficiently (bypasses getDataRange())
     */
    function _fastRead(sheetName, numCols) {
        const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
        if (!sheet) throw new Error(`Sheet ${sheetName} not found.`);
        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return null; 
        return sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    }

    function init() {
        if (isInitialized) return;

        // 1. Load Members
        const memberData = _fastRead(CONFIG.SHEETS.MEMBERS, 6);
        if (memberData) {
            memberData.forEach((row, idx) => {
                const memberNo = String(row[1]);
                if (!memberNo || memberNo === 'undefined') return;

                const m = {
                    rowIndex: idx + 2,
                    id: row[0],
                    memberNo: memberNo,
                    fullName: row[2],
                    idCard: row[3],
                    phone: String(row[4]),
                    status: row[5]
                };
                storage.members.push(m);
                index.membersByNo[m.memberNo] = m;
            });
        }

        // 2. Load Contracts 
        const contractData = _fastRead(CONFIG.SHEETS.CONTRACTS, 15);
        if (contractData) {
            contractData.forEach((row, idx) => {
                const contractNo = String(row[2]);
                const memberNo = String(row[1]);
                if (!contractNo || contractNo === 'undefined' || !memberNo || memberNo === 'undefined') return;

                const c = {
                    rowIndex: idx + 2,
                    id: row[0],
                    memberNo: memberNo,
                    contractNo: contractNo,
                    fullName: row[3],
                    loanAmount: Number(row[4]) || 0,
                    balance: Number(row[5]) || 0,
                    status: row[6],
                    missedMonths: Number(row[7]) || 0
                };
                
                storage.contracts.push(c);
                index.contractsById[c.contractNo] = c;
                
                if (!index.contractsByMemberNo[memberNo]) {
                    index.contractsByMemberNo[memberNo] = [];
                }
                index.contractsByMemberNo[memberNo].push(c);
            });
        }

        // 3. Load Payments (Capped at 500)
        const pxSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.PAYMENTS);
        if (pxSheet) {
            const pLastRow = pxSheet.getLastRow();
            if (pLastRow >= 2) {
                const fetchSize = Math.min(500, pLastRow - 1); // Memory limit protection
                const startRow = pLastRow - fetchSize + 1;
                const pxData = pxSheet.getRange(startRow, 1, fetchSize, 11).getValues();
                
                pxData.forEach((row, idx) => {
                    if (!row[0]) return;
                    storage.payments.push({
                        rowIndex: startRow + idx,
                        txId: row[0],
                        timestamp: row[1],
                        memberNo: String(row[2]),
                        contractNo: String(row[3]),
                        fullName: row[4],
                        principal: Number(row[5]) || 0,
                        interest: Number(row[6]) || 0,
                        total: Number(row[7]) || 0,
                        balanceAfter: Number(row[8]) || 0,
                        staff: row[9],
                        note: row[10]
                    });
                });
            }
        }

        isInitialized = true;
    }

    // -------------------------------------------------------------
    // TRUE TRANSACTIONS
    // -------------------------------------------------------------
    
    function beginTransaction() {
        if (_inTransaction) throw new Error("Transaction already in progress");
        _inTransaction = true;
        // Deep clone memory state for rollback
        snapshot = JSON.stringify({ storage, index, writeQueue });
    }

    function rollback() {
        if (!_inTransaction) return;
        if (snapshot) {
            const dumped = JSON.parse(snapshot);
            storage.members = dumped.storage.members;
            storage.contracts = dumped.storage.contracts;
            storage.payments = dumped.storage.payments;
            index.membersByNo = dumped.index.membersByNo;
            index.contractsById = dumped.index.contractsById;
            index.contractsByMemberNo = dumped.index.contractsByMemberNo;
            writeQueue = dumped.writeQueue;
        }
        _inTransaction = false;
        snapshot = null;
    }

    function commit() {
        if (!_inTransaction) throw new Error("No transaction to commit");
        try {
            flush(); // Execute sheets API updates
            _inTransaction = false;
            snapshot = null;
        } catch(e) {
            rollback();
            throw e;
        }
    }


    /**
     * Pushes a contract balance update to the Write Queue.
     */
    function queueContractBalanceUpdate(rowIndex, contractNo, newBalance, newStatus) {
        if (!_inTransaction) throw new Error("queueContractBalanceUpdate requires an active transaction");

        const c = index.contractsById[contractNo];
        if (c) {
            c.balance = newBalance;
            if (newStatus) c.status = newStatus;
        }

        if (!writeQueue.contractUpdates[rowIndex]) {
            writeQueue.contractUpdates[rowIndex] = {};
        }
        
        writeQueue.contractUpdates[rowIndex][6] = newBalance; // Col 6 (F) is Balance
        if (newStatus) {
            writeQueue.contractUpdates[rowIndex][7] = newStatus; // Col 7 (G) is Status
        }
    }

    /**
     * Pushes a new payment to the Write Queue.
     */
    function queuePaymentInsert(txRecord) {
        if (!_inTransaction) throw new Error("queuePaymentInsert requires an active transaction");

        storage.payments.push({
            txId: txRecord.txId,
            timestamp: txRecord.timestamp,
            memberNo: String(txRecord.memberNo),
            contractNo: String(txRecord.contractNo),
            fullName: txRecord.fullName,
            principal: txRecord.principalPaid,
            interest: txRecord.interestPaid,
            total: txRecord.totalPaid,
            balanceAfter: txRecord.balanceAfter,
            staff: txRecord.staffName || 'System',
            note: txRecord.note || ''
        });

        // Memory Cap 500
        if (storage.payments.length > 500) {
            storage.payments.shift(); 
        }

        writeQueue.paymentInserts.push([
            txRecord.txId,
            txRecord.timestamp,
            txRecord.memberNo,
            txRecord.contractNo,
            txRecord.fullName,
            txRecord.principalPaid,
            txRecord.interestPaid,
            txRecord.totalPaid,
            txRecord.balanceAfter,
            txRecord.staffName || 'System',
            txRecord.note || ''
        ]);
    }

    /**
     * Internal: Executes sheet API calls
     */
    function flush() {
        // Contract Updates
        const contractRowsToUpdate = Object.keys(writeQueue.contractUpdates);
        if (contractRowsToUpdate.length > 0) {
            const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.CONTRACTS);
            contractRowsToUpdate.forEach(rIndex => {
                const rowObj = writeQueue.contractUpdates[rIndex];
                if (rowObj[6] !== undefined) sheet.getRange(rIndex, 6).setValue(rowObj[6]);
                if (rowObj[7] !== undefined) sheet.getRange(rIndex, 7).setValue(rowObj[7]);
            });
            writeQueue.contractUpdates = {}; 
        }

        // Batch Append via setValues
        if (writeQueue.paymentInserts.length > 0) {
            const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.PAYMENTS);
            const appendRowIndex = Math.max(sheet.getLastRow() + 1, 2);
            sheet.getRange(appendRowIndex, 1, writeQueue.paymentInserts.length, 11).setValues(writeQueue.paymentInserts);
            writeQueue.paymentInserts = []; 
        }
    }

    // -------------------------------------------------------------
    // QUERY ENGINE
    // -------------------------------------------------------------
    const Query = {
        getMemberByNo: (memberNo) => index.membersByNo[String(memberNo)] || null,
        getAllMembers: () => storage.members || [],
        getContractsByMemberNo: (memberNo) => index.contractsByMemberNo[String(memberNo)] || [],
        getContractById: (contractNo) => index.contractsById[String(contractNo)] || null,
        getRecentPayments: (limit = 20) => (storage.payments || []).slice(-limit).reverse(),
        getUserByUsername: (username) => index.usersByUsername[String(username)] || null
    };

    /**
     * Builds the usersByUsername index from the Auth sheet.
     * Called once during login to enable O(1) lookup.
     */
    function buildUserIndex(userData) {
        if (!userData) return;
        userData.forEach(row => {
            const uname = String(row[1]);
            if (uname && uname !== 'undefined') {
                index.usersByUsername[uname] = row;
            }
        });
    }

    /**
     * Public flush method for callers that do NOT use the transaction API.
     * Flushes the write queue to sheets and clears the queue.
     */
    function flushWriteQueue() {
        flush();
    }

    return {
        init,
        beginTransaction,
        commit,
        rollback,
        flushWriteQueue,
        buildUserIndex,
        queueContractBalanceUpdate,
        queuePaymentInsert,
        Query
    };

})();
