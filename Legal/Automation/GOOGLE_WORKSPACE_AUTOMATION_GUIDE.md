# Google Workspace Legal Document Automation System

## GFV LLC DBA Good Flippin Design

**System Owner:** Brett Weaver
**Created:** January 29, 2026
**Status:** Implementation Ready

---

## 🎯 SYSTEM OVERVIEW

**Goal:** Zero manual document exchanges. Every legal form flows through automated pipeline from request → signature → immutable archive → auto-email.

**Architecture:** 100% Google Workspace (no external services, no additional cost)

**Components:**

- Google Forms (data collection)
- Google Sheets (master database - append-only)
- Google Docs (document templates with merge fields)
- Google Apps Script (automation engine)
- Google Drive (immutable archive with retention)
- Gmail (auto-distribution)

---

## 📊 DATA FLOW

```
[Website Button]
    ↓
[Google Form Opens]
    ↓
[User Fills Form] → [Submits]
    ↓
[Apps Script Trigger Fires]
    ↓
[Writes to Master Sheet] + [Generates Doc from Template] + [Fills Merge Fields]
    ↓
[Saves PDF to Archive] + [Emails to all addresses]
    ↓
[Immutable Storage Forever]
```

---

## 🗂️ GOOGLE DRIVE FOLDER STRUCTURE

**Create these folders in Google Drive:**

```
📁 Legal (Main Folder)
  │
  ├─📁 Templates
  │   ├─ Mutual-NDA-Template (Google Doc)
  │   ├─ One-Way-NDA-Template (Google Doc)
  │   ├─ Client-Services-Agreement-Template (Google Doc)
  │   ├─ Statement-of-Work-Template (Google Doc)
  │   └─ Change-Order-Template (Google Doc)
  │
  ├─📁 Master-Database (Google Sheets)
  │   ├─ NDA-Requests (Sheet)
  │   ├─ Service-Agreements (Sheet)
  │   ├─ SOW-Requests (Sheet)
  │   └─ Change-Orders (Sheet)
  │
  ├─📁 Executed-Documents (Final PDFs)
  │   ├─ 2026/
  │   ├─ 2027/
  │   └─ [Year folders auto-created]
  │
  ├─📁 Archive (IMMUTABLE - Retention Policy)
  │   ├─ NDAs/
  │   ├─ Service-Agreements/
  │   ├─ SOWs/
  │   └─ Change-Orders/
  │
  └─📁 Logs (Audit Trail)
      └─ Automation-Log (Sheet)
```

---

## 🔧 SETUP STEPS (One-Time Configuration)

### Step 1: Create Folder Structure

1. Go to **Google Drive** (drive.google.com)
2. Create folder structure above
3. Note the **Folder IDs** (from URL when you open each folder)
   - Example: `https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I0J`
   - Folder ID = `1A2B3C4D5E6F7G8H9I0J`

### Step 2: Set Archive Retention Policy

1. Go to **Google Vault** (vault.google.com) - requires Workspace Business Plus or Enterprise
   - Alternative: Manually restrict delete permissions on Archive folder
2. Create **Retention Rule**:
   - Apply to: "Legal/Archive" folder
   - Retain: Indefinitely
   - Delete: Never
3. Remove delete permissions:
   - Right-click "Archive" folder → Share → Advanced
   - Owner: brett.l.weaver@gmail.com (can view/edit, cannot delete)
   - Set folder permissions to prevent deletion

### Step 3: Create Master Database Sheets

**For each form type, create Google Sheet with these columns:**

#### NDA-Requests Sheet

| Column                  | Description                             |
| ----------------------- | --------------------------------------- |
| A: Timestamp            | Auto-filled by form                     |
| B: Request ID           | Auto-generated (e.g., NDA-2026-001)     |
| C: Requester Name       | From form                               |
| D: Requester Email      | From form                               |
| E: Company/Organization | From form                               |
| F: NDA Type             | Mutual or One-Way                       |
| G: Purpose              | Why NDA needed                          |
| H: Document Link        | Link to generated Google Doc            |
| I: PDF Link             | Link to final PDF in Archive            |
| J: Status               | Pending / Generated / Signed / Archived |
| K: Generated Date       | Timestamp of doc generation             |
| L: Archived Date        | Timestamp of archival                   |
| M: Emailed To           | Confirmation of email sent              |

