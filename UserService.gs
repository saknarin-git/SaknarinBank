/**
 * 📂 UserService.gs
 * Domain Service for user account operations:
 *   - Registration
 *   - OTP generation & email sending
 *   - Password reset via OTP
 *   - Email update
 *   - Password change
 */
const UserService = (() => {

    // -------------------------------------------------------------------
    // 1. REGISTER USER
    // -------------------------------------------------------------------
    /**
     * Creates a new user account with role MEMBER.
     * @param {string} username
     * @param {string} password
     * @param {string} email
     * @returns {object} Standardized response
     */
    function registerUser(username, password, email) {
        try {
            const safeUsername = String(username).trim();
            const safeEmail = String(email).trim().toLowerCase();
            const safePassword = String(password);

            // Validation
            if (!safeUsername) return Utils.response(false, 'กรุณาระบุ Username');
            if (!safeEmail) return Utils.response(false, 'กรุณาระบุอีเมล');
            if (safePassword.length < 4) return Utils.response(false, 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');

            const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.AUTH);
            if (!sheet) throw new Error('ไม่พบฐานข้อมูลผู้ใช้งาน');

            const lastRow = sheet.getLastRow();

            // Check for duplicate username / email
            if (lastRow >= 2) {
                const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
                for (let i = 0; i < data.length; i++) {
                    if (String(data[i][1]).trim().toLowerCase() === safeUsername.toLowerCase()) {
                        return Utils.response(false, 'Username นี้ถูกใช้งานแล้ว');
                    }
                    if (String(data[i][3]).trim().toLowerCase() === safeEmail) {
                        return Utils.response(false, 'อีเมลนี้ถูกใช้งานแล้ว');
                    }
                }
            }

            // Generate unique ID & hash password
            const userId = Utils.generateUUID();
            const salt = Utils.generateUUID().replace(/-/g, '').substring(0, 16);
            const hash = AuthService.hashPassword(safePassword, salt);
            const storedHash = hash + ':' + salt;

            // Append new user row: [ID, Username, Hash, Email, Role, Status]
            sheet.appendRow([userId, safeUsername, storedHash, safeEmail, 'MEMBER', 'Active']);

            Utils.logMessage('INFO', 'REGISTER', `สมัครสมาชิกใหม่: ${safeUsername}`, safeUsername);
            Utils.flushLogs();

            return Utils.response(true, 'สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ');

        } catch (err) {
            Utils.flushLogs();
            return Utils.response(false, err.message);
        }
    }

    // -------------------------------------------------------------------
    // 2. GENERATE & SEND OTP
    // -------------------------------------------------------------------
    /**
     * Generates a 6-digit OTP, stores it in cache, and emails it.
     * @param {string} email
     * @returns {object} Standardized response
     */
    function generateAndSendOTP(email) {
        try {
            const safeEmail = String(email).trim().toLowerCase();
            if (!safeEmail) return Utils.response(false, 'กรุณาระบุอีเมล');

            // Rate-limiting on OTP requests (1 request per 2 minutes per email)
            const rateLimitKey = `OTP_RATE_${safeEmail}`;
            const recentRequest = CacheWrapper.get(rateLimitKey);
            if (recentRequest) {
                return Utils.response(false, 'กรุณารอ 2 นาที ก่อนขอ OTP อีกครั้ง');
            }

            // Find user by email
            const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.AUTH);
            if (!sheet) throw new Error('ไม่พบฐานข้อมูลผู้ใช้งาน');

            const lastRow = sheet.getLastRow();
            if (lastRow < 2) return Utils.response(false, 'ไม่พบอีเมลนี้ในระบบ');

            const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
            let foundUser = null;

            for (let i = 0; i < data.length; i++) {
                if (String(data[i][3]).trim().toLowerCase() === safeEmail) {
                    foundUser = { row: i + 2, username: data[i][1] };
                    break;
                }
            }

            if (!foundUser) return Utils.response(false, 'ไม่พบอีเมลนี้ในระบบ');

            // Generate 6-digit OTP
            const otp = String(Math.floor(100000 + Math.random() * 900000));

            // Store OTP in cache (expires in 15 minutes)
            const otpData = { otp: otp, email: safeEmail, row: foundUser.row };
            CacheWrapper.put(`OTP_${safeEmail}`, otpData, CONFIG.OTP_TTL_MINUTES * 60);

            // Set rate limit (2 minutes)
            CacheWrapper.put(rateLimitKey, 'true', 120);

            // Send email
            MailApp.sendEmail({
                to: safeEmail,
                subject: `[Saknarin Bank] รหัส OTP สำหรับรีเซ็ตรหัสผ่าน`,
                htmlBody: `
                    <div style="font-family: 'Prompt', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
                        <div style="background: linear-gradient(135deg, #1e3a8a, #3b82f6); padding: 20px; border-radius: 12px 12px 0 0; text-align: center; color: white;">
                            <h2 style="margin: 0;">🏦 Saknarin Bank</h2>
                            <p style="margin: 5px 0 0; opacity: 0.9;">รหัส OTP สำหรับรีเซ็ตรหัสผ่าน</p>
                        </div>
                        <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
                            <p>สวัสดีคุณ <strong>${foundUser.username}</strong>,</p>
                            <p>รหัส OTP ของคุณคือ:</p>
                            <div style="text-align: center; margin: 20px 0;">
                                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #eff6ff; border: 2px solid #3b82f6; padding: 12px 24px; border-radius: 8px; color: #1e3a8a;">${otp}</span>
                            </div>
                            <p style="color: #6b7280; font-size: 14px;">⏰ รหัสนี้จะหมดอายุภายใน ${CONFIG.OTP_TTL_MINUTES} นาที</p>
                            <p style="color: #ef4444; font-size: 13px;">⚠️ หากคุณไม่ได้ร้องขอ กรุณาเพิกเฉยอีเมลนี้</p>
                        </div>
                    </div>
                `
            });

            Utils.logMessage('INFO', 'OTP_SENT', `ส่ง OTP ไปยัง ${safeEmail}`, foundUser.username);
            Utils.flushLogs();

            return Utils.response(true, 'ส่งรหัส OTP ไปยังอีเมลของคุณแล้ว');

        } catch (err) {
            Utils.flushLogs();
            return Utils.response(false, err.message);
        }
    }

    // -------------------------------------------------------------------
    // 3. VERIFY OTP & RESET PASSWORD
    // -------------------------------------------------------------------
    /**
     * Validates the OTP and sets a new password.
     * @param {string} email
     * @param {string} otp
     * @param {string} newPassword
     * @returns {object} Standardized response
     */
    function verifyOTPAndResetPassword(email, otp, newPassword) {
        try {
            const safeEmail = String(email).trim().toLowerCase();
            const safeOTP = String(otp).trim();
            const safeNewPass = String(newPassword);

            if (!safeEmail || !safeOTP) return Utils.response(false, 'ข้อมูลไม่ครบถ้วน');
            if (safeNewPass.length < 4) return Utils.response(false, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');

            // Retrieve OTP from cache
            const otpData = CacheWrapper.get(`OTP_${safeEmail}`);
            if (!otpData) return Utils.response(false, 'รหัส OTP หมดอายุหรือไม่ถูกต้อง กรุณาขอ OTP ใหม่');

            // Check attempt limiting
            const attemptKey = `OTP_ATTEMPTS_${safeEmail}`;
            const attempts = Number(CacheWrapper.get(attemptKey)) || 0;
            if (attempts >= CONFIG.MAX_OTP_ATTEMPTS) {
                CacheWrapper.remove(`OTP_${safeEmail}`);
                return Utils.response(false, 'ลองผิดเกินจำนวนครั้งที่กำหนด กรุณาขอ OTP ใหม่');
            }

            // Verify OTP
            if (otpData.otp !== safeOTP) {
                CacheWrapper.put(attemptKey, attempts + 1, CONFIG.OTP_TTL_MINUTES * 60);
                return Utils.response(false, `รหัส OTP ไม่ถูกต้อง (เหลืออีก ${CONFIG.MAX_OTP_ATTEMPTS - attempts - 1} ครั้ง)`);
            }

            // OTP matches — update password
            const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.AUTH);
            if (!sheet) throw new Error('ไม่พบฐานข้อมูลผู้ใช้งาน');

            const row = otpData.row;
            const salt = Utils.generateUUID().replace(/-/g, '').substring(0, 16);
            const hash = AuthService.hashPassword(safeNewPass, salt);
            const storedHash = hash + ':' + salt;

            sheet.getRange(row, 3).setValue(storedHash); // Column C = password hash

            // Clear OTP and attempts from cache
            CacheWrapper.remove(`OTP_${safeEmail}`);
            CacheWrapper.remove(attemptKey);

            Utils.logMessage('INFO', 'PASSWORD_RESET', `รีเซ็ตรหัสผ่านสำเร็จ (OTP) สำหรับ ${safeEmail}`, 'SYSTEM');
            Utils.flushLogs();

            return Utils.response(true, 'เปลี่ยนรหัสผ่านสำเร็จ! กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่');

        } catch (err) {
            Utils.flushLogs();
            return Utils.response(false, err.message);
        }
    }

    // -------------------------------------------------------------------
    // 4. UPDATE USER EMAIL
    // -------------------------------------------------------------------
    /**
     * Changes the user's email address (any authenticated role).
     * @param {string} token
     * @param {string} newEmail
     * @returns {object} Standardized response
     */
    function updateUserEmail(token, newEmail) {
        try {
            const session = AuthService.validateSession(token, [CONFIG.ROLES.ADMIN, CONFIG.ROLES.STAFF, CONFIG.ROLES.MEMBER]);
            const safeEmail = String(newEmail).trim().toLowerCase();

            if (!safeEmail) return Utils.response(false, 'กรุณาระบุอีเมลใหม่');

            // Basic email format check
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
                return Utils.response(false, 'รูปแบบอีเมลไม่ถูกต้อง');
            }

            const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.AUTH);
            if (!sheet) throw new Error('ไม่พบฐานข้อมูลผู้ใช้งาน');

            const lastRow = sheet.getLastRow();
            if (lastRow < 2) throw new Error('ไม่พบข้อมูลผู้ใช้');

            const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
            let userRow = -1;

            for (let i = 0; i < data.length; i++) {
                // Check email uniqueness (exclude self)
                if (String(data[i][3]).trim().toLowerCase() === safeEmail &&
                    String(data[i][0]) !== String(session.id)) {
                    return Utils.response(false, 'อีเมลนี้ถูกใช้งานแล้ว');
                }
                // Find the user's row
                if (String(data[i][0]) === String(session.id) || String(data[i][1]) === String(session.username)) {
                    userRow = i + 2; // +2 because data starts at row 2
                }
            }

            if (userRow < 0) throw new Error('ไม่พบข้อมูลผู้ใช้ในระบบ');

            sheet.getRange(userRow, 4).setValue(safeEmail); // Column D = email

            Utils.logMessage('INFO', 'UPDATE_EMAIL', `อัปเดตอีเมลเป็น ${safeEmail}`, session.username);
            Utils.flushLogs();

            return Utils.response(true, 'อัปเดตอีเมลสำเร็จ', { newEmail: safeEmail });

        } catch (err) {
            Utils.flushLogs();
            return Utils.response(false, err.message);
        }
    }

    // -------------------------------------------------------------------
    // 5. CHANGE USER PASSWORD
    // -------------------------------------------------------------------
    /**
     * Changes the user's password after verifying the old one.
     * @param {string} token
     * @param {string} oldPassword
     * @param {string} newPassword
     * @returns {object} Standardized response
     */
    function changeUserPassword(token, oldPassword, newPassword) {
        try {
            const session = AuthService.validateSession(token, [CONFIG.ROLES.ADMIN, CONFIG.ROLES.STAFF, CONFIG.ROLES.MEMBER]);

            const safeOldPass = String(oldPassword);
            const safeNewPass = String(newPassword);

            if (!safeOldPass) return Utils.response(false, 'กรุณาระบุรหัสผ่านเดิม');
            if (safeNewPass.length < 4) return Utils.response(false, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');

            const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.AUTH);
            if (!sheet) throw new Error('ไม่พบฐานข้อมูลผู้ใช้งาน');

            const lastRow = sheet.getLastRow();
            if (lastRow < 2) throw new Error('ไม่พบข้อมูลผู้ใช้');

            const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
            let userRow = -1;
            let currentHash = '';

            for (let i = 0; i < data.length; i++) {
                if (String(data[i][0]) === String(session.id) || String(data[i][1]) === String(session.username)) {
                    userRow = i + 2;
                    currentHash = data[i][2];
                    break;
                }
            }

            if (userRow < 0) throw new Error('ไม่พบข้อมูลผู้ใช้ในระบบ');

            // Verify old password
            const parts = String(currentHash).split(':');
            if (parts.length !== 2) throw new Error('ข้อมูลรหัสผ่านในระบบผิดปกติ');

            const expectedHash = parts[0];
            const oldSalt = parts[1];
            const testHash = AuthService.hashPassword(safeOldPass, oldSalt);

            if (testHash !== expectedHash) {
                return Utils.response(false, 'รหัสผ่านเดิมไม่ถูกต้อง');
            }

            // Generate new hash
            const newSalt = Utils.generateUUID().replace(/-/g, '').substring(0, 16);
            const newHash = AuthService.hashPassword(safeNewPass, newSalt);
            const storedHash = newHash + ':' + newSalt;

            sheet.getRange(userRow, 3).setValue(storedHash); // Column C = password hash

            Utils.logMessage('INFO', 'CHANGE_PASSWORD', 'เปลี่ยนรหัสผ่านสำเร็จ', session.username);
            Utils.flushLogs();

            return Utils.response(true, 'เปลี่ยนรหัสผ่านสำเร็จ');

        } catch (err) {
            Utils.flushLogs();
            return Utils.response(false, err.message);
        }
    }

    return {
        registerUser,
        generateAndSendOTP,
        verifyOTPAndResetPassword,
        updateUserEmail,
        changeUserPassword
    };

})();
