/**
 * 📂 Utils.gs
 * Shared utility functions used across all layers.
 */
const Utils = (() => {

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
     * @returns {object} Standardized response object
     */
    function response(success, message, data = {}) {
        return { success, message, ...data };
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
     * Standardized logging function (can be extended to write to Sheet)
     * @param {string} level 'INFO', 'WARN', 'ERROR'
     * @param {string} action 
     * @param {string} details 
     * @param {string} user 
     */
    function logMessage(level, action, details, user = 'SYSTEM') {
        const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.LOGS);
        if (sheet) {
            // Write to Logs sheet
            sheet.appendRow([
                new Date(),
                level,
                action,
                user,
                details
            ]);
        }
    }

    return { 
        generateUUID, 
        formatDateTime, 
        response, 
        jsonOutput, 
        logMessage 
    };

})();