#### Service-Agreements Sheet

| Column            | Description                             |
| ----------------- | --------------------------------------- |
| A: Timestamp      | Auto-filled                             |
| B: Agreement ID   | SA-2026-001                             |
| C: Client Name    | From form                               |
| D: Client Email   | From form                               |
| E: Company        | From form                               |
| F: Project Type   | Dashboard, Web App, etc.                |
| G: Budget Range   | From form                               |
| H: Timeline       | From form                               |
| I: Description    | Brief project description               |
| J: Document Link  | Generated doc                           |
| K: PDF Link       | Final PDF                               |
| L: Status         | Pending / Generated / Signed / Archived |
| M: Generated Date | Timestamp                               |
| N: Archived Date  | Timestamp                               |
| O: Emailed To     | Confirmation                            |

#### SOW-Requests Sheet

| Column            | Description                             |
| ----------------- | --------------------------------------- |
| A: Timestamp      | Auto-filled                             |
| B: SOW ID         | SOW-2026-001                            |
| C: Client Name    | From form                               |
| D: Client Email   | From form                               |
| E: Project Name   | From form                               |
| F: Deliverables   | From form (multiline)                   |
| G: Timeline       | From form                               |
| H: Budget         | From form                               |
| I: Milestones     | From form                               |
| J: Document Link  | Generated doc                           |
| K: PDF Link       | Final PDF                               |
| L: Status         | Pending / Generated / Signed / Archived |
| M: Generated Date | Timestamp                               |
| N: Archived Date  | Timestamp                               |
| O: Emailed To     | Confirmation                            |

#### Change-Orders Sheet

| Column                | Description                             |
| --------------------- | --------------------------------------- |
| A: Timestamp          | Auto-filled                             |
| B: CO ID              | CO-2026-001                             |
| C: Client Name        | From form                               |
| D: Client Email       | From form                               |
| E: Original SOW ID    | Reference to original project           |
| F: Change Description | What's changing                         |
| G: Reason             | Why change needed                       |
| H: Additional Budget  | Cost impact                             |
| I: Timeline Impact    | Schedule change                         |
| J: Document Link      | Generated doc                           |
| K: PDF Link           | Final PDF                               |
| L: Status             | Pending / Generated / Signed / Archived |
| M: Generated Date     | Timestamp                               |
| N: Archived Date      | Timestamp                               |
| O: Emailed To         | Confirmation                            |

### Step 4: Create Document Templates (Google Docs)

**For each document type, create Google Doc template with merge fields:**

**Merge Field Syntax:** `{{FIELD_NAME}}`

**Example: Mutual-NDA-Template**

```
MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of {{CURRENT_DATE}}, by and between:

Party A: GFV LLC DBA Good Flippin Design
Address: {{COMPANY_ADDRESS}}
Representative: Brett Weaver

Party B: {{REQUESTER_NAME}}
Company: {{REQUESTER_COMPANY}}
Email: {{REQUESTER_EMAIL}}

RECITALS

The parties wish to explore a business relationship relating to: {{PURPOSE}}

[... rest of NDA template with {{MERGE_FIELDS}} ...]

SIGNATURES

Party A: GFV LLC DBA Good Flippin Design
Signed By: _________________________ Date: _____________
Name: Brett Weaver
Title: Owner

Party B: {{REQUESTER_COMPANY}}
Signed By: _________________________ Date: _____________
Name: {{REQUESTER_NAME}}
Title: _________________________

---
Document ID: {{DOCUMENT_ID}}
Generated: {{GENERATED_DATE}}
```

**Available Merge Fields (Examples):**

- `{{CURRENT_DATE}}` - Current date
- `{{DOCUMENT_ID}}` - Auto-generated ID (NDA-2026-001)
- `{{REQUESTER_NAME}}` - From form
- `{{REQUESTER_EMAIL}}` - From form
- `{{REQUESTER_COMPANY}}` - From form
- `{{PURPOSE}}` - From form
- `{{PROJECT_TYPE}}` - From form
- `{{BUDGET}}` - From form
- `{{TIMELINE}}` - From form
- `{{DESCRIPTION}}` - From form
- `{{DELIVERABLES}}` - From form
- `{{COMPANY_ADDRESS}}` - Your address
- `{{GENERATED_DATE}}` - Timestamp of generation

