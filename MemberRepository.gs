/**
 * 📂 MemberRepository.gs
 * Data access layer for Members. Avoids getDataRange() to reduce quota usage.
 */
const MemberRepository = (() => {

    function getSheet() {
        return SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.MEMBERS);
    }

    /**
     * Retrieves members with pagination and optional search query
     * @param {number} page 
     * @param {number} pageSize 
     * @param {string} query 
     * @returns {Array} Array of member objects
     */
    function getMemberPage(page = 1, pageSize = CONFIG.PAGE_SIZE, query = "") {
        const sheet = getSheet();
        const startRow = (page - 1) * pageSize + 2; // +2 for header offset
        const maxRows = sheet.getLastRow() - 1; // Exclude header
        
        // Prevent reading past data bounds
        if (startRow > maxRows + 1) return [];

        const actPageSize = Math.min(pageSize, maxRows - startRow + 2);
        if (actPageSize <= 0) return [];

        // id, memberNo, fullName, idCard, phone, status
        const values = sheet.getRange(startRow, 1, actPageSize, 6).getValues();

        let members = values.map((row, idx) => ({
            rowIndex: startRow + idx,
            id: row[0],
            memberNo: row[1],
            fullName: row[2],
            idCard: row[3],
            phone: row[4],
            status: row[5]
        })).filter(m => m.id); // Filter out empty rows

        if (query) {
            const q = query.toLowerCase();
            members = members.filter(m => 
                (m.fullName && m.fullName.toLowerCase().includes(q)) || 
                (m.memberNo && m.memberNo.toString().toLowerCase().includes(q))
            );
        }

        return members;
    }

    /**
     * Finds a member by memberNo
     * @param {string} memberNo 
     * @returns {object|null}
     */
    function findByMemberNo(memberNo) {
        const sheet = getSheet();
        // Assuming memberNo is column 2 (B)
        const finder = sheet.getRange('B:B').createTextFinder(memberNo).matchEntireCell(true).findNext();
        if (!finder) return null;
        
        const row = finder.getRow();
        if(row === 1) return null; // Header

        const rowData = sheet.getRange(row, 1, 1, 6).getValues()[0];
        return {
            rowIndex: row,
            id: rowData[0],
            memberNo: rowData[1],
            fullName: rowData[2],
            idCard: rowData[3],
            phone: rowData[4],
            status: rowData[5]
        };
    }

    return { 
        getSheet,
        getMemberPage,
        findByMemberNo
    };

})();
