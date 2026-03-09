/**
 * 📂 CacheWrapper.gs
 * Wrapping GAS CacheService to handle JSON serialization and defaults cleanly.
 * This prevents quota issues and simplifies interactions.
 */
const CacheWrapper = (() => {

    function getScriptCache() {
        return CacheService.getScriptCache();
    }

    /**
     * Put a value into the cache. Objects are automatically stringified.
     * @param {string} key 
     * @param {any} value 
     * @param {number} ttlInSeconds 
     */
    function put(key, value, ttlInSeconds) {
        if (!ttlInSeconds) ttlInSeconds = CONFIG.CACHE_TTL_SEC;
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        // CacheService has a 100KB per-key limit. Skip silently if too large.
        if (stringValue.length > 100000) return;
        getScriptCache().put(key, stringValue, ttlInSeconds);
    }

    /**
     * Get a value from the cache. Automatically parses JSON if possible.
     * @param {string} key 
     * @returns {any} Returns the parsed object, string, or null if not found.
     */
    function get(key) {
        const val = getScriptCache().get(key);
        if (!val) return null;
        try {
            return JSON.parse(val);
        } catch (e) {
            return val; 
        }
    }

    /**
     * Remove a specific key from the cache.
     * @param {string} key 
     */
    function remove(key) {
        getScriptCache().remove(key);
    }

    return { put, get, remove };

})();