### Step 5: Create Google Forms

**For each document type, create Google Form:**

**Example: NDA Request Form**

**Form Settings:**

- Title: "Request Non-Disclosure Agreement"
- Description: "Complete this form to generate an NDA for review and signature."
- Collect email: Yes
- Response destination: Link to "NDA-Requests" Sheet

**Form Questions:**

1. **Your Name** (Short answer, Required)
2. **Your Email** (Email, Required)
3. **Company/Organization** (Short answer, Required)
4. **NDA Type** (Multiple choice, Required)
   - Mutual (both parties share confidential info)
   - One-Way (only I share confidential info)
5. **Purpose of NDA** (Paragraph, Required)
   - Example: "Exploring partnership for web development project"
6. **Additional Notes** (Paragraph, Optional)

**After Form Creation:**

- Note Form ID from URL: `https://docs.google.com/forms/d/1ABC...XYZ/edit`
- Link form to Sheet: Responses → Select response destination → "NDA-Requests"

### Step 6: Install Apps Script Automation

**For each form/sheet pair:**

1. Open Google Sheet (e.g., "NDA-Requests")
2. Go to **Extensions → Apps Script**
3. Delete default code
4. Paste automation script (see scripts below)
5. Set up **Trigger**:
   - Click clock icon (Triggers)
   - Add Trigger
   - Choose: onFormSubmit
   - Event type: On form submit
   - Save
6. Authorize script (first run only)

---

## 📜 GOOGLE APPS SCRIPT CODE

### Script 1: NDA Automation (NDA-Requests Sheet)

