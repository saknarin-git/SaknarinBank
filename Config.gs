/**
 * 📂 Config.gs
 * Centralized configuration for the Enterprise Architecture.
 */
const CONFIG = {
    APP_NAME: 'Loan Enterprise',
    SESSION_TTL_MINUTES: 30,     // 30 minutes TTL for active sessions
    OTP_TTL_MINUTES: 15,         // 15 minutes TTL for OTP lockout
    PAGE_SIZE: 100,              // Default pagination size
    MAX_RECENT_TX: 20,           // Number of recent transactions to display
    CACHE_TTL_SEC: 300,          // 5 minutes generic cache TTL
    MAX_OTP_ATTEMPTS: 5,         // Max failed OTP attempts before lockout
    
    SECURITY: {
        PEPPER: "SAKNARIN_BANK_SUPER_SECRET_PEPPER_2026"
    },

    ROLES: {
        ADMIN: 'ADMIN',
        STAFF: 'STAFF',
        MEMBER: 'MEMBER'
    },

    SHEETS: {
        MEMBERS: 'สมาชิก',
        CONTRACTS: 'สัญญา',
        PAYMENTS: 'ชำระเงิน',
        LOGS: 'Logs',
        AUTH: 'Users'             // Using "Users" according to old code references
    }
};
