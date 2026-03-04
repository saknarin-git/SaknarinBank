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
     * Hashes a password using HMAC-SHA256 with a generic pepper, or user-specific salt.
     * @param {string} password 
     * @param {string} salt 
     * @returns {string} base64 encoded hash
     */
    function hashPassword(password, salt = 'enterprise_default_salt') {
        const signature = Utilities.computeHmacSignature(
            Utilities.MacAlgorithm.HMAC_SHA_256,
            password,
            salt
        );
        return Utilities.base64Encode(signature);
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

    /**
     * Validates a session token and optionally checks against required roles.
     * @param {string} token 
     * @param {string|string[]} requiredRoles 
     * @returns {object} The validated session object
     * @throws Error if token is invalid or role lacks permission
     */
    function validateSession(token, requiredRoles = null) {
        if (!token) throw new Error('ไม่พบข้อมูล Token การเข้าสู่ระบบ');

        const session = CacheWrapper.get(token);
        if (!session) throw new Error('Session Expired หรือ ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');

        // Refresh TTL on active use
        CacheWrapper.put(token, session, CONFIG.SESSION_TTL_MINUTES * 60);

        // RBAC Check
        if (requiredRoles) {
            const rolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
            if (!rolesArray.includes(session.role)) {
                Utils.logMessage('WARN', 'UNAUTHORIZED_ACCESS', `User ${session.username} attempted access`, session.username);
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
        createSession, 
        validateSession, 
        destroySession 
    };

})();