```javascript
// NDA Request Automation Script
// Attached to: NDA-Requests Google Sheet

// ============================================
// CONFIGURATION (UPDATE THESE VALUES)
// ============================================

const CONFIG = {
  // Folder IDs (get from Google Drive folder URLs)
  TEMPLATE_FOLDER_ID: "YOUR_TEMPLATES_FOLDER_ID",
  EXECUTED_FOLDER_ID: "YOUR_EXECUTED_DOCS_FOLDER_ID",
  ARCHIVE_FOLDER_ID: "YOUR_ARCHIVE_FOLDER_ID",

  // Template Document IDs
  MUTUAL_NDA_TEMPLATE_ID: "YOUR_MUTUAL_NDA_TEMPLATE_DOC_ID",
  ONEWAY_NDA_TEMPLATE_ID: "YOUR_ONEWAY_NDA_TEMPLATE_DOC_ID",

  // Email addresses to send copies
  EMAIL_RECIPIENTS: [
    "getsome@goodflippindesign.com",
    "getsome@goodflippinvibes.com",
    "brett.l.weaver@gmail.com",
  ],

  // Company info for merge fields
  COMPANY_NAME: "GFV LLC DBA Good Flippin Design",
  COMPANY_ADDRESS: "Minneapolis, MN",
  COMPANY_REP: "Brett Weaver",
};

// ============================================
// MAIN TRIGGER FUNCTION (runs on form submit)
// ============================================

function onFormSubmit(e) {
  try {
    Logger.log("Form submitted - starting automation");

    // Get form response values
    const sheet = SpreadsheetApp.getActiveSheet();
    const row = e.range.getRow();
    const values = sheet
      .getRange(row, 1, 1, sheet.getLastColumn())
      .getValues()[0];

    // Parse form data
    const formData = {
      timestamp: values[0],
      requesterName: values[2],
      requesterEmail: values[3],
      company: values[4],
      ndaType: values[5],
      purpose: values[6],
      notes: values[7] || "",
    };

    // Generate unique document ID
    const docId = generateDocumentId("NDA");

    // Update sheet with document ID
    sheet.getRange(row, 2).setValue(docId);

    // Select template based on NDA type
    const templateId = formData.ndaType.includes("Mutual")
      ? CONFIG.MUTUAL_NDA_TEMPLATE_ID
      : CONFIG.ONEWAY_NDA_TEMPLATE_ID;

    // Generate document from template
    const docUrl = generateDocument(templateId, formData, docId, row);

    // Update sheet with document link
    sheet.getRange(row, 8).setValue(docUrl);
    sheet.getRange(row, 10).setValue("Generated");
    sheet.getRange(row, 11).setValue(new Date());

    // Generate PDF
    const pdfUrl = generatePDF(docUrl, docId);

    // Update sheet with PDF link
    sheet.getRange(row, 9).setValue(pdfUrl);

    // Archive PDF
    archiveDocument(pdfUrl, docId, "NDAs");

    // Update sheet status
    sheet.getRange(row, 10).setValue("Archived");
    sheet.getRange(row, 12).setValue(new Date());

    // Send emails
    sendEmails(formData, docUrl, pdfUrl, docId);

    // Update sheet with email confirmation
    sheet.getRange(row, 13).setValue(CONFIG.EMAIL_RECIPIENTS.join(", "));

    Logger.log("Automation completed successfully for " + docId);
  } catch (error) {
    Logger.log("ERROR: " + error.toString());
    // Send error email
    MailApp.sendEmail({
      to: CONFIG.EMAIL_RECIPIENTS[0],
      subject: "NDA Automation Error",
      body: "Error processing NDA request:\n\n" + error.toString(),
    });
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateDocumentId(prefix) {
  const year = new Date().getFullYear();
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();

  // Count existing documents this year
  const count = sheet
    .getRange(2, 2, lastRow - 1, 1)
    .getValues()
    .filter(
      (row) => row[0] && row[0].toString().includes(prefix + "-" + year),
    ).length;

  const num = String(count + 1).padStart(3, "0");
  return `${prefix}-${year}-${num}`;
}

function generateDocument(templateId, data, docId, row) {
  // Copy template
  const template = DriveApp.getFileById(templateId);
  const folder = DriveApp.getFolderById(CONFIG.EXECUTED_FOLDER_ID);
  const docName = `${docId}_${data.requesterName.replace(/\s/g, "_")}`;
  const newDoc = template.makeCopy(docName, folder);

  // Open document and replace merge fields
  const doc = DocumentApp.openById(newDoc.getId());
  const body = doc.getBody();

  // Replace all merge fields
  body.replaceText(
    "{{CURRENT_DATE}}",
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "MMMM d, yyyy",
    ),
  );
  body.replaceText("{{DOCUMENT_ID}}", docId);
  body.replaceText("{{REQUESTER_NAME}}", data.requesterName);
  body.replaceText("{{REQUESTER_EMAIL}}", data.requesterEmail);
  body.replaceText("{{REQUESTER_COMPANY}}", data.company);
  body.replaceText("{{PURPOSE}}", data.purpose);
  body.replaceText("{{COMPANY_NAME}}", CONFIG.COMPANY_NAME);
  body.replaceText("{{COMPANY_ADDRESS}}", CONFIG.COMPANY_ADDRESS);
  body.replaceText("{{COMPANY_REP}}", CONFIG.COMPANY_REP);
  body.replaceText("{{GENERATED_DATE}}", new Date().toString());

  // Save and close
  doc.saveAndClose();

  return newDoc.getUrl();
}

function generatePDF(docUrl, docId) {
  // Extract document ID from URL
  const docIdMatch = docUrl.match(/\/d\/(.+?)\//);
  if (!docIdMatch) throw new Error("Invalid document URL");

  const docFileId = docIdMatch[1];
  const docFile = DriveApp.getFileById(docFileId);

  // Export as PDF
  const pdfBlob = docFile.getAs("application/pdf");
  pdfBlob.setName(docId + ".pdf");

  // Save to Executed folder
  const folder = DriveApp.getFolderById(CONFIG.EXECUTED_FOLDER_ID);
  const pdfFile = folder.createFile(pdfBlob);

  return pdfFile.getUrl();
}

function archiveDocument(pdfUrl, docId, subfolder) {
  // Extract PDF file ID
  const pdfIdMatch = pdfUrl.match(/\/d\/(.+?)\//);
  if (!pdfIdMatch) throw new Error("Invalid PDF URL");

  const pdfFileId = pdfIdMatch[1];
  const pdfFile = DriveApp.getFileById(pdfFileId);

  // Get archive subfolder (create if doesn't exist)
  const archiveFolder = DriveApp.getFolderById(CONFIG.ARCHIVE_FOLDER_ID);
  let subfolderObj;

  const subfolders = archiveFolder.getFoldersByName(subfolder);
  if (subfolders.hasNext()) {
    subfolderObj = subfolders.next();
  } else {
    subfolderObj = archiveFolder.createFolder(subfolder);
  }

  // Copy to archive (don't move, keep copy in Executed)
  pdfFile.makeCopy(docId + "_ARCHIVED.pdf", subfolderObj);
}

function sendEmails(data, docUrl, pdfUrl, docId) {
  const subject = `NDA Generated: ${docId}`;

  const body = `
