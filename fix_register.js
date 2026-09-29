const fs = require('fs');

const filePath = 'D:\\code\\SHREEJICRM\\studyhaus-crm\\student-register.html';
let content = fs.readFileSync(filePath, 'utf8');

// Use exact bytes from file - includes CRLF
const oldString = `        <p class="form-hint" style="margin-bottom: 1.5rem;">Minimum 8 characters.</p>\r\n\r\n\r\n\r\n        \r\n        <button type="submit" class="btn-submit" id="submit-btn" data-i18n="btn.register">Create account</button>`;

const newString = `        <p class="form-hint" style="margin-bottom: 1.5rem;">Minimum 8 characters.</p>\r\n\r\n        <h3 class="section-title">Document Uploads <span style="color:var(--text-muted);font-weight:400;text-transform:none;margin-left:4px;">(Optional · stored securely)</span></h3>\r\n        <div id="doc-upload-section" style="margin-bottom: 1.5rem;"></div>\r\n\r\n        \r\n        <button type="submit" class="btn-submit" id="submit-btn" data-i18n="btn.register">Create account</button>`;

if (content.includes(oldString)) {
    content = content.replace(oldString, newString);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed!');
} else {
    console.log('Old string not found');
    const idx = content.indexOf('Minimum 8 characters');
    if (idx >= 0) {
        console.log('Found at:', idx);
        console.log('Context char codes:', [...content.substring(idx, idx + 200)].map(c => c.charCodeAt(0)).join(','));
    }
}