/**
 * 📂 AuthService.gs
 * Handles authentication, token generation, and RBAC (Role-Based Access Control).
 */
const AuthService = (() => {

    /**
     * Generates a new secure token for a session.
     * @returns {string} token
     */
    function generateToken() {
        return Utils.generateUUID();
    }

    /**
     * Hashes a password using robust SHA-256 with unique salt and global pepper.
     * @param {string} password 
     * @param {string} salt 
     * @returns {string} hex encoded hash
     */
    function hashPassword(password, salt) {
        if (!salt) throw new Error('Security Salt is required for hashing');
        const rawString = password + salt + CONFIG.SECURITY.PEPPER;
        const signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, rawString, Utilities.Charset.UTF_8);
        return signature.map(byte => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0')).join('');
    }

    /**
     * Enforces rate limiting on login attempts to prevent brute force attacks.
     * Allows MAX_LOGIN_ATTEMPTS per 15 minutes.
     * @param {string} username 
     * @throws Error if rate limit exceeded
     */
    function checkRateLimit(username) {
        const limitKey = `LOGIN_ATTEMPTS_${username}`;
        const attempts = Number(CacheWrapper.get(limitKey)) || 0;
        
        if (attempts >= 5) { // MAX_LOGIN_ATTEMPTS = 5
            throw new Error('กรุณารอ 15 นาที ก่อนลองเข้าสู่ระบบอีกครั้ง (Too many attempts)');
        }
        
        // Increment and lock for 15 minutes
        CacheWrapper.put(limitKey, attempts + 1, 15 * 60); 
    }

    /**
     * Clears the rate limit upon successful login.
     * @param {string} username 
     */
    function clearRateLimit(username) {
        CacheWrapper.remove(`LOGIN_ATTEMPTS_${username}`);
    }

    /**
     * Creates a session and stores it in the Cache
     * @param {object} user 
     * @returns {string} The generated session token
     */
    function createSession(user) {
        const token = generateToken();
        const session = {
            id: user.id,
            username: user.username,
            role: user.role,
            created: Date.now()
        };
        // TTL in seconds
        CacheWrapper.put(token, session, CONFIG.SESSION_TTL_MINUTES * 60);
        return token;
    }

    function validateSession(token, requiredRoles = null) {
        if (!token) throw new Error('ไม่พบข้อมูล Token การเข้าสู่ระบบ');

        const session = CacheWrapper.get(token);
        if (!session) throw new Error('Session Expired หรือ ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');

        // Check Live Status / Role (Cache-Aside Pattern)
        const cacheKeyStatus = 'status_' + session.id;
        const cacheKeyRole = 'role_' + session.id;
        let liveStatus = CacheWrapper.get(cacheKeyStatus);
        let liveRole = CacheWrapper.get(cacheKeyRole);

        if (!liveStatus || !liveRole) {
            const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.AUTH);
            if (!sheet) throw new Error('System Configuration Error: Auth table missing');
            
            const lastRow = Math.max(sheet.getLastRow(), 2);
            // Search robustly via in-memory array instead of TextFinder for reliability
            const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
            let found = false;
            
            for (let i = 0; i < data.length; i++) {
                if (String(data[i][0]) === String(session.id) || String(data[i][1]) === String(session.username)) {
                    liveRole = data[i][4];
                    liveStatus = data[i][5];
                    found = true;
                    break;
                }
            }

            if (!found) throw new Error('ไม่พบข้อมูลผู้ใช้ในระบบ');
            
            CacheWrapper.put(cacheKeyStatus, liveStatus, 21600); // 6 hours
            CacheWrapper.put(cacheKeyRole, liveRole, 21600);
        }

        if (liveStatus !== 'Active') {
            destroySession(token);
            throw new Error('บัญชีของคุณถูกระงับการใช้งาน');
        }

        // Inherit Live Role to prevent stale token bypass
        session.role = liveRole;

        // Refresh TTL on active use
        CacheWrapper.put(token, session, CONFIG.SESSION_TTL_MINUTES * 60);

        // RBAC Check
        if (requiredRoles) {
            const rolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
            if (!rolesArray.includes(session.role)) {
                Utils.logMessage('WARN', 'UNAUTHORIZED_ACCESS', `User ${session.username} attempted access with Role ${session.role}`, session.username);
                throw new Error('ไม่อนุญาตให้ใช้งาน (Unauthorized)');
            }
        }

        return session;
    }

    /**
     * Logs out a user by removing their token from cache.
     * @param {string} token 
     */
    function destroySession(token) {
        if (token) CacheWrapper.remove(token);
    }

    return { 
        generateToken, 
        hashPassword, 
        checkRateLimit,
        clearRateLimit,
        createSession, 
        validateSession, 
        destroySession 
    };

})();