A new NDA has been generated:

Document ID: ${docId}
Requester: ${data.requesterName}
Company: ${data.company}
Email: ${data.requesterEmail}
Type: ${data.ndaType}
Purpose: ${data.purpose}

Google Doc (for editing): ${docUrl}
PDF (final version): ${pdfUrl}

Next Steps:
1. Review the document
2. Send to requester for signature
3. Return signed copy for filing

---
This is an automated message from the Legal Document Automation System.
  `;

  // Send to all configured email addresses
  CONFIG.EMAIL_RECIPIENTS.forEach((email) => {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body,
    });
  });

  // Send to requester
  MailApp.sendEmail({
    to: data.requesterEmail,
    subject: "Your NDA Request - " + docId,
    body: `
Dear ${data.requesterName},

Your Non-Disclosure Agreement request has been processed.

Document ID: ${docId}

You can review the document here:
${docUrl}

A PDF version is also available:
${pdfUrl}

Please review and let us know if you have any questions. We will coordinate signature via email.

Best regards,
Brett Weaver
GFV LLC DBA Good Flippin Design
    `,
  });
}
```

### Script 2: Service Agreement Automation (Service-Agreements Sheet)

```javascript
// Service Agreement Automation Script
// Attached to: Service-Agreements Google Sheet

// Use same CONFIG structure as NDA script above
const CONFIG = {
  TEMPLATE_FOLDER_ID: "YOUR_TEMPLATES_FOLDER_ID",
  EXECUTED_FOLDER_ID: "YOUR_EXECUTED_DOCS_FOLDER_ID",
  ARCHIVE_FOLDER_ID: "YOUR_ARCHIVE_FOLDER_ID",
  SERVICE_AGREEMENT_TEMPLATE_ID: "YOUR_SERVICE_AGREEMENT_TEMPLATE_DOC_ID",
  EMAIL_RECIPIENTS: [
    "getsome@goodflippindesign.com",
    "getsome@goodflippinvibes.com",
    "brett.l.weaver@gmail.com",
  ],
  COMPANY_NAME: "GFV LLC DBA Good Flippin Design",
  COMPANY_ADDRESS: "Minneapolis, MN",
  COMPANY_REP: "Brett Weaver",
};

function onFormSubmit(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSheet();
    const row = e.range.getRow();
    const values = sheet
      .getRange(row, 1, 1, sheet.getLastColumn())
      .getValues()[0];

    const formData = {
      timestamp: values[0],
      clientName: values[2],
      clientEmail: values[3],
      company: values[4],
      projectType: values[5],
      budgetRange: values[6],
      timeline: values[7],
      description: values[8],
    };

    const docId = generateDocumentId("SA");
    sheet.getRange(row, 2).setValue(docId);

    const docUrl = generateServiceAgreement(
      CONFIG.SERVICE_AGREEMENT_TEMPLATE_ID,
      formData,
      docId,
    );
    sheet.getRange(row, 10).setValue(docUrl);
    sheet.getRange(row, 12).setValue("Generated");
    sheet.getRange(row, 13).setValue(new Date());

    const pdfUrl = generatePDF(docUrl, docId);
    sheet.getRange(row, 11).setValue(pdfUrl);

    archiveDocument(pdfUrl, docId, "Service-Agreements");
    sheet.getRange(row, 12).setValue("Archived");
    sheet.getRange(row, 14).setValue(new Date());

    sendServiceAgreementEmails(formData, docUrl, pdfUrl, docId);
    sheet.getRange(row, 15).setValue(CONFIG.EMAIL_RECIPIENTS.join(", "));

    Logger.log("Service Agreement automation completed for " + docId);
  } catch (error) {
    Logger.log("ERROR: " + error.toString());
    MailApp.sendEmail({
      to: CONFIG.EMAIL_RECIPIENTS[0],
      subject: "Service Agreement Automation Error",
      body: "Error:\n\n" + error.toString(),
    });
  }
}

function generateServiceAgreement(templateId, data, docId) {
  const template = DriveApp.getFileById(templateId);
  const folder = DriveApp.getFolderById(CONFIG.EXECUTED_FOLDER_ID);
  const docName = `${docId}_${data.clientName.replace(/\s/g, "_")}`;
  const newDoc = template.makeCopy(docName, folder);

  const doc = DocumentApp.openById(newDoc.getId());
  const body = doc.getBody();

  body.replaceText(
    "{{CURRENT_DATE}}",
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "MMMM d, yyyy",
    ),
  );
  body.replaceText("{{DOCUMENT_ID}}", docId);
  body.replaceText("{{CLIENT_NAME}}", data.clientName);
  body.replaceText("{{CLIENT_EMAIL}}", data.clientEmail);
  body.replaceText("{{CLIENT_COMPANY}}", data.company);
  body.replaceText("{{PROJECT_TYPE}}", data.projectType);
  body.replaceText("{{BUDGET_RANGE}}", data.budgetRange);
  body.replaceText("{{TIMELINE}}", data.timeline);
  body.replaceText("{{PROJECT_DESCRIPTION}}", data.description);
  body.replaceText("{{COMPANY_NAME}}", CONFIG.COMPANY_NAME);
  body.replaceText("{{COMPANY_ADDRESS}}", CONFIG.COMPANY_ADDRESS);
  body.replaceText("{{COMPANY_REP}}", CONFIG.COMPANY_REP);

  doc.saveAndClose();
  return newDoc.getUrl();
}

function sendServiceAgreementEmails(data, docUrl, pdfUrl, docId) {
  const subject = `Service Agreement Generated: ${docId}`;
  const body = `
