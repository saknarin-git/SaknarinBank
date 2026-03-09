/**
 * 📂 MemberRepository.gs
 * Fast In-Memory Data Access Layer for Members.
 */
const MemberRepository = (() => {

    /**
     * Retrieves members with pagination and optional search query using Memory Queries
     * @param {number} page 
     * @param {number} pageSize 
     * @param {string} query 
     * @returns {Array} Array of member objects
     */
    function getMemberPage(page = 1, pageSize = CONFIG.PAGE_SIZE, query = "") {
        let members = DatabaseEngine.Query.getAllMembers() || [];

        if (query) {
            const q = query.toLowerCase();
            members = members.filter(m => 
                (m.fullName && m.fullName.toLowerCase().includes(q)) || 
                (m.memberNo && m.memberNo.toLowerCase().includes(q))
            );
        }

        const startIndex = (page - 1) * pageSize;
        return members.slice(startIndex, startIndex + pageSize);
    }

    /**
     * Finds a member by memberNo in O(1) time
     * @param {string} memberNo 
     * @returns {object|null}
     */
    function findByMemberNo(memberNo) {
        return DatabaseEngine.Query.getMemberByNo(memberNo);
    }

    return { 
        getMemberPage,
        findByMemberNo
    };

})();
