/**
 * 📂 Utils.gs
 * Shared utility functions used across all layers.
 */
const Utils = (() => {

    // In-memory log buffer for batch writing (Fix #9)
    const _logBuffer = [];

    /**
     * Generates a v4 compliant UUID using Utilities
     * @returns {string} UUID
     */
    function generateUUID() {
        return Utilities.getUuid();
    }

    /**
     * Formats a Date object to "DD/MM/YYYY HH:mm:ss" in Thai timezone
     * @param {Date} date 
     * @returns {string} Formatted string
     */
    function formatDateTime(date) {
        if (!date) return "";
        return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    }

    /**
     * Standardized JSON response generator for API endpoints
     * @param {boolean} success 
     * @param {string} message 
     * @param {object} data 
     * @param {string} errorCode 
     * @returns {object} Standardized response object
     */
    function response(success, message, data = null, errorCode = null) {
        return { success, message, data, errorCode };
    }

    /**
     * Creates a standardized text output for doPost/doGet
     * @param {object} obj 
     * @returns {GoogleAppsScript.Content.TextOutput}
     */
    function jsonOutput(obj) {
        return ContentService
            .createTextOutput(JSON.stringify(obj))
            .setMimeType(ContentService.MimeType.JSON);
    }

    /**
     * Buffers a log entry in memory instead of writing immediately.
     * Call flushLogs() at the end of a request to batch-write all logs.
     * @param {string} level 'INFO', 'WARN', 'ERROR'
     * @param {string} action 
     * @param {string} details 
     * @param {string} user 
     */
    function logMessage(level, action, details, user = 'SYSTEM') {
        try {
            const isPayment = action === 'PAYMENT_SUCCESS';
            let contractNo = '-';
            let amount = '-';

            if (isPayment) {
                const amtMatch = details.match(/ยอด:\s([\d.]+)/);
                const ctMatch = details.match(/สัญญา:\s([^\s]+)/);
                if (amtMatch) amount = amtMatch[1];
                if (ctMatch) contractNo = ctMatch[1];
            }

            _logBuffer.push([
                formatDateTime(new Date()),
                level,
                action,
                user,
                contractNo,
                amount,
                details
            ]);
        } catch (e) {
            // Failsafe: swallow to prevent cascading errors
        }
    }

    /**
     * Flushes all buffered log entries to the Logs sheet via batch setValues.
     * Should be called once at the end of each API request.
     */
    function flushLogs() {
        try {
            if (_logBuffer.length === 0) return;
            const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.LOGS);
            if (!sheet) return;
            const startRow = Math.max(sheet.getLastRow() + 1, 2);
            sheet.getRange(startRow, 1, _logBuffer.length, 7).setValues(_logBuffer);
            _logBuffer.length = 0; // Clear buffer
        } catch (e) {
            // Failsafe
        }
    }

    return { 
        generateUUID, 
        formatDateTime, 
        response, 
        jsonOutput, 
        logMessage,
        flushLogs
    };

})();