New Service Agreement:

Document ID: ${docId}
Client: ${data.clientName}
Company: ${data.company}
Project: ${data.projectType}
Budget: ${data.budgetRange}
Timeline: ${data.timeline}

Google Doc: ${docUrl}
PDF: ${pdfUrl}

Next steps: Review and send to client for signature.
  `;

  CONFIG.EMAIL_RECIPIENTS.forEach((email) => {
    MailApp.sendEmail({ to: email, subject: subject, body: body });
  });

  MailApp.sendEmail({
    to: data.clientEmail,
    subject: "Your Service Agreement - " + docId,
    body: `
Dear ${data.clientName},

Your Service Agreement has been generated.

Document ID: ${docId}

Review here: ${docUrl}
PDF: ${pdfUrl}

We'll coordinate signature via email shortly.

Best,
Brett Weaver
GFV LLC DBA Good Flippin Design
    `,
  });
}

// Include generateDocumentId, generatePDF, archiveDocument helper functions from NDA script
```

---

## 🌐 WEBSITE INTEGRATION

### Add Form Buttons to Website

**Update index.html:**

```html
<!-- Add to #contact section or create new #legal-forms section -->

<section
  id="legal-forms"
  style="background: var(--bg-elevated); padding: 4rem 2rem;"
>
  <div class="container" style="max-width: 800px; margin: 0 auto;">
    <h2 style="text-align: center; margin-bottom: 2rem;">Legal Documents</h2>
    <p
      style="text-align: center; color: var(--text-secondary); margin-bottom: 3rem;"
    >
      Start your project with automated legal documentation. Forms are processed
      instantly.
    </p>

    <div
      style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;"
    >
      <!-- NDA Request -->
      <div
        style="background: var(--bg-card); padding: 2rem; border-radius: 12px; border: 1px solid var(--border);"
      >
        <h3 style="margin-bottom: 0.5rem;">Non-Disclosure Agreement</h3>
        <p
          style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;"
        >
          Request an NDA before discussing your project
        </p>
        <a
          href="https://forms.gle/YOUR_NDA_FORM_ID"
          target="_blank"
          class="btn-primary"
          style="display: inline-block; width: 100%; text-align: center; text-decoration: none;"
        >
          Request NDA
        </a>
      </div>

      <!-- Service Agreement -->
      <div
        style="background: var(--bg-card); padding: 2rem; border-radius: 12px; border: 1px solid var(--border);"
      >
        <h3 style="margin-bottom: 0.5rem;">Service Agreement</h3>
        <p
          style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;"
        >
          Start your engagement with automated agreement
        </p>
        <a
          href="https://forms.gle/YOUR_SERVICE_FORM_ID"
          target="_blank"
          class="btn-primary"
          style="display: inline-block; width: 100%; text-align: center; text-decoration: none;"
        >
          Start Engagement
        </a>
      </div>

      <!-- Statement of Work -->
      <div
        style="background: var(--bg-card); padding: 2rem; border-radius: 12px; border: 1px solid var(--border);"
      >
        <h3 style="margin-bottom: 0.5rem;">Statement of Work</h3>
        <p
          style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;"
        >
          Define project scope and deliverables
        </p>
        <a
          href="https://forms.gle/YOUR_SOW_FORM_ID"
          target="_blank"
          class="btn-primary"
          style="display: inline-block; width: 100%; text-align: center; text-decoration: none;"
        >
          Create SOW
        </a>
      </div>
    </div>

    <p
      style="text-align: center; color: var(--text-muted); font-size: 0.85rem; margin-top: 2rem;"
    >
      All documents generated instantly. You'll receive copies via email within
      minutes.
    </p>
  </div>
</section>
```

