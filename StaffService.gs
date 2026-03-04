/**
 * 📂 StaffService.gs
 * Business logic for Staff operations, including Member search and directory.
 */
const StaffService = (() => {

    /**
     * Retrieves a page of members for the Staff Directory.
     * @param {string} token 
     * @param {number} page 
     * @param {number} pageSize 
     * @param {string} query 
     * @returns {object} Response object 
     */
    function getStaffMemberDirectoryPage(token, page, pageSize, query) {
        try {
            // Require STAFF or ADMIN role
            AuthService.validateSession(token, [CONFIG.ROLES.STAFF, CONFIG.ROLES.ADMIN]);
            
            const membersList = MemberRepository.getMemberPage(page, pageSize, query);
            
            // Enrich with balances from ContractRepository
            const enrichedMembers = membersList.map(m => {
                const contracts = ContractRepository.getContractsByMemberNo(m.memberNo);
                const totalBalance = contracts.reduce((sum, c) => sum + (Number(c.balance) || 0), 0);
                const loanAmount = contracts.reduce((sum, c) => sum + (Number(c.loanAmount) || 0), 0);
                const activeContract = contracts.length > 0 ? contracts[0].contractNo : '-';

                return {
                    ...m,
                    contractNo: activeContract,
                    loanAmount: loanAmount,
                    balance: totalBalance
                };
            });

            return Utils.response(true, 'ดึงข้อมูลสำเร็จ', { members: enrichedMembers });
            
        } catch (error) {
            return Utils.response(false, error.message);
        }
    }

    /**
     * Searches for a member and their active contracts for the POS Payment flow.
     * @param {string} token 
     * @param {string} memberNo 
     * @returns {object} Response object
     */
    function searchMemberForPayment(token, memberNo) {
        try {
            AuthService.validateSession(token, [CONFIG.ROLES.STAFF, CONFIG.ROLES.ADMIN]);

            if (!memberNo) throw new Error('กรุณาระบุเลขสมาชิก');

            const contracts = ContractRepository.getContractsByMemberNo(memberNo);
            
            if (contracts.length === 0) {
                return Utils.response(false, 'ไม่พบสัญญาที่ยังเปิดอยู่สำหรับสมาชิกนี้');
            }

            return Utils.response(true, 'พบข้อมูล', { contracts });

        } catch (error) {
            return Utils.response(false, error.message);
        }
    }

    return { 
        getStaffMemberDirectoryPage,
        searchMemberForPayment
    };

})();