---

## 🔄 BACKUP AUTOMATION

### Daily Backup Script (separate Apps Script project)

```javascript
// Create new Apps Script project: script.google.com
// Set up daily trigger (4am)

const BACKUP_CONFIG = {
  ARCHIVE_FOLDER_ID: "YOUR_ARCHIVE_FOLDER_ID",
  BACKUP_FOLDER_ID: "YOUR_BACKUP_FOLDER_ID", // Create separate "Backups" folder
  MASTER_SHEETS: [
    { id: "NDA_REQUESTS_SHEET_ID", name: "NDA-Requests" },
    { id: "SERVICE_AGREEMENTS_SHEET_ID", name: "Service-Agreements" },
    { id: "SOW_REQUESTS_SHEET_ID", name: "SOW-Requests" },
    { id: "CHANGE_ORDERS_SHEET_ID", name: "Change-Orders" },
  ],
};

function dailyBackup() {
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd",
  );
  const backupFolder = DriveApp.getFolderById(BACKUP_CONFIG.BACKUP_FOLDER_ID);

  // Create date folder
  let dateFolder;
  const dateFolders = backupFolder.getFoldersByName(timestamp);
  if (dateFolders.hasNext()) {
    dateFolder = dateFolders.next();
  } else {
    dateFolder = backupFolder.createFolder(timestamp);
  }

  // Backup each master sheet
  BACKUP_CONFIG.MASTER_SHEETS.forEach((sheet) => {
    const file = DriveApp.getFileById(sheet.id);
    const backupName = `${sheet.name}_BACKUP_${timestamp}`;
    file.makeCopy(backupName, dateFolder);
  });

  // Backup archive folder (copy all PDFs)
  const archiveFolder = DriveApp.getFolderById(BACKUP_CONFIG.ARCHIVE_FOLDER_ID);
  const archiveBackup = dateFolder.createFolder("Archive_PDFs");

  const files = archiveFolder.getFiles();
  let count = 0;
  while (files.hasNext() && count < 100) {
    // Limit to prevent timeout
    const file = files.next();
    file.makeCopy(file.getName(), archiveBackup);
    count++;
  }

  Logger.log(`Backup completed: ${timestamp}`);

  // Send confirmation email
  MailApp.sendEmail({
    to: "brett.l.weaver@gmail.com",
    subject: "Daily Legal Document Backup Complete",
    body: `Backup completed successfully on ${timestamp}.\n\nSheets backed up: ${BACKUP_CONFIG.MASTER_SHEETS.length}\nPDFs backed up: ${count}`,
  });
}
```

**Set up trigger:**

1. Click clock icon (Triggers)
2. Add Trigger
3. Function: `dailyBackup`
4. Event source: Time-driven
5. Type: Day timer
6. Time: 4am - 5am

---

## 📋 IMPLEMENTATION CHECKLIST

### Phase 1: Google Drive Setup

- [ ] Create folder structure in Drive
- [ ] Note all folder IDs
- [ ] Set Archive retention policy (or restrict delete permissions)
- [ ] Create Backups folder

### Phase 2: Templates

- [ ] Create Mutual-NDA-Template.docx (convert to Google Doc)
- [ ] Create One-Way-NDA-Template.docx (convert to Google Doc)
- [ ] Create Client-Services-Agreement-Template.docx (convert to Google Doc)
- [ ] Create Statement-of-Work-Template.docx (convert to Google Doc)
- [ ] Create Change-Order-Template.docx (convert to Google Doc)
- [ ] Add {{MERGE_FIELDS}} to each template
- [ ] Note all template document IDs

### Phase 3: Master Database Sheets

- [ ] Create NDA-Requests Sheet with columns
- [ ] Create Service-Agreements Sheet with columns
- [ ] Create SOW-Requests Sheet with columns
- [ ] Create Change-Orders Sheet with columns
- [ ] Note all sheet IDs

### Phase 4: Google Forms

- [ ] Create NDA Request Form
- [ ] Link to NDA-Requests Sheet
- [ ] Create Service Agreement Form
- [ ] Link to Service-Agreements Sheet
- [ ] Create SOW Request Form
- [ ] Link to SOW-Requests Sheet
- [ ] Create Change Order Form
- [ ] Link to Change-Orders Sheet
- [ ] Note all form short URLs (forms.gle/...)

### Phase 5: Apps Script Automation

- [ ] Open NDA-Requests Sheet → Extensions → Apps Script
- [ ] Paste NDA automation code
- [ ] Update CONFIG values (folder IDs, template IDs)
- [ ] Set up onFormSubmit trigger
- [ ] Test with sample form submission
- [ ] Repeat for other sheets (Service Agreements, SOW, Change Orders)

### Phase 6: Website Integration

- [ ] Add legal forms section to index.html
- [ ] Update form URLs with your forms.gle links
- [ ] Test buttons open correct forms
- [ ] Deploy to production

### Phase 7: Backup Automation

- [ ] Create new Apps Script project
- [ ] Paste dailyBackup code
- [ ] Update BACKUP_CONFIG values
- [ ] Set up daily trigger (4am)
- [ ] Test backup manually

### Phase 8: Testing & Validation

- [ ] Submit test NDA request → verify doc generated → check email
- [ ] Submit test Service Agreement → verify → check
- [ ] Check Archive folder for PDFs
- [ ] Verify retention policy (cannot delete from Archive)
- [ ] Test backup script
- [ ] Review audit log

---

## 🚀 NEXT STEPS AFTER IMPLEMENTATION

1. **Attorney Review**: Have attorney review first generated document to ensure templates work correctly
2. **E-Signature Integration** (optional future enhancement):
   - Google Workspace eSignature (if on Business Standard+)
   - Or integrate DocuSign API via Apps Script
3. **Client Portal** (optional):
   - Create Google Site for clients to access their documents
   - Embed forms directly
4. **Analytics Dashboard**:
   - Create Google Data Studio dashboard
   - Track: NDAs per month, Service Agreements, project types, response times

---

## ⚠️ IMPORTANT SECURITY NOTES

1. **Never commit folder IDs or document IDs to public GitHub**
2. **Restrict sharing permissions** on Archive folder (only you can access)
3. **Review Apps Script permissions** before authorizing
4. **Monitor automation logs** weekly for errors
5. **Test on sample data first** before going live

---

## 🆘 TROUBLESHOOTING

**Problem:** Form submission doesn't trigger script
**Solution:** Check trigger setup in Apps Script, verify form linked to correct sheet

**Problem:** Merge fields not replaced in document
**Solution:** Check exact {{FIELD_NAME}} syntax matches between form and template

**Problem:** Emails not sending
**Solution:** Check MailApp quotas (100/day for free Gmail, 1500/day for Workspace)

**Problem:** Script timeout
**Solution:** Simplify script, reduce PDF copy operations, use batch processing

**Problem:** Cannot delete from Archive
**Solution:** Good! That's the retention policy working. Contact admin if truly needed.

---

**Document Version:** 1.0
**Last Updated:** January 29, 2026
**Owner:** Brett Weaver
**Status:** Ready for Implementation
